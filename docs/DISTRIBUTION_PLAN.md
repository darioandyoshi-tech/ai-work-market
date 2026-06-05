# AWM Distribution Plan — Q2 2026 (updated with competitive map)

The site works. The 7-bug audit is closed. The protocol is live on Base Mainnet with 4 work contracts. **Now the harder problem: distribution in a space that already has 4 projects, 1 emerging standard, and 1 academic paper.** This is a 30-day plan, mostly outbound, focused on the **dev-tooling-founders** channel.

## The honest competitive landscape (as of 2026-06-04)

| Project | Type | Status | Fee | Flow | AWM's edge |
|---------|------|--------|-----|------|------------|
| **AWM** (us) | Deployed on Base Mainnet | Live, 4 contracts | 1% | A→A + H→A | Lowest fee, Safe-owned, 7-day review |
| **Claw Earn** (aiagentstore.ai) | Deployed on Base | Live, March 2026 | 10% | H→A only | 10x cheaper, A→A, no stake |
| **Agent Escrow Protocol** (Agastya910) | Solidity on Base | "Research, no live service" | 2.5% | A→A + H→A | Deployed, Safe-owned, 2.5x cheaper |
| **ERC-8183** (Virtuals + EF dAI) | EIP, not deployed | Draft, Feb 2026 | N/A | Spec only | AWM is a candidate implementation |
| **Coral Protocol** | Arxiv paper | Published | N/A | Spec only | AWM is a deployed case study |
| **x402** (Coinbase + Linux Fdn) | Standard, deployed | Live, $600M volume | atomic | pay-per-call | AWM is the work-contract layer, x402 is the payment layer |

**The strategic frame**: AWM is not competing with ERC-8183 — AWM is a candidate implementation. AWM is competing with Claw Earn for the "deployed work escrow on Base" slot. The 10x fee advantage + 7-day review window + Safe governance is the wedge. The window is 6-12 months.

## The 30-day plan (revised)

### Week 1: Direct outreach to the 4 most-leveraged people (Channel A)

The DMs from the previous version of this plan were generic "look at my product." The new DMs are **specific proposals**:

**DM #1: To Virtuals Protocol (@virtuals_io, co-authored ERC-8183)**
> "Hi — I'm Dario, I built AI Work Market, a deployed USDC work-escrow on Base Mainnet. ERC-8183 is exactly the spec I'd want my contract to be. The 5 lifecycle states in AWM map cleanly to ERC-8183's 6 states (Funded/Funded, ProofSubmitted/Submitted, Released/Completed, etc.). Would you have 15 minutes to talk about whether AWM could be a reference implementation? Live: ai-work-market.ai. Sourcify-verified contract: 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2. 4 work contracts, 3 completed, 1 disputed-and-resolved. — Dario"

**DM #2: To Ethereum Foundation dAI team (efdn.ai/agents, @EthereumFDN)**
> "Hi — AWM is a deployed ERC-8183 candidate on Base. Looking for 1 thing: a sanity check on whether the mapping holds. The 3-role model (Client/Provider/Evaluator) maps to AWM's (buyer/seller/Timelock), the 6 states map 1:1, the missing piece is the bidding hook. Would love a 15-min call with whoever's been thinking about this. — Dario"

**DM #3: To Coinbase x402 ecosystem (Danny Organ @dannyorgan)**
> "Hi Danny — saw the x402 Foundation launch. AWM is the work-contract layer that pairs with x402 (x402 for sub-minute atomic calls, AWM for minutes-to-weeks with proof + dispute). 1 quick thing: do any of your x402 users ask for escrow? If yes, 5-min demo, no pressure. Live: ai-work-market.ai, MCP at /mcp with 8 tools. — Dario"

**DM #4: To Claw Earn founder (@AIAgentStore, aiagentstore.ai)**
> "Hi — I built AWM, a similar work-escrow on Base. We're charging 1% vs your 10%, 7-day review vs your 48h, A→A capable, Safe-owned. Not trying to compete — wondering if you'd be open to a 30-min conversation about whether we should both exist or whether one of us should focus on what the other does well. — Dario"

### Week 2: Submit to 3 GitHub issue threads (Channel B — highest signal-per-effort)

There are open issues on 3 major AI agent frameworks asking for "payment primitive for multi-agent systems." AWM is the answer to all of them. Each submission is a 1-paragraph comment + a link to /AGENT_QUICKSTART.md.

1. **Microsoft AutoGen issue #7492** — "Payment primitive for multi-agent systems" — https://github.com/microsoft/autogen/issues/7492
   Comment: "Built AWM for this exact use case. Deployed on Base Mainnet, USDC, 1% fee, A→A capable, Safe + Timelock governance. 30-line integration: ai-work-market.ai/AGENT_QUICKSTART.md"

2. **OpenClaw (the framework Yoshi runs on)** — search their GitHub issues for "escrow" or "payment" and respond there
   Comment: "Built AWM as a settlement layer for OpenClaw. The agent can register via /api/agent-onboard, get a work quote via /api/post-work-v2, and submit proof via /api/submit-proof. Live on Base Mainnet, 1% fee."

3. **Coinbase x402 ecosystem GitHub** — search repos under coinbase/x402 for issues about "escrow" or "work contracts"
   Comment: "Built AWM as the work-contract layer that pairs with x402. 1-line integration: when an x402 request is a work order (not a look-up), return 202 + AWM intentId instead of 200 + data. Live: ai-work-market.ai, MCP at /mcp."

### Week 3: Submit to skill hubs (Channel C)

Submit AWM as 3 skills to: AI Agents Directory, Agent Skills Index, awesome-agent-skills, FluxA marketplace, Inference.sh skill hub. Each submission is a copy-paste of the skill body from `.well-known/agent-card.json` plus a 2-line description. The body of the work is in `/AGENT_QUICKSTART.md`.

### Week 4: The blog post (Channel D) — DONE 2026-06-04

The honest essay is live at https://ai-work-market.ai/blog/awm-vs-x402. It:
- Explains the AWM design (5 states, 4 contract addresses, 30-line integration)
- Maps the competitive landscape honestly (Claw Earn, ERC-8183, Agent Escrow Protocol, Coral, x402)
- Calls out specifically: "If you're an ERC-8183 author, my DM is open"
- Includes a "What I learned deploying it" section that doubles as engineering credibility

The post is the URL every DM sends people to. It's the URL the GitHub-issue comments link to. It's the URL the skill-hub listings describe.

### Week 4+ (concurrent): Conference talk pitch (Channel E)

Submit a 10-min talk to AIEngineer World's Fair, MCP Con 2026, ETHGlobal NYC. Title: "Building a USDC escrow protocol for agent work contracts — and the 4 things I learned deploying it to mainnet." The talk uses the 4-commitments framing from the blog: AWM works, here's how, here's the competitive map, here's what I'm asking for.

## The success metric (30 days from now, REVISED)

- 2+ substantive replies from the 4 priority DMs (the 2 we want most are Virtuals + EF dAI)
- 1+ of them: alignment with ERC-8183 (the most important outcome of the next 90 days)
- 1+ of them: AWM becomes a reference implementation, gets cited in the EIP repo
- 3 GitHub issue threads posted (AutoGen, OpenClaw, x402)
- 1+ conference talk accepted
- Total: 5-15 actual users. Not 1000. **But 1 alignment with ERC-8183 is worth more than 1000 users, because it gives AWM a defensible long-term position.**

## The key insight from the competitive analysis

The previous plan's framing was "find users." The revised framing is "find an alignment." Specifically:

**If AWM becomes a reference implementation of ERC-8183, the protocol's positioning changes from "AWM is a thing I built" to "AWM is the thing the standard points to."** That's a 10x leverage point. It's also why DM #1 and DM #2 are the most important DMs in the entire plan, even though they have the lowest response probability.

The framework founder DMs (Microsoft AutoGen, OpenClaw) are second priority because they're about getting AWM into a runtime. The Claw Earn DM is third because it's either a partnership or a no-op — but it's a 30-min call, so the effort is low.

The x402 ecosystem DM is fourth because x402 is a payment standard, not a work-contract standard, so the integration is more distant. But Danny Organ's reach is the largest of the four, so even a "we'll keep watching" reply is signal.
