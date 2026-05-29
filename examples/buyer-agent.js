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
  parseAmount,
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
    amount: '0.01', // default 0.01 USDC
    workUri: 'ipfs://bafybeigdyrzt5wfp7ud7g67v2v5ftjbgxlhmn6ljhuw55y7yza2qsae6ti',
    workHash: 'buyer-agent-test-work',
    workTimeout: '7200', // 2 hours
    reviewPeriod: '3600', // 1 hour
    json: false,
    yes: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--deployment') args.deployment = argv[++i];
    else if (arg === '--rpc') args.rpc = argv[++i];
    else if (arg === '--amount') args.amount = argv[++i];
    else if (arg === '--work-uri') args.workUri = argv[++i];
    else if (arg === '--work-hash') args.workHash = argv[++i];
    else if (arg === '--work-timeout') args.workTimeout = argv[++i];
    else if (arg === '--review-period') args.reviewPeriod = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: node examples/buyer-agent.js [options]
  
A minimal buyer agent that creates and manages intents in the AI Work Market escrow contract.

Options:
  --deployment <file>  Deployment JSON (default: deployments/base-sepolia.json)
  --rpc <url>          RPC URL (default based on chainId)
  --amount <amount>    USDC amount to escrow (default: 0.01)
  --work-uri <uri>     Work URI stored on-chain (default: ipfs://...)
  --work-hash <hash>   Work identifier/hash (default: 'buyer-agent-test-work')
  --work-timeout <s>   Work timeout in seconds (default: 7200)
  --review-period <s>  Review period in seconds (default: 3600)
  --json               Output results as JSON
  --yes                Skip confirmation prompts
  --help               Show this help`;

}

async function confirmAction(message) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    readline.question(`${message} (y/N): `, (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);

  // Load deployment and setup contracts
  const deployment = loadDeployment(args.deployment);
  const rpc = args.rpc || DEFAULT_RPC_BY_CHAIN[Number(deployment.chainId)];
  if (!rpc) throw new Error(`No RPC configured for chainId ${deployment.chainId}`);

  const provider = providerFromRpc(rpc);
  const network = await provider.getNetwork();
  const abi = loadAbi();
  const { escrow, usdc } = getContracts({ deployment, signerOrProvider: provider, abi });
  const decimals = await getDecimals(usdc);

  // Get buyer wallet from private key
  const buyerPk = process.env.PRIVATE_KEY || process.env.BUYER_PRIVATE_KEY;
  if (!buyerPk) {
    throw new Error('Buyer private key not found. Set PRIVATE_KEY or BUYER_PRIVATE_KEY in environment.');
  }
  const buyerWallet = new ethers.Wallet(buyerPk, provider);
  const buyerAddress = buyerWallet.address;

  console.log('=== AI Work Market Buyer Agent ===');
  console.log(`Network: ${deployment.network} (${deployment.chainId})`);
  console.log(`Escrow: ${deployment.address}`);
  console.log(`Buyer: ${buyerAddress}`);
  console.log(`Amount: ${args.amount} USDC`);
  console.log(`Work: ${args.workHash} (${args.workUri})`);

  // Check balances
  const [buyerEth, buyerUsdc, escrowUsdc] = await Promise.all([
    provider.getBalance(buyerAddress),
    usdc.balanceOf(buyerAddress),
    usdc.balanceOf(deployment.address)
  ]);

  console.log(`\\nBalances:`);
  console.log(`  Buyer ETH: ${ethers.formatEther(buyerEth)}`);
  console.log(`  Buyer USDC: ${formatAmount(buyerUsdc, decimals)}`);
  console.log(`  Escrow USDC: ${formatAmount(escrowUsdc, decimals)}`);

  // Check if buyer has enough USDC
  const amountRaw = parseAmount(args.amount, decimals);
  if (buyerUsdc < amountRaw) {
    throw new Error(`Insufficient USDC balance. Need ${args.amount} USDC, have ${formatAmount(buyerUsdc, decimals)}`);
  }

  // Check if buyer has enough ETH for gas (minimum 0.001 ETH for testnet)
  const minEthForGas = ethers.parseEther('0.001');
  if (buyerEth < minEthForGas) {
    throw new Error(`Insufficient ETH for gas. Need at least 0.001 ETH, have ${ethers.formatEther(buyerEth)}`);
  }

  // Confirm action unless --yes flag is used
  if (!args.yes) {
    const confirmed = await confirmAction(`Create intent for ${args.amount} USDC?`);
    if (!confirmed) {
      console.log('Action cancelled by user.');
      return;
    }
  }

  // Approve and create intent
  console.log(`\\n--- Creating Intent ---`);
  
  // Approve USDC spending
  let allowance = await usdc.allowance(buyerAddress, deployment.address);
  if (allowance < amountRaw) {
    console.log(`Approving USDC spending...`);
    const approveTx = await usdc.connect(buyerWallet).approve(deployment.address, amountRaw);
    console.log(`  Approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`  Approval confirmed`);
  } else {
    console.log(`USDC allowance already sufficient`);
  }

  // Create intent
  console.log(`Creating intent...`);
  const intentTx = await escrow.connect(buyerWallet).createIntent(
    ethers.ZeroAddress, // seller address (0x0 for testing - refund only)
    amountRaw,
    BigInt(args.workTimeout),
    BigInt(args.reviewPeriod),
    ethers.keccak256(ethers.toUtf8Bytes(args.workHash)),
    args.workUri
  );
  console.log(`  Create tx: ${intentTx.hash}`);
  const receipt = await intentTx.wait();
  
  // Extract intent ID from logs
  let intentId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === 'IntentCreated') {
        intentId = parsed.args.intentId;
        break;
      }
    } catch { /* ignore */ }
  }

  if (!intentId) {
    throw new Error('Failed to extract intent ID from transaction logs');
  }

  console.log(`  Intent ID: ${intentId}`);

  // Show intent details
  const intentData = await escrow.intents(intentId);
  const statusNames = ['None', 'Funded', 'ProofSubmitted', 'Released', 'Refunded', 'Disputed', 'Resolved'];
  const statusName = statusNames[Number(intentData.status)] || `Unknown(${intentData.status})`;

  console.log(`\\n--- Intent Details ---`);
  console.log(`  Buyer: ${intentData.buyer}`);
  console.log(`  Seller: ${intentData.seller}`);
  console.log(`  Amount: ${formatAmount(intentData.amount, decimals)} USDC`);
  console.log(`  Status: ${statusName}`);
  console.log(`  Work Hash: ${intentData.workHash}`);
  console.log(`  Work URI: ${intentData.workURI}`);

  // Wait for completion or offer to refund
  console.log(`\\n--- Waiting for Completion ---`);
  console.log(`Intent will auto-refund after work timeout (${args.workTimeout}s) + review period (${args.reviewPeriod}s)`);
  console.log(`Monitoring for completion... (Ctrl+C to stop)`);

  let lastStatus = intentData.status;
  const checkInterval = setInterval(async () => {
    try {
      const currentData = await escrow.intents(intentId);
      if (currentData.status !== lastStatus) {
        const newStatusName = statusNames[Number(currentData.status)] || `Unknown(${currentData.status})`;
        console.log(`  Status changed: ${statusNames[Number(lastStatus)]} → ${newStatusName}`);
        lastStatus = currentData.status;
      }

      // Check if we're in a terminal state
      const isTerminal = [2, 3, 4, 5, 6].includes(Number(currentData.status)); // ProofSubmitted, Released, Refunded, Disputed, Resolved
      if (isTerminal) {
        clearInterval(checkInterval);
        console.log(`\\n--- Intent Completed ---`);
        console.log(`  Final Status: ${statusNames[Number(currentData.status)]}`);
        
        if (args.json) {
          console.log(JSON.stringify({
            intentId: intentId.toString(),
            buyer: currentData.buyer,
            seller: currentData.seller,
            amount: formatAmount(currentData.amount, decimals),
            amountRaw: currentData.amount.toString(),
            feeBps: currentData.feeBps.toString(),
            status: Number(currentData.status),
            statusName: statusNames[Number(currentData.status)],
            workHash: currentData.workHash,
            workURI: currentData.workURI,
            createdAt: currentData.createdAt.toString(),
            workDeadline: currentData.workDeadline.toString(),
            reviewDeadline: currentData.reviewDeadline.toString(),
            transactionHash: intentTx.hash
          }, null, 2));
        }
        
        process.exit(0);
      }
    } catch (error) {
      console.error(`  Error checking intent: ${error.message}`);
    }
  }, 5000); // Check every 5 seconds

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\\n\\nStopping buyer agent...`);
    clearInterval(checkInterval);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`Buyer agent failed: ${err.message}`);
  process.exit(1);
});