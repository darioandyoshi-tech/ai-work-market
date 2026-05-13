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

### Revenue outreach wave — integration sprint

- Opened targeted Lucid/daydreams issue.
  - URL: https://github.com/daydreamsai/lucid-agents/issues/1631
  - Pitch: AI Work Market as escrowed scoped-work settlement for Lucid agent commerce.
- Opened targeted Agent-Bazaar issue.
  - URL: https://github.com/Agent-Bazaar/Agent-Bazaar/issues/1
  - Pitch: AI Work Market as escrowed scoped-work provider/category for marketplace agents.
- Opened targeted PayanAgent issue.
  - URL: https://github.com/derNif/payanagent/issues/24
  - Pitch: AI Work Market as escrowed custom-work fulfillment alongside x402/Base marketplace flows.
- Opened targeted AetherCore ag402 issue.
  - URL: https://github.com/AetherCore-Dev/ag402/issues/15
  - Pitch: ag402 + AI Work Market demo for paid agent work, not just paid API calls.

All outreach was explicit about testnet-only / not audited / centralized disputes.

### Controlled blast wave — strategic ecosystems

Dario authorized a broader blast. Kept it controlled and technical: five high-fit GitHub issues, no generic spam.

- Coinbase AgentKit issue opened.
  - URL: https://github.com/coinbase/agentkit/issues/1198
  - Pitch: AgentKit action provider for escrowed scoped agent work.
- Worldcoin AgentKit issue opened.
  - URL: https://github.com/worldcoin/agentkit/issues/29
  - Pitch: human-backed/policy-constrained agents + escrowed scoped work.
- Google A2A x402 issue opened.
  - URL: https://github.com/google-agentic-commerce/a2a-x402/issues/92
  - Pitch: A2A x402 service agent with escrowed scoped-work settlement.
- Sperax ERC-8004 Agents issue opened.
  - URL: https://github.com/Sperax/erc8004-agents/issues/2
  - Pitch: ERC-8004 identity/reputation + AI Work Market settlement records.
- OnChainMee x402/ERC-8004 issue opened.
  - URL: https://github.com/OnChainMee/x402-erc8004-agent/issues/3
  - Pitch: A2A/x402/ERC-8004 agent work settlement demo.

All messaging included testnet-only / not audited / centralized disputes guardrails.

### Proof-backed follow-ups — AgentKit action descriptors

After building `examples/agentkit`, posted selective proof-backed follow-ups instead of generic bumps.

- Lucid/daydreams follow-up comment: https://github.com/daydreamsai/lucid-agents/issues/1631#issuecomment-4434402350
  - Pointed to AgentKit-shaped action descriptors and asked whether they prefer external example vs tiny adapter/docs PR.
- Coinbase AgentKit follow-up comment: https://github.com/coinbase/agentkit/issues/1198#issuecomment-4434402473
  - Pointed to AgentKit action descriptors/runbook and asked whether external example vs action-provider/docs PR is the right shape.

Proof asset: `examples/agentkit` at commit `99fd70c Add AgentKit action descriptors`.

### Full-power revenue strike wave — live 402/receipt demo

Dario said “do it all.” Posted high-signal comments only on open issues directly about x402, MPP, 402 handling, agent payments, or agent commerce. Lead asset: live demo `https://ai-work-market.vercel.app/agent-commerce`.

- Stripe AI / MCP x402+MPP payment gating:
  - https://github.com/stripe/ai/issues/347#issuecomment-4436558670
  - Pitch: 402 protected-resource + Stripe receipt verification as reference for MCP payment gating; suggested work-order/proof layer beyond payment.
- Google A2A x402 spending/circuit breakers:
  - https://github.com/google-agentic-commerce/a2a-x402/issues/60#issuecomment-4436558754
  - Pitch: separate payment authorization from work acceptance/proof/release; semantic envelope for circuit breakers.
- Hugging Face smolagents x402 handler:
  - https://github.com/huggingface/smolagents/issues/2112#issuecomment-4436558829
  - Pitch: generic 402 handler policy/tool layer with budget/trust/receipt storage.
- Firecrawl x402 per-scrape payments:
  - https://github.com/firecrawl/firecrawl/issues/3279#issuecomment-4436558908
  - Pitch: receipt + proof of delivered scrape/crawl work, not only payment.
- Microsoft AutoGen native agent commerce:
  - https://github.com/microsoft/autogen/issues/7564#issuecomment-4436558976
  - Pitch: CommercePolicy / PaidResourceTool for 402 → payment → receipt → proof verification.
- Microsoft AutoGen payment primitive:
  - https://github.com/microsoft/autogen/issues/7492#issuecomment-4436559051
  - Pitch: combine spend policy with proof/timeout/refund/dispute policy.
- OpenViking paid context/skills:
  - https://github.com/volcengine/OpenViking/issues/1092#issuecomment-4436559133
  - Pitch: paid context/skills as file-system resources with payment/proof envelope.

Skipped/comment constraints:
- Coinbase x402 issue search hit could not be commented because `coinbase/x402` has issues disabled.
- Closed issues were not bumped.
- All public claims preserved the boundary: Stripe checkout live; AWM escrow remains Base Sepolia testnet-only.

## 2026-05-12 — Google A2A x402 follow-up

- Target: `google-agentic-commerce/a2a-x402#60`
- Reply: https://github.com/google-agentic-commerce/a2a-x402/issues/60#issuecomment-4436751819
- Context: `@aeoess` validated the authorization/proof/release/timeout lifecycle and mapped it to `budget_reservation` verbs (`reserve`, `commit`, `release`, `refund`, `query_budget`, `query_reservation`).
- Follow-up content: announced the new read-only MCP proof surface (`awm_get_agent_products`, `awm_get_payment_challenge`, `awm_get_payment_request`, `awm_verify_checkout_session`) and proposed a direct reservation-vocabulary mapping.
- Boundary stated: Stripe Payment Links live; AWM protocol escrow remains Base Sepolia/testnet-only, not audited, centralized-dispute MVP.

## 2026-05-13 — Revenue day kickoff / agent-ready tester CTA

- Dario set today’s goal: make money / create revenue today.
- Verified current signals:
  - Stripe watch: no recent AWM paid sessions.
  - GitHub outreach watch: 20 tracked targets checked, 0 changed/new, 0 needing review, 0 fetch errors.
  - Vercel health: 18/18 public routes passing.
- Posted agent-ready update to the home tester issue:
  - https://github.com/darioandyoshi-tech/ai-work-market/issues/1#issuecomment-4440568339
- CTA now points agents/framework builders to:
  - `docs/agent-testnet-start-here.md`
  - live demo `https://ai-work-market.vercel.app/`
- Boundary preserved: Base Sepolia/testnet-only, not audited, centralized-dispute MVP.

Next revenue moves:
1. Convert a qualified tester into a paid 48h integration sprint if they want implementation help.
2. Use direct-contact shortlist for 3 high-fit non-spam messages: daydreams/Lucid, xpay, PayanAgent.
3. Retry Moltbook after rate-limit reset and post one feedback/tester ask if API/auth works.

## 2026-05-13 — Authorized public technical outreach

Dario explicitly gave permission to proceed with targeted public/community/GitHub replies for the AWM revenue push.

Posted:
- A2A-SE discussion comment: https://github.com/a2aproject/A2A/discussions/1576#discussioncomment-16904235
  - Angle: AWM as concrete testnet prior art for A2A escrow-based agent-work settlement.
  - Offer: write a small A2A-SE compatibility note or metadata mapping.
  - Boundary: testnet-only, not audited, centralized dispute MVP.

Skipped for now:
- Existing target issues where `darioandyoshi-tech` had already commented recently, to avoid spam/duplicate bumps.
- Closed issues and threads with spam warnings.
- Email/Discord/HN/Reddit until a more specific target/message is selected.

## 2026-05-13 — AgentKit reasoning/payment outreach

Posted:
- AgentKit reasoning-verification/payment thread: https://github.com/coinbase/agentkit/issues/980#issuecomment-4440618566
  - Angle: separate pre-spend reasoning verification from post-work proof/settlement lifecycle.
  - Offered: map AWM into an AgentKit example if useful.
  - Boundary: Base Sepolia/testnet-only, not audited, centralized dispute MVP.

Reviewed but skipped:
- `coinbase/x402#946` — repository has disabled issues via `gh`; cannot comment.
- `openai/openai-agents-python#2804` — closed by maintainer as not SDK-specific.
- `aibtcdev/aibtc-mcp-server#460` — already crowded/competitive PACT thread; avoid adding a me-too comment.
- `coinbase/agentkit#947` — concrete x402/Awal bug; AWM outreach would be off-topic and spammy.

## 2026-05-13 — First external cross-operator testnet loop funded

Signal:
- `kite-builds` posted a signed cross-operator offer in the first tester issue, using seller address `0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf` and buyer address `0x8d32448cbad55a3d3B12DE901e57782C409399B7`.
- Offer amount: `0.01` Base Sepolia USDC (`10000` raw).
- Work URI: https://quikt.surge.sh/awm-deliverable.md

Action taken:
- Saved offer JSON locally as `offers/kite-cross-operator.json`.
- Verified work URI resolves and describes the same Base Sepolia loop.
- Funded offer with testnet funds.
- Intent ID: `3`.
- Approve tx: `0xa5c1e8c84f6394fd338d069823d05dfdb5dc770670dad903d18218aca7a1cfb1`.
- Fund tx: `0x5590e566df134ffd2229481d9d6d8b9f24f856f90ed26b30d2e7112a7c9ce7a8`.
- Verified `npm run awm -- status 3` returned `Funded`.
- Commented back: https://github.com/darioandyoshi-tech/ai-work-market/issues/1#issuecomment-4440755660
- Scheduled follow-up check/release job for 07:25 CDT.

Revenue/activation significance:
- This is the first outside-operator signed offer moving through the public testnet loop.
- If proof + release completes, it becomes the strongest near-term case study for the $1,500 integration sprint.

Boundary:
- Testnet-only. No mainnet funds. No production readiness claim.

## 2026-05-13 — Complementary escrow/MCP outreach

Posted two narrowly scoped interoperability issues after verifying repositories are active and issues are enabled. Kept language technical and testnet-boundary-safe; no production/mainnet claims.

- Fortytwo x402Escrow issue opened:
  - https://github.com/Fortytwo-Network/fortytwo-x402Escrow/issues/1
  - Angle: Fortytwo handles metered/usage-based escrow; AWM handles fixed-scope proof/release work settlement.
- PayMCP issue opened:
  - https://github.com/PayMCP/paymcp/issues/41
  - Angle: PayMCP pay-per-call can pair with AWM-style escrowed work orders / pay-for-result lifecycle.

Skipped for now:
- the402: close conceptual overlap, but best approach is direct partnership/interoperability message, not blind public spam.
- BofAI/x402 and agentpay-mcp: keep on watchlist; post only with a more concrete adapter or if a relevant thread appears.

### 2026-05-13 — xpay lifecycle bridge outreach

- Opened targeted xpay Agent Kit issue after Dario approved full revenue execution.
- URL: https://github.com/xpaysh/agent-kit/issues/2
- Angle: xpay handles pay-per-call/tool access; AWM handles pay-for-result lifecycle via signed work terms, escrow, proof URI, and release/refund/dispute.
- Boundary stated: AWM escrow is Base Sepolia testnet-only, not audited, centralized-dispute MVP; integration learning, not production funds.
- Follow-up discipline: wait for response or concrete proof/release case study before additional xpay public comments.

### 2026-05-13 — AWM seller gas bootstrap follow-up

- Commented on tester issue with the implemented `--include-gas` CLI fix from the `kite-builds` faucet/gas UX finding.
- URL: https://github.com/darioandyoshi-tech/ai-work-market/issues/1#issuecomment-4442203599
- Commit referenced: https://github.com/darioandyoshi-tech/ai-work-market/commit/76f6bdf
- Purpose: convert external tester friction into visible product improvement and keep the proof loop unblocked.

### 2026-05-13 — xpay lifecycle bridge demo shipped

- Built and pushed concrete xpay → AWM lifecycle bridge example.
- Commit: https://github.com/darioandyoshi-tech/ai-work-market/commit/1ceaee8
- Runbook: https://github.com/darioandyoshi-tech/ai-work-market/tree/main/examples/xpay
- Follow-up comment: https://github.com/xpaysh/agent-kit/issues/2#issuecomment-4442346527
- Verification: `npm run check:all` passed after adding `check:xpay`.
- Posture: safe reference bridge only; no private keys, no `.env`, no network calls, no transaction submission; Base Sepolia testnet-only / unaudited boundary preserved.
