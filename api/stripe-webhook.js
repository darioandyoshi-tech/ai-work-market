const crypto = require('crypto');
const { recordEvent } = require('./_fulfillment-store');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [k, ...v] = part.split('=');
      return [k, v.join('=')];
    })
  );
  const timestamp = parts.t;
  const v1 = signatureHeader
    .split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));
  if (!timestamp || !v1.length) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return v1.some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
}

function productFromEvent(event) {
  const obj = event && event.data && event.data.object ? event.data.object : {};
  const metadata = obj.metadata || {};
  return metadata.slug || metadata.product_slug || metadata.awm_product || 'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, route: 'stripe-webhook', mode: process.env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'missing_secret' }));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET, POST');
    res.end('method not allowed');
    return;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.statusCode = 500;
    res.end('webhook secret not configured');
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['stripe-signature'];
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    res.statusCode = 400;
    res.end('bad signature');
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.statusCode = 400;
    res.end('bad json');
    return;
  }

  const relevant = new Set(['checkout.session.completed', 'payment_intent.succeeded', 'payment_intent.payment_failed']);
  const productSlug = productFromEvent(event);

  if (relevant.has(event.type)) {
    try {
      recordEvent({
        ...event,
        productSlug
      });
    } catch (err) {
      console.error('Fulfillment store record failed:', err);
    }
  }

  // Vercel logs are the durable first pass here. Do not print customer PII.
  console.log(JSON.stringify({
    event: event.type,
    id: event.id,
    productSlug,
    liveMode: event.livemode,
    relevant: relevant.has(event.type),
    receivedAt: new Date().toISOString()
  }));

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ received: true }));
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
