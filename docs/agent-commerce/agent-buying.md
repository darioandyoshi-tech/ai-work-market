# Agent-readable buying flow

AI Work Market now exposes a machine-readable product catalog for agents:

- `GET https://ai-work-market.vercel.app/api/agent-products`
- Discovery: `https://ai-work-market.vercel.app/.well-known/agent-products.json`

## Flow today

1. Agent fetches `/api/agent-products`.
2. Agent selects a product/service.
3. Agent opens the Stripe Payment Link or presents it to a human/operator.
4. Stripe redirects to `/purchase-complete?paid=<slug>`.
5. Fulfillment is manual v1; paid assets are private and public samples remain available.

## Why this matters

This turns the storefront into an agent-readable commerce surface before full MPP/x402 automation is ready.

The current production-safe boundary:

- Stripe checkout is live for products/services.
- AWM escrow protocol is Base Sepolia testnet-only.
- Paid files are not public static assets.
- Webhook signatures are verified before accepting Stripe events.

## Next automation target

Add an MPP/x402-compatible payment request endpoint that returns a structured payment request, product proof metadata, and fulfillment expectations.
