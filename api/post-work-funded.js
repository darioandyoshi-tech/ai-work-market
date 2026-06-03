// api/post-work-funded.js
// Returns the calldata, gas estimate, and exact USDC amount needed for the
// AWM treasury to createIntent() on behalf of a buyer who has paid off-platform
// (Stripe, off-chain invoice, or a server-funded wallet).
//
// READ-ONLY: never broadcasts a tx. If AWM_TREASURY_PRIVATE_KEY is set in
// Vercel AND the request includes x-awm-submit: true, this endpoint will
// broadcast (gated by HMAC auth, just like x402-consume). For now the
// submit path is a TODO.

const { ethers } = require('ethers');
const crypto = require('crypto');

const NETWORKS = {
  mainnet: { label: 'base-mainnet', chainId: 8453, rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    escrow: '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2' },
  sepolia: { label: 'base-sepolia', chainId: 84532, rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    escrow: '0x489C36738F46e395b4cd26DDf0f85756686A2f07' },
};

const ESCROW_ABI = [
  'function createIntent(address seller, uint256 amount, uint256 workTimeoutSeconds, uint256 reviewPeriodSeconds, bytes32 workHash, string calldata workURI) external returns (uint256 intentId)',
  'function defaultWorkTimeout() view returns (uint256)',
  'function defaultReviewPeriod() view returns (uint256)',
  'function minWorkTimeout() view returns (uint256)',
  'function maxReviewPeriod() view returns (uint256)',
  'function nextIntentId() view returns (uint256)',
];

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

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.post-work-funded.v1',
      method: 'POST',
      body: {
        seller: 'address (required, the agent receiving payment)',
        amount: 'string (required, USDC amount e.g. "1.50" or "0.0001")',
        workURI: 'string (optional, ipfs://... or https://... — default "https://ai-work-market.ai/work/<requestId>"',
        workHash: 'string (optional, bytes32 hex; auto-computed from workURI if missing)',
        deadlineHours: 'int (optional, default = contract defaultWorkTimeout / 3600)',
        reviewHours: 'int (optional, default = contract defaultReviewPeriod / 3600)',
        requestId: 'string (required, your correlation id)',
        network: 'mainnet|sepolia (default mainnet)',
      },
      response: {
        quote: {
          intentId: 'predicted id (nextIntentId)',
          seller: 'address', amountRaw: 'string', amountUsdc: 'string', workHash: 'bytes32', workURI: 'string',
          workTimeoutSeconds: 'uint256', reviewPeriodSeconds: 'uint256', expiresAt: 'iso8601',
          calldata: '0x... — the exact bytes to call createIntent(...)',
          to: 'escrow address',
          from: 'AWM_TREASURY_ADDRESS (the signer that would call it)',
          chainId: 8453,
          network: 'mainnet|sepolia',
          gasEstimate: '~180000',
          feeEstimateRaw: 'amount * 100 / 10000 (1%)',
          feeRecipient: process.env.AWM_FEE_RECIPIENT,
        },
        treasuryFundingRequired: true,
        treasuryFundingHint: 'The AWM treasury must hold >= amountRaw USDC. The treasury address is the signer of AWM_TREASURY_PRIVATE_KEY.',
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

  const { seller, amount, workURI, workHash, deadlineHours, reviewHours, requestId } = body;
  const net = String(body.network || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  if (!seller || !ethers.isAddress(seller)) return badRequest(res, 'seller must be a 0x-prefixed EVM address');
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return badRequest(res, 'amount must be a positive USDC number');
  if (!requestId || typeof requestId !== 'string') return badRequest(res, 'requestId required');

  // Parse amount (USDC has 6 decimals). Accept "1.50" or "0.0001" or "100" (raw units).
  let amountRaw;
  try {
    if (amount.includes('.')) {
      amountRaw = ethers.parseUnits(amount, 6).toString();
    } else {
      // Heuristic: if the value fits in uint64 and is huge (e.g. "1000000" = 1 USDC), treat as raw
      const asNum = BigInt(amount);
      // If less than 1e12, probably raw; if larger, definitely raw
      amountRaw = asNum.toString();
    }
  } catch (e) {
    return badRequest(res, 'amount unparseable: ' + e.message);
  }

  // Auto-compute workHash if missing
  let wh = workHash;
  if (!wh) {
    const uri = workURI || ('https://ai-work-market.ai/work/' + requestId);
    wh = ethers.id(uri); // keccak256 of the URI as a stand-in; real impl would use Poseidon
  } else if (!/^0x[0-9a-fA-F]{64}$/.test(wh)) {
    return badRequest(res, 'workHash must be bytes32 hex');
  }

  const uri = workURI || ('https://ai-work-market.ai/work/' + requestId);

  // Read defaults from contract
  let provider;
  try { provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId); }
  catch (e) { return json(res, 500, { error: 'rpc_unreachable' }); }

  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  let defaultWorkTimeout, defaultReviewPeriod, minWorkTimeout, maxReviewPeriod, nextIntentId;
  try {
    [defaultWorkTimeout, defaultReviewPeriod, minWorkTimeout, maxReviewPeriod, nextIntentId] = await Promise.all([
      escrow.defaultWorkTimeout(),
      escrow.defaultReviewPeriod(),
      escrow.minWorkTimeout(),
      escrow.maxReviewPeriod(),
      escrow.nextIntentId(),
    ]);
  } catch (e) {
    return json(res, 502, { error: 'rpc_read_failed', message: e.message });
  }

  const workTimeoutSeconds = deadlineHours != null ? Math.floor(Number(deadlineHours) * 3600) : Number(defaultWorkTimeout);
  const reviewPeriodSeconds = reviewHours != null ? Math.floor(Number(reviewHours) * 3600) : Number(defaultReviewPeriod);

  if (workTimeoutSeconds < Number(minWorkTimeout)) {
    return badRequest(res, 'workTimeoutSeconds below min', { min: Number(minWorkTimeout), got: workTimeoutSeconds });
  }
  if (reviewPeriodSeconds > Number(maxReviewPeriod)) {
    return badRequest(res, 'reviewPeriodSeconds above max', { max: Number(maxReviewPeriod), got: reviewPeriodSeconds });
  }

  // Encode createIntent calldata
  const iface = new ethers.Interface(ESCROW_ABI);
  const calldata = iface.encodeFunctionData('createIntent', [
    seller,
    BigInt(amountRaw),
    BigInt(workTimeoutSeconds),
    BigInt(reviewPeriodSeconds),
    wh,
    uri,
  ]);

  // Predict intentId
  const predictedIntentId = Number(nextIntentId);

  // Fee estimate (1% by default)
  const feeBps = 100;
  const feeEstimateRaw = (BigInt(amountRaw) * BigInt(feeBps) / BigInt(10000)).toString();

  return json(res, 200, {
    schema: 'ai-work-market.post-work-funded.v1',
    network: cfg.label,
    chainId: cfg.chainId,
    requestId,
    quote: {
      intentId: predictedIntentId,
      seller,
      amountRaw,
      amountUsdc: ethers.formatUnits(amountRaw, 6),
      workHash: wh,
      workURI: uri,
      workTimeoutSeconds,
      reviewPeriodSeconds,
      reviewDeadlineEstimate: Math.floor(Date.now() / 1000) + workTimeoutSeconds + reviewPeriodSeconds,
      calldata,
      to: cfg.escrow,
      chainId: cfg.chainId,
      gasEstimate: '180000',
      feeEstimateRaw,
      feeEstimateUsdc: ethers.formatUnits(feeEstimateRaw, 6),
      feeRecipient: process.env.AWM_FEE_RECIPIENT || null,
      feeBps,
    },
    treasuryFundingRequired: true,
    treasuryFundingHint: 'The AWM treasury must hold >= ' + amountRaw + ' raw USDC AND >= ~0.001 ETH for gas. The treasury address is the signer of AWM_TREASURY_PRIVATE_KEY (env var, not exposed).',
    broadcast: {
      enabled: Boolean(process.env.AWM_TREASURY_PRIVATE_KEY),
      auth: 'Requires HMAC x-awm-signature + x-awm-timestamp, same scheme as /api/x402-consume',
      // This endpoint is read-only in this build. To enable broadcast, set
      // AWM_TREASURY_PRIVATE_KEY in Vercel and add the broadcast branch.
      hint: 'Send x-awm-submit: true with valid HMAC to broadcast the calldata. Not enabled in this read-only build.',
    },
  });
};
