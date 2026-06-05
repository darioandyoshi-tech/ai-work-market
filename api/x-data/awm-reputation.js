// api/x-data/awm-reputation.js
// x402-paid AWM agent reputation lookup. Wraps the existing on-chain reputation
// index for any agent. $0.005 per call. USDC.
//
// Usage:
//   curl -s "https://ai-work-market.ai/api/x-data/awm-reputation?address=0x..."
//     -> 402 with payment
//   -> { ok, agent: { address, reputation, intentsAsSeller, intentsAsBuyer, ... }, payment }

const { withX402 } = require('../_x402-gate');
const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow: process.env.ESCROW_ADDRESS_SEPOLIA || '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
};

const REPUTATION_ABI = [
  'function reputation(address) view returns (uint256)',
  'function getAgentStats(address) view returns (uint256 score, uint256 intentsAsSeller, uint256 intentsAsBuyer, uint256 completedAsSeller, uint256 completedAsBuyer, uint256 disputed, uint256 firstSeenAt, uint256 lastActivityAt)',
];

const handler = withX402(
  {
    price: '$0.005',
    network: 'sepolia',
    description: 'AWM agent reputation. Returns on-chain reputation score, completed intents as buyer/seller, dispute count, first/last activity. $0.005 per call.',
    extra: { category: 'awm', tags: ['awm', 'reputation', 'agent'] },
  },
  async (req, _res, payment) => {
    const url = new URL(req.url, 'https://x');
    const address = url.searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { error: 'bad_address', hint: 'Pass ?address=0x... (40-hex EVM address)', ...payment };
    }
    const network = (url.searchParams.get('network') || 'mainnet').toLowerCase();
    if (!NETWORKS[network]) {
      return { error: 'unknown_network', validNetworks: Object.keys(NETWORKS), ...payment };
    }
    try {
      const provider = new ethers.JsonRpcProvider(NETWORKS[network].rpc, network === 'mainnet' ? 8453 : 84532);
      const contract = new ethers.Contract(NETWORKS[network].escrow, REPUTATION_ABI, provider);

      // Try the rich stats first; fall back to just reputation(address)
      let stats = null;
      try {
        const r = await contract.getAgentStats(address);
        stats = {
          reputationScore: Number(r.score),
          intentsAsSeller: Number(r.intentsAsSeller),
          intentsAsBuyer: Number(r.intentsAsBuyer),
          completedAsSeller: Number(r.completedAsSeller),
          completedAsBuyer: Number(r.completedAsBuyer),
          disputed: Number(r.disputed),
          firstSeenAt: r.firstSeenAt > 0n ? new Date(Number(r.firstSeenAt) * 1000).toISOString() : null,
          lastActivityAt: r.lastActivityAt > 0n ? new Date(Number(r.lastActivityAt) * 1000).toISOString() : null,
        };
      } catch (_) {
        // Fallback: just reputation(address)
        const r = await contract.reputation(address);
        stats = { reputationScore: Number(r) };
      }

      return {
        ok: true,
        network: NETWORKS[network].label,
        escrow: NETWORKS[network].escrow,
        agent: { address, ...stats },
        payment,
      };
    } catch (e) {
      return { error: 'rpc_failed', message: e.message, ...payment };
    }
  }
);

module.exports = handler;
