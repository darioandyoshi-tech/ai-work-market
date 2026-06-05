// api/mcp.js
// Hosted MCP (Model Context Protocol) SSE endpoint for ai-work-market.ai.
//
// This serves the MCP server at https://www.ai-work-market.ai/mcp, as
// advertised in /.well-known/mcp.json. It's a minimal implementation that:
//   1. On GET, returns a text/event-stream with the MCP 'ready' handshake
//      and a periodic ping (per the MCP spec for SSE transport).
//   2. On POST with application/json, accepts JSON-RPC 2.0 messages
//      (initialize, tools/list, tools/call) and responds with the matching
//      MCP protocol responses for the 5 AWM tool calls.
//
// Vercel serverless caps at 60s; this handler self-closes at 50s.
//
// This is NOT a full MCP server (no auth, no session resumption, no
// notifications/initialized flow). It implements enough of MCP for clients
// to discover the tools and make tool/call requests. mcp.so, glama.ai,
// and punkpeye import this URL as-is.

const TOOLS = [
  {
    name: 'awm_search_products',
    description: 'Search the AWM agent-product catalog. Returns products (market-map, n8n workflow, integration sprint) with their payment rails and proof hashes. No auth.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Optional search query (matches name, description, slug). Omit for full list.' },
      },
    },
    handler: async (args) => {
      const url = 'https://www.ai-work-market.ai/api/agent-products' +
        (args.q ? '?q=' + encodeURIComponent(args.q) : '');
      const r = await fetch(url);
      return await r.json();
    },
  },
  {
    name: 'awm_get_payment_request',
    description: 'GET /api/payment-request?slug=X returns a 402 challenge with { paymentRail, amount, payTo, token, tx, requestId, quoteId, challengeExpiresAt }. The requestId is server-generated for correlation.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug: { type: 'string', description: 'Product slug (e.g. "market-map", "n8n-workflow", "integration-sprint").' },
      },
    },
    handler: async (args) => {
      const r = await fetch('https://www.ai-work-market.ai/api/payment-request?slug=' + encodeURIComponent(args.slug));
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: 'awm_x402_consume',
    description: 'POST /api/x402-consume binds a USDC transfer receipt to a product. Returns { ok, intentId, signedDeliveryUrl } or { ok: false, reason }. The x-awm-signature HMAC header is AWM\'s job — you don\'t need to compute it. If x402_consume_secret is not set in Vercel, the endpoint operates in dev mode and accepts unsigned requests.',
    inputSchema: {
      type: 'object',
      required: ['tx', 'slug', 'quoteId', 'requestId'],
      properties: {
        tx: { type: 'string', description: '0x-prefixed Base mainnet USDC transfer transaction hash.' },
        slug: { type: 'string', description: 'Product slug from awm_get_payment_request.' },
        quoteId: { type: 'string', description: 'Server-generated quoteId from the payment challenge.' },
        requestId: { type: 'string', description: 'Server-generated requestId from the payment challenge.' },
      },
    },
    handler: async (args) => {
      const r = await fetch('https://www.ai-work-market.ai/api/x402-consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: 'awm_system_status',
    description: 'GET /api/system-status returns live on-chain state: nextIntentId, accumulatedFees, feeRecipient, owner, defaultFeeBps, blockNumber, escrow, usdc.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const r = await fetch('https://www.ai-work-market.ai/api/system-status');
      return await r.json();
    },
  },
  {
    name: 'awm_agent_reputation',
    description: 'GET /api/agent-reputation?address=0x... returns the on-chain reputation for an agent address: completedIntents, refundedIntents, disputedIntents, score (0-1000). Read-only, no auth.',
    inputSchema: {
      type: 'object',
      required: ['address'],
      properties: {
        address: { type: 'string', description: '0x-prefixed EVM address.' },
      },
    },
    handler: async (args) => {
      const r = await fetch('https://www.ai-work-market.ai/api/agent-reputation?address=' + encodeURIComponent(args.address));
      return await r.json();
    },
  },
  {
    name: 'awm_register_agent',
    description: 'POST /api/agent-onboard registers an agent in the central registry. Returns the hostedAt URL where the card is published and the registry storage backend name.',
    inputSchema: {
      type: 'object',
      required: ['address', 'name'],
      properties: {
        address: { type: 'string', description: '0x-prefixed EVM address (the agent\'s on-chain identity).' },
        name: { type: 'string', description: '2-64 char display name.' },
        description: { type: 'string', description: 'Optional, up to 1024 chars.' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Optional array of capability tags.' },
        x402PayTo: { type: 'string', description: 'Optional 0x address where you receive USDC for x402 services.' },
        website: { type: 'string', description: 'Optional https URL.' },
        contact: { type: 'string', description: 'Optional contact string (email, etc.).' },
      },
    },
    handler: async (args) => {
      const r = await fetch('https://www.ai-work-market.ai/api/agent-onboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      return await r.json();
    },
  },
  {
    name: 'awm_treasury_status',
    description: 'GET /api/treasury/status returns whether AWM_TREASURY_PRIVATE_KEY and AWM_REPUTATION_SIGNING_KEY are set in Vercel, derives their public addresses (never the keys), reports USDC + ETH balances on Base Mainnet, and surfaces warnings/recommendations. Read-only. Operator endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        network: { type: 'string', enum: ['mainnet', 'sepolia'], description: 'Default mainnet.' },
      },
    },
    handler: async (args) => {
      const url = new URL('https://www.ai-work-market.ai/api/treasury/status');
      if (args && args.network) url.searchParams.set('network', args.network);
      const r = await fetch(url.toString());
      return await r.json();
    },
  },
  {
    name: 'awm_treasury_dry_run',
    description: 'POST /api/treasury/test runs a 7-step readiness check for treasury mode: key_set, key_format, derive_address, rpc_reachable, eth_balance, sign_test_message, chain_id_match. No transaction is sent. Returns pass/warn/fail with per-check details. Operator endpoint.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (args) => {
      const r = await fetch('https://www.ai-work-market.ai/api/treasury/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      return await r.json();
    },
  },
];

// === JSON-RPC 2.0 handler ===

function rpcOk(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function rpcErr(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleRpc(method, params, id) {
  switch (method) {
    case 'initialize':
      return rpcOk(id, {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'ai-work-market', version: '1.0.0' },
        capabilities: { tools: {} },
      });
    case 'notifications/initialized':
      // Client just notified us; no response needed (it's a notification, not a request).
      return null;
    case 'tools/list':
      return rpcOk(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case 'tools/call': {
      const { name, arguments: args } = params || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcErr(id, -32601, 'tool_not_found: ' + name);
      try {
        const result = await tool.handler(args || {});
        return rpcOk(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (e) {
        return rpcOk(id, {
          content: [{ type: 'text', text: 'tool_error: ' + e.message }],
          isError: true,
        });
      }
    }
    case 'ping':
      return rpcOk(id, {});
    default:
      return rpcErr(id, -32601, 'method_not_found: ' + method);
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// === Handlers ===

module.exports = async function handler(req, res) {
  // CORS: any origin can use this; mcp clients may live on different domains.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // GET → SSE handshake (per MCP spec: clients may GET to discover / keep alive)
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('x-accel-buffering', 'no'); // disable nginx buffering
    res.setHeader('connection', 'keep-alive');

    // Handshake
    const write = (event, data, id) => {
      if (event) res.write(`event: ${event}\n`);
      if (id != null) res.write(`id: ${id}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    write('ready', { server: 'ai-work-market', version: '1.0.0', tools: TOOLS.length });

    // Periodic keepalive
    const start = Date.now();
    const MAX_RUNTIME_MS = 50_000; // < Vercel's 60s cap
    const timer = setInterval(() => {
      if (Date.now() - start > MAX_RUNTIME_MS) {
        write('close', { reason: 'runtime_cap' });
        clearInterval(timer);
        res.end();
        return;
      }
      res.write(`: keepalive ${Date.now()}\n\n`);
    }, 12_000);

    req.on('close', () => clearInterval(timer));
    return; // Keep connection open until timer ends it
  }

  // POST → JSON-RPC 2.0 dispatch
  if (req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); }
    catch (e) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(rpcErr(null, -32700, 'parse_error: ' + e.message)));
    }
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(rpcErr(body?.id ?? null, -32600, 'invalid_request: must be { jsonrpc: "2.0", method, params?, id? }')));
    }
    const result = await handleRpc(body.method, body.params, body.id ?? null);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (result === null) {
      // Notification (no id): return 204 No Content
      res.statusCode = 204;
      return res.end();
    }
    return res.end(JSON.stringify(result));
  }

  // Anything else
  res.setHeader('allow', 'GET, POST, OPTIONS');
  res.statusCode = 405;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify({ error: 'method_not_allowed', allow: 'GET, POST, OPTIONS' }));
};
