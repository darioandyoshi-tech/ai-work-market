const { ethers } = require('ethers');
const { productBySlug, json } = require('./_commerce-shared');

const BASE_CHAIN_ID = 8453;
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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.end('method not allowed');
    return;
  }

  try {
    const tx = normalizeTxHash(req.query && req.query.tx);
    if (!tx) {
      return json(res, 400, { error: 'tx_invalid', message: 'Expected a 32-byte transaction hash.' });
    }

    const recipient = normalizeAddress(
      (req.query && (req.query.recipient || req.query.payTo)) || MARKETPLACE_TREASURY,
      'recipient'
    );
    const expectedRaw = expectedAmountRaw(req.query || {});
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(tx);

    if (!receipt) {
      return json(res, 404, {
        status: 'pending_or_not_found',
        tx,
        network: 'eip155:8453',
        message: 'Transaction receipt is not available on Base mainnet yet.'
      });
    }

    if (Number(receipt.status) !== 1) {
      return json(res, 422, {
        status: 'invalid',
        reason: 'transaction_reverted',
        tx,
        network: 'eip155:8453'
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
        network: 'eip155:8453',
        expected: {
          token: USDC_CONTRACT,
          recipient,
          amount: expectedRaw === null ? null : amountToJson(expectedRaw)
        },
        observedUsdcTransfers: transfers.map(publicTransfer)
      });
    }

    const matchedTransfer = matches[0];
    return json(res, 200, {
      status: 'verified',
      tx,
      blockNumber: Number(receipt.blockNumber),
      network: 'eip155:8453',
      token: {
        symbol: 'USDC',
        contract: USDC_CONTRACT,
        decimals: Number(USDC_DECIMALS)
      },
      recipient,
      matchedTransfer: publicTransfer(matchedTransfer),
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
};
