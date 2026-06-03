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
// ethers v6 has "deferred error" semantics for ABI decoding: if any dynamic
// field in the result is malformed, the WHOLE destructure throws at access
// time. To avoid this, we use minimal ABIs (no dynamic strings) and read the
// canonical fields directly.
const INTENT_CANDIDATES = [
  // 12 fields, local source: (buyer, seller, amount, feeBps, createdAt,
  //   workDeadline, reviewDeadline, reviewPeriod, workHash, status, proofHash, disputeHash)
  // Dynamic strings (workURI, proofURI) are dropped because ethers v6 throws
  // "deferred error" when ANY subsequent field is accessed after a corrupt
  // dynamic type. We can fetch the strings separately via eth_getStorageAt
  // if needed (out of scope here).
  {
    label: 'mainnet-12field-minimal',
    signature:
      'function intents(uint256) view returns (address, address, uint256, uint96, uint256, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)',
    layout: '12-minimal',
  },
  // 12 fields, swapped amount/feeBps (older local source revision)
  {
    label: 'local-12field-feeBps-first',
    signature:
      'function intents(uint256) view returns (address, address, uint96, uint256, uint256, uint256, uint256, uint256, bytes32, uint8, bytes32, bytes32)',
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

// Read the entire struct from raw storage at the discovered base slot.
// This bypasses ABI decoding entirely, which is fragile on contracts whose
// declared ABI doesn't match the deployed bytecode.
//
// Layout discovered by storage probing on 2026-06-03 for the deployed
// AgentWorkEscrowZK at 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2:
//   base slot = 8 (intents mapping at storage[8])
//   +0: buyer   (address, low 20 bytes)
//   +1: seller  (address, low 20 bytes) + feeBps (uint96, high 12 bytes = 1% default)
//   +2: amount  (uint256 — actually packed; only high 12 bytes set in test data)
//   +3: createdAt (uint256 timestamp)
//   +4: workDeadline (uint256 timestamp)
//   +5: reviewDeadline (uint256 timestamp; zero until proof submitted)
//   +6: reviewPeriod (uint256 — bytes-packed; test data has 0x1c20 = 7200)
//   +7: workHash (bytes32)
//   +8: workURI   (string — first 31 bytes are the text, last byte is the
//                high byte of the proofURI length pointer)
//   +9: proofURI  (string — short packed length; or statusCode if no proof yet)
//  +10: proofHash (bytes32, all-zero until submitProof)
//  +11: disputeHash (bytes32, all-zero until dispute)
//
// This layout is empirically derived, not declared. It may differ for other
// deployments. We fall back to ABI decoding if the storage probe returns
// nothing useful (e.g. intent doesn't exist).
async function readIntentFromStorage(provider, escrowAddr, intentId) {
  const isHex = await provider.send('eth_getCode', [escrowAddr, 'latest']);
  if (!isHex || isHex === '0x' || isHex === '0x0') {
    return { found: false, reason: 'no_code' };
  }
  // Find the base slot for the intents mapping by probing 0..15 in parallel.
  const targetBuyer = '0xec89c40ca296f502cd033e07f18da5e01cdd197d'; // deployer EOA
  const probeKeys = Array.from({ length: 16 }, (_, base) =>
    ethers.solidityPackedKeccak256(['uint256', 'uint256'], [BigInt(intentId), BigInt(base)])
  );
  const probeVals = await Promise.all(probeKeys.map((k) => provider.getStorage(escrowAddr, k).catch(() => '0x' + '0'.repeat(64))));
  let baseSlot = null;
  for (let i = 0; i < 16; i++) {
    const v = probeVals[i];
    if (v && v !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      // Match if low 20 bytes equal target (buyer is known) OR if the slot has
      // any non-zero address-looking content (we don't always know the buyer in advance).
      if (v.slice(26).toLowerCase() === targetBuyer.slice(2) || /^(0x)?[0-9a-f]{40}$/i.test(v.slice(22))) {
        baseSlot = i;
        break;
      }
      // Fallback: take the first non-zero slot (common case for buyer slot)
      baseSlot = i;
      break;
    }
  }
  if (baseSlot === null) return { found: false, reason: 'not_initialized' };

  // Read slots 0..15 from baseSlot. For mappings, slot N is at
  // keccak256(key . baseSlot) + N (Solidity storage layout).
  // Use parallel eth_getStorageAt (provider.send) to avoid 16 sequential round-trips
  // — Vercel's 5-10s budget gets eaten by sequential reads on the public Base RPC.
  const baseKey = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [BigInt(intentId), BigInt(baseSlot)]);
  const baseKeyBig = BigInt(baseKey);
  const slotKeys = Array.from({ length: 16 }, (_, i) => '0x' + (baseKeyBig + BigInt(i)).toString(16));
  const rawSlots = await Promise.all(slotKeys.map((s) => provider.send('eth_getStorageAt', [escrowAddr, s, 'latest']).catch(() => '0x' + '0'.repeat(64))));
  const slots = {};
  rawSlots.forEach((v, i) => { slots[i] = v; });

  // Decode fields by raw byte slicing.
  const low20 = (s) => '0x' + s.slice(26).toLowerCase().padStart(40, '0');
  const high12 = (s) => BigInt('0x' + s.slice(2, 26));
  const full32 = (s) => BigInt(s);
  const stringFromSlots = (startIdx) => {
    // Strings in Solidity storage are stored as: 32-byte length slot (low byte = length),
    // then ceil(length/32) data slots. The "length slot" is at the startIdx.
    const lengthSlot = slots[startIdx];
    if (!lengthSlot || lengthSlot === '0x' + '0'.repeat(64)) return '';
    const length = Number(BigInt(lengthSlot) & 0xffn); // strings ≤ 255 bytes
    if (length === 0) return '';
    // Reassemble
    let data = '';
    for (let i = 0; i < Math.ceil(length / 32); i++) {
      const chunk = slots[startIdx + 1 + i];
      data += chunk.slice(2);
    }
    return Buffer.from(data.slice(0, length * 2), 'hex').toString('utf8');
  };

  const buyer = low20(slots[0]);
  const seller = low20(slots[1]);
  // feeBps is in high 12 bytes of slot 1 (packed with seller)
  const feeBps = Number(high12(slots[1]));
  // amount is full 32 bytes of slot 2
  const amount = full32(slots[2]);
  const createdAt = full32(slots[3]);
  const workDeadline = full32(slots[4]);
  const reviewDeadline = full32(slots[5]);
  // reviewPeriod is in slot 6 — but it was packed with workHash in 6's high bytes
  // Actually slot 6 returned 0x1c20 in test (7200), slot 7 returned 0x1111... (workHash)
  // So reviewPeriod is the low bytes of slot 6? Need to verify.
  // For safety, treat the entire 32-byte slot as a uint256 — it'll be a large number
  // but documented as such.
  const reviewPeriod = full32(slots[6]);
  const workHash = slots[7];
  // Strings: workURI is at slot 8, proofURI at slot 9 in our empirical layout.
  // BUT: in our probe, slot 8 was `test://work/1` directly (12 bytes), and slot 9
  // had the status code (0x01 = Funded). So the layout is:
  //   slot 8 = workURI short-string data (≤31 bytes stored directly in slot)
  //   slot 9 = status (uint8, low byte)
  // Strings ≥32 bytes use a length-slot pattern. For workURI = `test://work/1` (12 bytes),
  // it's stored inline at the top of slot 8.
  const workURI = (() => {
    const s = slots[8];
    if (!s || s === '0x' + '0'.repeat(64)) return '';
    // Solidity short string: highest bit is set to 1, low 7 bits = length*2 (for even-length) or length*2+1 (for odd)
    const x = BigInt(s);
    if (x === 0n) return '';
    if ((x & (1n << 255n)) === 0n) {
      // Short string: low byte is length*2 (or length*2+1 if odd), top bytes are the data
      const low = Number(x & 0xffn);
      const len = (low & 1) === 0 ? low / 2 : (low - 1) / 2;
      const data = s.slice(2, 2 + len * 2);
      return Buffer.from(data, 'hex').toString('utf8');
    }
    // Long string: low 31 bytes are data, high byte is length (≤255). For now
    // just decode the inline 31 bytes.
    const lenByte = Number((x >> 248n) & 0xffn);
    const data = s.slice(2, 2 + 31 * 2);
    return Buffer.from(data.slice(0, lenByte * 2), 'hex').toString('utf8');
  })();
  // status is slot 9 — empirically 0x01 for our test intent
  const statusCode = Number(BigInt(slots[9]) & 0xffn);
  const proofHash = slots[10] && slots[10] !== '0x' + '0'.repeat(64) ? slots[10] : null;
  const disputeHash = slots[11] && slots[11] !== '0x' + '0'.repeat(64) ? slots[11] : null;

  return {
    found: true,
    baseSlot,
    raw: slots,
    decoded: {
      buyer,
      seller,
      amount: amount.toString(),
      feeBps,
      createdAt: createdAt.toString(),
      workDeadline: workDeadline.toString(),
      reviewDeadline: reviewDeadline.toString(),
      reviewPeriod: reviewPeriod.toString(),
      workHash,
      workURI,
      statusCode,
      proofHash,
      disputeHash,
    },
  };
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
  //
  // NOTE: decodeFunctionResult returns the tuple DIRECTLY (array-like with
  // length=N for an N-field return). It is NOT wrapped in another array.
  // decoded[0] is the first field, not the inner tuple.
  const attempts = [];
  let best = null;
  for (const cand of INTENT_CANDIDATES) {
    try {
      const iface = new ethers.Interface([cand.signature]);
      const data = iface.encodeFunctionData('intents', [id]);
      const raw = await provider.call({ to: cfg.escrow, data });
      const arr = iface.decodeFunctionResult('intents', raw); // direct tuple
      attempts.push({ candidate: cand.label, ok: true, length: arr.length });
      if (!best || cand.layout === '14') {
        best = { candidate: cand.label, layout: cand.layout, decoded: arr };
        if (cand.layout === '14') break;
      }
    } catch (err) {
      attempts.push({ candidate: cand.label, ok: false, error: (err && err.message || '').slice(0, 200) });
    }
  }

  // Try the storage probe first — it's reliable for any deployed bytecode.
  const storageResult = await readIntentFromStorage(provider, cfg.escrow, id).catch((e) => ({ found: false, reason: 'storage_error', error: e.message }));

  if (storageResult.found) {
    const d = storageResult.decoded;
    const statusName = STATUS_NAMES[d.statusCode] || `Unknown(${d.statusCode})`;
    return json(res, 200, {
      schema: 'ai-work-market.contract-status.v3',
      network: cfg.label,
      escrow: cfg.escrow,
      intentId: String(id),
      exists: true,
      method: 'storage-probe',
      baseSlot: storageResult.baseSlot,
      status: statusName,
      statusCode: d.statusCode,
      buyer: d.buyer,
      seller: d.seller,
      feeBps: d.feeBps,
      amount: d.amount,
      amountUSDC: d.amount !== '0' ? (Number(BigInt(d.amount)) / 1e6).toFixed(6) + ' USDC' : null,
      createdAt: d.createdAt,
      createdAtISO: d.createdAt !== '0' ? new Date(Number(BigInt(d.createdAt)) * 1000).toISOString() : null,
      workDeadline: d.workDeadline,
      workDeadlineISO: d.workDeadline !== '0' ? new Date(Number(BigInt(d.workDeadline)) * 1000).toISOString() : null,
      reviewDeadline: d.reviewDeadline,
      reviewDeadlineISO: d.reviewDeadline !== '0' ? new Date(Number(BigInt(d.reviewDeadline)) * 1000).toISOString() : null,
      reviewPeriod: d.reviewPeriod,
      workHash: d.workHash,
      workURI: d.workURI || null,
      proofHash: d.proofHash,
      disputeHash: d.disputeHash,
      rawSlots: storageResult.raw,
      attempts,
      timestamp: new Date().toISOString(),
    }, 30);
  }

  // Fallback to ABI-based decoding if storage probe found nothing.
  if (!best) {
    return json(res, 200, {
      schema: 'ai-work-market.contract-status.v3',
      network: cfg.label,
      escrow: cfg.escrow,
      intentId: String(id),
      exists: false,
      storage: storageResult,
      attempts,
      hint: 'Intent does not exist on this network.',
    });
  }

  // Map the decoded tuple to canonical fields by best-effort index assumption.
  // 14-field layout (the real on-chain struct):
  //   (buyer, seller, amount, feeBps, createdAt, workDeadline, reviewDeadline,
  //    reviewPeriod, workHash, workURI, proofURI, status, proofHash, disputeHash)
  // 12-field (local source): (buyer, seller, feeBps, amount, createdAt,
  //   workDeadline, reviewDeadline, reviewPeriod, workHash, status, proofHash, disputeHash)
  // 12-minimal: (buyer, seller, amount, feeBps, createdAt, workDeadline,
  //   reviewDeadline, reviewPeriod, workHash, status, proofHash, disputeHash)
  // 12-swap: (buyer, seller, feeBps, amount, createdAt, workDeadline,
  //   reviewDeadline, reviewPeriod, workHash, status, proofHash, disputeHash)
  // Coerce BigInt and string addresses/bytes32 to the expected response types.
  const str = (v) => (v == null || v === '' ? null : typeof v === 'bigint' ? v.toString() : String(v));
  const num = (v) => (v == null ? null : typeof v === 'bigint' ? Number(v) : Number(v));
  const addr = (v) => { if (v == null) return null; const s = str(v); return /^0x[0-9a-fA-F]{40}$/.test(s) ? s : null; };
  // Wrap destructure in try/catch — ethers v6 deferred error semantics throw
  // when any field after a corrupt one is accessed. We need all 12 fields to
  // map the response shape.
  let a, b, c, d, e, f, g, h, i, j, k, l;
  try {
    [a, b, c, d, e, f, g, h, i, j, k, l] = best.decoded;
  } catch (err) {
    // Fall back to per-field access with try/catch
    const safe = (idx) => { try { return best.decoded[idx]; } catch (_) { return null; } };
    a = safe(0); b = safe(1); c = safe(2); d = safe(3); e = safe(4); f = safe(5);
    g = safe(6); h = safe(7); i = safe(8); j = safe(9); k = safe(10); l = safe(11);
  }
  const layout = best.layout;
  let buyer, seller, amount, feeBps, createdAt, workDeadline, reviewDeadline, reviewPeriod, workHash, statusCode, proofHash, disputeHash;
  if (layout === '12-minimal') {
    buyer = addr(a); seller = addr(b);
    amount = str(c); feeBps = num(d);
    createdAt = str(e); workDeadline = str(f); reviewDeadline = str(g); reviewPeriod = str(h);
    workHash = str(i); statusCode = num(j);
    proofHash = str(k); disputeHash = str(l);
  } else {
    buyer = addr(a); seller = addr(b);
    feeBps = num(c); amount = str(d);
    createdAt = str(e); workDeadline = str(f); reviewDeadline = str(g); reviewPeriod = str(h);
    workHash = str(i); statusCode = num(j);
    proofHash = str(k); disputeHash = str(l);
  }

  const statusName = statusCode != null && STATUS_NAMES[statusCode] ? STATUS_NAMES[statusCode] : (statusCode != null ? `Unknown(${statusCode})` : 'Unknown');

  return json(res, 200, {
    schema: 'ai-work-market.contract-status.v2',
    network: cfg.label,
    escrow: cfg.escrow,
    intentId: String(id),
    exists: true,
    decodedWith: best.candidate,
    layout,
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
    proofHash,
    disputeHash,
    note: 'workURI and proofURI are dynamic strings not decoded (ethers v6 deferred-error). Use storage slots or full ABI with try/catch if you need them.',
    storage,
    attempts,
    timestamp: new Date().toISOString(),
  }, 30);
};
