const fs = require('fs');
const path = require('path');

function storePath() {
  return process.env.AWM_X402_RECEIPT_STORE_PATH ||
    path.join(process.cwd(), 'artifacts', 'x402-receipts.json');
}

function upstashConfig() {
  const url = process.env.AWM_X402_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.AWM_X402_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return {
    url: url.replace(/\/$/, ''),
    token
  };
}

function hasUpstashConfig() {
  const config = upstashConfig();
  return Boolean(config.url && config.token);
}

function storeBackend() {
  const configured = String(process.env.AWM_X402_RECEIPT_STORE_BACKEND || '').trim().toLowerCase();
  if (configured) return configured;
  if (hasUpstashConfig()) return 'upstash-redis';
  return 'local-json';
}

function assertDurableBackend() {
  const backend = storeBackend();
  const production = process.env.NODE_ENV === 'production';
  const explicitLocal = process.env.AWM_X402_ALLOW_LOCAL_RECEIPT_STORE === '1';

  if (production && backend === 'local-json' && !explicitLocal) {
    const err = new Error('durable_receipt_store_required');
    err.statusCode = 503;
    err.publicMessage =
      'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN before enabling consume=true in production.';
    throw err;
  }

  return backend;
}

function ensureLocalStore() {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ receipts: {}, fulfillments: {} }, null, 2));
  }
}

function readStore() {
  ensureLocalStore();
  return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
}

function writeStore(data) {
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
}

function validateBinding(binding) {
  if (!binding || !binding.paymentRef || !binding.fulfillmentRef) {
    const err = new Error('receipt_binding_invalid');
    err.statusCode = 400;
    throw err;
  }
}

function receiptRecord(binding, context = {}) {
  return {
    paymentRef: binding.paymentRef,
    fulfillmentRef: binding.fulfillmentRef,
    scope: binding.scope,
    consumedAt: new Date().toISOString(),
    context
  };
}

function replayResult(binding, existing) {
  const sameScope = existing.fulfillmentRef === binding.fulfillmentRef;
  return {
    accepted: false,
    replay: true,
    reason: sameScope ? 'payment_already_consumed' : 'payment_ref_scope_conflict',
    paymentRef: binding.paymentRef,
    fulfillmentRef: binding.fulfillmentRef,
    storeBackend: storeBackend(),
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

function acceptedResult(record, backend) {
  return {
    accepted: true,
    replay: false,
    reason: 'receipt_consumed',
    paymentRef: record.paymentRef,
    fulfillmentRef: record.fulfillmentRef,
    consumedAt: record.consumedAt,
    storeBackend: backend
  };
}

async function upstashCommand(command) {
  const config = upstashConfig();
  if (!config.url || !config.token) {
    const err = new Error('upstash_redis_not_configured');
    err.statusCode = 503;
    throw err;
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.error) {
    const err = new Error(body.error || `upstash_${response.status}`);
    err.statusCode = response.status || 503;
    throw err;
  }

  return body.result;
}

function parseStoredRecord(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(String(value));
}

async function consumeWithUpstash(binding, context = {}) {
  const record = receiptRecord(binding, context);
  const paymentKey = binding.replayGuard?.storageKeys?.payment || `x402-payment:${binding.paymentRef}`;
  const fulfillmentKey =
    binding.replayGuard?.storageKeys?.fulfillment || `x402-fulfillment:${binding.fulfillmentRef}`;
  const stored = JSON.stringify(record);

  const setResult = await upstashCommand(['SET', paymentKey, stored, 'NX']);
  if (setResult === 'OK') {
    try {
      await upstashCommand(['SET', fulfillmentKey, binding.paymentRef]);
    } catch (err) {
      console.warn('[AWM-WARN] x402 fulfillment index write failed:', err.message);
    }
    return acceptedResult(record, 'upstash-redis');
  }

  const existing = parseStoredRecord(await upstashCommand(['GET', paymentKey]));
  if (!existing) {
    const err = new Error('receipt_store_race_unreadable');
    err.statusCode = 503;
    throw err;
  }
  return replayResult(binding, existing);
}

function consumeWithLocalJson(binding, context = {}) {
  const data = readStore();
  const existing = data.receipts[binding.paymentRef];
  if (existing) return replayResult(binding, existing);

  const record = receiptRecord(binding, context);
  data.receipts[binding.paymentRef] = record;
  data.fulfillments[binding.fulfillmentRef] = binding.paymentRef;
  writeStore(data);

  return acceptedResult(record, 'local-json');
}

async function consumeReceipt(binding, context = {}) {
  validateBinding(binding);
  const backend = assertDurableBackend();

  if (backend === 'upstash' || backend === 'upstash-redis' || backend === 'redis') {
    return consumeWithUpstash(binding, context);
  }

  if (backend === 'local-json') {
    return consumeWithLocalJson(binding, context);
  }

  const err = new Error('receipt_store_backend_unsupported');
  err.statusCode = 500;
  throw err;
}

module.exports = {
  consumeReceipt,
  readStore,
  _test: {
    acceptedResult,
    assertDurableBackend,
    consumeWithLocalJson,
    consumeWithUpstash,
    hasUpstashConfig,
    parseStoredRecord,
    replayResult,
    storeBackend,
    upstashCommand
  }
};
