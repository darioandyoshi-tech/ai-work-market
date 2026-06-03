// api/agent-reputation.js
// Server-side reputation for a given seller address, computed by indexing the
// `Released`, `Refunded`, and `Disputed` events from the escrow contract over
// the last N blocks. No auth, read-only, cached for 60s.
//
// Why server-side (not a contract):
//   - AgentRegistry.sol doesn't compile and isn't deployed
//   - Computing reputation from events is enough for an MVP
//   - When the on-chain reputation system lands, this endpoint will switch
//     sources transparently — the response shape is the same.

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    chainId: 8453,
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
  sepolia: {
    label: 'base-sepolia',
    chainId: 84532,
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow: '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
};

const ESCROW_ABI = [
  'event IntentCreated(uint256 indexed intentId, address indexed buyer, address indexed seller, uint256 amount, bytes32 workHash, string workURI)',
  'event ProofSubmitted(uint256 indexed intentId, string proofURI, uint256 reviewDeadline)',
  'event Released(uint256 indexed intentId, address indexed seller, uint256 sellerAmount, uint256 feeAmount)',
  'event Refunded(uint256 indexed intentId, address indexed buyer, uint256 amount)',
  'event Disputed(uint256 indexed intentId, address indexed disputer, uint256 fee)',
  'event Resolved(uint256 indexed intentId, bool releasedToSeller)',
];

function json(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function isAddress(s) {
  return typeof s === 'string' && ethers.isAddress(s);
}

// Compute the topic for filtering events by seller. IntentCreated has seller
// as the third indexed arg, so topic[2] is keccak256(padded address).
function padAddress(addr) {
  return '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const address = String((req.query && req.query.address) || '').trim();
  if (!isAddress(address)) {
    return json(res, 400, {
      error: 'invalid_address',
      hint: 'Use ?address=0x...',
    });
  }

  const net = String((req.query && req.query.network) || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];
  const windowBlocks = Math.min(50000, Math.max(1000, parseInt(String(req.query.window || '10000'), 10) || 10000));

  let provider;
  try {
    provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId);
  } catch (e) {
    return json(res, 500, { error: 'rpc_unreachable', details: e.message });
  }

  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  const sellerTopic = padAddress(address);

  const head = await provider.getBlockNumber();
  const fromBlock = Math.max(0, head - windowBlocks);

  // Scan the last N blocks for events on this escrow where the seller topic
  // matches. We use the 3-event scan:
  //   IntentCreated:   topic[2] = seller  → count total created (as seller)
  //   Released:        topic[1] = seller  → count successful releases
  //   Refunded:        topic[1] = buyer, but we still need the seller. Since
  //                    Refunded doesn't index the seller, we infer it via the
  //                    matching intentId from IntentCreated.
  // For an MVP this is approximate. The honest answer is "see /api/contract-status
  // for a per-intent deep dive" — this is the aggregate view.

  // Strategy: fetch all 3 event types in the window (they're cheap), then build
  // a per-intent state machine in-memory.
  const [created, released, refunded, disputed, resolved] = await Promise.all([
    escrow.queryFilter(escrow.filters.IntentCreated(null, null, address), fromBlock, head).catch((e) => ({ error: e.message })),
    escrow.queryFilter(escrow.filters.Released(null, address), fromBlock, head).catch((e) => ({ error: e.message })),
    escrow.queryFilter(escrow.filters.Refunded(), fromBlock, head).catch((e) => ({ error: e.message })),
    escrow.queryFilter(escrow.filters.Disputed(), fromBlock, head).catch((e) => ({ error: e.message })),
    escrow.queryFilter(escrow.filters.Resolved(), fromBlock, head).catch((e) => ({ error: e.message })),
  ]);

  const errs = [];
  for (const [name, r] of [['created', created], ['released', released], ['refunded', refunded], ['disputed', disputed], ['resolved', resolved]]) {
    if (r && r.error) errs.push(`${name}: ${r.error}`);
  }

  // Per-intent state. We start with a set of intentIds where the seller == address.
  // Then for each Released event with seller == address, mark that intent successful.
  // For each Refunded event, we need to look up the seller — since we have all the
  // created events, we can map intentId -> seller in this window.
  const sellerByIntent = new Map();
  const successfulIntents = new Set();
  const refundedIntents = new Set();
  const disputedIntents = new Set();
  const resolvedIntents = new Set();

  if (Array.isArray(created)) {
    for (const e of created) {
      const id = Number(e.args.intentId);
      sellerByIntent.set(id, e.args.seller.toLowerCase());
    }
  }
  if (Array.isArray(released)) {
    for (const e of released) {
      successfulIntents.add(Number(e.args.intentId));
    }
  }
  if (Array.isArray(refunded)) {
    for (const e of refunded) {
      const id = Number(e.args.intentId);
      // Only count as "this seller was refunded" if the seller on the intent is us
      if (sellerByIntent.get(id) === address.toLowerCase()) {
        refundedIntents.add(id);
      }
    }
  }
  if (Array.isArray(disputed)) {
    for (const e of disputed) {
      const id = Number(e.args.intentId);
      if (sellerByIntent.get(id) === address.toLowerCase()) {
        disputedIntents.add(id);
      }
    }
  }
  if (Array.isArray(resolved)) {
    for (const e of resolved) {
      const id = Number(e.args.intentId);
      if (sellerByIntent.get(id) === address.toLowerCase()) {
        resolvedIntents.add(id);
      }
    }
  }

  const totalIntentsAsSeller = sellerByIntent.size;
  const completed = successfulIntents.size;
  const refundCount = refundedIntents.size;
  const disputeCount = disputedIntents.size;
  const resolveCount = resolvedIntents.size;

  // Reputation score: 0-1000, weighted. Successful +5, refunded -10, disputed -2, resolved -1.
  const score = Math.max(0, Math.min(1000, 500 + completed * 5 - refundCount * 10 - disputeCount * 2 - resolveCount * 1));

  // Total earned (sum of sellerAmount from Released events)
  let totalEarnedRaw = 0n;
  if (Array.isArray(released)) {
    for (const e of released) {
      try {
        const sellerAmount = e.args.sellerAmount || e.args[2];
        if (sellerAmount) totalEarnedRaw += BigInt(sellerAmount.toString());
      } catch (_) { /* ignore */ }
    }
  }
  const totalEarnedUsdc = (Number(totalEarnedRaw) / 1e6).toFixed(6);

  return json(res, 200, {
    schema: 'ai-work-market.agent-reputation.v1',
    generatedAt: new Date().toISOString(),
    network: cfg.label,
    chainId: cfg.chainId,
    escrow: cfg.escrow,
    address: address.toLowerCase(),
    window: { fromBlock, toBlock: head, blocks: windowBlocks },
    reputation: {
      score,
      totalIntentsAsSeller,
      completed,
      refunded: refundCount,
      disputed: disputeCount,
      resolved: resolveCount,
      totalEarnedRaw: totalEarnedRaw.toString(),
      totalEarnedUsdc,
      notes: errs.length > 0 ? 'Partial — some event queries failed; counts above are best-effort.' : 'OK',
      queryErrors: errs,
    },
    sample: {
      intentIdsAsSeller: Array.from(sellerByIntent.keys()).slice(-20).reverse(),
      successfulIntentIds: Array.from(successfulIntents).slice(-20).reverse(),
      refundedIntentIds: Array.from(refundedIntents).slice(-20).reverse(),
      disputedIntentIds: Array.from(disputedIntents).slice(-20).reverse(),
    },
    caveats: [
      'Reputation is computed from the last N blocks only (default 10000, max 50000). Older history is not counted.',
      'Refunded/Disputed/Resolved events are only attributed to this seller if the matching IntentCreated event is in the same window.',
      'For a full audit, call /api/contract-status?id=<n> for each intentId in the sample.',
    ],
  }, 60);
};
