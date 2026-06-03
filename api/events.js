// api/events.js
// Server-Sent Events for intent state transitions. Open a long-lived HTTP/1.1
// connection and receive `data: {...}\n\n` lines when an intent transitions.
//
// Polling /api/contract-status?id=N every 30s is expensive and laggy. SSE
// gives you sub-second push notifications with one persistent connection.
//
// Scope:
//   ?intentId=1  subscribe to one intent
//   (no param)   subscribe to all intents (high volume on mainnet)
//
// On Vercel serverless functions, the response stream is buffered and
// flushed periodically. The Connection: keep-alive + Transfer-Encoding:
// chunked response is the SSE handshake. Note: Vercel serverless functions
// have a 60s execution ceiling on hobby / 5min on pro, so the connection
// will close after that. Reconnect from the last event-id. The reconnect is
// the standard EventSource pattern: it auto-reconnects with Last-Event-Id.

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: { label: 'base-mainnet', chainId: 8453, rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    escrow: '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2' },
  sepolia: { label: 'base-sepolia', chainId: 84532, rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    escrow: '0x489C36738F46e395b4cd26DDf0f85756686A2f07' },
};

const ESCROW_ABI = [
  'event IntentCreated(uint256 indexed intentId, address indexed buyer, address indexed seller, uint256 amount, bytes32 workHash, string workURI)',
  'event ProofSubmitted(uint256 indexed intentId, string proofURI, uint256 reviewDeadline)',
  'event Released(uint256 indexed intentId, address indexed seller, uint256 sellerAmount, uint256 feeAmount)',
  'event Refunded(uint256 indexed intentId, address indexed buyer, uint256 amount)',
  'event Disputed(uint256 indexed intentId, address indexed disputer, uint256 fee)',
  'event Resolved(uint256 indexed intentId, bool releasedToSeller)',
];

const STATUS_NAMES = ['None', 'Funded', 'ProofSubmitted', 'Released', 'Refunded', 'Disputed', 'Resolved'];

const POLL_INTERVAL_MS = 12000; // Vercel serverless: keep below the 60s exec ceiling
const MAX_RUNTIME_MS = 50_000;  // safety: self-close before Vercel does

module.exports = async function handler(req, res) {
  // CORS for EventSource (browsers skip the CORS preflight for text/event-stream)
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'last-event-id, cache-control');
  res.setHeader('access-control-expose-headers', 'last-event-id');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    res.statusCode = 405;
    return res.end('method_not_allowed');
  }

  const net = String((req.query && req.query.network) || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  // intentId filter
  const intentFilter = req.query && req.query.intentId != null ? String(req.query.intentId) : null;
  if (intentFilter != null && !/^\d+$/.test(intentFilter)) {
    res.statusCode = 400;
    return res.end('invalid_intent_id');
  }

  // Resume from lastEventId (block number)
  let fromBlock = 0;
  if (req.headers['last-event-id']) {
    const v = parseInt(String(req.headers['last-event-id']), 10);
    if (Number.isFinite(v) && v >= 0) fromBlock = v;
  }

  // SSE headers
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no'); // disable nginx buffering

  function send(eventName, data, eventId) {
    if (eventName) res.write(`event: ${eventName}\n`);
    if (eventId != null) res.write(`id: ${eventId}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  function comment(text) {
    res.write(`: ${text}\n\n`); // SSE comment line keeps connection alive
  }

  // Initial hello
  send('ready', { ok: true, network: cfg.label, escrow: cfg.escrow, filter: intentFilter, fromBlock });
  comment('AWM SSE stream open');

  let provider;
  try { provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId); }
  catch (e) {
    send('error', { error: 'rpc_unreachable', details: e.message });
    return res.end();
  }

  const escrow = new ethers.Contract(cfg.escrow, ESCROW_ABI, provider);
  const start = Date.now();
  let lastBlock = fromBlock;

  // One initial pass so subscribers get state right away if they resume from
  // a saved event-id.
  try {
    const head = await provider.getBlockNumber();
    const scanTo = head;
    if (scanTo > lastBlock) {
      await scanAndEmit(escrow, lastBlock, scanTo, intentFilter, send);
      lastBlock = scanTo;
    }
  } catch (e) {
    send('error', { error: 'initial_scan_failed', details: e.message });
  }

  // Polling loop. Each tick: get current head, scan [lastBlock+1, head].
  const timer = setInterval(async () => {
    if (Date.now() - start > MAX_RUNTIME_MS) {
      send('heartbeat', { reason: 'runtime_cap', runtimeMs: Date.now() - start });
      send('close', { reason: 'runtime_cap', reconnect: true });
      clearInterval(timer);
      res.end();
      return;
    }
    try {
      const head = await provider.getBlockNumber();
      if (head > lastBlock) {
        await scanAndEmit(escrow, lastBlock + 1, head, intentFilter, send);
        lastBlock = head;
        send('heartbeat', { head, lastBlock, runtimeMs: Date.now() - start });
      } else {
        comment('idle');
      }
    } catch (e) {
      send('error', { error: 'scan_failed', details: e.message });
    }
  }, POLL_INTERVAL_MS);

  // On client disconnect, stop polling.
  req.on('close', () => {
    clearInterval(timer);
    try { res.end(); } catch (_) { /* already ended */ }
  });
};

async function scanAndEmit(escrow, fromBlock, toBlock, intentFilter, send) {
  // The events are cheap; query them in parallel.
  const [created, proof, released, refunded, disputed, resolved] = await Promise.all([
    safeQuery(() => escrow.queryFilter(escrow.filters.IntentCreated(), fromBlock, toBlock)),
    safeQuery(() => escrow.queryFilter(escrow.filters.ProofSubmitted(), fromBlock, toBlock)),
    safeQuery(() => escrow.queryFilter(escrow.filters.Released(), fromBlock, toBlock)),
    safeQuery(() => escrow.queryFilter(escrow.filters.Refunded(), fromBlock, toBlock)),
    safeQuery(() => escrow.queryFilter(escrow.filters.Disputed(), fromBlock, toBlock)),
    safeQuery(() => escrow.queryFilter(escrow.filters.Resolved(), fromBlock, toBlock)),
  ]);

  function emit(eventName, e, statusName) {
    const id = Number(e.args.intentId);
    if (intentFilter != null && String(id) !== intentFilter) return;
    send(eventName, {
      intentId: id,
      blockNumber: e.blockNumber,
      transactionHash: e.transactionHash,
      logIndex: e.logIndex,
      status: statusName,
      args: Object.fromEntries(
        e.fragment && e.fragment.inputs ? e.fragment.inputs.map((input, i) => [input.name, e.args[i] != null && typeof e.args[i] === 'object' ? e.args[i].toString() : e.args[i]]) : []
      ),
    }, e.blockNumber);
  }

  for (const e of (created || []))     emit('intent_created',   e, 'Funded');
  for (const e of (proof || []))       emit('proof_submitted',  e, 'ProofSubmitted');
  for (const e of (released || []))    emit('released',         e, 'Released');
  for (const e of (refunded || []))    emit('refunded',         e, 'Refunded');
  for (const e of (disputed || []))    emit('disputed',         e, 'Disputed');
  for (const e of (resolved || []))    emit('resolved',         e, 'Resolved');
}

async function safeQuery(fn) {
  try { return await fn(); } catch (e) { return []; }
}
