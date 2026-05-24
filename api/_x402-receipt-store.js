const fs = require('fs');
const path = require('path');

function storePath() {
  return process.env.AWM_X402_RECEIPT_STORE_PATH ||
    path.join(process.cwd(), 'artifacts', 'x402-receipts.json');
}

function ensureStore() {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[AWM-WARN] Production mode detected. Local x402 receipt store is EPHEMERAL. Replace with durable KV/Postgres before automated fulfillment.');
  }
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ receipts: {}, fulfillments: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
}

function writeStore(data) {
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
}

function consumeReceipt(binding, context = {}) {
  if (!binding || !binding.paymentRef || !binding.fulfillmentRef) {
    const err = new Error('receipt_binding_invalid');
    err.statusCode = 400;
    throw err;
  }

  const data = readStore();
  const existing = data.receipts[binding.paymentRef];
  if (existing) {
    const sameScope = existing.fulfillmentRef === binding.fulfillmentRef;
    return {
      accepted: false,
      replay: true,
      reason: sameScope ? 'payment_already_consumed' : 'payment_ref_scope_conflict',
      paymentRef: binding.paymentRef,
      fulfillmentRef: binding.fulfillmentRef,
      existing: {
        fulfillmentRef: existing.fulfillmentRef,
        consumedAt: existing.consumedAt,
        productSlug: existing.scope?.productSlug ?? null,
        quoteId: existing.scope?.quoteId ?? null,
        customerRef: existing.scope?.customerRef ?? null,
        requestId: existing.scope?.requestId ?? null
      }
    };
  }

  const record = {
    paymentRef: binding.paymentRef,
    fulfillmentRef: binding.fulfillmentRef,
    scope: binding.scope,
    consumedAt: new Date().toISOString(),
    context
  };
  data.receipts[binding.paymentRef] = record;
  data.fulfillments[binding.fulfillmentRef] = binding.paymentRef;
  writeStore(data);

  return {
    accepted: true,
    replay: false,
    reason: 'receipt_consumed',
    paymentRef: binding.paymentRef,
    fulfillmentRef: binding.fulfillmentRef,
    consumedAt: record.consumedAt
  };
}

module.exports = {
  consumeReceipt,
  readStore
};
