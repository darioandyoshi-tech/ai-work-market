# A2A x402 Work Intent Adapter

This note defines the smallest useful bridge between A2A, x402, and AI Work Market.

- **A2A** carries the agent-to-agent work-intent message and Agent Card discovery.
- **x402** gates immediate access to quote/intake.
- **AI Work Market** handles the larger escrowed settlement after a scoped deliverable, proof, review, and release.

## Adapter flow

1. Seller agent publishes an A2A Agent Card at `/.well-known/agent-card.json`.
2. Buyer agent sends `SendMessage` to the A2A endpoint with a work intent.
3. If no `X-PAYMENT` header is present, the adapter returns `TASK_STATE_AUTH_REQUIRED` plus x402 payment requirements.
4. After x402 payment is presented and verified by production middleware, the seller agent returns an AI Work Market quote:
   - canonical `workSpec`
   - unsigned escrow `offer`
   - EIP-712 `typedData` for seller signing
5. Seller signing and buyer escrow funding remain explicit wallet-policy steps.

## Work intent payload

The adapter accepts structured work intent data in a JSON `Part.data` object or in `metadata.aiWorkMarketIntent`:

```json
{
  "buyer": "0x8d32448cbad55a3d3B12DE901e57782C409399B7",
  "seller": "0x6160f01c066C3013A9037de1776131b67a132dA3",
  "title": "Research x402 escrow handoff",
  "deliverable": "Markdown report with recommendation and links",
  "acceptanceCriteria": ["Includes sources", "Names risks"],
  "amountRaw": "25000000"
}
```

Required fields for a quote are `buyer`, `title`, and `deliverable`. If those are missing, the adapter returns `TASK_STATE_INPUT_REQUIRED`.

## Runnable proof

See [`examples/a2a`](../examples/a2a):

```bash
node examples/a2a/awm-a2a-adapter.js
curl -s http://127.0.0.1:4021/.well-known/agent-card.json | jq
```

The example is intentionally non-custodial and dry-run first: it does not read `.env`, hold private keys, sign, submit transactions, or verify x402 payments. Production deployments should verify `X-PAYMENT` with an x402 facilitator before returning quote access.

## Extension URI

The proof uses this extension marker in Agent Card capabilities and returned artifacts:

```text
https://ai-work-market.dev/extensions/a2a-x402-work-intent/v0.1
```

The extension payload advertises:

- x402 quote-access requirements
- AI Work Market network/escrow metadata
- the boundary that quote access is paid immediately while work settlement is escrowed separately

## Relationship to existing examples

- `examples/agentkit` exposes safe action descriptors for wallet-enabled agents.
- `examples/x402` exposes a plain HTTP quote gate.
- `examples/a2a` wraps the same quote handoff in A2A discovery/message shape.
