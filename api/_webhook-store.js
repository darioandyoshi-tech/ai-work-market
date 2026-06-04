// api/_webhook-store.js
// In-memory store for webhook subscriptions.
// Lives for the lifetime of the Vercel serverless instance.
// For multi-region durability, swap for Vercel KV or a tiny external store.
//
// This file is intentionally NOT a Vercel handler (no module.exports = handler).
// It exports data-store helpers only.

let _subs = [];
let _id = 0;

function addSub(sub) {
  _subs.push(sub);
  if (_subs.length > 1000) _subs = _subs.slice(-1000); // bound memory
  return sub;
}

function removeSub(id) {
  const before = _subs.length;
  _subs = _subs.filter((s) => s.id !== id);
  return _subs.length < before;
}

function listSubs() {
  return _subs.slice();
}

function getSubs(intentId) {
  if (!intentId) return _subs.slice();
  return _subs.filter((s) => String(s.intentId) === String(intentId));
}

// Test helper — wipe state. Not exposed via HTTP.
function _reset() { _subs = []; }

module.exports = { addSub, removeSub, listSubs, getSubs, _reset };
