#!/usr/bin/env node
'use strict';

// Minimal A2A -> x402 -> AI Work Market adapter proof.
// Safe by default:
// - no private keys
// - no .env reads
// - no transaction signing or submission
// - no x402 facilitator calls
//
// It exposes an A2A-ish JSON-RPC endpoint that can advertise an x402 quote-access
// requirement and, once an X-PAYMENT header is present, return an unsigned AWM
// escrow quote payload using the safe AgentKit action helpers.

const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const { ethers } = require('ethers');
const { loadDeployment } = require('../../sdk');
const { requestWorkQuote } = require('../agentkit/awm-agentkit-actions');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4021;
const DEFAULT_QUOTE_PRICE_RAW = '10000'; // 0.01 USDC with 6 decimals.
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const AWM_A2A_X402_EXTENSION = 'https://ai-work-market.dev/extensions/a2a-x402-work-intent/v0.1';

function jsonResponse(res, status, payload, contentType = 'application/json; charset=utf-8') {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(status, {
    'content-type': contentType,
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

function parseArgs(argv = process.argv.slice(2)) {
  const out = { host: DEFAULT_HOST, port: DEFAULT_PORT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host') out.host = argv[++i];
    else if (arg === '--port') out.port = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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
        payTo: ethers.getAddress(payTo || deployment.owner || ZERO_ADDRESS),
        maxAmountRequired: String(quotePriceRaw),
        resource: resourceUrl,
        description: 'Pay for access to an A2A seller-agent quote. Escrow funding happens separately after acceptance.',
        mimeType: 'application/a2a+json',
        maxTimeoutSeconds: 300
      }
    ]
  };
}

function buildAgentCard({ baseUrl, deployment = loadDeployment() } = {}) {
  const endpoint = `${baseUrl}/a2a`;
  return {
    name: 'AI Work Market A2A Quote Adapter',
    description: 'A testnet-only A2A seller-agent adapter that uses x402 for quote access and AI Work Market for escrowed scoped-work settlement.',
    supportedInterfaces: [
      {
        url: endpoint,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0'
      }
    ],
    provider: {
      organization: 'AI Work Market',
      url: 'https://github.com/darioandyoshi-tech/ai-work-market'
    },
    version: '0.1.0',
    documentationUrl: 'https://github.com/darioandyoshi-tech/ai-work-market/blob/main/docs/a2a-work-intent.md',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [
        {
          uri: AWM_A2A_X402_EXTENSION,
          description: 'Advertises an x402 quote-access gate and returns an AI Work Market escrow offer for accepted work intents.',
          required: false,
          params: {
            x402: buildX402PaymentRequirements({ deployment, resourceUrl: endpoint }),
            settlement: {
              rail: 'ai-work-market',
              network: deployment.network,
              chainId: deployment.chainId,
              escrow: deployment.address,
              usdc: deployment.usdc
            }
          }
        }
      ]
    },
    securitySchemes: {
      x402: {
        apiKeySecurityScheme: {
          location: 'header',
          name: 'X-PAYMENT',
          description: 'x402 payment payload for quote/intake access; this demo only checks presence, production must verify with a facilitator.'
        }
      }
    },
    securityRequirements: [{ schemes: { x402: { list: [] } } }],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'quote-escrowed-work-intent',
        name: 'Quote escrowed work intent',
        description: 'Convert an A2A work-intent message into a canonical AI Work Market work spec, unsigned seller offer, and EIP-712 typed data.',
        tags: ['a2a', 'x402', 'usdc', 'base', 'escrow', 'work-intent'],
        examples: [
          'Quote a 25 USDC research brief with markdown proof and a 24 hour review window.',
          'Return an escrow offer for this implementation task after x402 quote access is paid.'
        ],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json']
      }
    ]
  };
}

function getMessage(params = {}) {
  return params.message || {};
}

function extractText(parts = []) {
  return parts.map((part) => part.text).filter(Boolean).join('\n').trim();
}

function firstDataPart(parts = []) {
  const found = parts.find((part) => part && part.data && typeof part.data === 'object' && !Array.isArray(part.data));
  return found ? found.data : null;
}

function extractWorkIntent(params = {}) {
  const message = getMessage(params);
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const metadataIntent = params.metadata?.aiWorkMarketIntent || message.metadata?.aiWorkMarketIntent;
  const dataIntent = firstDataPart(parts);
  const text = extractText(parts);
  const intent = { ...(metadataIntent || {}), ...(dataIntent || {}) };

  if (!intent.title && !intent.task && text) intent.title = text.split('\n')[0].slice(0, 140);
  if (!intent.deliverable && text) intent.deliverable = text;
  return intent;
}

function agentMessage({ contextId, taskId, parts, metadata }) {
  return {
    messageId: id('msg'),
    contextId,
    taskId,
    role: 'ROLE_AGENT',
    parts,
    metadata
  };
}

function taskResponse({ taskId, contextId, state, parts, artifacts = [], history = [], metadata = {} }) {
  const message = agentMessage({ contextId, taskId, parts, metadata });
  return {
    task: {
      id: taskId,
      contextId,
      status: { state, message, timestamp: nowIso() },
      artifacts,
      history,
      metadata
    }
  };
}

function missingRequiredIntentFields(intent) {
  return ['buyer', 'title', 'deliverable'].filter((field) => !String(intent[field] || '').trim());
}

async function handleSendMessage(params, { deployment, baseUrl, headers }) {
  const clientMessage = getMessage(params);
  const contextId = clientMessage.contextId || clientMessage.context_id || id('ctx');
  const taskId = clientMessage.taskId || clientMessage.task_id || id('task');
  const xPayment = headers['x-payment'];
  const paymentRequirements = buildX402PaymentRequirements({ deployment, resourceUrl: `${baseUrl}/a2a` });

  if (!xPayment) {
    return taskResponse({
      taskId,
      contextId,
      state: 'TASK_STATE_AUTH_REQUIRED',
      history: clientMessage.parts ? [clientMessage] : [],
      parts: [
        {
          text: 'x402 quote-access payment is required before this A2A adapter returns an AI Work Market escrow quote.',
          mediaType: 'text/plain'
        },
        { data: paymentRequirements, mediaType: 'application/json' }
      ],
      artifacts: [
        {
          artifactId: 'x402-payment-requirements',
          name: 'x402 payment requirements',
          parts: [{ data: paymentRequirements, mediaType: 'application/json' }],
          extensions: [AWM_A2A_X402_EXTENSION]
        }
      ],
      metadata: { extension: AWM_A2A_X402_EXTENSION, readsEnv: false, verifiesPayment: false }
    });
  }

  const intent = extractWorkIntent(params);
  const missing = missingRequiredIntentFields(intent);
  if (missing.length) {
    return taskResponse({
      taskId,
      contextId,
      state: 'TASK_STATE_INPUT_REQUIRED',
      history: clientMessage.parts ? [clientMessage] : [],
      parts: [
        {
          text: `Missing required work intent field(s): ${missing.join(', ')}.`,
          mediaType: 'text/plain'
        }
      ],
      metadata: { extension: AWM_A2A_X402_EXTENSION, missing }
    });
  }

  const quote = await requestWorkQuote(intent, { deployment });
  const artifact = {
    artifactId: 'ai-work-market-escrow-quote',
    name: 'AI Work Market escrow quote',
    description: 'Canonical work spec, unsigned offer, and EIP-712 typed data. No signature or transaction was produced by this adapter.',
    parts: [{ data: quote, mediaType: 'application/json' }],
    extensions: [AWM_A2A_X402_EXTENSION],
    metadata: {
      x402PaymentHeaderPresent: true,
      x402PaymentVerified: false,
      settlementRail: 'ai-work-market'
    }
  };

  return taskResponse({
    taskId,
    contextId,
    state: 'TASK_STATE_COMPLETED',
    history: clientMessage.parts ? [clientMessage] : [],
    parts: [
      {
        text: 'Prepared an AI Work Market escrow quote. Seller signing and buyer escrow funding remain separate explicit wallet-policy steps.',
        mediaType: 'text/plain'
      },
      { data: quote, mediaType: 'application/json' }
    ],
    artifacts: [artifact],
    metadata: {
      extension: AWM_A2A_X402_EXTENSION,
      x402PaymentHeaderPresent: true,
      x402PaymentVerified: false,
      readsEnv: false,
      signsTransactions: false,
      submitsTransactions: false
    }
  });
}

function jsonRpcResult(idValue, result) {
  return { jsonrpc: '2.0', id: idValue ?? null, result };
}

function jsonRpcError(idValue, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: idValue ?? null, error };
}

async function handleJsonRpc(body, context) {
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    return jsonRpcError(body?.id, -32600, 'Invalid JSON-RPC request');
  }

  try {
    if (body.method === 'SendMessage') {
      return jsonRpcResult(body.id, await handleSendMessage(body.params || {}, context));
    }
    if (body.method === 'GetTask') {
      return jsonRpcError(body.id, -32001, 'TaskNotFound', { id: body.params?.id });
    }
    if (body.method === 'ListTasks') {
      return jsonRpcResult(body.id, { tasks: [], nextPageToken: '' });
    }
    return jsonRpcError(body.id, -32601, 'Method not found');
  } catch (err) {
    return jsonRpcError(body.id, -32000, err.message || 'Server error');
  }
}

function createServer({ deployment = loadDeployment(), baseUrl } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, baseUrl || `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);
      const origin = baseUrl || url.origin;

      if (req.method === 'GET' && url.pathname === '/health') {
        return jsonResponse(res, 200, { ok: true, name: 'awm-a2a-adapter' });
      }

      if (req.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        return jsonResponse(res, 200, buildAgentCard({ baseUrl: origin, deployment }), 'application/a2a+json; charset=utf-8');
      }

      if (req.method === 'POST' && url.pathname === '/a2a') {
        const body = await readBody(req);
        const rpc = await handleJsonRpc(body, { deployment, baseUrl: origin, headers: req.headers });
        return jsonResponse(res, rpc.error ? 400 : 200, rpc, 'application/a2a+json; charset=utf-8');
      }

      return jsonResponse(res, 404, { error: 'not_found' });
    } catch (err) {
      return jsonResponse(res, 400, { error: err.message || 'bad_request' });
    }
  });
  return server;
}

if (require.main === module) {
  try {
    const args = parseArgs();
    if (args.help) {
      // eslint-disable-next-line no-console
      console.log('Usage: node examples/a2a/awm-a2a-adapter.js [--host 127.0.0.1] [--port 4021]');
      process.exit(0);
    }
    const server = createServer();
    server.listen(args.port, args.host, () => {
      // eslint-disable-next-line no-console
      console.log(`awm a2a adapter listening on http://${args.host}:${args.port}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  AWM_A2A_X402_EXTENSION,
  DEFAULT_QUOTE_PRICE_RAW,
  buildX402PaymentRequirements,
  buildAgentCard,
  extractWorkIntent,
  handleJsonRpc,
  createServer
};
