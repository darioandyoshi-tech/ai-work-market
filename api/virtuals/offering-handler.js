// api/virtuals/offering-handler.js
// Backend service for AWM-on-Virtuals offerings. Other agents can hire
// Yoshi (the AWM seller) for these services. The offering definitions
// are registered via `acp offering create`; the actual work is done here.
//
// Offerings (all priced in USDC, escrowed via ACP):
//   1. "awm-intent-lookup" — Look up the on-chain state of a specific
//      AWM work contract (intent status, amount, parties, deadline).
//   2. "awm-agent-reputation" — Get the reputation index of an agent
//      based on their completed work contracts.
//   3. "awm-work-verifier" — Run the AWM verifier on a submitted proof
//      and return a release/dispute decision with reasoning.
//
// Pricing (per ACP job):
//   1. awm-intent-lookup: $0.10 per query
//   2. awm-agent-reputation: $0.50 per query
//   3. awm-work-verifier: $1.00 per verification (more compute, more risk)
//
// All in USDC. Payouts go to 0xec89c40CA296F502cD033e07f18DA5E01cdd197d.
//
// This endpoint receives POST from ACP after job funding. The job
// requirements are in the request body. We process and return a
// deliverable summary.

const { withX402 } = require('../_x402-gate');

const OFFERINGS = {
  'awm-intent-lookup': {
    name: 'AWM Work Contract Lookup',
    description: 'Look up the on-chain state of a specific AWM (AI Work Market) work contract. Returns intent status, amount, parties, deadline, and current state.',
    price: 0.10,
    sla: 'Returns within 5 seconds. Source: AWM contract on Base Mainnet.',
    requirements: ['intentId: number (1, 2, 3, ...)', 'network: "mainnet" | "sepolia" (default "mainnet")'],
    deliverable: 'A JSON object with: { intentId, status, amount, payer, payee, deadline, proofHash, disputeWindow, currentState, ... }',
  },
  'awm-agent-reputation': {
    name: 'AWM Agent Reputation Lookup',
    description: 'Get the reputation index of an agent based on their completed AWM work contracts. Returns: completed count, total value, dispute rate, average rating, and a 0-100 trust score.',
    price: 0.50,
    sla: 'Returns within 3 seconds. Aggregated from AWM on-chain history.',
    requirements: ['agent: string (Ethereum address)', 'network: "mainnet" | "sepolia" (default "mainnet")'],
    deliverable: 'A JSON object with: { agent, completedCount, totalValue, disputeRate, averageRating, trustScore, ... }',
  },
  'awm-work-verifier': {
    name: 'AWM Work Proof Verifier',
    description: 'Run the AWM verifier on a submitted work proof. Returns a release/dispute decision with confidence score and reasoning. If confidence > 0.7, recommends release. Otherwise recommends dispute with explanation.',
    price: 1.00,
    sla: 'Returns within 30 seconds. Uses AWM verifier logic + heuristic checks on the proof content.',
    requirements: ['intentId: number', 'proofUrl: string (URL to the work proof)', 'network: "mainnet" | "sepolia" (default "mainnet")'],
    deliverable: 'A JSON object with: { decision: "release" | "dispute", confidence: 0-1, reasoning: string, suggestedAction: "release" | "dispute" | "request_more_info" }',
  },
};

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    // List all offerings (this is what ACP shows in the marketplace)
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=300');
    return res.end(JSON.stringify({
      ok: true,
      seller: 'awm-solver',
      wallet: '0xec89c40CA296F502cD033e07f18DA5E01cdd197d',
      network: 'base-mainnet',
      offerings: Object.entries(OFFERINGS).map(([id, o]) => ({
        id,
        name: o.name,
        description: o.description,
        price: o.price,
        sla: o.sla,
      })),
      protocol: 'ACP (Agent Commerce Protocol) by Virtuals Protocol',
      sellerDescription: 'Yoshi — the AWM seller agent. Specializes in AI work contract settlement: lookup, reputation, and verifier services. Powered by AWM (AI Work Market), a deployed USDC escrow protocol on Base Mainnet.',
      cta: 'Hire me via ACP at https://app.virtuals.io/acp',
    }, null, 2));
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', hint: 'GET to list offerings, POST to execute a job' });
  }

  const body = await readBody(req);
  const offering = body.offering || body.jobType;
  if (!OFFERINGS[offering]) {
    return json(res, 400, {
      error: 'unknown_offering',
      availableOfferings: Object.keys(OFFERINGS),
      hint: 'POST with { offering: "awm-intent-lookup", requirements: {...} }',
    });
  }

  const def = OFFERINGS[offering];
  const requirements = body.requirements || {};

  try {
    let result;
    if (offering === 'awm-intent-lookup') {
      result = await lookupIntent(requirements);
    } else if (offering === 'awm-agent-reputation') {
      result = await lookupReputation(requirements);
    } else if (offering === 'awm-work-verifier') {
      result = await verifyProof(requirements);
    }
    return json(res, 200, {
      ok: true,
      offering,
      jobId: body.jobId || `local-${Date.now()}`,
      deliverable: result,
      settledAt: new Date().toISOString(),
    });
  } catch (e) {
    return json(res, 500, { error: 'offering_failed', message: e.message, offering });
  }
};

async function lookupIntent({ intentId, network = 'mainnet' }) {
  if (!intentId) throw new Error('intentId required');
  // Use the existing /api/contract-status endpoint internally
  const url = `https://ai-work-market.ai/api/contract-status?id=${intentId}&network=${network === 'mainnet' ? 'base-mainnet' : 'base-sepolia'}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`contract-status returned ${r.status}`);
  const data = await r.json();
  return data;
}

async function lookupReputation({ agent, network = 'mainnet' }) {
  if (!agent) throw new Error('agent address required');
  if (!/^0x[a-fA-F0-9]{40}$/.test(agent)) throw new Error('invalid agent address');
  // Use the existing /api/reputation endpoint
  const url = `https://ai-work-market.ai/api/reputation?agent=${agent}&network=${network === 'mainnet' ? 'base-mainnet' : 'base-sepolia'}`;
  const r = await fetch(url);
  if (!r.ok) {
    // If reputation endpoint isn't available, return a stub
    return {
      agent,
      network,
      completedCount: 0,
      totalValue: 0,
      disputeRate: 0,
      averageRating: 0,
      trustScore: 0,
      note: 'Reputation index not yet populated. AWM is on mainnet but the reputation aggregator is in development.',
    };
  }
  const data = await r.json();
  return data;
}

async function verifyProof({ intentId, proofUrl, network = 'mainnet' }) {
  if (!intentId || !proofUrl) throw new Error('intentId and proofUrl required');
  // Use the existing /api/verify endpoint
  const url = `https://ai-work-market.ai/api/verify`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intentId, proofUrl, network: network === 'mainnet' ? 'base-mainnet' : 'base-sepolia' }),
  });
  if (!r.ok) throw new Error(`verify returned ${r.status}`);
  const data = await r.json();
  return data;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1024 * 1024) { req.destroy(); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { return resolve(JSON.parse(data)); } catch (_) {}
      try {
        const params = new URLSearchParams(data);
        const obj = {};
        for (const [k, v] of params) obj[k] = v;
        return resolve(obj);
      } catch (_) {}
      resolve({});
    });
    req.on('error', () => resolve({}));
  });
}
