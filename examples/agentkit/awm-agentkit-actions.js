'use strict';

// Coinbase AgentKit-facing actions for AI Work Market.
// Safe by default:
// - no private keys
// - no .env reads
// - no transaction signing or submission
// - checkIntentStatus is read-only and only uses an explicit provider/RPC supplied by the caller
//
// These exports are intentionally framework-light so AgentKit builders can wrap them in their
// preferred action-provider style without adding dependencies to this repository.

const { ethers } = require('ethers');
const {
  loadDeployment,
  providerFromRpc,
  asBytes32,
  offerDomain,
  offerTypes,
  offerMessage,
  getIntentStatus: sdkGetIntentStatus
} = require('../../sdk');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_AMOUNT_RAW = '25000000'; // 25 USDC with 6 decimals.
const DEFAULT_WORK_TIMEOUT_SECONDS = '172800'; // 48 hours.
const DEFAULT_REVIEW_PERIOD_SECONDS = '86400'; // 24 hours.

function normalizeString(value, fallback = '') {
  const out = value === undefined || value === null ? fallback : String(value);
  return out.trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function getDeploymentForAction(options = {}) {
  return options.deployment || loadDeployment(options.deploymentFile);
}

function nowIso(options = {}) {
  const clock = options.now || new Date();
  if (clock instanceof Date) return clock.toISOString();
  return new Date(clock).toISOString();
}

function nowSeconds(options = {}) {
  const clock = options.now || new Date();
  const millis = clock instanceof Date ? clock.getTime() : new Date(clock).getTime();
  return Math.floor(millis / 1000);
}

function buildWorkSpec(input = {}, options = {}) {
  const spec = {
    schema: 'ai-work-market.work-spec.v0.1',
    title: normalizeString(input.title || input.task, 'Untitled agent task'),
    buyer: normalizeString(input.buyer, ZERO_ADDRESS),
    deliverable: normalizeString(input.deliverable, 'A concrete proof artifact for buyer review.'),
    acceptanceCriteria: normalizeArray(input.acceptanceCriteria),
    proofFormat: normalizeString(input.proofFormat, 'https or ipfs proof URI'),
    createdAt: nowIso(options)
  };

  if (input.context) spec.context = normalizeString(input.context);
  if (input.deadline) spec.deadline = normalizeString(input.deadline);

  const canonical = JSON.stringify(spec);
  return {
    ...spec,
    canonical,
    workHash: ethers.keccak256(ethers.toUtf8Bytes(canonical)),
    workURI: input.workURI || `data:application/json,${encodeURIComponent(canonical)}`
  };
}

function buildUnsignedOffer({ deployment, workSpec, input = {}, options = {} }) {
  const buyer = ethers.getAddress(normalizeString(input.buyer, ZERO_ADDRESS));
  const defaultSeller = deployment.e2e?.seller || deployment.owner || ZERO_ADDRESS;
  const seller = ethers.getAddress(normalizeString(input.seller, defaultSeller));
  const amountRaw = normalizeString(input.amountRaw, DEFAULT_AMOUNT_RAW);
  const workTimeoutSeconds = normalizeString(input.workTimeoutSeconds, DEFAULT_WORK_TIMEOUT_SECONDS);
  const reviewPeriodSeconds = normalizeString(input.reviewPeriodSeconds, DEFAULT_REVIEW_PERIOD_SECONDS);
  const offerExpiresAt = normalizeString(input.offerExpiresAt, String(nowSeconds(options) + 3600));
  const nonce = normalizeString(input.nonce, ethers.toBigInt(ethers.randomBytes(32)).toString());

  const offer = {
    schema: 'ai-work-market.offer.v0.4',
    network: deployment.network,
    chainId: deployment.chainId,
    verifyingContract: deployment.address,
    usdc: deployment.usdc,
    buyer,
    seller,
    amountRaw,
    amountHumanHint: `${ethers.formatUnits(amountRaw, 6)} USDC`,
    workHash: asBytes32(workSpec.workHash, 'workHash'),
    workURI: workSpec.workURI,
    workURIHash: ethers.keccak256(ethers.toUtf8Bytes(workSpec.workURI)),
    workTimeoutSeconds,
    reviewPeriodSeconds,
    nonce,
    offerExpiresAt,
    signature: '<seller signs typedData.message; no signature is produced by this action>'
  };

  return {
    offer,
    typedData: {
      domain: offerDomain(deployment),
      types: offerTypes(),
      primaryType: 'SellerOffer',
      message: offerMessage(offer)
    }
  };
}

async function requestWorkQuote(input = {}, options = {}) {
  const deployment = getDeploymentForAction(options);
  const workSpec = buildWorkSpec(input, options);
  const unsigned = buildUnsignedOffer({ deployment, workSpec, input, options });

  return {
    schema: 'ai-work-market.agentkit.quote-response.v0.1',
    safety: {
      mode: 'non-custodial-dry-run',
      readsEnv: false,
      signsTransactions: false,
      submitsTransactions: false,
      privateKeysRequired: false
    },
    settlement: {
      rail: 'ai-work-market',
      network: deployment.network,
      chainId: deployment.chainId,
      escrow: deployment.address,
      usdc: deployment.usdc,
      nextStep: 'seller signs typedData off-agent or with explicit wallet policy; buyer funds escrow separately after review'
    },
    workSpec,
    ...unsigned
  };
}

async function checkIntentStatus(input = {}, options = {}) {
  const intentId = input.intentId ?? options.intentId;
  if (intentId === undefined || intentId === null || String(intentId).trim() === '') {
    throw new Error('Missing intentId');
  }

  const deployment = getDeploymentForAction(options);
  const provider = options.provider || (input.rpcUrl || options.rpcUrl ? providerFromRpc(input.rpcUrl || options.rpcUrl) : null);

  if (!provider) {
    return {
      schema: 'ai-work-market.agentkit.status-plan.v0.1',
      dryRun: true,
      intentId: String(intentId),
      network: deployment.network,
      chainId: deployment.chainId,
      escrow: deployment.address,
      message: 'Pass an explicit provider or rpcUrl to perform the read-only status lookup. This action never reads RPC URLs from .env.'
    };
  }

  return sdkGetIntentStatus({ provider, deployment, intentId });
}

const actionSchemas = {
  buildWorkSpec: {
    type: 'object',
    required: ['title', 'deliverable'],
    properties: {
      buyer: { type: 'string', description: 'Buyer wallet address; optional for draft specs.' },
      title: { type: 'string' },
      deliverable: { type: 'string' },
      acceptanceCriteria: { type: 'array', items: { type: 'string' } },
      proofFormat: { type: 'string' },
      context: { type: 'string' },
      deadline: { type: 'string' },
      workURI: { type: 'string', description: 'Optional externally hosted canonical work spec URI.' }
    }
  },
  requestWorkQuote: {
    type: 'object',
    required: ['buyer', 'title', 'deliverable'],
    properties: {
      buyer: { type: 'string', description: 'Buyer wallet address that would fund escrow.' },
      seller: { type: 'string', description: 'Seller wallet address that will sign typed data.' },
      title: { type: 'string' },
      deliverable: { type: 'string' },
      acceptanceCriteria: { type: 'array', items: { type: 'string' } },
      proofFormat: { type: 'string' },
      amountRaw: { type: 'string', description: 'USDC raw units, 6 decimals.' },
      workTimeoutSeconds: { type: 'string' },
      reviewPeriodSeconds: { type: 'string' },
      offerExpiresAt: { type: 'string' },
      nonce: { type: 'string' }
    }
  },
  checkIntentStatus: {
    type: 'object',
    required: ['intentId'],
    properties: {
      intentId: { type: 'string' },
      rpcUrl: { type: 'string', description: 'Explicit RPC URL for a read-only lookup; not read from env.' }
    }
  }
};

function createAgentKitActions(options = {}) {
  return [
    {
      name: 'buildWorkSpec',
      description: 'Build a canonical AI Work Market work spec and hash. No wallet access or transactions.',
      schema: actionSchemas.buildWorkSpec,
      invoke: (input) => buildWorkSpec(input, options)
    },
    {
      name: 'requestWorkQuote',
      description: 'Return a non-custodial AI Work Market quote: canonical work spec, unsigned offer, and EIP-712 typed data for seller signing.',
      schema: actionSchemas.requestWorkQuote,
      invoke: (input) => requestWorkQuote(input, options)
    },
    {
      name: 'checkIntentStatus',
      description: 'Read an AI Work Market escrow intent status using an explicit provider/RPC. No signing or transactions.',
      schema: actionSchemas.checkIntentStatus,
      invoke: (input) => checkIntentStatus(input, options)
    }
  ];
}

function createAwmActionProvider(options = {}) {
  return {
    name: 'ai-work-market',
    supportsNetwork: (network) => {
      if (!network) return true;
      const deployment = getDeploymentForAction(options);
      const networkId = network.chainId ?? network.id;
      return networkId === undefined || Number(networkId) === Number(deployment.chainId);
    },
    getActions: () => createAgentKitActions(options)
  };
}

module.exports = {
  ZERO_ADDRESS,
  DEFAULT_AMOUNT_RAW,
  DEFAULT_WORK_TIMEOUT_SECONDS,
  DEFAULT_REVIEW_PERIOD_SECONDS,
  actionSchemas,
  buildWorkSpec,
  requestWorkQuote,
  checkIntentStatus,
  createAgentKitActions,
  createAwmActionProvider
};
