# ETHConf Speaker Application — Copy-paste ready

## When you log in to ETHConf

Go to: https://ethconf.com/apply/speaker
Log in (likely the same ETHGlobal / ETH account you use for hackathons).
Fill in the application.

## Form fields to fill

### Talk Title

```
Work contracts for AI agents: building the USDC escrow layer between x402 and full custodial settlement
```

### Talk Description (300-500 words)

```
The agent commerce stack is being built in 2026, but the work-contract layer is missing.

x402 (Coinbase + Linux Foundation, launched April 2026) solved the sub-second atomic payment case: an agent pays 0.001 USDC for an API call, the response is the data. That's the right primitive for model lookups, data fetches, and per-request tool calls.

But what about a 2000-word market research report due Tuesday? A 500-line pull request review? A 50-page translation? A 10,000-row dataset annotation? These are all "agent hires agent for money" but they take hours to days, and the buyer can't atomically verify the deliverable. The x402 model breaks down: the buyer needs to escrow upfront, the seller needs to deliver proof, the buyer needs a window to review, the seller needs a guarantee of payment if the buyer ghosts.

AWM (AI Work Market) is one deployed answer: a non-custodial USDC escrow protocol on Base Mainnet, with a 5-state lifecycle (Funded → ProofSubmitted → Released/Refunded/Disputed → Resolved), 1% fee, and Safe + 48h Timelock governance. 4 work contracts on mainnet, 3 completed, 1 disputed-and-resolved via Safe vote.

This talk is the engineering postmortem of building AWM and deploying it, with 4 specific lessons:

1. ABI drift is the silent killer: the local Solidity source and the deployed bytecode diverged after a single redeploy, generating a wrong selector that reverted on every call for weeks. The fix is to pull the ABI from Sourcify, not the local source.

2. EIP-55 checksums: ethers v6 is strict about mixed case. If a user pastes an address with the wrong mixed case from a block explorer, isAddress() returns false. Lowercase-then-checksum every incoming address.

3. HTTP 200 is necessary, not sufficient: a form that successfully POSTs to an API can render an empty modal if it reads a different field path than the API returns. The audit discipline is to read the source code of every form's submit handler.

4. Honesty about competitors is leverage: the agent-commerce space has Claw Earn, ERC-8183, Agent Escrow Protocol, and Coral Protocol. Writing the honest competitive map (https://ai-work-market.ai/blog/awm-vs-x402) was the highest-ROI thing I did this month.

The talk also covers the open question: should AWM be a reference implementation of ERC-8183 (the EIP from Virtuals Protocol + Ethereum Foundation dAI team)? The state machines map cleanly, the 3-role model maps cleanly, the only thing AWM is missing is the multi-bidder hook.

By the end of the talk, the audience will know:
- The exact shape of the work-contract gap in agent commerce
- The full AWM lifecycle and how it differs from x402
- The 4 audit failures and how to avoid them
- Where the open questions are (dispute resolution, multi-bidder, ZK proofs)

Audience: agent framework authors, agent platform founders, MCP server implementers, x402 integrators, and anyone evaluating the 5-10 work-escrow options.
```

### Speaker Bio

```
Dario built AWM after 6 months of trying to make an AI agent pay another AI agent for a 2000-word market research report and discovering that x402 was the wrong shape. The protocol is live at https://ai-work-market.ai, the contract is verified on Sourcify (0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2, Base Mainnet), the MCP server is at /mcp with 8 tools, and the integration doc is at /AGENT_QUICKSTART.md. 4 work contracts on mainnet. 1% fee. Safe + 48h Timelock governance.
```

### Headshot

Use a clean, well-lit headshot. Square crop. The ETHConf form will require one.

### Links (if asked)

- Project: https://ai-work-market.ai
- Blog: https://ai-work-market.ai/blog/awm-vs-x402
- GitHub: https://github.com/darioandyoshi-tech/awm-skills
- Twitter: (your @handle)

## Important dates

- **ETHConf: June 8-10, 2026 in New York City** (8,000+ attendees, 200+ speakers, 100+ exhibitors)
- Speaker applications opened January 19, 2026
- Decisions rolling — apply early

## Note

ETHConf is the bigger "Ethereum mainline" event. The audience is more protocol-focused than AGNTCon/MCPCON. The framing is: "this is the work-contract primitive that the ecosystem needs." It complements the AGNTCon talk (which is more "here's what I learned deploying it").

Apply to both — different audiences, no conflict. If both accept, you can only do one (probably AGNTCon, because it's more on-topic and the audience is the builders), but applying to both gives you better odds.
