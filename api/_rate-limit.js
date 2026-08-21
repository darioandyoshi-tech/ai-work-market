// api/_rate-limit.js
// Lightweight in-memory rate limiter for Vercel serverless functions.
// Reusable across payment/product/status endpoints to prevent abuse.
//
// NOTE: In-memory buckets are per-instance. On Vercel's serverless model this
// is a best-effort limiter (each warm instance has its own buckets). For strict
// multi-instance limits, back this with Upstash Redis (see _x402-receipt-store).
// For the P1 abuse-control gate, per-instance limiting is an acceptable
// improvement over no limiting at all.

const rateBuckets = new Map();

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function requestIp(req) {
  const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '')
    .split(',')[0].trim();
  return forwarded || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Check (and consume) a rate-limit slot for the request.
 * @param {object} req Node request object
 * @param {object} opts { windowMs, max, scope } — scope defaults to the URL path
 * @returns {{limited:boolean, retryAfterSeconds?:number, remaining?:number, limit:number, windowMs:number}}
 */
function checkRateLimit(req, opts = {}) {
  const windowMs = parsePositiveInt(opts.windowMs || process.env.AWM_RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = parsePositiveInt(opts.max || process.env.AWM_RATE_LIMIT_MAX, 60);
  const scope = opts.scope || String(req.url || '/api').split('?')[0];
  const key = `${requestIp(req)}:${req.method || 'GET'}:${scope}`;
  const now = Date.now();

  const existing = rateBuckets.get(key) || [];
  const recent = existing.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    const retryAfterMs = Math.max(1, windowMs - (now - recent[0]));
    return {
      limited: true,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      limit: maxRequests,
      windowMs,
    };
  }

  recent.push(now);
  rateBuckets.set(key, recent);
  return {
    limited: false,
    remaining: maxRequests - recent.length,
    limit: maxRequests,
    windowMs,
  };
}

/**
 * Apply rate limiting to a Vercel-style handler. Returns true if the request
 * was rejected (response already sent with 429), false to continue.
 * @param {object} req
 * @param {object} res
 * @param {object} opts
 * @returns {boolean} true if rate-limited (response sent)
 */
function applyRateLimit(req, res, opts = {}) {
  const result = checkRateLimit(req, opts);
  if (result.limited) {
    res.statusCode = 429;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('retry-after', String(result.retryAfterSeconds));
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({
      error: 'rate_limited',
      message: 'Too many requests. Please retry later.',
      retryAfterSeconds: result.retryAfterSeconds,
    }));
    return true;
  }
  return false;
}

module.exports = { checkRateLimit, applyRateLimit, requestIp };
