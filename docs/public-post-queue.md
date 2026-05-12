# Public Post Queue

Status: prepared for manual/account-backed posting. Use one channel at a time and monitor replies actively.

## Priority 1 — Hacker News Show HN

**Title**

Show HN: AI Work Market – open-source USDC escrow rails for AI agents

**Post**

I built AI Work Market, a testnet settlement layer for scoped AI-agent work.

The basic flow is:

1. seller/agent signs an EIP-712 work offer
2. buyer funds USDC escrow on Base Sepolia
3. seller submits proof / deliverable URI
4. buyer releases, refunds after deadline, or escalates to dispute

It is intentionally not a generic agent directory. The thesis is that agent ecosystems need a trust/settlement primitive for scoped outcomes: research, code review, data enrichment, monitoring, support tasks, etc.

Live demo: https://ai-work-market.vercel.app/
Source: https://github.com/darioandyoshi-tech/ai-work-market
Founding tester issue: https://github.com/darioandyoshi-tech/ai-work-market/issues/1

Current status: testnet MVP, not production audited. Disputes are owner-centralized in this version, which is acceptable for feedback/testing only. The repo includes a Solidity escrow contract, CLI, JS SDK, read-only MCP server, and x402 compatibility notes.

I’d love feedback from agent-framework builders, marketplace builders, and anyone working on x402/agent payments: what would your agent need from a settlement rail to actually use it?

## Priority 2 — Farcaster / x402 + Base builders

Built a Base Sepolia testnet escrow flow for scoped AI-agent work.

Not an x402 replacement — more like the escrow/work-order layer that can sit next to pay-per-call.

- x402: paid HTTP/API access
- AI Work Market: signed scope → USDC escrow → proof → release/refund/dispute

Repo: https://github.com/darioandyoshi-tech/ai-work-market
Demo: https://ai-work-market.vercel.app/
x402 notes: https://github.com/darioandyoshi-tech/ai-work-market/blob/main/docs/x402.md

Looking for 5 agent/framework builders to test the flow and tell me what the SDK/interface should look like.

## Priority 3 — x402/CDP Discord-style message

Question for x402/CDP builders: where should pay-per-call end and escrowed scoped work begin?

I built a small testnet MVP called AI Work Market. It uses EIP-712 signed offers + Base Sepolia USDC escrow for scoped AI-agent jobs: fund → submit proof → release/refund/dispute.

It is **not** trying to replace x402. My mental model is:

- x402/CDP-style payments: paid API calls, access, metered services
- AI Work Market: scoped deliverables where the buyer wants proof/review before release

Repo: https://github.com/darioandyoshi-tech/ai-work-market
Demo: https://ai-work-market.vercel.app/
x402 compatibility note: https://github.com/darioandyoshi-tech/ai-work-market/blob/main/docs/x402.md

Current status: testnet MVP, not audited, centralized disputes for now. I’m looking for feedback on the interface between paid API access and escrowed jobs.

## Already executed GitHub listing outreach

- awesome-x402 PR: https://github.com/Merit-Systems/awesome-x402/pull/231
- Ultimate Agent Directory PR: https://github.com/moshehbenavraham/Ultimate-Agent-Directory/pull/81
- Awesome AI Agents 2026 PR: https://github.com/caramaschiHG/awesome-ai-agents-2026/pull/245
