# Private Delivery Plan

Status: design-ready. Current production fulfillment remains manual. Do not serve paid files from `products/` or any public static path.

## Goals

- Deliver paid digital assets only after a verified Stripe Checkout Session.
- Keep full product files out of git, Vercel static hosting, public catalogs, and public APIs.
- Avoid leaking customer PII in URLs, logs, receipts, or browser-visible JSON.
- Support a clean migration from manual fulfillment v1 to signed private downloads.

## Current safe boundary

Public surfaces may expose:

- Storefront/product copy and samples.
- Checkout links.
- Product slugs, names, prices, public hashes, and sanitized proof summaries.
- Receipt/delivery status that confirms payment state without customer details.

Public surfaces must not expose:

- Full research packet files.
- Full workflow JSON/setup/test payloads.
- Raw Stripe customer email/name/address/phone.
- Long-lived storage object URLs.
- Stripe secrets, webhook secrets, signing keys, or private asset bucket names if avoidable.

## Proposed signed-link flow

1. Buyer pays via Stripe Payment Link or Checkout.
2. Stripe redirects to `/purchase-complete?paid=<slug>&session_id={CHECKOUT_SESSION_ID}`.
3. Browser calls `/api/fulfillment-receipt` and `/api/delivery-status` to show non-sensitive payment/delivery state.
4. A Stripe webhook receives `checkout.session.completed`, verifies `STRIPE_WEBHOOK_SECRET`, and creates a delivery record keyed by Checkout Session ID.
5. Buyer requests a download link from a future endpoint such as `POST /api/private-delivery-link` with the Checkout Session ID.
6. Server re-fetches the Checkout Session from Stripe, confirms `payment_status=paid`, maps the session to a product, checks the delivery record, and issues a short-lived signed URL for only that product's private asset bundle.
7. Download happens from private object storage through the signed URL. The app never places the asset under public static hosting.

## Token scope

Each signed token/link must be scoped to:

- `checkout_session_id`: the exact Stripe Checkout Session ID (`cs_live_...` or `cs_test_...`).
- `product_slug`: one catalog product slug mapped from Stripe metadata or Payment Link ID.
- `asset_bundle_id`: a server-side bundle identifier, not a public file path.
- `livemode`: must match the session mode; test sessions cannot unlock live assets.
- `purpose`: `download`.
- Optional `nonce`/`jti`: unique delivery-token ID for audit and replay tracking.

Do not include customer email or name in the token body or query string.

## Expiry and replay controls

Recommended default:

- Signed link TTL: 10 minutes.
- Max downloads per issued link: 1-3 attempts to handle interrupted downloads.
- Delivery-token issuance window: allow re-issuing from a paid session for 7 days, then require manual support.
- Clock skew: <= 60 seconds.

Store token hashes, not raw tokens. A stolen token should become useless quickly.

## Stripe session binding

The server must bind delivery to Stripe, not to user-provided product query params:

- Validate session ID format before hitting Stripe.
- Fetch the Checkout Session server-side with `STRIPE_SECRET_KEY`.
- Require `payment_status === 'paid'` or equivalent final paid state.
- Map product from trusted session metadata first, then trusted Payment Link ID fallback.
- Ignore `paid=<slug>` from the redirect for authorization; it is only display context.
- Reject unknown Payment Links or slugs.
- Verify webhook signatures before creating delivery records.

## Product mapping

Maintain a private mapping from public product slugs to private storage bundles:

```json
{
  "agent-commerce-market-map-2026": {
    "bundleId": "market-map-2026-v1",
    "files": ["packet.md", "source-index.md"]
  },
  "awm-work-intake-n8n": {
    "bundleId": "awm-work-intake-n8n-v1",
    "files": ["workflow.json", "setup.md", "test-data.json"]
  }
}
```

This mapping should live server-side only, preferably in encrypted config or a private database/table. The public `products/catalog.json` should describe paid contents, not private paths.

## Storage design

Use private object storage, not Vercel static files:

- S3/R2/Supabase Storage private bucket are acceptable.
- Object keys should not contain buyer PII.
- Prefer bundle/version keys such as `bundles/market-map-2026/v1/packet.md`.
- Generate provider-native signed URLs server-side.
- Keep paid local source files ignored by both git and Vercel deploys.

## Audit log

Log delivery events without PII:

- `event`: `delivery.link_issued`, `delivery.download_started`, `delivery.download_completed`, `delivery.denied`.
- `checkoutSessionIdHash`: HMAC/SHA-256 hash of the session ID.
- `productSlug`.
- `bundleId`.
- `tokenIdHash`.
- `livemode`.
- `result` and reason code.
- `createdAt` ISO timestamp.

Avoid logging raw signed URLs, customer emails, IP addresses unless required for fraud controls, and any full asset contents.

## API scaffolding now

Current safe endpoints:

- `GET /api/fulfillment-receipt?session_id=<id>` verifies Stripe and returns receipt metadata only.
- `GET /api/delivery-status?session_id=<id>` verifies Stripe and returns delivery state only; it never returns asset URLs.

Future endpoint after private storage exists:

- `POST /api/private-delivery-link` returns a signed URL only after Stripe/session/product validation and audit logging.

## Deployment checks

Before deploying, run:

```bash
node --check api/delivery-status.js
node scripts/verify-private-assets.js
```

The verification script checks that paid local assets are untracked, ignored by Vercel, and absent from public catalog paths.
