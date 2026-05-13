#!/usr/bin/env node
'use strict';

const DEFAULT_ORIGIN = 'https://ai-work-market.vercel.app';
const DEFAULT_SLUG = 'agent-commerce-market-map-2026';
const REQUEST_TIMEOUT_MS = Number(process.env.AWM_CLIENT_TIMEOUT_MS || 15_000);

function parseArgs(argv) {
  const args = {
    origin: process.env.AWM_ORIGIN || DEFAULT_ORIGIN,
    slug: process.env.AWM_PRODUCT_SLUG || DEFAULT_SLUG,
    sessionId: process.env.AWM_CHECKOUT_SESSION_ID || '',
    accessToken: process.env.AWM_ACCESS_TOKEN || '',
    json: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--origin' || arg === '--base-url') args.origin = argv[++i];
    else if (arg === '--slug') args.slug = argv[++i];
    else if (arg === '--session-id') args.sessionId = argv[++i];
    else if (arg === '--access-token') args.accessToken = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node examples/agent-commerce/agent-payment-client.js [options]

Options:
  --slug <slug>            Product slug (default: ${DEFAULT_SLUG})
  --origin, --base-url <url>
                           AI Work Market origin (default: ${DEFAULT_ORIGIN})
  --session-id <id>        Optional Stripe Checkout Session ID to verify receipt/delivery status
  --access-token <token>   Optional protected-resource bearer token for local/test deployments
  --json                   Print raw JSON summary
  -h, --help               Show help

Examples:
  node examples/agent-commerce/agent-payment-client.js
  node examples/agent-commerce/agent-payment-client.js --slug awm-work-intake-n8n
  node examples/agent-commerce/agent-payment-client.js --session-id cs_live_...
`;
}

function safeUrl(origin, pathname, params) {
  const url = new URL(pathname, origin);
  for (const [key, value] of Object.entries(params || {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

function safeSessionId(value) {
  return /^cs_(test|live)_[A-Za-z0-9_]+$/.test(String(value || '').trim());
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      body = { raw: text };
    }
    return {
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body
    };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function summarizePaymentChallenge(result) {
  const body = result.body || {};
  return {
    httpStatus: result.status,
    paymentRequired: result.status === 402 || Boolean(body.paymentRequired),
    product: body.product || null,
    checkoutUrl: body.payment && body.payment.checkoutUrl,
    paymentRail: body.payment && body.payment.currentRail,
    afterCompletionUrl: body.payment && body.payment.afterCompletionUrl,
    paymentLinkHeader: result.headers.link || null,
    amount: body.payment && body.payment.amount,
    protectedResource: body.resource && body.resource.url,
    sampleUrl: body.resource && body.resource.sampleUrl,
    proof: body.proof || null,
    fulfillment: body.fulfillment || null,
    protocolNotes: body.protocolNotes || null
  };
}

function printHuman(summary, receipt, delivery) {
  console.log('AI Work Market agent payment client');
  console.log('-----------------------------------');
  console.log(`HTTP status: ${summary.httpStatus}`);

  if (summary.paymentRequired) {
    console.log('Payment required: yes');
    if (summary.product) {
      console.log(`Product: ${summary.product.name || summary.product.id} (${summary.product.id})`);
      if (summary.product.priceUsd !== undefined) console.log(`Price: $${summary.product.priceUsd}`);
    }
    console.log(`Rail: ${summary.paymentRail || 'unknown'}`);
    console.log(`Checkout: ${summary.checkoutUrl || 'missing'}`);
    if (summary.afterCompletionUrl) console.log(`After completion: ${summary.afterCompletionUrl}`);
    if (summary.paymentLinkHeader) {
      console.log(`Payment Link header: ${summary.paymentLinkHeader}`);
      if (summary.checkoutUrl && !summary.paymentLinkHeader.includes(summary.checkoutUrl)) {
        console.log('Warning: Link header checkout URL differs from JSON payment.checkoutUrl; prefer JSON unless integration docs say otherwise.');
      }
    }
    if (summary.sampleUrl) console.log(`Sample: ${summary.sampleUrl}`);
    if (summary.proof && summary.proof.sha256) console.log(`Proof SHA-256: ${summary.proof.sha256}`);
    if (summary.fulfillment && summary.fulfillment.automatedDownloadStatus) {
      console.log(`Fulfillment: ${summary.fulfillment.automatedDownloadStatus}`);
    }
    if (summary.protocolNotes && summary.protocolNotes.aiWorkMarketEscrow) {
      console.log(`Escrow boundary: ${summary.protocolNotes.aiWorkMarketEscrow}`);
    }
  } else {
    console.log('Payment required: no');
  }

  if (receipt) {
    console.log('\nReceipt verification');
    console.log(`- HTTP status: ${receipt.status}`);
    console.log(`- Verified: ${Boolean(receipt.body && receipt.body.verified)}`);
    if (receipt.body && receipt.body.product) console.log(`- Product: ${receipt.body.product.id}`);
    if (receipt.body && receipt.body.checkoutSession) {
      console.log(`- Payment status: ${receipt.body.checkoutSession.paymentStatus}`);
    }
  }

  if (delivery) {
    console.log('\nDelivery status');
    console.log(`- HTTP status: ${delivery.status}`);
    console.log(`- Verified: ${Boolean(delivery.body && delivery.body.verified)}`);
    if (delivery.body && delivery.body.delivery) {
      console.log(`- State: ${delivery.body.delivery.state}`);
      console.log(`- Signed link available: ${Boolean(delivery.body.delivery.signedLinkAvailable)}`);
      console.log(`- Asset URLs returned: ${!Boolean(delivery.body.safety && delivery.body.safety.noAssetUrlsReturned)}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  if (args.sessionId && !safeSessionId(args.sessionId)) {
    throw new Error('Invalid --session-id. Expected a Stripe Checkout Session ID shaped like cs_test_... or cs_live_...');
  }

  const protectedUrl = safeUrl(args.origin, '/api/protected-resource', { slug: args.slug });
  const headers = args.accessToken ? { authorization: `Bearer ${args.accessToken}` } : undefined;
  const challenge = await fetchJson(protectedUrl, { headers });
  const summary = summarizePaymentChallenge(challenge);

  let receipt = null;
  let delivery = null;
  if (args.sessionId) {
    receipt = await fetchJson(safeUrl(args.origin, '/api/fulfillment-receipt', { session_id: args.sessionId }));
    delivery = await fetchJson(safeUrl(args.origin, '/api/delivery-status', { session_id: args.sessionId }));
  }

  const output = {
    schema: 'ai-work-market.agent-payment-client-result.v1',
    protectedResourceUrl: protectedUrl.toString(),
    challenge: summary,
    receipt: receipt && { status: receipt.status, body: receipt.body },
    delivery: delivery && { status: delivery.status, body: delivery.body }
  };

  if (args.json) console.log(JSON.stringify(output, null, 2));
  else printHuman(summary, receipt, delivery);
}

main().catch((err) => {
  console.error(`agent-payment-client failed: ${err.message}`);
  process.exit(1);
});
