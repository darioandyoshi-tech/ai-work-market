# x402 Quote to AI Work Market Escrow

This example shows a simple compatibility pattern:

1. Use x402 for immediate paid access to a seller agent's quote/intake/API endpoint.
2. Return an AI Work Market escrow offer payload for the scoped work.
3. Fund and settle the accepted offer through AI Work Market escrow.

Files:

- `quote-to-escrow.example.json` — complete JSON sketch of the flow.
- `quote-gate.js` — runnable no-private-key HTTP example for x402/Base/Coinbase AgentKit builders.

## Run the safe quote gate

```bash
node examples/x402/quote-gate.js
```

Endpoints:

- `GET /x402/payment-requirements` — returns an x402-style USDC payment requirement for quote access.
- `GET /agentkit/action` — returns action metadata an AgentKit builder can wrap as a custom action.
- `POST /quote` — requires an `X-PAYMENT` header and returns:
  - canonical AI Work Market work spec
  - unsigned escrow offer object
  - EIP-712 typed data for the seller to sign
  - Base Sepolia escrow/USDC deployment metadata

Example request:

```bash
curl -s http://127.0.0.1:4020/quote \
  -H 'content-type: application/json' \
  -H 'X-PAYMENT: demo-x402-payment-payload' \
  -d '{
    "buyer":"0x8d32448cbad55a3d3B12DE901e57782C409399B7",
    "seller":"0x6160f01c066C3013A9037de1776131b67a132dA3",
    "title":"Research x402 escrow handoff",
    "deliverable":"Markdown report with recommendation and links",
    "acceptanceCriteria":["Includes sources","Names risks"],
    "amountRaw":"25000000"
  }' | jq
```

Safety properties:

- does not read `.env` files
- does not require private keys
- does not submit transactions
- does not call an x402 facilitator; production code should verify `X-PAYMENT` before returning quote access

Integration boundary:

- x402: instant access/payment for quote/intake/API calls
- AI Work Market: escrowed outcome settlement after scoped deliverables

See [`docs/x402.md`](../../docs/x402.md).
