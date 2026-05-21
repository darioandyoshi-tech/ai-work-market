# xpay to AI Work Market Lifecycle Bridge

This is a safe reference bridge for teams using xpay-style paid access, MCP tools, smart proxy, or x402 payment rails.

The split:

- **xpay:** pay-per-call, paid quote access, MCP/tool monetization, spending controls.
- **AI Work Market:** pay-for-result lifecycle: signed work terms, escrow, proof URI, review, release/refund/dispute.

## Run

```bash
node examples/xpay/lifecycle-bridge.js | jq
```

You can also pass a JSON paid-access event:

```bash
node examples/xpay/lifecycle-bridge.js '{
  "eventId":"evt_xpay_demo_002",
  "payer":"0x8d32448cbad55a3d3B12DE901e57782C409399B7",
  "merchant":"0x6160f01c066C3013A9037de1776131b67a132dA3",
  "amountRaw":"10000",
  "asset":"USDC",
  "network":"base-sepolia",
  "resource":"mcp://seller-agent/quote/custom-task",
  "metadata":{
    "title":"Build an xpay to escrow bridge",
    "deliverable":"Working demo and runbook",
    "acceptanceCriteria":["No private keys", "Testnet only", "Clear proof URI"],
    "workAmountRaw":"25000000"
  }
}' | jq
```

## Output

The script returns:

- source payment summary
- canonical AWM work spec
- `workHash` and data URI `workURI`
- unsigned AWM seller offer
- EIP-712 typed data for seller signing
- buyer funding/proof/release runbook

## Safety boundaries

- No private keys are read.
- No `.env` file is loaded.
- No xpay facilitator or x402 endpoint is called.
- No transaction is submitted.
- AWM escrow remains Base Sepolia testnet-only / unaudited in this demo.

Production integration should verify the xpay receipt/payment event before generating or accepting an AWM work order.
