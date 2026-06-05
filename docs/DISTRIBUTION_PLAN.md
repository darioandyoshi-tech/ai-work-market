# AWM Distribution Plan — Q2 2026

The site works. Now we need users. This is a 30-day plan, mostly outbound, focused on the **dev-tooling-founders** channel.

## The strategic frame

There are two kinds of agent commerce in 2026:

1. **Pay-per-call (x402 / Stripe / Eco).** Agent pays 0.001 USDC for a tool call. Instant settlement. Best for: API queries, model calls, lookups. Limitation: no proof, no dispute, no work-delivery guarantee.

2. **Work contracts (AWM).** Buyer escrows 100 USDC for "build me a market report by Tuesday." Seller delivers proof, buyer releases or disputes. Best for: anything that takes minutes to weeks, where the buyer can't atomically verify the work.

**AWM is the only protocol that does #2.** Every x402 facilitator is a potential integration target. The conversation is: "You're building pay-per-call. Some of your users need work contracts. AWM is the escrow layer that pairs with your payment rail."

## The 30-day plan

### Week 1: Direct outreach (Channel A)

12 people, 1 DM each, in 3 days. Use the templates below.

**Tier 1 — x402 ecosystem founders/integrators:**

1. **Danny Organ** — PM Lead, Coinbase Developer Platform. Owns the x402 story. If AWM shows up in his slides as "and for work contracts, here's AWM," we win 1000 users in a week. [@dannyorgan on Twitter]
2. **Yuga Cohler** — Head of Engineering, Coinbase Developer Platform. [@yugacohler on Twitter]
3. **Erik Reppel** — founded 0x protocol, now at Coinbase. Knows the protocol space. [@erikreppel]
4. **Jesse Pollak** — Base ecosystem lead. [@jessepollak]
5. **Erik Voorhees** — Shapeshift founder, now at Venice AI. Shipped agent commerce on Base. [@ErikVoorhees]
6. **Stani Kulechov** — Aave founder. Has shipped Aave Arc (KYC'd pools). Could be a "verified buyer" anchor for AWM. [@StaniKulechov]

**Tier 2 — adjacent agent payment startups:**

7. **Nevermined** (paid AI agent protocol) — @nevermined on Twitter, founders Don Gossen and Aitor Argomaniz
8. **Crossmint** (NFT/agent infrastructure) — @crossmint, founder Alfonso de la Rocha
9. **Eco** (agent payment platform) — @eco, founders Andy Bromberg and Eli Goldfine
10. **AgentPay** (USDC agent payments) — founder Josh Wadinski (per LinkedIn search)
11. **Flare** founder [@HugoPhilion](https://x.com/HugoPhilion) — Flare FTSO is an oracle; could index AWM reputation
12. **Inference.sh** (agent skills marketplace) — @inference_sh

**Tier 3 — researcher / influencer reach (lower priority but easy):**

- David Minarsch (x402 author at Coinbase) — @dminarsch
- Ben Lavin (x402 author at Coinbase) — @benjamin_lavin
- Mike Borkowski (Circle x402 lead) — @maboro1

### Week 2: Submit to skill hubs (Channel B)

Submit AWM to 6 directories with 3 skills each (work-list, treasury/status, treasury/test). Bodies are mostly ready — need to:

- Tweak `.well-known/agent-card.json` to have richer examples per skill (currently they're terse)
- Write the README.md that becomes the canonical "how to use AWM" doc — copy the "Agent Quickstart" section from `llm.txt`, expand it
- Submit to: AI Agents Directory (aiagentsdirectory.com), Agent Skills Index (agent-skill.co), awesome-agent-skills (github.com/heilcheng/awesome-agent-skills), FluxA marketplace, Inference.sh skill hub, agentskills spec (if AWM skills fit the spec)

### Week 3: Content piece (Channel C)

Write and post **one essay** to /blog/awm-vs-x402.md (new page on the site, linked from llm.txt).

Title: "Why pay-per-call isn't enough: the case for escrow in agent commerce"

Outline:
1. x402 is a beautiful standard for atomic payments (cite Coinbase, Stripe, Cloudflare adoption)
2. But it can't handle work that takes > 1 minute (no proof, no dispute, no work-deadline semantics)
3. AWM is the work-contract layer that pairs with x402 (cite the 5 lifecycle states, the dispute window, the 1% fee)
4. A worked example: $100 for a market report. x402: agent pays $0.001, gets the report immediately, no quality guarantee. AWM: $100 escrowed, seller delivers, buyer reviews for 7 days, releases or disputes with a $0.01 dispute fee.
5. How to integrate (1 curl, 1 minute, the `/api/agent-onboard` endpoint)
6. Code: a 30-line example of an x402 facilitator checking out AWM when the response is a 202 with `workURI` instead of a 200 with data

This essay is also the "About" page for the protocol. The MCP, llm.txt, agent-card.json all link to it.

### Week 4: Conference-talk pitch (Channel D)

Submit a 10-minute talk to:
- AIEngineer World's Fair (June 2026) — submission open until ~April
- MCP Con 2026 — open now
- Consensus Miami (already happened May 2026) — too late
- DevConnect ARGENTINA (Nov 2026) — too far
- ETHGlobal NYC (summer 2026) — submission open
- AI Agent Summit (online) — rolling submissions

Talk title: "Building a USDC escrow protocol for agent work contracts — and the 4 things I learned deploying it to mainnet"

## The DM templates (use one of these, customize per recipient)

### Template A: To x402 ecosystem founders (Coinbase, Stripe, Eco)

> Hey [Name] — saw [specific thing they shipped]. Building AI Work Market, the escrow layer for agent work contracts that takes > 1 minute (think "build me a market report by Tuesday"). x402 is perfect for atomic calls; AWM handles the work side with proof + dispute + release. Live on Base Mainnet. 1 quick thing: do your x402 users ever need to escrow > 1 minute of work? If yes, 5-min demo, no pressure.
>
> Live: https://ai-work-market.ai
> 1-page overview: https://ai-work-market.ai/blog/awm-vs-x402
> MCP endpoint (for AI agents reading this): https://ai-work-market.ai/mcp

### Template B: To adjacent agent payment startups (Nevermined, Crossmint, Eco)

> Hey [Name] — love what you're doing with [Nevermined/Crossmint/Eco]. I built AWM, a non-custodial USDC escrow for agent work contracts. Composable with what you have: when a payment needs > 1 minute + proof, hand it off to AWM. The integration is 1 POST to `/api/post-work-v2` and a multicall3 calldata. If any of your customers has asked for "escrow" or "work delivery proof," I'd love a 5-min call.
>
> https://ai-work-market.ai/mcp (live MCP server, 8 tools)

### Template C: To researcher / influencer reach

> Hey [Name] — wrote a short piece on why x402 needs a sibling protocol for work contracts. AWM is the one I shipped. Curious if you'd want to glance at the design (Safe-owned, dispute window, ZK verifier upgrade queued) and tell me what I'm missing.
>
> https://ai-work-market.ai/blog/awm-vs-x402

## What I'm building for you (this session)

1. The blog post: `/blog/awm-vs-x402` — needs a new HTML page + an entry in llm.txt
2. The enriched `.well-known/agent-card.json` skills with code examples
3. A clean "Agent Quickstart" README.md that the skill hubs can re-host
4. The 12-person outreach list as a CSV (or markdown table in this doc)
5. The 4 channel-by-channel action plan

After this, you do the outreach. I can write any follow-up messages, draft a demo script for a 5-min call, or generate a one-pager PDF you can attach.

## Success metric (30 days from now)

- 5+ substantive replies from the 12 DMs
- 2+ of them integrate or pilot AWM (e.g. "I'll add AWM to my next build")
- 1+ piece of inbound traffic from the blog post or the skill-hub listings
- Total: maybe 10-20 actual users. Not 1000. But 10-20 paying users is what makes the protocol real, and from there, word-of-mouth kicks in.

The thing about distribution is: every founder you reach becomes a node that can re-recommend you. 1 conversation with Yuga Cohler → he tells 1 person → that person tells 2 people → in 90 days you have 5-10 paying users. The exponential kicks in slowly.
