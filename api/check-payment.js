// api/check-payment.js
// Given a tx hash, return its state: pending, confirmed, bound, expired.
// Useful for agents that just sent USDC and want to know if AWM has bound the receipt.
//
// GET /api/check-payment?tx=0x...&network=base-mainnet
//   -> {
//        schema: "ai-work-market.check-payment.v1",
//        network: "base-mainnet",
//        tx: "0x...",
//        status: "bound" | "confirmed" | "pending" | "expired" | "unknown",
//        blockNumber: 46876000,
//        confirmations: 5,
//        boundAt: "2026-06-03T...",
//        boundTo: "https://...",
//        age: 123,
//        hint: "...",
//      }

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    chainId: 8453,
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    escrow: process.env.ESCROW_ADDRESS_SEPOLIA || '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
};

function pickNetwork(req) {
  const q = String((req.query && req.query.network) || '').toLowerCase();
  if (q === 'sepolia' || q === 'base-sepolia' || q === 'testnet') return 'sepolia';
  return 'mainnet';
}

async function rawRpc(rpc, method, params) {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data && data.error) throw new Error(`${method}: ${data.error.message}`);
  return data.result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed', hint: 'Use GET' });
  }

  const tx = String((req.query && req.query.tx) || '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return json(res, 400, { error: 'invalid_tx', hint: 'Provide ?tx=0x...64 hex chars' });
  }

  const cfg = NETWORKS[pickNetwork(req)];
  let txData, receipt, currentBlock;

  try {
    txData = await rawRpc(cfg.rpc, 'eth_getTransactionByHash', [tx]);
    receipt = await rawRpc(cfg.rpc, 'eth_getTransactionReceipt', [tx]);
    currentBlock = parseInt(
      await rawRpc(cfg.rpc, 'eth_blockNumber', []),
      16
    );
  } catch (e) {
    return json(res, 200, {
      schema: 'ai-work-market.check-payment.v1',
      network: cfg.label,
      tx,
      status: 'unknown',
      error: 'rpc_unreachable',
      hint: e.message,
    });
  }

  if (!txData) {
    return json(res, 200, {
      schema: 'ai-work-market.check-payment.v1',
      network: cfg.label,
      tx,
      status: 'pending',
      hint: 'Transaction not yet visible on the RPC. It may still be in the mempool or the RPC may not have indexed it yet.',
    });
  }

  if (!receipt) {
    return json(res, 200, {
      schema: 'ai-work-market.check-payment.v1',
      network: cfg.label,
      tx,
      status: 'pending',
      from: txData.from,
      to: txData.to,
      hint: 'Transaction in mempool or not yet mined. Poll again in 5-15 seconds.',
    });
  }

  const status = receipt.status === '0x1' ? 'confirmed' : 'failed';
  const blockNumber = parseInt(receipt.blockNumber, 16);
  const confirmations = Math.max(0, currentBlock - blockNumber);
  const baseTs = await rawRpc(cfg.rpc, 'eth_getBlockByNumber', [receipt.blockNumber, false])
    .then((b) => parseInt(b.timestamp, 16))
    .catch(() => null);
  const age = baseTs ? Math.floor(Date.now() / 1000) - baseTs : null;

  // Try to detect if the receipt was bound to an AWM x402 receipt via the
  // AWM in-memory log of recent binds. This is best-effort.
  let boundTo = null;
  let boundAt = null;
  try {
    const { getRecentBinds } = require('./_bind-store.js');
    const binds = getRecentBinds(cfg.label) || [];
    const match = binds.find((b) => String(b.tx).toLowerCase() === tx.toLowerCase());
    if (match) {
      boundTo = match.deliveryUrl || match.url || null;
      boundAt = match.boundAt || null;
    }
  } catch (_) { /* _bind-store.js may not exist in dev */ }

  return json(res, 200, {
    schema: 'ai-work-market.check-payment.v1',
    network: cfg.label,
    tx,
    from: txData.from,
    to: txData.to,
    value: txData.value,
    status: boundTo ? 'bound' : status,
    blockNumber,
    confirmations,
    ageSeconds: age,
    boundAt,
    boundTo,
    logsCount: receipt.logs ? receipt.logs.length : 0,
    hint: boundTo
      ? 'AWM has bound this receipt to a delivery URL. Use the boundTo URL to retrieve the product.'
      : status === 'confirmed'
      ? 'Confirmed on-chain. To bind the receipt to a delivery URL, POST /api/x402-consume with {tx, slug, quoteId, requestId} and an HMAC signature.'
      : 'Transaction reverted on-chain. Do not retry; check the call data and recipient.',
  });
};

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.send(JSON.stringify(body));
}
