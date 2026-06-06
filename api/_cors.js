const DEFAULT_ALLOWED_HEADERS = [
  'authorization',
  'content-type',
  'x-awm-access-token',
  'x-awm-signature',
  'x-awm-timestamp',
  'x-payment',
  'x-x402-signature',
  'x-x402-timestamp'
].join(', ');

const DEFAULT_EXPOSED_HEADERS = [
  'link',
  'retry-after',
  'x-ai-work-market-payment-required',
  'x-ai-work-market-product',
  'x-payment-required',
  'x-payment-response'
].join(', ');

function allowedOrigin(req) {
  const configured = String(process.env.AWM_CORS_ALLOWED_ORIGINS || '*').trim();
  const origin = String(req.headers?.origin || '').trim();
  if (configured === '*') return origin || '*';

  const allowed = configured.split(',').map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : '';
}

function applyCors(req, res, methods) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', methods.join(', '));
  res.setHeader('access-control-allow-headers', DEFAULT_ALLOWED_HEADERS);
  res.setHeader('access-control-expose-headers', DEFAULT_EXPOSED_HEADERS);
  res.setHeader('access-control-max-age', '86400');
  res.setHeader('vary', 'Origin');
}

function handleOptions(req, res, methods) {
  applyCors(req, res, methods);
  res.statusCode = 204;
  res.end('');
}

module.exports = {
  applyCors,
  handleOptions
};
