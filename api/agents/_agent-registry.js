// api/agents/_agent-registry.js
// Agent card registry. Tries Vercel KV first, then Upstash Redis, then
// falls back to in-memory (which works only on a single warm instance —
// NOT for production cross-instance use).
//
// Setup: in Vercel project settings, set either:
//   KV_REST_API_URL + KV_REST_API_TOKEN  (Vercel KV / Marketplace integration)
// OR
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (Upstash Redis)
//
// The Vercel Functions runtime already has @vercel/kv available if you
// added the integration. For Upstash, the @upstash/redis package is
// lazy-installed on first request.
//
// If neither is configured, the registry falls back to in-memory storage.
// This is fine for development and small-scale testing but cards will
// vanish across instance cold-starts in production.

let _backend = null;
let _memory = new Map();     // id -> card
let _byAddress = new Map();  // address -> id
let _byCap = new Map();      // capability -> Set<id>

async function getBackend() {
  if (_backend) return _backend;
  if (_backend === false) return null; // failed init, don't retry

  // Try Vercel KV first
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = require('@vercel/kv');
      _backend = {
        type: 'vercel-kv',
        async getAll() {
          // We use a SET of card ids plus one HASH per card. SADD/SMEMBERS
          // is cheap; HGETALL per id.
          const ids = await kv.smembers('awm:agent-cards:ids') || [];
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
          const ids = await kv.smembers('awm:agent-by-cap:' + cap.toLowerCase()) || [];
          const cards = [];
          for (const id of ids) {
            const c = await this.get(id);
            if (c) cards.push(c);
          }
          return cards;
        },
        async stats() {
          const ids = await kv.smembers('awm:agent-cards:ids') || [];
          return { totalCards: ids.length };
        },
      };
      return _backend;
    } catch (e) {
      console.warn('vercel-kv init failed:', e.message);
    }
  }

  // Try Upstash REST
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const upstash = require('./_upstash-rest.js');
      _backend = {
        type: 'upstash',
        async getAll() {
          const ids = await upstash.smembers('awm:agent-cards:ids') || [];
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
          const ids = await upstash.smembers('awm:agent-by-cap:' + cap.toLowerCase()) || [];
          const cards = [];
          for (const id of ids) {
            const c = await this.get(id);
            if (c) cards.push(c);
          }
          return cards;
        },
        async stats() {
          const ids = await upstash.smembers('awm:agent-cards:ids') || [];
          return { totalCards: ids.length };
        },
      };
      return _backend;
    } catch (e) {
      console.warn('upstash init failed:', e.message);
    }
  }

  _backend = false; // mark failed
  return null;
}

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

// Public API: always tries backend first, falls back to in-memory.
async function addCard(card) {
  const backend = await getBackend();
  if (backend) {
    await backend.set(card);
    return card;
  }
  // In-memory fallback
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
