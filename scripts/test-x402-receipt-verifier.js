#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

function testReceiptConsumptionRejectsReplayAndScopeConflict() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awm-x402-receipts-'));
  const previousStore = process.env.AWM_X402_RECEIPT_STORE_PATH;
  process.env.AWM_X402_RECEIPT_STORE_PATH = path.join(tmpDir, 'receipts.json');
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
    const first = consumeReceipt(binding, { source: 'test' });
    const replay = consumeReceipt(binding, { source: 'test' });
    const changedScope = consumeReceipt(
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  await testRejectsInvalidTxHash();
  await testRejectsUnknownProductBeforeRpc();
  await testPaymentRequestExposesX402Rail();
  await testAgentProductsExposeX402Rail();
  testReceiptBindingIsStableAndScoped();
  testReceiptConsumptionRejectsReplayAndScopeConflict();

  console.log('x402 receipt verifier smoke tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
