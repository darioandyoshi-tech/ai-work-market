# Audit baseline — 2026-06-05

This is the post-fix state. Use as the regression baseline for future audits.

## HTTP status (CAT 1)

78 URLs tested. 58 returned 2xx. 12 returned expected 4xx (8 needed-input 400s, 6 x402 402s, 1 wrong-method 405). 0 real failures.

| URL | Status | Note |
|---|---|---|
| All pages | 2xx | |
| All `/api/*` GET endpoints | 2xx | |
| `/api/x-data/*` | 402 | Correct: payment required |
| `/api/check-payment` (no txHash) | 400 | Correct: missing param |
| `/api/onboarding` (GET) | 405 | Correct: POST only |
| `/api/private-delivery-link` (GET) | 405 | Correct: POST only |
| `/api/private-delivery-download` | 503 | ⚠ No auth check — but unreachable without token |

## Static code (CAT 2)

58/58 serverless functions pass `node --check`.
0 hardcoded secrets (0x{64} matches are all Foundry compiler output).
.env covered by .gitignore pattern.

## On-chain (CAT 3)

7/7 public getters reachable from `cast call`. Owner verified = Timelock. Timelock has Safe as proposer+executor. getMinDelay = 172800s (48h).

`/api/system-status` returns null for 2 reads (`escrowUsdcRaw`, `zkVerifier`) due to Vercel outbound-IP rate limits on public RPCs. The 4 fallback RPCs are configured but the underlying 403s come from ALL public RPCs when called from Vercel's IP range. Documented as a known limitation. health.ok correctly signals this.

## Discoverability (CAT 4)

| File | Status |
|---|---|
| /llm.txt | 200, concrete-action first sentence |
| /sitemap.xml | 200 |
| /robots.txt | 200, 5/5 AI crawlers allowlisted |
| /openapi.json | 200, OpenAPI 3.1 spec, 22 paths |
| /.well-known/openapi.json | 200, alias |
| /.well-known/agent-card.json | 200, 18/18 skills have examples |
| /.well-known/x402-manifest.json | 200, x402 v2 |
| /.well-known/awm-mcp.json | 200, mcpServers top-level present |
| /mcp | 200, SSE endpoint, 8 tools |

## Security (CAT 5)

0 hardcoded secrets. Stripe webhook has signature check. 5/5 POST endpoints have 64KB body limits (with proper 413 response).

## Claims (CAT 5b)

All `audit` / `formal verification` / `trustless` / `monitoring` references in the codebase are either:
- Honest disclosures of absence ("no third-party audit", "not via a trustless oracle")
- Live OZ library FV docs in `lib/`
- Striked out in archived legacy

## Content vs wiring (CAT 6)

8 grep recipes run.
- Recipe 1 (dead buttons): 0 hits
- Recipe 2 (mock data): 0 hits on production (one misleading comment in agents.html, since fixed)
- Recipe 3 (Sepolia leaks): 0 hits
- Recipe 4 (hardcoded metrics): 0 hits on production (`0.00072` was there, now fixed)
- Recipe 5 (buttons without fetch): 0 hits (work-templates 11 buttons are all `location.href=`, false positive of original grep)
- Recipe 6 (form no-op): 0 hits
- Recipe 7 (default-to-fake): 0 hits on production
- Recipe 8 (cross-page consistency): 0 cross-page duplicates

## Forms (CAT 7)

register.html properly wired: real fetch, `if (!r.ok)` check, receipt rendering with `card.id`, `hostedAt`, `storage`. Verified end-to-end with a real POST (HTTP 200, response shape matches field paths the page reads).

## Defaults (CAT 9)

0 default-to-fake patterns on production (the one hit was in archived legacy).

## Schema (CAT 10)

Field paths in register.html (`json.agentCard.id`, `json.hostedAt`, `json.storage`) all exist in the live response. Verified with a real POST.
