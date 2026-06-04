// api/webhook-subscribe.js
// Subscribe to a webhook for intent state transitions.
//   POST /api/webhook-subscribe { url, intentId, secret? }
//   GET  /api/webhook-subscribe?intentId=N  -> list active subs
//   DELETE /api/webhook-subscribe?id=...   -> unsubscribe
//
// State is stored in a per-instance memory map; survives across hot reloads in
// a single Vercel instance. For multi-region durability we'd want Vercel KV or
// a tiny external store; that's outside scope for the v1.
//
// When the AWM event scanner sees a transition on the watched intent, it POSTs
// { intentId, status, blockNumber, tx } to the registered URL with HMAC.

const { getSubs, addSub, removeSub, listSubs } = require('./_webhook-store.js');

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json');
  res.send(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const intentId = req.query && req.query.intentId;
    if (!intentId) {
      return json(res, 200, {
        schema: 'ai-work-market.webhook-subscribe.v1',
        subs: listSubs(),
        hint: 'POST { url, intentId, secret? } to subscribe. DELETE ?id=SUBID to remove.',
      });
    }
    return json(res, 200, {
      schema: 'ai-work-market.webhook-subscribe.v1',
      intentId: String(intentId),
      subs: listSubs().filter((s) => String(s.intentId) === String(intentId)),
    });
  }

  if (req.method === 'DELETE') {
    const id = req.query && req.query.id;
    if (!id) return json(res, 400, { error: 'missing_id' });
    const ok = removeSub(String(id));
    return json(res, 200, { ok, removed: id });
  }

  if (req.method !== 'POST') {
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

  const sub = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    intentId,
    secret,
    createdAt: new Date().toISOString(),
    events: ['Released', 'Refunded', 'Disputed', 'Resolved'],
  };
  addSub(sub);

  return json(res, 201, {
    schema: 'ai-work-market.webhook-subscribe.v1',
    ok: true,
    subscription: sub,
    hint: 'AWM will POST { intentId, status, blockNumber, tx, signature } to your URL when the intent transitions. The signature is HMAC-SHA256 of the body using your secret. Verify it before trusting the payload.',
  });
};
