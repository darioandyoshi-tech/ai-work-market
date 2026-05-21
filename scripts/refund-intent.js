const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/home/dario/.openclaw/workspace/projects/ai-work-market/.env.base-sepolia.local' });

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
  const buyerWallet = new ethers.Wallet(process.env.BUYER_PRIVATE_KEY, provider);
  const escrowAddress = '0x489C36738F46e395b4cd26DDf0f85756686A2f07';
  const abi = JSON.parse(fs.readFileSync('/home/dario/.openclaw/workspace/projects/ai-work-market/artifacts/AgentWorkEscrow.json', 'utf8')).abi;
  const escrow = new ethers.Contract(escrowAddress, abi, buyerWallet);

  const intentId = 3;
  console.log(`Refund intent ${intentId}...`);
  const tx = await escrow.refund(intentId);
  console.log(`Refund tx: ${tx.hash}`);
  await tx.wait();
  console.log('Refund successful.');
}
main().catch(console.error);
