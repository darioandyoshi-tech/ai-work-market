# Stripe Setup Checklist for AI Work Market

Updated: 2026-05-12 19:40 CDT

## What Stripe announced that matters

Stripe is now explicitly building agentic payment infrastructure:

- **Machine Payments Protocol (MPP)**: open standard co-authored by Stripe and Tempo for agents/services to coordinate programmatic payments.
- **MPP via PaymentIntents**: Stripe says businesses can accept agent payments using the normal PaymentIntents API.
- **Stablecoins + fiat**: MPP can support stablecoins plus cards/BNPL through Shared Payment Tokens.
- **Agentic Commerce Suite / ACP**: low-code/catalog-driven commerce for selling through AI agents.
- **Link agent wallet**: agents can pay with user-controlled approvals and purchase visibility.

Sources:
- https://stripe.com/blog/machine-payments-protocol
- https://stripe.com/blog/everything-we-announced-at-sessions-2026
- https://stripe.com/newsroom/news/agentic-commerce-suite
- https://docs.stripe.com/payments/machine
- https://docs.stripe.com/agentic-commerce

## What Dario must do personally

These require account owner/human control:

1. Create or log into Stripe.
2. Complete business identity/KYC.
3. Add payout bank account.
4. Accept Stripe terms.
5. Decide account/business name and support email.
6. Create restricted API keys or payment links.

Do **not** paste secret keys in chat.

## What Yoshi can do after Stripe account exists

1. Create product/price/payment-link structure from CLI/API if keys are configured privately.
2. Wire checkout links into `/products`.
3. Add webhook handler for `checkout.session.completed` / `payment_intent.succeeded`.
4. Generate post-payment delivery receipts for digital products.
5. Build MPP/x402-style agent payment endpoint as the agent-native payment path.

## Immediate recommendation

Use a two-lane rollout:

### Lane A — today: Stripe Payment Links

- Agent Commerce Market Map 2026 — `$79`
- AI Work Intake → Escrow → Proof n8n Workflow — `$49`
- x402 → Escrow Integration Sprint — `$1,500`

This gets us paid fastest.

### Lane B — next: agent-native Stripe MPP / ACP

- Add `/api/mpp/pay` or equivalent payment-request endpoint.
- Use Stripe PaymentIntents.
- Keep AWM testnet escrow separate from real customer payment collection until production security is approved.

## Private key storage options

Preferred:
- Control UI → Skills / Config secret field.

Alternate local private env file:
- `/home/dario/.config/yoshi-payments/stripe.env`

Example keys, no real values:

```bash
STRIPE_SECRET_KEY="sk_live_or_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_AGENT_COMMERCE_MARKET_MAP_PAYMENT_LINK="https://buy.stripe.com/..."
STRIPE_AWM_N8N_WORKFLOW_PAYMENT_LINK="https://buy.stripe.com/..."
STRIPE_INTEGRATION_SPRINT_PAYMENT_LINK="https://buy.stripe.com/..."
```

