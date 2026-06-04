// api/cron/webhook-deliverer.js
// Vercel cron job — runs every 2 minutes.
// Scans recent AWM escrow events for state transitions and delivers
// webhook payloads to any matching subscribers.
//
// Event signatures (verified from AgentWorkEscrowZK on Base Mainnet 8453):
//   event Released(uint256 indexed intentId, address indexed seller, uint256 amount, uint256 fee)
//   event Refunded(uint256 indexed intentId, address indexed buyer, uint256 amount)
//   event Disputed(uint256 indexed intentId, address indexed initiator, string reason)
//   event SubmittedProof(uint256 indexed intentId, address indexed seller, string proofURI, bytes32 proofHash)
//
// Configured in vercel.json under "crons":
//   { "path": "/api/cron/webhook-deliverer", "schedule": "*/2 * * * *" }

const { createHmac } = require('crypto');
const { keccak256, toUtf8Bytes, AbiCoder, Interface } = require('ethers');
const { listSubs, markFired } = require('../_webhook-store.js');

const ESCROW = '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2';
const RPC_URL = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';

// Compute keccak256 topic[0] for each event signature
function topicFor(sig) {
  return keccak256(toUtf8Bytes(sig));
}

const EVENT_SIGS = {
  Released: 'Released(uint256,address,uint256,uint256)',
  Refunded: 'Refunded(uint256,address,uint256)',
  Disputed: 'Disputed(uint256,address,string)',
  SubmittedProof: 'SubmittedProof(uint256,address,string,bytes32)',
};

const TOPICS = {};
for (const [name, sig] of Object.entries(EVENT_SIGS)) {
  TOPICS[name] = topicFor(sig);
}

// Minimal ABI for decoding the events
const ESCROW_EVENT_ABI = Object.entries(EVENT_SIGS).map(([name, sig]) => ({
  type: 'event',
  name,
  inputs: parseSigInputs(sig),
}));

const eventIface = new Interface(ESCROW_EVENT_ABI);

function parseSigInputs(sig) {
  // Crude but sufficient: parse "(uint256,address,uint256)" → array of types
  const m = sig.match(/\(([^)]*)\)/);
  if (!m) return [];
  return m[1].split(',').map((t) => ({ type: t.trim(), indexed: t.includes('indexed') }));
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error('RPC error: ' + JSON.stringify(data.error));
  return data.result;
}

async function getLogs(fromBlock) {
  return rpc('eth_getLogs', [{
    address: ESCROW.toLowerCase(),
    topics: [[
      TOPICS.Released,
      TOPICS.Refunded,
      TOPICS.Disputed,
      TOPICS.SubmittedProof,
    ]],
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: 'latest',
  }]);
}

function decodeEvent(log) {
  for (const name of Object.keys(EVENT_SIGS)) {
    if (log.topics[0] === TOPICS[name]) {
      try {
        const parsed = eventIface.parseLog({ topics: log.topics, data: log.data });
        const args = parsed.args;
        const evt = {
          event: name,
          intentId: args[0].toString(),
          blockNumber: parseInt(log.blockNumber, 16),
          txHash: log.transactionHash,
        };
        // Add named fields
        if (name === 'Released') {
          evt.seller = args[1];
          evt.amount = args[2].toString();
          evt.fee = args[3].toString();
        } else if (name === 'Refunded') {
          evt.buyer = args[1];
          evt.amount = args[2].toString();
        } else if (name === 'Disputed') {
          evt.initiator = args[1];
          evt.reason = args[2];
        } else if (name === 'SubmittedProof') {
          evt.seller = args[1];
          evt.proofURI = args[2];
          evt.proofHash = args[3];
        }
        return evt;
      } catch (e) {
        return { event: name, decodeError: e.message, blockNumber: parseInt(log.blockNumber, 16), txHash: log.transactionHash };
      }
    }
  }
  return null;
}

async function deliver(sub, payload) {
  const body = JSON.stringify(payload);
  const sig = sub.secret
    ? createHmac('sha256', sub.secret).update(body).digest('hex')
    : '';
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'AWM-Webhook/1.0',
    'x-awm-event': payload.event,
    'x-awm-intent-id': String(payload.intentId),
    'x-awm-delivery-id': payload.deliveryId,
    'x-awm-signature': sig ? 'sha256=' + sig : '',
  };
  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

module.exports = async function handler(req, res) {
  // Auth: Vercel cron sends a Bearer token if CRON_SECRET is set
  const auth = req.headers['authorization'] || req.headers['x-vercel-cron'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}` && auth !== process.env.CRON_SECRET) {
    return json(res, 401, { error: 'unauthorized' });
  }

  const t0 = Date.now();
  try {
    const headBlockHex = await rpc('eth_blockNumber', []);
    const headBlock = parseInt(headBlockHex, 16);
    // Look back 50 blocks (~100s on Base) for any new events
    const fromBlock = Math.max(0, headBlock - 50);

    const logs = await getLogs(fromBlock);
    const events = logs.map(decodeEvent).filter(Boolean);

    // For each event, find matching subscriptions and deliver
    const delivered = [];
    for (const evt of events) {
      const subs = await listSubs(evt.intentId);
      for (const sub of subs) {
        const payload = {
          schema: 'ai-work-market.webhook.v1',
          deliveryId: 'dlv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
          ...evt,
          deliveredAt: new Date().toISOString(),
        };
        const result = await deliver(sub, payload);
        await markFired(sub.id, result.ok, result.error);
        delivered.push({ subId: sub.id, intentId: evt.intentId, ...result });
      }
    }

    return json(res, 200, {
      schema: 'ai-work-market.webhook-deliverer.v1',
      scannedBlocks: { from: fromBlock, to: headBlock },
      eventsFound: events.length,
      delivered,
      topics: TOPICS,
      durationMs: Date.now() - t0,
      nextRun: 'in 2 minutes (Vercel cron)',
    });
  } catch (e) {
    return json(res, 500, { error: e.message, stack: e.stack && e.stack.slice(0, 500) });
  }
};
