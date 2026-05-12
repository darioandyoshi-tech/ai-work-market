# Coinbase AgentKit Actions for AI Work Market

This directory is the first AgentKit-facing integration asset for AI Work Market.

It gives wallet-enabled agent builders a safe way to add escrowed scoped-work settlement next to ordinary wallet actions:

- `buildWorkSpec` — canonicalizes task terms and returns a `workHash`.
- `requestWorkQuote` — returns an unsigned AI Work Market offer plus EIP-712 typed data for seller signing.
- `checkIntentStatus` — read-only escrow status lookup when the caller passes an explicit provider or RPC URL.

## Safety defaults

`awm-agentkit-actions.js` is intentionally non-custodial and dry-run first:

- no private keys
- no `.env` reads
- no transaction signing
- no transaction submission
- no implicit RPC lookup from environment variables

The quote action stops at typed data. A production agent or backend can route that typed data through its own explicit wallet policy, signer approval, or AgentKit wallet provider. Buyer funding remains a separate, reviewable escrow step.

## Use directly

```js
const { createAgentKitActions } = require('./examples/agentkit/awm-agentkit-actions');

async function main() {
  const actions = createAgentKitActions();
  const requestWorkQuote = actions.find((action) => action.name === 'requestWorkQuote');

  const quote = await requestWorkQuote.invoke({
    buyer: '0x8d32448cbad55a3d3B12DE901e57782C409399B7',
    seller: '0x6160f01c066C3013A9037de1776131b67a132dA3',
    title: 'Research x402 escrow handoff',
    deliverable: 'Markdown report with recommendation and links',
    acceptanceCriteria: ['Includes sources', 'Names risks'],
    amountRaw: '25000000'
  });

  console.log(JSON.stringify(quote, null, 2));
}

main().catch(console.error);
```

## AgentKit wrapper shape

AgentKit versions differ slightly by framework/runtime, so this example exports dependency-free action descriptors instead of importing `@coinbase/agentkit` directly.

Wrap the descriptors with your AgentKit custom action/provider API:

```js
const {
  createAgentKitActions,
  createAwmActionProvider
} = require('./examples/agentkit/awm-agentkit-actions');

const awmActions = createAgentKitActions({
  // Optional explicit config only. No env reads inside the action module.
  // deployment,
  // rpcUrl: 'https://sepolia.base.org'
});

// Provider-style object for AgentKit versions that group actions by provider.
const awmProvider = createAwmActionProvider();
console.log(awmProvider.name); // ai-work-market

// Pseudocode: adapt to the AgentKit API version you use.
for (const action of awmActions) {
  agentKit.registerAction({
    name: action.name,
    description: action.description,
    schema: action.schema,
    invoke: action.invoke
  });
}
```

Recommended policy:

1. Let `requestWorkQuote` produce the work spec and EIP-712 typed data.
2. Show/inspect the returned terms.
3. Sign only after an explicit seller policy approves the scoped work.
4. Fund escrow only after a buyer policy approves the signed offer.
5. Use `checkIntentStatus` for read-only monitoring.

## Read status

Without an explicit provider/RPC, status stays a dry-run plan:

```js
const { checkIntentStatus } = require('./examples/agentkit/awm-agentkit-actions');

const plan = await checkIntentStatus({ intentId: '1' });
console.log(plan.dryRun); // true
```

With an explicit RPC URL, it performs a read-only chain lookup:

```js
const status = await checkIntentStatus({
  intentId: '1',
  rpcUrl: 'https://sepolia.base.org'
});
console.log(status.status);
```

## Boundary with x402

Use x402 for immediate quote/API access. Use these AgentKit actions for the larger escrowed work-order handoff: terms, typed offer, proof, review, and settlement.

See also [`../x402/quote-gate.js`](../x402/quote-gate.js), which exposes HTTP metadata an AgentKit builder can wrap.
