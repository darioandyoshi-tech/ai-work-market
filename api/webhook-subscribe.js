// api/webhook-subscribe.js
// Subscribe to a webhook for intent state transitions.
//   POST /api/webhook-subscribe { url, intentId, secret? }
//   GET  /api/webhook-subscribe?intentId=N  -> list active subs
//   DELETE /api/webhook-subscribe?id=...   -> unsubscribe
//
// Storage: Vercel KV via @vercel/kv (env vars KV_REST_API_URL + KV_REST_API_TOKEN).
// Falls back to in-memory for local dev / single-instance testing.
//
// When the cron at /api/cron/webhook-deliverer sees a Released/Refunded/
// Disputed/SubmittedProof event on the watched intent, it POSTs the
// payload to your URL with an HMAC-SHA256 signature.

const { addSub, listSubs, removeSub } = require('./_webhook-store.js');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const intentId = req.query && req.query.intentId;
    const subs = await listSubs(intentId);
    return json(res, 200, {
      schema: 'ai-work-market.webhook-subscribe.v1',
      intentId: intentId ? String(intentId) : null,
      count: subs.length,
      subs: subs.map((s) => ({ id: s.id, url: s.url, intentId: s.intentId, createdAt: s.createdAt, lastFiredAt: s.lastFiredAt, lastError: s.lastError, status: s.status })),
      hint: 'POST { url, intentId, secret? } to subscribe. DELETE ?id=SUBID to remove.',
    });
  }

  if (req.method === 'DELETE') {
    const id = req.query && req.query.id;
    if (!id) return json(res, 400, { error: 'missing_id' });
    const ok = await removeSub(String(id));
    return json(res, 200, { ok, removed: id });
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const url = String(body.url || '').trim();
  const intentId = String(body.intentId || '').trim();
  const secret = String(body.secret || '').trim() || `awm-sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!/^https?:\/\//.test(url)) {
    return json(res, 400, { error: 'invalid_url', hint: 'url must be http(s)://...' });
  }
  if (!/^\d+$/.test(intentId)) {
    return json(res, 400, { error: 'invalid_intentId', hint: 'intentId must be a number' });
  }

  const sub = await addSub({
    url,
    intentId,
    secret,
  });

  return json(res, 201, {
    schema: 'ai-work-market.webhook-subscribe.v1',
    ok: true,
    subscription: { id: sub.id, url: sub.url, intentId: sub.intentId, secret: sub.secret, createdAt: sub.createdAt, status: sub.status },
    hint: 'AWM will POST { schema, deliveryId, event, intentId, blockNumber, txHash, ... } to your URL when the intent transitions. The X-AWM-Signature header is HMAC-SHA256 of the body using your secret. Verify it before trusting the payload.',
  });
};
