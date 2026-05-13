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

function statusFor(session, product) {
  const paid = session.payment_status === 'paid' || session.status === 'complete';
  const isService = product.type === 'service';
  return {
    schema: 'ai-work-market.delivery-status.v1',
    verified: paid,
    checkoutSession: {
      id: session.id,
      livemode: Boolean(session.livemode),
      status: session.status,
      paymentStatus: session.payment_status
    },
    product: {
      id: product.slug,
      name: product.name,
      type: product.type
    },
    delivery: {
      mode: product.delivery || (isService ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
      state: paid ? (isService ? 'kickoff_pending' : 'manual_delivery_pending') : 'awaiting_paid_checkout',
      privateDownloadConfigured: false,
      signedLinkAvailable: false,
      paidAssetsPublic: false,
      message: paid
        ? (isService
          ? 'Checkout is paid. Scope/access follow-up is handled manually.'
          : 'Checkout is paid. Paid files are delivered manually; no public asset URL is exposed by this endpoint.')
        : 'Checkout is not paid yet; delivery is locked.'
    },
    safety: {
      noCustomerPiiReturned: true,
      noAssetUrlsReturned: true
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

    const body = statusFor(session, product);
    res.statusCode = body.verified ? 200 : 402;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'private, no-store');
    res.end(JSON.stringify(body, null, 2));
  } catch (err) {
    res.statusCode = err.statusCode || 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'stripe_delivery_status_lookup_failed', detail: err.message }, null, 2));
  }
};
