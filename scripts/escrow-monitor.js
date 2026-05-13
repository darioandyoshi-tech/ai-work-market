#!/usr/bin/env node
'use strict';

const { ethers } = require('ethers');
const {
  loadDeployment,
  loadAbi,
  providerFromRpc,
  getContracts,
  getDecimals,
  formatAmount,
  USDC_ABI
} = require('../sdk');

const DEFAULT_RPC_BY_CHAIN = {
  84532: 'https://sepolia.base.org',
  8453: 'https://mainnet.base.org'
};

function parseArgs(argv) {
  const args = {
    deployment: process.env.AWM_DEPLOYMENT_FILE || 'deployments/base-sepolia.json',
    rpc: process.env.AWM_RPC_URL || '',
    blocks: Number(process.env.AWM_MONITOR_BLOCKS || 500),
    json: false,
    production: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deployment') args.deployment = argv[++i];
    else if (arg === '--rpc') args.rpc = argv[++i];
    else if (arg === '--blocks') args.blocks = Number(argv[++i]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--production') args.production = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/escrow-monitor.js [options]\n\nRead-only AgentWorkEscrow monitor for Base Sepolia/mainnet readiness.\n\nOptions:\n  --deployment <file>  Deployment JSON (default: deployments/base-sepolia.json)\n  --rpc <url>          RPC URL (default based on chainId)\n  --blocks <n>         Recent block window for events (default: 500)\n  --production         Enforce production metadata checks for Base mainnet\n  --json               Print machine-readable JSON\n`;
}

function asString(value) {
  return typeof value === 'bigint' ? value.toString() : String(value);
}

function severityFor(eventName) {
  if (['OwnershipTransferStarted', 'OwnershipTransferred', 'FeeRecipientUpdated'].includes(eventName)) return 'critical';
  if (['DefaultFeeBpsUpdated', 'FeesWithdrawn', 'Disputed', 'DisputeResolved'].includes(eventName)) return 'high';
  return 'info';
}

function eventSummary(parsed, log) {
  const values = {};
  for (const [key, value] of Object.entries(parsed.args.toObject ? parsed.args.toObject() : parsed.args)) {
    if (/^\d+$/.test(key)) continue;
    values[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return {
    name: parsed.name,
    severity: severityFor(parsed.name),
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    args: values
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const deployment = loadDeployment(args.deployment);
  if (args.production) {
    if (Number(deployment.chainId) !== 8453) throw new Error('--production requires Base mainnet chainId 8453 deployment metadata');
    for (const key of ['owner', 'feeRecipient', 'usdc', 'address']) {
      if (!deployment[key]) throw new Error(`production deployment metadata missing ${key}`);
    }
    if (!deployment.ownerIsMultisig && !deployment.ownerSafe) {
      throw new Error('production deployment metadata must declare ownerIsMultisig or ownerSafe');
    }
  }

  const rpc = args.rpc || DEFAULT_RPC_BY_CHAIN[Number(deployment.chainId)];
  if (!rpc) throw new Error(`No RPC configured for chainId ${deployment.chainId}`);

  const provider = providerFromRpc(rpc);
  const network = await provider.getNetwork();
  const abi = loadAbi();
  const { escrow, usdc } = getContracts({ deployment, signerOrProvider: provider, abi });
  const decimals = await getDecimals(usdc);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - Math.max(1, args.blocks));

  const [owner, feeRecipient, defaultFeeBps, nextIntentId, accumulatedFees, usdcBalance] = await Promise.all([
    escrow.owner(),
    escrow.feeRecipient(),
    escrow.defaultFeeBps(),
    escrow.nextIntentId(),
    escrow.accumulatedFees(),
    usdc.balanceOf(deployment.address)
  ]);

  const alerts = [];
  if (Number(network.chainId) !== Number(deployment.chainId)) {
    alerts.push({ severity: 'critical', code: 'chain_id_mismatch', expected: Number(deployment.chainId), actual: Number(network.chainId) });
  }
  if (deployment.owner && owner.toLowerCase() !== deployment.owner.toLowerCase()) {
    alerts.push({ severity: 'critical', code: 'owner_mismatch', expected: deployment.owner, actual: owner });
  }
  if (deployment.feeRecipient && feeRecipient.toLowerCase() !== deployment.feeRecipient.toLowerCase()) {
    alerts.push({ severity: 'critical', code: 'fee_recipient_mismatch', expected: deployment.feeRecipient, actual: feeRecipient });
  }
  if (BigInt(defaultFeeBps) > 1000n) {
    alerts.push({ severity: 'critical', code: 'fee_bps_above_contract_cap', actual: defaultFeeBps.toString() });
  }

  const logs = await provider.getLogs({ address: deployment.address, fromBlock, toBlock: latestBlock });
  const events = [];
  for (const log of logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed) {
        const summary = eventSummary(parsed, log);
        events.push(summary);
        if (summary.severity !== 'info') alerts.push({ severity: summary.severity, code: `event_${summary.name}`, event: summary });
      }
    } catch { /* ignore */ }
  }

  const state = {
    schema: 'ai-work-market.escrow-monitor.v1',
    checkedAt: new Date().toISOString(),
    deployment: {
      network: deployment.network,
      chainId: Number(deployment.chainId),
      address: deployment.address,
      usdc: deployment.usdc,
      explorer: deployment.explorer || null
    },
    rpc: { chainId: Number(network.chainId), latestBlock, fromBlock, windowBlocks: latestBlock - fromBlock },
    contract: {
      owner,
      feeRecipient,
      defaultFeeBps: defaultFeeBps.toString(),
      nextIntentId: nextIntentId.toString(),
      accumulatedFeesRaw: accumulatedFees.toString(),
      accumulatedFees: formatAmount(accumulatedFees, decimals),
      usdcBalanceRaw: usdcBalance.toString(),
      usdcBalance: formatAmount(usdcBalance, decimals)
    },
    recentEvents: events,
    alerts,
    status: alerts.some((a) => a.severity === 'critical') ? 'critical' : alerts.some((a) => a.severity === 'high') ? 'needs_review' : 'ok',
    safety: { readOnly: true, movesFunds: false, requiresPrivateKey: false }
  };

  if (args.json) console.log(JSON.stringify(state, null, 2));
  else {
    console.log(`# AI Work Market Escrow Monitor — ${state.checkedAt}`);
    console.log(`Network: ${deployment.network} (${deployment.chainId})`);
    console.log(`Contract: ${deployment.address}`);
    console.log(`Blocks: ${fromBlock} → ${latestBlock}`);
    console.log(`Owner: ${owner}`);
    console.log(`Fee recipient: ${feeRecipient}`);
    console.log(`Default fee bps: ${state.contract.defaultFeeBps}`);
    console.log(`Next intent ID: ${state.contract.nextIntentId}`);
    console.log(`USDC balance: ${state.contract.usdcBalance}`);
    console.log(`Accumulated fees: ${state.contract.accumulatedFees}`);
    console.log(`Recent events: ${events.length}`);
    console.log(`Alerts: ${alerts.length}`);
    for (const alert of alerts) console.log(`- [${alert.severity}] ${alert.code}`);
    console.log(`Status: ${state.status}`);
  }
}

main().catch((err) => {
  console.error(`escrow-monitor failed: ${err.message || err}`);
  process.exit(1);
});
