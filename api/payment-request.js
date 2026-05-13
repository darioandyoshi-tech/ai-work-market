const catalog = require('../products/catalog.json');
const paymentLinks = require('../products/payment-links.json');

function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'ai-work-market.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function findProduct(slug) {
  return (catalog.products || []).find((p) => p.slug === slug);
}

function linkFor(slug) {
  return (paymentLinks.products || []).find((p) => p.slug === slug) || {};
}

function requestFor(req, product) {
  const base = origin(req).replace('http://ai-work-market.vercel.app', 'https://ai-work-market.vercel.app');
  const link = linkFor(product.slug);
  return {
    schema: 'ai-work-market.payment-request.v1',
    paymentRequired: true,
    status: 402,
    product: {
      id: product.slug,
      name: product.name,
      type: product.type,
      priceUsd: product.priceUsd,
      status: product.status
    },
    payment: {
      currentRail: 'stripe_payment_link',
      checkoutUrl: product.checkoutUrl || link.paymentLinkUrl,
      afterCompletionUrl: link.afterCompletionUrl || `${base}/purchase-complete?paid=${encodeURIComponent(product.slug)}`,
      amount: {
        currency: 'USD',
        dollars: product.priceUsd,
        stripeUnitAmount: link.unitAmount || Math.round(Number(product.priceUsd || 0) * 100)
      }
    },
    fulfillment: {
      mode: product.delivery || (product.type === 'service' ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
      publicSampleUrl: product.sampleUrl ? `${base}${product.sampleUrl}` : null,
      paidAssetsPublic: false,
      purchaseCompleteUrl: `${base}/purchase-complete?paid=${encodeURIComponent(product.slug)}`
    },
    proof: product.sha256 ? {
      sha256: product.sha256,
      verificationUrl: `${base}${product.verificationUrl}`
    } : null,
    protocolNotes: {
      mppCompatibleShape: true,
      x402CompatibleShape: true,
      stripeMachinePaymentsStatus: 'planned_after_account_machine_payments_enabled',
      aiWorkMarketEscrow: 'base_sepolia_testnet_only_not_real_payment_rail'
    }
  };
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('allow', 'GET, POST');
    res.end('method not allowed');
    return;
  }

  let slug = req.query && req.query.slug;
  if (!slug && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      slug = body.slug || body.productId || body.product;
    } catch {}
  }

  if (!slug) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'missing_slug', productsUrl: `${origin(req)}/api/agent-products` }, null, 2));
    return;
  }

  const product = findProduct(String(slug));
  if (!product) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'unknown_product', slug, productsUrl: `${origin(req)}/api/agent-products` }, null, 2));
    return;
  }

  const payload = requestFor(req, product);
  res.statusCode = 402;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=60');
  res.setHeader('x-ai-work-market-payment-required', 'true');
  res.setHeader('x-ai-work-market-product', product.slug);
  res.end(JSON.stringify(payload, null, 2));
};
