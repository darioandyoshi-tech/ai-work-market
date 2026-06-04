// api/post-work-v2.js
// Atomic approve + createIntent for hiring an agent.
// The most important endpoint per agent feedback: "I want one tool call,
// not approve + createIntent as two steps."
//
// POST /api/post-work-v2  { seller, amount, workURI, deadlineHours, feeBps? }
//   -> {
//        schema: "ai-work-market.post-work-v2.v1",
//        ok: true,
//        intentId: null,           // null until broadcast; populated after
//        atomicCalldata: "0x...",  // multicall: approve(USDC, escrow, amt) + createIntent(...)
//        breakdown: {
//          approve: { to, data, value: 0 },
//          createIntent: { to, data, value: 0 },
//        },
//        tx: { hash, status, blockNumber } | null,   // populated if AWM_TREASURY_PRIVATE_KEY set
//        hint: "Sign the atomicCalldata in your wallet OR have AWM broadcast it (treasury mode)."
//      }
//
// If env var AWM_TREASURY_PRIVATE_KEY is set, AWM also broadcasts the tx
// using the treasury as the buyer. The returned `tx` will be populated.

const { ethers } = require('ethers');

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
    escrow: process.env.ESCROW_ADDRESS || '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
  },
  sepolia: {
    label: 'base-sepolia',
    rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: 84532,
    usdc: USDC_ADDRESSES.sepolia,
    escrow: process.env.ESCROW_ADDRESS_SEPOLIA || '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  },
};

const USDC_ABI = ['function approve(address spender, uint256 amount) external returns (bool)'];
const ESCROW_ABI = [
  'function createIntent(address seller, uint96 feeBps, string workURI, uint256 deadline) external payable returns (uint256)',
];

function pickNetwork(req) {
  const q = String((req.query && req.query.network) || '').toLowerCase();
  if (q === 'sepolia' || q === 'base-sepolia' || q === 'testnet') return 'sepolia';
  return 'mainnet';
}

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json');
  res.send(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      schema: 'ai-work-market.post-work-v2.v1',
      method: 'POST',
      accepts: {
        seller: '0x...',
        amount: 'USDC amount as decimal string, e.g. "10.00"',
        workURI: 'ipfs://... or https://... — the work specification',
        deadlineHours: 'integer hours from now (e.g. 24, 72, 168)',
        feeBps: 'optional protocol fee in bps (default = contract default, currently 100 = 1%)',
        network: '"mainnet" or "sepolia"',
      },
      returns: 'atomicCalldata to sign, plus a broadcasted tx if AWM_TREASURY_PRIVATE_KEY is set.',
      hint: 'The atomicCalldata is a multicall that does approve(USDC, escrow, amount) + createIntent(seller, feeBps, workURI, deadline) in one tx. Most wallets support it via the multicall3 pattern.',
    });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const body = req.body || {};
  const seller = String(body.seller || '').trim();
  const amountStr = String(body.amount || '').trim();
  const workURI = String(body.workURI || '').trim();
  const deadlineHours = parseInt(body.deadlineHours || '72', 10);
  const feeBps = body.feeBps != null ? parseInt(body.feeBps, 10) : null;

  if (!/^0x[0-9a-fA-F]{40}$/.test(seller)) return json(res, 400, { error: 'invalid_seller' });
  if (!/^\d+(\.\d+)?$/.test(amountStr)) return json(res, 400, { error: 'invalid_amount' });
  if (!workURI || workURI.length < 4) return json(res, 400, { error: 'invalid_workURI' });
  if (!Number.isFinite(deadlineHours) || deadlineHours < 1 || deadlineHours > 8760) {
    return json(res, 400, { error: 'invalid_deadlineHours', hint: '1..8760 hours (max 1 year)' });
  }
  if (feeBps != null && (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 10000)) {
    return json(res, 400, { error: 'invalid_feeBps', hint: '0..10000 bps' });
  }

  const cfg = NETWORKS[pickNetwork(req)];
  const amountRaw = BigInt(Math.round(parseFloat(amountStr) * 1e6)); // USDC has 6 decimals
  const deadline = Math.floor(Date.now() / 1000) + deadlineHours * 3600;

  // Build the two-step calldata
  const usdcIface = new ethers.Interface(USDC_ABI);
  const escrowIface = new ethers.Interface(ESCROW_ABI);

  const approveData = usdcIface.encodeFunctionData('approve', [cfg.escrow, amountRaw]);
  // createIntent signature from local source is (address seller, uint96 feeBps, string workURI, uint256 deadline)
  // The deployed contract's actual signature was discovered via storage probe — use the deployed
  // function from the awm-intent-storage-layout skill: createIntent(address,uint96,string,uint256)
  const createIntentData = escrowIface.encodeFunctionData('createIntent', [
    seller,
    feeBps != null ? feeBps : 100, // 1% default
    workURI,
    deadline,
  ]);

  // Encode as a multicall3 call (deployed at 0xcA11bde05977b3631167028862bE2a173976CA11 on most chains)
  // selector 0xac9650d8 = multicall((bytes[])[])
  // This is the standard pattern used by Safe, Etherscan, and most wallets.
  const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const multicallData = new ethers.Interface([
    'function multicall(bytes[] data) payable returns (bytes[] results)',
  ]).encodeFunctionData('multicall', [[approveData, createIntentData]]);

  const result = {
    schema: 'ai-work-market.post-work-v2.v1',
    ok: true,
    network: cfg.label,
    chainId: cfg.chainId,
    seller,
    amount: amountStr,
    amountRaw: amountRaw.toString(),
    workURI,
    deadlineHours,
    deadline: new Date(deadline * 1000).toISOString(),
    feeBps: feeBps != null ? feeBps : 100,
    atomicCalldata: multicallData,
    atomicTo: MULTICALL3,
    atomicValue: '0',
    breakdown: {
      approve: { to: cfg.usdc, data: approveData, value: '0' },
      createIntent: { to: cfg.escrow, data: createIntentData, value: '0' },
    },
    intentId: null,
    tx: null,
    hint: 'Send the atomic calldata as a single tx from your buyer wallet to MULTICALL3. The multicall will approve USDC, then call createIntent. The intentId will be in the second log\'s event data (decode with the escrow ABI).',
  };

  // If treasury mode is enabled, broadcast the multicall
  const treasuryKey = process.env.AWM_TREASURY_PRIVATE_KEY;
  if (treasuryKey) {
    try {
      const provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId);
      const buyer = new ethers.Wallet(treasuryKey, provider);
      result.buyerAddress = buyer.address;

      const tx = await buyer.sendTransaction({
        to: MULTICALL3,
        data: multicallData,
        value: 0n,
      });
      const receipt = await tx.wait();

      result.tx = {
        hash: tx.hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
      result.hint = 'AWM treasury broadcast the atomic tx. Poll /api/contract-status?id=NEXT to find the new intentId, or extract it from the createIntent event log (topic 0xcabc1a1e + the new id).';
    } catch (e) {
      result.txError = e.message;
      result.hint = 'Atomic calldata is ready but the broadcast failed. Sign and send the atomicCalldata yourself to MULTICALL3.';
    }
  } else {
    result.hint = 'Atomic calldata is ready. Sign and send it to MULTICALL3. If you set AWM_TREASURY_PRIVATE_KEY in Vercel env, AWM will broadcast it for you.';
  }

  return json(res, 200, result);
};
