// api/work-list.js
// Returns all open work intents on Base Mainnet, with the on-chain shape
// decoded from AgentWorkEscrowZK.intents(uint256). The Status enum is:
//   0 = None / not-set
//   1 = Funded
//   2 = Submitted
//   3 = Released (settled)
//   4 = Refunded
//   5 = Disputed
//   6 = Cancelled
// We only surface Status == 1 (Funded, open for sellers to claim) and
// we cap the scan at nextIntentId to avoid burning RPC.

const { ethers } = require('ethers');
const ESCROW = '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2';
const RPC = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';

const ESCROW_ABI = [
  'function nextIntentId() view returns (uint256)',
  'function intents(uint256) view returns (address buyer, address seller, uint96 feeBps, uint256 amount, uint256 createdAt, uint256 workDeadline, uint256 reviewDeadline, uint256 reviewPeriod, bytes32 workHash, string workURI, uint8 status, string proofURI, string disputeURI)',
];

const STATUS = ['None', 'Funded', 'Submitted', 'Released', 'Refunded', 'Disputed', 'Cancelled'];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=10, s-maxage=10');
  res.end(JSON.stringify(body, null, 2));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, provider);

  let nextIntentId;
  try { nextIntentId = await escrow.nextIntentId(); }
  catch (e) { return json(res, 502, { error: 'rpc_read_failed', message: e.message }); }

  const count = Number(nextIntentId);
  const MAX_SCAN = 100; // safety cap
  if (count > MAX_SCAN) {
    return json(res, 200, {
      schema: 'ai-work-market.work-list.v1',
      network: 'base-mainnet',
      chainId: 8453,
      totalIntents: count,
      openIntents: [],
      truncated: true,
      note: `nextIntentId=${count} exceeds scan cap of ${MAX_SCAN}. Use /api/contract-status?id=N for individual lookups.`,
    });
  }

  // Read each intent sequentially (Base caps eth_call batches at 10; for
  // typical <10 intents on mainnet this is fine, ~1-2s).
  const out = [];
  for (let i = 0; i < count; i++) {
    try {
      const r = await escrow.intents(BigInt(i));
      // ethers v6 returns a Result that quacks like an object.
      const s = Number(r.status);
      if (s !== 1) continue; // only surface open (Funded) intents
      out.push({
        intentId: i,
        buyer: r.buyer,
        seller: r.seller,
        feeBps: Number(r.feeBps),
        amountRaw: r.amount.toString(),
        amountUsdc: ethers.formatUnits(r.amount, 6),
        createdAt: Number(r.createdAt),
        workDeadline: Number(r.workDeadline),
        reviewDeadline: Number(r.reviewDeadline),
        reviewPeriod: Number(r.reviewPeriod),
        workHash: r.workHash,
        workURI: r.workURI,
        status: s,
        statusLabel: STATUS[s] || `unknown(${s})`,
        proofURI: r.proofURI || null,
        disputeURI: r.disputeURI || null,
      });
    } catch (_) {
      // Some intents may error on decode (e.g. removed); skip them.
    }
  }

  return json(res, 200, {
    schema: 'ai-work-market.work-list.v1',
    network: 'base-mainnet',
    chainId: 8453,
    totalIntents: count,
    openIntents: out,
    openCount: out.length,
    note: out.length === 0
      ? 'No open work orders on the live AWM contract right now. Post work at /post-work to create one.'
      : undefined,
  });
};
