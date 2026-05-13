const catalog = require('../products/catalog.json');
const paymentLinks = require('../products/payment-links.json');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.end('method not allowed');
    return;
  }

  const origin = 'https://ai-work-market.vercel.app';
  const linkBySlug = new Map((paymentLinks.products || []).map((p) => [p.slug, p]));
  const products = (catalog.products || []).map((product) => {
    const link = linkBySlug.get(product.slug) || {};
    return {
      id: product.slug,
      name: product.name,
      type: product.type,
      status: product.status,
      price: {
        amountUsd: product.priceUsd,
        currency: 'USD',
        stripeUnitAmount: link.unitAmount || Math.round(Number(product.priceUsd || 0) * 100)
      },
      checkout: {
        provider: 'stripe_payment_link',
        url: product.checkoutUrl || link.paymentLinkUrl || null,
        afterCompletionUrl: link.afterCompletionUrl || `${origin}/purchase-complete?paid=${encodeURIComponent(product.slug)}`
      },
      fulfillment: {
        mode: product.delivery || (product.type === 'service' ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
        publicSampleUrl: product.sampleUrl ? `${origin}${product.sampleUrl}` : null,
        publicProductUrl: `${origin}/products`,
        paymentRequestUrl: `${origin}/api/payment-request?slug=${encodeURIComponent(product.slug)}`,
        paidAssetsPublic: false
      },
      proof: product.sha256 ? {
        sha256: product.sha256,
        verificationUrl: `${origin}${product.verificationUrl}`
      } : null
    };
  });

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=60');
  res.end(JSON.stringify({
    schema: 'ai-work-market.agent-products.v1',
    generatedAt: new Date().toISOString(),
    marketplace: {
      name: 'AI Work Market',
      url: origin,
      storefrontUrl: `${origin}/products`,
      sourceUrl: 'https://github.com/darioandyoshi-tech/ai-work-market',
      testnetProtocolOnly: true
    },
    paymentRails: ['stripe_payment_links'],
    paymentRequestApi: `${origin}/api/payment-request`,
    futureRails: ['stripe_mpp', 'x402', 'base_usdc_escrow_production_after_audit'],
    products
  }, null, 2));
};
