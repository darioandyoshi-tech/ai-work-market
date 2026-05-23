const { getCatalog, getPaymentLinks, errorResponse, x402RailForProduct } = require('./_commerce-shared');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET');
      res.end('method not allowed');
      return;
    }

    const origin = 'https://ai-work-market.ai';
    
    // Use hardened loaders from _commerce-shared
    const catalogData = getCatalog();
    const paymentLinksData = getPaymentLinks();

    const linkBySlug = new Map((paymentLinksData.products || []).map((p) => [p.slug, p]));
    
    const products = (catalogData.products || []).map((product) => {
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
        paymentRails: [
          {
            provider: 'stripe_payment_link',
            status: 'live',
            checkoutUrl: product.checkoutUrl || link.paymentLinkUrl || null
          },
          x402RailForProduct(product, origin)
        ],
        fulfillment: {
          mode: product.delivery || (product.type === 'service' ? 'manual_scope_kickoff' : 'manual_after_stripe_purchase'),
          publicSampleUrl: product.sampleUrl ? `${origin}${product.sampleUrl}` : null,
          publicProductUrl: `${origin}/products`,
          paymentRequestUrl: `${origin}/api/payment-request?slug=${encodeURIComponent(product.slug)}`,
          protectedResourceUrl: `${origin}/api/protected-resource?slug=${encodeURIComponent(product.slug)}`,
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
    // Cache for 60 seconds as requested
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
      paymentRails: ['stripe_payment_links', 'x402'],
      paymentRequestApi: `${origin}/api/payment-request`,
      futureRails: ['stripe_mpp', 'base_usdc_escrow_production_after_audit'],
      products
    }, null, 2));

  } catch (err) {
    console.error(`[AWM_Sovereign] Fatal error in agent-products handler:`, err);
    return errorResponse(res, 'internal_server_error', err.message || 'An unexpected error occurred', 500);
  }
};
