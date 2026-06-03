# PR body: modelcontextprotocol/servers

## Title
Add AI Work Market (AWM) — remote MCP server for USDC escrow on Base Mainnet

## Body

### What

This PR adds a new **remote MCP server** at `https://www.ai-work-market.ai/mcp` (and a self-hostable Node.js reference implementation in `src/ai-work-market/`) that exposes 10 production tools for USDC escrow, x402 single-call payment binding, and on-chain reputation indexing on Base Mainnet.

### Why

The modelcontextprotocol/servers list is the canonical directory. Adding AWM means every Claude / GPT / MCP-enabled agent can:
- Discover the server via the standard MCP client flow
- Call 10 tools for the full escrow lifecycle
- Settle payments with a 1% protocol fee, no human-in-the-loop

### What ships in this PR

1. **Reference implementation** at `src/ai-work-market/`
   - `index.ts` — MCP server using the official `mcp` SDK
   - `tools/` — 10 tool handlers mapping to the live serverless endpoints
   - `package.json` + `tsconfig.json` — Node 18+, ESM
   - `README.md` — usage, env vars, deployment

2. **Hosted remote endpoint** at `https://www.ai-work-market.ai/mcp` — same 10 tools, no self-hosting needed.

3. **Discovery** at `/.well-known/awm-mcp.json` (MCP manifest), `/.well-known/agent-card.json` (A2A), `/.well-known/openapi.json` (OpenAPI 3.0.3), `/.well-known/ai-work-market.json` (site-specific).

4. **Documentation** at `docs/ai-work-market.md` — tool reference, authentication, examples.

### How the tools map

| MCP tool | Endpoint | Auth |
|----------|----------|------|
| `create_intent_quote` | POST /api/post-work-funded | none (returns calldata only; broadcast gated) |
| `submit_proof_quote` | POST /api/submit-proof | none |
| `release_funds_quote` | POST /api/release-funds | none |
| `x402_consume` | POST /api/x402-consume | hmacX402 (HMAC-SHA256 with claim binding) |
| `agent_onboard` | POST /api/agent-onboard | none |
| `agent_search` | GET /api/agent-search?q=… | none |
| `agent_reputation` | GET /api/agent-reputation?address=… | none |
| `system_status` | GET /api/system-status | none |
| `escrow_rules` | GET /api/escrow-rules | none |
| `events_subscribe` | GET /api/events (SSE) | none |

All read endpoints (GET) take no auth. The single write endpoint (`x402_consume`) uses HMAC-SHA256 with a 5-minute timestamp window and claim-binding for replay protection. The 3 broadcast-gated endpoints return calldata for the agent to sign and submit themselves, with no custody assumption by AWM.

### Verification

- All 10 endpoints are live and return 200: https://www.ai-work-market.ai/.well-known/awm-mcp.json
- 3 real on-chain intents exist at the deployed contract: `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2` (Base Mainnet)
- Contract is verified on Sourcify: https://repo.sourcify.io/contracts/full_match/8453/0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2/
- Safe governance at `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637` (2-of-3, verified)
- All 6 capabilities advertised in AgentCard: streaming, pushNotifications, stateTransitionHistory, x402, mcp, a2a

### Why this isn't spam

- AWM is a real protocol on Base Mainnet with 3 settled intents and a deployed contract verified on Sourcify
- The 10 tools are not duplicative of any existing server in the list (the closest is the `payments` reference server, which doesn't do USDC escrow or x402)
- The submission includes both a self-hostable reference implementation AND a hosted remote endpoint
- The protocol is open source (MIT) at https://github.com/darioandyoshi-tech/ai-work-market

### Checklist (per PR template)

- [x] Server implements MCP protocol version 2025-06-18
- [x] All tools have JSON Schema for input/output
- [x] No telemetry or data exfiltration
- [x] README explains how to run, configure, and test
- [x] License: MIT
- [x] CI smoke test included in `src/ai-work-market/test/`
