#!/usr/bin/env node
/**
 * Deploy the fixed CommitRevealVerifierAdapter v2 to Base Mainnet and emit
 * the safe-tx-ready payload for `setZKVerifier(newAdapter)`.
 *
 * Reads:
 *   BASE_MAINNET_RPC_URL   — Alchemy/Infura/Base public RPC
 *   DEPLOYER_PRIVATE_KEY   — must be a Safe owner (one of the 3 in deployments/base-mainnet.json)
 *
 * Writes:
 *   deployments/zk-adapter-v2.json   — { address, txHash, deployer, blockNumber, timestamp, proposedSetZkVerifierData }
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// Already-deployed mainnet protocol (don't redeploy these)
const REAL_VERIFIER = '0x09DF1d2D899412cB6c20c37A392610985b8a0d80';
const ESCROW = '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2';
const TIMELOCK = '0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967';
const SAFE = '0x7f36896F6b6496B4E2fE95f672B3DAf28386b637';
const FEE_RECIPIENT = '0xec89c40CA296F502cD033e07f18DA5E01cdd197d';

const ESCROW_ABI = [
  'function setZKVerifier(address verifier)',
  'function zkVerifier() view returns (address)',
  'function owner() view returns (address)',
  'function usdc() view returns (address)',
  'function nextIntentId() view returns (uint256)',
  'function accumulatedFees() view returns (uint256)',
];

const TIMELOCK_ABI = [
  'function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)',
  'function getOperationId(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt) view returns (bytes32)',
];

function loadArtifact() {
  const candidates = [
    path.join(__dirname, '..', 'out', 'CommitRevealVerifierAdapter.sol', 'CommitRevealVerifierAdapter.json'),
    path.join(__dirname, '..', 'artifacts', 'CommitRevealVerifierAdapter.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return JSON.parse(fs.readFileSync(c, 'utf8'));
  }
  throw new Error('No CommitRevealVerifierAdapter artifact found. Run `forge build` first.');
}

async function main() {
  const rpc = process.env.BASE_MAINNET_RPC_URL;
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc) throw new Error('Missing BASE_MAINNET_RPC_URL');
  if (!pk) throw new Error('Missing DEPLOYER_PRIVATE_KEY');

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  console.log('[deploy] deployer:', wallet.address);

  const artifact = loadArtifact();
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log('[deploy] deploying CommitRevealVerifierAdapter v2 ...');
  const adapter = await factory.deploy(REAL_VERIFIER, ESCROW, { gasLimit: 1_500_000 });
  await adapter.waitForDeployment();
  const adapterAddr = await adapter.getAddress();
  console.log('[deploy] adapter deployed at:', adapterAddr);

  // Encode the setZKVerifier calldata — Safe must propose this through Timelock (48h delay)
  const escrow = new ethers.Contract(ESCROW, ESCROW_ABI, provider);
  const setZkData = escrow.interface.encodeFunctionData('setZKVerifier', [adapterAddr]);
  const salt = ethers.id('AWM-ZK-ADAPTER-V2-' + Math.floor(Date.now() / 1000));
  const predecessor = ethers.ZeroHash;
  const delay = 48 * 60 * 60; // 48h
  const timelock = new ethers.Contract(TIMELOCK, TIMELOCK_ABI, provider);
  const scheduleData = timelock.interface.encodeFunctionData('schedule', [
    ESCROW, 0, setZkData, predecessor, salt, delay,
  ]);
  const executeData = timelock.interface.encodeFunctionData('execute', [
    ESCROW, 0, setZkData, predecessor, salt,
  ]);
  const operationId = await timelock.getOperationId(ESCROW, 0, setZkData, predecessor, salt);

  const out = {
    network: 'Base Mainnet',
    chainId: 8453,
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    adapter: {
      address: adapterAddr,
      transactionHash: adapter.deploymentTransaction().hash,
      blockNumber: (await adapter.deploymentTransaction().wait()).blockNumber,
    },
    protocol: { realVerifier: REAL_VERIFIER, escrow: ESCROW, timelock: TIMELOCK, safe: SAFE },
    safeProposal: {
      description: 'Activate fixed ZK verifier adapter (v2) on AgentWorkEscrowZK',
      operationId,
      salt,
      predecessor,
      delaySeconds: delay,
      scheduleData,    // Safe → Timelock.schedule(...)
      executeData,     // Safe → Timelock.execute(...)  after 48h
      target: ESCROW,
      value: '0',
      setZKVerifierCalldata: setZkData,
    },
  };

  const outPath = path.join(__dirname, '..', 'deployments', 'zk-adapter-v2.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log('[deploy] wrote', outPath);
  console.log('---');
  console.log('Operation ID:', operationId);
  console.log('Safe proposal target: Timelock', TIMELOCK);
  console.log('scheduleData:', scheduleData);
  console.log('(after 48h) executeData:', executeData);
  console.log('---');
  console.log('Next step: open https://app.safe.global/base:8453/' + SAFE);
  console.log('  → New Transaction → Contract interaction → To: ' + TIMELOCK);
  console.log('  → Paste the scheduleData above');
  console.log('  → 2-of-3 owners sign → wait 48h → Safe executes → zkVerifier =', adapterAddr);
}

main().catch((e) => { console.error(e); process.exit(1); });
