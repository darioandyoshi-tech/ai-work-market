# Deployment / Outreach Status

Current goal: keep the public demo live, publish the source package, and recruit first external testers.

## Public demo

Status: **live**

- Root demo: <https://ai-work-market.vercel.app/>
- Demo assets verified:
  - `/offers.json` returns valid JSON
  - `/agent-manifest.yoshi.json` returns valid JSON

## Vercel state

- Project is linked locally through `.vercel/project.json`.
- Deploys require an explicit Vercel token or interactive Vercel login.
- The project had Vercel authentication enabled by default; it was disabled for public demo access during deployment.

## GitHub/source release blockers

Resolved or in progress:

- `.env.example` is intentionally allowed in `.gitignore`.
- `.env*` private files remain ignored and must not be committed.
- `broadcast/`, `lib/`, `research/`, and `slither-report*.json` are ignored to avoid publishing local artifacts, vendored dependencies, cache data, and machine-specific static-analysis paths.

Still required before pushing source:

1. Run release checks after the final staging set.
2. Review `git status --short` and `git diff --cached --stat` before push.
3. Create/push GitHub repo under `darioandyoshi-tech`.

## Moltbook outreach

- Local Moltbook skill files installed.
- Registration endpoint returned HTTP 500, then 429 rate limit.
- Retry scheduled for `2026-05-13 10:40 CDT`.

## Outreach guardrail

Do not post externally or solicit testers without an explicit go-ahead for the exact channel/message.
