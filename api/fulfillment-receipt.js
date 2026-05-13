const catalog = require('../products/catalog.json');
const paymentLinks = require('../products/payment-links.json');

const STRIPE_API = 'https://api.stripe.com/v1';
const ORIGIN = 'https://ai-work-market.vercel.app';

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

function receiptFor(session, product) {
  const paid = session.payment_status === 'paid' || session.status === 'complete';
  return {
    schema: 'ai-work-market.fulfillment-receipt.v1',
    verified: paid,
    mode: 'manual_v1',
    checkoutSession: {
      id: session.id,
      livemode: Boolean(session.livemode),
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency
    },
    product: {
      id: product.slug,
      name: product.name,
      type: product.type,
      priceUsd: product.priceUsd
    },
    fulfillment: {
      paidAssetsPublic: false,
      deliveryMode: product.delivery || (product.type === 'service' ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
      nextStep: product.type === 'service'
        ? 'We use this paid checkout as the kickoff signal and follow up for scope/access.'
        : 'We deliver the paid artifact manually to the checkout email. Public samples and hashes are available for verification.',
      storefrontUrl: `${ORIGIN}/products`,
      purchaseCompleteUrl: `${ORIGIN}/purchase-complete?paid=${encodeURIComponent(product.slug)}&session_id=${encodeURIComponent(session.id)}`
    },
    proof: product.sha256 ? {
      sha256: product.sha256,
      verificationUrl: `${ORIGIN}${product.verificationUrl}`
    } : null,
    safety: {
      protocolEscrow: 'Base Sepolia testnet-only; not a production escrow rail for this Stripe purchase.',
      noCustomerPiiReturned: true
    }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.end('method not allowed');
    return;
  }

  const sessionId = safeSessionId(req.query && req.query.session_id);
  if (!sessionId) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing_or_invalid_session_id' }, null, 2));
    return;
  }

  try {
    const session = await stripeGet(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const product = productForSession(session);
    if (!product) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'unknown_awm_product_for_session' }, null, 2));
      return;
    }

    const receipt = receiptFor(session, product);
    res.statusCode = receipt.verified ? 200 : 402;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'private, no-store');
    res.end(JSON.stringify(receipt, null, 2));
  } catch (err) {
    res.statusCode = err.statusCode || 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'stripe_receipt_lookup_failed', detail: err.message }, null, 2));
  }
};
