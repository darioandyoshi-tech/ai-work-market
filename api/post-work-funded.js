// api/post-work-funded.js
// Returns the calldata, gas estimate, and exact USDC amount needed for the
// AWM escrow createIntent() on Base Mainnet.
//
// READ-ONLY: never broadcasts a tx. If AWM_TREASURY_PRIVATE_KEY is set in
// Vercel AND the request includes x-awm-submit: true, this endpoint will
// broadcast (gated by HMAC auth, just like x402-consume). For now the
// submit path is a TODO.
//
// --- DEPLOYED ABI NOTE ---
// The deployed contract (verified on Sourcify) is AgentWorkEscrowZK on
// Base Mainnet (chain 8453). Its public ABI has:
//   - createIntent(address,uint256,uint256,uint256,bytes32,string)
//   - MIN_WORK_TIMEOUT(), MAX_WORK_TIMEOUT(), MIN_REVIEW_PERIOD(), MAX_REVIEW_PERIOD() (constants, view)
//   - nextIntentId(), usdc(), defaultFeeBps(), feeRecipient(), accumulatedFees(),
//     zkVerifier(), owner(), intents(uint256)
//   - BPS_DENOMINATOR(), MAX_FEE_BPS(), MAX_URI_BYTES()
//   - createIntentFromSignedOffer(...), submitProofWithZK(...), resolveDispute(...),
//     setDefaultFeeBps(uint96), setFeeRecipient(address) — governance/ZK functions
// It does NOT have defaultWorkTimeout() / defaultReviewPeriod() as state vars.
// So the timeouts are read from the constants and not mutated per-call.

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

// --- DEPLOYED ABI (from Sourcify, full_match) ---
// Only includes the functions we actually call. Constants (MIN_*, MAX_*) are
// included as `view` so ethers knows they take no args.
const ESCROW_ABI = [
  'function createIntent(address seller, uint256 amount, uint256 workTimeoutSeconds, uint256 reviewPeriodSeconds, bytes32 workHash, string workURI) external returns (uint256 intentId)',
  'function nextIntentId() view returns (uint256)',
  'function usdc() view returns (address)',
  'function defaultFeeBps() view returns (uint96)',
  'function feeRecipient() view returns (address)',
  'function accumulatedFees() view returns (uint256)',
  'function zkVerifier() view returns (address)',
  'function owner() view returns (address)',
  'function BPS_DENOMINATOR() view returns (uint256)',
  'function MAX_FEE_BPS() view returns (uint256)',
  'function MAX_REVIEW_PERIOD() view returns (uint256)',
  'function MAX_URI_BYTES() view returns (uint256)',
  'function MAX_WORK_TIMEOUT() view returns (uint256)',
  'function MIN_REVIEW_PERIOD() view returns (uint256)',
  'function MIN_WORK_TIMEOUT() view returns (uint256)',
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

function autoAmountFromArgs(args) {
  if (args.amount == null) return null;
  const a = String(args.amount).trim();
  if (a === '') return null;
  // Accept "1.50" or "0.0001" or "100" (whole-dollar) or numeric raw units.
  // If it contains a dot, treat as decimal USDC. Otherwise as raw (6-decimal) units.
  try {
    if (a.includes('.')) return ethers.parseUnits(a, 6).toString();
    const asNum = Number(a);
    if (Number.isFinite(asNum) && asNum >= 0) {
      // Heuristic: if <= 1e9, assume whole USDC. Otherwise raw units.
      // 1 USDC = 1_000_000. So 100 USDC = 100_000_000. Threshold: > 1e9 → raw.
      if (asNum > 1e9) return a;
      return ethers.parseUnits(a, 6).toString();
    }
    return null;
  } catch { return null; }
}

const GET_SCHEMA = {
  schema: 'ai-work-market.post-work-funded.v1',
  method: 'POST',
  body: {
    seller: 'address (required, the agent\'s wallet — they will be paid on proof/release)',
    amount: 'string (required, USDC amount, e.g. "1.50", "0.0001", or "100" whole USDC; max 9 decimals)',
    workURI: 'string (required, ipfs:// or https:// pointer to the work spec; max MAX_URI_BYTES)',
    workHash: 'bytes32 (optional, hex; auto-computed from workURI as keccak256 if missing)',
    workTimeoutSeconds: 'uint256 (optional, time the seller has to deliver; clamped to [MIN_WORK_TIMEOUT, MAX_WORK_TIMEOUT]; default 7 days)',
    reviewPeriodSeconds: 'uint256 (optional, buyer review window; clamped to [MIN_REVIEW_PERIOD, MAX_REVIEW_PERIOD]; default 7 days)',
    requestId: 'string (required, server-generated correlation id you used in x402 or UI flow)',
    network: 'mainnet|sepolia (default mainnet)',
  },
  response: {
    schema: 'ai-work-market.post-work-funded.v1',
    network: 'base-mainnet|base-sepolia',
    chainId: 8453|84532,
    requestId: 'echoed back',
    quote: {
      intentId: 'predicted next id',
      seller: 'address',
      amountRaw: 'string, USDC raw (6-decimal)',
      amountUsdc: 'string, human USDC ("1.50")',
      workHash: 'bytes32',
      workURI: 'string',
      workTimeoutSeconds: 'uint256',
      reviewPeriodSeconds: 'uint256',
      reviewDeadlineEstimate: 'unix seconds, createdAt + workTimeout + reviewPeriod',
      calldata: '0x... — the exact bytes to call createIntent(...)',
      to: 'escrow address',
      chainId: 8453,
      gasEstimate: 'string, rough gas units (200000)',
      feeEstimateRaw: 'amountRaw * defaultFeeBps / BPS_DENOMINATOR (1%)',
      feeEstimateUsdc: 'string, human fee ("0.01")',
      feeRecipient: 'address',
      feeBps: 'uint96',
    },
    treasuryFundingRequired: 'true — AWM_TREASURY signer must hold >= amountRaw USDC and ~0.001 ETH for gas',
    treasuryFundingHint: 'string, human hint',
    broadcast: { enabled: 'boolean', auth: 'string' },
    notes: 'The escrow is non-custodial. The buyer signs and sends the calldata. USDC moves via transferFrom — your wallet must approve the AWM escrow first.',
  },
  notes: 'READ-ONLY. To broadcast, set AWM_TREASURY_PRIVATE_KEY in Vercel and send x-awm-submit: true with HMAC x-awm-signature + x-awm-timestamp headers.',
};

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, GET_SCHEMA);
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return badRequest(res, e.message); }
  const { seller, workURI, workHash, deadlineHours, reviewHours, requestId } = body;
  const net = String(body.network || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  // --- Validate inputs ---
  if (!seller || !ethers.isAddress(seller)) return badRequest(res, 'seller must be a 0x-prefixed EVM address');
  const amountRaw = autoAmountFromArgs(body);
  if (!amountRaw || amountRaw === '0') return badRequest(res, 'amount must be a positive USDC number (e.g. "1.50" or "100")');
  if (!workURI) return badRequest(res, 'workURI required');
  if (Buffer.byteLength(workURI, 'utf8') > 2048) return badRequest(res, 'workURI too long', { max: 2048 });
  if (!requestId) return badRequest(res, 'requestId required');

  // --- Read the live constants (replaces the missing defaultWorkTimeout) ---
  // Base Mainnet caps eth_call batches at 10. Make 3 sequential small batches.
  const provider = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  let MIN_WT, MAX_WT, MIN_RP, MAX_RP, MAX_URI, BPS_DEN, MAX_FEE, nextIntentId, defaultFeeBps, feeRecipient, accumulatedFeesRaw;
  try {
    const c1 = await Promise.all([
      escrow.MIN_WORK_TIMEOUT(),
      escrow.MAX_WORK_TIMEOUT(),
      escrow.MIN_REVIEW_PERIOD(),
      escrow.MAX_REVIEW_PERIOD(),
      escrow.MAX_URI_BYTES(),
      escrow.BPS_DENOMINATOR(),
      escrow.MAX_FEE_BPS(),
    ]);
    [MIN_WT, MAX_WT, MIN_RP, MAX_RP, MAX_URI, BPS_DEN, MAX_FEE] = c1;
    // Small delay to avoid being rate-limited
    await new Promise(r => setTimeout(r, 100));
    const c2 = await Promise.all([
      escrow.nextIntentId(),
      escrow.defaultFeeBps(),
      escrow.feeRecipient(),
    ]);
    [nextIntentId, defaultFeeBps, feeRecipient] = c2;
    await new Promise(r => setTimeout(r, 100));
    const c3 = await Promise.all([
      escrow.accumulatedFees(),
    ]);
    [accumulatedFeesRaw] = c3;
  } catch (e) {
    return json(res, 502, { error: 'rpc_read_failed', message: e.message, hint: 'Could not read constants from the deployed contract. Check RPC and verify the contract exists on chain ' + cfg.chainId });
  }

  // --- Clamp timeouts to contract bounds ---
  const wt = body.workTimeoutSeconds != null ? Number(body.workTimeoutSeconds)
            : (deadlineHours != null ? Math.floor(Number(deadlineHours) * 3600) : null);
  const rp = body.reviewPeriodSeconds != null ? Number(body.reviewPeriodSeconds)
            : (reviewHours != null ? Math.floor(Number(reviewHours) * 3600) : null);

  // Default to 7 days for both, since the contract doesn't have a default.
  const DEFAULT_WT = 7 * 86400;
  const DEFAULT_RP = 7 * 86400;
  const workTimeoutSeconds = wt != null ? wt : DEFAULT_WT;
  const reviewPeriodSeconds = rp != null ? rp : DEFAULT_RP;

  if (workTimeoutSeconds < Number(MIN_WT)) {
    return badRequest(res, 'workTimeoutSeconds below min', { min: Number(MIN_WT), got: workTimeoutSeconds });
  }
  if (workTimeoutSeconds > Number(MAX_WT)) {
    return badRequest(res, 'workTimeoutSeconds above max', { max: Number(MAX_WT), got: workTimeoutSeconds });
  }
  if (reviewPeriodSeconds < Number(MIN_RP)) {
    return badRequest(res, 'reviewPeriodSeconds below min', { min: Number(MIN_RP), got: reviewPeriodSeconds });
  }
  if (reviewPeriodSeconds > Number(MAX_RP)) {
    return badRequest(res, 'reviewPeriodSeconds above max', { max: Number(MAX_RP), got: reviewPeriodSeconds });
  }

  // --- Compute workHash if not provided ---
  let wh = workHash;
  if (!wh) {
    wh = ethers.id(workURI);  // keccak256(workURI)
  } else if (!wh.startsWith('0x') || wh.length !== 66) {
    return badRequest(res, 'workHash must be 0x-prefixed 32-byte hex');
  }

  // --- Encode calldata ---
  const iface = new ethers.Interface(ESCROW_ABI);
  const calldata = iface.encodeFunctionData('createIntent', [
    seller,
    BigInt(amountRaw),
    BigInt(workTimeoutSeconds),
    BigInt(reviewPeriodSeconds),
    wh,
    workURI,
  ]);

  // --- Predict intentId (next is current + 0 since this creates the next one) ---
  const predictedIntentId = Number(nextIntentId);

  // --- Fee estimate (default fee in BPS, applied to amount) ---
  const feeBps = Number(defaultFeeBps);
  const feeEstimateRaw = (BigInt(amountRaw) * BigInt(feeBps) / BigInt(BPS_DEN)).toString();
  const feeEstimateUsdc = ethers.formatUnits(feeEstimateRaw, 6);

  return json(res, 200, {
    schema: GET_SCHEMA.schema,
    network: cfg.label,
    chainId: cfg.chainId,
    requestId,
    quote: {
      intentId: predictedIntentId,
      seller,
      amountRaw,
      amountUsdc: ethers.formatUnits(amountRaw, 6),
      workHash: wh,
      workURI,
      workTimeoutSeconds,
      reviewPeriodSeconds,
      reviewDeadlineEstimate: Math.floor(Date.now() / 1000) + workTimeoutSeconds + reviewPeriodSeconds,
      calldata,
      to: cfg.escrow,
      chainId: cfg.chainId,
      gasEstimate: '220000',
      feeEstimateRaw,
      feeEstimateUsdc,
      feeRecipient,
      feeBps,
    },
    constants: {
      MIN_WORK_TIMEOUT: Number(MIN_WT),
      MAX_WORK_TIMEOUT: Number(MAX_WT),
      MIN_REVIEW_PERIOD: Number(MIN_RP),
      MAX_REVIEW_PERIOD: Number(MAX_RP),
      MAX_URI_BYTES: Number(MAX_URI),
      BPS_DENOMINATOR: Number(BPS_DEN),
      MAX_FEE_BPS: Number(MAX_FEE),
    },
    state: {
      nextIntentId: Number(nextIntentId),
      defaultFeeBps: Number(defaultFeeBps),
      feeRecipient,
      accumulatedFeesRaw: accumulatedFeesRaw.toString(),
    },
    treasuryFundingRequired: true,
    treasuryFundingHint: 'The AWM treasury must hold >= ' + amountRaw + ' raw USDC AND >= ~0.001 ETH for gas. The treasury address is the signer of AWM_TREASURY_PRIVATE_KEY (env var, not exposed).',
    broadcast: {
      enabled: Boolean(process.env.AWM_TREASURY_PRIVATE_KEY),
      auth: 'Requires HMAC x-awm-signature + x-awm-timestamp, same scheme as /api/x402-consume',
      endpoint: '/api/post-work-v2 (with x-awm-submit: true)',
    },
    notes: 'The escrow is non-custodial. The buyer signs and sends the calldata. USDC moves via transferFrom — your wallet must approve the AWM escrow first.',
  });
};
