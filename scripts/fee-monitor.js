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

const DEFAULT_CONFIG = {
  deployment: 'deployments/base-sepolia.json',
  rpc: '',
  interval: 30, // seconds between checks
  threshold: 1000, // alert when fees exceed this amount (in USDC units)
  logFile: './logs/fee-monitor.log',
  production: false
};

function parseArgs(argv) {
  const config = { ...DEFAULT_CONFIG };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deployment') config.deployment = argv[++i];
    else if (arg === '--rpc') config.rpc = argv[++i];
    else if (arg === '--interval') config.interval = parseInt(argv[++i], 10);
    else if (arg === '--threshold') config.threshold = parseFloat(argv[++i]);
    else if (arg === '--log-file') config.logFile = argv[++i];
    else if (arg === '--production') config.production = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return config;
}

function usage() {
  return `Usage: node scripts/fee-monitor.js [options]
    
Monitors fee accumulation in the AgentWorkEscrow contract and logs changes over time.

Options:
  --deployment <file>  Deployment JSON (default: deployments/base-sepolia.json)
  --rpc <url>          RPC URL (default based on chainId)
  --interval <n>       Check interval in seconds (default: 30)
  --threshold <n>      Fee threshold for alerts (default: 1000 USDC)
  --log-file <file>    Log file path (default: ./logs/fee-monitor.log)
  --production         Enforce production metadata checks for Base mainnet
  --help               Show this help message`;
}

function ensureLogDirectory(logFile) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logMessage(message, logFile) {
  const fs = require('fs');
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logEntry);
  console.log(logEntry.trim());
}

async function checkFees(config) {
  try {
    const deployment = loadDeployment(config.deployment);
    if (config.production) {
      if (Number(deployment.chainId) !== 8453) {
        throw new Error('--production requires Base mainnet chainId 8453 deployment metadata');
      }
      for (const key of ['owner', 'feeRecipient', 'usdc', 'address']) {
        if (!deployment[key]) throw new Error(`production deployment metadata missing ${key}`);
      }
      if (!deployment.ownerIsMultisig && !deployment.ownerSafe) {
        throw new Error('production deployment metadata must declare ownerIsMultisig or ownerSafe');
      }
    }

    const rpc = config.rpc || DEFAULT_RPC_BY_CHAIN[Number(deployment.chainId)];
    if (!rpc) throw new Error(`No RPC configured for chainId ${deployment.chainId}`);

    const provider = providerFromRpc(rpc);
    const network = await provider.getNetwork();
    const abi = loadAbi();
    const { escrow, usdc } = getContracts({ deployment, signerOrProvider: provider, abi });
    const decimals = await getDecimals(usdc);

    const [accumulatedFeesRaw, usdcBalanceRaw, owner, feeRecipient] = await Promise.all([
      escrow.accumulatedFees(),
      usdc.balanceOf(deployment.address),
      escrow.owner(),
      escrow.feeRecipient()
    ]);

    const accumulatedFees = formatAmount(accumulatedFeesRaw, decimals);
    const usdcBalance = formatAmount(usdcBalanceRaw, decimals);

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      chainId: Number(deployment.chainId),
      contract: deployment.address,
      accumulatedFeesRaw: accumulatedFeesRaw.toString(),
      accumulatedFees: accumulatedFees,
      usdcBalanceRaw: usdcBalanceRaw.toString(),
      usdcBalance: usdcBalance,
      owner,
      feeRecipient
    };

    // Check if we've crossed the threshold
    if (Number(accumulatedFeesRaw) > 0 && 
        (config.lastFee === undefined || Number(accumulatedFeesRaw) > Number(config.lastFee))) {
      
      const feeIncrease = Number(accumulatedFeesRaw) - (Number(config.lastFee) || 0);
      logMessage(
        `FEE ACCUMULATION: +${formatAmount(BigInt(feeIncrease), decimals)} USDC (total: ${accumulatedFees} USDC)`, 
        config.logFile
      );
      
      // Check threshold alert
      if (Number(accumulatedFeesRaw) >= ethers.parseUnits(config.threshold.toString(), decimals)) {
        logMessage(
          `⚠️  FEE THRESHOLD EXCEEDED: ${accumulatedFees} USDC >= ${config.threshold} USDC`, 
          config.logFile
        );
      }
    }

    config.lastFee = accumulatedFeesRaw.toString();
    
    // Also log to console for service output
    logMessage(
      `Fee check: ${accumulatedFees} USDC accumulated (${usdcBalance} USDC in escrow)`, 
      config.logFile
    );

    return logEntry;
  } catch (error) {
    const errorMessage = `FEE MONITOR ERROR: ${error.message}`;
    logMessage(errorMessage, config.logFile);
    throw error;
  }
}

async function main() {
  const config = parseArgs(process.argv);
  
  // Ensure log directory exists
  ensureLogDirectory(config.logFile);
  
  logMessage(`=== FEE MONITOR STARTED ===`, config.logFile);
  logMessage(`Monitoring contract: ${config.deployment}`, config.logFile);
  logMessage(`Check interval: ${config.interval}s`, config.logFile);
  logMessage(`Fee threshold: ${config.threshold} USDC`, config.logFile);
  logMessage(`Log file: ${config.logFile}`, config.logFile);
  
  // Run initial check
  await checkFees(config);
  
  // Set up periodic checks
  setInterval(() => {
    checkFees(config).catch(err => {
      logMessage(`Periodic check failed: ${err.message}`, config.logFile);
    });
  }, config.interval * 1000);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logMessage(`=== FEE MONITOR STOPPED ===`, config.logFile);
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    logMessage(`=== FEE MONITOR STOPPED ===`, config.logFile);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`Fee monitor failed to start: ${err.message || err}`);
  process.exit(1);
});