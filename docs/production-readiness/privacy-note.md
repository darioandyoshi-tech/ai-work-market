# AWM Privacy Note

**Status:** Draft / Pre-Mainnet
**Last Updated:** 2026-08-21
**Gate:** P1 (Privacy / PII minimization) — `security-launch-checklist.md`

This note documents what personal data AI Work Market (AWM) accesses, where it
is stored, how long it is retained, and the minimization posture. It is the
written evidence for the P1 "Privacy" gate.

## 1. Design posture: PII minimization

AWM's public APIs are built to **avoid returning customer PII**. The escrow
contract stores only on-chain addresses, amounts, URIs, and hashes — no names,
emails, or free-text personal data. The API layer follows the same rule:
responses expose product slugs, tx hashes, and status, not personal identity.

## 2. What data is accessed

| Surface | Data accessed | PII? |
|---|---|---|
| On-chain escrow (`AgentWorkEscrow`) | Addresses, amounts, work/proof/dispute URIs, hashes, status | No (pseudonymous addresses) |
| `api/check-payment.js`, `api/contract-status.js`, `api/events.js` | Tx hashes, block numbers, intent state | No |
| `api/x402-consume.js`, `api/x402-verify-receipt.js` | USDC tx hash, product slug, request/quote IDs | No |
| `api/stripe-webhook.js` | Stripe event payload (session id, product slug, metadata) | Minimal — Stripe session id is not customer PII; we do **not** store customer name/email from Stripe |
| `api/private-delivery-*.js` | Delivery token, product slug | No (token is a capability, not identity) |
| Vercel KV (`_fulfillment-store.js`, `_webhook-store.js`, `_x402-receipt-store.js`) | Fulfillment event records, webhook subscriptions, receipt bindings | No PII by design |

## 3. Where data lives

- **On-chain:** Base mainnet / Base Sepolia. Public by nature of the chain.
- **Vercel KV (Upstash Redis):** durable fulfillment/webhook/receipt records.
  Keys are namespaced (`awm:fulfillment:*`, `awm:webhook:*`,
  `awm:receipt:*`). Values are JSON records of tx hashes, slugs, and status —
  no PII.
- **Vercel function logs:** request logs may include IP addresses and URL
  query strings. These are operational logs, not a customer database.
- **In-memory rate-limit buckets** (`api/_rate-limit.js`): per-IP counters,
  held in process memory only, never persisted.

## 4. Retention

- **Vercel KV:** fulfillment list is capped at the most recent 10,000 event
  ids (`ltrim`). Individual event/session records persist until manually
  pruned. No automated PII retention concern because no PII is stored.
- **Function logs:** retained per Vercel's platform log retention policy.
  Treat as operational telemetry, not a data store.
- **Rate-limit buckets:** ephemeral, cleared on instance recycle.

## 5. What we deliberately do NOT do

- We do not collect names, emails, or phone numbers via the public APIs.
- We do not store Stripe customer objects or full card data (Stripe handles
  PCI; we only receive webhook events).
- We do not sell or share personal data with third parties for marketing.
- We do not use customer data to train models.

## 6. Operator responsibilities

- Keep `AWM_DELIVERY_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  and `AWM_X402_CONSUME_SECRET` as production secrets in Vercel; rotate on
  any suspected exposure.
- Review Vercel function logs for accidental PII capture (e.g. a future
  endpoint that echoes a user-supplied free-text field) before mainnet.
- If a future feature adds PII (e.g. email receipts), update this note and
  add a retention/deletion path before shipping.

## 7. Related

- `docs/production-readiness/security-launch-checklist.md` (P1 Privacy gate)
- `docs/production-readiness/monitoring-plan.md` (log review)
- `api/_fulfillment-store.js`, `api/_webhook-store.js`, `api/_x402-receipt-store.js`
