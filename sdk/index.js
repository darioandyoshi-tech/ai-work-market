const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DEPLOYMENT = path.join(ROOT, 'deployments', 'base-sepolia.json');
const DEFAULT_ARTIFACT = path.join(ROOT, 'artifacts', 'AgentWorkEscrow.json');

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)'
];

const STATUS_NAMES = ['None', 'Funded', 'ProofSubmitted', 'Released', 'Refunded', 'Disputed', 'Resolved'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function loadDeployment(file = DEFAULT_DEPLOYMENT) {
  const deployment = readJson(file);
  if (!deployment.address || !deployment.usdc || !deployment.chainId) {
    throw new Error(`Invalid deployment file: ${file}`);
  }
  return deployment;
}

function loadAbi(file = DEFAULT_ARTIFACT) {
  return readJson(file).abi;
}

function providerFromRpc(rpcUrl = 'https://sepolia.base.org') {
  return new ethers.JsonRpcProvider(rpcUrl);
}

function walletFromPrivateKey(privateKey, provider) {
  if (!privateKey) throw new Error('Missing private key');
  return new ethers.Wallet(privateKey, provider);
}

function getContracts({ deployment = loadDeployment(), signerOrProvider, abi = loadAbi() }) {
  if (!signerOrProvider) throw new Error('Missing signerOrProvider');
  return {
    deployment,
    escrow: new ethers.Contract(deployment.address, abi, signerOrProvider),
    usdc: new ethers.Contract(deployment.usdc, USDC_ABI, signerOrProvider)
  };
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

function asBytes32(value, label = 'value') {
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

async function buildSignedOffer({ sellerWallet, deployment, buyer, amount, workURI, workHash = 'canonical work spec', workTimeoutSeconds = 3600, reviewPeriodSeconds = 3600, expiresInSeconds = 3600, nonce, decimals = 6 }) {
  if (!sellerWallet) throw new Error('Missing sellerWallet');
  if (!deployment) throw new Error('Missing deployment');
  const now = Math.floor(Date.now() / 1000);
  const offer = {
    schema: 'ai-work-market.offer.v0.4',
    network: deployment.network,
    chainId: deployment.chainId,
    verifyingContract: deployment.address,
    usdc: deployment.usdc,
    buyer: ethers.getAddress(buyer),
    seller: ethers.getAddress(sellerWallet.address),
    amountRaw: parseAmount(amount, decimals).toString(),
    workHash: asBytes32(workHash, 'workHash'),
    workURI,
    workURIHash: ethers.keccak256(ethers.toUtf8Bytes(workURI)),
    workTimeoutSeconds: String(workTimeoutSeconds),
    reviewPeriodSeconds: String(reviewPeriodSeconds),
    nonce: nonce || ethers.toBigInt(ethers.randomBytes(32)).toString(),
    offerExpiresAt: String(now + Number(expiresInSeconds)),
    createdAt: new Date().toISOString()
  };
  offer.signature = await signOfferWithWallet(sellerWallet, deployment, offer);
  offer.offerDigest = ethers.TypedDataEncoder.hash(offerDomain(deployment), offerTypes(), offerMessage(offer));
  return offer;
}

async function waitTx(tx, settleMs = 1500) {
  const receipt = await tx.wait();
  if (settleMs) await new Promise((resolve) => setTimeout(resolve, settleMs));
  return receipt;
}

async function fundSignedOffer({ buyerWallet, deployment, offer, approve = true, settleMs = 1500 }) {
  if (!buyerWallet) throw new Error('Missing buyerWallet');
  if (offer.buyer.toLowerCase() !== buyerWallet.address.toLowerCase()) {
    throw new Error(`Offer buyer ${offer.buyer} does not match buyer wallet ${buyerWallet.address}`);
  }
  if (offer.verifyingContract.toLowerCase() !== deployment.address.toLowerCase()) {
    throw new Error(`Offer verifyingContract ${offer.verifyingContract} does not match deployment ${deployment.address}`);
  }
  const { escrow, usdc } = getContracts({ deployment, signerOrProvider: buyerWallet });
  const amount = BigInt(offer.amountRaw);
  let approveTxHash = null;
  if (approve) {
    const allowance = await usdc.allowance(buyerWallet.address, deployment.address);
    if (allowance < amount) {
      const approveTx = await usdc.approve(deployment.address, amount);
      approveTxHash = approveTx.hash;
      await waitTx(approveTx, settleMs);
    }
  }
  const fundTx = await escrow.createIntentFromSignedOffer(
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
  const receipt = await waitTx(fundTx, settleMs);
  let intentId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = escrow.interface.parseLog(log);
      if (parsed && parsed.name === 'IntentCreated') intentId = parsed.args.intentId.toString();
    } catch { /* ignore unrelated logs */ }
  }
  return { intentId, approveTxHash, fundTxHash: fundTx.hash, receipt };
}

async function getIntentStatus({ provider, deployment, intentId }) {
  const { escrow, usdc } = getContracts({ deployment, signerOrProvider: provider });
  const decimals = await getDecimals(usdc);
  const i = await escrow.intents(intentId);
  return {
    intentId: String(intentId),
    buyer: i.buyer,
    seller: i.seller,
    feeBps: i.feeBps.toString(),
    amountRaw: i.amount.toString(),
    amount: formatAmount(i.amount, decimals),
    createdAt: i.createdAt.toString(),
    workDeadline: i.workDeadline.toString(),
    reviewDeadline: i.reviewDeadline.toString(),
    reviewPeriod: i.reviewPeriod.toString(),
    workHash: i.workHash,
    workURI: i.workURI,
    status: STATUS_NAMES[Number(i.status)] || String(i.status),
    proofURI: i.proofURI,
    disputeURI: i.disputeURI
  };
}

module.exports = {
  DEFAULT_DEPLOYMENT,
  DEFAULT_ARTIFACT,
  USDC_ABI,
  STATUS_NAMES,
  readJson,
  writeJson,
  loadDeployment,
  loadAbi,
  providerFromRpc,
  walletFromPrivateKey,
  getContracts,
  getDecimals,
  parseAmount,
  formatAmount,
  asBytes32,
  offerDomain,
  offerTypes,
  offerMessage,
  signOfferWithWallet,
  buildSignedOffer,
  waitTx,
  fundSignedOffer,
  getIntentStatus
};
