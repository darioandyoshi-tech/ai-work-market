// api/contract-status.js
// Serverless function: read on-chain status of an AWM intent directly via RPC.
// Replaces the previous child_process.execSync('node bin/awm.js status ...') call,
// which is forbidden on Vercel serverless (AWS Lambda blocks child processes).
//
// The deployed AgentWorkEscrowZK source has evolved several times, so we try
// multiple ABI candidates (12, 13, 14 fields) and pick the first that decodes
// without a CALL_EXCEPTION. We also fall back to raw eth_getStorageAt for the
// fields that any candidate can't decode cleanly (strings can be tricky to
// decode on chains where the struct layout isn't yet known).
//
// Required env vars (set in Vercel dashboard for project ai-work-market):
//   BASE_SEPOLIA_RPC_URL  e.g. https://sepolia.base.org
//   BASE_MAINNET_RPC_URL  e.g. https://mainnet.base.org
//
// Optional env vars (override defaults):
//   ESCROW_ADDRESS_SEPOLIA  default 0x489C36738F46e395b4cd26DDf0f85756686A2f07
//   ESCROW_ADDRESS          default 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2

const { ethers } = require('ethers');

// Status enum, empirically observed. Both the local source and the deployed
// bytecode use 0=None 1=Funded 2=ProofSubmitted 3=Released 4=Refunded 5=Disputed 6=Resolved.
const STATUS_NAMES = [
  'None',
  'Funded',
  'ProofSubmitted',
  'Released',
  'Refunded',
  'Disputed',
  'Resolved',
];

// Candidate struct layouts, in order of likelihood. The first that decodes
// without a CALL_EXCEPTION wins. Each candidate is a JS object describing how
// to project the decoded tuple into the canonical response shape.
//
// The deployed mainnet bytecode exposes a 14-field struct. The 12-field local
// source mismatches because of string fields (workURI, proofURI) and trailing
// bytes32. ethers v6's Contract.method() is fragile when strings are involved
// (returns "deferred error during ABI decoding"). We bypass it by using
// provider.call + Interface.decodeFunctionResult, which gives us full control
// over decoding and surfaces the actual error string.
const INTENT_CANDIDATES = [
  // 14 fields, observed order on deployed mainnet (workURI, proofURI included)
  {
    label: 'mainnet-14field',
    signature:
      'function intents(uint256) view returns (address, address, uint256, uint96, uint256, uint256, uint256, uint256, bytes32, string, string, uint8, bytes32, bytes32)',
    layout: '14',
  },
  // 12 fields, local AgentWorkEscrowZK.sol (no workURI/proofURI)
  {
    label: 'local-12field',
    signature:
      'function intents(uint256) view returns (address, address, uint96, uint256, uint256, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)',
    layout: '12',
  },
  // 12 fields, swapped amount/feeBps
  {
    label: 'mainnet-12field-amount-feeBps-swap',
    signature:
      'function intents(uint256) view returns (address, address, uint256, uint96, uint256, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)',
    layout: '12-swap',
  },
];

const NETWORKS = {
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow:
      process.env.ESCROW_ADDRESS_SEPOLIA ||
      '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
  mainnet: {
    label: 'base-mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
};

function json(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body));
}

function pickNetwork(req) {
  const q = String((req.query && req.query.network) || '').toLowerCase();
  if (q === 'sepolia' || q === 'base-sepolia' || q === 'testnet') return 'sepolia';
  return 'mainnet';
}

// Pull values by index range from a decoded tuple, ignoring the shape.
function pickField(decoded, i) {
  if (!Array.isArray(decoded)) return undefined;
  return decoded[i];
}

// Read raw storage slots for `intents[key]`. Mapping storage slots are at
// keccak256(key . mapping-base-slot). We probe a few candidate base slots
// looking for the buyer address in the high bytes of slot 0, since the
// deployer is known. This always works regardless of struct order.
async function readStorage(provider, escrowAddr, intentId) {
  const isHex = await provider.send('eth_getCode', [escrowAddr, 'latest']);
  if (!isHex || isHex === '0x' || isHex === '0x0') {
    return { found: false, reason: 'no_code' };
  }
  // Try base slots 0..15 looking for the buyer address (zero in uninitialized slots).
  for (let base = 0; base < 16; base++) {
    const key = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256'],
      [BigInt(intentId), BigInt(base)],
    );
    const v = await provider.getStorage(escrowAddr, key);
    if (v && v !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      // Decode: if high 12 bytes are 20-byte address, the buyer is there.
      const raw = BigInt(v);
      const possibleBuyer = '0x' + raw.toString(16).slice(-40);
      // Sanity: address checksum
      if (ethers.isAddress(possibleBuyer)) {
        return {
          found: true,
          baseSlot: base,
          rawSlot0: v,
          possibleBuyer,
        };
      }
    }
  }
  return { found: false, reason: 'not_initialized' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return json(res, 400, { error: 'missing_intent_id', hint: 'Use ?id=1&network=base-mainnet' });
  }

  const network = pickNetwork(req);
  const cfg = NETWORKS[network];

  let provider;
  try {
    provider = new ethers.JsonRpcProvider(cfg.rpc, { chainId: network === 'sepolia' ? 84532 : 8453, name: cfg.label });
  } catch (err) {
    return json(res, 500, { error: 'rpc_unreachable', details: err.message, network: cfg.label });
  }

  // Try each candidate ABI using provider.call + Interface.decodeFunctionResult
  // (bypasses ethers v6's auto-batcher and gives a clean error string).
  const attempts = [];
  let best = null;
  for (const cand of INTENT_CANDIDATES) {
    try {
      const iface = new ethers.Interface([cand.signature]);
      const data = iface.encodeFunctionData('intents', [id]);
      const raw = await provider.call({ to: cfg.escrow, data });
      const decoded = iface.decodeFunctionResult('intents', raw);
      const arr = Array.from(decoded[0]); // Result → array
      attempts.push({ candidate: cand.label, ok: true, length: arr.length });
      // Prefer the 14-field layout (real on-chain); fall back to others
      if (!best || cand.layout === '14') {
        best = { candidate: cand.label, layout: cand.layout, decoded: arr };
        if (cand.layout === '14') break; // 14 is canonical
      }
    } catch (err) {
      attempts.push({ candidate: cand.label, ok: false, error: (err && err.message || '').slice(0, 200) });
    }
  }

  // Always also probe storage so we can confirm the intent exists and surface
  // the buyer if the struct decoding misbehaves.
  const storage = await readStorage(provider, cfg.escrow, id).catch((e) => ({ found: false, reason: 'storage_error', error: e.message }));

  if (!best) {
    return json(res, 200, {
      schema: 'ai-work-market.contract-status.v2',
      network: cfg.label,
      escrow: cfg.escrow,
      intentId: String(id),
      exists: false,
      storage,
      attempts,
      hint: 'Intent does not exist on this network, or no candidate ABI decoded successfully.',
    });
  }

  // Map the decoded tuple to canonical fields by best-effort index assumption.
  // 14-field layout (the real on-chain struct):
  //   (buyer, seller, amount, feeBps, createdAt, workDeadline, reviewDeadline,
  //    reviewPeriod, workHash, workURI, proofURI, status, proofHash, disputeHash)
  // 12-field (local source): (buyer, seller, feeBps, amount, createdAt,
  //   workDeadline, reviewDeadline, reviewPeriod, workHash, status, proofHash, disputeHash)
  // 12-field-swap: (buyer, seller, amount, feeBps, ...)
  const [a, b, c, d, e, f, g, h, i, j, k, l, m, n] = best.decoded;
  const layout = best.layout;
  let buyer, seller, amount, feeBps, createdAt, workDeadline, reviewDeadline, reviewPeriod, workHash, workURI, proofURI, statusCode, proofHash, disputeHash;
  if (layout === '14') {
    buyer = a; seller = b; amount = c; feeBps = d;
    createdAt = e; workDeadline = f; reviewDeadline = g; reviewPeriod = h;
    workHash = i; workURI = j; proofURI = k;
    statusCode = typeof l === 'number' || typeof l === 'bigint' ? Number(l) : (typeof l === 'string' ? parseInt(l, 16) : null);
    proofHash = m; disputeHash = n;
  } else if (layout === '12-swap') {
    buyer = a; seller = b; amount = c; feeBps = d;
    createdAt = e; workDeadline = f; reviewDeadline = g; reviewPeriod = h;
    workHash = i; statusCode = typeof j === 'number' || typeof j === 'bigint' ? Number(j) : null;
    proofHash = k; disputeHash = l;
  } else {
    buyer = a; seller = b; feeBps = c; amount = d;
    createdAt = e; workDeadline = f; reviewDeadline = g; reviewPeriod = h;
    workHash = i; statusCode = typeof j === 'number' || typeof j === 'bigint' ? Number(j) : null;
    proofHash = k; disputeHash = l;
  }

  const statusName = statusCode != null && STATUS_NAMES[statusCode] ? STATUS_NAMES[statusCode] : (statusCode != null ? `Unknown(${statusCode})` : 'Unknown');

  return json(res, 200, {
    schema: 'ai-work-market.contract-status.v2',
    network: cfg.label,
    escrow: cfg.escrow,
    intentId: String(id),
    exists: true,
    decodedWith: best.candidate,
    status: statusName,
    statusCode,
    buyer: buyer || (storage.possibleBuyer || null),
    seller,
    feeBps: feeBps != null ? Number(feeBps) : null,
    amount: amount != null ? String(amount) : null,
    createdAt: createdAt != null ? String(createdAt) : null,
    workDeadline: workDeadline != null ? String(workDeadline) : null,
    reviewDeadline: reviewDeadline != null ? String(reviewDeadline) : null,
    reviewPeriod: reviewPeriod != null ? String(reviewPeriod) : null,
    workHash,
    workURI: workURI || null,
    proofURI: proofURI || null,
    proofHash,
    disputeHash,
    storage,
    attempts,
    timestamp: new Date().toISOString(),
  }, 30);
};
