// api/agent-balance.js
// Read USDC + ETH balance for any wallet on Base. No auth, no key.
// Useful for agents that don't have a web3 wallet but want to know balances.
//
// GET /api/agent-balance?wallet=0x...&network=base-mainnet
//   -> {
//        schema: "ai-work-market.agent-balance.v1",
//        network: "base-mainnet",
//        wallet: "0x...",
//        eth: { raw, formatted, usdEstimate },
//        usdc: { raw, formatted, usdEstimate },
//        blockNumber: 46876000,
//        hint: "...",
//      }

const USDC_ADDRESSES = {
  mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  sepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const NETWORKS = {
  mainnet: {
    label: 'base-mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    chainId: 8453,
    usdc: USDC_ADDRESSES.mainnet,
  },
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    usdc: USDC_ADDRESSES.sepolia,
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

// Read ERC20 balance via eth_call to the contract.
async function readErc20Balance(rpc, token, holder) {
  // balanceOf(address) selector = 0x70a08231
  // padded address = 0x000000000000000000000000 + 40 hex chars
  const data = '0x70a08231' + '000000000000000000000000' + holder.slice(2).toLowerCase();
  const result = await rawRpc(rpc, 'eth_call', [{ to: token, data }, 'latest']);
  return BigInt(result || '0x0');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'method_not_allowed', hint: 'Use GET' });
  }

  const wallet = String((req.query && req.query.wallet) || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return json(res, 400, { error: 'invalid_wallet', hint: 'Provide ?wallet=0x...40 hex chars' });
  }

  const cfg = NETWORKS[pickNetwork(req)];

  let blockNumber, ethBalRaw, usdcBalRaw;
  try {
    blockNumber = parseInt(await rawRpc(cfg.rpc, 'eth_blockNumber', []), 16);
    ethBalRaw = BigInt(await rawRpc(cfg.rpc, 'eth_getBalance', [wallet, 'latest']));
    usdcBalRaw = await readErc20Balance(cfg.rpc, cfg.usdc, wallet);
  } catch (e) {
    return json(res, 200, {
      schema: 'ai-work-market.agent-balance.v1',
      network: cfg.label,
      wallet,
      error: 'rpc_unreachable',
      hint: e.message,
    });
  }

  const ethFormatted = formatEther(ethBalRaw, 6);
  const usdcFormatted = formatUnits(usdcBalRaw, 6, 6);

  return json(res, 200, {
    schema: 'ai-work-market.agent-balance.v1',
    network: cfg.label,
    chainId: cfg.chainId,
    wallet,
    blockNumber,
    eth: {
      raw: ethBalRaw.toString(),
      formatted: ethFormatted,
      usdEstimate: null, // would need a price oracle
    },
    usdc: {
      contract: cfg.usdc,
      raw: usdcBalRaw.toString(),
      formatted: usdcFormatted,
      usdEstimate: Number(usdcBalRaw) / 1e6, // USDC is $1
    },
    hint: 'USDC has 6 decimals, ETH has 18. All values are read at the latest block. No signing or auth required.',
  });
};

function formatEther(wei, decimals) {
  const s = wei.toString().padStart(19, '0');
  const intPart = s.slice(0, -18) || '0';
  const fracPart = s.slice(-18).slice(0, decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function formatUnits(raw, decimals, pad) {
  const s = raw.toString().padStart(decimals + 1, '0');
  const intPart = s.slice(0, -decimals) || '0';
  const fracPart = s.slice(-decimals).slice(0, pad).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=12');
  res.send(JSON.stringify(body));
}
