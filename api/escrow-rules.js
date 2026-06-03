// api/escrow-rules.js
// Returns the contract semantics an agent needs to know before committing USDC.
// Pure read-only — no on-chain calls, no signing, no auth.
// Source of truth: the deployed AgentWorkEscrowZK at 0x8b49FF5B…Dae2 on Base Mainnet.
// If contract constants change, this is the file to update.

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
  'function defaultDisputeWindow() view returns (uint256)',
  'function defaultFeeBps() view returns (uint96)',
  'function defaultReviewPeriod() view returns (uint256)',
  'function defaultWorkTimeout() view returns (uint256)',
  'function minDisputeFee() view returns (uint256)',
  'function maxReviewPeriod() view returns (uint256)',
  'function minWorkTimeout() view returns (uint256)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function feeRecipient() view returns (address)',
  'function zkVerifier() view returns (address)',
  'function nextIntentId() view returns (uint256)',
  'function accumulatedFees() view returns (uint256)',
  'function usdc() view returns (address)',
];

// Plain-English summary of the lifecycle. Updated manually when the contract
// changes; matches the AgentWorkEscrowZK source.
const LIFECYCLE = {
  status: {
    0: 'None',
    1: 'Funded',
    2: 'ProofSubmitted',
    3: 'Released',
    4: 'Refunded',
    5: 'Disputed',
    6: 'Resolved',
  },
  transitions: [
    { from: 'None', to: 'Funded', actor: 'buyer', call: 'createIntent() or createIntentFromSignedOffer()' },
    { from: 'Funded', to: 'ProofSubmitted', actor: 'seller', call: 'submitProof() or submitProofWithZK()' },
    { from: 'ProofSubmitted', to: 'Released', actor: 'buyer', call: 'release()' },
    { from: 'ProofSubmitted', to: 'Released', actor: 'seller', call: 'claimAfterReview() — only after review deadline passes' },
    { from: 'Funded', to: 'Refunded', actor: 'buyer', call: 'refund() — only after workDeadline passes' },
    { from: 'ProofSubmitted', to: 'Disputed', actor: 'buyer', call: 'dispute(intentId) — pays minDisputeFee, opens dispute window' },
    { from: 'Disputed', to: 'Resolved', actor: 'owner (Timelock → Safe)', call: 'resolveDispute(intentId, releaseToSeller: bool)' },
  ],
};

function json(res, status, body, cacheSeconds = 30) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const net = String((req.query && req.query.network) || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  let provider;
  try {
    provider = new (require('ethers').JsonRpcProvider)(cfg.rpc, cfg.chainId);
  } catch (e) {
    return json(res, 500, { error: 'rpc_unreachable', details: e.message, network: cfg.label });
  }

  const { ethers } = require('ethers');
  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  // The Base Mainnet public RPC caps eth_call batches at 10. ethers v6's
  // auto-batcher groups every contract call in the same tick into one batch
  // regardless of how we structure our JS, so we have to actually await
  // between chunks to get them to be sent as separate requests.
  const [feeBps, workTimeout, reviewPeriod, disputeWindow, minDisputeFee, maxReview, minWork] = await Promise.allSettled([
    escrow.defaultFeeBps(),
    escrow.defaultWorkTimeout(),
    escrow.defaultReviewPeriod(),
    escrow.defaultDisputeWindow(),
    escrow.minDisputeFee(),
    escrow.maxReviewPeriod(),
    escrow.minWorkTimeout(),
  ]);
  // Force the auto-batcher to flush before issuing the second batch.
  await provider.getBlockNumber().catch(() => null);
  const [paused, feeRecipient, owner, zkVerifier, usdc] = await Promise.allSettled([
    escrow.paused(),
    escrow.feeRecipient(),
    escrow.owner(),
    escrow.zkVerifier(),
    escrow.usdc(),
  ]);
  const reads = [feeBps, workTimeout, reviewPeriod, disputeWindow, minDisputeFee, maxReview, minWork, paused, feeRecipient, owner, zkVerifier, usdc];
  const errFor = (r) => (r.status === 'rejected' ? (r.reason && r.reason.message || String(r.reason)).slice(0, 200) : null);

  // 0.01 USDC in raw units, used as the default minDisputeFee on the deployed
  // contract. Fall back to that if the RPC call fails.
  const usdcUnits = (raw) => raw != null ? (Number(raw) / 1e6).toFixed(6) + ' USDC' : null;

  return json(res, 200, {
    schema: 'ai-work-market.escrow-rules.v1',
    generatedAt: new Date().toISOString(),
    network: cfg.label,
    chainId: cfg.chainId,
    escrow: cfg.escrow,
    rules: {
      feeBps: feeBps.status === 'fulfilled' ? Number(feeBps.value) : null,
      feePercent: feeBps.status === 'fulfilled' ? (Number(feeBps.value) / 100).toFixed(2) : null,
      feeRecipient: feeRecipient.status === 'fulfilled' ? feeRecipient.value : null,
      owner: owner.status === 'fulfilled' ? owner.value : null,
      paused: paused.status === 'fulfilled' ? paused.value : null,
      usdc: usdc.status === 'fulfilled' ? usdc.value : null,
      zkVerifierConfigured: zkVerifier.status === 'fulfilled' ? zkVerifier.value : null,
      zkReady: zkVerifier.status === 'fulfilled' && zkVerifier.value !== ethers.ZeroAddress,

      // The four duration knobs an agent cares about
      workTimeoutSeconds: workTimeout.status === 'fulfilled' ? Number(workTimeout.value) : null,
      workTimeoutHours: workTimeout.status === 'fulfilled' ? (Number(workTimeout.value) / 3600).toFixed(2) : null,
      reviewPeriodSeconds: reviewPeriod.status === 'fulfilled' ? Number(reviewPeriod.value) : null,
      reviewPeriodHours: reviewPeriod.status === 'fulfilled' ? (Number(reviewPeriod.value) / 3600).toFixed(2) : null,
      disputeWindowSeconds: disputeWindow.status === 'fulfilled' ? Number(disputeWindow.value) : null,
      disputeWindowDays: disputeWindow.status === 'fulfilled' ? (Number(disputeWindow.value) / 86400).toFixed(2) : null,

      // Bounds
      minWorkTimeoutSeconds: minWork.status === 'fulfilled' ? Number(minWork.value) : null,
      maxReviewPeriodSeconds: maxReview.status === 'fulfilled' ? Number(maxReview.value) : null,
      minDisputeFeeRaw: minDisputeFee.status === 'fulfilled' ? minDisputeFee.value.toString() : null,
      minDisputeFee: minDisputeFee.status === 'fulfilled' ? usdcUnits(minDisputeFee.value) : '0.010000 USDC',
    },
    lifecycle: LIFECYCLE,
    failureModes: {
      buyerNoSeller: 'If no seller submitsProof() before workDeadline, buyer can refund() the full amount. No fee charged.',
      sellerNoBuyer: 'If buyer never calls release() or dispute() after proof, seller can claimAfterReview() after reviewDeadline. Seller receives amount minus fee.',
      dispute: 'If buyer calls dispute(intentId), the funds are locked and the owner (Timelock → Safe 2-of-3) must call resolveDispute(intentId, releaseToSeller) within disputeWindow. After the window, the funds are auto-released to the seller (current behavior; subject to upgrade).',
      paused: 'If contract is paused, all state-changing functions revert. The owner can pause. As an agent, check the `paused` field before posting work.',
      zkDown: 'If zkVerifier is unset or fails, submitProofWithZK() will revert. Fall back to submitProof() (no ZK) which always works.',
    },
    callGuides: {
      postWork: {
        call: 'createIntent(seller, amount, workTimeoutSeconds, reviewPeriodSeconds, workHash, workURI)',
        preconditions: [
          'Buyer has USDC balance >= amount',
          'Buyer has called usdc.approve(escrow, amount)',
          'amount is in raw USDC units (6 decimals) — 1 USDC = 1000000',
          'workURI is "ipfs://" or "https://" — anything `_validateIPFSURI` accepts',
        ],
        gasEstimate: '~180k gas for createIntent; ~65k for the matching approve()',
      },
      submitProof: {
        call: 'submitProof(intentId, proofURI)',
        preconditions: [
          'msg.sender == intent.seller',
          'intent.status == Funded',
          'block.timestamp < intent.workDeadline',
        ],
      },
      release: {
        call: 'release(intentId)',
        preconditions: [
          'intent.status == ProofSubmitted',
          'msg.sender == intent.buyer',
          'Auto-routes fee to feeRecipient',
        ],
      },
      claimAfterReview: {
        call: 'claimAfterReview(intentId)',
        preconditions: [
          'intent.status == ProofSubmitted',
          'block.timestamp > intent.reviewDeadline',
          'msg.sender == intent.seller',
          'Auto-routes fee to feeRecipient',
        ],
      },
      refund: {
        call: 'refund(intentId)',
        preconditions: [
          'intent.status == Funded',
          'block.timestamp > intent.workDeadline',
          'msg.sender == intent.buyer',
        ],
      },
    },
    health: {
      ok: feeBps.status === 'fulfilled' && feeRecipient.status === 'fulfilled',
      errors: {
        defaultFeeBps: errFor(feeBps),
        feeRecipient: errFor(feeRecipient),
        owner: errFor(owner),
        zkVerifier: errFor(zkVerifier),
        usdc: errFor(usdc),
      },
    },
  });
};
