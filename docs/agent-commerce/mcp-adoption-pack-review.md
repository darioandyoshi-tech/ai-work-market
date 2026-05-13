# MCP adoption pack review

Review date: 2026-05-12

Reviewed files:

- `docs/mcp.md`
- `docs/agent-commerce/mcp-agent-commerce-tools.md`
- `llms.txt`
- `.well-known/ai-work-market.json`
- `.well-known/awm-mcp.json` as referenced discovery metadata
- `examples/mcp/awm-mcp-server.js`

## Current state

The adoption pack is close. The MCP server is dependency-light, stdio-based, read-only, and already exposes the right first tool set for MCP clients and framework maintainers:

- Base Sepolia escrow metadata/status: `awm_get_deployment`, `awm_build_work_spec`, `awm_check_intent_status`
- Agent-commerce HTTP 402 flow: `awm_get_agent_products`, `awm_get_payment_challenge`, `awm_get_payment_request`, `awm_get_machine_payment_contract_preview`, `awm_verify_checkout_session`

`npm run check:mcp` passes and exercises initialization, tool listing, the known paid slug 402 path, payment-request parity at a basic level, reservation preview safety, and local Checkout Session ID rejection.

## Smallest changes to improve adoption

### 1. Make `docs/agent-commerce/mcp-agent-commerce-tools.md` match the actual tool surface

This doc currently omits `awm_get_payment_request`, while `llms.txt`, `.well-known/ai-work-market.json`, `.well-known/awm-mcp.json`, `docs/mcp.md`, and the server include it.

Small doc-only fix:

- Add a short `awm_get_payment_request` section:
  - calls `GET /api/payment-request?slug=<slug>`
  - treats HTTP 402 as expected output, not an error
  - returns payment terms only
  - does not open checkout or pay
- Add a one-line note that `awm_get_payment_challenge` and `awm_get_payment_request` should agree for product id, amount, checkout URL, proof metadata, and fulfillment state.

### 2. Add copy-paste client config blocks for Claude Desktop and Cline

`docs/mcp.md` has a generic `mcpServers` block. Keep it, but make adoption easier by adding a clearly labeled absolute-path example and a quick verification prompt.

Recommended text shape:

```json
{
  "mcpServers": {
    "ai-work-market": {
      "command": "node",
      "args": ["/absolute/path/to/ai-work-market/examples/mcp/awm-mcp-server.js"],
      "env": {
        "AWM_RPC_URL": "https://sepolia.base.org",
        "AWM_AGENT_COMMERCE_ORIGIN": "https://ai-work-market.vercel.app"
      }
    }
  }
}
```

Verification prompts:

```text
Use ai-work-market to list agent products. Then get the payment challenge for agent-commerce-market-map-2026. Do not open checkout or pay.
```

```text
Use ai-work-market to build a machine-payment reservation preview for agent-commerce-market-map-2026. Do not sign, reserve, open checkout, or pay.
```

### 3. Add MCP tool annotations for safer clients/frameworks

Small code change, no behavior change: add MCP annotations on each tool so clients can classify them safely.

Recommended pattern per tool:

```js
annotations: {
  title: 'Get AI Work Market payment challenge',
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
}
```

Notes:

- `openWorldHint: true` fits tools that call live HTTP/RPC.
- `awm_build_work_spec` and `awm_get_machine_payment_contract_preview` can use `openWorldHint: false` if they remain local-only.
- This is especially useful for Claude Desktop/Cline-style clients and framework maintainers building allowlists.

### 4. Tighten input schemas where the server already has expectations

Small code/doc change: add patterns/defaults to MCP `inputSchema` values. This improves generated forms and catches bad calls earlier.

Recommended additions:

- `slug`: `pattern: "^[a-z0-9][a-z0-9-]{1,120}$"`
- `origin`: `format: "uri"`, default `https://ai-work-market.vercel.app`
- `sessionId`: `pattern: "^cs_(test|live)_[A-Za-z0-9_]+$"`
- `intentId`: `pattern: "^[0-9]+$"`

Also validate `slug` locally before network calls. Current server safely URL-encodes it, but local validation makes the safety story clearer and lets smoke tests prove invalid slugs do not touch the network.

### 5. Normalize error results for adoption demos

Current handler returns MCP errors for thrown tool exceptions. That is fine for true failures, but adoption demos are smoother if expected recoverable cases return structured tool results.

Smallest useful behavior changes:

- HTTP 400/404/402 from `/api/protected-resource` and `/api/payment-request` should remain successful tool calls with `httpStatus`, `error`, and safety flags.
- Invalid local input can remain an MCP error, but include a stable message like `Invalid slug. Expected lowercase kebab-case product slug.`
- Network timeout/unavailable origin should return either a structured tool result or an MCP error with no stack trace and the timeout/origin visible.

### 6. Keep rail boundaries visible in every adoption-facing surface

The docs already say this, but repeat it near every install/test path:

- Stripe Payment Links are live for products/services.
- AI Work Market escrow is Base Sepolia testnet-only.
- MCP tools are read-only.
- The tools do not open checkout, move money, sign transactions, expose paid files, or return customer PII.

This prevents a framework maintainer from conflating live Stripe checkout discovery with testnet escrow settlement.

## Safety notes to preserve

Hard boundaries that should stay explicit in docs, discovery, and tool outputs:

1. No automatic money movement.
2. No browser/checkout opening from MCP tools.
3. No private keys, wallet secrets, Stripe secrets, SPTs, `Authorization: Payment ...`, or `X-PAYMENT` credentials in inputs or outputs.
4. Checkout URLs may be displayed to a human/operator, but payment is outside the MCP server.
5. Paid assets are not returned; receipt/delivery verification is metadata-only.
6. A Checkout Session is verified only through `/api/fulfillment-receipt` and `/api/delivery-status`; never from a redirect URL or user claim alone.
7. Machine-payment/reservation preview output is planning vocabulary only, not a live payment authorization.
8. Avoid polling loops. Return current status and let the client/operator retry deliberately.
9. Keep Base Sepolia/testnet escrow language separate from live Stripe products.

## Exact smoke checks

Run from repo root.

### Static and discovery checks

```bash
node --check examples/mcp/awm-mcp-server.js
python3 -m json.tool .well-known/ai-work-market.json >/tmp/awm-ai-work-market.json
python3 -m json.tool .well-known/awm-mcp.json >/tmp/awm-mcp-discovery.json
npm run check:mcp
```

Expected:

- JS syntax passes.
- Both `.well-known` files are valid JSON.
- `npm run check:mcp` prints `✓ MCP agent commerce smoke passed`.

### MCP protocol checks

Use the existing scripted smoke first:

```bash
node scripts/smoke-mcp-agent-commerce.js
```

Expected:

- `initialize` returns `serverInfo.name = ai-work-market-mcp`.
- `tools/list` includes all eight tools:
  - `awm_get_deployment`
  - `awm_build_work_spec`
  - `awm_check_intent_status`
  - `awm_get_agent_products`
  - `awm_get_payment_challenge`
  - `awm_get_payment_request`
  - `awm_get_machine_payment_contract_preview`
  - `awm_verify_checkout_session`
- `awm_get_payment_challenge` for `agent-commerce-market-map-2026` returns HTTP `402` as a successful result.
- Result safety includes `movesMoney: false` and `opensCheckout: false`.
- `awm_get_payment_request` for the same slug returns HTTP `402`.
- Reservation preview returns `state: "preview"` and `movesMoney: false`.
- Invalid Checkout Session ID returns a local validation error.

### Manual client checks for Claude Desktop/Cline

After adding the server config with an absolute path, ask the client:

```text
Use ai-work-market to list agent products. Then get the payment challenge for agent-commerce-market-map-2026. Do not open checkout or pay.
```

Expected:

- Client calls `awm_get_agent_products` and `awm_get_payment_challenge`.
- It summarizes product/payment terms.
- It does not open a browser, checkout, shell opener, wallet, or transaction flow.

Then ask:

```text
Use ai-work-market to verify checkout session not_a_session.
```

Expected:

- Server rejects locally.
- No network lookup is made.
- Client does not infer payment status.

Then ask:

```text
Use ai-work-market to create a machine-payment reservation preview for agent-commerce-market-map-2026. Do not reserve, sign, open checkout, or pay.
```

Expected:

- Result is preview-only.
- `movesMoney`, `signsTransaction`, `opensCheckout`, and `paidAssetsReturned` are all false.

### Suggested next smoke additions

Add these to `scripts/smoke-mcp-agent-commerce.js` when making the next adoption pass:

1. Unknown slug: valid-looking nonexistent slug returns structured `404 unknown_product`, not a crash.
2. Invalid slug: uppercase/spaces/path separators fail locally before network.
3. Tool annotations: every tool has `readOnlyHint: true` and `destructiveHint: false`.
4. Payment challenge/request parity: compare product id, amount, checkout URL, proof metadata, and fulfillment mode.
5. Discovery JSON parity: `.well-known/awm-mcp.json` tool list equals `tools/list` names.

## Recommendation

Do not add transaction-bearing MCP tools yet. The smallest high-value adoption pack is:

1. Documentation parity for all eight tools.
2. Copy-paste Claude Desktop/Cline config and prompts.
3. MCP read-only annotations.
4. Local slug/session validation plus smoke coverage.
5. Discovery/tool-list parity checks.

That is enough for MCP clients and framework maintainers to install, inspect, and safely demo the agent-commerce flow without expanding the payment or escrow trust surface.
