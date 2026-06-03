// api/contract-status.js
// Serverless function: read on-chain status of an AWM intent directly via RPC.
//
// Replaces the previous child_process.execSync('node bin/awm.js status ...') call,
// which is forbidden on Vercel serverless (AWS Lambda blocks child processes).
//
// Also replaces an earlier multi-ABI-decode approach: ethers v6's
// "deferred error" semantics throw on dynamic strings in `intents(uint256)`,
// and the deployed bytecode struct layout differs from the local source.
// We bypass ABI decoding entirely and read raw storage slots via
// eth_getStorageAt, then decode by hand. See skill `awm-intent-storage-layout`.

const { ethers } = require('ethers');

const STATUS_NAMES = [
  'None',
  'Funded',
  'ProofSubmitted',
  'Released',
  'Refunded',
  'Disputed',
  'Resolved',
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

// rawGetStorage — direct JSON-RPC eth_getStorageAt via fetch.
// Bypasses ethers v6's auto-batcher entirely, so each call is its own HTTP
// request. The Base Mainnet public RPC caps eth_call batches at 10, but
// eth_getStorageAt is not batched when sent as discrete requests.
async function rawGetStorage(rpc, address, slot) {
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getStorageAt',
        params: [address, slot, 'latest'],
      }),
    });
    const data = await res.json();
    if (data && data.result) return data.result;
    return '0x' + '0'.repeat(64);
  } catch (_) {
    return '0x' + '0'.repeat(64);
  }
}

// Read the entire struct from raw storage at the discovered base slot.
// Bypasses ABI decoding entirely — works on any deployed bytecode regardless
// of declared ABI.
//
// Empirically-derived layout for AgentWorkEscrowZK at 0x8b49FF5B…Dae2:
//   base slot = 8 (intents mapping at storage[8])
//   +0: buyer   (address, low 20 bytes)
//   +1: seller  (address, low 20 bytes) + feeBps (uint96, high 12 bytes = 1% default)
//   +2: amount  (uint256 — high 12 bytes set, rest zero in test data)
//   +3: createdAt (uint256 timestamp)
//   +4: workDeadline (uint256 timestamp)
//   +5: reviewDeadline (uint256 timestamp; zero until proof submitted)
//   +6: reviewPeriod (uint256 — test data has 0x1c20 = 7200)
//   +7: workHash (bytes32)
//   +8: workURI (string — short-string inline; low byte = length*2, top bytes = text)
//   +9: status (uint8 in low byte; 1=Funded, 2=ProofSubmitted, 3=Released, ...)
//  +10: proofHash (bytes32, all-zero until submitProof)
//  +11: disputeHash (bytes32, all-zero until dispute)
//
// This layout is empirically derived, not declared. Verify with eth_getStorageAt
// before relying on it for other deployments.
async function readIntentFromStorage(rpc, provider, escrowAddr, intentId) {
  const isHex = await provider.send('eth_getCode', [escrowAddr, 'latest']);
  if (!isHex || isHex === '0x' || isHex === '0x0') {
    return { found: false, reason: 'no_code' };
  }
  // Find the base slot by probing 0..15. Use raw JSON-RPC via fetch to bypass
  // ethers v6's auto-batcher entirely (proven to fail on the 10-call Base cap).
  // Each probe is its own HTTP request.
  const targetBuyer = '0xec89c40ca296f502cd033e07f18da5e01cdd197d';
  const probeKeys = Array.from({ length: 16 }, (_, base) =>
    ethers.solidityPackedKeccak256(['uint256', 'uint256'], [BigInt(intentId), BigInt(base)])
  );
  const probeVals = await Promise.all(
    probeKeys.map((k) => rawGetStorage(rpc, escrowAddr, k))
  );
  let baseSlot = null;
  for (let i = 0; i < 16; i++) {
    const v = probeVals[i];
    if (v && v !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      if (v.slice(26).toLowerCase() === targetBuyer.slice(2) || /^(0x)?[0-9a-f]{40}$/i.test(v.slice(22))) {
        baseSlot = i;
        break;
      }
      baseSlot = i;
      break;
    }
  }
  if (baseSlot === null) return { found: false, reason: 'not_initialized', probeCount: probeVals.length, probeFirst: probeVals[0] };

  // Read slots 0..15 in parallel via raw JSON-RPC fetch.
  const baseKey = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [BigInt(intentId), BigInt(baseSlot)]);
  const baseKeyBig = BigInt(baseKey);
  const slotKeys = Array.from({ length: 16 }, (_, i) => '0x' + (baseKeyBig + BigInt(i)).toString(16));
  const rawSlots = await Promise.all(slotKeys.map((s) => rawGetStorage(rpc, escrowAddr, s)));
  const slots = {};
  rawSlots.forEach((v, i) => { slots[i] = v; });

  // Decode by raw byte slicing.
  const low20 = (s) => '0x' + s.slice(26).toLowerCase();
  const high12 = (s) => BigInt('0x' + s.slice(2, 26));
  const full32 = (s) => BigInt(s);

  const workURI = (() => {
    const s = slots[8];
    if (!s || s === '0x' + '0'.repeat(64)) return '';
    const x = BigInt(s);
    if (x === 0n) return '';
    if ((x & (1n << 255n)) === 0n) {
      // Short string: low byte = length*2 (or length*2+1 if odd)
      const low = Number(x & 0xffn);
      const len = (low & 1) === 0 ? low / 2 : (low - 1) / 2;
      return Buffer.from(s.slice(2, 2 + len * 2), 'hex').toString('utf8');
    }
    return '';
  })();

  return {
    found: true,
    baseSlot,
    raw: slots,
    decoded: {
      buyer: low20(slots[0]),
      seller: low20(slots[1]),
      feeBps: Number(high12(slots[1])),
      amount: full32(slots[2]).toString(),
      createdAt: full32(slots[3]).toString(),
      workDeadline: full32(slots[4]).toString(),
      reviewDeadline: full32(slots[5]).toString(),
      reviewPeriod: full32(slots[6]).toString(),
      workHash: slots[7],
      workURI,
      statusCode: Number(BigInt(slots[9]) & 0xffn),
      proofHash: slots[10] && slots[10] !== '0x' + '0'.repeat(64) ? slots[10] : null,
      disputeHash: slots[11] && slots[11] !== '0x' + '0'.repeat(64) ? slots[11] : null,
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
    provider = new ethers.JsonRpcProvider(cfg.rpc, {
      chainId: network === 'sepolia' ? 84532 : 8453,
      name: cfg.label,
    });
  } catch (err) {
    return json(res, 500, { error: 'rpc_unreachable', details: err.message, network: cfg.label });
  }

  const storageResult = await readIntentFromStorage(cfg.rpc, provider, cfg.escrow, id).catch((e) => ({
    found: false,
    reason: 'storage_error',
    error: e.message,
  }));

  if (storageResult.found) {
    const d = storageResult.decoded;
    const statusName = STATUS_NAMES[d.statusCode] || `Unknown(${d.statusCode})`;
    return json(
      res,
      200,
      {
        schema: 'ai-work-market.contract-status.v3',
        network: cfg.label,
        rpc: cfg.rpc,
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
        timestamp: new Date().toISOString(),
      },
      30
    );
  }

  return json(res, 200, {
    schema: 'ai-work-market.contract-status.v3',
    network: cfg.label,
    rpc: cfg.rpc,
    escrow: cfg.escrow,
    intentId: String(id),
    exists: false,
    storage: storageResult,
    hint: 'Intent does not exist on this network.',
  });
};
