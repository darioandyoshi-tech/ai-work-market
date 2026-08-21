// api/_fulfillment-store.js
// Durable fulfillment event store. Uses @vercel/kv (Vercel KV / Upstash Redis)
// in production, with an in-memory fallback for development / single-instance
// testing.
//
// Storage layout in KV:
//   awm:fulfillment:event:<id>          STRING  JSON fulfillment record (dedup by Stripe event id)
//   awm:fulfillment:by-session:<sid>    SET     of event ids for a Stripe session
//   awm:fulfillment:all                 LIST (capped) of all event ids
//
// This replaces the previous ephemeral local JSON file, which was lost on every
// Vercel redeploy. Production now has a durable fulfillment trail.

let _backend = null;
let _backendInit = false;
let _memory = new Map(); // id -> record
let _bySession = new Map(); // sessionId -> Set<id>
let _all = []; // ordered ids

function getBackend() {
  if (_backendInit) return _backend;
  _backendInit = true;

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = require('@vercel/kv');
      _backend = {
        type: 'vercel-kv',
        kv,
        async recordEvent(record) {
          const k = 'awm:fulfillment:event:' + record.id;
          await kv.set(k, JSON.stringify(record));
          if (record.sessionId) {
            await kv.sadd('awm:fulfillment:by-session:' + record.sessionId, record.id);
          }
          await kv.lpush('awm:fulfillment:all', record.id);
          await kv.ltrim('awm:fulfillment:all', 0, 9999); // keep last 10k
        },
        async getSessionRecord(sessionId) {
          const ids = (await kv.smembers('awm:fulfillment:by-session:' + sessionId)) || [];
          for (const id of ids) {
            const raw = await kv.get('awm:fulfillment:event:' + id);
            if (raw) {
              try { return JSON.parse(raw); } catch (_) { /* skip corrupt */ }
            }
          }
          return null;
        },
      };
      return _backend;
    } catch (e) {
      console.warn('[AWM-WARN] @vercel/kv unavailable, falling back to in-memory store:', e.message);
    }
  }

  // In-memory fallback (development / single-instance only)
  _backend = {
    type: 'memory',
    async recordEvent(record) {
      _memory.set(record.id, record);
      if (record.sessionId) {
        if (!_bySession.has(record.sessionId)) _bySession.set(record.sessionId, new Set());
        _bySession.get(record.sessionId).add(record.id);
      }
      _all.push(record.id);
      if (_all.length > 10000) _all.shift();
    },
    async getSessionRecord(sessionId) {
      const ids = _bySession.get(sessionId);
      if (!ids) return null;
      for (const id of ids) {
        const r = _memory.get(id);
        if (r) return r;
      }
      return null;
    },
  };
  return _backend;
}

/**
 * Record a fulfillment event, deduplicated by Stripe event id.
 * @param {object} event Stripe webhook event (or normalized object with .id)
 * @returns {object|null} the stored record, or null if it was a duplicate
 */
async function recordEvent(event) {
  const backend = getBackend();
  const record = {
    id: event.id,
    type: event.type,
    productSlug: event.productSlug,
    sessionId: event.data?.object?.id,
    liveMode: event.livemode,
    timestamp: new Date().toISOString(),
    rawEventId: event.id,
  };

  // Dedup: if already recorded, return null (no-op)
  const existing = await backend.getSessionRecord(record.sessionId);
  if (existing && existing.id === record.id) return null;

  await backend.recordEvent(record);
  return record;
}

/**
 * Look up the fulfillment record for a Stripe session.
 * @param {string} sessionId
 * @returns {object|null}
 */
async function getSessionRecord(sessionId) {
  const backend = getBackend();
  return backend.getSessionRecord(sessionId);
}

module.exports = {
  recordEvent,
  getSessionRecord,
};
