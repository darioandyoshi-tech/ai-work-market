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
const fs = require('fs');
const path = require('path');

const DEFAULT_RPC_BY_CHAIN = {
  84532: 'https://sepolia.base.org',
  8453: 'https://mainnet.base.org'
};

const DEFAULT_CONFIG = {
  deployments: [
    // Old deployment (for backward compatibility)
    {
      file: 'deployments/base-sepolia.json',
      name: 'Original AWM Contract',
      threshold: 1000, // Alert when fees exceed this amount (in USDC units)
      balanceWarning: 10000, // Warn if escrow balance drops below this
      balanceCritical: 1000  // Critical if escrow balance drops below this
    },
    // New deployment with Gnosis Safe ownership
    {
      file: 'deployments/new-awm-with-gnosis-safe.json',
      name: 'Gnosis Safe AWM Contract',
      threshold: 500, // Lower threshold for new contract initially
      balanceWarning: 5000,
      balanceCritical: 500
    }
  ],
  rpc: '',
  interval: 30, // seconds between checks
  logFile: './logs/enhanced-fee-monitor.log',
  production: false,
  enableConsoleOutput: true,
  alertWebhook: '' // Optional: URL for sending alerts (Slack, Discord, etc.)
};

function parseArgs(argv) {
  const config = { ...DEFAULT_CONFIG };
  
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--interval') config.interval = parseInt(argv[++i], 10);
    else if (arg === '--log-file') config.logFile = argv[++i];
    else if (arg === '--production') config.production = true;
    else if (arg === '--no-console') config.enableConsoleOutput = false;
    else if (arg === '--webhook') config.alertWebhook = argv[++i];
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
  return `Usage: node scripts/enhanced-fee-monitor.js [options]

Monitors fee accumulation and health of AWM contracts with enhanced alerting.

Options:
  --interval <n>       Check interval in seconds (default: 30)
  --log-file <file>    Log file path (default: ./logs/enhanced-fee-monitor.log)
  --production         Enforce production metadata checks
  --no-console         Disable console output (log file only)
  --webhook <url>      Webhook URL for sending alerts
  --help               Show this help message`;
}

function ensureLogDirectory(logFile) {
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logMessage(message, logFile, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  fs.appendFileSync(logFile, logEntry);
  if (DEFAULT_CONFIG.enableConsoleOutput) {
    console.log(logEntry.trim());
  }
}

async function sendWebhookAlert(message, webhookUrl) {
  if (!webhookUrl) return;
  
  try {
    const https = require('https');
    const data = JSON.stringify({ text: message });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(webhookUrl, options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {});
    });
    
    req.on('error', (error) => {
      logMessage(`Webhook error: ${message}`, '', 'WARN');
    });
    
    req.write(data);
    req.end();
  } catch (error) {
    logMessage(`Webhook send error: ${error.message}`, '', 'WARN');
  }
}

async function checkContractHealth(deploymentConfig, config) {
  const deployment = loadDeployment(deploymentConfig.file);
  const contractName = deploymentConfig.name;
  
  if (config.production) {
    if (Number(deployment.chainId) !== 8453) {
      throw new Error(`--production requires Base mainnet chainId 8453 deployment for ${contractName}`);
    }
    for (const key of ['owner', 'feeRecipient', 'usdc', 'address']) {
      if (!deployment[key]) throw new Error(`production deployment metadata missing ${key} for ${contractName}`);
    }
  }

  const rpc = deploymentConfig.rpc || DEFAULT_RPC_BY_CHAIN[Number(deployment.chainId)];
  if (!rpc) throw new Error(`No RPC configured for chainId ${deployment.chainId} (${contractName})`);

  const provider = providerFromRpc(rpc);
  const network = await provider.getNetwork();
  const abi = loadAbi();
  const { escrow, usdc } = getContracts({ deployment, signerOrProvider: provider, abi });
  const decimals = await getDecimals(usdc);

  // Get contract data
  const [
    accumulatedFeesRaw,
    usdcBalanceRaw,
    owner,
    feeRecipient,
    totalSupply, // If it's an ERC20-like token
    implementation // If it uses proxy pattern
  ] = await Promise.all([
    escrow.accumulatedFees().catch(() => BigInt(0)),
    usdc.balanceOf(deployment.address).catch(() => BigInt(0)),
    escrow.owner().catch(() => ethers.ZeroAddress),
    escrow.feeRecipient().catch(() => ethers.ZeroAddress),
    // Optional: check if ERC20
    escrow.totalSupply ? escrow.totalSupply().catch(() => BigInt(0)) : Promise.resolve(BigInt(0)),
    // Optional: check implementation (for proxy contracts)
    escrow.implementation ? escrow.implementation().catch(() => ethers.ZeroAddress) : Promise.resolve(ethers.ZeroAddress)
  ]).then(results => {
    // Handle cases where some methods might not exist
    while (results.length < 6) results.push(ethers.ZeroAddress);
    return results;
  });

  const accumulatedFees = formatAmount(accumulatedFeesRaw, decimals);
  const usdcBalance = formatAmount(usdcBalanceRaw, decimals);
  
  // Check if owner has changed unexpectedly
  let ownerChangeAlert = null;
  if (deployment.owner && owner.toLowerCase() !== deployment.owner.toLowerCase()) {
    ownerChangeAlert = `OWNER CHANGED: ${deployment.owner} → ${owner}`;
  }
  
  // Check if fee recipient has changed unexpectedly
  let feeRecipientChangeAlert = null;
  if (deployment.feeRecipient && feeRecipient.toLowerCase() !== deployment.feeRecipient.toLowerCase()) {
    feeRecipientChangeAlert = `FEE RECIPIENT CHANGED: ${deployment.feeRecipient} → ${feeRecipient}`;
  }
  
  // Determine alert level based on balance
  let balanceAlert = null;
  let balanceLevel = 'INFO';
  const balanceNumber = Number(usdcBalanceRaw);
  
  if (balanceNumber <= deploymentConfig.balanceCritical) {
    balanceAlert = `CRITICAL BALANCE: ${usdcBalance} USDC (≤ ${deploymentConfig.balanceCritical} USDC)`;
    balanceLevel = 'CRITICAL';
  } else if (balanceNumber <= deploymentConfig.balanceWarning) {
    balanceAlert = `LOW BALANCE WARNING: ${usdcBalance} USDC (≤ ${deploymentConfig.balanceWarning} USDC)`;
    balanceLevel = 'WARN';
  }
  
  // Check fee threshold
  let feeAlert = null;
  let feeLevel = 'INFO';
  const feeIncrease = Number(accumulatedFeesRaw) - (deploymentConfig.lastFee || 0);
  
  if (feeIncrease > 0 && Number(accumulatedFeesRaw) >= ethers.parseUnits(deploymentConfig.threshold.toString(), decimals)) {
    feeAlert = `FEE THRESHOLD EXCEEDED: ${accumulatedFees} USDC (≥ ${deploymentConfig.threshold} USDC)`;
    feeLevel = 'WARN';
  }
  
  return {
    contractName,
    address: deployment.address,
    chainId: deployment.chainId,
    accumulatedFeesRaw,
    accumulatedFees,
    usdcBalanceRaw,
    usdcBalance,
    owner,
    feeRecipient,
    totalSupply: totalSupply.toString(),
    alerts: [
      ...(ownerChangeAlert ? [{ message: ownerChangeAlert, level: 'CRITICAL' }] : []),
      ...(feeRecipientChangeAlert ? [{ message: feeRecipientChangeAlert, level: 'CRITICAL' }] : []),
      ...(balanceAlert ? [{ message: balanceAlert, level: balanceLevel }] : []),
      ...(feeAlert ? [{ message: feeAlert, level: feeLevel }] : [])
    ],
    lastFee: accumulatedFeesRaw.toString(),
    timestamp: new Date().toISOString()
  };
}

async function monitorContracts(config) {
  const results = [];
  const errors = [];
  
  for (const deploymentConfig of config.deployments) {
    try {
      const result = await checkContractHealth(deploymentConfig, config);
      results.push(result);
      
      // Update lastFee for next comparison
      deploymentConfig.lastFee = result.lastFee;
      
      // Log and alert for any issues
      for (const alert of result.alerts) {
        const logMsg = `[${result.contractName}] ${alert.message}`;
        logMessage(logMsg, config.logFile, alert.level);
        
        // Send webhook alert for WARN and CRITICAL levels
        if (alert.level === 'WARN' || alert.level === 'CRITICAL') {
          await sendWebhookAlert(
            `[AWM Monitor] ${logMsg}`,
            config.alertWebhook
          );
        }
      }
      
      // Regular status log
      if (config.enableConsoleOutput) {
        logMessage(
          `[${result.contractName}] Fees: ${result.accumulatedFees} USDC | Balance: ${result.usdcBalance} USDC`,
          config.logFile,
          'INFO'
        );
      }
    } catch (error) {
      const errorMsg = `[${deploymentConfig.name}] MONITOR ERROR: ${error.message}`;
      errors.push(errorMsg);
      logMessage(errorMsg, config.logFile, 'ERROR');
      
      await sendWebhookAlert(
        `[AWM Monitor] ${errorMsg}`,
        config.alertWebhook
      );
    }
  }
  
  return { results, errors };
}

async function main() {
  const config = parseArgs(process.argv);
  
  ensureLogDirectory(config.logFile);
  
  logMessage(`=== ENHANCED FEE MONITOR STARTED ===`, config.logFile, 'INFO');
  logMessage(`Monitoring ${config.deployments.length} contract(s)`, config.logFile, 'INFO');
  logMessage(`Check interval: ${config.interval}s`, config.logFile, 'INFO');
  logMessage(`Log file: ${config.logFile}`, config.logFile, 'INFO');
  if (config.alertWebhook) {
    logMessage(`Webhook alerts enabled: ${config.alertWebhook}`, config.logFile, 'INFO');
  }
  
  // Run initial check
  await monitorContracts(config);
  
  // Set up periodic checks
  setInterval(() => {
    monitorContracts(config).catch(err => {
      logMessage(`Periodic check failed: ${err.message}`, config.logFile, 'ERROR');
    });
  }, config.interval * 1000);
  
  // Handle graceful shutdown
  const shutdown = () => {
    logMessage(`=== ENHANCED FEE MONITOR STOPPED ===`, config.logFile, 'INFO');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`Enhanced fee monitor failed to start: ${err.message || err}`);
  process.exit(1);
});