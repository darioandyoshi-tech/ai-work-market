# Payment Request API

Endpoint:

```text
GET https://ai-work-market.vercel.app/api/payment-request?slug=<product-slug>
POST https://ai-work-market.vercel.app/api/payment-request
```

POST body:

```json
{ "slug": "agent-commerce-market-map-2026" }
```

The endpoint returns HTTP `402` with a structured JSON payment request. Today the active rail is `stripe_payment_link`; the response is intentionally shaped so it can evolve toward Stripe MPP and x402.

## Example

```bash
curl -i 'https://ai-work-market.vercel.app/api/payment-request?slug=agent-commerce-market-map-2026'
```

Response includes:

- product ID/name/type/status
- price in USD
- Stripe checkout URL
- post-checkout fulfillment URL
- sample URL
- proof hash / verification URL where applicable
- safety note that Base Sepolia escrow is testnet-only

## Current boundary

This is not yet a full MPP/x402 automatic settlement endpoint. It is the payment-request surface that agents can consume now, while the production machine-payment rail is developed.
