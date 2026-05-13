# Signed Private Delivery Review

Status: recommendation ready. Reviewed: 2026-05-12 CDT.

## Recommendation

Build the smallest safe v1 as a **Stripe-verified signed-link issuer**. Keep current manual fulfillment live until private object storage and a server-side bundle map exist.

Do **not** move paid assets into any public path, public catalog field, browser JSON, or long-lived URL. The first production implementation should add only one customer-facing delivery endpoint plus a tiny server-side asset map.

## Current state reviewed

- `api/fulfillment-receipt.js`
  - Verifies a Checkout Session via `STRIPE_SECRET_KEY`.
  - Maps products from trusted Stripe metadata first, then known Payment Link ID fallback.
  - Returns payment/product/fulfillment metadata only.
  - Uses `cache-control: private, no-store` and does not return customer PII or asset URLs.
- `api/delivery-status.js`
  - Verifies a Checkout Session the same way.
  - Returns locked/manual delivery state only.
  - Explicitly reports `privateDownloadConfigured: false`, `signedLinkAvailable: false`, and `noAssetUrlsReturned: true`.
- `docs/revenue/private-delivery-plan.md`
  - Already defines the right safety model: Stripe-bound authorization, short TTL, private storage, no PII in tokens/URLs, hashed audit IDs.
- `products/catalog.json` and `products/payment-links.json`
  - Public catalog exposes slugs, names, prices, checkout URLs, samples, and public proof metadata.
  - Payment Link IDs provide a trusted fallback mapping from Stripe session to product.
  - Catalog does not expose private paid file paths for the six paid fulfillment assets.
- `.vercelignore`
  - Correctly excludes the full paid assets currently checked by `scripts/verify-private-assets.js`.
  - Current gate passed: `npm run check:private-assets`.

## Smallest safe implementation

Add:

1. Private object storage bucket containing paid asset bundles.
2. Server-only bundle mapping from product slug to storage object key(s).
3. `POST /api/private-delivery-link` to issue short-lived signed URLs after Stripe verification.
4. Minimal audit logging with hashed session/token IDs and no PII.

Defer:

- Customer accounts/login.
- Durable download history UI.
- Per-customer entitlement database unless replay limits require it.
- Webhook-created delivery records as a hard dependency for v1. The endpoint can safely re-fetch Stripe Checkout Session on demand, then add webhook-backed records later.

## Required environment variables

Existing:

- `STRIPE_SECRET_KEY` — required to fetch Checkout Sessions server-side.
- `STRIPE_WEBHOOK_SECRET` — keep for webhook verification; not required for the first on-demand signed-link endpoint if Stripe is re-fetched every request.

New:

- `PRIVATE_DELIVERY_SIGNING_SECRET` — HMAC secret for hashing/auditing issued token IDs and session IDs. Do not expose to browser.
- `PRIVATE_DELIVERY_TTL_SECONDS` — default `600`.
- `PRIVATE_DELIVERY_MAX_DOWNLOADS` — default `3` if token redemption is tracked; otherwise omit for provider-native signed URLs.
- Storage provider credentials, one set only:
  - S3/R2: `PRIVATE_ASSET_BUCKET`, `PRIVATE_ASSET_REGION`, `PRIVATE_ASSET_ACCESS_KEY_ID`, `PRIVATE_ASSET_SECRET_ACCESS_KEY`, optional `PRIVATE_ASSET_ENDPOINT`.
  - Supabase Storage: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVATE_ASSET_BUCKET`.
- `PRIVATE_ASSET_BUNDLE_MAP_JSON` or a private DB table name/key containing slug-to-bundle mapping. This must not live in public catalog JSON.

Do not add env vars containing customer email, local filesystem paths, or public signed URL prefixes.

## Endpoint behavior: `POST /api/private-delivery-link`

Request body:

```json
{
  "session_id": "cs_live_..."
}
```

Rules:

1. Accept `POST` only. Return `405` for other methods.
2. Validate `session_id` with the existing `cs_(test|live)_...` allowlist before any Stripe request.
3. Fetch `/v1/checkout/sessions/{session_id}` using `STRIPE_SECRET_KEY`.
4. Require `payment_status === "paid"` or an equivalent final paid state already accepted by existing receipt/status endpoints.
5. Map product from trusted session metadata, then known `payment_link` fallback. Never authorize from the redirect `paid=<slug>` query param.
6. Reject service products such as `x402-escrow-integration-sprint` with `409 service_manual_delivery` unless a private bundle is explicitly configured.
7. Look up `product.slug` in the private bundle map.
8. Ensure `session.livemode` matches the bundle environment. Test sessions must not unlock live bundles.
9. Generate a provider-native signed URL for one bundle/archive object or a server-generated zip manifest.
10. Return only:

```json
{
  "schema": "ai-work-market.private-delivery-link.v1",
  "product": { "id": "awm-work-intake-n8n", "name": "..." },
  "delivery": {
    "url": "https://storage-provider-signed-url...",
    "expiresAt": "2026-05-13T03:00:00.000Z",
    "ttlSeconds": 600
  }
}
```

Response codes:

- `200` — signed link issued.
- `400` — missing/invalid session ID.
- `402` — Checkout Session is not paid.
- `404` — unknown product/session mapping.
- `409` — product has no private bundle or is manual service delivery.
- `503` — missing Stripe/storage/signing configuration.

Headers:

- `content-type: application/json; charset=utf-8`
- `cache-control: private, no-store`

Never return customer email/name/address/phone, raw storage keys, bucket names, local paths, audit token hashes, or multiple unrelated asset URLs.

## Private bundle map

Keep server-only, for example:

```json
{
  "agent-commerce-market-map-2026": {
    "bundleId": "market-map-2026-v1",
    "objectKey": "bundles/market-map-2026/v1/agent-commerce-market-map-2026.zip",
    "livemode": true
  },
  "awm-work-intake-n8n": {
    "bundleId": "awm-work-intake-n8n-v1",
    "objectKey": "bundles/awm-work-intake-n8n/v1/awm-work-intake-n8n.zip",
    "livemode": true
  }
}
```

Store object keys without PII. Prefer one zip per product/version for v1; it keeps signing and download behavior simple.

## Tests and deployment gates

Keep existing gate:

```bash
npm run check:private-assets
```

Add endpoint syntax and unit/smoke tests:

```bash
node --check api/private-delivery-link.js
node scripts/test-private-delivery-link.js
```

Test cases:

- Rejects non-POST methods with `405`.
- Rejects missing or malformed `session_id` before Stripe is called.
- Returns `503` when `STRIPE_SECRET_KEY` is missing.
- Returns `402` for unpaid/incomplete sessions.
- Returns `404` for paid sessions that do not map to a known product.
- Returns `409` for known products with no configured private bundle.
- Returns `200` for paid mapped digital products with a configured bundle.
- Response includes no customer PII, no storage bucket name, no object key, no local file path.
- Sets `cache-control: private, no-store`.
- Test-mode session cannot receive a live bundle.
- Public catalog and agent-products API still contain only samples/proof metadata, never paid asset paths.
- `scripts/verify-private-assets.js` still passes after any product catalog update.

Use mocked Stripe/storage clients for CI. Run one manual live-mode smoke test only after storage credentials are configured, using a low-risk test product or Stripe test-mode equivalent.

## Boundaries

Do not implement signed delivery by:

- Moving paid files into `public/`, `products/`, or any Vercel static deploy path.
- Returning GitHub raw URLs, Vercel Blob public URLs, or long-lived storage URLs.
- Encoding customer PII in tokens, object keys, query strings, logs, or bundle names.
- Trusting `paid=<slug>` from `/purchase-complete` for authorization.
- Letting `cs_test_...` sessions unlock live paid assets.
- Adding broad directory listings or a generic `file` query param.
- Logging raw signed URLs or full Checkout Session/customer objects.

## Implementation order

1. Create private storage bucket and upload two digital-product zip bundles.
2. Add private slug-to-bundle map in env/private DB.
3. Add `api/private-delivery-link.js` using existing `safeSessionId`, Stripe fetch, and product mapping patterns.
4. Add tests/smoke script for denial cases and one success case with mocked storage signing.
5. Update `api/delivery-status.js` to return `privateDownloadConfigured: true` and `signedLinkAvailable: true` only for paid digital products with configured bundles.
6. Update purchase-complete UI to show a download button that calls the new endpoint.
7. Keep manual fallback messaging and support path in place.

This keeps authorization Stripe-bound, assets private, browser-visible data minimal, and the migration reversible.
