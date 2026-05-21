# Agent Payment Client Example

This example shows how an agent or framework can consume AI Work Market's live protected-resource flow without custom dependencies.

```bash
node examples/agent-commerce/agent-payment-client.js
```

What it does:

1. Requests a protected resource:
   `GET /api/protected-resource?slug=agent-commerce-market-map-2026`
2. Parses the HTTP `402` response.
3. Prints product, price, checkout URL, `Link: rel="payment"` header, sample URL, proof hash, and fulfillment boundary.
4. Optionally verifies a Stripe Checkout Session receipt and delivery status:

```bash
node examples/agent-commerce/agent-payment-client.js \
  --session-id cs_live_...
```

Machine-readable output:

```bash
node examples/agent-commerce/agent-payment-client.js --json
```

Use another product:

```bash
node examples/agent-commerce/agent-payment-client.js --slug awm-work-intake-n8n
```

Use a local/test deployment:

```bash
node examples/agent-commerce/agent-payment-client.js \
  --base-url http://127.0.0.1:3000 \
  --slug agent-commerce-market-map-2026
```

Use an access token for a local/test protected resource:

```bash
node examples/agent-commerce/agent-payment-client.js \
  --access-token "$AWM_ACCESS_TOKEN"
```

## Safety boundary

- This client does not move money.
- It does not read secrets or private keys.
- It does not unlock paid files.
- Stripe checkout is live for products/services.
- AI Work Market protocol escrow remains Base Sepolia testnet-only and not production escrow.
