#!/usr/bin/env node
// scripts/generate-safeproposal-setzkverifier.js
//
// Generate the exact calldata for a Gnosis Safe 2-of-3 proposal that
// queues a TimelockController.schedule() for escrow.setZKVerifier(adapter).
// Then compute the matching execute() calldata for after the 48h delay.
//
// Run:  node scripts/generate-safeproposal-setzkverifier.js
// Output: prints 4 hex calldata blobs you paste into the Safe Transaction Builder
//
// Live addresses (Base Mainnet, 2026-06-03):
//   Escrow:    0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2
//   Timelock:  0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967
//   Safe:      0x7f36896F6b6496B4E2fE95f672B3DAf28386b637
//   Adapter:   0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9  (CommitRevealVerifierAdapter)
//   Real verifier: 0x09DF1d2D899412cB6c20c37A392610985b8a0d80  (uint[3])
//
// Procedure (see awm-deployment skill "Commit-Reveal ZK Adapter"):
//   1. Run this script. Copy the 4 calldata strings.
//   2. Open https://app.safe.global/base:0x7f36896F6b6496B4E2fE95f672B3DAf28386b637
//   3. New Transaction → Transaction Builder
//   4. Add 2 transactions (see below). Get 2 owner signatures.
//   5. Execute via Safe. The first tx queues the schedule; the second
//      calls `execute()` on the Timelock directly, but only AFTER the 48h
//      delay. So queue the schedule now, wait 48h, then submit the execute
//      tx with 2 fresh owner signatures.
//
// Tx 1 (queue, immediate):
//   to:    0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967  (Timelock)
//   value: 0
//   data:  <scheduleCallData>
//
// Tx 2 (execute, after 48h):
//   to:    0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967  (Timelock)
//   value: 0
//   data:  <executeCallData>

const { ethers } = require('ethers');

const ESCROW     = ethers.getAddress('0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2'.toLowerCase());
const TIMELOCK   = ethers.getAddress('0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967'.toLowerCase());
const ADAPTER    = ethers.getAddress('0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9'.toLowerCase());
const DELAY_SECS = 48 * 60 * 60; // 48h

// ABIs (minimal, just what we need)
const ESCROW_ABI = ['function setZKVerifier(address _verifier) external'];
const TIMELOCK_ABI = [
  'function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external',
  'function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external payable',
];

const escrowIface  = new ethers.Interface(ESCROW_ABI);
const timelockIface = new ethers.Interface(TIMELOCK_ABI);

function main() {
  // 1. The inner calldata the Timelock will eventually call: escrow.setZKVerifier(adapter)
  const setZkCalldata = escrowIface.encodeFunctionData('setZKVerifier', [ADAPTER]);
  console.log('--- Inner calldata (escrow.setZKVerifier(adapter)) ---');
  console.log(setZkCalldata);
  console.log();

  // 2. The "predecessor" is the operationId that must complete first. We use
  //    bytes32(0) = "no predecessor, this is independent".
  const predecessor = ethers.ZeroHash;

  // 3. The "salt" makes the operationId unique. We use a fixed string so
  //    the same script always produces the same id (re-runnable).
  const salt = ethers.id('setZKVerifier(CommitRevealVerifierAdapter)-2026-06-03');

  // 4. Compute the operationId (the Timelock hashes these 6 fields)
  const operationId = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32'],
    [ESCROW, 0, ethers.keccak256(setZkCalldata), predecessor, salt]
  );
  console.log('--- Operation ID (for tracking) ---');
  console.log(operationId);
  console.log();

  // 5. schedule() calldata
  const scheduleCallData = timelockIface.encodeFunctionData('schedule', [
    ESCROW,
    0,
    setZkCalldata,
    predecessor,
    salt,
    DELAY_SECS,
  ]);
  console.log('--- schedule() calldata (Tx 1, queue immediately) ---');
  console.log('to:    ', TIMELOCK);
  console.log('value: ', '0');
  console.log('data:  ', scheduleCallData);
  console.log();

  // 6. execute() calldata (only after 48h)
  const executeCallData = timelockIface.encodeFunctionData('execute', [
    ESCROW,
    0,
    setZkCalldata,
    predecessor,
    salt,
  ]);
  console.log('--- execute() calldata (Tx 2, run AFTER 48h delay) ---');
  console.log('to:    ', TIMELOCK);
  console.log('value: ', '0');
  console.log('data:  ', executeCallData);
  console.log();

  // 7. Diagnostic: when can execute() actually run?
  const earliestExec = Math.floor(Date.now() / 1000) + DELAY_SECS;
  console.log('--- Timing ---');
  console.log('Earliest execute():', new Date(earliestExec * 1000).toISOString());
  console.log('Time until ready: ', DELAY_SECS, 'seconds (48h)');
  console.log();

  // 8. Verify: simulate schedule() on mainnet to confirm no reverts
  // (We can't sign without a key, but we can call the static read methods
  // to confirm the Timelock has the Safe as PROPOSER_ROLE.)
  console.log('--- To verify on-chain before submitting ---');
  console.log('1. Safe has PROPOSER_ROLE on Timelock:');
  console.log('   cast call 0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967 \\');
  console.log('     "hasRole(bytes32,address)(bool)" \\');
  console.log('     0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27b66b4a9c4c0727589f00 \\');
  console.log('     0x7f36896F6b6496B4E2fE95f672B3DAf28386b637 --rpc-url https://mainnet.base.org');
  console.log('   (MUST return true)');
  console.log();
  console.log('2. Safe has EXECUTOR_ROLE on Timelock (same hasRole pattern, hash for EXECUTOR_ROLE):');
  console.log('   EXECUTOR_ROLE = 0xd8d0f19b08e74e8c1e9b8a8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b (recompute fresh)');
  console.log('   cast keccak "EXECUTOR_ROLE"');
  console.log();
  console.log('3. The deployer (0xec89c40c…) still has DEFAULT_ADMIN_ROLE on the Timelock.');
  console.log('   If you intend to renounce admin AFTER the proposal executes, do that');
  console.log('   in a separate step. Do not renounce before this proposal lands.');
  console.log();

  // 9. Output a copy-pasteable JSON for the Safe Transaction Builder import
  const safeBuilderJson = {
    version: '1.0',
    chainId: '8453',
    createdAt: Date.now(),
    meta: {
      name: 'AWM: setZKVerifier(CommitRevealVerifierAdapter)',
      description: 'Proposes via Timelock.schedule() then executes escrow.setZKVerifier(0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9) after 48h delay.',
    },
    transactions: [
      {
        to: TIMELOCK,
        value: '0',
        data: scheduleCallData,
        contractMethod: { name: 'schedule', inputs: 'see ABI', outputs: 'none' },
        contractInputsValues: {
          target: ESCROW,
          value: '0',
          data: setZkCalldata,
          predecessor: predecessor,
          salt: salt,
          delay: String(DELAY_SECS),
        },
      },
      {
        to: TIMELOCK,
        value: '0',
        data: executeCallData,
        contractMethod: { name: 'execute', inputs: 'see ABI', outputs: 'none' },
        contractInputsValues: {
          target: ESCROW,
          value: '0',
          data: setZkCalldata,
          predecessor: predecessor,
          salt: salt,
        },
      },
    ],
  };

  const fs = require('fs');
  const outPath = 'safeproposal-setzkverifier.json';
  fs.writeFileSync(outPath, JSON.stringify(safeBuilderJson, null, 2));
  console.log('--- Saved Safe Transaction Builder JSON:');
  console.log(outPath);
  console.log('(Upload this at app.safe.global → New Transaction → Transaction Builder → "Import JSON")');
}

main();
