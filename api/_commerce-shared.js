const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Use absolute paths for resilience on Vercel/different environments
const CATALOG_PATH = path.join(process.cwd(), 'products', 'catalog.json');
const PAYMENT_LINKS_PATH = path.join(process.cwd(), 'products', 'payment-links.json');

let cachedCatalog = null;
let cachedPaymentLinks = null;

/**
 * Safe JSON loader with fallback.
 * Ensures the API doesn't crash if JSON files are malformed or missing.
 */
function safeLoadJson(filePath, fallbackValue = { products: [] }) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[AWM_Sovereign] File not found: ${filePath}. Using safe mode fallback.`);
      return fallbackValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[AWM_Sovereign] JSON Parse Error in ${filePath}:`, err);
    return fallbackValue;
  }
}

function getCatalog() {
  if (cachedCatalog) return cachedCatalog;
  cachedCatalog = safeLoadJson(CATALOG_PATH);
  return cachedCatalog;
}

function getPaymentLinks() {
  if (cachedPaymentLinks) return cachedPaymentLinks;
  cachedPaymentLinks = safeLoadJson(PAYMENT_LINKS_PATH);
  return cachedPaymentLinks;
}

const STRIPE_API = 'https://api.stripe.com/v1';

function productBySlug(slug) {
  return (getCatalog().products || []).find((p) => p.slug === slug);
}

function linkByPaymentLinkId(id) {
  return (getPaymentLinks().products || []).find((p) => p.paymentLinkId === id);
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

async function stripeGet(path, retries = 3) {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('stripe_secret_missing');
    err.statusCode = 503;
    throw err;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${STRIPE_API}${path}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok) return json;

      // Only retry on 5xx errors or network timeouts
      if (res.status < 500) {
        const err = new Error(json?.error?.message || `stripe_${res.status}`);
        err.statusCode = res.status;
        throw err;
      }

      if (i === retries - 1) {
        const err = new Error(json?.error?.message || `stripe_${res.status}`);
        err.statusCode = res.status;
        throw err;
      }

      // Exponential backoff: 100ms, 400ms, 1600ms...
      await new Promise(resolve => setTimeout(resolve, Math.pow(4, i) * 100));

    } catch (err) {
      // If it's a 4xx error, don't retry
      if (err.statusCode && err.statusCode < 500) throw err;
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, Math.pow(4, i) * 100));
    }
  }
}

function paidSession(session) {
  return session?.payment_status === 'paid' || session?.status === 'complete';
}

let cachedManifest = null;

function loadDeliveryManifest() {
  if (cachedManifest) return cachedManifest;
  if (!process.env.AWM_PRIVATE_DELIVERY_MANIFEST) {
    cachedManifest = {};
    return cachedManifest;
  }
  try {
    cachedManifest = JSON.parse(process.env.AWM_PRIVATE_DELIVERY_MANIFEST);
    return cachedManifest;
  } catch (err) {
    err.statusCode = 500;
    err.publicMessage = 'private_delivery_manifest_invalid';
    throw err;
  }
}

function bundleForProduct(product) {
  if (!product || typeof product.slug !== 'string') return null;
  const manifest = loadDeliveryManifest();
  return manifest[product.slug] || null;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'private, no-store');
  res.end(JSON.stringify(body, null, 2));
}

function errorResponse(res, code, message, status = 500) {
  return json(res, status, {
    error: code,
    message: message,
    timestamp: new Date().toISOString()
  });
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
  json,
  errorResponse,
  getCatalog,
  getPaymentLinks
};
