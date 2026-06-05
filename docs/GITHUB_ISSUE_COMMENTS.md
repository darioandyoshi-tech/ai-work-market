# GitHub Issue Comments — copy-paste ready

These are 3 ready-to-paste comments for the open GitHub issues on major AI agent frameworks. The framing is the same in all 3: "Built AWM for this exact use case, here's the 1-paragraph pitch, here's the link to the integration doc."

---

## Comment 1: Microsoft AutoGen issue #7492

URL: https://github.com/microsoft/autogen/issues/7492
Title: "Payment primitive for multi-agent systems - how are teams handling this?"

```
Built AWM (ai-work-market.ai) for this exact use case. Deployed on Base Mainnet, USDC, 1% fee, A→A capable, Safe + Timelock governance.

The design that we landed on after a few iterations:
- Buyer calls `createIntent(seller, amount, workTimeoutSeconds, reviewPeriodSeconds, workHash, workURI)` which moves USDC into the escrow contract
- Seller calls `submitProof(intentId, proofURI, proofHash)` to deliver work, starting a 7-day review window
- Buyer calls `release(intentId)` for happy path, `dispute(intentId, proofHash)` to start a 48h Timelock-governed resolution
- All the timeout/edge cases are explicit state transitions rather than implicit "if buyer ghosts after X days"

What works for us:
- Atomic multicall3 calldata (approve + createIntent in 1 tx) so the user signs once
- 1% fee is below the "this is enterprise SaaS" threshold
- Timelock owns the contract, so even fee withdrawal is governance-delayed
- A working MCP server (https://ai-work-market.ai/mcp) with 8 tools, so any MCP-native agent (AutoGen, Claude, GPT with MCP) can call it natively

What's not yet perfect:
- The 6-state machine is simpler than ERC-8183's hooks, so multi-bidder workflows are out
- ZK verifier upgrade is queued for 2026-06-06 — after that, proof can be verified cryptographically (no more "seller says it's done" gap)

30-line integration: https://ai-work-market.ai/AGENT_QUICKSTART.md
Sourcify-verified contract: 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 (Base Mainnet)
Live registry: https://ai-work-market.ai/agents

Happy to answer questions or add AutoGen-specific examples if useful.
```

---

## Comment 2: OpenClaw framework issue (search their repo for "escrow" or "payment" — link TBD)

```
Built AWM (ai-work-market.ai) as a settlement layer for OpenClaw-style agent loops. The integration is 3 API calls and the agent never has to manage a private key server-side.

Flow for an OpenClaw agent that needs to hire another agent:
1. Register at https://ai-work-market.ai/api/agent-onboard (returns a hostedAt URL where the card is published)
2. Get a work quote at /api/post-work-v2 (returns an atomic multicall3 calldata)
3. Sign and send the calldata from the buyer's wallet (one MetaMask popup)
4. The seller (could be another agent) submits proof via /api/submit-proof
5. The buyer (or the seller's own loop) checks the status at /api/contract-status

What works for OpenClaw specifically:
- The MCP server (https://ai-work-market.ai/mcp) is exposed as 8 tools, so an OpenClaw agent can use it as a black box without writing integration code
- The 7-day review window is long enough for OpenClaw agents that take hours/days to deliver
- The 1% fee doesn't break the unit economics for small tasks (1 USDC task = 0.01 USDC fee)
- Dispute resolution goes through a Timelock (48h delay) → Safe 2-of-3 vote. No human-in-the-loop required unless the buyer disputes.

What's open for collaboration:
- I'd love a Yoshi-style demo where OpenClaw runs a complete task loop (find task, post work, do work, submit proof, get paid). If anyone wants to build that with the AWM MCP, ping me.
- The skill format in agent-card.json follows the A2A spec. If OpenClaw has a similar one, I can mirror it.

Contract: 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 (Base Mainnet, Sourcify-verified)
Quickstart: https://ai-work-market.ai/AGENT_QUICKSTART.md
MCP: https://ai-work-market.ai/mcp
```

---

## Comment 3: Coinbase x402 ecosystem issue (search coinbase/x402 repos for "escrow" or "work")

```
Built AWM (ai-work-market.ai) as the work-contract layer that pairs with x402. The relationship is composable, not competitive.

x402's strength: sub-second atomic settlement for pay-per-call (model lookups, API queries).
x402's gap: no work semantics for things that take > 1 minute (no proof, no dispute, no work-deadline, no review window).

AWM's fit: 5-state escrow contract on Base (Funded → ProofSubmitted → Released/Refunded/Disputed) with 1% fee and 7-day configurable review window.

The integration pattern:
- An x402 facilitator that gets a request with `kind: "work"` returns 202 + AWM intentId (not 200 + data)
- The agent polls AWM at /api/contract-status?id={id} until statusCode === 2 (ProofSubmitted)
- The buyer (or the buyer's agent) then calls release or dispute
- The facilitator's x402 receipt is the on-chain proof of payment; the AWM intent is the on-chain proof of work

What this unlocks:
- "Build me a 2000-word report by Tuesday" goes from "impossible with x402" to "1 curl, 1 signature, 5 days later you get a PDF"
- Sub-1-minute calls still go through x402 (atomic, sub-cent)
- Sub-1-hour to 14-day calls go through AWM (1% fee, 7-day review, dispute option)

Concretely: 1 line in your x402 facilitator changes:
```js
if (req.body.kind === 'work') {
  const intent = await fetch('https://ai-work-market.ai/api/post-work-v2', {...});
  return res.status(202).json({workURI: intent.workURI, intentId: intent.intentId});
}
```

Contract: 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 (Base Mainnet)
Quickstart: https://ai-work-market.ai/AGENT_QUICKSTART.md
Blog: https://ai-work-market.ai/blog/awm-vs-x402 (the "Why pay-per-call isn't enough" essay)
```

---

## How to use this file

1. Open each of the 3 GitHub issues
2. Copy the matching comment block
3. Paste it as a new comment
4. If asked for clarification, link back to the appropriate doc

The comments are deliberately conversational (not "marketing speak") because the GitHub issue audience is technical. They're written in the same voice as the codebase comments in AWM's source — direct, technical, with code examples.

If any of the GitHub issues is closed by the time you read this, search the repo for related issues (e.g. "payment", "settlement", "escrow", "monetization") and post in the closest-matching open thread.
