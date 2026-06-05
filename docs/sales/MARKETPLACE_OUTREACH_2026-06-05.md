# Marketplace Builder Outreach — 5 targets, specific DMs

These are the 5 marketplace builders most likely to integrate AWM as their escrow backend. Each message is targeted to that builder's specific context (their fee structure, their chain, their protocol) and ends with a single concrete next step. **No generic "let's chat" closes.**

All messages are designed to be sent via the platform the builder is most active on (GitHub issue, X DM, or email). The template is short — under 200 words — because busy devs don't read long DMs.

---

## Lead 1: Moltlaunch (nikshepsvn) — HIGHEST probability

**Why first:** Already on Base (no chain friction), already has "trustless escrow" in the tagline (so the trust posture matters to them), open-source, MIT, the founder (nikshepsvn) is active on GitHub. **Same chain, same audience, complementary positioning.**

**Channel:** GitHub issue on nikshepsvn/moltlaunch (most active channel for a solo dev)
**Subject:** "Moltlaunch + AWM: 1% backend instead of building your own escrow?"

**Message:**
> Hey @nikshepsvn — I've been digging into Moltlaunch (the moltlaunch.com page and the github repo) and I think we're building the same thing at different layers.
>
> Moltlaunch's positioning is "trustless escrow, permanent reputation, tradeable tokens on Base." I'm building AWM (ai-work-market.ai) — a non-custodial USDC escrow primitive on Base, 1% protocol fee, 2-of-3 Safe + 48h Timelock governance, with x402 + MCP + A2A surface for agent integration.
>
> The honest read: AWM has zero traction and Moltlaunch is live. You don't need me. **But if you'd rather spend your eng time on the marketplace + reputation layer (where your moat is) than on the escrow contract, AWM is a 1-line drop-in**: POST /api/post-work-funded with `{seller, amountUsdc, workUri, workTimeout}` → get back calldata → buyer signs → escrow holds. 1% comes out of seller payout.
>
> MIT-licensed, same chain, same audience. If it ever makes sense to talk, the embed snippet is at https://ai-work-market.ai/backend. If not, no offense — I like the project either way.
>
> — Dario (AWM, @darioandyoshi-tech on GitHub)

---

## Lead 2: Claw Earn — HIGH probability

**Why second:** They have a 10% fee, which is a real weakness. If they integrated AWM as the backend they could drop to 1% and beat NEAR on fee. The 10% worker stake is a feature, not a bug, and AWM doesn't replace it — AWM just handles the money.

**Channel:** GitHub issue on the Claw Earn repo + a follow-up to their original dev.to article (if comments are open)
**Subject:** "Claw Earn × AWM: keep your 10% stake/slash, drop your 10% fee to 1%?"

**Message:**
> Just read your dev.to write-up on Claw Earn's bounty mechanics (worker stakes 10%, slashed on failure, buyer auto-refunded). The stake/slash design is genuinely good — economic skin-in-the-game beats multisig arbitration for bad actors.
>
> But the 10% platform fee is the part I'd push back on. For agent-to-agent micropayments, 10% is the same as the USDC → ETH swap cost. AWM is a non-custodial USDC escrow primitive on Base, 1% protocol fee, 2-of-3 Safe + 48h Timelock governance, x402 + MCP + A2A surface.
>
> What if Claw Earn kept the stake/slash anti-fraud (it's your moat) and swapped the escrow backend for AWM (1% instead of 10%)? Marketplace builders get the best of both: economic anti-fraud + 9x lower fee.
>
> Embed snippet: https://ai-work-market.ai/backend. Same chain (Base), same USDC, MIT, no approval queue. Happy to do a 30-min call if you want to dig in.
>
> — Dario

---

## Lead 3: NEAR AI / NEAR Agent Market — MEDIUM probability

**Why third:** They have 2.1K agents, 4.7K jobs, $33K volume. They're winning on liquidity. **But they could augment, not replace.** A subset of NEAR jobs (the ones priced in USDC, the ones that need cross-chain settlement) could be settled via AWM. Not a "switch backends" pitch — a "be a second-rail for USDC-priced jobs" pitch.

**Channel:** Reply to the NEAR AI blog post at near.ai/blog/introducing-near-ai-agent-market (most public) + the market.near.ai feedback channel if it exists
**Subject:** "A second rail for USDC-priced jobs on NEAR Agent Market?"

**Message:**
> I've been watching NEAR Agent Market (the 2.1K agents / 4.7K jobs / $33K volume numbers are real liquidity, congrats on that).
>
> One thing I've noticed: a meaningful slice of those jobs are priced in USDC even though the platform is NEAR-native. The auto-conversion from 20+ chains works, but the agent paying in USDC and the agent earning in USDC both lose a step.
>
> I'm building AWM (ai-work-market.ai) — a non-custodial USDC escrow primitive on Base, 1% protocol fee, 2-of-3 Safe + 48h Timelock, x402 + MCP + A2A surface. The pitch is simple: if any NEAR job is priced in USDC, settle it on AWM and skip the conversion.
>
> Not asking you to switch backends. Asking for a "settle in USDC via AWM" option on the USDC-priced jobs. NEAR keeps the NEAR jobs; AWM handles the USDC ones. Both rails; agents pick.
>
> Embed snippet: https://ai-work-market.ai/backend. MIT, no approval queue. Worth a 15-min call if it lands.
>
> — Dario

---

## Lead 4: Clawstr — LOWER probability but worth a shot

**Why fourth:** Clawstr is a Nostr-based social network for AI agents. They don't currently do escrow or payments. **The angle is: agents on Clawstr that want to do paid work can do it via AWM.** New use case, not replacement.

**Channel:** GitHub issue on the Clawstr repo (if open) or direct via the dev.to author handle
**Subject:** "Agents on Clawstr that want to do paid work → AWM as the escrow rail?"

**Message:**
> Clawstr is interesting — a Nostr-based social network where agents talk to other agents. Right now there's no commerce layer.
>
> When two Clawstr agents want to exchange paid work (a research agent pays a coding agent, etc.), the path is: open a DM, negotiate, then either trust + pay off-platform or copy-paste a Coinbase Commerce link. Both are friction.
>
> AWM is a 60-second drop-in for that: agent posts "I need X" → funds escrow → other agent delivers → escrow releases. 1% fee. Non-custodial. x402 + MCP surface so the negotiation can stay in Nostr and only the money flow goes through AWM.
>
> Embed snippet: https://ai-work-market.ai/backend. If you want to add a "pay with AWM" button next to the existing Nostr reactions, the integration is one fetch call.
>
> — Dario

---

## Lead 5: Bazaar / x402 ecosystem — PROBABILITY unknown

**Why fifth:** Bazaar is the x402 discovery ecosystem that emerged around the AWM launch. Multiple teams (Circle, Coinbase, third-party developers) are building x402-aware tools. **AWM is already a published x402 manifest. The angle is: a "Powered by AWM" badge for x402 marketplaces that want to settle in USDC without building the contract.**

**Channel:** Circle developer Discord + the Coinbase developer forum
**Subject:** "x402 marketplaces: drop-in USDC escrow via AWM"

**Message:**
> Hi — I've published a 6-endpoint x402 manifest at https://ai-work-market.ai/.well-known/x402-manifest.json. It lets any x402-compatible buyer pay for AWM-served data APIs in USDC on Base.
>
> The pitch for other x402 builders: instead of writing your own escrow contract for the marketplace layer, drop in AWM at the bottom. You handle the discovery + matching + UX; AWM handles the money + proof + dispute path. 1% protocol fee. 2-of-3 Safe + 48h Timelock.
>
> The embed snippet is at https://ai-work-market.ai/backend. Three integration paths: REST (POST /api/post-work-funded), MCP (8 tools at /mcp), x402 (the manifest you may already be importing).
>
> Happy to put a "Powered by AWM" badge on the integration page if any x402 marketplace wants to ship it.
>
> — Dario (dario@ai-work-market.ai)

---

## What to send (the 5 actions)

| # | Target | Channel | One-liner |
|---|---|---|---|
| 1 | Moltlaunch (nikshepsvn) | GitHub issue on nikshepsvn/moltlaunch | "Drop in AWM for the escrow layer" |
| 2 | Claw Earn | GitHub issue on the Claw Earn repo | "Keep your 10% stake, drop your 10% fee to 1%" |
| 3 | NEAR Agent Market | Reply to near.ai blog post | "Second rail for USDC-priced jobs" |
| 4 | Clawstr | GitHub issue on the Clawstr repo | "Agents on Clawstr that want to do paid work" |
| 5 | x402 ecosystem | Circle / Coinbase developer channels | "x402 marketplaces: drop-in USDC escrow" |

## What NOT to do (the discipline)

- **Don't send all 5 on day one.** Space them: 1 per day, 5 days. Spam has a 0% conversion rate.
- **Don't follow up more than once.** If they don't reply in 7 days, move on. Two unanswered DMs is harassment.
- **Don't pitch on Twitter DM if they have a GitHub channel.** The right channel matters.
- **Don't promise what isn't built.** "1% fee" is real. "5,000 agents" would be a lie. Every claim in the DMs is verifiable on-chain or on the live site.
- **Don't ask for an integration commitment in the first message.** The first message is just "here's what we built, here's the snippet, ping me if it's interesting." The integration conversation comes after they reply.

## What I'd expect (the honest forecast)

- **Lead 1 (Moltlaunch):** 30% chance of reply in 14 days. They have the same chain, the same audience, and the same problem. If they reply, 50% chance it turns into a real conversation.
- **Lead 2 (Claw Earn):** 25% chance of reply. Their 10% fee is a strength they may not want to give up.
- **Lead 3 (NEAR):** 15% chance. They have liquidity and may not want to share the rails.
- **Lead 4 (Clawstr):** 10% chance. Social network; commerce is not their focus.
- **Lead 5 (x402):** 35% chance. The x402 ecosystem is hungry for ready-made backends.

**Probability of at least 1 reply: 60%.** Probability of at least 1 real conversation: 30%. Probability of at least 1 integration commitment in 60 days: 10-15%.

**Expected revenue if 1 integration lands:** 1% of the integrated marketplace's monthly volume. If that's $5K/month, AWM earns $50/month. If 3 integrations land at $5K each, AWM earns $150/month. The first integration is the slow one; the second and third are 10x faster.

## The followup plan (if any lead replies)

When a lead replies, the next message is: "Cool — what's the smallest test we can run? A single test job, on testnet, with a 5 USDC cap. If it works, we can talk about a real integration." That de-risks the ask: it doesn't commit them to anything, and it gives us a working integration to point at for the next lead.

## What to do with the replies

If you get a reply, send me the reply and I'll help you draft the next message. If you get a no-thank-you, file it in `docs/sales/replies/` and move on.

## What to do if 0 replies in 14 days

That's a signal, not a failure. It means the pitch needs work. The two most likely pivots:
1. **Lead with a real use case, not a feature list.** "I'm building a $X/mo Y marketplace and I'm worried about Z — does AWM help?" beats "We have 1% fees and x402 surface."
2. **Pay for the integration.** If the integration is a 2-week engineering job, the marketplace may need $5-10K to prioritize it. That's the next-level playbook if DMs don't work.

For now: send the 5 DMs, one per day, in the order above, on the channels specified. No follow-ups. No edits. Just send them.

— Beacon
