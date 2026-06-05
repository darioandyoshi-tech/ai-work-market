// api/_x402-gate.js
// Minimal x402 payment gate for Vercel serverless functions.
//
// Implements the x402 protocol (v2) directly without the express middleware,
// so it works on Vercel/AWS Lambda. Uses the @x402/core ResourceServer for
// the heavy lifting (scheme registration, buildPaymentRequirements,
// verifyPayment, settlePayment) and handles the HTTP framing manually.
//
// Pattern:
//   const { withX402 } = require('./_x402-gate');
//   module.exports = withX402({ price: '$0.005', description: 'Crypto prices' },
//     async (req, res, payment) => { return { ... }; });
//
// On first request: returns HTTP 402 with x-payment-required header (base64 JSON)
// On retry with x-payment header: verifies via facilitator, settles, returns data
//
// Config:
//   - AWM_X402_TREASURY (env) — mainnet USDC receiving address
//   - AWM_X402_TREASURY_TESTNET (env) — sepolia receiving address
//   - CDP_API_KEY_ID, CDP_API_KEY_SECRET (env) — for mainnet facilitator (optional)
//   - X402_FACILITATOR_URL (env) — override the testnet facilitator
//
// The x-payment header is the signed payment payload (base64 JSON).
// The x-payment-response header on success is the settlement receipt (base64 JSON).
// The x-payment-required header on 402 is the payment requirements (base64 JSON).

const { x402ResourceServer, HTTPFacilitatorClient } = require('@x402/core/server');
const { ExactEvmScheme } = require('@x402/evm/exact/server');

const NETWORKS = {
  mainnet: { id: 'eip155:8453', name: 'base-mainnet', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  sepolia: { id: 'eip155:84532', name: 'base-sepolia', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
};

function getFacilitatorConfig() {
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
    return {
      url: 'https://api.cdp.coinbase.com/platform/v2/x402',
      createAuthHeaders: async () => {
        const auth = Buffer.from(`${process.env.CDP_API_KEY_ID}:${process.env.CDP_API_KEY_SECRET}`).toString('base64');
        return { Authorization: `Bearer ${auth}` };
      },
    };
  }
  return { url: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator' };
}

function getPayToAddress(network) {
  if (network === 'mainnet') {
    return process.env.AWM_X402_TREASURY || process.env.AWM_TREASURY_ADDRESS;
  }
  return process.env.AWM_X402_TREASURY_TESTNET || process.env.AWM_TREASURY_TESTNET;
}

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v !== null && v !== undefined) res.setHeader(k, String(v));
  }
  res.end(JSON.stringify(body, null, 2));
}

function encodeBase64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function decodeBase64(str) {
  try {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 64 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

/**
 * Wrap a handler with x402 payment gate.
 *
 * @param {object} options
 * @param {string} options.price — USDC dollar amount string (e.g. '$0.005', '$0.01', '$0.10')
 * @param {'mainnet'|'sepolia'} [options.network='mainnet']
 * @param {string} [options.description]
 * @param {string} [options.mimeType='application/json']
 * @param {object} [options.extra] — extra metadata for Bazaar discovery
 * @param {function} handler — async (req, res, payment) => data | object
 *        payment: { payer, transaction, network, amount, asset } on success
 */
function withX402(options, handler) {
  const { price, network = 'sepolia', description = 'x402-paid API', mimeType = 'application/json', extra = {} } = options;
  if (!price) throw new Error('withX402: price is required');
  const networkCfg = NETWORKS[network];
  if (!networkCfg) throw new Error(`withX402: unknown network '${network}'`);

  // Default to sepolia because the free x402.org facilitator only supports testnet.
  // For mainnet, the seller MUST configure CDP_API_KEY_ID and CDP_API_KEY_SECRET
  // (Coinbase's facilitator, which supports all networks on a generous free tier).

  // Cache the resource server per (network) — Vercel reuses module instances.
  // We need to await initialize() to fetch the supported kinds from the
  // facilitator before buildPaymentRequirements works.
  if (!withX402._servers) withX402._servers = {};
  if (!withX402._initPromises) withX402._initPromises = {};
  if (!withX402._servers[network]) {
    const facilitator = new HTTPFacilitatorClient(getFacilitatorConfig());
    withX402._servers[network] = new x402ResourceServer(facilitator).register(networkCfg.id, new ExactEvmScheme());
  }
  const server = withX402._servers[network];
  if (!withX402._initPromises[network]) {
    withX402._initPromises[network] = server.initialize().catch(e => {
      // If init fails (facilitator unreachable), we'll retry on next call
      delete withX402._initPromises[network];
      throw e;
    });
  }

  return async function gate(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('allow', 'GET, POST');
      return json(res, 405, { error: 'method_not_allowed' });
    }

    const payTo = getPayToAddress(network);
    if (!payTo) {
      return json(res, 503, {
        error: 'payment_not_configured',
        message: `Set AWM_X402_TREASURY env var (mainnet) or AWM_X402_TREASURY_TESTNET (sepolia).`,
      });
    }

    const method = req.method;
    const path = req.url.split('?')[0];

    // Build the resource config
    const resourceConfig = {
      scheme: 'exact',
      payTo,
      price,
      network: networkCfg.id,
      extra: { name: description, ...extra },
    };

    // Wait for the (cached) initialize() to complete before building
    try {
      await withX402._initPromises[network];
    } catch (e) {
      return json(res, 503, {
        error: 'facilitator_init_failed',
        message: e.message,
        hint: 'Check X402 facilitator config and network reachability.',
      });
    }

    // Build payment requirements
    let requirements;
    try {
      requirements = await server.buildPaymentRequirements(resourceConfig);
    } catch (e) {
      return json(res, 500, { error: 'build_requirements_failed', message: e.message });
    }
    if (!requirements || requirements.length === 0) {
      return json(res, 500, { error: 'no_requirements_built' });
    }

    const paymentRequired = {
      x402Version: 2,
      accepts: requirements,
      resource: { url: `https://ai-work-market.ai${req.url}`, description, mimeType },
    };

    // Check for x-payment header
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader) {
      // Return 402
      const encoded = encodeBase64(paymentRequired);
      return json(res, 402, {
        x402Version: 2,
        error: 'payment_required',
        message: description,
        accepts: requirements,
        resource: paymentRequired.resource,
      }, { 'x-payment-required': encoded });
    }

    // Payment provided: decode, verify, settle
    const decoded = decodeBase64(paymentHeader);
    if (!decoded) {
      return json(res, 400, { error: 'bad_payment_header', message: 'Could not decode x-payment header' });
    }

    // Find the matching requirement (for the network + scheme the payment is for)
    const req2 = requirements[0]; // single-accept for now
    const verifyResult = await server.verifyPayment(decoded, req2, {});
    if (!verifyResult || verifyResult.isValid !== true) {
      return json(res, 402, {
        error: 'invalid_payment',
        reason: verifyResult?.invalidReason || 'unknown',
        message: verifyResult?.invalidMessage || 'Payment verification failed',
      });
    }

    const settleResult = await server.settlePayment(decoded, req2, {});
    if (!settleResult || settleResult.success !== true) {
      return json(res, 402, {
        error: 'settle_failed',
        reason: settleResult?.errorReason || 'unknown',
        message: settleResult?.errorMessage || 'Payment settlement failed',
      });
    }

    // Payment settled. Run the handler.
    const payment = {
      payer: settleResult.payer,
      transaction: settleResult.transaction,
      network: networkCfg.name,
      amount: price,
      asset: 'USDC',
    };

    let result;
    try {
      result = await handler(req, res, payment);
    } catch (e) {
      return json(res, 500, { error: 'handler_error', message: e.message });
    }

    // Write response with x-payment-response header
    const paymentResponse = {
      success: true,
      transaction: settleResult.transaction,
      network: networkCfg.id,
      payer: settleResult.payer,
    };
    if (!res.writableEnded) {
      res.statusCode = 200;
      res.setHeader('content-type', mimeType);
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-payment-response', encodeBase64(paymentResponse));
      res.end(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    }
  };
}

module.exports = { withX402, NETWORKS };
