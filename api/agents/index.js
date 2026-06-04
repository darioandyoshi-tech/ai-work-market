// api/agents/index.js
// List all registered agent cards, paginated.
// Per agent feedback: "every agent that registers becomes a discovery node".
//
// GET /api/agents  -> { count, cards: [...] }
// GET /api/agents?capability=escrow  -> only cards that claim this capability
// GET /api/agents?address=0xABC  -> only the card for this address (or 404)

const { listCards, findByAddress, findByCapability } = require('./_agent-registry.js');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=60');
  res.end(JSON.stringify(body, null, 2));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const q = req.query || {};
  let cards;

  if (q.address) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(q.address))) {
      return json(res, 400, { error: 'invalid_address' });
    }
    const card = findByAddress(String(q.address).toLowerCase());
    return json(res, 200, { count: card ? 1 : 0, cards: card ? [card] : [] });
  }

  if (q.capability) {
    cards = findByCapability(String(q.capability).toLowerCase());
  } else {
    cards = listCards();
  }

  const limit = Math.min(parseInt(q.limit || '50', 10) || 50, 200);
  const offset = Math.max(parseInt(q.offset || '0', 10) || 0, 0);

  return json(res, 200, {
    schema: 'ai-work-market.agents-list.v1',
    count: cards.length,
    limit,
    offset,
    cards: cards.slice(offset, offset + limit).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      address: c.address,
      capabilities: c.capabilities,
      x402PayTo: c.x402PayTo,
      website: c.website,
      registeredAt: c.registeredAt,
      hasSignature: !!c.signature && !!c.signature.sig,
      issuer: c.issuer,
    })),
    nextSteps: [
      'GET /api/agents/<id> for the full signed card',
      'GET /api/agents?address=0x... to look up by wallet',
      'GET /api/agents?capability=escrow to filter by capability',
      'POST /api/agent-onboard to register yourself',
    ],
  });
};
