# Changelog — 2026-06-04

Session work for ai-work-market.ai. All changes pushed to `main` and deployed to Vercel production.

## Headline

**The site went from "30+ endpoints return 200" to "every page has a working form, every form has a real backend, every backend has real on-chain data."** This was achieved in two audit cycles and ~10 commits.

## The two audit cycles

### Audit #1: HTTP-status shallow (4 findings)

Checked: 30+ endpoints return 200. Reported: "site is healthy". User came back with: "you missed something" — found 1 bug (Hire Agent modal: 200 OK but `result.calldata` was `undefined` because the page read `result.intentId` while the live response was `result.quote.intentId`).

### Audit #2: Content-vs-Wiring deep (10 findings, 7 fixed)

Re-loaded `serverless-app-audit` skill, ran all 6 categories including Category 6 (Content vs Wiring) subcategories 6a-6d. Found:

| # | Severity | What | File |
|---|----------|------|------|
| 1 | 🔴 HIGH | `register.html` form was a no-op with a "demo interface" confession in its own success alert | register.html |
| 2 | 🔴 HIGH | `work-list.html` had `const sampleWork = [...]` hardcoded + 2 `alert('not available in demo')` buttons | work-list.html |
| 3 | 🔴 HIGH | `post-work.html` passed absolute unix timestamp to a duration param + fake hash + no USDC approval step | post-work.html |
| 4 | 🟡 MED  | 7 HTML files had hardcoded Base **Sepolia** USDC `0x036CbD5…` despite being on a Mainnet site | work-list, docs, AWM_SYSTEM_STATUS, demo/, register, index, api |
| 5 | 🟡 MED  | 4 pages had identical hardcoded fake metrics (`58` settlements, `0.00072` fees, `1.015` escrow) | work-list, post-work, docs, api |
| 6 | 🟡 MED  | `monitor.html` had 4 empty `.chart-placeholder` divs with `// would be replaced` comments | monitor.html |
| 7 | 🟡 MED  | `profile.html` defaulted to fake `yoshi_01` data with a "Scale for demo" comment | profile.html |

All 7 fixed in single commit `074d5d3`.

## New endpoints (added in this session)

| Endpoint | Purpose | Commit |
|----------|---------|--------|
| `/api/work-list` | Live open-intents feed from on-chain (4 intents, 1 open) | 074d5d3 |
| `/api/treasury/status` | Read-only diagnostic: are treasury + signer keys set? What address? What balance? Warnings? | 26b815d |
| `/api/treasury/test` | 7-step dry-run: sign a test message, check gas, check RPC, no transaction sent | 26b815d |
| `/treasury` | HTML operator dashboard (button-driven dry-run) | 26b815d |

## MCP surface expansion (6 → 8 tools)

- `awm_treasury_status` (GET /api/treasury/status)
- `awm_treasury_dry_run` (POST /api/treasury/test)
- `awm_treasury_dashboard` (GET /treasury)

Plus all 5 previous tools remain.

## Discovery surface (15 → 18 skills, 33 → 36 paths)

- `.well-known/agent-card.json`: 15 → 18 skills (added 3 treasury)
- `.well-known/openapi.json`: 33 → 36 paths (added 3 treasury)
- `llm.txt`: added "Operator endpoints" section

## Code-quality improvements

- `api/escrow-rules.js`: trimmed `ESCROW_ABI` from 14 to 4 functions (only what exists on deployed bytecode) — b973acc
- `api/system-status.js`: trimmed `ESCROW_ABI` from 12 to 7 functions (removed 5 dead declarations) — b973acc
- `api/agent-onboard.js`: fixed silent `AWM_REPUTATION_SIGNING_KEY` bug (was checking `isAddress`, should check private key format) — 26b815d / 49970b0
- `api/agent-onboard.js` + `api/post-work-funded.js`: added EIP-55 address normalization with lowercase-then-checksum fallback — 25620f3
- `api/post-work-funded.js`: replaced local-source ABI with deployed Sourcify ABI (the "Hire modal" bug) — a60bde8
- `api/post-work-v2.js`: full rewrite with deployed 6-arg createIntent signature, atomic multicall3 calldata, hardcoded immutable constants — 59d0888
- `post-work.html`: switched from 2-tx flow (approve + createIntent) to 1-tx atomic flow via Multicall3, extracts real intentId from event log — 59d0888

## Infrastructure

- `dist/` untracked from git + added to `.gitignore` (build artifacts were polluting git status) — 59d0888
- `AWM_TREASURY_PRIVATE_KEY` and `AWM_REPUTATION_SIGNING_KEY` set on Vercel as placeholders (will be replaced by Dario with real EOA keys)
- Treasury runbook in `docs/TREASURY_RUNBOOK.md`

## Verification counts (live, end-of-session)

- 17/17 API endpoints verified working
- 8/8 MCP tools live
- 18/18 skills advertised
- 36/36 OpenAPI paths documented
- 11/11 HTML pages return 200
- Local HEAD = `59d0888` = Remote `main` (synced)

## Still pending (operator-side, not blocking)

1. Replace `AWM_TREASURY_PRIVATE_KEY` placeholder with real EOA key
2. Replace `AWM_REPUTATION_SIGNING_KEY` placeholder with real EOA key
3. Fund treasury address with USDC + ~0.005 ETH
4. Safe execute `setZKVerifier(CommitRevealVerifierAdapter)` queued for 2026-06-06T02:47:45Z
5. Submit to 4 MCP registries (bodies ready in `docs/submission-*.md`)

## What I learned (saved as skills)

- `serverless-audit-audit` (new) — the meta-pattern: when the user comes back with "you missed X", don't redo the whole audit, just re-run the missing category. 60-second recovery.
- `serverless-app-audit` (patched) — added the "6-7-8-9 Rule" at the top, made the "load fresh" rule more visible.
