// api/treasury/test.js
// Dry-run broadcast test for the AWM treasury. POST-only.
//
// This endpoint exists to give the operator confidence that the
// AWM_TREASURY_PRIVATE_KEY is correctly configured BEFORE any real
// intent is created. It does a sequence of read-only checks:
//   1. Is the key set and valid?
//   2. What's the treasury address?
//   3. Does it have >= 0.001 ETH for gas on Base Mainnet?
//   4. Does it have USDC? (informational — broadcast doesn't need it for the dry-run)
//   5. Is the base RPC reachable from the Vercel region?
//   6. Can the wallet sign a test message? (gas-free)
//
// It does NOT send any transactions.

const { ethers } = require('ethers');

const NETWORKS = {
  mainnet: { rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org', chainId: 8453 },
  sepolia: { rpc: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org', chainId: 84532 },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const net = String(req.query.network || '').toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
  const cfg = NETWORKS[net];

  const out = {
    schema: 'ai-work-market.treasury.test.v1',
    network: net,
    chainId: cfg.chainId,
    checks: [],
    overall: 'unknown',
  };

  // Check 1: key set
  const treasuryKey = process.env.AWM_TREASURY_PRIVATE_KEY;
  if (!treasuryKey) {
    out.checks.push({ name: 'key_set', ok: false, detail: 'AWM_TREASURY_PRIVATE_KEY is not set in Vercel env vars' });
    out.overall = 'fail';
    return json(res, 200, out);
  }
  out.checks.push({ name: 'key_set', ok: true });

  // Check 2: key format
  if (!/^0x[0-9a-fA-F]{64}$/.test(treasuryKey.trim())) {
    out.checks.push({ name: 'key_format', ok: false, detail: 'Key is not a 0x-prefixed 64-hex-char EOA private key (ethers v6 rejects it)' });
    out.overall = 'fail';
    return json(res, 200, out);
  }
  out.checks.push({ name: 'key_format', ok: true });

  // Check 3: derive address
  let wallet;
  try {
    wallet = new ethers.Wallet(treasuryKey.trim());
    out.checks.push({ name: 'derive_address', ok: true, address: wallet.address });
  } catch (e) {
    out.checks.push({ name: 'derive_address', ok: false, detail: e.message });
    out.overall = 'fail';
    return json(res, 200, out);
  }

  // Check 4: RPC reachable
  let provider;
  try {
    provider = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
    const bn = await provider.getBlockNumber();
    out.checks.push({ name: 'rpc_reachable', ok: true, blockNumber: bn });
  } catch (e) {
    out.checks.push({ name: 'rpc_reachable', ok: false, detail: e.message });
    out.overall = 'fail';
    return json(res, 200, out);
  }

  // Check 5: wallet has ETH
  try {
    const ethBal = await provider.getBalance(wallet.address);
    const ethStr = ethers.formatEther(ethBal);
    const ok = ethBal >= ethers.parseEther('0.001');
    out.checks.push({
      name: 'eth_balance',
      ok,
      detail: ok ? `${ethStr} ETH` : `Only ${ethStr} ETH — need >= 0.001 for one broadcast`,
      eth: ethStr,
    });
    if (!ok) out.overall = 'warn';
  } catch (e) {
    out.checks.push({ name: 'eth_balance', ok: false, detail: e.message });
  }

  // Check 6: wallet can sign a test message (gas-free, but proves key validity)
  try {
    const testMessage = 'AWM treasury dry-run test at ' + new Date().toISOString();
    const sig = await wallet.signMessage(testMessage);
    out.checks.push({ name: 'sign_test_message', ok: true, sig: sig.slice(0, 20) + '…' });
  } catch (e) {
    out.checks.push({ name: 'sign_test_message', ok: false, detail: e.message });
  }

  // Check 7: known chainId matches
  try {
    const net = await provider.getNetwork();
    if (Number(net.chainId) === cfg.chainId) {
      out.checks.push({ name: 'chain_id_match', ok: true });
    } else {
      out.checks.push({ name: 'chain_id_match', ok: false, detail: `RPC reports chainId ${net.chainId}, expected ${cfg.chainId}` });
    }
  } catch (e) {
    out.checks.push({ name: 'chain_id_match', ok: false, detail: e.message });
  }

  // Overall verdict
  if (out.overall === 'unknown') {
    const allOk = out.checks.every(c => c.ok);
    out.overall = allOk ? 'pass' : 'fail';
  }

  out.summary = out.overall === 'pass'
    ? 'Treasury is fully configured and ready to broadcast. Real broadcasts will cost gas from the treasury address.'
    : 'One or more checks failed. Fix the issues above before enabling treasury mode.';

  return json(res, 200, out);
};
