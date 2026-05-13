#!/usr/bin/env node
'use strict';

// xpay -> AI Work Market lifecycle bridge example.
// Safe by default: no private keys, no network calls, no transaction submission.
// It turns an xpay-style paid access event into an AWM work-order package:
// payment receipt -> scoped work spec -> seller EIP-712 typed data -> buyer funding plan.

const { ethers } = require('ethers');
const {
  loadDeployment,
  asBytes32,
  offerDomain,
  offerTypes,
  offerMessage
} = require('../../sdk');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_AMOUNT_RAW = '25000000'; // 25 USDC, 6 decimals.

function normalizeString(value, fallback = '') {
  const out = value === undefined || value === null ? fallback : String(value);
  return out.trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function safeAddress(value, fallback = ZERO_ADDRESS) {
  const raw = normalizeString(value, fallback);
  try { return ethers.getAddress(raw); } catch { return ethers.getAddress(fallback); }
}

function parseJsonArg(argv) {
  const raw = argv[2];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { throw new Error(`Invalid JSON argument: ${err.message}`); }
}

function defaultPaidAccessEvent() {
  return {
    schema: 'xpay.paid-access.event.example.v1',
    rail: 'xpay',
    eventId: 'evt_xpay_demo_001',
    payer: '0x8d32448cbad55a3d3B12DE901e57782C409399B7',
    merchant: '0x6160f01c066C3013A9037de1776131b67a132dA3',
    amountRaw: '10000',
    asset: 'USDC',
    network: 'base-sepolia',
    resource: 'mcp://seller-agent/quote/custom-research',
    description: 'Paid quote/intake access for a custom agent research job',
    metadata: {
      title: 'Research x402 escrow handoff',
      deliverable: 'Markdown report with recommendation, sources, and implementation risks',
      acceptanceCriteria: ['Includes sources', 'Names risks', 'Has concrete integration recommendation'],
      workAmountRaw: DEFAULT_AMOUNT_RAW
    }
  };
}

function buildWorkSpec(event, now = new Date()) {
  const metadata = event.metadata || {};
  const spec = {
    schema: 'ai-work-market.work-spec.v0.1',
    sourceRail: 'xpay',
    sourceEventId: normalizeString(event.eventId, 'evt_xpay_unknown'),
    sourceResource: normalizeString(event.resource, 'xpay paid resource'),
    title: normalizeString(metadata.title, normalizeString(event.description, 'Untitled xpay-triggered work')),
    buyer: safeAddress(event.payer),
    seller: safeAddress(metadata.seller || event.merchant),
    deliverable: normalizeString(metadata.deliverable, 'A proof URI or artifact package for buyer review.'),
    acceptanceCriteria: normalizeArray(metadata.acceptanceCriteria),
    proofFormat: normalizeString(metadata.proofFormat, 'https or ipfs proof URI'),
    createdAt: now.toISOString()
  };
  const canonical = JSON.stringify(spec);
  return {
    ...spec,
    canonical,
    workHash: ethers.keccak256(ethers.toUtf8Bytes(canonical)),
    workURI: `data:application/json,${encodeURIComponent(canonical)}`
  };
}

function buildUnsignedOffer({ deployment, event, workSpec, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const metadata = event.metadata || {};
  const offer = {
    schema: 'ai-work-market.offer.v0.4',
    network: deployment.network,
    chainId: deployment.chainId,
    verifyingContract: deployment.address,
    usdc: deployment.usdc,
    buyer: workSpec.buyer,
    seller: workSpec.seller,
    amountRaw: normalizeString(metadata.workAmountRaw, DEFAULT_AMOUNT_RAW),
    amountHumanHint: `${ethers.formatUnits(normalizeString(metadata.workAmountRaw, DEFAULT_AMOUNT_RAW), 6)} USDC`,
    workHash: asBytes32(workSpec.workHash, 'workHash'),
    workURI: workSpec.workURI,
    workURIHash: ethers.keccak256(ethers.toUtf8Bytes(workSpec.workURI)),
    workTimeoutSeconds: normalizeString(metadata.workTimeoutSeconds, '172800'),
    reviewPeriodSeconds: normalizeString(metadata.reviewPeriodSeconds, '86400'),
    nonce: normalizeString(metadata.nonce, ethers.toBigInt(ethers.randomBytes(32)).toString()),
    offerExpiresAt: normalizeString(metadata.offerExpiresAt, String(nowSeconds + 3600)),
    signature: '<seller signs typedData before buyer funds escrow>'
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

function bridgePaidAccessToWorkOrder(event = defaultPaidAccessEvent(), deployment = loadDeployment()) {
  const workSpec = buildWorkSpec(event);
  const unsigned = buildUnsignedOffer({ deployment, event, workSpec });
  return {
    schema: 'ai-work-market.xpay-lifecycle-bridge.v0.1',
    summary: 'Convert paid xpay quote/access into an AWM escrowed work order.',
    boundaries: {
      xpay: 'pay-per-call / paid tool access / quote gate',
      aiWorkMarket: 'pay-for-result escrow with proof/review/release',
      safety: 'example only: no private keys, no network calls, no transaction submission'
    },
    sourcePayment: {
      rail: event.rail || 'xpay',
      eventId: event.eventId,
      payer: event.payer,
      merchant: event.merchant,
      amountRaw: event.amountRaw,
      asset: event.asset,
      network: event.network,
      resource: event.resource
    },
    settlementPlan: {
      network: deployment.network,
      chainId: deployment.chainId,
      escrow: deployment.address,
      usdc: deployment.usdc,
      steps: [
        'Verify paid xpay access/receipt in the xpay app or facilitator.',
        'Seller reviews the generated work spec and signs the returned EIP-712 typed data.',
        'Buyer funds the signed AWM offer with Base Sepolia USDC.',
        'Seller submits proof URI after delivery.',
        'Buyer releases escrow, disputes, or lets timeout policy apply.'
      ]
    },
    workSpec,
    ...unsigned
  };
}

if (require.main === module) {
  const event = parseJsonArg(process.argv) || defaultPaidAccessEvent();
  console.log(JSON.stringify(bridgePaidAccessToWorkOrder(event), null, 2));
}

module.exports = {
  defaultPaidAccessEvent,
  buildWorkSpec,
  buildUnsignedOffer,
  bridgePaidAccessToWorkOrder
};
