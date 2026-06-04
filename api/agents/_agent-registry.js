// api/agents/_agent-registry.js
// Agent card registry. Tries in order:
//   1. @vercel/kv SDK (requires KV_REST_API_URL + KV_REST_API_TOKEN + package install)
//   2. Upstash REST (requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//   3. Upstash TCP via rediss:// URL (requires KV_URL or REDIS_URL, no npm install)
//   4. In-memory fallback (single-instance only, NOT for production)
//
// The TCP path is what we use when the Vercel Marketplace Upstash integration
// sets rediss:// URLs (KV_URL, REDIS_URL) but no REST API token. We just need
// host + password, which we can extract from the rediss:// URL.

let _backend = null;
let _memory = new Map();
let _byAddress = new Map();
let _byCap = new Map();

function serialize(card) {
  // Note: we store pre-stringified JSON for arrays/objects. The @vercel/kv
  // backend auto-parses these on read (returns real arrays), and our
  // deserialize() handles both shapes via parseMaybe(). The upstash-rest
  // and upstash-tcp backends return raw strings and need the JSON.parse
  // path — so pre-stringifying here works for all backends.
  return {
    // Store id as hex only (no 'agent:' prefix) to avoid colons in
    // Upstash HSET values, which Vercel fetch decodes (%3A → :) and
    // breaks Upstash arg parsing.
    id: String(card.id).replace(/^agent:/, ''),
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
  // Defensive parse: @vercel/kv auto-parses values that look like JSON arrays
  // or objects, so a stored '["a","b"]' comes back as a real array. A stored
  // '"plain string"' comes back as a string. We accept both shapes.
  const parseMaybe = (v, fallback) => {
    if (v == null || v === '') return fallback;
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return v; // already parsed object (e.g. signature)
    if (typeof v !== 'string') return fallback;
    try { return JSON.parse(v); } catch (_) { return fallback; }
  };
  const caps  = parseMaybe(s.capabilities, []);
  const sigs  = parseMaybe(s.signature,   null);
  const servs = parseMaybe(s.services,    []);
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

function buildUpstashBackend(client) {
  return {
    type: client._using || 'upstash',
    async getAll() {
      // Note: keys use no separators (not ':' or '-') to avoid Vercel fetch
      // decoding %3A. Keys are also b64-encoded by the client to dodge
      // Vercel's %3A decoding in the URL path. See _upstash-rest.js.
      const ids = (await client.smembers('awmcards')) || [];
      const cards = [];
      for (const id of ids) {
        const c = await client.hgetall('awmcard-' + id);
        if (c && c.id) cards.push(deserialize(c));
      }
      return cards;
    },
    async set(card) {
      // Strip the 'agent:' prefix from card.id to avoid colons in keys.
      const idHex = String(card.id).replace(/^agent:/, '');
      await client.sadd('awmcards', idHex);
      await client.hset('awmcard-' + idHex, serialize(card));
      await client.set('awmaddr-' + String(card.address).toLowerCase(), idHex);
      for (const cap of card.capabilities || []) {
        await client.sadd('awmcap-' + String(cap).toLowerCase(), idHex);
      }
    },
    async get(id) {
      const idHex = String(id).replace(/^agent:/, '');
      const c = await client.hgetall('awmcard-' + idHex);
      return c && c.id ? deserialize(c) : null;
    },
    async findByAddress(address) {
      const idHex = await client.get('awmaddr-' + String(address).toLowerCase());
      return idHex ? this.get(idHex) : null;
    },
    async findByCapability(cap) {
      const ids = (await client.smembers('awmcap-' + String(cap).toLowerCase())) || [];
      const cards = [];
      for (const id of ids) {
        const c = await this.get(id);
        if (c) cards.push(c);
      }
      return cards;
    },
    async stats() {
      const ids = (await client.smembers('awmcards')) || [];
      return { totalCards: ids.length };
    },
  };
}

function buildVercelKVBackend(kv) {
  return buildUpstashBackend({
    get: (k) => kv.get(k),
    set: (k, v) => kv.set(k, v),
    hset: (k, obj) => kv.hset(k, obj),
    hgetall: (k) => kv.hgetall(k),
    smembers: (k) => kv.smembers(k),
    sadd: (k, v) => kv.sadd(k, v),
    _using: 'vercel-kv',
  });
}

async function getBackend() {
  if (_backend) return _backend;
  if (_backend === false) return null;

  // Priority 1: @vercel/kv SDK with KV_REST_API_URL + KV_REST_API_TOKEN
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = require('@vercel/kv');
      _backend = buildVercelKVBackend(kv);
      return _backend;
    } catch (e) {
      // package not installed; fall through
    }
  }

  // Priority 2: Upstash REST (UPSTASH_REDIS_REST_URL + _TOKEN)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const makeUpstash = require('./_upstash-rest.js');
      const upstash = makeUpstash();
      _backend = buildUpstashBackend(upstash);
      return _backend;
    } catch (e) {
      // fall through
    }
  }

  // Priority 3: Upstash via TCP/TLS using rediss:// URL (KV_URL or REDIS_URL)
  const tcpUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL_TCP;
  if (tcpUrl && tcpUrl.startsWith('rediss://')) {
    try {
      const makeUpstashTcp = require('./_upstash-tcp.js');
      const upstash = makeUpstashTcp(tcpUrl);
      // Test the connection by PINGing
      await upstash.ping();
      _backend = buildUpstashBackend(upstash);
      return _backend;
    } catch (e) {
      console.warn('upstash-tcp init failed:', e.message);
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
  if (backend) return { backend: backend.type, totalCards: (await backend.stats()).totalCards };
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
