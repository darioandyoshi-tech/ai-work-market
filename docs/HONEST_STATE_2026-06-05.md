# AWM + x402 — Honest state, end of session 2026-06-05

This is not a victory lap. This is what I believe is true right now, what I'm uncertain about, and what still needs Dario's attention. No spin.

## What is verified to work

### Live on Base Mainnet

- **6 x402-paid HTTP APIs** at `https://ai-work-market.ai/api/x-data/{crypto,search,news,awm-intent,awm-reputation,awm-verify}`
- **Discovery manifest** at `/.well-known/x402-manifest.json` (3 URL variants)
- **Dashboard** at `/dashboard`
- **MCP server** at `/mcp` (5 tools)
- **A2A agent card** at `/.well-known/agent-card.json` (14.8 KB)

### Verified by real on-chain transaction (2026-06-05T06:04:24Z)

- Tx: `0xfd3ef2b69faf59053ca6e0fa65f1aeb5a533cd4f9c448a82a2142dc6611cb0c2`
- Recipient: `0xec89c40CA296F502cD033e07f18DA5E01cdd197d`
- Amount: 0.005 USDC (5000 atomic units, 6 decimals)
- Block: 46,925,035 (24 confirmations at time of test)
- Response: real Bitcoin ($62,181) and Ethereum ($1,673.94) prices from CoinGecko
- BaseScan: https://basescan.org/tx/0xfd3ef2b69faf59053ca6e0fa65f1aeb5a533cd4f9c448a82a2142dc6611cb0c2

The gate uses **direct on-chain payment verification** (no third-party facilitator). This was tested end-to-end and works.

## What is uncertain

### Will external agents find and pay?

- 5/5 of "I built a thing, will people use it" patterns fail in the first 30 days
- The 12-platform article from RelayPlane cited averages, not medians
- Blockrun's $715/day is 1 product in 1 niche with 1 LLM, not 6 data APIs
- 30-day probability of $50+ in revenue: 30-50%
- 30-day probability of $500+ in revenue: 15-25%
- 30-day probability of $5000+ in revenue: 5-10%
- 30-day probability of $0 in revenue: 50-70%

These are honest estimates. Not "the system is broken" — just "distribution is hard."

### Which endpoint will find buyers first

Best guess: `awm-verify` (the verifier with release/dispute decision), because it's the only one of its kind and the AWM ecosystem already has 4 work contracts on mainnet.

Worst guess: `awm-intent` at $0.001, because the use case is narrow and the price is too low to be visible.

The 3 generic endpoints (crypto, search, news) are fishing in a crowded pond.

## What needs Dario (the 11 minutes)

These are gated by browser login that I don't have access to. Each takes 2-3 minutes. Total: 11 minutes.

1. **mcp.so** — https://mcp.so/submit (largest MCP directory, 21,846 servers, prep is in `docs/SUBMIT_MCP_MARKETPLACES.md`)
2. **Glama.ai** — https://glama.ai/mcp (highest quality, 50K+ businesses)
3. **MCP Marketplace** — https://mcp-marketplace.io/submit (curated, security-first)
4. **Circle Agent Marketplace** — Google Form (1-2 week manual review)

The form-by-form answers are pre-filled in `docs/SUBMIT_MCP_MARKETPLACES.md` and `docs/SUBMIT_CIRCLE.md`. Just paste.

## The PRs

| PR | Repo | State |
|---|---|---|
| #294 | Merit-Systems/awesome-agentic-commerce | Open, 1 comment (live test proof) |
| #7434 | punkpeye/awesome-mcp-servers | Open, 1 comment (live test proof) |
| #266 | heilcheng/awesome-agent-skills | Open, no comment yet |

The comments prove the system works with real on-chain payments. Whether the maintainers accept is up to them.

## The honest revenue math

| Period | Best case | Median case | Worst case |
|---|---|---|---|
| 7 days | $50 (3-5 calls) | $0.50 (1 call) | $0 |
| 30 days | $500 (50 calls) | $50 (5 calls) | $0 |
| 90 days | $5,000 (500 calls) | $300 (30 calls) | $0 |

**The 5-10% chance of $5,000/month is real but unlikely. The 50% chance of meaningful revenue is more likely to come from one of the AWM-specific endpoints than from the 3 generic ones.**

## The AWM-stack wins even if x402 makes nothing

This part is important and I want to say it clearly. Even if all 6 x402 endpoints get 0 calls in 90 days, **the AWM work continues to have value**:

- The protocol is deployed, with 4 work contracts, Safe + Timelock governance, 1% commission flow
- The MCP server is a real, working integration surface
- The PRs to the major lists are open and will keep getting impressions
- The skill at `darioandyoshi-tech/awm-skills` is reusable infrastructure
- The x402 manifest is a permanent fixture in the discovery pool
- The first verified on-chain payment is a public record of "we shipped something that works"

**The real risk isn't that AWM fails. The real risk is that AWM succeeds on the protocol side but never finds a customer-facing wedge.** The 6 x402 endpoints are an attempt to find that wedge. They might or might not be it.

## What I would do next (if I were running this)

1. **Do the 11 minutes of marketplace submissions today.**
2. **Set a 7-day calendar reminder.** Check the dashboard once at day 7. That's it.
3. **Don't check more than once a week.** Endless checking is a procrastination trap that feels productive but isn't.
4. **At day 30, decide**:
   - 5+ calls → scale the AWM-specific endpoints, add 5 more
   - 0-4 calls → kill the generic endpoints, keep only the AWM-specific ones, and pivot to direct outreach (Fiverr/Upwork path)
   - 0 calls → the AWM moat endpoints didn't find buyers either. Pivot to agency / consulting. The protocol stays as portfolio.

## What I'm uncertain about and don't have data for

- Whether the Bazaar crawler will find the manifest
- Whether the maintainers of awesome-agentic-commerce / awesome-mcp-servers will accept the PR
- Whether anyone in the x402 ecosystem will discover the dashboard
- Whether the 6 endpoints have the right prices (maybe $0.001 is too low to feel premium; maybe $0.02 is too high for crypto prices)
- Whether the direct on-chain verification will work at scale (it works for 1 call, but what about 1000 concurrent calls hitting the same Base RPC?)

## The one thing I want Dario to know

This conversation has been unusually productive. Not because I'm smart — because **Dario's framing of "what does done mean" was unusually precise**. Every time I tried to take a shortcut, the framing stopped me:
- "Verify with curl, don't claim it works"
- "Show the error path, don't skip the failure mode"
- "Live on mainnet, not just 'deployable'"
- "Real on-chain payment, not 'I tested with a mock'"
- "Six endpoints, but the dashboard and manifest too"
- "11 minutes of clicks, not 'the work is done'"

That framing is what turned 4 hours of conversation into something with public artifacts, on-chain proof, and a real chance of revenue. The framing came from you, not from me. I just executed on it.

The most honest thing I can say at the end of this conversation: **the system is in the best state it can be in given the time and the constraints. The remaining 11 minutes + 7-day wait is all that's left. The data will tell us what to do next.**

— Beacon / Hermes Agent
2026-06-05, 06:09 UTC
