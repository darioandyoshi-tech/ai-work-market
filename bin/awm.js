#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const dotenv = require('dotenv');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DEPLOYMENT = path.join(ROOT, 'deployments', 'base-sepolia.json');
const DEFAULT_ENV = path.join(ROOT, '.env.base-sepolia.local');
const DEFAULT_ARTIFACT = path.join(ROOT, 'artifacts', 'AgentWorkEscrow.json');

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)'
];

function loadEnv(file) {
  if (file && fs.existsSync(file)) dotenv.config({ path: file, override: false, quiet: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function stringifyBigInts(value) {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitTx(tx) {
  const receipt = await tx.wait();
  // Public RPCs can be slightly stale behind load balancers immediately after mining.
  // A tiny pause makes back-to-back CLI lifecycle commands much less flaky.
  await sleep(1500);
  return receipt;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function getDeployment(file) {
  const deployment = readJson(file || DEFAULT_DEPLOYMENT);
  if (!deployment.address || !deployment.usdc || !deployment.chainId) {
    throw new Error(`Invalid deployment file: ${file || DEFAULT_DEPLOYMENT}`);
  }
  return deployment;
}

function getAbi() {
  if (!fs.existsSync(DEFAULT_ARTIFACT)) {
    throw new Error(
      `Missing contract artifact: ${DEFAULT_ARTIFACT}\n` +
      'Run `npm run compile` from the ai-work-market project root, then retry this command.'
    );
  }
  const artifact = readJson(DEFAULT_ARTIFACT);
  return artifact.abi;
}

function getProvider(opts) {
  const rpc = opts.rpc || process.env.BASE_SEPOLIA_RPC_URL || process.env.RPC_URL || 'https://sepolia.base.org';
  return new ethers.JsonRpcProvider(rpc);
}

function getWallet(privateKey, provider) {
  if (!privateKey) throw new Error('Missing private key');
  return new ethers.Wallet(privateKey, provider);
}

function getPrivateKey(role) {
  if (role === 'seller') return process.env.SELLER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (role === 'buyer') return process.env.BUYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  return process.env.PRIVATE_KEY;
}

function getContracts(opts, signerOrProvider) {
  const deployment = getDeployment(opts.deployment);
  const escrow = new ethers.Contract(deployment.address, getAbi(), signerOrProvider);
  const usdc = new ethers.Contract(deployment.usdc, USDC_ABI, signerOrProvider);
  return { deployment, escrow, usdc };
}

async function getDecimals(usdc) {
  try { return Number(await usdc.decimals()); } catch { return 6; }
}

function parseAmount(amount, decimals = 6) {
  if (amount === undefined || amount === null) throw new Error('Missing amount');
  if (/^[0-9]+$/.test(String(amount))) return BigInt(amount);
  return ethers.parseUnits(String(amount), decimals);
}

function formatAmount(raw, decimals = 6) {
  return ethers.formatUnits(raw, decimals);
}

function asBytes32(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function offerDomain(deployment) {
  return {
    name: 'AI Work Market',
    version: '0.4',
    chainId: Number(deployment.chainId),
    verifyingContract: deployment.address
  };
}

function offerTypes() {
  return {
    SellerOffer: [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'workHash', type: 'bytes32' },
      { name: 'workURIHash', type: 'bytes32' },
      { name: 'workTimeoutSeconds', type: 'uint256' },
      { name: 'reviewPeriodSeconds', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'offerExpiresAt', type: 'uint256' }
    ]
  };
}

function offerMessage(offer) {
  return {
    buyer: offer.buyer,
    seller: offer.seller,
    amount: String(offer.amountRaw),
    workHash: offer.workHash,
    workURIHash: offer.workURIHash,
    workTimeoutSeconds: String(offer.workTimeoutSeconds),
    reviewPeriodSeconds: String(offer.reviewPeriodSeconds),
    nonce: String(offer.nonce),
    offerExpiresAt: String(offer.offerExpiresAt)
  };
}

async function signOfferWithWallet(wallet, deployment, offer) {
  return wallet.signTypedData(offerDomain(deployment), offerTypes(), offerMessage(offer));
}

function makeProgram() {
  const program = new Command();
  program
    .name('awm')
    .description('AI Work Market CLI for AgentWorkEscrow')
    .option('--env <file>', 'env file to load', DEFAULT_ENV)
    .option('--deployment <file>', 'deployment JSON', DEFAULT_DEPLOYMENT)
    .option('--rpc <url>', 'RPC URL override');

  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    loadEnv(opts.env);
  });

  program.command('deployment')
    .description('Show active deployment metadata')
    .action(async () => {
      const opts = program.opts();
      console.log(stringifyBigInts(getDeployment(opts.deployment)));
    });

  program.command('balances')
    .description('Show ETH/USDC balances for buyer, seller, escrow, or any address')
    .option('--address <address>', 'custom address')
    .action(async (cmd) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const { deployment, usdc } = getContracts(opts, provider);
      const decimals = await getDecimals(usdc);
      const symbol = await usdc.symbol().catch(() => 'USDC');
      const addresses = [];
      if (cmd.address) addresses.push(['custom', cmd.address]);
      if (process.env.DEPLOYER_ADDRESS) addresses.push(['deployer', process.env.DEPLOYER_ADDRESS]);
      if (process.env.SELLER_ADDRESS) addresses.push(['seller', process.env.SELLER_ADDRESS]);
      addresses.push(['escrow', deployment.address]);
      for (const [label, address] of addresses) {
        const eth = await provider.getBalance(address);
        const token = await usdc.balanceOf(address);
        console.log(`${label}: ${address}`);
        console.log(`  ETH:  ${ethers.formatEther(eth)}`);
        console.log(`  ${symbol}: ${formatAmount(token, decimals)} (${token} raw)`);
      }
    });

  program.command('preflight')
    .description('Read-only setup check before sending any testnet transactions')
    .option('--min-amount <amount>', 'minimum buyer USDC needed for the test flow', '0.01')
    .action(async (cmd) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const deployment = getDeployment(opts.deployment);
      const { escrow, usdc } = getContracts(opts, provider);
      const decimals = await getDecimals(usdc);
      const minAmount = parseAmount(cmd.minAmount, decimals);
      const checks = [];
      const add = (name, ok, details = {}) => checks.push({ name, ok, ...details });

      const network = await provider.getNetwork();
      add('rpc_chain_matches_deployment', Number(network.chainId) === Number(deployment.chainId), {
        rpcChainId: Number(network.chainId),
        deploymentChainId: Number(deployment.chainId)
      });

      const escrowCode = await provider.getCode(deployment.address);
      const usdcCode = await provider.getCode(deployment.usdc);
      add('escrow_contract_code_present', escrowCode !== '0x', { address: deployment.address });
      add('usdc_contract_code_present', usdcCode !== '0x', { address: deployment.usdc });

      const symbol = await usdc.symbol().catch(() => 'USDC');
      add('usdc_metadata_readable', Boolean(symbol), { symbol, decimals });

      const onchainUsdc = await escrow.usdc().catch(() => null);
      add('escrow_usdc_matches_deployment', onchainUsdc && onchainUsdc.toLowerCase() === deployment.usdc.toLowerCase(), {
        onchainUsdc,
        deploymentUsdc: deployment.usdc
      });

      let buyerAddress = null;
      let sellerAddress = null;
      const buyerPk = getPrivateKey('buyer');
      const sellerPk = getPrivateKey('seller');
      add('buyer_private_key_present', Boolean(buyerPk));
      add('seller_private_key_present', Boolean(sellerPk));

      if (buyerPk) {
        const buyerWallet = getWallet(buyerPk, provider);
        buyerAddress = buyerWallet.address;
        const buyerEth = await provider.getBalance(buyerAddress);
        const buyerUsdc = await usdc.balanceOf(buyerAddress);
        add('buyer_address_helper_matches_key', !process.env.DEPLOYER_ADDRESS || process.env.DEPLOYER_ADDRESS.toLowerCase() === buyerAddress.toLowerCase(), {
          keyAddress: buyerAddress,
          deployerAddress: process.env.DEPLOYER_ADDRESS || null
        });
        add('buyer_has_eth_for_gas', buyerEth > 0n, { eth: ethers.formatEther(buyerEth) });
        add('buyer_has_min_usdc', buyerUsdc >= minAmount, {
          usdc: formatAmount(buyerUsdc, decimals),
          required: formatAmount(minAmount, decimals)
        });
      }

      if (sellerPk) {
        const sellerWallet = getWallet(sellerPk, provider);
        sellerAddress = sellerWallet.address;
        const sellerEth = await provider.getBalance(sellerAddress);
        add('seller_address_helper_matches_key', !process.env.SELLER_ADDRESS || process.env.SELLER_ADDRESS.toLowerCase() === sellerAddress.toLowerCase(), {
          keyAddress: sellerAddress,
          sellerAddress: process.env.SELLER_ADDRESS || null
        });
        add('seller_has_eth_for_gas', sellerEth > 0n, { eth: ethers.formatEther(sellerEth) });
      }

      if (buyerAddress) {
        const allowance = await usdc.allowance(buyerAddress, deployment.address);
        add('buyer_allowance_checked', true, {
          allowance: formatAmount(allowance, decimals),
          note: allowance >= minAmount ? 'fund-offer should not need approve for min amount' : 'fund-offer will send approve before funding'
        });
      }

      const ok = checks.every((check) => check.ok);
      console.log(JSON.stringify({
        ok,
        network: deployment.network,
        chainId: deployment.chainId,
        escrow: deployment.address,
        usdc: deployment.usdc,
        buyer: buyerAddress,
        seller: sellerAddress,
        checks
      }, null, 2));
      if (!ok) process.exitCode = 1;
    });

  program.command('status <intentId>')
    .description('Show an escrow intent status')
    .action(async (intentId) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const { escrow, usdc } = getContracts(opts, provider);
      const decimals = await getDecimals(usdc);
      const statusNames = ['None', 'Funded', 'ProofSubmitted', 'Released', 'Refunded', 'Disputed', 'Resolved'];
      const i = await escrow.intents(intentId);
      const out = {
        intentId: String(intentId),
        buyer: i.buyer,
        seller: i.seller,
        feeBps: String(i.feeBps),
        amountRaw: i.amount.toString(),
        amount: formatAmount(i.amount, decimals),
        createdAt: i.createdAt.toString(),
        workDeadline: i.workDeadline.toString(),
        reviewDeadline: i.reviewDeadline.toString(),
        reviewPeriod: i.reviewPeriod.toString(),
        workHash: i.workHash,
        workURI: i.workURI,
        status: statusNames[Number(i.status)] || String(i.status),
        proofURI: i.proofURI,
        disputeURI: i.disputeURI
      };
      console.log(JSON.stringify(out, null, 2));
    });

  program.command('sign-offer')
    .description('Seller signs an EIP-712 work offer and writes offer JSON')
    .requiredOption('--buyer <address>', 'buyer address')
    .option('--seller <address>', 'seller address; defaults to SELLER_PRIVATE_KEY address')
    .requiredOption('--amount <amount>', 'USDC amount, decimal (0.01) or raw integer')
    .requiredOption('--work-uri <uri>', 'work URI stored on-chain')
    .option('--work-hash <hashOrText>', 'bytes32 hash or text to keccak256', 'canonical work spec')
    .option('--work-timeout <seconds>', 'work timeout seconds', '3600')
    .option('--review-period <seconds>', 'review period seconds', '3600')
    .option('--expires-in <seconds>', 'offer expiry from now', '3600')
    .option('--nonce <nonce>', 'offer nonce; defaults to timestamp+random')
    .option('--out <file>', 'output offer JSON', 'offers/offer.latest.json')
    .action(async (cmd) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const deployment = getDeployment(opts.deployment);
      const sellerWallet = getWallet(getPrivateKey('seller'), provider);
      const { usdc } = getContracts(opts, provider);
      const decimals = await getDecimals(usdc);
      const now = Math.floor(Date.now() / 1000);
      const seller = cmd.seller || sellerWallet.address;
      if (seller.toLowerCase() !== sellerWallet.address.toLowerCase()) {
        throw new Error(`--seller ${seller} does not match SELLER_PRIVATE_KEY address ${sellerWallet.address}`);
      }
      const workURIHash = ethers.keccak256(ethers.toUtf8Bytes(cmd.workUri));
      const offer = {
        schema: 'ai-work-market.offer.v0.4',
        network: deployment.network,
        chainId: deployment.chainId,
        verifyingContract: deployment.address,
        usdc: deployment.usdc,
        buyer: ethers.getAddress(cmd.buyer),
        seller: ethers.getAddress(seller),
        amountRaw: parseAmount(cmd.amount, decimals).toString(),
        workHash: asBytes32(cmd.workHash, 'workHash'),
        workURI: cmd.workUri,
        workURIHash,
        workTimeoutSeconds: String(cmd.workTimeout),
        reviewPeriodSeconds: String(cmd.reviewPeriod),
        nonce: cmd.nonce || ethers.toBigInt(ethers.randomBytes(32)).toString(),
        offerExpiresAt: String(now + Number(cmd.expiresIn)),
        createdAt: new Date().toISOString()
      };
      offer.signature = await signOfferWithWallet(sellerWallet, deployment, offer);
      offer.offerDigest = ethers.TypedDataEncoder.hash(offerDomain(deployment), offerTypes(), offerMessage(offer));
      writeJson(path.resolve(ROOT, cmd.out), offer);
      console.log(`Wrote signed offer: ${cmd.out}`);
      console.log(JSON.stringify({ offerDigest: offer.offerDigest, seller: offer.seller, buyer: offer.buyer, amountRaw: offer.amountRaw }, null, 2));
    });

  program.command('fund-offer <offerFile>')
    .description('Buyer approves USDC if needed and funds a seller-signed offer')
    .option('--no-approve', 'skip approval transaction')
    .option('--include-gas <eth>', 'also send a small native-token gas drip to the seller after funding (testnet onboarding helper)')
    .action(async (offerFile, cmd) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const buyerWallet = getWallet(getPrivateKey('buyer'), provider);
      const { deployment, escrow, usdc } = getContracts(opts, buyerWallet);
      const offer = readJson(path.resolve(ROOT, offerFile));
      if (offer.buyer.toLowerCase() !== buyerWallet.address.toLowerCase()) {
        throw new Error(`Offer buyer ${offer.buyer} does not match buyer key ${buyerWallet.address}`);
      }
      if (offer.verifyingContract.toLowerCase() !== deployment.address.toLowerCase()) {
        throw new Error(`Offer verifyingContract ${offer.verifyingContract} does not match deployment ${deployment.address}`);
      }
      const amount = BigInt(offer.amountRaw);
      if (cmd.approve) {
        const allowance = await usdc.allowance(buyerWallet.address, deployment.address);
        if (allowance < amount) {
          const tx = await usdc.approve(deployment.address, amount);
          console.log(`approve tx: ${tx.hash}`);
          await waitTx(tx);
        }
      }
      const tx = await escrow.createIntentFromSignedOffer(
        offer.seller,
        amount,
        BigInt(offer.workTimeoutSeconds),
        BigInt(offer.reviewPeriodSeconds),
        offer.workHash,
        offer.workURI,
        BigInt(offer.nonce),
        BigInt(offer.offerExpiresAt),
        offer.signature
      );
      console.log(`fund tx: ${tx.hash}`);
      const receipt = await waitTx(tx);
      let intentId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed && parsed.name === 'IntentCreated') intentId = parsed.args.intentId.toString();
        } catch { /* ignore */ }
      }
      const out = { intentId, transactionHash: tx.hash };
      if (cmd.includeGas) {
        const gasAmount = ethers.parseEther(String(cmd.includeGas));
        if (gasAmount <= 0n) throw new Error('--include-gas must be greater than 0');
        const gasTx = await buyerWallet.sendTransaction({ to: offer.seller, value: gasAmount });
        console.log(`gas drip tx: ${gasTx.hash}`);
        await waitTx(gasTx);
        out.gasDrip = { to: offer.seller, amountEth: String(cmd.includeGas), transactionHash: gasTx.hash };
      }
      console.log(JSON.stringify(out, null, 2));
    });

  program.command('submit-proof <intentId>')
    .description('Seller submits proof URI')
    .requiredOption('--proof-uri <uri>', 'proof URI')
    .action(async (intentId, cmd) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const sellerWallet = getWallet(getPrivateKey('seller'), provider);
      const { escrow } = getContracts(opts, sellerWallet);
      const tx = await escrow.submitProof(intentId, cmd.proofUri);
      console.log(`submit-proof tx: ${tx.hash}`);
      await waitTx(tx);
    });

  program.command('release <intentId>')
    .description('Buyer releases escrow payment')
    .action(async (intentId) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const buyerWallet = getWallet(getPrivateKey('buyer'), provider);
      const { escrow } = getContracts(opts, buyerWallet);
      const tx = await escrow.release(intentId);
      console.log(`release tx: ${tx.hash}`);
      await waitTx(tx);
    });

  program.command('refund <intentId>')
    .description('Buyer refunds an escrow intent')
    .action(async (intentId) => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const buyerWallet = getWallet(getPrivateKey('buyer'), provider);
      const { escrow } = getContracts(opts, buyerWallet);
      const tx = await escrow.refund(intentId);
      console.log(`refund tx: ${tx.hash}`);
      await waitTx(tx);
    });

  program.command('fees')
    .description('Show accumulated platform fees')
    .action(async () => {
      const opts = program.opts();
      const provider = getProvider(opts);
      const { escrow, usdc } = getContracts(opts, provider);
      const decimals = await getDecimals(usdc);
      const fees = await escrow.accumulatedFees();
      console.log(JSON.stringify({ raw: fees.toString(), usdc: formatAmount(fees, decimals) }, null, 2));
    });

  return program;
}

makeProgram().parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
