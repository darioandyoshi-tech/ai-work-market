// api/x402-consume.js
// Single-call tool for AI agents: given a USDC tx hash and a product slug,
// verify the transfer, bind it to the product, and return a signed delivery
// URL — all in one POST. No polling, no three-step dance.
//
// This is the read-only/quote variant: it does not mutate persistent state.
// The full bind + delivery-URL issuance uses the same logic as
// /api/x402-verify-receipt (consume=true) — but we don't call that here, we
// re-implement the parts we need so the agent's surface area is one endpoint.
//
// Required headers:
//   x-awm-signature:   sha256=<hmac(joined(claim, ts, bodyHash), AWM_X402_CONSUME_SECRET)>
//   x-awm-timestamp:   unix seconds, must be within 5 minutes of server clock
//
// Required body:
//   { tx: "0x...", slug: "awm-work-intake-n8n", requestId: "..." }

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const NETWORKS = {
  mainnet: { label: 'base-mainnet', chainId: 8453, rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  sepolia: { label: 'base-sepolia', chainId: 84532, rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
};

const USDC_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const HMAC_HEADER = 'x-awm-signature';
const TS_HEADER = 'x-awm-timestamp';
const TOLERANCE_SECONDS = 5 * 60;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function loadProducts() {
  const p = path.join(__dirname, '..', 'products', 'catalog.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return raw.products || [];
}

function findProduct(slug) {
  return loadProducts().find((p) => p.id === slug || p.slug === slug);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 64 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.x402-consume.v1',
      method: 'POST',
      auth: {
        type: 'hmac',
        headers: { 'x-awm-signature': 'sha256=<hex>', 'x-awm-timestamp': 'unix seconds' },
        signing: 'hex(hmac_sha256(claim + "." + timestamp + "." + sha256(body), AWM_X402_CONSUME_SECRET))',
        toleranceSeconds: TOLERANCE_SECONDS,
        claim: 'The product slug you are paying for. The signature is bound to the claim so it cannot be replayed across slugs.',
      },
      body: {
        tx: '0x... (required, USDC transfer tx on Base Mainnet)',
        slug: 'string (required, product id)',
        requestId: 'string (required, your correlation id)',
        customerRef: 'string (optional, your customer ref for delivery)',
      },
      response: {
        ok: true,
        verified: true,
        bound: true,
        requestId: 'echoed back',
        intentId: 'matching intent (if one exists in the persistent store)',
        signedDeliveryUrl: 'https://ai-work-market.ai/api/private-delivery-download?token=... — 24h TTL',
        receipt: { tx: '0x...', block: 'uint256', from: 'address', to: 'address', amountRaw: 'string', amountUsdc: 'string', timestamp: 'iso8601' },
      },
      errors: {
        400: 'bad_request (missing/invalid tx, slug, requestId, or claim)',
        401: 'missing/bad HMAC signature or timestamp out of window',
        404: 'unknown slug',
        422: 'receipt invalid (wrong amount, wrong recipient, wrong token, or insufficient confirmations)',
        409: 'receipt already bound to a different slug',
      },
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // ---- HMAC verify ----
  const secret = process.env.AWM_X402_CONSUME_SECRET;
  if (!secret) {
    return json(res, 503, { error: 'consume_disabled', hint: 'Server has no AWM_X402_CONSUME_SECRET configured. Use /api/x402-verify-receipt (GET) for un-signed verification.' });
  }
  const tsHeader = String(req.headers[TS_HEADER] || '');
  const sigHeader = String(req.headers[HMAC_HEADER] || '');
  if (!tsHeader || !sigHeader) {
    return json(res, 401, { error: 'missing_signature', hint: 'Send x-awm-signature and x-awm-timestamp' });
  }
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) return json(res, 401, { error: 'bad_timestamp' });
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) {
    return json(res, 401, { error: 'timestamp_out_of_window', serverNow: now, got: ts });
  }

  // Read body
  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, 400, { error: 'bad_request', message: e.message }); }

  const { tx, slug, requestId, customerRef } = body;
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return json(res, 400, { error: 'bad_tx', message: 'tx must be a 32-byte hex hash' });
  if (!slug || typeof slug !== 'string') return json(res, 400, { error: 'bad_slug' });
  if (!requestId || typeof requestId !== 'string') return json(res, 400, { error: 'bad_requestId' });

  // Verify HMAC: hex(hmac_sha256(claim + "." + ts + "." + sha256(body_json), secret))
  const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const signingString = `${slug}.${ts}.${bodyHash}`;
  const expected = crypto.createHmac('sha256', secret).update(signingString).digest('hex');
  // Sig header may be "sha256=<hex>" or just "<hex>"
  const provided = sigHeader.replace(/^sha256=/, '').toLowerCase();
  if (!timingSafeEqual(provided, expected)) {
    return json(res, 401, { error: 'bad_signature' });
  }

  // ---- Look up the product ----
  const product = findProduct(slug);
  if (!product) return json(res, 404, { error: 'unknown_slug' });

  // ---- Verify the USDC tx on Base Mainnet ----
  const cfg = NETWORKS.mainnet;
  let provider;
  try {
    provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId);
  } catch (e) {
    return json(res, 500, { error: 'rpc_unreachable' });
  }

  let receipt, txBlock, txObj;
  try {
    [receipt, txObj] = await Promise.all([
      provider.getTransactionReceipt(tx),
      provider.getTransaction(tx),
    ]);
  } catch (e) {
    return json(res, 502, { error: 'rpc_lookup_failed', message: e.message });
  }
  if (!receipt || !txObj) {
    return json(res, 422, { error: 'receipt_not_found', hint: 'Wait for the tx to be mined and try again.' });
  }
  if (receipt.status !== 1) {
    return json(res, 422, { error: 'tx_reverted' });
  }

  // Parse the Transfer event from USDC
  const usdc = new ethers.Contract(cfg.usdc, USDC_ABI, provider);
  const transferTopic = usdc.interface.getEvent('Transfer').topicHash;
  const transferLog = receipt.logs.find((l) => l.address.toLowerCase() === cfg.usdc.toLowerCase() && l.topics[0] === transferTopic);
  if (!transferLog) {
    return json(res, 422, { error: 'no_usdc_transfer', hint: 'The tx does not contain a USDC Transfer event to the marketplace treasury.' });
  }
  const parsed = usdc.interface.parseLog(transferLog);
  const from = parsed.args.from;
  const to = parsed.args.to;
  const value = parsed.args.value;

  // Recipient must be the x402 treasury configured for this product
  const expectedRecipient = (product.x402 && product.x402.payTo) || process.env.AWM_X402_TREASURY;
  if (!expectedRecipient || to.toLowerCase() !== expectedRecipient.toLowerCase()) {
    return json(res, 422, { error: 'wrong_recipient', got: to, expected: expectedRecipient });
  }

  // Amount must meet or exceed the product price
  const priceRaw = (product.x402 && product.x402.amountRaw) || '0';
  if (BigInt(value.toString()) < BigInt(priceRaw)) {
    return json(res, 422, { error: 'insufficient_amount', gotRaw: value.toString(), expectedRaw: priceRaw, gotUsd: ethers.formatUnits(value, 6), expectedUsd: ethers.formatUnits(priceRaw, 6) });
  }

  // Finality: require 12 block confirmations
  const head = await provider.getBlockNumber();
  const confs = head - receipt.blockNumber + 1;
  if (confs < 12) {
    return json(res, 425, { error: 'insufficient_confirmations', got: confs, required: 12, currentBlock: head, txBlock: receipt.blockNumber });
  }

  // Bind the receipt: store it in the local receipts file (read-only pattern;
  // the same file is written by /api/x402-verify-receipt). Idempotent: if a
  // receipt with this tx+slug is already bound, we just re-issue a delivery
  // URL.
  const txBlockObj = await provider.getBlock(receipt.blockNumber);
  const ts2 = txBlockObj ? Number(txBlockObj.timestamp) : Math.floor(Date.now() / 1000);

  // Persist (or read existing) via the shared store.
  // The shared store uses { paymentRef: tx, fulfillmentRef, scope: {productSlug, requestId, customerRef} }
  const storePath = path.join(__dirname, '_x402-receipt-store.js');
  const intentId = null;
  let consumeResult;
  try {
    const store = require(storePath);
    consumeResult = await store.consumeReceipt({
      paymentRef: tx.toLowerCase(),
      fulfillmentRef: requestId,
      scope: { productSlug: slug, requestId, customerRef: customerRef || null, quoteId: null },
    }, {
      tx: tx.toLowerCase(),
      from: from.toLowerCase(),
      to: to.toLowerCase(),
      amountRaw: value.toString(),
      blockNumber: receipt.blockNumber,
      confirmations: confs,
      timestamp: ts2,
    });
  } catch (e) {
    if (e && e.statusCode) {
      return json(res, e.statusCode, { error: e.message, hint: e.publicMessage });
    }
    return json(res, 500, { error: 'store_failure', message: e.message });
  }

  // Idempotency / replay check: if the same paymentRef was used with a
  // different fulfillmentRef, reject so a single tx can't unlock multiple
  // products. If the fulfillmentRef matches (same requestId), the result is
  // a replay and we re-issue a delivery URL.
  if (!consumeResult.replay && consumeResult.reason === 'payment_ref_scope_conflict') {
    return json(res, 409, { error: 'payment_ref_scope_conflict', existing: consumeResult.existing });
  }
  const persisted = {
    tx: tx.toLowerCase(),
    slug,
    requestId,
    customerRef: customerRef || null,
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    amountRaw: value.toString(),
    amountUsdc: ethers.formatUnits(value, 6),
    blockNumber: receipt.blockNumber,
    confirmations: confs,
    timestamp: ts2,
    boundAt: consumeResult.consumedAt || new Date().toISOString(),
  };

  // Issue a signed delivery URL (24h TTL)
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const tokenPayload = {
    slug,
    requestId,
    tx: persisted.tx,
    expiresAt,
  };
  const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(token).digest('base64url');
  const signedDeliveryUrl = `https://ai-work-market.ai/api/private-delivery-download?token=${token}.${sig}`;

  return json(res, 200, {
    schema: 'ai-work-market.x402-consume.v1',
    ok: true,
    verified: true,
    bound: !consumeResult.replay,
    replay: consumeResult.replay,
    requestId,
    slug,
    intentId,
    signedDeliveryUrl,
    expiresAt,
    receipt: {
      tx: persisted.tx,
      block: persisted.blockNumber,
      confirmations: persisted.confirmations,
      from: persisted.from,
      to: persisted.to,
      amountRaw: persisted.amountRaw,
      amountUsdc: persisted.amountUsdc,
      timestamp: new Date(persisted.timestamp * 1000).toISOString(),
    },
  });
};
