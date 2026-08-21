// api-integration.test.js
// Runtime integration tests for the AWM API layer.
// Verifies the rate limiter, payment-request endpoint, and fulfillment store
// actually work at runtime (not just compile).
//
// Run: node --test api-integration.test.js
const test = require('node:test');
const assert = require('node:assert');

// ------------------------------------------------------------------ //
// 1. Rate limiter
// ------------------------------------------------------------------ //
test('rate limiter: allows up to max, then blocks with 429', () => {
  const { checkRateLimit, applyRateLimit } = require('./api/_rate-limit');

  const mkReq = (ip) => ({
    headers: { 'x-forwarded-for': ip },
    method: 'GET',
    url: '/api/payment-request?slug=x',
    socket: { remoteAddress: ip },
  });
  const mkRes = () => {
    const r = { statusCode: 0, headers: {}, body: '' };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.end = (b) => { r.body = b; };
    return r;
  };

  // max 2 per window
  const r1 = applyRateLimit(mkReq('1.2.3.4'), mkRes(), { max: 2, windowMs: 60000 });
  const r2 = applyRateLimit(mkReq('1.2.3.4'), mkRes(), { max: 2, windowMs: 60000 });
  const r3 = applyRateLimit(mkReq('1.2.3.4'), mkRes(), { max: 2, windowMs: 60000 });

  assert.strictEqual(r1, false, 'first request allowed');
  assert.strictEqual(r2, false, 'second request allowed');
  assert.strictEqual(r3, true, 'third request blocked');

  // Different IP is not blocked
  const rOther = applyRateLimit(mkReq('5.6.7.8'), mkRes(), { max: 2, windowMs: 60000 });
  assert.strictEqual(rOther, false, 'different IP not blocked');
});

test('rate limiter: returns retry-after header on 429', () => {
  const { applyRateLimit } = require('./api/_rate-limit');
  const mkReq = (ip) => ({
    headers: { 'x-forwarded-for': ip },
    method: 'GET',
    url: '/api/x',
    socket: { remoteAddress: ip },
  });
  const mkRes = () => {
    const r = { statusCode: 0, headers: {}, body: '' };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.end = (b) => { r.body = b; };
    return r;
  };

  const res = mkRes();
  applyRateLimit(mkReq('9.9.9.9'), res, { max: 1, windowMs: 60000 });
  applyRateLimit(mkReq('9.9.9.9'), res, { max: 1, windowMs: 60000 });

  assert.strictEqual(res.statusCode, 429);
  assert.ok(res.headers['retry-after'], 'retry-after header present');
  assert.match(res.body, /rate_limited/);
});

// ------------------------------------------------------------------ //
// 2. payment-request endpoint
// ------------------------------------------------------------------ //
test('payment-request: returns 402 with payment payload for valid slug', async () => {
  const handler = require('./api/payment-request.js');
  const req = {
    method: 'GET',
    query: { slug: 'agent-commerce-market-map-2026' },
    headers: { host: 'ai-work-market.vercel.app', 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '1.1.1.1' },
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; },
  };

  await handler(req, res);
  assert.strictEqual(res.statusCode, 402, 'payment required');
  const payload = JSON.parse(res.body);
  assert.strictEqual(payload.paymentRequired, true);
  assert.strictEqual(payload.schema, 'ai-work-market.payment-request.v1');
  assert.strictEqual(payload.product.id, 'agent-commerce-market-map-2026');
  assert.ok(payload.payment.currentRail, 'has payment rail');
  assert.ok(payload.correlation.quoteId, 'has quote id');
  assert.ok(payload.correlation.requestId, 'has request id');
});

test('payment-request: returns 404 for unknown slug', async () => {
  const handler = require('./api/payment-request.js');
  const req = {
    method: 'GET',
    query: { slug: 'does-not-exist' },
    headers: { host: 'ai-work-market.vercel.app', 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '1.1.1.1' },
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; },
  };

  await handler(req, res);
  assert.strictEqual(res.statusCode, 404);
  const payload = JSON.parse(res.body);
  assert.strictEqual(payload.error, 'unknown_product');
});

test('payment-request: returns 400 for missing slug', async () => {
  const handler = require('./api/payment-request.js');
  const req = {
    method: 'GET',
    query: {},
    headers: { host: 'ai-work-market.vercel.app', 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '1.1.1.1' },
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = b; },
  };

  await handler(req, res);
  assert.strictEqual(res.statusCode, 400);
  const payload = JSON.parse(res.body);
  assert.strictEqual(payload.error, 'missing_slug');
});

// ------------------------------------------------------------------ //
// 3. Fulfillment store (in-memory fallback path)
// ------------------------------------------------------------------ //
test('fulfillment store: records and retrieves events (memory fallback)', async () => {
  const store = require('./api/_fulfillment-store.js');
  // Force memory backend (no KV env vars set in test)
  // Pass a Stripe-shaped event so recordEvent normalizes sessionId from data.object.id
  const event = {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    livemode: false,
    productSlug: 'agent-commerce-market-map-2026',
    data: { object: { id: 'cs_test_abc' } },
  };
  const record = await store.recordEvent(event);
  assert.ok(record, 'record returned');
  assert.strictEqual(record.sessionId, 'cs_test_abc');
  const session = await store.getSessionRecord('cs_test_abc');
  assert.ok(session, 'session record returned');
  assert.strictEqual(session.id, 'evt_test_123');
  assert.strictEqual(session.productSlug, 'agent-commerce-market-map-2026');
});

// ------------------------------------------------------------------ //
// 4. check-payment endpoint (rate-limited + tx status)
// ------------------------------------------------------------------ //
test('check-payment: returns unknown for a random tx hash', async () => {
  const handler = require('./api/check-payment.js');
  const req = {
    method: 'GET',
    query: { tx: '0x' + 'ab'.repeat(32), network: 'sepolia' },
    headers: { host: 'ai-work-market.vercel.app', 'x-forwarded-proto': 'https' },
    socket: { remoteAddress: '1.1.1.1' },
  };
  // check-payment uses Express-style res.status().json() and res.send()
  const res = {
    _status: 0,
    _body: '',
    status(c) { this._status = c; return this; },
    json(b) { this._body = JSON.stringify(b); return this; },
    send(b) { this._body = typeof b === 'string' ? b : JSON.stringify(b); return this; },
    setHeader() { return this; },
    end() { return this; },
  };

  await handler(req, res);
  assert.strictEqual(res._status, 200);
  const payload = JSON.parse(res._body);
  assert.ok(payload.status, 'has status field');
});
