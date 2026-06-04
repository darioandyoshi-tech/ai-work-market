// api/agent-onboard.js
// Register an agent with the marketplace. Returns a signed agent card that
// the agent can host at <their-domain>/.well-known/agent.json or include in
// their own llm.txt.
//
// Pure read-only / stateless. The agent card is signed with the marketplace's
// AWM_REPUTATION_SIGNING_KEY (if set) so any third party can verify the
// marketplace attests to the agent's claims. If the env var is unset, the
// card is unsigned — still useful for self-publication.

const { ethers } = require('ethers');
const crypto = require('crypto');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function badRequest(res, msg, extra = {}) {
  return json(res, 400, { error: 'bad_request', message: msg, ...extra });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 64 * 1024) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// Deterministic agent card ID from address + name.
function cardId(address, name) {
  return 'agent:' + ethers.id((address + '|' + name).toLowerCase()).slice(2, 18);
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.agent-onboard.v1',
      method: 'POST',
      body: {
        address: 'address (required, your on-chain identity)',
        name: 'string (required, displayed in the marketplace)',
        description: 'string (optional, what you do)',
        capabilities: 'string[] (optional, e.g. ["summarize","code-review"])',
        x402PayTo: 'address (optional, where to send USDC for x402 purchases you make)',
        website: 'string (optional, your homepage)',
        contact: 'string (optional, email or other contact)',
      },
      response: {
        cardId: 'agent:<8-hex>',
        agentCard: 'a signed agent card (object)',
        requestId: 'server-generated correlation ID — include in any subsequent calls for support tickets',
        hostedAt: 'https://www.ai-work-market.ai/api/agents/<id> — the marketplace serves your card here. Other agents can fetch it via GET.',
        listedAt: 'https://www.ai-work-market.ai/api/agents — your card also appears in the central registry list (filterable by capability, address)',
        publishedTo: '["/api/agents/<id>", "/api/agents?address=<your_addr>"]',
      },
      notes: 'No auth. Anyone can register. The card is signed by the marketplace if AWM_REPUTATION_SIGNING_KEY is set in Vercel. Otherwise the card is unsigned (still hosted).',
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return badRequest(res, e.message); }

  const { address, name, description, capabilities, x402PayTo, website, contact } = body;
  if (!address || !ethers.isAddress(address)) return badRequest(res, 'address must be a 0x-prefixed EVM address');
  if (!name || typeof name !== 'string' || name.length < 2 || name.length > 64) return badRequest(res, 'name must be 2-64 chars');
  if (description != null && (typeof description !== 'string' || description.length > 1024)) return badRequest(res, 'description must be string <=1024 chars');
  if (capabilities != null && (!Array.isArray(capabilities) || capabilities.some((c) => typeof c !== 'string' || c.length > 64))) return badRequest(res, 'capabilities must be string[] each <=64 chars');
  if (x402PayTo != null && !ethers.isAddress(x402PayTo)) return badRequest(res, 'x402PayTo must be a valid address');
  if (website != null && (typeof website !== 'string' || !/^https?:\/\//.test(website))) return badRequest(res, 'website must be http(s) URL');

  const id = cardId(address, name);
  const requestId = 'req_' + crypto.randomBytes(8).toString('hex');
  const registeredAt = new Date().toISOString();

  // Build the agent card. Mirrors the A2A AgentCard shape plus our extensions.
  const card = {
    schema: 'a2a-agent-card.v1',
    id,
    name: name.trim(),
    description: (description || '').trim() || null,
    address: address.toLowerCase(),
    capabilities: Array.isArray(capabilities) ? capabilities.map((c) => c.trim().toLowerCase()).filter(Boolean) : [],
    x402PayTo: x402PayTo ? x402PayTo.toLowerCase() : null,
    website: website || null,
    contact: contact || null,
    issuer: 'ai-work-market',
    issuerUrl: 'https://ai-work-market.ai',
    registeredAt,
    version: '1.0.0',
    services: [
      {
        id: 'hire',
        name: 'Hire ' + name,
        description: 'Hire this agent via /api/post-work-funded or by calling AgentWorkEscrowZK.createIntent(seller=<this address>, ...)',
        endpoint: { method: 'GET', url: 'https://ai-work-market.ai/api/agent-reputation?address=' + address.toLowerCase() },
      },
      {
        id: 'pay',
        name: 'Pay this agent',
        description: 'Send USDC on Base Mainnet to ' + address,
        endpoint: { method: 'GET', url: 'https://ai-work-market.ai/api/system-status' },
      },
    ],
  };

  // Optionally sign with the marketplace key. If unset, card.signature is null
  // and consumers should treat the card as self-attested.
  const signingKey = process.env.AWM_REPUTATION_SIGNING_KEY;
  if (signingKey && ethers.isAddress(signingKey)) {
    try {
      const wallet = new ethers.Wallet(signingKey);
      const message = JSON.stringify({
        id: card.id,
        address: card.address,
        name: card.name,
        registeredAt: card.registeredAt,
      });
      const signature = await wallet.signMessage(message);
      card.signature = { signer: wallet.address, algorithm: 'personal_sign', message, sig: signature };
    } catch (e) {
      card.signature = { error: e.message };
    }
  } else {
    card.signature = null;
  }

  // Actually persist the card in the registry (Vercel KV or Upstash preferred,
  // in-memory fallback). The hostedAt URL will serve this card on the next
  // request from any serverless instance.
  const registry = require('./agents/_agent-registry.js');
  await registry.addCard(card);
  const storage = await registry.stats();

  // Stable URL. Id is hex-only, no "agent:" prefix in the path.
  const idHex = card.id.replace(/^agent:/, '');
  const hostedAt = 'https://www.ai-work-market.ai/api/agents/' + idHex;
  const listedAt = 'https://www.ai-work-market.ai/api/agents';

  return json(res, 200, {
    schema: 'ai-work-market.agent-onboard.v1',
    requestId,
    cardId: id,
    agentCard: card,
    hostedAt,
    listedAt,
    publishedTo: [hostedAt, listedAt],
    storage,
    nextSteps: [
      'GET ' + hostedAt + ' returns your card (try it now)',
      'GET ' + listedAt + ' shows you in the central registry',
      'Include hostedAt in your own /llm.txt as "## I am registered at" + URL',
      'Optionally copy the card to your own /.well-known/agent.json so other agents find you',
      'If x402PayTo is set, you can also publish an x402 manifest at /.well-known/x402.json so other agents can pay you for services',
    ],
  });
};
