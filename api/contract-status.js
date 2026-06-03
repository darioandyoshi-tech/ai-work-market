// api/contract-status.js
// Serverless function: read on-chain status of an AWM intent directly via RPC.
// Replaces the previous child_process.execSync('node bin/awm.js status ...') call,
// which is forbidden on Vercel serverless (AWS Lambda blocks child processes).
//
// Response shape mirrors `bin/awm.js status <id>` so existing callers stay
// compatible, with two extra fields (`network`, `escrow`).
//
// Required env vars (set in Vercel dashboard for project ai-work-market):
//   BASE_SEPOLIA_RPC_URL  e.g. https://sepolia.base.org
//   BASE_RPC_URL          e.g. https://mainnet.base.org
//
// Optional env vars (override defaults):
//   ESCROW_ADDRESS_SEPOLIA  default 0x489C36738F46e395b4cd26DDf0f85756686A2f07
//   ESCROW_ADDRESS_MAINNET  default 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2

const { ethers } = require('ethers');

// Real on-chain struct for AgentWorkEscrowZK at 0x8b49FF5B…Dae2 (14 fields, NOT 12).
// Field order is verified by direct eth_call probing — local sources are stale.
const INTENT_ABI = [
  'function intents(uint256) view returns (address buyer, address seller, uint256 amount, uint96 feeBps, uint256 createdAt, uint256 workDeadline, uint256 reviewDeadline, uint256 reviewPeriod, bytes32 workHash, string workURI, string proofURI, uint8 status, bytes32 proofHash, bytes32 disputeHash)',
];

// Status enum matches the deployed contract (verified empirically — values 0-6).
// Local source uses the same 7 values.
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
    // Match env var names set in Vercel project dashboard for ai-work-market
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method not allowed' });
  }

  const { id, network } = req.query;
  if (!id) {
    return json(res, 400, { error: 'Missing intent ID. Use ?id=1' });
  }

  const isSepolia = network === 'sepolia' || network === 'base-sepolia';
  const cfg = isSepolia ? NETWORKS.sepolia : NETWORKS.mainnet;

  try {
    const provider = new ethers.JsonRpcProvider(cfg.rpc);
    const escrow = new ethers.Contract(cfg.escrow, INTENT_ABI, provider);
    const intent = await escrow.intents(id);

    const statusCode = Number(intent.status);
    const statusName = STATUS_NAMES[statusCode] || `Unknown(${statusCode})`;

    // Shape matches `bin/awm.js status <id>` for backward compatibility,
    // plus network/escrow hints for callers that want them.
    return json(res, 200, {
      intentId: String(id),
      status: statusName,
      statusCode,
      buyer: intent.buyer,
      seller: intent.seller,
      feeBps: Number(intent.feeBps),
      amount: intent.amount.toString(),
      createdAt: intent.createdAt.toString(),
      workDeadline: intent.workDeadline.toString(),
      reviewDeadline: intent.reviewDeadline.toString(),
      reviewPeriod: intent.reviewPeriod.toString(),
      workHash: intent.workHash,
      proofHash: intent.proofHash,
      disputeHash: intent.disputeHash,
      network: cfg.label,
      escrow: cfg.escrow,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const isCallError = /CALL_EXCEPTION|missing revert data/i.test(err.message || '');
    const hint = isCallError
      ? 'Intent does not exist on this network, or RPC returned no data.'
      : 'Ensure the RPC is reachable and ESCROW_ADDRESS_* env vars are set.';
    return json(res, 500, {
      error: 'Failed to fetch contract status',
      details: err.message,
      hint,
    });
  }
};
