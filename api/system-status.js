// /api/system-status — single source of truth for live AWM protocol state.
// Replaces the hardcoded "58 settlements, $0.00072 fees" copy that was sprinkled
// across the marketing site. Returns real on-chain reads from the deployed
// AgentWorkEscrowZK on Base Mainnet (with Sepolia fallback for testing).
//
// Output shape is stable and agent-friendly so other tools (the AWM MCP server,
// the .well-known/llm-feed, the monitor page) can consume it directly.
const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    chainId: 8453,
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    rpcFallbacks: [
      'https://base-rpc.publicnode.com',
      'https://base-mainnet.public.blastapi.io',
      'https://base.llamarpc.com',
      'https://1rpc.io/base',
    ].filter((u) => u !== (process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org')),
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
    usdc: process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    safe: '0x7f36896F6b6496B4E2fE95f672B3DAf28386b637',
    timelock: '0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967',
    zkVerifier: '0xbEA159B9982c790B872093736E54590bec295132',
    zkAdapter: '0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9',
    zkAdapterV2: null, // populated after deploy
  },
  sepolia: {
    label: 'base-sepolia',
    chainId: 84532,
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    rpcFallbacks: [
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.public.blastapi.io',
    ].filter((u) => u !== (process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org')),
    escrow: process.env.ESCROW_ADDRESS_SEPOLIA || '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    safe: '0x5979B6b1e96a7e75702291190C30DF0731C016f1',
    timelock: null,
    zkVerifier: null,
    zkAdapter: null,
    zkAdapterV2: null,
  },
};

// MINIMAL ESCROW_ABI: only the view functions that ACTUALLY EXIST on the
// deployed bytecode at 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2.
// Verified 2026-06-04 via Sourcify full_match (extract the ABI from
// https://repo.sourcify.dev/contracts/full_match/8453/<addr>/metadata.json).
// Adding a function here that doesn't exist on-chain would silently
// produce a null/empty result — keep this list accurate.
const ESCROW_ABI = [
  'function usdc() view returns (address)',
  'function feeRecipient() view returns (address)',
  'function owner() view returns (address)',
  'function nextIntentId() view returns (uint256)',
  'function accumulatedFees() view returns (uint256)',
  'function defaultFeeBps() view returns (uint96)',
  'function zkVerifier() view returns (address)',
];

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

const STATUS_NAMES = ['None', 'Funded', 'ProofSubmitted', 'Released', 'Refunded', 'Disputed', 'Resolved'];

function json(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store');
  res.setHeader('x-awm-source', 'api/system-status');
  res.end(JSON.stringify(body, null, 2));
}

function pickNetwork(req) {
  const q = String((req.query && req.query.network) || '').toLowerCase();
  if (q === 'sepolia' || q === 'base-sepolia' || q === 'testnet') return 'sepolia';
  return 'mainnet';
}

async function readProviderSnapshot(cfg) {
  // Build a chain of providers (primary + fallbacks). The first one that
  // returns a successful getBlockNumber is used for all reads. This handles
  // the Vercel outbound-IP flakiness where mainnet.base.org can return
  // "missing revert data" for a single call while a fallback RPC succeeds.
  const rpcs = [cfg.rpc, ...(cfg.rpcFallbacks || [])];
  let provider = null;
  for (const rpc of rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(rpc, cfg.chainId);
      // Quick liveness probe with a short timeout
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('rpc_timeout')), 4000)),
      ]);
      provider = p;
      break;
    } catch (_) {
      // try next RPC
    }
  }
  if (!provider) {
    throw new Error('all_rpcs_unreachable');
  }

  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  const usdc = new ethers.Contract(cfg.usdc, ERC20_ABI, provider);

  const results = await Promise.allSettled([
    escrow.nextIntentId(),
    escrow.accumulatedFees(),
    escrow.defaultFeeBps(),
    escrow.feeRecipient(),
    escrow.owner(),
    escrow.zkVerifier(),
    usdc.balanceOf(cfg.escrow),
    provider.getBlockNumber(),
  ]);

  const [
    nextIntentIdR, accumulatedFeesR, defaultFeeBpsR, feeRecipientR,
    ownerR, zkVerifierR, escrowUsdcR, blockR,
  ] = results;

  const errorFor = (r) => (r.status === 'rejected' ? String(r.reason && r.reason.message || r.reason) : null);

  return {
    nextIntentId: nextIntentIdR.status === 'fulfilled' ? Number(nextIntentIdR.value) : null,
    completedIntents: nextIntentIdR.status === 'fulfilled' ? Math.max(0, Number(nextIntentIdR.value) - 1) : null,
    accumulatedFeesRaw: accumulatedFeesR.status === 'fulfilled' ? accumulatedFeesR.value.toString() : null,
    defaultFeeBps: defaultFeeBpsR.status === 'fulfilled' ? Number(defaultFeeBpsR.value) : null,
    feeRecipient: feeRecipientR.status === 'fulfilled' ? feeRecipientR.value : null,
    owner: ownerR.status === 'fulfilled' ? ownerR.value : null,
    zkVerifier: zkVerifierR.status === 'fulfilled' ? zkVerifierR.value : null,
    escrowUsdcRaw: escrowUsdcR.status === 'fulfilled' ? escrowUsdcR.value.toString() : null,
    blockNumber: blockR.status === 'fulfilled' ? Number(blockR.value) : null,
    errors: {
      nextIntentId: errorFor(nextIntentIdR),
      accumulatedFees: errorFor(accumulatedFeesR),
      feeRecipient: errorFor(feeRecipientR),
      owner: errorFor(ownerR),
      zkVerifier: errorFor(zkVerifierR),
      escrowUsdc: errorFor(escrowUsdcR),
      block: errorFor(blockR),
    },
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const network = pickNetwork(req);
  const cfg = NETWORKS[network];
  const generatedAt = new Date().toISOString();

  try {
    const snapshot = await readProviderSnapshot(cfg);

    // Human-friendly fee% string
    const feePct = snapshot.defaultFeeBps != null ? (snapshot.defaultFeeBps / 100).toFixed(2) : null;

    // ZK readiness
    const zkReady = snapshot.zkVerifier && snapshot.zkVerifier !== ethers.ZeroAddress;

    const body = {
      schema: 'ai-work-market.system-status.v1',
      generatedAt,
      network: cfg.label,
      chainId: cfg.chainId,
      escrow: cfg.escrow,
      usdc: cfg.usdc,
      safe: cfg.safe,
      timelock: cfg.timelock,
      zkVerifierConfigured: snapshot.zkVerifier,
      zkReady,
      zkAdapter: cfg.zkAdapter,
      zkAdapterV2: cfg.zkAdapterV2,
      onchain: {
        nextIntentId: snapshot.nextIntentId,
        completedIntents: snapshot.completedIntents,
        accumulatedFeesRaw: snapshot.accumulatedFeesRaw,
        defaultFeeBps: snapshot.defaultFeeBps,
        defaultFeePercent: feePct,
        feeRecipient: snapshot.feeRecipient,
        owner: snapshot.owner,
        escrowUsdcRaw: snapshot.escrowUsdcRaw,
        blockNumber: snapshot.blockNumber,
      },
      health: {
        ok: snapshot.completedIntents != null && snapshot.escrowUsdcRaw != null,
        errors: snapshot.errors,
      },
      statusNames: STATUS_NAMES,
      endpoints: {
        contractStatus: `https://ai-work-market.ai/api/contract-status?id={id}&network=${cfg.label}`,
        agentProducts: 'https://ai-work-market.ai/api/agent-products',
        x402Verify: 'https://ai-work-market.ai/api/x402-verify-receipt',
        protectedResource: 'https://ai-work-market.ai/api/protected-resource?slug={slug}',
      },
    };
    return json(res, 200, body, 30);
  } catch (err) {
    return json(res, 500, {
      schema: 'ai-work-market.system-status.v1',
      generatedAt,
      network: cfg.label,
      error: 'rpc_failure',
      message: err && err.message ? err.message : String(err),
    });
  }
};
