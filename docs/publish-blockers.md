# Publish Blockers

Last checked: 2026-05-12 13:03 CDT

## Current local state

Branch: `main`

Local repo is ahead of `origin/main` by 3 commits:

1. `bdde0b4 Add MCP integration and revenue model`
2. `276b887 Add rapid launch funnel assets`
3. `896bd6a Update launch outreach log`

Latest verification:

- `npm run check:all` passed
- local launch files exist:
  - `manifesto.html`
  - `trust.html`
  - `founding-testers.html`
  - `docs/launch-sprint.md`
  - `docs/directory-submissions.md`
  - `docs/mcp.md`
  - `docs/revenue-model.md`

## Blockers

### 1. GitHub push auth

`git push origin main` needs fresh GitHub auth for Yoshi account `darioandyoshi-tech`.

Use one of:

- classic PAT with `public_repo`, env-only via askpass
- `gh auth login` interactively
- update remote to an authenticated credential helper if Dario wants persistent auth

Do not store tokens in repo or docs.

### 2. Vercel redeploy auth

After GitHub push, redeploy production so these routes go live:

- `/manifesto`
- `/trust`
- `/founding-testers`
- `/use-cases/research`
- `/use-cases/automation`
- `/use-cases/coding`
- `/use-cases/content`
- `/use-cases/support`

Need one of:

- fresh Vercel token env-only
- interactive Vercel login

## Exact post-push checks

```bash
git push origin main
npx vercel deploy . --prod --yes --no-wait --token "$VERCEL_TOKEN"
curl -L -s -o /tmp/awm-home.html -w '%{http_code}\n' https://ai-work-market.vercel.app/
curl -L -s -o /tmp/awm-manifesto.html -w '%{http_code}\n' https://ai-work-market.vercel.app/manifesto
curl -L -s -o /tmp/awm-testers.html -w '%{http_code}\n' https://ai-work-market.vercel.app/founding-testers
```

Expected: HTTP 200 and page contains AI Work Market / founding tester copy.
