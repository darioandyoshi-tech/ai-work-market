# Payments Plan — AI Work Market Digital Products

Status: product pages are live-ready; payment collection is **not fully automated yet**.

## Current safe payment mode

Use **manual invoice / custom checkout** until one provider is configured.

Why:
- The deployed AI Work Market escrow is Base Sepolia testnet only; it must not be used for real production payments.
- No live Stripe/Gumroad/Lemon Squeezy/Polar checkout links are configured in this repo yet.
- No approved Base mainnet USDC receiving wallet / x402 facilitator setup is documented for production receipts.

## Recommended provider order

1. **Lemon Squeezy or Gumroad** — fastest for digital downloads, tax/VAT handling, license-like purchases.
2. **Stripe Payment Links** — best if Dario already has Stripe ready; more flexible for invoices and service upsells.
3. **Polar** — good developer-product checkout/subscriptions if account is ready.
4. **Base mainnet USDC / x402** — agent-native, but needs approved receiving wallet, production terms, and security review.

## Immediate checkout links needed

- `AGENT_COMMERCE_MARKET_MAP_CHECKOUT_URL`
- `AWM_N8N_WORKFLOW_CHECKOUT_URL`
- `X402_ESCROW_SPRINT_CHECKOUT_URL`

Until those exist, public pages should say “request invoice / custom checkout.”

## Production crypto rule

Do not collect mainnet funds through the current testnet escrow contract. Production crypto payments require a separate approved receiving setup and clear terms.
