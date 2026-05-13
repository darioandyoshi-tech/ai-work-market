# MCP agent-commerce QA notes

Review target: an MCP-facing proof asset for AI Work Market's live HTTP `402` protected-resource flow, informed by:

- `examples/mcp/awm-mcp-server.js` — current read-only MCP stdio server for deployment metadata, work-spec hashing, and Base Sepolia escrow status.
- `examples/agent-commerce/agent-payment-client.js` — dependency-free Node client for the live protected-resource/payment-request flow.
- `docs/agent-commerce/*.md` — current Payment Link boundary plus planned MPP/x402 contract.

## Recommended MCP tool surface

Keep the first MCP proof read-only and operator-driven. The goal is to let an agent discover a payable resource, explain the `402`, verify receipts/status, and inspect non-secret protocol metadata — not to move money.

### `awm_get_agent_products`

Discover agent-readable catalog entries.

**Input schema**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "origin": {
      "type": "string",
      "format": "uri",
      "default": "https://ai-work-market.vercel.app",
      "description": "AI Work Market origin. Override only for local/test deployments."
    }
  }
}
```

**Output schema**

```json
{
  "schema": "ai-work-market.mcp.agent-products-result.v1",
  "origin": "https://ai-work-market.vercel.app",
  "productsUrl": "https://ai-work-market.vercel.app/api/agent-products",
  "wellKnownUrl": "https://ai-work-market.vercel.app/.well-known/agent-products.json",
  "httpStatus": 200,
  "products": [
    {
      "id": "agent-commerce-market-map-2026",
      "name": "Agent Commerce Market Map 2026",
      "type": "verified_research_packet",
      "status": "paid_ready_v1",
      "priceUsd": 79,
      "sampleUrl": "https://..."
    }
  ]
}
```

**Notes**

- Return only catalog fields already intended for public agent discovery.
- Do not follow checkout URLs or start browser/payment flows.

### `awm_get_payment_challenge`

Fetch the live protected resource and normalize the unpaid HTTP `402` response for MCP clients. This should be the main proof tool.

**Input schema**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["slug"],
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]{1,120}$",
      "description": "Product slug to request."
    },
    "origin": {
      "type": "string",
      "format": "uri",
      "default": "https://ai-work-market.vercel.app",
      "description": "AI Work Market origin. Override only for local/test deployments."
    },
    "includeHeaders": {
      "type": "boolean",
      "default": true,
      "description": "Include non-sensitive response headers relevant to payment discovery."
    }
  }
}
```

**Output schema**

```json
{
  "schema": "ai-work-market.mcp.payment-challenge-result.v1",
  "protectedResourceUrl": "https://ai-work-market.vercel.app/api/protected-resource?slug=agent-commerce-market-map-2026",
  "httpStatus": 402,
  "paymentRequired": true,
  "product": {
    "id": "agent-commerce-market-map-2026",
    "name": "Agent Commerce Market Map 2026",
    "type": "verified_research_packet",
    "status": "paid_ready_v1",
    "priceUsd": 79
  },
  "payment": {
    "currentRail": "stripe_payment_link",
    "checkoutUrl": "https://checkout.stripe.com/...",
    "afterCompletionUrl": "https://ai-work-market.vercel.app/purchase-complete?paid=agent-commerce-market-map-2026",
    "amount": {
      "currency": "USD",
      "dollars": 79,
      "stripeUnitAmount": 7900
    }
  },
  "resource": {
    "url": "https://ai-work-market.vercel.app/api/protected-resource?slug=agent-commerce-market-map-2026",
    "sampleUrl": "https://...",
    "paidAssetsPublic": false
  },
  "fulfillment": {
    "mode": "manual_after_stripe_purchase",
    "automatedDownloadStatus": "not_enabled_until_signed_delivery_links"
  },
  "proof": {
    "sha256": "...",
    "verificationUrl": "https://..."
  },
  "headers": {
    "x-ai-work-market-payment-required": "true",
    "x-ai-work-market-product": "agent-commerce-market-map-2026",
    "link": "<https://checkout.stripe.com/...>; rel=\"payment\""
  },
  "protocolNotes": {
    "currentLiveRail": "stripe_payment_link",
    "aiWorkMarketEscrow": "Base Sepolia/testnet-only"
  },
  "nextActions": [
    "Present checkoutUrl to a human/operator if purchase is desired.",
    "After checkout, call awm_verify_checkout_session with the Stripe Checkout Session ID."
  ],
  "safety": {
    "movesMoney": false,
    "paidAssetsReturned": false,
    "checkoutOpened": false
  }
}
```

**HTTP handling expectations**

- Treat `402` as a successful tool outcome, not an MCP error.
- Return `400 missing_slug` and `404 unknown_product` bodies as structured tool results so agents can recover.
- If the response is `200`, mark `paymentRequired: false` and still preserve `paidAssetsReturned: false` unless signed delivery links exist.
- Surface `Link: rel="payment"` as secondary metadata and warn when it differs from JSON `payment.checkoutUrl`; prefer JSON for display.

### `awm_get_payment_request`

Optional parity tool for `/api/payment-request`. Useful for asserting that the standalone payment-request endpoint matches the protected-resource `402` challenge.

**Input schema**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["slug"],
  "properties": {
    "slug": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,120}$" },
    "origin": { "type": "string", "format": "uri", "default": "https://ai-work-market.vercel.app" }
  }
}
```

**Output schema**

Use the same normalized shape as `awm_get_payment_challenge`, with `paymentRequestUrl` instead of `protectedResourceUrl` and `sourceEndpoint: "/api/payment-request"`.

### `awm_verify_checkout_session`

Verify a Stripe Checkout Session against AI Work Market's receipt and delivery-status endpoints. This confirms payment state but must not expose customer PII or paid asset URLs.

**Input schema**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["sessionId"],
  "properties": {
    "sessionId": {
      "type": "string",
      "pattern": "^cs_(test|live)_[A-Za-z0-9_]+$",
      "description": "Stripe Checkout Session ID. Reject anything else locally before network calls."
    },
    "origin": {
      "type": "string",
      "format": "uri",
      "default": "https://ai-work-market.vercel.app"
    }
  }
}
```

**Output schema**

```json
{
  "schema": "ai-work-market.mcp.checkout-verification-result.v1",
  "sessionId": "cs_live_...redacted-tail",
  "receipt": {
    "httpStatus": 200,
    "verified": true,
    "product": { "id": "agent-commerce-market-map-2026" },
    "checkoutSession": {
      "status": "complete",
      "paymentStatus": "paid"
    },
    "safety": {
      "noCustomerPiiReturned": true
    }
  },
  "delivery": {
    "httpStatus": 200,
    "verified": true,
    "state": "manual_delivery_pending",
    "signedLinkAvailable": false,
    "safety": {
      "noAssetUrlsReturned": true
    }
  },
  "purchaseVerified": true,
  "nextActions": [
    "Manual fulfillment is still expected in v1 unless delivery state says otherwise."
  ]
}
```

**Notes**

- Do not declare a purchase verified from a checkout URL, redirect URL, or user claim alone.
- Only set `purchaseVerified: true` when receipt/status endpoints return `verified: true`.
- If Stripe lookup is unavailable (`503 stripe_receipt_lookup_failed`, e.g. missing `STRIPE_SECRET_KEY`), report verification unavailable rather than unpaid.

### `awm_get_machine_payment_contract_preview`

Expose the non-secret MPP/x402 fixture/contract shape for planning and client development. This must not be advertised as live payment capability.

**Input schema**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "fixture": {
      "type": "string",
      "enum": ["envelope", "receipt", "both"],
      "default": "both"
    }
  }
}
```

**Output schema**

```json
{
  "schema": "ai-work-market.mcp.machine-payment-contract-preview-result.v1",
  "environment": "sandbox_or_preview_not_live",
  "liveEnabled": false,
  "fixtures": {
    "envelope": { "schema": "ai-work-market.machine-payment-envelope.v0.1" },
    "receipt": { "schema": "ai-work-market.machine-payment-receipt.v0.1" }
  },
  "safety": {
    "containsSecrets": false,
    "movesMoney": false,
    "isProofOfPayment": false
  }
}
```

### Existing escrow tools to retain

The current MCP server tools are safe to keep as a separate Base Sepolia/testnet escrow surface:

- `awm_get_deployment`
- `awm_build_work_spec`
- `awm_check_intent_status`

Recommended adjustment for docs/metadata: label them explicitly as **AWM protocol escrow / Base Sepolia testnet**, not the live Stripe checkout rail. This prevents an agent from mixing the production Payment Link flow with the testnet escrow proof flow.

## MCP response conventions

- Prefer JSON text content for compatibility with the current minimal MCP server, but keep each payload shaped by the schemas above.
- Include a top-level `schema` version in every tool result.
- Include the request URL used, HTTP status, normalized body fields, and safety booleans.
- Preserve non-sensitive diagnostic headers for `402`: `Link`, `X-AI-Work-Market-Payment-Required`, and `X-AI-Work-Market-Product`.
- Redact tokens and session IDs in human-readable logs; structured results may include only the minimum needed identifier, preferably tail-redacted.
- Use finite timeouts. The example client uses `AWM_CLIENT_TIMEOUT_MS` defaulting to 15 seconds; MCP tools should match or expose an operator-controlled timeout.

## Safety constraints

Hard constraints for the MCP proof:

1. **No automatic money movement.** Tools may fetch challenges, display checkout URLs, and verify sessions. They must not open checkout, submit card details, authorize MPP/SPT credentials, send USDC, or call escrow funding functions.
2. **Operator-mediated checkout.** The live rail is `stripe_payment_link`; present the URL and require a human/operator or a separate explicitly approved browser flow.
3. **No secrets in inputs or logs.** Redact bearer tokens, access tokens, `Authorization: Payment ...`, `X-PAYMENT`, SPTs, Stripe secrets, private keys, and raw future machine-payment credentials.
4. **Validate inputs locally.** Enforce slug and `cs_test_...`/`cs_live_...` session ID shapes before network calls.
5. **Treat machine-payment fixtures as non-live.** `planned_not_live`, `sandbox_or_preview_not_live`, and `movesMoney: false` must remain visible. Never convert fixture data into payment instructions.
6. **Preserve fulfillment boundary.** Paid files are private in v1; tools must not claim they unlocked assets unless a future signed-link endpoint returns scoped expiring URLs.
7. **Separate rails clearly.** Stripe Payment Links are live for products/services; AWM escrow is Base Sepolia/testnet-only; MPP/x402 is planned or sandbox until account gates are explicitly enabled.
8. **Do not infer verified delivery.** Verification requires `/api/fulfillment-receipt` and/or `/api/delivery-status` returning `verified: true`.
9. **Avoid polling loops.** If verification is pending, return current status and recommended retry timing; do not tight-loop receipt or delivery checks.
10. **Network failures are tool results.** Return actionable structured errors for timeouts, non-JSON bodies, `405`, Stripe lookup failures, and unavailable origins without stack traces by default.

## Smoke tests

Run these before presenting the MCP proof as ready.

### Static checks

1. `node --check examples/mcp/awm-mcp-server.js`
2. `node --check examples/agent-commerce/agent-payment-client.js`
3. `python3 -m json.tool examples/agent-commerce/mpp-x402-payment-envelope.example.json`
4. `python3 -m json.tool examples/agent-commerce/mpp-x402-payment-receipt.example.json`
5. Inspect fixtures for `containsSecrets: false`, `movesMoney: false`, and non-live environment labels.

### MCP protocol checks

1. Initialize the MCP server over stdio; expect `serverInfo.name = ai-work-market-mcp` and `capabilities.tools` present.
2. Call `tools/list`; expect current tools and, if implemented, the new agent-commerce tools above.
3. Call `awm_get_deployment`; expect Base Sepolia deployment metadata and no private keys.
4. Call `awm_build_work_spec` with a title/deliverable; expect deterministic-looking `workHash` shape (`0x` + 64 hex chars) and a canonical JSON string.
5. Call `awm_check_intent_status` with a known testnet intent ID; expect read-only escrow fields or a structured RPC error. No transaction submission should occur.

### Live protected-resource checks

1. **Known unpaid slug:** call `awm_get_payment_challenge` for `agent-commerce-market-map-2026`; expect HTTP `402`, `paymentRequired: true`, `payment.currentRail: stripe_payment_link`, checkout URL present, sample/proof metadata when configured, and `paidAssetsReturned: false`.
2. **Header parity:** ensure `Link: rel="payment"` exists when checkout URL exists. If it differs from JSON `payment.checkoutUrl`, result includes a warning and prefers JSON.
3. **Unknown slug:** call `awm_get_payment_challenge` with a syntactically valid nonexistent slug; expect `404 unknown_product` and no checkout prompt.
4. **Invalid slug:** call with uppercase, spaces, or path separators; expect local validation failure and no network request.
5. **Payment-request parity:** compare `awm_get_payment_request` and `awm_get_payment_challenge` for the same slug; product ID, amount, checkout URL, proof, and fulfillment mode should match.
6. **No auto-open:** confirm the tool returns checkout metadata only; no browser, shell opener, Stripe checkout automation, or transaction function runs.

### Receipt/delivery verification checks

1. **Invalid session ID:** call `awm_verify_checkout_session` with `not-a-session`; expect local validation failure.
2. **Unavailable Stripe lookup:** against local/test env without `STRIPE_SECRET_KEY`, expect structured `503 stripe_receipt_lookup_failed`/`stripe_secret_missing` handling and no claim that payment failed.
3. **Incomplete session:** mocked or test session with `status !== complete` or `payment_status !== paid`; expect `purchaseVerified: false` and delivery state such as `awaiting_paid_checkout`.
4. **Paid session:** mocked paid/complete session mapped to a product; expect `purchaseVerified: true`, correct product slug, no customer PII, no asset URLs, and manual/signed-link delivery state accurately reported.

### Machine-payment preview checks

1. `awm_get_machine_payment_contract_preview` returns fixture schemas only and `liveEnabled: false`.
2. Result preserves `environment: sandbox_or_preview_not_live` and `movesMoney: false`.
3. No static `payTo` placeholder is surfaced as a production payment address.
4. Future `Authorization: Payment ...` or `X-PAYMENT` examples are placeholders/redacted, never real credentials.

## Recommended first implementation slice

If production code is later approved, implement only these MCP additions first:

1. `awm_get_payment_challenge`
2. `awm_verify_checkout_session`
3. `awm_get_machine_payment_contract_preview`

Leave write/payment actions out of scope. This is enough to prove the live `402` protected-resource flow to MCP-capable agents while keeping all money movement and fulfillment decisions under explicit operator control.
