// api/submit-proof.js
// Returns the calldata + EIP-712 typed-data a seller would sign to call
// AgentWorkEscrowZK.submitProof() on Base Mainnet. Read-only — never
// broadcasts.
//
// For agent-driven flows: the agent signs the EIP-712 message with their own
// key, then either calls the contract directly or hands the signature to
// AWM_TREASURY for a meta-transaction relay (broadcast = TODO).

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: { label: 'base-mainnet', chainId: 8453, rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  sepolia: { label: 'base-sepolia', chainId: 84532, rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow: '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
};

const ESCROW_ABI = [
  'function submitProof(uint256 intentId, string proofURI) external',
  'function intents(uint256) view returns (address, address, uint256, uint96, uint256, uint256, uint256, uint256, bytes32, string, string, uint8, bytes32, bytes32)',
];

const SELLER_PROOF_TYPEHASH = '0x'; // We don't currently have an EIP-712 proof-submit typehash, so the response includes a raw personal_sign fallback.

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function badRequest(res, msg, extra = {}) {
  return json(res, 400, { error: 'bad_request', message: msg, ...extra });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 64 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const { applyRateLimit } = require('./_rate-limit');

module.exports = async function handler(req, res) {
  // Rate limit proof-calldata requests (P1 abuse control)
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 })) return;

  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.submit-proof.v1',
      method: 'POST',
      body: {
        intentId: 'uint256 (required)',
        proofURI: 'string (required, ipfs://... or https://...)',
        seller: 'address (required, must match the on-chain intent.seller)',
        network: 'mainnet|sepolia (default mainnet)',
      },
      response: {
        calldata: '0x... — the exact bytes to call submitProof(intentId, proofURI)',
        to: 'escrow address',
        chainId: 8453,
        personalSignMessage: 'A human-readable string the seller should sign with personal_sign to authorize the proof submission',
        preconditions: ['intent.status == Funded', 'msg.sender == intent.seller', 'block.timestamp < intent.workDeadline'],
        broadcast: 'Gated behind AWM_TREASURY_PRIVATE_KEY + HMAC. Not enabled in this read-only build.',
      },
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return badRequest(res, e.message); }

  const { intentId, proofURI, seller } = body;
  const net = String(body.network || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  if (intentId == null) return badRequest(res, 'intentId required');
  if (!proofURI || typeof proofURI !== 'string' || proofURI.length > 1024) return badRequest(res, 'proofURI required (string <= 1024 chars)');
  if (!seller || !ethers.isAddress(seller)) return badRequest(res, 'seller must be a 0x-prefixed EVM address');

  // Read intent from chain to verify preconditions
  let provider;
  try { provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId); }
  catch (e) { return json(res, 500, { error: 'rpc_unreachable' }); }

  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  let intent;
  try { intent = await escrow.intents(BigInt(intentId)); }
  catch (e) { return json(res, 502, { error: 'rpc_read_failed', message: e.message }); }

  const onChainSeller = intent[1];
  const onChainStatus = Number(intent[11]);
  const onChainDeadline = Number(intent[5]);

  if (onChainSeller.toLowerCase() !== seller.toLowerCase()) {
    return json(res, 403, { error: 'seller_mismatch', expected: onChainSeller, got: seller });
  }
  if (onChainStatus !== 1) {
    return json(res, 422, { error: 'intent_not_funded', statusCode: onChainStatus, statusName: ['None','Funded','ProofSubmitted','Released','Refunded','Disputed','Resolved'][onChainStatus] });
  }
  const head = await provider.getBlock('latest').then((b) => Number(b.timestamp));
  if (head >= onChainDeadline) {
    return json(res, 422, { error: 'work_deadline_passed', deadline: onChainDeadline, now: head });
  }

  // Encode submitProof calldata
  const iface = new ethers.Interface(ESCROW_ABI);
  const calldata = iface.encodeFunctionData('submitProof', [BigInt(intentId), proofURI]);

  // personalSign message the seller can sign to authorize a meta-tx
  const personalSignMessage = [
    'AI Work Market — submit proof of work',
    `Intent ID: ${intentId}`,
    `Seller:    ${seller}`,
    `Proof URI: ${proofURI}`,
    `Issued:    ${new Date().toISOString()}`,
  ].join('\n');

  return json(res, 200, {
    schema: 'ai-work-market.submit-proof.v1',
    network: cfg.label,
    chainId: cfg.chainId,
    calldata,
    to: cfg.escrow,
    from: seller,
    gasEstimate: '90000',
    preconditions: {
      intentStatus: 'Funded',
      sellerMatches: true,
      workDeadlinePassed: false,
      workDeadline: onChainDeadline,
      now: head,
    },
    personalSignMessage,
    personalSign: 'The seller should call signMessage(personalSignMessage) with their wallet. The resulting signature can be relayed to AWM_TREASURY (if enabled) or used to call submitProof() directly.',
    broadcast: {
      enabled: Boolean(process.env.AWM_TREASURY_PRIVATE_KEY),
      hint: 'Send x-awm-submit: true + seller signature to /api/submit-proof to relay. Not enabled in this read-only build.',
    },
  });
};
