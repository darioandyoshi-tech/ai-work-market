# MCP Agent Commerce Tools

`examples/mcp/awm-mcp-server.js` includes read-only AI Work Market tools for agent-commerce clients.

Run locally:

```bash
node examples/mcp/awm-mcp-server.js
```

Configure in an MCP client as a stdio server with command `node` and args `examples/mcp/awm-mcp-server.js`.

## Tools

### `awm_get_agent_products`

Fetches the live machine-readable product catalog from:

```text
GET /api/agent-products
```

No money movement. No secrets.

### `awm_get_payment_challenge`

Fetches a protected paid resource and returns the expected HTTP `402` payment challenge summary:

```text
GET /api/protected-resource?slug=<slug>
```

It returns product terms, checkout URL, sample URL, proof hash metadata, fulfillment state, and safety notes. It does **not** open checkout or pay.

### `awm_verify_checkout_session`

Given a Stripe Checkout Session ID (`cs_test_...` or `cs_live_...`), calls:

```text
GET /api/fulfillment-receipt?session_id=<id>
GET /api/delivery-status?session_id=<id>
```

Returns receipt and delivery status only. It does not return customer PII or paid asset URLs.

## Safety boundary

- Tools are read-only.
- They do not sign transactions.
- They do not move funds.
- They do not expose paid files.
- Stripe checkout is live for products/services.
- AI Work Market protocol escrow remains Base Sepolia testnet-only and not production escrow.
