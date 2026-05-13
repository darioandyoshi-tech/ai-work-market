#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STRIPE_API = 'https://api.stripe.com/v1';
const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ORIGIN = process.env.AWM_PUBLIC_ORIGIN || 'https://ai-work-market.vercel.app';
const OUT = path.join(process.cwd(), 'products/payment-links.json');

const products = [
  {
    slug: 'agent-commerce-market-map-2026',
    name: 'Agent Commerce Market Map 2026',
    description: 'Verified research packet on agent commerce protocols, marketplaces, and AI work settlement opportunities.',
    unit_amount: 7900,
    checkoutAnchor: 'market-map',
    successPath: '/products?paid=agent-commerce-market-map-2026'
  },
  {
    slug: 'awm-work-intake-n8n',
    name: 'AI Work Intake → Escrow → Proof n8n Workflow',
    description: 'n8n workflow template for AI work intake, escrow tracking, proof collection, and release/dispute routing.',
    unit_amount: 4900,
    checkoutAnchor: 'n8n-workflow',
    successPath: '/products?paid=awm-work-intake-n8n'
  },
  {
    slug: 'x402-escrow-integration-sprint',
    name: 'x402 → Escrow Integration Sprint',
    description: '48-hour implementation sprint connecting x402-style payment handoff to AI Work Market escrow/proof flows.',
    unit_amount: 150000,
    checkoutAnchor: 'integration-sprint',
    successPath: '/integration-sprint?paid=x402-escrow-integration-sprint'
  }
];

function usage() {
  console.log(`Create Stripe products, prices, and payment links for AI Work Market.\n\nUsage:\n  STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-payment-links.js\n\nOptions:\n  --dry-run   Show intended Stripe objects without calling Stripe\n\nOutput:\n  ${OUT}\n`);
}

function form(obj, prefix) {
  const params = new URLSearchParams();
  function add(key, value) {
    if (value === undefined || value === null) return;
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) add(`${key}[${k}]`, v);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else {
      params.append(key, String(value));
    }
  }
  for (const [k, v] of Object.entries(obj)) add(prefix ? `${prefix}[${k}]` : k, v);
  return params;
}

async function stripe(method, endpoint, body, idempotencyKey) {
  const res = await fetch(`${STRIPE_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: body ? form(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `${res.status} ${res.statusText}`;
    throw new Error(`${method} ${endpoint}: ${msg}`);
  }
  return json;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) return usage();
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set. Put it in /home/dario/.config/yoshi-payments/stripe.env or export it privately, then retry.');
    process.exit(2);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    mode: (SECRET_KEY?.startsWith('sk_live_') || SECRET_KEY?.startsWith('rk_live_')) ? 'live' : (SECRET_KEY?.startsWith('sk_test_') || SECRET_KEY?.startsWith('rk_test_')) ? 'test' : dryRun ? 'dry_run' : 'unknown',
    publicOrigin: ORIGIN,
    products: []
  };

  for (const item of products) {
    if (dryRun) {
      result.products.push({ ...item, currency: 'usd', paymentLinkUrl: null, dryRun: true });
      continue;
    }

    const product = await stripe('POST', '/products', {
      name: item.name,
      description: item.description,
      metadata: { app: 'ai-work-market', slug: item.slug, created_by: 'yoshi' }
    }, `awm-product-${item.slug}-v1`);

    const price = await stripe('POST', '/prices', {
      product: product.id,
      currency: 'usd',
      unit_amount: item.unit_amount,
      metadata: { app: 'ai-work-market', slug: item.slug }
    }, `awm-price-${item.slug}-usd-v1`);

    const paymentLink = await stripe('POST', '/payment_links', {
      line_items: { 0: { price: price.id, quantity: 1 } },
      after_completion: { type: 'redirect', redirect: { url: `${ORIGIN}${item.successPath}` } },
      metadata: { app: 'ai-work-market', slug: item.slug }
    }, `awm-payment-link-${item.slug}-v1`);

    result.products.push({
      slug: item.slug,
      name: item.name,
      currency: 'usd',
      unitAmount: item.unit_amount,
      productId: product.id,
      priceId: price.id,
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.url
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(`Wrote ${OUT}`);
  for (const p of result.products) console.log(`${p.slug}: ${p.paymentLinkUrl || '(dry-run)'}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
