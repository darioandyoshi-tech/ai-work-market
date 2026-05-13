# Receipt Verification API

Endpoint:

```text
GET https://ai-work-market.vercel.app/api/fulfillment-receipt?session_id=<checkout-session-id>
```

Stripe Payment Links redirect buyers to `/purchase-complete?paid=<slug>&session_id={CHECKOUT_SESSION_ID}`. The page then calls this endpoint to verify the checkout session server-side with Stripe.

The response intentionally avoids customer PII and does not expose paid files. It returns:

- checkout status and payment status
- product slug/name/type/price
- fulfillment instructions
- proof hash metadata when applicable
- explicit reminder that AWM escrow is Base Sepolia testnet-only

This is secure manual fulfillment v1: it proves purchase without making paid assets public.
