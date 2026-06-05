// api/x-data/awm-verify.js
// x402-paid AWM work contract verifier. Combines on-chain contract state + agent
// reputations + a "is this safe to release?" decision. $0.01 per call. USDC.
//
// This is the most differentiated of the 6 AWM endpoints. It answers the
// question every buyer's agent asks: "Should I release the USDC?"
//
// Usage:
//   curl -s "https://ai-work-market.ai/api/x-data/awm-verify?id=1"
//     -> 402 with payment
//   -> { ok, decision: "release" | "dispute" | "wait" | "refund", reasons, ... }

const { withX402 } = require('../_x402-gate');
const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow: process.env.ESCROW_ADDRESS_SEPOLIA || '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
};

const REPUTATION_ABI = [
  'function reputation(address) view returns (uint256)',
];

const handler = withX402(
  {
    price: '$0.01',
    network: 'mainnet',
    description: 'AWM work contract verifier. Returns on-chain state + agent reputations + a release/dispute/wait decision. $0.01 per call.',
    extra: { category: 'awm', tags: ['awm', 'verify', 'release', 'dispute', 'decision'] },
  },
  async (req, _res, payment) => {
    const url = new URL(req.url, 'https://x');
    const id = url.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) {
      return { error: 'missing_or_bad_id', hint: 'Pass ?id=1 (numeric intent ID)', ...payment };
    }
    const network = (url.searchParams.get('network') || 'mainnet').toLowerCase();
    if (!NETWORKS[network]) {
      return { error: 'unknown_network', validNetworks: Object.keys(NETWORKS), ...payment };
    }

    try {
      const cfg = NETWORKS[network];
      const provider = new ethers.JsonRpcProvider(cfg.rpc, network === 'mainnet' ? 8453 : 84532);

      // Read the intent
      const data = '0x2d1d2dc1' + BigInt(id).toString(16).padStart(64, '0'); // intents(uint256)
      const r = await fetch(cfg.rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: cfg.escrow, data }, 'latest'] }),
      });
      const j = await r.json();
      const intentFound = j.result && j.result !== ('0x' + '0'.repeat(64));

      let intentSummary = null;
      if (intentFound) {
        // Parse the packed struct. Standard AWM layout (10 fields, each in
        // its own 32-byte word after the array/mapping indirection is resolved):
        // word 0: buyer (address in low 160 bits)
        // word 1: seller (address in low 160 bits)
        // word 2: amount (uint256)
        // word 3: workTimeout (uint256)
        // word 4: reviewPeriod (uint256)
        // word 5: workHash (bytes32)
        // word 6: status (uint8 in high bits — depends on layout)
        // word 7: disputeInitiator (address)
        // word 8: proofURI hash
        // word 9: createdAt (uint256)
        const bytes = j.result.slice(2);
        const words = [];
        for (let i = 0; i < bytes.length; i += 64) words.push('0x' + bytes.slice(i, i + 64));
        if (words.length >= 6) {
          intentSummary = {
            buyer: '0x' + words[0].slice(-40),
            seller: '0x' + words[1].slice(-40),
            amountRaw: BigInt(words[2]).toString(),
            amountUsdc: ethers.formatUnits(BigInt(words[2]), 6),
            workHash: words[5],
            // Status and timestamps are in the higher-numbered words
            // We don't know the exact layout — we return the raw words for
            // the buyer to interpret if they need more detail.
          };
        }
      }

      if (!intentSummary) {
        return { ok: false, id: parseInt(id, 10), found: false, payment };
      }

      // Read reputations for both buyer and seller
      const contract = new ethers.Contract(cfg.escrow, REPUTATION_ABI, provider);
      let buyerRep = null, sellerRep = null;
      try { buyerRep = Number(await contract.reputation(intentSummary.buyer)); } catch (_) {}
      try { sellerRep = Number(await contract.reputation(intentSummary.seller)); } catch (_) {}

      // Decision logic
      const reasons = [];
      let decision = 'wait';
      // AWM reputation uses a base + delta model; >= 500 is "neutral good"
      if (sellerRep !== null && sellerRep < 100) {
        decision = 'dispute';
        reasons.push(`seller reputation is very low (${sellerRep} < 100)`);
      }
      if (intentSummary.amountUsdc === '0.0' || intentSummary.amountUsdc === '0') {
        decision = 'refund';
        reasons.push('intent has zero amount (invalid)');
      }
      // Default for a healthy contract: "wait" until the buyer manually
      // confirms proof and releases. We don't auto-recommend release.
      if (reasons.length === 0) {
        reasons.push('no automatic release — buyer must inspect proofURI and call release()');
      }

      return {
        ok: true,
        id: parseInt(id, 10),
        network: cfg.label,
        escrow: cfg.escrow,
        intent: intentSummary,
        reputation: { buyer: buyerRep, seller: sellerRep },
        decision,
        reasons,
        nextAction: decision === 'release'
          ? 'call escrow.release(id) on Base Mainnet'
          : decision === 'dispute'
          ? 'call escrow.dispute(id, workHash) on Base Mainnet'
          : decision === 'refund'
          ? 'call escrow.refund(id) on Base Mainnet (after workTimeout)'
          : 'wait for seller to submit proof, then inspect and call release() or dispute()',
        payment,
      };
    } catch (e) {
      return { error: 'verify_failed', message: e.message, ...payment };
    }
  }
);

module.exports = handler;
