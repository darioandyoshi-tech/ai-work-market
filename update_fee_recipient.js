const { ethers } = require('ethers');
console.log('🔧 UPDATING AWM FEE RECIPIENT');
console.log('   Contract: 0x489C36738F46e395b4cd26DDf0f85756686A2f07');
console.log('   Current fee recipient: 0x8d32448cbad55a3d3b12de901e57782c409399b7');
console.log('   New fee recipient:     ', process.env.NEW_FEE_RECIPIENT);
console.log('');

// Validate
if (!process.env.OWNER_PRIVATE_KEY || !process.env.NEW_FEE_RECIPIENT) {
  console.error('❌ ERROR: Set OWNER_PRIVATE_KEY and NEW_FEE_RECIPIENT first!');
  process.exit(1);
}

const wallet = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const escrow = new ethers.Contract(
  '0x489C36738F46e395b4cd26DDf0f85756686A2f07',
  require('./artifacts/contracts/AgentWorkEscrow.sol/AgentWorkEscrow.json').abi,
  wallet
);

// Verify sender is owner
(async () => {
  const owner = await escrow.owner();
  if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
    console.error('❌ ERROR: Private key does not match contract owner!');
    console.log('   Key address:', wallet.address);
    console.log('   Contract owner:', owner);
    process.exit(1);
  }

  // Update fee recipient
  console.log('⏳ Sending setFeeRecipient transaction...');
  const tx = await escrow.setFeeRecipient(process.env.NEW_FEE_RECIPIENT);
  console.log('📤 Transaction hash: ', tx.hash);

  const receipt = await tx.wait();
  console.log('✅ Transaction mined in block:', receipt.blockNumber);

  // Verify update
  const updatedRecipient = await escrow.feeRecipient();
  console.log('📊 Fee recipient after update:', updatedRecipient);
  if (updatedRecipient.toLowerCase() === process.env.NEW_FEE_RECIPIENT.toLowerCase()) {
    console.log('🎉 SUCCESS: Fee recipient updated to YOUR wallet!');
    console.log('   Future 1% fees will now accumulate to:', process.env.NEW_FEE_RECIPIENT);
  } else {
    console.log('❌ ERROR: Update failed');
    process.exit(1);
  }
})();
