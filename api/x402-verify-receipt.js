const crypto = require('crypto');
const { ethers } = require('ethers');
const { productBySlug, json } = require('./_commerce-shared');
const { consumeReceipt } = require('./_x402-receipt-store');

const BASE_CHAIN_ID = 8453;
const NETWORK_CAIP2 = 'eip155:8453';
const BASE_RPC_URL = process.env.BASE_RPC_URL || process.env.BASE_RPC || 'https://mainnet.base.org';
const USDC_CONTRACT =
  process.env.BASE_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MARKETPLACE_TREASURY =
  process.env.AWM_X402_TREASURY ||
  process.env.X402_TREASURY ||
  '0x8d32448cbad55a3d3B12DE901e57782C409399B7';

const USDC_DECIMALS = 6n;
const USDC_SCALE = 10n ** USDC_DECIMALS;
const TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const USDC_IFACE = new ethers.Interface(TRANSFER_ABI);

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function requestParams(req) {
  const query = { ...(req.query || {}) };
  if (req.method !== 'POST') return query;

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return query;

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    return { ...query, ...body };
  } catch {
    const err = new Error('json_body_invalid');
    err.statusCode = 400;
    throw err;
  }
}

function normalizeTxHash(value) {
  const tx = String(first(value) || '').trim();
  return /^0x[a-fA-F0-9]{64}$/.test(tx) ? tx : '';
}

function normalizeAddress(value, fieldName) {
  try {
    return ethers.getAddress(String(first(value) || '').trim());
  } catch {
    const err = new Error(`${fieldName}_invalid`);
    err.statusCode = 400;
    throw err;
  }
}

function parseUsdcAmount(value, fieldName) {
  const text = String(first(value) || '').trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,6})?$/.test(text)) {
    const err = new Error(`${fieldName}_invalid`);
    err.statusCode = 400;
    throw err;
  }

  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * USDC_SCALE + BigInt((fraction + '000000').slice(0, 6));
}

function expectedAmountRaw(query) {
  if (query.amountRaw !== undefined) {
    const amount = String(first(query.amountRaw)).trim();
    if (!/^\d+$/.test(amount)) {
      const err = new Error('amountRaw_invalid');
      err.statusCode = 400;
      throw err;
    }
    return BigInt(amount);
  }

  if (query.amountUsd !== undefined) {
    return parseUsdcAmount(query.amountUsd, 'amountUsd');
  }

  const slug = String(first(query.slug) || '').trim();
  if (!slug) return null;

  const product = productBySlug(slug);
  if (!product) {
    const err = new Error('unknown_product');
    err.statusCode = 404;
    throw err;
  }

  return parseUsdcAmount(product.priceUsd, 'product_priceUsd');
}

function optionalBindingRef(query, names, fieldName) {
  for (const name of names) {
    if (query[name] === undefined) continue;
    const value = String(first(query[name]) || '').trim();
    if (!value) return null;
    if (value.length > 160 || !/^[A-Za-z0-9._:@/-]+$/.test(value)) {
      const err = new Error(`${fieldName}_invalid`);
      err.statusCode = 400;
      throw err;
    }
    return value;
  }
  return null;
}

function wantsConsumption(query) {
  return ['consume', 'consumeReceipt', 'issueAccess'].some((name) => {
    const value = String(first(query[name]) || '').toLowerCase();
    return ['1', 'true', 'yes'].includes(value);
  });
}

function amountToJson(value) {
  return {
    raw: value.toString(),
    usdc: ethers.formatUnits(value, Number(USDC_DECIMALS))
  };
}

function parseUsdcTransfers(receipt) {
  return receipt.logs
    .filter((log) => log.address.toLowerCase() === USDC_CONTRACT.toLowerCase())
    .filter((log) => log.topics && log.topics[0] === TRANSFER_TOPIC)
    .map((log) => {
      const parsed = USDC_IFACE.parseLog(log);
      return {
        from: parsed.args.from,
        to: parsed.args.to,
        value: parsed.args.value,
        logIndex: Number(log.index ?? log.logIndex)
      };
    });
}

function publicTransfer(transfer) {
  return {
    from: transfer.from,
    to: transfer.to,
    amount: amountToJson(transfer.value),
    logIndex: transfer.logIndex
  };
}

function shortHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function buildReceiptBinding({ tx, transfer, recipient, productSlug, expectedRaw, quoteId, customerRef, requestId }) {
  const normalizedTx = tx.toLowerCase();
  const token = USDC_CONTRACT.toLowerCase();
  const paymentRef = `${NETWORK_CAIP2}:${token}:${normalizedTx}:${transfer.logIndex}`;
  const fulfillmentScope = {
    standard: 'x402-sovereign-receipt-v1',
    network: NETWORK_CAIP2,
    token,
    txHash: normalizedTx,
    logIndex: transfer.logIndex,
    recipient: recipient.toLowerCase(),
    amountRaw: transfer.value.toString(),
    expectedAmountRaw: expectedRaw === null ? null : expectedRaw.toString(),
    productSlug,
    quoteId,
    customerRef,
    requestId
  };
  const canonicalScope = JSON.stringify(fulfillmentScope);
  const fulfillmentRef = `x402r_${shortHash(canonicalScope)}`;

  return {
    paymentRef,
    fulfillmentRef,
    scope: fulfillmentScope,
    replayGuard: {
      requiredBeforeFulfillment: true,
      consumeBeforeDelivery: true,
      storageKeys: {
        payment: `x402-payment:${shortHash(paymentRef)}`,
        fulfillment: `x402-fulfillment:${fulfillmentRef}`
      },
      rule:
        'Persist paymentRef as single-use before issuing product access; reject repeats or a different fulfillmentRef for the same paymentRef.'
    }
  };
}

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('allow', 'GET, POST');
    res.end('method not allowed');
    return;
  }

  try {
    const params = await requestParams(req);
    const consume = wantsConsumption(params);
    if (consume && req.method !== 'POST') {
      return json(res, 405, {
        error: 'consume_requires_post',
        message: 'Use POST with consume=true to mark a verified x402 receipt as consumed.'
      });
    }

    const tx = normalizeTxHash(params && params.tx);
    if (!tx) {
      return json(res, 400, { error: 'tx_invalid', message: 'Expected a 32-byte transaction hash.' });
    }

    const recipient = normalizeAddress(
      (params && (params.recipient || params.payTo)) || MARKETPLACE_TREASURY,
      'recipient'
    );
    const expectedRaw = expectedAmountRaw(params || {});
    const productSlug = String(first(params && params.slug) || '').trim() || null;
    const quoteId = optionalBindingRef(params || {}, ['quoteId', 'quote_id'], 'quoteId');
    const customerRef = optionalBindingRef(params || {}, ['customerRef', 'customer_ref'], 'customerRef');
    const requestId = optionalBindingRef(params || {}, ['requestId', 'request_id'], 'requestId');
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(tx);

    if (!receipt) {
      return json(res, 404, {
        status: 'pending_or_not_found',
        tx,
        network: NETWORK_CAIP2,
        message: 'Transaction receipt is not available on Base mainnet yet.'
      });
    }

    if (Number(receipt.status) !== 1) {
      return json(res, 422, {
        status: 'invalid',
        reason: 'transaction_reverted',
        tx,
        network: NETWORK_CAIP2
      });
    }

    const transfers = parseUsdcTransfers(receipt);
    const matches = transfers.filter((transfer) => {
      const recipientMatches = transfer.to.toLowerCase() === recipient.toLowerCase();
      const amountMatches = expectedRaw === null || transfer.value === expectedRaw;
      return recipientMatches && amountMatches;
    });

    if (matches.length === 0) {
      return json(res, 422, {
        status: 'invalid',
        reason: 'matching_usdc_transfer_not_found',
        tx,
        network: NETWORK_CAIP2,
        expected: {
          token: USDC_CONTRACT,
          recipient,
          amount: expectedRaw === null ? null : amountToJson(expectedRaw)
        },
        observedUsdcTransfers: transfers.map(publicTransfer)
      });
    }

    const matchedTransfer = matches[0];
    const binding = buildReceiptBinding({
      tx,
      transfer: matchedTransfer,
      recipient,
      productSlug,
      expectedRaw,
      quoteId,
      customerRef,
      requestId
    });
    const consumption = consume ? consumeReceipt(binding, {
      source: 'api/x402-verify-receipt',
      productSlug,
      quoteId,
      customerRef,
      requestId
    }) : null;
    const statusCode = consumption && !consumption.accepted ? 409 : 200;

    return json(res, statusCode, {
      status: 'verified',
      tx,
      blockNumber: Number(receipt.blockNumber),
      network: NETWORK_CAIP2,
      token: {
        symbol: 'USDC',
        contract: USDC_CONTRACT,
        decimals: Number(USDC_DECIMALS)
      },
      recipient,
      matchedTransfer: publicTransfer(matchedTransfer),
      binding,
      consumption,
      verifiedAt: new Date().toISOString(),
      standard: 'x402-sovereign-receipt-v1',
      receipt: {
        type: 'base_usdc_transfer_verification',
        details: 'USDC transfer to the requested AWM recipient verified on Base mainnet.'
      }
    });
  } catch (err) {
    return json(res, err.statusCode || 500, {
      error: err.message || 'verification_failed',
      status: 'error'
    });
  }
}

module.exports = handler;
module.exports._test = {
  buildReceiptBinding,
  optionalBindingRef
};
