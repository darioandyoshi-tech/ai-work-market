# Sessionize Submission — Copy-paste ready

## When you log in to Sessionize

Go to: https://sessionize.com/agntcon-mcpcon-na-2026/
Log in (GitHub or email).
Click "Submit a session" or whatever the link is.

## Form fields to fill

### Title (max 200 chars)

```
Building a USDC escrow protocol for AI agent work contracts — and the 4 things I learned deploying it to mainnet
```

### Description (max 1500 chars)

```
In April 2026 the x402 Foundation launched under the Linux Foundation, backed by Coinbase, Stripe, Cloudflare, Google, and Microsoft. x402 solved the sub-second atomic payment case — agent pays 0.001 USDC for an API call, response is the data. But x402 doesn't handle work that takes more than a minute. A "build me a 2000-word market research report by Tuesday" still has no standard rail.

This talk is the postmortem of building AWM (AI Work Market) — a deployed USDC escrow protocol for agent work contracts on Base Mainnet, with 4 work contracts on mainnet (3 completed, 1 disputed-and-resolved via Safe + 48h Timelock governance). The 5-state lifecycle (Funded → ProofSubmitted → Released/Refunded/Disputed → Resolved), the 1% fee, the MCP server with 8 tools, and the 30-line integration are all in production.

The 4 things I learned:

1. ABI drift is the silent killer — the local Solidity source and the deployed bytecode are not the same after a single redeploy. Every API endpoint should pull the ABI from Sourcify, not the local source.
2. ethers v6 is strict about EIP-55 checksums — lowercase-then-checksum every incoming address.
3. HTTP 200 is necessary, not sufficient — read the source code of every form's submit handler, not just the HTTP response.
4. Honesty about competitors is leverage — the honest competitive map (Claw Earn, ERC-8183, etc) positions AWM as "the deployed, low-fee, governance-secured option" instead of "the only option."

The talk will also cover the open question: should AWM be a reference implementation of ERC-8183 (the EIP from Virtuals Protocol + Ethereum Foundation dAI team)?
```

(That's about 1400 chars, fits in 1500.)

### Type

Pick one:
- [x] Regular session (25 min) — recommended
- [ ] Lightning talk (5 min)
- [ ] Workshop (40 min)

### Track (if there are track choices)

Primary: **Interoperability, Protocols (MCP, A2A, etc) and Standards**
Secondary: **Open Infrastructure and Tooling**

### Tags (Sessionize lets you add 3-5 tags)

```
agent-commerce
mcp
escrow
usdc
work-contracts
```

### Bio / About the speaker

```
Dario built AWM after 6 months of trying to make an AI agent pay another AI agent for a 2000-word market research report and discovering that x402 was the wrong shape. The protocol is live at https://ai-work-market.ai, the contract is verified on Sourcify (0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2, Base Mainnet), the MCP server is at /mcp with 8 tools. 4 work contracts on mainnet. 1% fee. Safe + 48h Timelock governance.
```

### Photo (Sessionize wants a speaker photo)

Use the same photo you use on GitHub / LinkedIn. Or skip the photo if optional.

### Links (optional, but helps the reviewer)

- Speaker website: https://ai-work-market.ai
- Project: https://github.com/darioandyoshi-tech/awm-skills
- Twitter: (your @handle)
- LinkedIn: (your URL)

### Anything else

Sessionize will ask if you have a co-speaker. You don't — solo talk.
It may ask for an "extended abstract" or "presentation level." Pick "Advanced" or "Intermediate" — this is a technical talk.

## After you submit

Sessionize will email you a confirmation. CFP closes June 7, 2026 at 11:59 PM PDT. Notifications go out July 17, 2026.

If accepted, the talk is October 22-23, 2026 in San Jose. The 25-minute slot is 22 minutes of talk + 3 minutes Q&A.

## Backup plan if you can't make the deadline

The next big agent-protocol conferences are:
- AGNTCon + MCPCon NA 2026 (Oct 22-23, San Jose) — submitting to this
- AIEngineer World's Fair 2026 (June 29 - July 2, SF) — CFP closed May 30, missed
- MCP Conference New York (March 2026) — past
- ETHConf NYC (June 8-10) — apply separately at https://ethconf.com/apply/speaker

So the next 2026 opportunity is AGNTCon+MCPCON NA. Don't miss this one.
