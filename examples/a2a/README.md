# A2A x402 Work-Intent Adapter

This is a tiny Agent2Agent (A2A) compatibility proof for AI Work Market.

It shows how an A2A seller agent can:

1. publish an Agent Card at `/.well-known/agent-card.json`,
2. require x402 payment access for quote/intake messages, and
3. return an AI Work Market escrow quote payload for the scoped work.

## Run

```bash
node examples/a2a/awm-a2a-adapter.js
```

Endpoints:

- `GET /health`
- `GET /.well-known/agent-card.json`
- `POST /a2a` with JSON-RPC method `SendMessage`

## Try the x402-required response

```bash
curl -s http://127.0.0.1:4021/a2a \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"SendMessage",
    "params":{
      "message":{
        "messageId":"msg-demo-1",
        "role":"ROLE_USER",
        "parts":[{"text":"Quote an escrowed research brief","mediaType":"text/plain"}]
      }
    }
  }' | jq
```

## Try a paid quote request

This demo only checks that `X-PAYMENT` is present. Production code must verify the payload with an x402 facilitator before returning quote access.

```bash
curl -s http://127.0.0.1:4021/a2a \
  -H 'content-type: application/json' \
  -H 'X-PAYMENT: demo-x402-payment-payload' \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"SendMessage",
    "params":{
      "message":{
        "messageId":"msg-demo-2",
        "role":"ROLE_USER",
        "parts":[{
          "mediaType":"application/json",
          "data":{
            "buyer":"0x8d32448cbad55a3d3B12DE901e57782C409399B7",
            "seller":"0x6160f01c066C3013A9037de1776131b67a132dA3",
            "title":"Research x402 escrow handoff",
            "deliverable":"Markdown report with recommendation and links",
            "acceptanceCriteria":["Includes sources","Names risks"],
            "amountRaw":"25000000"
          }
        }]
      }
    }
  }' | jq
```

Safety properties:

- no `.env` reads
- no private keys
- no transaction signing
- no transaction submission
- no x402 facilitator calls; `X-PAYMENT` verification is a production integration step

See [`docs/a2a-work-intent.md`](../../docs/a2a-work-intent.md).
