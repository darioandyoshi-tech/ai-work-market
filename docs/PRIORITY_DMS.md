# Priority DMs — 4 to send, in order of leverage

These are the 4 DMs that matter most for the next 30 days. Each is drafted in your voice — I wrote them as if I were Dario, but **you should re-write them in your own words before sending**. The framing is right; the words are just my best guess at yours.

Send via Twitter DM (DMs > public tweets for first contact). If you can't find a Twitter profile, try LinkedIn, Discord, or the contact form on their project's site.

When you send, update the tracker at the bottom of this file.

---

## DM #1: To Virtuals Protocol (the ERC-8183 author) — HIGHEST LEVERAGE

**Find them at**: @virtuals_io on Twitter, https://www.virtuals.io
**The conversation**: alignment with ERC-8183. AWM becomes a reference implementation.

```
Hi — I'm Dario, I built AI Work Market, a deployed USDC work-escrow
on Base Mainnet (0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2,
Sourcify full_match).

Reading your ERC-8183 spec, the 5 lifecycle states in AWM map
cleanly to your 6 states (Funded/Funded, ProofSubmitted/Submitted,
Released/Completed, Refunded/Expired, Disputed/your dispute hook).
The 3-role model (Client/Provider/Evaluator) maps to AWM's
(buyer/seller/Timelock-governed dispute resolver).

AWM has 4 work contracts on mainnet (3 completed, 1 disputed-and-
resolved via the Safe 2-of-3 + 48h Timelock). 1% fee. USDC. Live.

Two questions, if you have 15 minutes:
1. Is the ERC-8183 reference implementation list open? If yes,
   AWM would be a candidate.
2. The bidding hook (multi-provider) — would that be useful for
   AWM's roadmap, or is single-seller-per-work-contract a
   different market?

Either way, AWM is at https://ai-work-market.ai, the MCP is at
/mcp (8 tools), and I just cross-referenced AWM + the SAR PR
on coinbase/x402 (#46) — happy to extend the same alignment
here.

— Dario
```

**Why this is the highest-leverage DM**: 1 alignment with ERC-8183 is worth 1000 users. AWM gets cited in the EIP repo, becomes a reference implementation, and inherits the standard's gravity.

---

## DM #2: To Ethereum Foundation dAI team — HIGHEST LEVERAGE

**Find them at**: https://ethereum.org/ai/, @EthereumFDN on Twitter, or the dAI team's individual researchers (look at the byline on the ERC-8183 spec)
**The conversation**: technical sanity check. Are we aligned?

```
Hi — I'm Dario, I built AWM, a deployed ERC-8183 candidate on
Base Mainnet. The 6-state machine in ERC-8183 maps 1:1 to AWM's
5 states. The 3-role model (Client/Provider/Evaluator) maps
cleanly. The hooks I haven't implemented yet are the bidding
hook and the zkML-evaluator hook.

AWM is live with 4 work contracts (3 completed, 1 disputed-and-
resolved), 1% fee, Safe + 48h Timelock governance. Sourcify-
verified.

Two questions:
1. Is the ERC-8183 workgroup looking for a reference
   implementation? AWM could be a starting point.
2. Is the Evaluator role intended to be pluggable per-job, or
   fixed at the contract level? (AWM is per-job; the Evaluator
   is whoever wins the Safe vote at dispute time.)

If useful, happy to do a 15-min walkthrough.

— Dario
```

**Why this is the highest-leverage DM**: Ethereum Foundation endorsement = AWM becomes the canonical Base Mainnet implementation. That single event puts AWM ahead of Claw Earn, Agent Escrow Protocol, and any future ERC-8183 implementer by 12+ months.

---

## DM #3: To Coinbase x402 ecosystem (Danny Organ @dannyorgan) — HIGH REACH

**Find them at**: @dannyorgan on Twitter, also @CoinbaseDev, also the CDP team on Discord
**The conversation**: AWM as the work-contract layer that pairs with x402.

```
Hi Danny — saw the x402 Foundation launch. Congrats.

I built AWM, the work-contract layer for the cases x402 doesn't
fit. x402 is great for atomic pay-per-call (sub-second, no proof
needed). AWM is for minutes-to-weeks work that needs proof +
dispute + release.

I just cross-referenced AWM + the SAR PR on coinbase/x402
(#46) — same gap, different time horizon.

One quick question: do any of your x402 users ask for escrow,
or for the case where the work takes > 1 minute? If yes, 5-min
demo, no pressure.

Live: https://ai-work-market.ai
MCP: https://ai-work-market.ai/mcp (8 tools)
Sourcify-verified contract on Base Mainnet.

— Dario
```

**Why this is the highest-reach DM**: Danny Organ's reach is the largest of the four. Even a "we'll keep watching" reply is signal — AWM gets seen by everyone who watches the x402 ecosystem.

---

## DM #4: To Claw Earn / AI Agent Store founder — LOW-LEVERAGE BUT FAST

**Find them at**: @AIAgentStore on Twitter, https://aiagentstore.ai, or the Claw Earn docs contact
**The conversation**: partnership or division of labor, not competition.

```
Hi — I built AWM, a similar work-escrow on Base Mainnet. We're
charging 1% vs your 10%, 7-day review vs your 48h auto-approve,
A→A capable vs H→A only, Safe + Timelock vs single-key protocol
wallet, no-stake-required vs 10% stake.

Same problem, different product. Not trying to compete — wondering
if you'd be open to a 30-min conversation about whether we should
both exist (different segments), whether one of us should focus
on what the other does well (Claw Earn: marketplace + H→A UX;
AWM: low-fee + A→A + governance), or whether there's a partnership
in there somewhere.

— Dario
```

**Why this is low-leverage but fast**: 30-min call, low response probability, but the response is either "yes, let's talk" (high value) or "no thanks" (no harm done). The effort is small.

---

## The 30-day outreach tracker

Update this daily for the first 30 days. Honest counts, not aspirational.

| Channel | Sent | Replies | Positive | Pilots | Notes |
|---------|------|---------|----------|--------|-------|
| DM to Virtuals Protocol |  |  |  |  |  |
| DM to EF dAI team |  |  |  |  |  |
| DM to Coinbase x402 (Danny) |  |  |  |  |  |
| DM to Claw Earn founder |  |  |  |  |  |
| AutoGen #7492 (posted 2026-06-04) | ✓ |  |  |  |  |
| OpenClaw #86448 (posted 2026-06-04) | ✓ |  |  |  |  |
| Coinbase x402 PR #46 (posted 2026-06-04) | ✓ |  |  |  |  |
| Skill hub: AI Agents Directory |  |  |  |  |  |
| Skill hub: Agent Skills Index |  |  |  |  |  |
| Skill hub: awesome-agent-skills |  |  |  |  |  |
| Conference: AIEngineer |  |  |  |  |  |
| Conference: MCP Con |  |  |  |  |  |
| Conference: ETHGlobal NYC |  |  |  |  |  |

## After 30 days, count

- 2+ substantive replies from the 4 DMs → keep going, do the 3 site upgrades
- 1+ alignment with ERC-8183 (Virtuals or EF dAI) → do the 3 site upgrades + ship the A→A work-order flow
- 0 replies in 3+ channels → keep AWM as a portfolio piece, don't invest more time

The honest rule: 1 ERC-8183 alignment is worth 1000 users. 1000 users without ERC-8183 alignment is worth 1 ERC-8183 alignment. Pick the higher-leverage event.
