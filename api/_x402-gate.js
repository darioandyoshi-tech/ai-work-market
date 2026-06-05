// api/_x402-gate.js
// x402 payment gate for Vercel serverless functions.
// Supports two facilitator modes:
//   1. Third-party facilitator (CDP or x402.org) — for any x402-compatible network
//   2. DIRECT mode — verify the USDC payment on-chain ourselves
//      (no facilitator needed; works on mainnet without CDP API keys)
//
// In DIRECT mode, the buyer's flow is:
//   1. GET /api/x-data/crypto -> 402 with x-payment-required header
//      that contains { payTo, amount, asset, network }
//   2. Buyer sends a USDC.transfer(payTo, amount) tx on the same network
//   3. Buyer retries with x-payment: <base64 of { tx: "0x...", payer: "0x..." }>
//   4. Our gate verifies the tx on-chain (eth_getTransactionReceipt) and
//      confirms the Transfer event to the right recipient, the right amount,
//      and 12+ confirmations
//   5. On success, calls the handler
//
// DIRECT mode is what enables mainnet without a CDP facilitator account.

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: { id: 'eip155:8453', name: 'base-mainnet', chainId: 8453,
             rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
             usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  sepolia: { id: 'eip155:84532', name: 'base-sepolia', chainId: 84532,
             rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
             usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
};

const USDC_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Convert "$0.005" to USDC units (6 decimals)
function priceToAtomicUnits(priceStr) {
  const m = String(priceStr).match(/^\$?([0-9]+(?:\.[0-9]+)?)$/);
  if (!m) throw new Error(`Invalid price format: ${priceStr}. Use "$0.005" format.`);
  // Parse as float, then convert to micro-units (6 decimals)
  const v = parseFloat(m[1]);
  return Math.round(v * 1_000_000).toString();
}

function getPayToAddress(network) {
  if (network === 'mainnet') {
    return process.env.AWM_X402_TREASURY || process.env.AWM_TREASURY_ADDRESS;
  }
  return process.env.AWM_X402_TREASURY_TESTNET || process.env.AWM_TREASURY_TESTNET;
}

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v !== null && v !== undefined) res.setHeader(k, String(v));
  }
  res.end(JSON.stringify(body, null, 2));
}

function encodeBase64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function decodeBase64(str) {
  try { return JSON.parse(Buffer.from(str, 'base64').toString('utf8')); }
  catch (_) { return null; }
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) { req.destroy(); } });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Verify a DIRECT-mode payment: buyer sent USDC.transfer(payTo, amount) and
// is now retrying with the tx hash. We check the on-chain receipt.
async function verifyDirectPayment(paymentHeader, network, expectedRecipient, expectedAmountRaw) {
  const decoded = decodeBase64(paymentHeader);
  if (!decoded) return { ok: false, status: 400, error: 'bad_payment_header', message: 'Could not decode x-payment header' };
  const { tx, payer } = decoded;
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return { ok: false, status: 400, error: 'bad_tx', message: 'tx must be a 32-byte hex hash' };
  }
  if (!payer || !/^0x[0-9a-fA-F]{40}$/.test(payer)) {
    return { ok: false, status: 400, error: 'bad_payer', message: 'payer must be a 20-byte address' };
  }

  const cfg = NETWORKS[network];
  const provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId);
  let receipt, txObj;
  try {
    [receipt, txObj] = await Promise.all([
      provider.getTransactionReceipt(tx),
      provider.getTransaction(tx),
    ]);
  } catch (e) {
    return { ok: false, status: 502, error: 'rpc_failed', message: e.message };
  }
  if (!receipt || !txObj) {
    return { ok: false, status: 422, error: 'tx_not_found', hint: 'Wait for the tx to be mined' };
  }
  if (receipt.status !== 1) {
    return { ok: false, status: 422, error: 'tx_reverted' };
  }
  // Find the USDC Transfer event
  const usdc = new ethers.Contract(cfg.usdc, USDC_ABI, provider);
  const transferTopic = usdc.interface.getEvent('Transfer').topicHash;
  const transferLog = receipt.logs.find((l) =>
    l.address.toLowerCase() === cfg.usdc.toLowerCase() && l.topics[0] === transferTopic
  );
  if (!transferLog) {
    return { ok: false, status: 422, error: 'no_usdc_transfer', hint: 'The tx does not contain a USDC Transfer event.' };
  }
  const parsed = usdc.interface.parseLog(transferLog);
  const from = parsed.args.from;
  const to = parsed.args.to;
  const value = parsed.args.value;
  if (from.toLowerCase() !== payer.toLowerCase()) {
    return { ok: false, status: 422, error: 'payer_mismatch', got: from, declared: payer };
  }
  if (to.toLowerCase() !== expectedRecipient.toLowerCase()) {
    return { ok: false, status: 422, error: 'wrong_recipient', got: to, expected: expectedRecipient };
  }
  if (BigInt(value.toString()) < BigInt(expectedAmountRaw)) {
    return { ok: false, status: 422, error: 'insufficient_amount',
             gotRaw: value.toString(), expectedRaw: expectedAmountRaw,
             gotUsd: ethers.formatUnits(value, 6), expectedUsd: ethers.formatUnits(expectedAmountRaw, 6) };
  }
  // Require 12 confirmations
  const head = await provider.getBlockNumber();
  const confs = head - receipt.blockNumber + 1;
  if (confs < 12) {
    return { ok: false, status: 425, error: 'insufficient_confirmations', got: confs, required: 12,
             currentBlock: head, txBlock: receipt.blockNumber };
  }
  return {
    ok: true,
    payer: from,
    transaction: tx,
    blockNumber: receipt.blockNumber,
    confirmations: confs,
    amountRaw: value.toString(),
    amountUsdc: ethers.formatUnits(value, 6),
  };
}

/**
 * Wrap a handler with x402 payment gate.
 *
 * @param {object} options
 * @param {string} options.price — USDC dollar amount string (e.g. '$0.005')
 * @param {'mainnet'|'sepolia'} [options.network='mainnet']
 * @param {string} [options.description]
 * @param {string} [options.mimeType='application/json']
 * @param {object} [options.extra] — extra metadata for Bazaar discovery
 * @param {'direct'|'facilitator'} [options.mode='direct'] — direct = on-chain verify (no facilitator needed)
 * @param {function} handler — async (req, res, payment) => data | object
 */
function withX402(options, handler) {
  const { price, network = 'mainnet', description = 'x402-paid API', mimeType = 'application/json',
          extra = {}, mode = 'direct' } = options;
  if (!price) throw new Error('withX402: price is required');
  const networkCfg = NETWORKS[network];
  if (!networkCfg) throw new Error(`withX402: unknown network '${network}'`);

  return async function gate(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('allow', 'GET, POST');
      return json(res, 405, { error: 'method_not_allowed' });
    }

    const payTo = getPayToAddress(network);
    if (!payTo) {
      return json(res, 503, {
        error: 'payment_not_configured',
        message: `Set AWM_X402_TREASURY (mainnet) or AWM_X402_TREASURY_TESTNET (sepolia).`,
      });
    }

    const amountRaw = priceToAtomicUnits(price);
    const path = req.url.split('?')[0];

    // Build the payment requirements (standard x402 v2 format)
    const requirements = [{
      scheme: 'exact',
      network: networkCfg.id,
      amount: amountRaw,
      asset: networkCfg.usdc,
      payTo,
      maxTimeoutSeconds: 300,
      extra: { name: description, mode, ...extra },
    }];

    const paymentRequired = {
      x402Version: 2,
      accepts: requirements,
      resource: { url: `https://ai-work-market.ai${req.url}`, description, mimeType },
    };

    // Check for x-payment header
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader) {
      // Return 402
      const encoded = encodeBase64(paymentRequired);
      return json(res, 402, {
        x402Version: 2,
        error: 'payment_required',
        message: description,
        accepts: requirements,
        resource: paymentRequired.resource,
        // DIRECT mode hint: tell the buyer exactly what to do
        ...(mode === 'direct' ? {
          directMode: {
            instructions: 'Send a USDC.transfer(payTo, amount) tx on this network, then retry with x-payment: <base64 of { tx: "0x...", payer: "0x..." }>',
            payTo,
            amount: amountRaw,
            amountUsdc: ethers.formatUnits(amountRaw, 6),
            asset: networkCfg.usdc,
            network: networkCfg.name,
            chainId: networkCfg.chainId,
            rpc: networkCfg.rpc,
            example: encodeBase64({}),
          },
        } : {}),
      }, { 'x-payment-required': encoded });
    }

    // Payment provided: verify
    let payment;
    if (mode === 'direct') {
      const result = await verifyDirectPayment(paymentHeader, network, payTo, amountRaw);
      if (!result.ok) {
        return json(res, result.status, { error: result.error, message: result.message, ...result });
      }
      payment = {
        payer: result.payer,
        transaction: result.transaction,
        network: networkCfg.name,
        amount: ethers.formatUnits(result.amountRaw, 6),
        asset: 'USDC',
        blockNumber: result.blockNumber,
        confirmations: result.confirmations,
      };
    } else {
      // Facilitator mode — use x402-foundation
      // (not implemented in this version; CDP mainnet requires the @x402/evm
      // scheme with a CDP-authenticated HTTPFacilitatorClient)
      return json(res, 501, { error: 'facilitator_mode_not_implemented_in_direct_build', hint: 'Use mode: "direct" or set up CDP API keys.' });
    }

    // Payment verified. Run the handler.
    let result;
    try {
      result = await handler(req, res, payment);
    } catch (e) {
      return json(res, 500, { error: 'handler_error', message: e.message });
    }

    // Write response with x-payment-response header
    const paymentResponse = {
      success: true,
      transaction: payment.transaction,
      network: networkCfg.id,
      payer: payment.payer,
    };
    if (!res.writableEnded) {
      res.statusCode = 200;
      res.setHeader('content-type', mimeType);
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-payment-response', encodeBase64(paymentResponse));
      res.end(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    }
  };
}

module.exports = { withX402, NETWORKS, priceToAtomicUnits };
