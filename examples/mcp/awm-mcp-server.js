#!/usr/bin/env node
'use strict';

// Minimal read-only MCP-style stdio server for AI Work Market.
// No private keys. No transaction submission. Safe to wire into agent runtimes.

const crypto = require('crypto');
const {
  loadDeployment,
  providerFromRpc,
  getIntentStatus
} = require('../../sdk');

const SERVER_INFO = { name: 'ai-work-market-mcp', version: '0.1.0' };
const RPC_URL = process.env.AWM_RPC_URL || 'https://sepolia.base.org';
const AGENT_COMMERCE_ORIGIN = process.env.AWM_AGENT_COMMERCE_ORIGIN || 'https://ai-work-market.vercel.app';
const REQUEST_TIMEOUT_MS = Number(process.env.AWM_MCP_HTTP_TIMEOUT_MS || 15000);

let buffer = Buffer.alloc(0);

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function result(id, value) {
  writeMessage({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message, data) {
  const payload = { jsonrpc: '2.0', id, error: { code, message } };
  if (data !== undefined) payload.error.data = data;
  writeMessage(payload);
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function sha256Hex(input) {
  return '0x' + crypto.createHash('sha256').update(String(input)).digest('hex');
}

function urlFor(origin, pathname, params = {}) {
  const url = new URL(pathname, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

function safeSessionId(value) {
  return /^cs_(test|live)_[A-Za-z0-9_]+$/.test(String(value || '').trim());
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(options.headers || {}) }
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      body = { raw: text };
    }
    return {
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      body
    };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`HTTP request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function reservationIdFor(slug, workSpec = {}) {
  const seed = JSON.stringify({ slug, workSpec });
  return `draft:${sha256Hex(seed).slice(2, 18)}`;
}

function buildReservationPreview(args = {}) {
  const slug = args.slug;
  const workSpec = args.workSpec || {};
  const expiresAt = args.expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  return {
    schema: 'ai-work-market.reservation-envelope.v0.1',
    reservationId: reservationIdFor(slug, workSpec),
    source: 'mcp_preview_only',
    productSlug: slug,
    work: {
      title: workSpec.title || `Purchase or fulfill ${slug}`,
      deliverable: workSpec.deliverable || 'Paid digital work product or scoped integration deliverable.',
      acceptanceCriteria: Array.isArray(workSpec.acceptanceCriteria) ? workSpec.acceptanceCriteria : []
    },
    commercialTerms: {
      rail: args.rail || 'stripe_payment_link',
      testnetEscrowOnly: args.rail === 'base_sepolia_usdc_escrow',
      amount: args.amount || null
    },
    actors: {
      buyer: args.buyer || 'operator_or_buyer_agent',
      seller: args.seller || 'ai-work-market',
      allowedReleasers: args.allowedReleasers || ['buyer', 'verifier'],
      allowedRefunders: args.allowedRefunders || ['buyer', 'arbiter']
    },
    evidence: {
      requiredProof: args.requiredProof || 'content-addressed artifact or signed action receipt',
      uri: args.proofURI || '',
      sha256: args.proofSha256 || ''
    },
    timeouts: {
      expiresAt,
      refundAfter: args.refundAfter || expiresAt
    },
    state: 'preview',
    lifecycleMapping: {
      reserve: 'payment challenge / work authorization envelope',
      commit: 'proof URI, proof hash, or signed action receipt',
      release: 'buyer/verifier release after accepted proof',
      refund: 'refund/timeout/dispute path',
      query_reservation: 'receipt, delivery status, or escrow intent status'
    },
    safety: {
      previewOnly: true,
      movesMoney: false,
      signsTransaction: false,
      opensCheckout: false,
      paidAssetsReturned: false
    }
  };
}

function summarizePaymentChallenge(response, sourceUrl, sourceEndpoint) {
  const body = response.body || {};
  const checkoutUrl = body.payment && body.payment.checkoutUrl;
  const linkHeader = response.headers.link || null;
  return {
    schema: 'ai-work-market.mcp-payment-challenge-summary.v1',
    sourceEndpoint,
    url: sourceUrl.toString(),
    httpStatus: response.status,
    paymentRequired: response.status === 402 || Boolean(body.paymentRequired),
    product: body.product || null,
    resource: body.resource || null,
    payment: body.payment || null,
    linkHeader,
    warnings: checkoutUrl && linkHeader && !linkHeader.includes(checkoutUrl)
      ? ['Link rel=payment header differs from JSON payment.checkoutUrl; prefer JSON checkoutUrl unless integration docs say otherwise.']
      : [],
    fulfillment: body.fulfillment || null,
    proof: body.proof || null,
    protocolNotes: body.protocolNotes || null,
    nextActions: response.status === 402 ? [
      'Show payment.checkoutUrl to a human/operator if purchase is desired.',
      'After checkout, call awm_verify_checkout_session with the Stripe Checkout Session ID.'
    ] : [],
    safety: {
      movesMoney: false,
      opensCheckout: false,
      paidAssetsReturned: false,
      accessTokenRedacted: true
    },
    rawSchema: body.schema || null
  };
}

function tools() {
  return [
    {
      name: 'awm_get_deployment',
      description: 'Return the current AI Work Market Base Sepolia deployment metadata.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'awm_build_work_spec',
      description: 'Build a canonical work specification template and hash for an escrowed AI-agent task.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'deliverable'],
        properties: {
          title: { type: 'string', description: 'Short task title.' },
          deliverable: { type: 'string', description: 'Concrete deliverable expected from the worker agent.' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Checklist for buyer review.' },
          proofURI: { type: 'string', description: 'Optional expected proof URI or artifact URL.' }
        }
      }
    },
    {
      name: 'awm_check_intent_status',
      description: 'Read an AI Work Market escrow intent status from Base Sepolia. Requires only an intentId.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['intentId'],
        properties: {
          intentId: { type: 'string', description: 'Escrow intent ID, e.g. 1 or 2.' }
        }
      }
    },
    {
      name: 'awm_get_agent_products',
      description: 'Fetch the live AI Work Market agent-readable product catalog. Does not move money.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          origin: { type: 'string', description: 'Optional AI Work Market origin for local/test deployments.' }
        }
      }
    },
    {
      name: 'awm_get_payment_challenge',
      description: 'Fetch a protected resource and summarize the expected HTTP 402 payment challenge. Does not open checkout or pay.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Product slug, e.g. agent-commerce-market-map-2026.' },
          origin: { type: 'string', description: 'Optional AI Work Market origin for local/test deployments.' },
          accessToken: { type: 'string', description: 'Optional local/test bearer token. Redacted from output.' }
        }
      }
    },
    {
      name: 'awm_get_payment_request',
      description: 'Fetch the standalone payment-request endpoint and normalize the HTTP 402 response. Does not open checkout or pay.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Product slug, e.g. agent-commerce-market-map-2026.' },
          origin: { type: 'string', description: 'Optional AI Work Market origin for local/test deployments.' }
        }
      }
    },
    {
      name: 'awm_get_machine_payment_contract_preview',
      description: 'Generate a read-only machine-payment reservation envelope preview. Does not reserve, sign, open checkout, or move money.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Product or work slug.' },
          rail: { type: 'string', description: 'Payment rail hint, e.g. stripe_payment_link or base_sepolia_usdc_escrow.' },
          amount: { type: 'object', description: 'Optional amount object, e.g. { currency, dollars }.' },
          buyer: { type: 'string', description: 'Optional buyer/operator identifier.' },
          seller: { type: 'string', description: 'Optional seller/agent identifier.' },
          workSpec: { type: 'object', description: 'Optional title, deliverable, and acceptanceCriteria.' },
          requiredProof: { type: 'string', description: 'Optional proof requirement.' },
          proofURI: { type: 'string', description: 'Optional proof URI if already known.' },
          proofSha256: { type: 'string', description: 'Optional proof hash if already known.' },
          expiresAt: { type: 'string', description: 'Optional ISO timestamp.' },
          refundAfter: { type: 'string', description: 'Optional ISO timestamp.' },
          allowedReleasers: { type: 'array', items: { type: 'string' } },
          allowedRefunders: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'awm_verify_checkout_session',
      description: 'Verify Stripe checkout receipt and delivery status through AI Work Market public APIs. Does not expose customer PII or paid assets.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', description: 'Stripe Checkout Session ID, cs_test_... or cs_live_...' },
          origin: { type: 'string', description: 'Optional AI Work Market origin for local/test deployments.' }
        }
      }
    }
  ];
}

async function callTool(name, args = {}) {
  if (name === 'awm_get_deployment') {
    return textResult(jsonText(loadDeployment()));
  }

  if (name === 'awm_build_work_spec') {
    const spec = {
      schema: 'ai-work-market.work-spec.v0.1',
      title: args.title,
      deliverable: args.deliverable,
      acceptanceCriteria: args.acceptanceCriteria || [],
      proofURI: args.proofURI || '',
      createdAt: new Date().toISOString()
    };
    const canonical = JSON.stringify(spec);
    return textResult(jsonText({ ...spec, workHash: sha256Hex(canonical), canonical }));
  }

  if (name === 'awm_check_intent_status') {
    const deployment = loadDeployment();
    const provider = providerFromRpc(RPC_URL);
    const status = await getIntentStatus({ provider, deployment, intentId: args.intentId });
    return textResult(jsonText(status));
  }

  if (name === 'awm_get_agent_products') {
    const origin = args.origin || AGENT_COMMERCE_ORIGIN;
    const response = await fetchJson(new URL('/api/agent-products', origin));
    return textResult(jsonText({
      schema: 'ai-work-market.mcp-agent-products-result.v1',
      httpStatus: response.status,
      ok: response.ok,
      body: response.body
    }));
  }

  if (name === 'awm_get_payment_challenge') {
    const origin = args.origin || AGENT_COMMERCE_ORIGIN;
    const headers = args.accessToken ? { authorization: `Bearer ${args.accessToken}` } : undefined;
    const url = urlFor(origin, '/api/protected-resource', { slug: args.slug });
    const response = await fetchJson(url, { headers });
    return textResult(jsonText(summarizePaymentChallenge(response, url, '/api/protected-resource')));
  }

  if (name === 'awm_get_payment_request') {
    const origin = args.origin || AGENT_COMMERCE_ORIGIN;
    const url = urlFor(origin, '/api/payment-request', { slug: args.slug });
    const response = await fetchJson(url);
    return textResult(jsonText(summarizePaymentChallenge(response, url, '/api/payment-request')));
  }

  if (name === 'awm_get_machine_payment_contract_preview') {
    return textResult(jsonText(buildReservationPreview(args)));
  }

  if (name === 'awm_verify_checkout_session') {
    if (!safeSessionId(args.sessionId)) throw new Error('Invalid sessionId. Expected cs_test_... or cs_live_...');
    const origin = args.origin || AGENT_COMMERCE_ORIGIN;
    const receipt = await fetchJson(new URL(`/api/fulfillment-receipt?session_id=${encodeURIComponent(args.sessionId)}`, origin));
    const delivery = await fetchJson(new URL(`/api/delivery-status?session_id=${encodeURIComponent(args.sessionId)}`, origin));
    return textResult(jsonText({
      schema: 'ai-work-market.mcp-checkout-verification-result.v1',
      receipt: { httpStatus: receipt.status, body: receipt.body },
      delivery: { httpStatus: delivery.status, body: delivery.body },
      safety: { noCustomerPiiExpected: true, noAssetUrlsExpected: true }
    }));
  }

  throw new Error(`Unknown tool: ${name}`);
}


async function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  const { id, method, params = {} } = message;

  try {
    if (method === 'notifications/initialized') return;

    if (method === 'initialize') {
      return result(id, {
        protocolVersion: params.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      });
    }

    if (method === 'tools/list') return result(id, { tools: tools() });

    if (method === 'tools/call') {
      const payload = await callTool(params.name, params.arguments || {});
      return result(id, payload);
    }

    return error(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return error(id, -32000, err.message || 'Tool call failed');
  }
}

function tryReadMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);
    try {
      const parsed = JSON.parse(body);
      Promise.resolve(handle(parsed)).catch((err) => {
        console.error('[awm-mcp] handler error:', err.message);
      });
    } catch (err) {
      console.error('[awm-mcp] parse error:', err.message);
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  tryReadMessages();
});

process.stdin.on('end', () => process.exit(0));
