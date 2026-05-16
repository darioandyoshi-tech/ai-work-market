#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const linkHandler = require('../api/private-delivery-link');
const downloadHandler = require('../api/private-delivery-download');

// Mock Response object
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
  console.log('Starting Signed Private Delivery Full Lifecycle Tests...');
  
  const oldEnv = { ...process.env };
  const SECRET = 'test-secret-at-least-32-bytes-long-123';
  const MANIFEST = JSON.stringify({
    'agent-commerce-market-map-2026': {
      'bundleId': 'market-map-2026-v1',
      'url': 'https://storage.example.com/test-asset.zip'
    }
  });

  process.env.AWM_DELIVERY_SIGNING_SECRET = SECRET;
  process.env.AWM_PRIVATE_DELIVERY_MANIFEST = MANIFEST;
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

  // Mock global.fetch to simulate Stripe API
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('/checkout/sessions/cs_test_paid')) {
      return {
        ok: true,
        json: async () => ({
          id: 'cs_test_paid',
          payment_status: 'paid',
          status: 'complete',
          livemode: false,
          metadata: { slug: 'agent-commerce-market-map-2026' }
        })
      };
    }
    if (url.includes('/checkout/sessions/cs_test_unpaid')) {
      return {
        ok: true,
        json: async () => ({
          id: 'cs_test_unpaid',
          payment_status: 'no_payment_attempted',
          status: 'open',
          livemode: false,
          metadata: { slug: 'agent-commerce-market-map-2026' }
        })
      };
    }
    throw new Error('Unexpected fetch call to ' + url);
  };

  try {
    // 1. Test Successful Link Issuance
    console.log('Testing: Successful link issuance...');
    const linkOut = await call(linkHandler, { 
      method: 'POST', 
      query: { session_id: 'cs_test_paid' } 
    });
    assert.equal(linkOut.res.statusCode, 200, 'Should issue link for paid session');
    assert.strictEqual(linkOut.json.verified, true);
    assert.strictEqual(linkOut.json.delivery.state, 'signed_link_issued');
    const downloadUrl = linkOut.json.delivery.url;
    assert.ok(downloadUrl.includes('/api/private-delivery-download?token='));
    
    const token = new URL(downloadUrl).searchParams.get('token');
    assert.ok(token, 'Token should be present in URL');

    // 2. Test Successful Download Redirect
    console.log('Testing: Successful download redirect...');
    const dlOut = await call(downloadHandler, { 
      method: 'GET', 
      query: { token } 
    });
    assert.equal(dlOut.res.statusCode, 302, 'Should redirect to asset');
    assert.strictEqual(dlOut.res.headers.location, 'https://storage.example.com/test-asset.zip');

    // 3. Test Unpaid Session
    console.log('Testing: Unpaid session rejection...');
    const unpaidOut = await call(linkHandler, { 
      method: 'POST', 
      query: { session_id: 'cs_test_unpaid' } 
    });
    assert.equal(unpaidOut.res.statusCode, 402, 'Should reject unpaid session');
    assert.strictEqual(unpaidOut.json.error, 'checkout_not_paid');

    // 4. Test Token Binding (Wrong Product)
    console.log('Testing: Token product binding...');
    const [bodyB64, sig] = token.split('.');
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
    
    // Create a fraudulent token by changing the product slug but keeping the signature
    const fraudPayload = { ...payload, productSlug: 'wrong-product' };
    const fraudBody = Buffer.from(JSON.stringify(fraudPayload)).toString('base64url');
    const fraudToken = `${fraudBody}.${sig}`; // Invalid signature now, but let's test the verification
    
    const fraudOut = await call(downloadHandler, { 
      method: 'GET', 
      query: { token: fraudToken } 
    });
    assert.equal(fraudOut.res.statusCode, 400, 'Fraudulent token must be rejected by signature check');

    // 5. Test Token Expiry
    console.log('Testing: Token expiry...');
    const originalNow = Date.now;
    // Mock time to be in the future (past the TTL)
    const ttl = 600 * 1000; 
    global.Date.now = () => originalNow() + ttl + 10000;
    
    const expiredOut = await call(downloadHandler, { 
      method: 'GET', 
      query: { token } 
    });
    assert.equal(expiredOut.res.statusCode, 400, 'Expired token must be rejected');
    assert.strictEqual(expiredOut.json.error, 'invalid_or_expired_delivery_token');
    global.Date.now = originalNow;

    // 6. Test Manifest Mismatch (Bundle ID change)
    console.log('Testing: Bundle ID binding...');
    // We need a valid signature for a modified payload to test the bundleId check.
    const validFraudPayload = { ...payload, bundleId: 'wrong-bundle' };
    const validFraudBody = Buffer.from(JSON.stringify(validFraudPayload)).toString('base64url');
    const validFraudSig = crypto.createHmac('sha256', SECRET).update(validFraudBody).digest('base64url');
    const bundleFraudToken = `${validFraudBody}.${validFraudSig}`;

    const bundleOut = await call(downloadHandler, { 
      method: 'GET', 
      query: { token: bundleFraudToken } 
    });
    assert.equal(bundleOut.res.statusCode, 503, 'Wrong bundle ID must result in 503');
    assert.strictEqual(bundleOut.json.error, 'private_storage_not_configured');

    // 7. Test Secret Length Guard
    console.log('Testing: Secret length guard...');
    const originalSecret = process.env.AWM_DELIVERY_SIGNING_SECRET;
    process.env.AWM_DELIVERY_SIGNING_SECRET = 'too-short';
    const shortSecretOut = await call(linkHandler, { 
      method: 'POST', 
      query: { session_id: 'cs_test_paid' } 
    });
    assert.equal(shortSecretOut.res.statusCode, 503, 'Should reject secret < 32 bytes');
    assert.strictEqual(shortSecretOut.json.error, 'delivery_signing_secret_missing');
    process.env.AWM_DELIVERY_SIGNING_SECRET = originalSecret;

    // 8. Test TTL Clipping (Low)
    console.log('Testing: TTL clipping (low)...');
    process.env.AWM_DELIVERY_TOKEN_TTL_SECONDS = '10'; // Below 60
    const lowTtlOut = await call(linkHandler, { 
      method: 'POST', 
      query: { session_id: 'cs_test_paid' } 
    });
    const lowToken = new URL(lowTtlOut.json.delivery.url).searchParams.get('token');
    const lowPayload = JSON.parse(Buffer.from(lowToken.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(lowPayload.exp - lowPayload.iat, 60, 'TTL should be clipped to 60s minimum');

    // 9. Test TTL Clipping (High)
    console.log('Testing: TTL clipping (high)...');
    process.env.AWM_DELIVERY_TOKEN_TTL_SECONDS = '99999'; // Above 3600
    const highTtlOut = await call(linkHandler, { 
      method: 'POST', 
      query: { session_id: 'cs_test_paid' } 
    });
    const highToken = new URL(highTtlOut.json.delivery.url).searchParams.get('token');
    const highPayload = JSON.parse(Buffer.from(highToken.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(highPayload.exp - highPayload.iat, 3600, 'TTL should be clipped to 3600s maximum');
    process.env.AWM_DELIVERY_TOKEN_TTL_SECONDS = '600';

    // 10. Test Custom Origin
    console.log('Testing: Custom origin...');
    const originalOrigin = process.env.AWM_PUBLIC_ORIGIN;
    process.env.AWM_PUBLIC_ORIGIN = 'https://custom.example.com';
    const customOriginOut = await call(linkHandler, { 
      method: 'POST', 
      query: { session_id: 'cs_test_paid' } 
    });
    assert.ok(customOriginOut.json.delivery.url.includes('https://custom.example.com'), 'URL should use custom origin');
    process.env.AWM_PUBLIC_ORIGIN = originalOrigin;

    console.log('✓ All signed private delivery full-lifecycle tests passed');
  } finally {
    process.env = oldEnv;
    global.fetch = originalFetch;
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
