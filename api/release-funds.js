// api/release-funds.js
// Returns the calldata + preconditions for AgentWorkEscrowZK.release() (buyer)
// or claimAfterReview() (seller). Read-only — never broadcasts.
//
// For the meta-tx flow, the actor signs the personalSignMessage with their
// wallet, then hands the signature to AWM_TREASURY for relay (TODO).

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: { label: 'base-mainnet', chainId: 8453, rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2' },
  sepolia: { label: 'base-sepolia', chainId: 84532, rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow: '0x489C36738F46e395b4cd26DDf0f85756686A2f07' },
};

const ESCROW_ABI = [
  'function release(uint256 intentId) external',
  'function claimAfterReview(uint256 intentId) external',
  'function refund(uint256 intentId) external',
  'function intents(uint256) view returns (address, address, uint256, uint96, uint256, uint256, uint256, uint256, bytes32, string, string, uint8, bytes32, bytes32)',
];

const STATUS_NAMES = ['None', 'Funded', 'ProofSubmitted', 'Released', 'Refunded', 'Disputed', 'Resolved'];

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
  // Rate limit release-calldata requests (P1 abuse control)
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 })) return;

  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.release-funds.v1',
      method: 'POST',
      body: {
        intentId: 'uint256 (required)',
        actor: 'buyer|seller (required — who is calling)',
        action: 'release|claim|refund (optional; default inferred from actor)',
        // defaults to release for buyer, claim for seller, refund for either if status==Funded
        network: 'mainnet|sepolia (default mainnet)',
      },
      response: {
        calldata: '0x... — exact bytes for release() / claimAfterReview() / refund()',
        to: 'escrow address',
        from: 'expected msg.sender (the buyer or seller address from the intent)',
        chainId: 8453,
        preconditions: 'see response body',
        personalSignMessage: 'string the actor should sign to authorize a meta-tx relay',
        feeEstimate: 'auto-routed 1% to feeRecipient',
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

  const { intentId, actor } = body;
  const net = String(body.network || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  if (intentId == null) return badRequest(res, 'intentId required');
  if (!actor || (actor !== 'buyer' && actor !== 'seller')) return badRequest(res, 'actor must be "buyer" or "seller"');

  let provider;
  try { provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId); }
  catch (e) { return json(res, 500, { error: 'rpc_unreachable' }); }

  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  let intent;
  try { intent = await escrow.intents(BigInt(intentId)); }
  catch (e) { return json(res, 502, { error: 'rpc_read_failed', message: e.message }); }

  const buyer = intent[0];
  const seller = intent[1];
  const workDeadline = Number(intent[5]);
  const reviewDeadline = Number(intent[6]);
  const onChainStatus = Number(intent[11]);
  const statusName = STATUS_NAMES[onChainStatus] || `Unknown(${onChainStatus})`;

  const head = await provider.getBlock('latest').then((b) => Number(b.timestamp));

  // Decide which action to quote
  let action = body.action;
  if (!action) {
    if (onChainStatus === 2 /* ProofSubmitted */) {
      action = actor === 'buyer' ? 'release' : 'claim';
    } else if (onChainStatus === 1 /* Funded */ && head >= workDeadline) {
      action = 'refund';
    } else {
      return json(res, 422, {
        error: 'no_valid_action',
        onChainStatus, statusName, head, workDeadline, reviewDeadline,
        hint: 'Pass action= explicitly. Valid actions: release (buyer, status==ProofSubmitted), claim (seller, status==ProofSubmitted, head>reviewDeadline), refund (buyer, status==Funded, head>workDeadline).',
      });
    }
  }
  if (!['release', 'claim', 'refund'].includes(action)) return badRequest(res, 'action must be release|claim|refund');

  // Precondition checks
  const preconditions = {};
  if (action === 'release') {
    preconditions.intentStatus = 'ProofSubmitted';
    if (onChainStatus !== 2) { preconditions.failed = 'intent_not_in_proof_submitted_state'; preconditions.got = statusName; }
    if (actor !== 'buyer') { preconditions.failed = preconditions.failed || 'actor_must_be_buyer_for_release'; }
  } else if (action === 'claim') {
    preconditions.intentStatus = 'ProofSubmitted';
    preconditions.actor = 'seller';
    preconditions.reviewDeadline = reviewDeadline;
    if (onChainStatus !== 2) { preconditions.failed = 'intent_not_in_proof_submitted_state'; preconditions.got = statusName; }
    if (actor !== 'seller') { preconditions.failed = preconditions.failed || 'actor_must_be_seller_for_claim'; }
    if (head < reviewDeadline) { preconditions.failed = preconditions.failed || 'review_deadline_not_passed'; preconditions.head = head; preconditions.reviewDeadline = reviewDeadline; }
  } else if (action === 'refund') {
    preconditions.intentStatus = 'Funded';
    preconditions.workDeadline = workDeadline;
    if (onChainStatus !== 1) { preconditions.failed = 'intent_not_in_funded_state'; preconditions.got = statusName; }
    if (actor !== 'buyer') { preconditions.failed = preconditions.failed || 'actor_must_be_buyer_for_refund'; }
    if (head < workDeadline) { preconditions.failed = preconditions.failed || 'work_deadline_not_passed'; preconditions.head = head; preconditions.workDeadline = workDeadline; }
  }

  if (preconditions.failed) {
    return json(res, 422, { error: 'preconditions_failed', preconditions, onChainStatus, statusName, head });
  }

  // Encode calldata
  const functionName = action === 'release' ? 'release' : action === 'claim' ? 'claimAfterReview' : 'refund';
  const iface = new ethers.Interface(ESCROW_ABI);
  const calldata = iface.encodeFunctionData(functionName, [BigInt(intentId)]);

  const expectedCaller = actor === 'buyer' ? buyer : seller;

  const personalSignMessage = [
    'AI Work Market — ' + functionName,
    `Intent ID: ${intentId}`,
    `Caller:    ${expectedCaller}`,
    `Action:    ${functionName}`,
    `Issued:    ${new Date().toISOString()}`,
  ].join('\n');

  // Fee estimate (1% of amount)
  const amountRaw = intent[3]; // amount
  const feeEstimateRaw = (BigInt(amountRaw) * BigInt(100) / BigInt(10000)).toString();

  return json(res, 200, {
    schema: 'ai-work-market.release-funds.v1',
    network: cfg.label,
    chainId: cfg.chainId,
    intentId: Number(intentId),
    action: functionName,
    actor,
    calldata,
    to: cfg.escrow,
    from: expectedCaller,
    gasEstimate: '60000',
    preconditions,
    feeEstimate: {
      raw: feeEstimateRaw,
      usdc: ethers.formatUnits(feeEstimateRaw, 6),
      percent: '1.00%',
      recipient: process.env.AWM_FEE_RECIPIENT || null,
    },
    personalSignMessage,
    broadcast: {
      enabled: Boolean(process.env.AWM_TREASURY_PRIVATE_KEY),
      hint: 'Send x-awm-submit: true + actor signature to /api/release-funds to relay. Not enabled in this read-only build.',
    },
  });
};
