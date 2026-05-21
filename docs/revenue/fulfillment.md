# Fulfillment Plan

Status: Stripe checkout is live. Fulfillment is **manual delivery** until the webhook system is enabled.

## Current flow

1. Buyer purchases via Stripe Payment Link.
2. Dario/Yoshi sees purchase in Stripe Dashboard.
3. Deliver product manually by email or secure file link.
4. Log sale in `projects/revenue-generation/data/revenue-ledger.json`.

## Public/private boundary

Public site may expose:
- storefront
- product samples
- verification receipts / hashes
- source-count summaries
- checkout links

Public site should not expose:
- full paid research packet
- full paid workflow JSON
- buyer/customer data
- Stripe secret or webhook secrets

## Next automation

Build a serverless Stripe webhook:
- `checkout.session.completed`
- verify `STRIPE_WEBHOOK_SECRET`
- map line item/payment link to product slug
- write or send delivery receipt
- optionally email buyer with secure download link

Do not enable automated delivery until webhook signature verification and private delivery storage are in place.
