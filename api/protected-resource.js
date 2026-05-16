const catalog = require('../products/catalog.json');
const paymentLinks = require('../products/payment-links.json');

const ORIGIN = 'https://ai-work-market.vercel.app';

function productFor(slug) {
  return (catalog.products || []).find((p) => p.slug === slug);
}

function paymentLinkFor(slug) {
  return (paymentLinks.products || []).find((p) => p.slug === slug) || {};
}

function tokenFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (req.headers['x-awm-access-token']) return String(req.headers['x-awm-access-token']).trim();
  // Deprecated: access_token query param leaks in logs/referrers.
  if (req.query && req.query.access_token) return String(req.query.access_token).trim();
  return '';
}

function isAuthorized(req) {
  const expected = process.env.AWM_DELIVERY_TOKEN;
  return Boolean(expected && tokenFrom(req) && tokenFrom(req) === expected);
}

function publicProductFields(product) {
  return {
    id: product.slug,
    name: product.name,
    type: product.type,
    status: product.status,
    priceUsd: product.priceUsd
  };
}

function proofFor(product) {
  if (!product.sha256) return null;
  return {
    sha256: product.sha256,
    verificationUrl: `${ORIGIN}${product.verificationUrl}`
  };
}

function paymentRequest(product) {
  const link = paymentLinkFor(product.slug);
  return {
    schema: 'ai-work-market.payment-request.v1',
    paymentRequired: true,
    status: 402,
    product: publicProductFields(product),
    resource: {
      id: `${product.slug}:paid-resource`,
      url: `${ORIGIN}/api/protected-resource?slug=${encodeURIComponent(product.slug)}`,
      sampleUrl: product.sampleUrl ? `${ORIGIN}${product.sampleUrl}` : null,
      paidAssetsPublic: false
    },
    payment: {
      currentRail: 'stripe_payment_link',
      checkoutUrl: product.checkoutUrl || link.paymentLinkUrl,
      afterCompletionUrl: link.afterCompletionUrl || `${ORIGIN}/purchase-complete?paid=${encodeURIComponent(product.slug)}`,
      amount: {
        currency: 'USD',
        dollars: product.priceUsd,
        stripeUnitAmount: link.unitAmount || Math.round(Number(product.priceUsd || 0) * 100)
      }
    },
    fulfillment: {
      mode: product.delivery || (product.type === 'service' ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
      purchaseCompleteUrl: `${ORIGIN}/purchase-complete?paid=${encodeURIComponent(product.slug)}`,
      automatedDownloadStatus: 'not_enabled_v1_manual_fulfillment_only'
    },
    proof: proofFor(product),
    protocolNotes: {
      httpStatus: 402,
      mppCompatibleShape: true,
      x402CompatibleShape: true,
      stripePaymentLinksLive: true,
      stripeMachinePaymentsStatus: 'planned_after_account_machine_payments_enabled',
      aiWorkMarketEscrow: 'base_sepolia_testnet_only_not_real_payment_rail'
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

  const slug = req.query && req.query.slug ? String(req.query.slug) : '';
  if (!slug) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing_slug', productsUrl: `${ORIGIN}/api/agent-products` }, null, 2));
    return;
  }

  const product = productFor(slug);
  if (!product) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'unknown_product', slug, productsUrl: `${ORIGIN}/api/agent-products` }, null, 2));
    return;
  }

  if (!isAuthorized(req)) {
    const request = paymentRequest(product);
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=60');
    res.setHeader('x-ai-work-market-payment-required', 'true');
    res.setHeader('x-ai-work-market-product', product.slug);
    if (request.payment.checkoutUrl) {
      res.setHeader('link', `<${request.payment.checkoutUrl}>; rel="payment"`);
    }
    res.end(JSON.stringify(request, null, 2));
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'private, no-store');
  res.end(JSON.stringify({
    schema: 'ai-work-market.protected-resource.v1',
    status: 'authorized_manual_delivery',
    product: publicProductFields(product),
    paidAssetsPublic: false,
    fulfillment: {
      mode: product.delivery || (product.type === 'service' ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
      note: 'Authorization succeeded, but v1 does not expose paid static files through this endpoint. Fulfillment remains manual or via future signed delivery links.',
      purchaseCompleteUrl: `${ORIGIN}/purchase-complete?paid=${encodeURIComponent(product.slug)}`
    },
    proof: proofFor(product)
  }, null, 2));
};
