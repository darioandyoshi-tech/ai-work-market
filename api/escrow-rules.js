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

// MINIMAL ESCROW_ABI: only the view functions that ACTUALLY EXIST on the
// deployed bytecode. Verified 2026-06-04 via Sourcify full_match.
// We use `provider.call({ to, data })` + Interface.decodeFunctionResult
// below (bypassing ethers v6's auto-batcher), so each function needs to
// be in this array. Adding a function here that doesn't exist on-chain
// would silently produce an empty result — keep this list accurate.
const ESCROW_ABI = [
  'function defaultFeeBps() view returns (uint96)',
  'function owner() view returns (address)',
  'function feeRecipient() view returns (address)',
  'function zkVerifier() view returns (address)',
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
  // The Base Mainnet public RPC caps eth_call batches at 10, and ethers v6
  // auto-batches anything queued in the same microtask. We serialize the
  // reads to stay under the cap. (Cheap contract calls on Base; ~50ms each.)
  //
  // Verified 2026-06-03 against the deployed bytecode at 0x8b49FF5B…Dae2:
  // only these 4 view functions actually exist:
  //   - defaultFeeBps() returns (uint96) → 100  (1%)
  //   - owner() returns (address)        → Timelock
  //   - feeRecipient() returns (address) → 0xec89c40C…
  //   - zkVerifier() returns (address)   → 0xbEA159B9…5132
  // Other common getters (usdc, accumulatedFees, nextIntentId, paused,
  // workTimeout, reviewPeriod, disputeWindow) are NOT exposed by the
  // deployed bytecode. We hardcode the documented values from local source
  // and surface the gap explicitly in `rules.deployedGaps`.
  const DEPLOYED_GAPS = [
    'usdc — not exposed; using 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (Base Mainnet USDC) from local config',
    'accumulatedFees — not exposed; defaulting to null',
    'nextIntentId — not exposed; defaulting to null',
    'paused — not exposed; defaulting to null (treat as unpaused)',
    'workTimeout/reviewPeriod/disputeWindow/min/max/minDisputeFee — not exposed; using local source defaults',
  ];
  const DEFAULTS = {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    workTimeoutSeconds: 14 * 24 * 3600,         // 14 days
    reviewPeriodSeconds: 2 * 24 * 3600,         // 2 days
    disputeWindowSeconds: 7 * 24 * 3600,         // 7 days
    minWorkTimeoutSeconds: 24 * 3600,           // 1 day
    maxReviewPeriodSeconds: 14 * 24 * 3600,     // 14 days
    minDisputeFeeRaw: '10000',                   // 0.01 USDC (6 decimals)
  };
  // Use provider.call + interface.decodeFunctionResult to bypass ethers v6's
  // auto-batcher quirks. For the 7 view functions that exist on the deployed
  // bytecode, this is the most reliable way.
  const iface = new ethers.Interface(ESCROW_ABI);
  async function callDecoded(name) {
    try {
      const data = iface.encodeFunctionData(name, []);
      const raw = await provider.call({ to: cfg.escrow, data });
      const decoded = iface.decodeFunctionResult(name, raw);
      return decoded[0];
    } catch (e) {
      return { __err: (e && e.message || String(e)).slice(0, 200) };
    }
  }
  const feeBps        = { status: 'fulfilled', value: await callDecoded('defaultFeeBps') };
  const owner         = { status: 'fulfilled', value: await callDecoded('owner') };
  const feeRecipient  = { status: 'fulfilled', value: await callDecoded('feeRecipient') };
  const zkVerifier    = { status: 'fulfilled', value: await callDecoded('zkVerifier') };
  function asSettled(r) {
    if (r.value && r.value.__err) return { status: 'rejected', reason: new Error(r.value.__err) };
    return r;
  }
  const reads = [asSettled(feeBps), asSettled(owner), asSettled(feeRecipient), asSettled(zkVerifier)];
  const errFor = (r) => (r.status === 'rejected' ? (r.reason && r.reason.message || String(r.reason)).slice(0, 200) : null);

  // 0.01 USDC in raw units, used as the default minDisputeFee on the deployed
  // contract. Fall back to that if the RPC call fails.
  const usdcUnits = (raw) => raw != null ? (Number(raw) / 1e6).toFixed(6) + ' USDC' : null;

  // Time/bounds are hardcoded from DEFAULT_RULES because the deployed contract
  // doesn't expose them as getters (verified 2026-06-03: only defaultFeeBps,
  // owner, feeRecipient, zkVerifier, usdc, accumulatedFees, nextIntentId exist).
  const toOk = (r) => r.status === 'fulfilled' ? r.value : null;

  return json(res, 200, {
    schema: 'ai-work-market.escrow-rules.v1',
    generatedAt: new Date().toISOString(),
    network: cfg.label,
    chainId: cfg.chainId,
    escrow: cfg.escrow,
    rules: {
      feeBps: toOk(feeBps) != null ? Number(toOk(feeBps)) : null,
      feePercent: toOk(feeBps) != null ? (Number(toOk(feeBps)) / 100).toFixed(2) : null,
      feeRecipient: toOk(feeRecipient),
      owner: toOk(owner),
      usdc: DEFAULTS.usdc,
      zkVerifierConfigured: toOk(zkVerifier),
      zkReady: toOk(zkVerifier) != null && toOk(zkVerifier) !== ethers.ZeroAddress,
      accumulatedFeesRaw: null,
      accumulatedFees: null,
      nextIntentId: null,
      paused: null,

      // Hardcoded defaults from the deployed contract's source. The deployed
      // bytecode at 0x8b49FF5B…Dae2 doesn't expose these as getters, so we
      // surface the documented constants and mark the source.
      workTimeoutSeconds: DEFAULTS.workTimeoutSeconds,
      workTimeoutHours: (DEFAULTS.workTimeoutSeconds / 3600).toFixed(2),
      reviewPeriodSeconds: DEFAULTS.reviewPeriodSeconds,
      reviewPeriodHours: (DEFAULTS.reviewPeriodSeconds / 3600).toFixed(2),
      disputeWindowSeconds: DEFAULTS.disputeWindowSeconds,
      disputeWindowDays: (DEFAULTS.disputeWindowSeconds / 86400).toFixed(2),
      minWorkTimeoutSeconds: DEFAULTS.minWorkTimeoutSeconds,
      maxReviewPeriodSeconds: DEFAULTS.maxReviewPeriodSeconds,
      minDisputeFeeRaw: DEFAULTS.minDisputeFeeRaw,
      minDisputeFee: '0.010000 USDC',
      defaultsSource: 'hardcoded from local Solidity source (deployed contract does not expose these getters)',
      deployedGaps: DEPLOYED_GAPS,
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
        // usdc, accumulatedFees, nextIntentId are hardcoded (see DEPLOYED_GAPS).
      },
    },
  });
};
