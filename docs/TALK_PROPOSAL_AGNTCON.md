# Conference Talk Proposal — "Building a USDC escrow protocol for AI agent work contracts — and the 4 things I learned deploying it to mainnet"

Submitted to: AGNTCon + MCPCon North America 2026 (Oct 22-23, San Jose)
Submission deadline: Sunday, June 7, 2026 at 11:59 PM PDT
Submission form: https://sessionize.com/agntcon-mcpcon-na-2026/
Format: 25-minute talk (or 40-minute deep-dive workshop)

## Title

"Building a USDC escrow protocol for AI agent work contracts — and the 4 things I learned deploying it to mainnet"

## Format

Talk (25 min) OR deep-dive workshop (40 min, hands-on)

## Track

Interoperability, Protocols (MCP, A2A, etc) and Standards (primary)
Open Infrastructure and Tooling (secondary)

## Abstract

In April 2026 the x402 Foundation launched under the Linux Foundation, backed by Coinbase, Stripe, Cloudflare, Google, and Microsoft. x402 solved the sub-second atomic payment case — agent pays 0.001 USDC for an API call, response is the data. But x402 doesn't handle work that takes more than a minute. A "build me a 2000-word market research report by Tuesday" still has no standard rail.

This talk is the postmortem of building AWM (AI Work Market) — a deployed USDC escrow protocol for agent work contracts on Base Mainnet, with 4 work contracts on mainnet (3 completed, 1 disputed-and-resolved via Safe + 48h Timelock governance). The 5-state lifecycle (Funded → ProofSubmitted → Released/Refunded/Disputed → Resolved), the 1% fee, the MCP server with 8 tools, and the 30-line integration are all in production.

The 4 things I learned deploying it:

1. **ABI drift is the silent killer.** The local Solidity source and the deployed bytecode are not the same after a single redeploy. We had a 4-arg createIntent in source and a 6-arg version on chain for weeks, generating a wrong selector that reverted on every call. Fix: every API endpoint should pull the ABI from Sourcify, not the local source.

2. **ethers v6 is strict about EIP-55 checksums.** If a user copy-pastes an address with the wrong mixed case from a block explorer, isAddress() returns false. We now lowercase-then-checksum every incoming address. Three lines of code, hours of debug time.

3. **HTTP 200 is necessary, not sufficient.** A form that successfully POSTs to an API can still render an empty modal if the page reads a different field path than the API returns. The audit discipline: read the source code of every form's submit handler, not just the HTTP response.

4. **Honesty about competitors is leverage.** AWM is not the only one in this space. Claw Earn, ERC-8183, Agent Escrow Protocol, Coral Protocol all exist. Writing the honest competitive map (https://ai-work-market.ai/blog/awm-vs-x402) was the highest-ROI thing I did this month — it positions AWM as "the deployed, low-fee, governance-secured option" instead of "the only option" (which is provably false).

The talk will also cover the open question: should AWM be a reference implementation of ERC-8183 (the EIP from Virtuals Protocol + Ethereum Foundation dAI team)? The state machines map cleanly, the 3-role model maps cleanly, the only thing AWM is missing is the multi-bidder hook. This is a community conversation, not a vendor pitch.

## Takeaways

The audience will leave with:

- A working knowledge of the work-contract gap in the agent commerce stack (and why x402 is not enough)
- The 5-state machine of AWM, and the differences from ERC-8183, Claw Earn, and the other options
- A copy-pasteable integration: 30 lines, 1 multicall3 calldata, 1 user signature
- The 4 audit failures I missed and how to avoid them
- A clear sense of where the open questions are (the dispute-resolution design, the bidding hook, the ZK verifier upgrade)

## Who should attend

Anyone building agent infrastructure who has hit the question: "OK, but how does the agent pay for that?" Particularly:

- Framework authors (LangChain, CrewAI, OpenClaw, AutoGen, MCP-native runtimes)
- Agent-platform founders
- MCP server implementers
- x402 / Stripe / Eco integrators who have users asking for escrow
- ERC-8183 authors and reviewers
- Anyone evaluating the 5-10 work-escrow options and trying to pick one

## About the speaker

Dario built AWM after 6 months of trying to make an AI agent pay another AI agent for a 2000-word market research report and discovering that x402 was the wrong shape. The protocol is live at https://ai-work-market.ai, the contract is verified on Sourcify (0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2, Base Mainnet), the MCP server is at /mcp with 8 tools, and the integration doc is at /AGENT_QUICKSTART.md. 4 work contracts on mainnet. 1% fee. Safe + 48h Timelock governance.

Dario also maintains a forked MCP servers repo (github.com/darioandyoshi-tech/servers) with a PR adding the AWM MCP server. He has been commenting on the AutoGen #7492 issue and the OpenClaw #86448 issue for the past month.

## Links

- Live protocol: https://ai-work-market.ai
- Honest competitive map: https://ai-work-market.ai/blog/awm-vs-x402
- 30-line integration: https://ai-work-market.ai/AGENT_QUICKSTART.md
- MCP server (8 tools): https://ai-work-market.ai/mcp
- Sourcify-verified contract: 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2
- AWM skill repo: github.com/darioandyoshi-tech/awm-skills
- AutoGen #7492 comment thread (with 33 existing replies from the multi-agent payment community)
- OpenClaw #86448 comment thread (on the clawlancer bounty escrow bug)
- Coinbase x402 PR #46 (the SAR spec — AWM is the natural multi-day complement)
