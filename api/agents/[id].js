// api/agents/[id].js
// Serve a single agent card by id. Created via POST /api/agent-onboard.
// This is the actual hosting of the `hostedAt` URL returned by agent-onboard.
//
// GET /api/agents/<id>  -> the signed agent card
//
// Storage is in-memory (per Vercel instance). For durability swap to Vercel KV
// or a tiny external store. The in-memory store is also used by /api/agents
// to list the global registry.

const { getCard, listCards } = require('./_agent-registry.js');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300');
  res.end(JSON.stringify(body, null, 2));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }
  // Vercel routes /api/agents/abc123 to this handler with req.query.id = 'abc123'
  const id = String((req.query && req.query.id) || '').toLowerCase().replace(/^agent:/, '');
  if (!/^[0-9a-f]{4,32}$/.test(id)) {
    return json(res, 400, { error: 'invalid_id', hint: 'id is the hex from cardId (without "agent:" prefix)' });
  }
  const card = getCard(id);
  if (!card) {
    return json(res, 404, { error: 'not_found', hint: 'No agent card with that id. POST /api/agent-onboard to create one.' });
  }
  return json(res, 200, card);
};
