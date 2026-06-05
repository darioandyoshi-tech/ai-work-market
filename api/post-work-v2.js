// api/post-work-v2.js
// Atomic approve + createIntent for hiring an agent.
// One tool call: the server returns a single multicall3 calldata that does
// approve(USDC, escrow, amount) + createIntent(seller, amount, workTimeout,
// reviewPeriod, workHash, workURI) atomically. The user signs ONE tx.
//
// This is the better-UX alternative to /api/post-work-funded + manual approve.
// Same response shape, same fields, just pre-packaged into a multicall.
//
// ABI: the deployed AgentWorkEscrowZK.createIntent has the 6-arg signature
// (verified 2026-06-04 via Sourcify full_match):
//   createIntent(address seller, uint256 amount, uint256 workTimeoutSeconds,
//                uint256 reviewPeriodSeconds, bytes32 workHash, string workURI)
// Earlier versions of this file used the local source ABI's 4-arg
// createIntent(address,uint96,string,uint256) which would revert on-chain.
// Now aligned with the deployed contract.
//
// POST /api/post-work-v2  { seller, amount, workURI, workTimeoutHours?, reviewPeriodHours? }
//   -> {
//        schema: "ai-work-market.post-work-v2.v1",
//        ok: true,
//        atomicCalldata: "0x...",   // multicall3: approve + createIntent
//        breakdown: { approve, createIntent },
//        tx: { hash, status, ... } | null,   // populated if AWM_TREASURY_PRIVATE_KEY set
//        ...
//      }

const { ethers } = require('ethers');

const USDC_ADDRESSES = {
  mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  sepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    chainId: 8453,
    usdc: USDC_ADDRESSES.mainnet,
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    usdc: USDC_ADDRESSES.sepolia,
    escrow: process.env.ESCROW_ADDRESS_SEPOLIA || '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
};

const USDC_ABI = ['function approve(address spender, uint256 amount) external returns (bool)'];

// DEPLOYED ABI for the AWM escrow. Verified 2026-06-04 against the
// full_match metadata at https://repo.sourcify.dev/contracts/full_match/8453/<addr>/metadata.json
const ESCROW_ABI = [
  'function createIntent(address seller, uint256 amount, uint256 workTimeoutSeconds, uint256 reviewPeriodSeconds, bytes32 workHash, string workURI) external returns (uint256 intentId)',
];

// Hardcoded immutable constants (verified 2026-06-04 on-chain via cast call).
// These don't change without a contract redeploy.
const MIN_WORK_TIMEOUT = 3600n;        // 1h
const MAX_WORK_TIMEOUT = 2592000n;     // 30d
const MIN_REVIEW_PERIOD = 3600n;       // 1h
const MAX_REVIEW_PERIOD = 1209600n;    // 14d
const BPS_DENOMINATOR = 10000n;        // 100% = 10000 bps
const DEFAULT_FEE_BPS = 100n;           // 1% — matches the on-chain default

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function pickNetwork(req) {
  const q = String((req.query && req.query.network) || '').toLowerCase();
  if (q === 'sepolia' || q === 'base-sepolia' || q === 'testnet') return 'sepolia';
  return 'mainnet';
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

function autoAmountRaw(args) {
  if (args.amount == null) return null;
  const a = String(args.amount).trim();
  if (a === '') return null;
  try {
    if (a.includes('.')) return ethers.parseUnits(a, 6).toString();
    const asNum = Number(a);
    if (Number.isFinite(asNum) && asNum >= 0) {
      if (asNum > 1e9) return a; // raw units
      return ethers.parseUnits(a, 6).toString();
    }
    return null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.post-work-v2.v1',
      method: 'POST',
      body: {
        seller: 'address (required, the agent\'s wallet — they will be paid on proof/release)',
        amount: 'string (required, USDC amount, e.g. "1.50", "0.0001", or "100" whole USDC; max 9 decimals)',
        workURI: 'string (required, ipfs:// or https:// pointer to the work spec; max 512 bytes)',
        workHash: 'bytes32 (optional, hex; auto-computed as keccak256(workURI) if missing)',
        workTimeoutSeconds: 'uint256 (optional, clamped to [3600, 2592000]; default 7 days)',
        reviewPeriodSeconds: 'uint256 (optional, clamped to [3600, 1209600]; default 7 days)',
        network: 'mainnet|sepolia (default mainnet)',
      },
      response: {
        schema: 'ai-work-market.post-work-v2.v1',
        network: 'base-mainnet|base-sepolia',
        chainId: '8453|84532',
        atomicCalldata: '0x... — multicall3(approve(USDC, escrow, amount) + createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI))',
        breakdown: { approve: '{to, data, value}', createIntent: '{to, data, value}' },
        tx: '{hash, status, blockNumber, gasUsed} | null — populated if AWM_TREASURY_PRIVATE_KEY set',
        intentId: 'predicted next intentId from the live contract',
        note: 'Atomic calldata is a single tx. The user signs once. Both the USDC approval AND the createIntent succeed in the same transaction, or both revert.',
      },
      notes: 'Better UX than /api/post-work-funded + manual approve. Same response shape, just pre-packaged into a multicall. If AWM_TREASURY_PRIVATE_KEY is set, AWM broadcasts on behalf of the buyer.',
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, 400, { error: 'bad_request', message: e.message }); }

  const { workURI, workHash, network: netArg } = body;
  let { seller } = body;
  const cfg = NETWORKS[netArg === 'sepolia' ? 'sepolia' : 'mainnet'];

  // --- Validate ---
  if (!seller || typeof seller !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(seller)) {
    return json(res, 400, { error: 'bad_request', message: 'seller must be a 0x-prefixed 40-hex-char EVM address' });
  }
  try { seller = ethers.getAddress(seller); }
  catch (_) { seller = ethers.getAddress(seller.toLowerCase()); }

  const amountRaw = autoAmountRaw(body);
  if (!amountRaw || amountRaw === '0') {
    return json(res, 400, { error: 'bad_request', message: 'amount must be a positive USDC number (e.g. "1.50" or "100")' });
  }
  if (!workURI) {
    return json(res, 400, { error: 'bad_request', message: 'workURI required' });
  }
  if (Buffer.byteLength(workURI, 'utf8') > 512) {
    return json(res, 400, { error: 'bad_request', message: 'workURI too long', max: 512 });
  }

  // Clamp timeouts to the deployed contract's ranges
  const workTimeoutSeconds = body.workTimeoutSeconds != null ? Number(body.workTimeoutSeconds) : (7 * 24 * 3600);
  const reviewPeriodSeconds = body.reviewPeriodSeconds != null ? Number(body.reviewPeriodSeconds) : (7 * 24 * 3600);
  if (BigInt(workTimeoutSeconds) < MIN_WORK_TIMEOUT) {
    return json(res, 400, { error: 'bad_request', message: 'workTimeoutSeconds below MIN_WORK_TIMEOUT (3600)', got: workTimeoutSeconds });
  }
  if (BigInt(workTimeoutSeconds) > MAX_WORK_TIMEOUT) {
    return json(res, 400, { error: 'bad_request', message: 'workTimeoutSeconds above MAX_WORK_TIMEOUT (2592000)', got: workTimeoutSeconds });
  }
  if (BigInt(reviewPeriodSeconds) < MIN_REVIEW_PERIOD) {
    return json(res, 400, { error: 'bad_request', message: 'reviewPeriodSeconds below MIN_REVIEW_PERIOD (3600)', got: reviewPeriodSeconds });
  }
  if (BigInt(reviewPeriodSeconds) > MAX_REVIEW_PERIOD) {
    return json(res, 400, { error: 'bad_request', message: 'reviewPeriodSeconds above MAX_REVIEW_PERIOD (1209600)', got: reviewPeriodSeconds });
  }

  // Compute workHash from workURI if not provided
  let wh = workHash;
  if (!wh) {
    wh = ethers.id(workURI);  // keccak256(utf8(workURI))
  } else if (!wh.startsWith('0x') || wh.length !== 66) {
    return json(res, 400, { error: 'bad_request', message: 'workHash must be 0x-prefixed 32-byte hex' });
  }

  // --- Encode the two calls ---
  const usdcIface = new ethers.Interface(USDC_ABI);
  const escrowIface = new ethers.Interface(ESCROW_ABI);

  const approveData = usdcIface.encodeFunctionData('approve', [cfg.escrow, BigInt(amountRaw)]);
  const createIntentData = escrowIface.encodeFunctionData('createIntent', [
    seller,
    BigInt(amountRaw),
    BigInt(workTimeoutSeconds),
    BigInt(reviewPeriodSeconds),
    wh,
    workURI,
  ]);

  // Pack into a Multicall3 call. Standard 0xcA11bde0... address on most chains.
  const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const multicallData = new ethers.Interface([
    'function multicall(bytes[] data) payable returns (bytes[] results)',
  ]).encodeFunctionData('multicall', [[approveData, createIntentData]]);

  // --- Read live nextIntentId for the predicted id ---
  const provider = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  let predictedIntentId = null;
  try { predictedIntentId = Number(await escrow.getFunction('createIntent').staticCall?.(seller, BigInt(amountRaw), BigInt(workTimeoutSeconds), BigInt(reviewPeriodSeconds), wh, workURI, { from: ethers.ZeroAddress })) || null; }
  catch (_) { /* staticCall might revert; just skip the prediction */ }
  // Easier: just read nextIntentId() directly
  if (predictedIntentId == null) {
    try {
      predictedIntentId = Number(await provider.call({
        to: cfg.escrow,
        data: new ethers.Interface(['function nextIntentId() view returns (uint256)']).encodeFunctionData('nextIntentId', []),
      })) || null;
      if (predictedIntentId != null) {
        // The result is hex, parse it
        predictedIntentId = Number(BigInt(predictedIntentId));
      }
    } catch (_) { /* ignore */ }
  }

  const feeEstimateRaw = (BigInt(amountRaw) * DEFAULT_FEE_BPS / BPS_DENOMINATOR).toString();
  const result = {
    schema: 'ai-work-market.post-work-v2.v1',
    ok: true,
    network: cfg.label,
    chainId: cfg.chainId,
    seller,
    amount: ethers.formatUnits(amountRaw, 6),
    amountRaw,
    workURI,
    workHash: wh,
    workTimeoutSeconds,
    reviewPeriodSeconds,
    feeBps: Number(DEFAULT_FEE_BPS),
    feeEstimateRaw,
    feeEstimateUsdc: ethers.formatUnits(feeEstimateRaw, 6),
    predictedIntentId,
    atomicCalldata: multicallData,
    atomicTo: MULTICALL3,
    atomicValue: '0',
    breakdown: {
      approve: { to: cfg.usdc, data: approveData, value: '0', description: 'USDC.approve(escrow, amount)' },
      createIntent: { to: cfg.escrow, data: createIntentData, value: '0', description: 'AWM.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI)' },
    },
    intentId: null,
    tx: null,
    constants: {
      MIN_WORK_TIMEOUT: Number(MIN_WORK_TIMEOUT),
      MAX_WORK_TIMEOUT: Number(MAX_WORK_TIMEOUT),
      MIN_REVIEW_PERIOD: Number(MIN_REVIEW_PERIOD),
      MAX_REVIEW_PERIOD: Number(MAX_REVIEW_PERIOD),
      BPS_DENOMINATOR: Number(BPS_DENOMINATOR),
      DEFAULT_FEE_BPS: Number(DEFAULT_FEE_BPS),
    },
    note: 'Send the atomic calldata as a single tx from your buyer wallet to MULTICALL3. The multicall will approve USDC, then call createIntent, in a single transaction (both succeed or both revert). The intentId is the predicted nextIntentId — poll /api/contract-status?id={id} to confirm.',
  };

  // If treasury mode is enabled, broadcast the multicall
  const treasuryKey = process.env.AWM_TREASURY_PRIVATE_KEY;
  if (treasuryKey) {
    try {
      const buyer = new ethers.Wallet(treasuryKey, provider);
      result.buyerAddress = buyer.address;

      const tx = await buyer.sendTransaction({
        to: MULTICALL3,
        data: multicallData,
        value: 0n,
      });
      const receipt = await tx.wait();

      result.tx = {
        hash: tx.hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
      // Extract the createIntent event log to get the real intentId
      const createIntentEvent = receipt.logs && receipt.logs.find(l => l.address && l.address.toLowerCase() === cfg.escrow.toLowerCase());
      if (createIntentEvent && createIntentEvent.topics && createIntentEvent.topics[1]) {
        result.intentId = Number(BigInt(createIntentEvent.topics[1]));
      }
      result.note = 'AWM treasury broadcast the atomic tx. The intentId below was extracted from the createIntent event log. Poll /api/contract-status?id={id} to confirm.';
    } catch (e) {
      result.txError = e.message;
      result.note = 'Atomic calldata is ready but the broadcast failed. Sign and send the atomicCalldata yourself to MULTICALL3 from your buyer wallet.';
    }
  } else {
    result.note = 'Atomic calldata is ready. Sign and send it to MULTICALL3 from your buyer wallet. If AWM_TREASURY_PRIVATE_KEY is set in Vercel, AWM will broadcast it for you.';
  }

  return json(res, 200, result);
};
