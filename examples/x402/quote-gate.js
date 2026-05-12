#!/usr/bin/env node
'use strict';

// Minimal x402 -> AI Work Market quote-gate example.
// Safe by default: no private keys, no transaction submission, no x402 facilitator calls.
// It models the boundary an x402/AgentKit/Base builder would wire up:
//   1. x402 gates access to POST /quote.
//   2. This service returns a canonical work spec plus AI Work Market EIP-712 typed data.
//   3. A seller-side signer can sign the typed data elsewhere, then the buyer can fund escrow.

const http = require('http');
const { URL } = require('url');
const { ethers } = require('ethers');
const {
  loadDeployment,
  asBytes32,
  offerDomain,
  offerTypes,
  offerMessage
} = require('../../sdk');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4020;
const DEFAULT_QUOTE_PRICE_RAW = '10000'; // 0.01 USDC with 6 decimals.
const DEFAULT_WORK_AMOUNT_RAW = '25000000'; // 25 USDC with 6 decimals.
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); } catch (err) { reject(new Error(`Invalid JSON: ${err.message}`)); }
    });
    req.on('error', reject);
  });
}

function normalizeString(value, fallback = '') {
  const out = value === undefined || value === null ? fallback : String(value);
  return out.trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function buildWorkSpec(input, now = new Date()) {
  const spec = {
    schema: 'ai-work-market.work-spec.v0.1',
    title: normalizeString(input.title || input.task, 'Untitled agent task'),
    buyer: normalizeString(input.buyer, ZERO_ADDRESS),
    deliverable: normalizeString(input.deliverable, 'A concrete proof artifact for buyer review.'),
    acceptanceCriteria: normalizeArray(input.acceptanceCriteria),
    proofFormat: normalizeString(input.proofFormat, 'https or ipfs proof URI'),
    createdAt: now.toISOString()
  };
  const canonical = JSON.stringify(spec);
  return {
    ...spec,
    canonical,
    workHash: ethers.keccak256(ethers.toUtf8Bytes(canonical)),
    workURI: input.workURI || `data:application/json,${encodeURIComponent(canonical)}`
  };
}

function buildUnsignedOffer({ deployment, workSpec, input, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const buyer = ethers.getAddress(normalizeString(input.buyer, ZERO_ADDRESS));
  const defaultSeller = deployment.e2e?.seller || deployment.owner || ZERO_ADDRESS;
  const seller = ethers.getAddress(normalizeString(input.seller || process.env.AWM_SELLER_ADDRESS, defaultSeller));
  const amountRaw = normalizeString(input.amountRaw || process.env.AWM_WORK_AMOUNT_RAW, DEFAULT_WORK_AMOUNT_RAW);
  const workTimeoutSeconds = normalizeString(input.workTimeoutSeconds, '172800');
  const reviewPeriodSeconds = normalizeString(input.reviewPeriodSeconds, '86400');
  const offerExpiresAt = normalizeString(input.offerExpiresAt, String(nowSeconds + 3600));
  const nonce = normalizeString(input.nonce, ethers.toBigInt(ethers.randomBytes(32)).toString());

  const offer = {
    schema: 'ai-work-market.offer.v0.4',
    network: deployment.network,
    chainId: deployment.chainId,
    verifyingContract: deployment.address,
    usdc: deployment.usdc,
    buyer,
    seller,
    amountRaw,
    amountHumanHint: `${ethers.formatUnits(amountRaw, 6)} USDC`,
    workHash: asBytes32(workSpec.workHash, 'workHash'),
    workURI: workSpec.workURI,
    workURIHash: ethers.keccak256(ethers.toUtf8Bytes(workSpec.workURI)),
    workTimeoutSeconds,
    reviewPeriodSeconds,
    nonce,
    offerExpiresAt,
    signature: '<seller signs the typedData below>'
  };

  return {
    offer,
    typedData: {
      domain: offerDomain(deployment),
      types: offerTypes(),
      primaryType: 'SellerOffer',
      message: offerMessage(offer)
    }
  };
}

function x402NetworkSlug(deployment) {
  if (Number(deployment.chainId) === 84532) return 'base-sepolia';
  if (Number(deployment.chainId) === 8453) return 'base';
  return String(deployment.network || 'base-sepolia').toLowerCase().replace(/\s+/g, '-');
}

function buildX402PaymentRequirements({ deployment, resourceUrl, payTo, quotePriceRaw = DEFAULT_QUOTE_PRICE_RAW }) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: x402NetworkSlug(deployment),
        asset: deployment.usdc,
        payTo: ethers.getAddress(payTo || process.env.AWM_X402_PAY_TO || deployment.owner || ZERO_ADDRESS),
        maxAmountRequired: String(quotePriceRaw),
        resource: resourceUrl,
        description: 'Pay for access to an AI Work Market seller-agent quote. Escrow funding happens separately after acceptance.',
        mimeType: 'application/json',
        maxTimeoutSeconds: 300
      }
    ]
  };
}

function buildAgentKitActionMetadata(baseUrl) {
  return {
    name: 'request_ai_work_market_quote',
    description: 'Request an x402-gated quote that returns an AI Work Market escrow offer payload without sending a transaction.',
    method: 'POST',
    url: `${baseUrl}/quote`,
    headers: { 'X-PAYMENT': '<x402 payment payload from facilitator/client>' },
    inputSchema: {
      type: 'object',
      required: ['buyer', 'title', 'deliverable'],
      properties: {
        buyer: { type: 'string', description: 'Buyer wallet address that would fund escrow.' },
        seller: { type: 'string', description: 'Seller wallet address that will sign the returned typed data.' },
        title: { type: 'string' },
        deliverable: { type: 'string' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        amountRaw: { type: 'string', description: 'Escrow amount in USDC raw units.' }
      }
    }
  };
}

function createServer({ deployment = loadDeployment(), baseUrl } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, baseUrl || `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return jsonResponse(res, 200, { ok: true, name: 'awm-x402-quote-gate' });
      }

      if (req.method === 'GET' && url.pathname === '/x402/payment-requirements') {
        return jsonResponse(res, 200, buildX402PaymentRequirements({ deployment, resourceUrl: `${url.origin}/quote` }));
      }

      if (req.method === 'GET' && url.pathname === '/agentkit/action') {
        return jsonResponse(res, 200, buildAgentKitActionMetadata(url.origin));
      }

      if (req.method === 'POST' && url.pathname === '/quote') {
        // This example only checks that the boundary is present. Production code should verify
        // the X-PAYMENT payload with an x402 facilitator before returning seller quote access.
        const xPayment = req.headers['x-payment'];
        if (!xPayment) {
          return jsonResponse(res, 402, {
            error: 'missing_x402_payment',
            paymentRequirements: buildX402PaymentRequirements({ deployment, resourceUrl: `${url.origin}/quote` })
          });
        }

        const input = await readBody(req);
        const workSpec = buildWorkSpec(input);
        const unsigned = buildUnsignedOffer({ deployment, workSpec, input });
        return jsonResponse(res, 200, {
          schema: 'ai-work-market.x402-quote-response.v0.2',
          payment: {
            rail: 'x402',
            receivedHeader: true,
            verification: 'placeholder: verify X-PAYMENT with your x402 facilitator in production'
          },
          settlement: {
            rail: 'ai-work-market',
            network: deployment.network,
            chainId: deployment.chainId,
            escrow: deployment.address,
            usdc: deployment.usdc,
            mode: 'seller-signs-returned-typed-data-then-buyer-funds-escrow'
          },
          workSpec,
          ...unsigned,
          agentKitAction: buildAgentKitActionMetadata(url.origin)
        });
      }

      return jsonResponse(res, 404, { error: 'not_found' });
    } catch (err) {
      return jsonResponse(res, 400, { error: err.message || 'bad_request' });
    }
  });
  return server;
}

if (require.main === module) {
  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const server = createServer();
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`awm x402 quote gate listening on http://${host}:${port}`);
  });
}

module.exports = {
  DEFAULT_QUOTE_PRICE_RAW,
  DEFAULT_WORK_AMOUNT_RAW,
  buildWorkSpec,
  buildUnsignedOffer,
  x402NetworkSlug,
  buildX402PaymentRequirements,
  buildAgentKitActionMetadata,
  createServer
};
