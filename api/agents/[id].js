// api/agents/[id].js
// Serve a single agent card by id. Created via POST /api/agent-onboard.
//
// GET /api/agents/<id>  -> the signed agent card
//
// Storage: Vercel KV or Upstash Redis (env vars), in-memory fallback.
// In-memory only works on a single warm serverless instance; not for prod.

const { getCard } = require('./_agent-registry.js');

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
  const id = String((req.query && req.query.id) || '').toLowerCase().replace(/^agent:/, '');
  if (!/^[0-9a-f]{4,32}$/.test(id)) {
    return json(res, 400, { error: 'invalid_id', hint: 'id is the hex from cardId (without "agent:" prefix)' });
  }
  const card = await getCard(id);
  if (!card) {
    return json(res, 404, { error: 'not_found', hint: 'No agent card with that id. POST /api/agent-onboard to create one.' });
  }
  return json(res, 200, card);
};
