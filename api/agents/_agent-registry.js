// api/agents/_agent-registry.js
// In-memory agent card registry. Persists for the lifetime of the Vercel
// instance; swap for Vercel KV or external store for durability.
//
// Cards are keyed by id (hex string) and also indexed by address (one card per
// address — re-registering overwrites the previous one) and by capability.

let _cards = new Map();      // id -> card
let _byAddress = new Map();  // address -> id
let _byCap = new Map();      // capability -> Set<id>

function addCard(card) {
  _cards.set(card.id, card);
  _byAddress.set(card.address, card.id);
  for (const cap of card.capabilities || []) {
    if (!_byCap.has(cap)) _byCap.set(cap, new Set());
    _byCap.get(cap).add(card.id);
  }
  if (_cards.size > 5000) {
    // Bound memory: drop the oldest by registeredAt
    const all = [..._cards.values()].sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt)));
    const drop = all.slice(0, all.length - 5000);
    for (const c of drop) removeCard(c.id);
  }
  return card;
}

function removeCard(id) {
  const c = _cards.get(id);
  if (!c) return false;
  _cards.delete(id);
  if (_byAddress.get(c.address) === id) _byAddress.delete(c.address);
  for (const cap of c.capabilities || []) {
    const set = _byCap.get(cap);
    if (set) {
      set.delete(id);
      if (set.size === 0) _byCap.delete(cap);
    }
  }
  return true;
}

function getCard(id) { return _cards.get(id) || null; }
function listCards() { return [..._cards.values()].sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt))); }
function findByAddress(address) {
  const id = _byAddress.get(String(address).toLowerCase());
  return id ? _cards.get(id) : null;
}
function findByCapability(cap) {
  const set = _byCap.get(String(cap).toLowerCase());
  if (!set) return [];
  return [...set].map((id) => _cards.get(id)).filter(Boolean);
}

function _reset() {
  _cards = new Map();
  _byAddress = new Map();
  _byCap = new Map();
}

function _stats() {
  return {
    totalCards: _cards.size,
    totalAddresses: _byAddress.size,
    totalCapabilities: _byCap.size,
    topCapabilities: [..._byCap.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 10).map(([k, v]) => [k, v.size]),
  };
}

module.exports = { addCard, removeCard, getCard, listCards, findByAddress, findByCapability, _reset, _stats };
