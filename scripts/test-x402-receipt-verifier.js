#!/usr/bin/env node
'use strict';

const assert = require('assert');
const agentProducts = require('../api/agent-products');
const paymentRequest = require('../api/payment-request');
const x402VerifyReceipt = require('../api/x402-verify-receipt');

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

async function main() {
  await testRejectsInvalidTxHash();
  await testRejectsUnknownProductBeforeRpc();
  await testPaymentRequestExposesX402Rail();
  await testAgentProductsExposeX402Rail();

  console.log('x402 receipt verifier smoke tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
