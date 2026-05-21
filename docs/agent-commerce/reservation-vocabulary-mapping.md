# Reservation Vocabulary Mapping

AI Work Market should align its agent-commerce envelope with emerging reservation vocabulary instead of inventing parallel names.

This document maps the live AWM HTTP `402` / receipt / delivery flow and the Base Sepolia escrow lifecycle to a scoped commercial reservation model.

## Why this matters

Spend limits alone are not enough for autonomous agent commerce. The safer governance object is a scoped commercial reservation with:

- authorized work
- payment terms
- evidence/proof requirements
- allowed actors
- expiry/timeout semantics
- release/refund/dispute paths

That gives circuit breakers and policy agents something meaningful to enforce beyond raw dollar caps.

## Vocabulary mapping

| Reservation verb | Meaning | AI Work Market equivalent today | Notes |
|---|---|---|---|
| `reserve` | Create scoped commercial commitment before work/payment settlement | HTTP `402` payment challenge + work authorization envelope; Base Sepolia signed offer / funded intent | For Stripe live rail, reservation is represented by product terms + checkout session. For escrow rail, reservation maps to a funded intent. |
| `commit` | Attach evidence that authorized work/action occurred | Proof URI / proof hash / signed action receipt | Proof should become content-addressed (`sha256`, CIDv1) and include verifier-readable context. |
| `release` | Authorized actor accepts proof and releases value | Buyer release / allowed verifier release | Current testnet contract uses buyer release; production should add explicit verifier/arbiter policy. |
| `refund` | Return funds when work is not completed or timeout path applies | Buyer refund before proof after deadline; dispute/admin path in MVP | Current dispute path is centralized MVP; not production-ready. |
| `query_budget` | Inspect budget/capacity available to an agent or authority | Future policy layer; not implemented in AWM core | Can be external to escrow contract and enforced by gateway/wallet/policy runtime. |
| `query_reservation` | Inspect reservation/funded-intent state | `awm_check_intent_status`; `/api/delivery-status`; receipt verification | MCP tools expose safe read-only query paths. |
| `expires_at` | Reservation timeout / deadline | `deadline` in escrow intent; fulfillment expectations in HTTP payment challenge | Agents need deterministic timeout handling. |

## Suggested AWM reservation envelope

```json
{
  "schema": "ai-work-market.reservation-envelope.v0.1",
  "reservationId": "awm:<chainId>:<intentId>|stripe:<checkoutSessionId>|draft:<hash>",
  "work": {
    "title": "Short task title",
    "deliverable": "Concrete deliverable",
    "acceptanceCriteria": ["verifiable condition"]
  },
  "commercialTerms": {
    "amount": { "currency": "USD", "dollars": 79 },
    "rail": "stripe_payment_link|base_sepolia_usdc_escrow",
    "testnetOnly": true
  },
  "actors": {
    "buyer": "human_or_agent_identifier",
    "seller": "agent_identifier",
    "allowedReleasers": ["buyer", "verifier"],
    "allowedRefunders": ["buyer", "arbiter"]
  },
  "evidence": {
    "requiredProof": "content-addressed artifact or signed action receipt",
    "sha256": "optional-before-commit",
    "uri": "optional-before-commit"
  },
  "timeouts": {
    "expiresAt": "2026-05-14T00:00:00Z",
    "refundAfter": "2026-05-14T00:00:00Z"
  },
  "state": "reserved|committed|released|refunded|disputed|expired"
}
```

## MCP tool alignment

The current read-only MCP proof surface supports the vocabulary without moving funds:

- `awm_get_agent_products` → discover commercial resources
- `awm_get_payment_challenge` → inspect `reserve` candidate
- `awm_get_payment_request` → inspect payment terms without resource request
- `awm_verify_checkout_session` → verify live Stripe receipt/delivery status
- `awm_check_intent_status` → query Base Sepolia escrow/funded-intent state
- `awm_build_work_spec` → draft canonical work/evidence object

Future useful tool:

- `awm_get_machine_payment_contract_preview` → generate a reservation envelope preview from a product slug, work spec, actors, and timeout. Read-only; no payment/signature/transaction.

## Safety boundary

- Live product payments currently use Stripe Payment Links.
- AWM protocol escrow remains Base Sepolia/testnet-only.
- Current contract is not production audited.
- Current dispute resolution is owner-centralized MVP and must be redesigned for production.
- MCP tools must remain read-only unless Dario explicitly approves transaction-bearing tools.
