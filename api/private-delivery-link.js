const crypto = require('crypto');
const {
  productForSession,
  safeSessionId,
  hmacValue,
  stripeGet,
  paidSession,
  bundleForProduct,
  json
} = require('./_commerce-shared');

const DEFAULT_TTL_SECONDS = 10 * 60;
const ORIGIN = process.env.AWM_PUBLIC_ORIGIN || 'https://ai-work-market.vercel.app';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(payload, secret) {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end('method not allowed');
    return;
  }

  const sessionId = safeSessionId(req.query && req.query.session_id);
  if (!sessionId) return json(res, 400, { error: 'missing_or_invalid_session_id' });

  const signingSecret = process.env.AWM_DELIVERY_SIGNING_SECRET;
  if (!signingSecret || signingSecret.length < 32) {
    return json(res, 503, {
      schema: 'ai-work-market.private-delivery-link.v1',
      configured: false,
      error: 'delivery_signing_secret_missing',
      message: 'Private signed downloads are not configured yet. Manual fulfillment remains active.',
      safety: { noCustomerPiiReturned: true, noAssetUrlsReturned: true }
    });
  }

  try {
    const session = await stripeGet(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const product = productForSession(session);
    if (!product) return json(res, 404, { error: 'unknown_awm_product_for_session' });
    if (!paidSession(session)) {
      return json(res, 402, {
        schema: 'ai-work-market.private-delivery-link.v1',
        verified: false,
        error: 'checkout_not_paid',
        checkoutSession: { id: session.id, livemode: Boolean(session.livemode), status: session.status, paymentStatus: session.payment_status },
        safety: { noCustomerPiiReturned: true, noAssetUrlsReturned: true }
      });
    }

    if (product.type === 'service') {
      return json(res, 202, {
        schema: 'ai-work-market.private-delivery-link.v1',
        verified: true,
        configured: true,
        product: { id: product.slug, name: product.name, type: product.type },
        delivery: { mode: 'manual_scope_kickoff', state: 'kickoff_pending', signedLinkAvailable: false },
        message: 'This purchase is a service kickoff, not a downloadable asset bundle.',
        safety: { noCustomerPiiReturned: true, noAssetUrlsReturned: true }
      });
    }

    const bundle = bundleForProduct(product);
    if (!bundle || !bundle.bundleId) {
      return json(res, 503, {
        schema: 'ai-work-market.private-delivery-link.v1',
        verified: true,
        configured: false,
        product: { id: product.slug, name: product.name, type: product.type },
        delivery: { mode: 'manual_after_stripe_purchase', state: 'private_storage_not_configured', signedLinkAvailable: false },
        message: 'Checkout is paid, but private storage is not configured for this product yet. Manual fulfillment remains active.',
        safety: { noCustomerPiiReturned: true, noAssetUrlsReturned: true }
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(60, Math.min(Number(process.env.AWM_DELIVERY_TOKEN_TTL_SECONDS || DEFAULT_TTL_SECONDS), 3600));
    const payload = {
      schema: 'ai-work-market.private-delivery-token.v1',
      purpose: 'download',
      sidHash: hmacValue(signingSecret, session.id),
      sessionId: session.id,
      productSlug: product.slug,
      bundleId: bundle.bundleId,
      livemode: Boolean(session.livemode),
      iat: now,
      exp: now + ttl,
      jti: crypto.randomUUID()
    };
    const token = signToken(payload, signingSecret);
    return json(res, 200, {
      schema: 'ai-work-market.private-delivery-link.v1',
      verified: true,
      configured: true,
      product: { id: product.slug, name: product.name, type: product.type },
      delivery: {
        mode: 'signed_private_download',
        state: 'signed_link_issued',
        signedLinkAvailable: true,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        url: `${ORIGIN}/api/private-delivery-download?token=${encodeURIComponent(token)}`
      },
      safety: { noCustomerPiiReturned: true, noAssetUrlsReturned: false, assetUrlIsShortLived: true }
    });
  } catch (err) {
    return json(res, err.statusCode || 500, { error: 'private_delivery_link_failed', detail: err.publicMessage || err.message });
  }
};
