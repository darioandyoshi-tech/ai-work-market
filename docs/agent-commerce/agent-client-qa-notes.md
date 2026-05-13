# Agent client QA notes

Review target: a dependency-free Node example client that fetches an AI Work Market protected resource, handles HTTP `402`, prints checkout/payment/proof metadata, and optionally verifies a Stripe Checkout session receipt and delivery status.

## Recommended client UX

- Default to read-only discovery: fetch `/api/protected-resource?slug=<slug>` and print a concise summary without opening checkout or retrying payment automatically.
- Treat HTTP `402` as an expected payment challenge, not an error. Show:
  - product `id`, `name`, `type`, `status`, and `priceUsd`
  - `payment.currentRail`, `checkoutUrl`, `afterCompletionUrl`, and amount
  - `resource.url`, `resource.sampleUrl`, and `paidAssetsPublic`
  - fulfillment `mode`, `purchaseCompleteUrl`, and automated delivery status
  - proof `sha256` and `verificationUrl` when present
  - protocol notes, especially that Stripe Payment Links are live and AWM escrow is Base Sepolia/testnet-only
- Print next actions clearly:
  - “Open this Stripe Checkout URL in a browser/operator flow” for `stripe_payment_link`.
  - “After checkout, rerun with --session-id cs_... to verify receipt/delivery status.”
  - “Paid files are not exposed by this endpoint in v1; fulfillment is manual.”
- Support `--slug`, `--base-url`, `--session-id`, and optional `--access-token` flags/env vars. Keep defaults pointed at production `https://ai-work-market.vercel.app`, but make test/local bases easy.
- If a `Link: <...>; rel="payment"` header is present, display it as a secondary checkout source and warn if it differs from JSON `payment.checkoutUrl`.
- For optional verification, call both:
  - `/api/fulfillment-receipt?session_id=<cs_...>`
  - `/api/delivery-status?session_id=<cs_...>`
  and print `verified`, checkout status/paymentStatus, delivery state/message, and `noCustomerPiiReturned`/`noAssetUrlsReturned` safety fields.

## Safety checks for the example client

- Never move money automatically. Do not auto-open payment URLs unless the user passes an explicit flag such as `--open-checkout`; even then, keep it browser/operator-driven.
- Redact sensitive inputs in logs: access tokens, bearer headers, full `X-PAYMENT`, future MPP/x402 credentials, and raw authorization payloads.
- Validate `session_id` client-side before requesting receipt/status: accept only Stripe Checkout IDs shaped like `cs_test_...` or `cs_live_...`; otherwise fail locally with a friendly message.
- Do not treat example `machinePayment` fixtures as live rails. If a future response includes `machinePayment`, print its `status`/`environment` and require explicit live/sandbox labels before suggesting any machine-payment action.
- Do not infer delivery from checkout URL alone. Only present a purchase as verified when receipt/status endpoints return `verified: true`.
- Preserve the v1 boundary: paid assets are private, signed links are unavailable, and manual fulfillment is expected even after verified payment.
- Handle non-JSON responses defensively for `405`, network failures, Stripe lookup errors, and unexpected HTML/text bodies.
- Set a finite request timeout and clear retry guidance; do not tight-loop receipt/status polling.

## Suggested test cases

1. **Missing slug**: request without `slug`; expect `400 missing_slug` and display the products URL.
2. **Unknown slug**: request an invalid slug; expect `404 unknown_product` and no checkout prompt.
3. **Unpaid protected resource**: known slug without token; expect HTTP `402`, `x-ai-work-market-payment-required: true`, JSON schema `ai-work-market.payment-request.v1`, and a Stripe checkout URL.
4. **Payment request endpoint parity**: compare `/api/payment-request?slug=...` with `/api/protected-resource?slug=...` `402` output for the same slug; key fields should agree: product ID, amount, checkout URL, proof, fulfillment mode.
5. **Authorized protected resource**: with a configured test/local `AWM_DELIVERY_TOKEN`, pass bearer or `X-AWM-Access-Token`; expect `200`, `schema: ai-work-market.protected-resource.v1`, `paidAssetsPublic: false`, and no paid asset URLs.
6. **Receipt invalid ID**: `--session-id not-a-session`; client should fail locally or API should return `400 missing_or_invalid_session_id`.
7. **Receipt Stripe unavailable/missing secret**: local/server environment without `STRIPE_SECRET_KEY`; expect `503 stripe_receipt_lookup_failed` detail `stripe_secret_missing`; client should explain that verification is unavailable, not unpaid.
8. **Unpaid or incomplete session**: mocked Stripe session with `payment_status !== paid` and `status !== complete`; receipt/status endpoints should return HTTP `402`, `verified: false`, and delivery state `awaiting_paid_checkout`.
9. **Paid product session**: mocked Stripe paid/complete session mapped by metadata slug or payment link ID; expect `200`, `verified: true`, correct product, no customer PII, no asset URLs, and delivery state `manual_delivery_pending` or `kickoff_pending` for services.
10. **Machine-payment fixtures**: parse both JSON fixtures in `examples/agent-commerce`; assert they contain no secrets, `movesMoney: false`, and planned/sandbox-not-live labels.
11. **Network/timeout behavior**: simulate timeout or DNS failure; client exits non-zero with actionable retry guidance and no stack trace by default.
12. **Header mismatch warning**: mock a `Link` payment URL that differs from JSON checkout URL; client warns and prefers JSON unless documented otherwise.
