const crypto = require('crypto');
const { bundleForProduct, productBySlug, json } = require('./_commerce-shared');

function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) throw new Error('invalid_token');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('invalid_signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.purpose !== 'download') throw new Error('invalid_purpose');
  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) throw new Error('token_expired');
  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.end('method not allowed');
    return;
  }

  const signingSecret = process.env.AWM_DELIVERY_SIGNING_SECRET;
  if (!signingSecret || signingSecret.length < 32) {
    return json(res, 503, { error: 'delivery_signing_secret_missing' });
  }

  try {
    const payload = verifyToken(req.query && req.query.token, signingSecret);
    const product = productBySlug(payload.productSlug);
    if (!product) return json(res, 404, { error: 'unknown_product' });
    const bundle = bundleForProduct(product);
    if (!bundle || bundle.bundleId !== payload.bundleId || !bundle.url) {
      return json(res, 503, {
        schema: 'ai-work-market.private-delivery-download.v1',
        error: 'private_storage_not_configured',
        message: 'Token is valid, but no private storage URL is configured for this bundle.',
        safety: { noCustomerPiiReturned: true, paidAssetNotExposed: true }
      });
    }
    res.statusCode = 302;
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('location', bundle.url);
    res.end('redirecting');
  } catch (err) {
    return json(res, 400, { error: 'invalid_or_expired_delivery_token', detail: err.message });
  }
};
