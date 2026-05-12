# Outreach Log

## 2026-05-12

### Published / executed

- GitHub public repo polished with homepage, description, and topics.
  - URL: https://github.com/darioandyoshi-tech/ai-work-market
- GitHub prerelease created.
  - URL: https://github.com/darioandyoshi-tech/ai-work-market/releases/tag/v0.1.0-testnet
- Public tester issue opened: looking for 5 agent/framework builders.
  - URL: https://github.com/darioandyoshi-tech/ai-work-market/issues/1
- AI-readable discovery assets published and verified.
  - https://ai-work-market.vercel.app/llms.txt
  - https://ai-work-market.vercel.app/.well-known/ai-work-market.json
- Awesome AI Agents 2026 PR opened.
  - URL: https://github.com/caramaschiHG/awesome-ai-agents-2026/pull/245
  - Rationale: listed as protocol/tooling infrastructure for AI-agent work settlement.


### New public listing PRs

- awesome-x402 PR opened.
  - URL: https://github.com/Merit-Systems/awesome-x402/pull/231
  - Rationale: strongest x402 ecosystem fit; frames AI Work Market as complementary escrow/outcome settlement beside x402 pay-per-call.
- Ultimate Agent Directory PR opened.
  - URL: https://github.com/moshehbenavraham/Ultimate-Agent-Directory/pull/81
  - Rationale: broad but legitimate AI-agent tooling directory; submitted YAML source + regenerated README per contribution guide.

### Filtered / not posted yet

- `alternbits/awesome-ai-agents`: deferred; generic AI-agent list and less precise than already-open Awesome AI Agents 2026 PR.
- `cloudflare/agents`: PR creation is collaborators-only; do not open a generic issue until there is a concrete Cloudflare Agents integration or example.
- `coinbase/agentkit` / `x402-foundation/x402`: high-fit ecosystem targets, but avoid low-signal issues. Best next move is a concrete AgentKit action provider or x402 adapter before asking maintainers for attention.

### Prepared post queue

- `docs/public-post-queue.md` now contains ready-to-post copy for HN, Farcaster/x402+Base, and x402/CDP Discord-style channels.

### Built locally / awaiting publish

- MCP integration and revenue model committed locally.
  - Commit: `bdde0b4 Add MCP integration and revenue model`
- Rapid launch funnel assets committed locally.
  - Commit: `276b887 Add rapid launch funnel assets`
- Local branch is ahead of `origin/main` by 2 commits; needs GitHub auth to push.

### New launch assets in local commits

- `/manifesto` — category statement: trusted work layer for AI labor.
- `/trust` — beta trust policy for scoped work, proof, escrow, disputes.
- `/founding-testers` — CTA for agent/framework builders.
- `/use-cases/research`, `/automation`, `/coding`, `/content`, `/support` — SEO/use-case pages.
- GitHub issue templates for founding testers and work requests.
- `docs/launch-sprint.md` — rapid channel plan and post copy.
- `docs/directory-submissions.md` — corrected directory/listing copy and targets.

### Intentionally skipped / deferred

- `evilsocket/awesomeagents`: skipped for now because its criteria require a specific production-ready agent, not a testnet platform/protocol layer.
- HN / Reddit / Farcaster / Discord communities: prepared copy exists, but these require logged-in/community accounts and active comment monitoring. Avoiding blind spam.
- Directory research that referenced `ai2human`/BNB was discarded as stale/wrong for AI Work Market; only the target/channel structure was retained.

### Fastest next public moves once auth/accounts are available

1. Push local commits `bdde0b4` and `276b887` to GitHub.
2. Redeploy Vercel so `/manifesto`, `/trust`, `/founding-testers`, and use-case pages go live.
3. Post Show HN with `docs/launch-sprint.md` copy.
4. Post/cast one tailored x402/Base note: CDP Discord or Farcaster `/x402`.
5. Open clean PR to `Merit-Systems/awesome-x402` if contribution format fits.
6. Submit to first no-login directories using `docs/directory-submissions.md`.
7. Retry Moltbook registration after rate limit; post the Moltbook-specific launch note.
