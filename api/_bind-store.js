// api/_bind-store.js
// In-memory store for x402 receipt bindings. Used by /api/check-payment to
// tell when a tx has been bound to a delivery URL.
//
// Same constraints as _webhook-store.js — in-memory, per-instance.

let _binds = [];
const MAX_BINDS = 10000;

function recordBind({ tx, network, deliveryUrl, url, boundAt }) {
  _binds.push({
    tx: String(tx).toLowerCase(),
    network,
    deliveryUrl: deliveryUrl || url || null,
    boundAt: boundAt || new Date().toISOString(),
  });
  if (_binds.length > MAX_BINDS) _binds = _binds.slice(-MAX_BINDS);
}

function getRecentBinds(network) {
  if (!network) return _binds.slice();
  return _binds.filter((b) => b.network === network);
}

function findByTx(tx) {
  if (!tx) return null;
  const t = String(tx).toLowerCase();
  return _binds.find((b) => b.tx === t) || null;
}

function _reset() { _binds = []; }

module.exports = { recordBind, getRecentBinds, findByTx, _reset };
