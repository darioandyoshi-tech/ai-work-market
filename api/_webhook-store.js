// api/_webhook-store.js
// Webhook subscription store. Uses @vercel/kv (or falls back to in-memory
// for development / single-instance testing).
//
// Storage layout in KV:
//   awm:webhook:sub:<id>           HASH  { url, intentId, secret, createdAt, lastFiredAt?, lastError? }
//   awm:webhook:by-intent:<intentId> SET  of subscription ids
//   awm:webhook:all                LIST (capped) of all subscription ids (for the cron to scan)

let _backend = null;
let _memory = new Map(); // id -> sub
let _byIntent = new Map(); // intentId -> Set<id>
let _id = 0;

async function getBackend() {
  if (_backend) return _backend;
  if (_backend === false) return null;

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = require('@vercel/kv');
      _backend = {
        type: 'vercel-kv',
        kv,
        async addSub(sub) {
          const k = 'awm:webhook:sub:' + sub.id;
          await kv.hset(k, {
            url: sub.url,
            intentId: String(sub.intentId),
            secret: sub.secret || '',
            createdAt: sub.createdAt,
            lastFiredAt: sub.lastFiredAt || '',
            lastError: sub.lastError || '',
            status: 'active',
          });
          await kv.sadd('awm:webhook:by-intent:' + sub.intentId, sub.id);
          await kv.lpush('awm:webhook:all', sub.id);
          await kv.ltrim('awm:webhook:all', 0, 999); // keep last 1000
        },
        async getSub(id) {
          const k = 'awm:webhook:sub:' + id;
          const data = await kv.hgetall(k);
          if (!data || !data.id && !data.url) return null;
          return { id, ...data };
        },
        async listByIntent(intentId) {
          const ids = (await kv.smembers('awm:webhook:by-intent:' + intentId)) || [];
          const subs = [];
          for (const id of ids) {
            const s = await this.getSub(id);
            if (s && s.status === 'active') subs.push(s);
          }
          return subs;
        },
        async listAll() {
          const ids = (await kv.lrange('awm:webhook:all', 0, 999)) || [];
          const subs = [];
          for (const id of ids) {
            const s = await this.getSub(id);
            if (s) subs.push(s);
          }
          return subs;
        },
        async removeSub(id) {
          const sub = await this.getSub(id);
          if (!sub) return false;
          await kv.del('awm:webhook:sub:' + id);
          await kv.srem('awm:webhook:by-intent:' + sub.intentId, id);
          await kv.lrem('awm:webhook:all', 0, id);
          return true;
        },
        async markFired(id, ok, error) {
          const k = 'awm:webhook:sub:' + id;
          await kv.hset(k, {
            lastFiredAt: new Date().toISOString(),
            lastError: error || '',
            status: ok ? 'active' : 'active', // keep active even on error; can add backoff later
          });
        },
      };
      return _backend;
    } catch (e) {
      console.warn('@vercel/kv not available, using in-memory for webhooks:', e.message);
    }
  }

  _backend = false;
  return null;
}

function genId() {
  return 'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

async function addSub({ url, intentId, secret }) {
  const sub = {
    id: genId(),
    url,
    intentId: String(intentId),
    secret: secret || '',
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  const backend = await getBackend();
  if (backend) {
    await backend.addSub(sub);
    return sub;
  }
  _memory.set(sub.id, sub);
  if (!_byIntent.has(sub.intentId)) _byIntent.set(sub.intentId, new Set());
  _byIntent.get(sub.intentId).add(sub.id);
  return sub;
}

async function getSub(id) {
  const backend = await getBackend();
  if (backend) return backend.getSub(id);
  return _memory.get(id) || null;
}

async function listSubs(intentId) {
  const backend = await getBackend();
  if (backend) {
    if (intentId) return backend.listByIntent(String(intentId));
    return backend.listAll();
  }
  if (intentId) {
    const ids = _byIntent.get(String(intentId)) || new Set();
    return [...ids].map((id) => _memory.get(id)).filter(Boolean);
  }
  return [..._memory.values()];
}

async function removeSub(id) {
  const backend = await getBackend();
  if (backend) return backend.removeSub(id);
  const sub = _memory.get(id);
  if (!sub) return false;
  _memory.delete(id);
  const set = _byIntent.get(sub.intentId);
  if (set) set.delete(id);
  return true;
}

async function markFired(id, ok, error) {
  const backend = await getBackend();
  if (backend) return backend.markFired(id, ok, error);
  const sub = _memory.get(id);
  if (sub) {
    sub.lastFiredAt = new Date().toISOString();
    sub.lastError = error || '';
  }
}

module.exports = { addSub, getSub, listSubs, removeSub, markFired, genId };
