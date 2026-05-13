const crypto = require('crypto');
const catalog = require('../products/catalog.json');
const paymentLinks = require('../products/payment-links.json');

const STRIPE_API = 'https://api.stripe.com/v1';

function productBySlug(slug) {
  return (catalog.products || []).find((p) => p.slug === slug);
}

function linkByPaymentLinkId(id) {
  return (paymentLinks.products || []).find((p) => p.paymentLinkId === id);
}

function productForSession(session) {
  const metadataSlug = session?.metadata?.slug || session?.metadata?.product_slug || session?.metadata?.awm_product;
  if (metadataSlug && productBySlug(metadataSlug)) return productBySlug(metadataSlug);
  const link = linkByPaymentLinkId(session?.payment_link);
  if (link && productBySlug(link.slug)) return productBySlug(link.slug);
  return null;
}

function safeSessionId(value) {
  const s = String(value || '').trim();
  return /^cs_(test|live)_[A-Za-z0-9_]+$/.test(s) ? s : '';
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hmacValue(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

async function stripeGet(path) {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('stripe_secret_missing');
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `stripe_${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  return json;
}

function paidSession(session) {
  return session?.payment_status === 'paid' || session?.status === 'complete';
}

function loadDeliveryManifest() {
  if (!process.env.AWM_PRIVATE_DELIVERY_MANIFEST) return {};
  try {
    return JSON.parse(process.env.AWM_PRIVATE_DELIVERY_MANIFEST);
  } catch (err) {
    err.statusCode = 500;
    err.publicMessage = 'private_delivery_manifest_invalid';
    throw err;
  }
}

function bundleForProduct(product) {
  const manifest = loadDeliveryManifest();
  return manifest[product.slug] || null;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'private, no-store');
  res.end(JSON.stringify(body, null, 2));
}

module.exports = {
  productBySlug,
  productForSession,
  safeSessionId,
  hashValue,
  hmacValue,
  stripeGet,
  paidSession,
  bundleForProduct,
  json
};
