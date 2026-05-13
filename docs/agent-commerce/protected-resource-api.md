# Protected Resource API

Endpoint:

```text
GET https://ai-work-market.vercel.app/api/protected-resource?slug=<product-slug>
```

This is the first production-safe protected-resource flow for agent commerce.

## Unpaid request

When no valid access token is supplied, the endpoint returns HTTP `402` with:

- product ID, name, type, status, and price
- `payment.currentRail = stripe_payment_link`
- live Stripe checkout URL
- sample URL
- proof hash/verification URL when available
- fulfillment expectations
- explicit safety note that AWM protocol escrow is Base Sepolia testnet-only

It also sets:

```text
X-AI-Work-Market-Payment-Required: true
X-AI-Work-Market-Product: <slug>
Link: <checkout-url>; rel="payment"
```

## Authorized request

If `AWM_DELIVERY_TOKEN` is configured server-side and the request supplies the matching bearer token or `X-AWM-Access-Token`, the endpoint returns HTTP `200` with a non-sensitive delivery receipt.

The endpoint intentionally does **not** expose full paid files in v1. Paid assets remain private; fulfillment is manual or future signed-link based.

## Why this exists

This gives agents a real HTTP `402` resource flow today while keeping the payment rail conservative:

1. agent requests protected resource
2. server returns payment request
3. agent or operator completes Stripe checkout
4. buyer lands on `/purchase-complete`
5. seller fulfills manually

The shape is ready to evolve into Stripe MPP/x402 once machine-payment account support is enabled.
