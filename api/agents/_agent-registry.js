// api/agents/_agent-registry.js
// Agent card registry. Tries Vercel KV first (most native, set by Vercel
// Marketplace Upstash integration as KV_REST_API_URL + KV_REST_API_TOKEN),
// then Upstash REST (UPSTASH_REDIS_REST_URL + _TOKEN), then in-memory
// fallback (single-instance only).
//
// IMPORTANT: To use Vercel KV env vars with the Upstash REST client, we
// pass URL+token explicitly rather than reassigning process.env. The
// latter triggers token-redaction in some tooling that mangles the file.

let _backend = null;
let _memory = new Map();
let _byAddress = new Map();
let _byCap = new Map();

function serialize(card) {
  return {
    id: card.id,
    name: card.name,
    description: card.description || '',
    address: card.address,
    capabilities: JSON.stringify(card.capabilities || []),
    x402PayTo: card.x402PayTo || '',
    website: card.website || '',
    contact: card.contact || '',
    issuer: card.issuer || '',
    issuerUrl: card.issuerUrl || '',
    registeredAt: card.registeredAt,
    version: card.version || '1.0.0',
    services: JSON.stringify(card.services || []),
    signature: card.signature ? JSON.stringify(card.signature) : '',
  };
}

function deserialize(s) {
  let caps = [], sigs = [], servs = [];
  try { caps = JSON.parse(s.capabilities || '[]'); } catch (_) {}
  try { sigs = JSON.parse(s.signature || 'null'); } catch (_) {}
  try { servs = JSON.parse(s.services || '[]'); } catch (_) {}
  return {
    id: s.id,
    name: s.name,
    description: s.description || null,
    address: s.address,
    capabilities: caps,
    x402PayTo: s.x402PayTo || null,
    website: s.website || null,
    contact: s.contact || null,
    issuer: s.issuer || null,
    issuerUrl: s.issuerUrl || null,
    registeredAt: s.registeredAt,
    version: s.version || '1.0.0',
    services: servs,
    signature: sigs || null,
  };
}

function buildUpstashBackend(upstash) {
  return {
    type: 'upstash-rest',
    async getAll() {
      const ids = (await upstash.smembers('awm:agent-cards:ids')) || [];
      const cards = [];
      for (const id of ids) {
        const c = await upstash.hgetall('awm:agent-card:' + id);
        if (c && c.id) cards.push(deserialize(c));
      }
      return cards;
    },
    async set(card) {
      await upstash.sadd('awm:agent-cards:ids', card.id);
      await upstash.hset('awm:agent-card:' + card.id, serialize(card));
      await upstash.set('awm:agent-by-addr:' + card.address, card.id);
      for (const cap of card.capabilities || []) {
        await upstash.sadd('awm:agent-by-cap:' + cap, card.id);
      }
    },
    async get(id) {
      const c = await upstash.hgetall('awm:agent-card:' + id);
      return c && c.id ? deserialize(c) : null;
    },
    async findByAddress(address) {
      const id = await upstash.get('awm:agent-by-addr:' + address.toLowerCase());
      return id ? this.get(id) : null;
    },
    async findByCapability(cap) {
      const ids = (await upstash.smembers('awm:agent-by-cap:' + cap.toLowerCase())) || [];
      const cards = [];
      for (const id of ids) {
        const c = await this.get(id);
        if (c) cards.push(c);
      }
      return cards;
    },
    async stats() {
      const ids = (await upstash.smembers('awm:agent-cards:ids')) || [];
      return { totalCards: ids.length };
    },
  };
}

function buildVercelKVBackend(kv) {
  return {
    type: 'vercel-kv',
    async getAll() {
      const ids = (await kv.smembers('awm:agent-cards:ids')) || [];
      const cards = [];
      for (const id of ids) {
        const c = await kv.hgetall('awm:agent-card:' + id);
        if (c && c.id) cards.push(deserialize(c));
      }
      return cards;
    },
    async set(card) {
      await kv.sadd('awm:agent-cards:ids', card.id);
      await kv.hset('awm:agent-card:' + card.id, serialize(card));
      await kv.set('awm:agent-by-addr:' + card.address, card.id);
      for (const cap of card.capabilities || []) {
        await kv.sadd('awm:agent-by-cap:' + cap, card.id);
      }
    },
    async get(id) {
      const c = await kv.hgetall('awm:agent-card:' + id);
      return c && c.id ? deserialize(c) : null;
    },
    async findByAddress(address) {
      const id = await kv.get('awm:agent-by-addr:' + address.toLowerCase());
      return id ? this.get(id) : null;
    },
    async findByCapability(cap) {
      const ids = (await kv.smembers('awm:agent-by-cap:' + cap.toLowerCase())) || [];
      const cards = [];
      for (const id of ids) {
        const c = await this.get(id);
        if (c) cards.push(c);
      }
      return cards;
    },
    async stats() {
      const ids = (await kv.smembers('awm:agent-cards:ids')) || [];
      return { totalCards: ids.length };
    },
  };
}

async function getBackend() {
  if (_backend) return _backend;
  if (_backend === false) return null;

  // Priority 1: Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN, set by
  // Vercel Marketplace Upstash integration). Try the @vercel/kv SDK first.
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = require('@vercel/kv');
      _backend = buildVercelKVBackend(kv);
      return _backend;
    } catch (e) {
      // @vercel/kv not installed. Fall through to Upstash REST with the
      // KV_REST_API_URL/KV_REST_API_TOKEN values passed directly.
    }
    try {
      // Build a fresh upstash client with the Vercel KV env vars, no
      // process.env reassignment (which some tools mangle).
      const makeUpstash = require('./_upstash-rest.js');
      const upstash = makeUpstash(
        process.env.KV_REST_API_URL,
        process.env.KV_REST_API_TOKEN
      );
      _backend = buildUpstashBackend(upstash);
      return _backend;
    } catch (e) {
      console.warn('KV REST fallback failed:', e.message);
    }
  }

  // Priority 2: Direct Upstash (UPSTASH_REDIS_REST_URL + _TOKEN)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const makeUpstash = require('./_upstash-rest.js');
      const upstash = makeUpstash();
      _backend = buildUpstashBackend(upstash);
      return _backend;
    } catch (e) {
      console.warn('upstash init failed:', e.message);
    }
  }

  _backend = false;
  return null;
}

async function addCard(card) {
  const backend = await getBackend();
  if (backend) {
    await backend.set(card);
    return card;
  }
  _memory.set(card.id, card);
  _byAddress.set(card.address, card.id);
  for (const cap of card.capabilities || []) {
    if (!_byCap.has(cap)) _byCap.set(cap, new Set());
    _byCap.get(cap).add(card.id);
  }
  return card;
}

async function getCard(id) {
  const backend = await getBackend();
  if (backend) return backend.get(id);
  return _memory.get(id) || null;
}

async function listCards() {
  const backend = await getBackend();
  if (backend) return backend.getAll();
  return [..._memory.values()].sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)));
}

async function findByAddress(address) {
  const backend = await getBackend();
  if (backend) return backend.findByAddress(address);
  const id = _byAddress.get(String(address).toLowerCase());
  return id ? _memory.get(id) : null;
}

async function findByCapability(cap) {
  const backend = await getBackend();
  if (backend) return backend.findByCapability(cap);
  const set = _byCap.get(String(cap).toLowerCase());
  if (!set) return [];
  return [...set].map((id) => _memory.get(id)).filter(Boolean);
}

async function stats() {
  const backend = await getBackend();
  if (backend) return { backend: backend.type, ...await backend.stats() };
  return {
    backend: 'in-memory (NOT for production cross-instance use)',
    totalCards: _memory.size,
    totalAddresses: _byAddress.size,
    totalCapabilities: _byCap.size,
  };
}

function _reset() {
  _memory = new Map();
  _byAddress = new Map();
  _byCap = new Map();
}

module.exports = { addCard, getCard, listCards, findByAddress, findByCapability, stats, _reset };
