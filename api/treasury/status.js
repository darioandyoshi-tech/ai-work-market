// api/treasury/status.js
// Read-only diagnostic endpoint for the AWM treasury + reputation signer.
// Returns:
//   - whether AWM_TREASURY_PRIVATE_KEY is set
//   - the treasury address (if key is set, derived from the key; never the key itself)
//   - the treasury's USDC and ETH balances on Base Mainnet
//   - whether AWM_REPUTATION_SIGNING_KEY is set
//   - the reputation signer address (if key is set, derived from the key)
//   - the last broadcast attempt (if any was logged)
//
// SECURITY: this endpoint NEVER returns the private keys. It only derives
// the public address and reports the balances.

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: { rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org', chainId: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  sepolia: { rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', chainId: 84532,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
};
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

function maskKeyShape(key) {
  // Detect the format the env var is in. We don't return the key, just shape info.
  if (!key) return null;
  const trimmed = key.trim();
  const looksHex = /^0x[0-9a-fA-F]{64}$/.test(trimmed);
  const looksBase64 = /^[A-Za-z0-9+/=]{40,90}$/.test(trimmed);
  return {
    length: trimmed.length,
    startsWith0x: trimmed.startsWith('0x'),
    formatHint: looksHex ? 'hex-private-key' : (looksBase64 ? 'base64' : 'unknown-or-wrong-format'),
    validEthersWallet: looksHex, // ethers v6 requires 0x + 64 hex
  };
}

function deriveAddress(key) {
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key.trim())) return null;
  try { return new ethers.Wallet(key.trim()).address; } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const net = String(req.query.network || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  const treasuryKey = process.env.AWM_TREASURY_PRIVATE_KEY;
  const reputationKey = process.env.AWM_REPUTATION_SIGNING_KEY;

  const out = {
    schema: 'ai-work-market.treasury.status.v1',
    network: cfg === NETWORKS.mainnet ? 'base-mainnet' : 'base-sepolia',
    chainId: cfg.chainId,
    treasury: {
      keyConfigured: Boolean(treasuryKey),
      keyShape: maskKeyShape(treasuryKey),
      address: deriveAddress(treasuryKey),
      usdc: null,
      eth: null,
      note: treasuryKey
        ? 'AWM can broadcast createIntent / submitProof / release / refund on behalf of the treasury'
        : 'AWM returns calldata only. The user/buyer signs and broadcasts themselves.',
    },
    reputationSigner: {
      keyConfigured: Boolean(reputationKey),
      keyShape: maskKeyShape(reputationKey),
      address: deriveAddress(reputationKey),
      note: reputationKey
        ? 'Agent cards will be signed by this address (EIP-191 personal_sign)'
        : 'Agent cards are unsigned (still hosted, just no marketplace signature)',
    },
    warnings: [],
    recommendations: [],
  };

  // If treasury key is set and looks valid, fetch its USDC + ETH balances
  if (out.treasury.address) {
    try {
      const provider = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
      const ethBal = await provider.getBalance(out.treasury.address);
      const usdc = new ethers.Contract(cfg.usdc, ERC20_ABI, provider);
      const usdcBal = await usdc.balanceOf(out.treasury.address);
      out.treasury.eth = ethers.formatEther(ethBal);
      out.treasury.usdc = ethers.formatUnits(usdcBal, 6);
      out.treasury.usdcRaw = usdcBal.toString();
      if (Number(ethBal) === 0n) {
        out.warnings.push('Treasury has 0 ETH on ' + out.network + ' — broadcast will fail (no gas).');
        out.recommendations.push('Send ~0.005 ETH to ' + out.treasury.address + ' on Base Mainnet for gas.');
      }
      if (usdcBal === 0n) {
        out.warnings.push('Treasury has 0 USDC — broadcast will fail (transferFrom reverts).');
        out.recommendations.push('Fund the treasury with USDC before enabling auto-broadcast.');
      }
    } catch (e) {
      out.warnings.push('Could not read treasury balances: ' + e.message);
    }
  } else if (treasuryKey) {
    out.warnings.push('AWM_TREASURY_PRIVATE_KEY is set but the value is not a valid 0x-prefixed 64-hex-char private key. AWM will not broadcast.');
    out.recommendations.push('Generate a fresh EOA key with `node -e "console.log(require(\'ethers\').Wallet.createRandom().privateKey)"` and update the env var.');
  }

  // If both are the same address, surface that
  if (out.treasury.address && out.reputationSigner.address && out.treasury.address === out.reputationSigner.address) {
    out.warnings.push('Treasury and reputation signer are the SAME address. This is OK but reduces key-rotation flexibility.');
  }

  return json(res, 200, out);
};
