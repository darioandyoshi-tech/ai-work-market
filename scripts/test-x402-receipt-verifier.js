#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const agentProducts = require('../api/agent-products');
const paymentRequest = require('../api/payment-request');
const x402VerifyReceipt = require('../api/x402-verify-receipt');
const { consumeReceipt } = require('../api/_x402-receipt-store');

function makeResponse() {
  const chunks = [];
  const headers = {};
  return {
    res: {
      statusCode: 0,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      end(body = '') {
        chunks.push(body);
      }
    },
    body() {
      return chunks.join('');
    },
    json() {
      return JSON.parse(chunks.join(''));
    },
    headers
  };
}

async function call(handler, req) {
  const response = makeResponse();
  await handler(req, response.res);
  return response;
}

function jsonPost(query, body, headers = {}) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const req = Readable.from([rawBody]);
  req.method = 'POST';
  req.query = query;
  req.url = '/api/x402-verify-receipt';
  req.headers = headers;
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

async function testRejectsInvalidTxHash() {
  const response = await call(x402VerifyReceipt, {
    method: 'GET',
    query: { tx: 'not-a-tx' }
  });

  assert.strictEqual(response.res.statusCode, 400);
  assert.strictEqual(response.json().error, 'tx_invalid');
}

async function testRejectsUnknownProductBeforeRpc() {
  const response = await call(x402VerifyReceipt, {
    method: 'GET',
    query: {
      tx: `0x${'0'.repeat(64)}`,
      slug: 'missing-product'
    }
  });

  assert.strictEqual(response.res.statusCode, 404);
  assert.strictEqual(response.json().error, 'unknown_product');
}

async function testPaymentRequestExposesX402Rail() {
  const response = await call(paymentRequest, {
    method: 'GET',
    query: { slug: 'agent-commerce-market-map-2026' },
    headers: {
      host: 'ai-work-market.ai',
      'x-forwarded-proto': 'https'
    }
  });

  const body = response.json();
  assert.strictEqual(response.res.statusCode, 402);
  assert.deepStrictEqual(body.payment.acceptedRails, [
    'stripe_payment_link',
    'x402_base_usdc_receipt'
  ]);
  assert.strictEqual(body.payment.x402.networkCaip2, 'eip155:8453');
  assert.strictEqual(body.payment.x402.amount.raw, '79000000');
  assert.match(body.payment.x402.verifierUrl, /\/api\/x402-verify-receipt\?slug=agent-commerce-market-map-2026$/);
}

async function testAgentProductsExposeX402Rail() {
  const response = await call(agentProducts, {
    method: 'GET',
    headers: {}
  });

  const body = response.json();
  const product = body.products.find((item) => item.id === 'agent-commerce-market-map-2026');
  assert.strictEqual(response.res.statusCode, 200);
  assert(product, 'expected market map product in catalog');
  assert(product.paymentRails.some((rail) => rail.provider === 'stripe_payment_link'));

  const x402Rail = product.paymentRails.find((rail) => rail.provider === 'x402');
  assert(x402Rail, 'expected x402 payment rail');
  assert.strictEqual(x402Rail.asset, 'native USDC');
  assert.strictEqual(x402Rail.amount.raw, '79000000');
  assert.match(x402Rail.verifierUrl, /\/api\/x402-verify-receipt\?slug=agent-commerce-market-map-2026$/);
}

function testReceiptBindingIsStableAndScoped() {
  const tx = `0x${'a'.repeat(64)}`;
  const transfer = {
    from: '0x1111111111111111111111111111111111111111',
    to: '0x8d32448cbad55a3d3B12DE901e57782C409399B7',
    value: 79000000n,
    logIndex: 12
  };
  const common = {
    tx,
    transfer,
    recipient: transfer.to,
    productSlug: 'agent-commerce-market-map-2026',
    expectedRaw: 79000000n,
    quoteId: 'quote-123',
    customerRef: 'buyer-abc',
    requestId: 'req-456'
  };

  const binding = x402VerifyReceipt._test.buildReceiptBinding(common);
  const repeated = x402VerifyReceipt._test.buildReceiptBinding(common);
  const differentQuote = x402VerifyReceipt._test.buildReceiptBinding({
    ...common,
    quoteId: 'quote-124'
  });

  assert.deepStrictEqual(binding, repeated);
  assert.strictEqual(
    binding.paymentRef,
    `eip155:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:${tx}:12`
  );
  assert.match(binding.fulfillmentRef, /^x402r_[a-f0-9]{32}$/);
  assert.strictEqual(binding.scope.quoteId, 'quote-123');
  assert.strictEqual(binding.scope.customerRef, 'buyer-abc');
  assert.strictEqual(binding.scope.requestId, 'req-456');
  assert.strictEqual(binding.replayGuard.requiredBeforeFulfillment, true);
  assert.strictEqual(binding.replayGuard.consumeBeforeDelivery, true);
  assert.strictEqual(differentQuote.paymentRef, binding.paymentRef);
  assert.notStrictEqual(differentQuote.fulfillmentRef, binding.fulfillmentRef);
}

async function testReceiptConsumptionRejectsReplayAndScopeConflict() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awm-x402-receipts-'));
  const previousStore = process.env.AWM_X402_RECEIPT_STORE_PATH;
  const previousBackend = process.env.AWM_X402_RECEIPT_STORE_BACKEND;
  process.env.AWM_X402_RECEIPT_STORE_PATH = path.join(tmpDir, 'receipts.json');
  process.env.AWM_X402_RECEIPT_STORE_BACKEND = 'local-json';
  try {
    const tx = `0x${'b'.repeat(64)}`;
    const transfer = {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x8d32448cbad55a3d3B12DE901e57782C409399B7',
      value: 79000000n,
      logIndex: 3
    };
    const base = {
      tx,
      transfer,
      recipient: transfer.to,
      productSlug: 'agent-commerce-market-map-2026',
      expectedRaw: 79000000n,
      quoteId: 'quote-abc',
      customerRef: 'cust-123',
      requestId: 'req-123'
    };

    const binding = x402VerifyReceipt._test.buildReceiptBinding(base);
    const first = await consumeReceipt(binding, { source: 'test' });
    const replay = await consumeReceipt(binding, { source: 'test' });
    const changedScope = await consumeReceipt(
      x402VerifyReceipt._test.buildReceiptBinding({ ...base, quoteId: 'quote-def' }),
      { source: 'test' }
    );

    assert.strictEqual(first.accepted, true);
    assert.strictEqual(first.reason, 'receipt_consumed');
    assert.strictEqual(replay.accepted, false);
    assert.strictEqual(replay.reason, 'payment_already_consumed');
    assert.strictEqual(changedScope.accepted, false);
    assert.strictEqual(changedScope.reason, 'payment_ref_scope_conflict');
    assert.strictEqual(changedScope.paymentRef, binding.paymentRef);
  } finally {
    if (previousStore === undefined) delete process.env.AWM_X402_RECEIPT_STORE_PATH;
    else process.env.AWM_X402_RECEIPT_STORE_PATH = previousStore;
    if (previousBackend === undefined) delete process.env.AWM_X402_RECEIPT_STORE_BACKEND;
    else process.env.AWM_X402_RECEIPT_STORE_BACKEND = previousBackend;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testRateLimitRejectsBurst() {
  const buckets = x402VerifyReceipt._test.rateBuckets;
  buckets.clear();

  const previousMax = process.env.AWM_X402_RATE_LIMIT_MAX;
  const previousWindow = process.env.AWM_X402_RATE_LIMIT_WINDOW_MS;
  process.env.AWM_X402_RATE_LIMIT_MAX = '2';
  process.env.AWM_X402_RATE_LIMIT_WINDOW_MS = '1000';

  try {
    const req = {
      method: 'GET',
      url: '/api/x402-verify-receipt',
      headers: { 'x-forwarded-for': '203.0.113.9' },
      socket: {}
    };

    assert.strictEqual(x402VerifyReceipt._test.checkRateLimit(req, 1000).limited, false);
    assert.strictEqual(x402VerifyReceipt._test.checkRateLimit(req, 1100).limited, false);
    const rejected = x402VerifyReceipt._test.checkRateLimit(req, 1200);
    assert.strictEqual(rejected.limited, true);
    assert.strictEqual(rejected.retryAfterSeconds, 1);
    assert.strictEqual(x402VerifyReceipt._test.checkRateLimit(req, 2101).limited, false);
  } finally {
    buckets.clear();
    if (previousMax === undefined) delete process.env.AWM_X402_RATE_LIMIT_MAX;
    else process.env.AWM_X402_RATE_LIMIT_MAX = previousMax;
    if (previousWindow === undefined) delete process.env.AWM_X402_RATE_LIMIT_WINDOW_MS;
    else process.env.AWM_X402_RATE_LIMIT_WINDOW_MS = previousWindow;
  }
}

function testConsumeSignatureVerification() {
  const previousSecret = process.env.AWM_X402_CONSUME_SECRET;
  process.env.AWM_X402_CONSUME_SECRET = 'test-consume-secret';

  try {
    const body = Buffer.from(JSON.stringify({
      tx: `0x${'c'.repeat(64)}`,
      slug: 'agent-commerce-market-map-2026',
      consume: true
    }));
    const timestamp = '1779552000';
    const signature = crypto
      .createHmac('sha256', process.env.AWM_X402_CONSUME_SECRET)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), body]))
      .digest('hex');

    assert.strictEqual(
      x402VerifyReceipt._test.verifyConsumeSignature({
        headers: {
          'x-awm-timestamp': timestamp,
          'x-awm-signature': `sha256=${signature}`
        }
      }, body, Number(timestamp) * 1000),
      true
    );

    assert.throws(
      () => x402VerifyReceipt._test.verifyConsumeSignature({
        headers: {
          'x-awm-timestamp': timestamp,
          'x-awm-signature': `sha256=${'0'.repeat(64)}`
        }
      }, body, Number(timestamp) * 1000),
      /consume_signature_invalid/
    );
  } finally {
    if (previousSecret === undefined) delete process.env.AWM_X402_CONSUME_SECRET;
    else process.env.AWM_X402_CONSUME_SECRET = previousSecret;
  }
}

async function testConsumeRejectsUnsignedQueryParams() {
  x402VerifyReceipt._test.rateBuckets.clear();
  const response = await call(x402VerifyReceipt, jsonPost(
    { slug: 'agent-commerce-market-map-2026' },
    {
      tx: `0x${'d'.repeat(64)}`,
      consume: true
    }
  ));

  assert.strictEqual(response.res.statusCode, 400);
  assert.strictEqual(response.json().error, 'consume_query_params_forbidden');
  assert.deepStrictEqual(response.json().rejectedQueryParams, ['slug']);
}

function makeBinding(overrides = {}) {
  const tx = `0x${'e'.repeat(64)}`;
  const transfer = {
    from: '0x1111111111111111111111111111111111111111',
    to: '0x8d32448cbad55a3d3B12DE901e57782C409399B7',
    value: 79000000n,
    logIndex: 5
  };

  return x402VerifyReceipt._test.buildReceiptBinding({
    tx,
    transfer,
    recipient: transfer.to,
    productSlug: 'agent-commerce-market-map-2026',
    expectedRaw: 79000000n,
    quoteId: 'quote-upstash',
    customerRef: 'cust-upstash',
    requestId: 'req-upstash',
    ...overrides
  });
}

async function testUpstashReceiptConsumptionUsesSetNx() {
  const previousBackend = process.env.AWM_X402_RECEIPT_STORE_BACKEND;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousFetch = global.fetch;
  const redis = new Map();

  process.env.AWM_X402_RECEIPT_STORE_BACKEND = 'upstash-redis';
  process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  global.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    const [op, key, value, mode] = command;
    if (op === 'SET' && mode === 'NX') {
      if (redis.has(key)) {
        return { ok: true, json: async () => ({ result: null }) };
      }
      redis.set(key, value);
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (op === 'SET') {
      redis.set(key, value);
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (op === 'GET') {
      return { ok: true, json: async () => ({ result: redis.get(key) || null }) };
    }
    throw new Error(`unexpected command ${op}`);
  };

  try {
    const binding = makeBinding();
    const first = await consumeReceipt(binding, { source: 'test-upstash' });
    const replay = await consumeReceipt(binding, { source: 'test-upstash' });
    const changedScope = await consumeReceipt(
      makeBinding({ quoteId: 'quote-upstash-other' }),
      { source: 'test-upstash' }
    );

    assert.strictEqual(first.accepted, true);
    assert.strictEqual(first.storeBackend, 'upstash-redis');
    assert.strictEqual(replay.accepted, false);
    assert.strictEqual(replay.reason, 'payment_already_consumed');
    assert.strictEqual(changedScope.accepted, false);
    assert.strictEqual(changedScope.reason, 'payment_ref_scope_conflict');
  } finally {
    if (previousBackend === undefined) delete process.env.AWM_X402_RECEIPT_STORE_BACKEND;
    else process.env.AWM_X402_RECEIPT_STORE_BACKEND = previousBackend;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    global.fetch = previousFetch;
  }
}

async function testProductionRejectsEphemeralReceiptStore() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBackend = process.env.AWM_X402_RECEIPT_STORE_BACKEND;
  const previousAllowLocal = process.env.AWM_X402_ALLOW_LOCAL_RECEIPT_STORE;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  process.env.NODE_ENV = 'production';
  delete process.env.AWM_X402_RECEIPT_STORE_BACKEND;
  delete process.env.AWM_X402_ALLOW_LOCAL_RECEIPT_STORE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  try {
    await assert.rejects(
      () => consumeReceipt(makeBinding(), { source: 'test-production' }),
      /durable_receipt_store_required/
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBackend === undefined) delete process.env.AWM_X402_RECEIPT_STORE_BACKEND;
    else process.env.AWM_X402_RECEIPT_STORE_BACKEND = previousBackend;
    if (previousAllowLocal === undefined) delete process.env.AWM_X402_ALLOW_LOCAL_RECEIPT_STORE;
    else process.env.AWM_X402_ALLOW_LOCAL_RECEIPT_STORE = previousAllowLocal;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
}

async function main() {
  await testRejectsInvalidTxHash();
  await testRejectsUnknownProductBeforeRpc();
  await testPaymentRequestExposesX402Rail();
  await testAgentProductsExposeX402Rail();
  testReceiptBindingIsStableAndScoped();
  await testReceiptConsumptionRejectsReplayAndScopeConflict();
  testRateLimitRejectsBurst();
  testConsumeSignatureVerification();
  await testConsumeRejectsUnsignedQueryParams();
  await testUpstashReceiptConsumptionUsesSetNx();
  await testProductionRejectsEphemeralReceiptStore();

  console.log('x402 receipt verifier smoke tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
