#!/usr/bin/env node
'use strict';

const assert = require('assert');
const linkHandler = require('../api/private-delivery-link');
const downloadHandler = require('../api/private-delivery-download');

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value = '') { this.body += value; }
  };
}

async function call(handler, req) {
  const res = createRes();
  await handler(req, res);
  let json = null;
  try { json = JSON.parse(res.body); } catch {}
  return { res, json };
}

async function main() {
  const oldEnv = { ...process.env };
  try {
    delete process.env.AWM_DELIVERY_SIGNING_SECRET;
    let out = await call(linkHandler, { method: 'GET', query: {} });
    assert.equal(out.res.statusCode, 405, 'GET link should be method-not-allowed');
    assert.equal(out.res.headers.allow, 'POST');

    out = await call(linkHandler, { method: 'POST', query: {} });
    assert.equal(out.res.statusCode, 400, 'missing session should reject before config/Stripe');
    assert.equal(out.json.error, 'missing_or_invalid_session_id');

    out = await call(linkHandler, { method: 'POST', query: { session_id: 'not_a_session' } });
    assert.equal(out.res.statusCode, 400, 'invalid session should reject before config/Stripe');
    assert.equal(out.json.error, 'missing_or_invalid_session_id');

    out = await call(linkHandler, { method: 'POST', query: { session_id: 'cs_live_abc123' } });
    assert.equal(out.res.statusCode, 503, 'missing signing secret should safe-fail before Stripe');
    assert.equal(out.json.error, 'delivery_signing_secret_missing');
    assert.equal(out.json.safety.noCustomerPiiReturned, true);

    out = await call(downloadHandler, { method: 'POST', query: {} });
    assert.equal(out.res.statusCode, 405, 'download is GET only');

    out = await call(downloadHandler, { method: 'GET', query: { token: 'bad' } });
    assert.equal(out.res.statusCode, 503, 'missing signing secret safe-fails download');
    assert.equal(out.json.error, 'delivery_signing_secret_missing');

    process.env.AWM_DELIVERY_SIGNING_SECRET = 'x'.repeat(32);
    out = await call(downloadHandler, { method: 'GET', query: { token: 'bad' } });
    assert.equal(out.res.statusCode, 400, 'bad token rejected');
    assert.equal(out.json.error, 'invalid_or_expired_delivery_token');

    console.log('✓ private delivery link tests passed');
  } finally {
    process.env = oldEnv;
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
