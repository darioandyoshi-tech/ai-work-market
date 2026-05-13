# Signed Private Delivery

AI Work Market now includes signed private-delivery API scaffolding for paid digital products.

This moves fulfillment from “manual only” toward “paid receipt → short-lived private download link” without exposing paid files in git, Vercel static hosting, public catalogs, or unauthenticated APIs.

## Endpoints

### `POST /api/private-delivery-link?session_id=<checkout-session-id>`

Verifies the Stripe Checkout Session server-side and, if paid, issues a short-lived app download URL for the product bundle.

Response states:

- `200 signed_link_issued` — session paid and private bundle configured.
- `202 kickoff_pending` — paid service purchase; no downloadable asset bundle.
- `402 checkout_not_paid` — Stripe session is not paid/complete.
- `503 delivery_signing_secret_missing` — signed delivery not configured; manual fulfillment remains active.
- `503 private_storage_not_configured` — checkout paid, but no private bundle URL configured for that product.

### `GET /api/private-delivery-download?token=<signed-token>`

Verifies the HMAC token, expiry, product slug, and bundle ID, then redirects to the configured private storage URL.

If storage is not configured, it returns a structured `503` instead of exposing any paid asset path.

## Required environment variables

```bash
# Already required for receipt verification
STRIPE_SECRET_KEY="rk_live_or_sk_live_..."

# Required before signed download links can be issued
AWM_DELIVERY_SIGNING_SECRET="at-least-32-random-bytes"

# Optional; default is 600 seconds, max 3600
AWM_DELIVERY_TOKEN_TTL_SECONDS="600"

# Optional; defaults to production origin
AWM_PUBLIC_ORIGIN="https://ai-work-market.vercel.app"

# Required before paid digital assets can be downloaded automatically
AWM_PRIVATE_DELIVERY_MANIFEST='{
  "agent-commerce-market-map-2026": {
    "bundleId": "market-map-2026-v1",
    "url": "https://private-storage.example/signed-or-gated-market-map-url"
  },
  "awm-work-intake-n8n": {
    "bundleId": "awm-work-intake-n8n-v1",
    "url": "https://private-storage.example/signed-or-gated-workflow-url"
  }
}'
```

Do not commit real private storage URLs if they reveal bucket names or long-lived access tokens. Prefer short-lived provider-native signed URLs or a private storage gateway.

## Token safety

Issued tokens include:

- Checkout Session ID binding.
- Product slug.
- Bundle ID.
- Livemode.
- Purpose: `download`.
- Issued-at and expiry timestamps.
- Random `jti`.

Tokens do **not** include customer email, name, address, phone, or full paid asset contents.

## Current boundary

- Stripe checkout is live for products/services.
- Signed delivery is code-ready, but automatic downloads require `AWM_DELIVERY_SIGNING_SECRET` and `AWM_PRIVATE_DELIVERY_MANIFEST` in Vercel.
- If either is missing, the system safely falls back to manual fulfillment.
- AI Work Market protocol escrow remains Base Sepolia testnet-only and is separate from Stripe product checkout.

## Verification

```bash
node --check api/private-delivery-link.js
node --check api/private-delivery-download.js
npm run check:private-assets
npm run check:all
```
