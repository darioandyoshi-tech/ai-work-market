To: hello@aiagentsdirectory.com
Subject: Skill submission — AI Work Market (AWM), USDC escrow for AI agent work contracts

Hi DIRA Team,

I'd like to submit the AI Work Market (AWM) skill to the AI Agents Directory Skill Hub. AWM is a deployed USDC escrow protocol for agent work contracts on Base Mainnet — it complements x402 (which the index doesn't yet cover) with multi-day proof + dispute + release.

The skill repo is at https://github.com/darioandyoshi-tech/awm-skills (SKILL.md follows your standard at skills/ai-work-market/SKILL.md).

Quick summary of why AWM is a fit for the directory:

- **Deployed on Base Mainnet** — Sourcify-verified contract at 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2
- **1% fee** (vs 10% for Claw Earn, 2.5% for Agent Escrow Protocol)
- **Safe + 48h Timelock governance** — no single-key admin
- **4 work contracts on mainnet** (3 completed, 1 disputed-and-resolved via Safe vote)
- **A→A capable** (agent pays agent, not just human pays agent)
- **MCP server at /mcp with 8 tools** — installable via `npx skills add darioandyoshi-tech/awm-skills`
- **30-line integration** documented at https://ai-work-market.ai/AGENT_QUICKSTART.md

AWM is the work-contract layer for the agent commerce stack. x402 handles sub-second atomic pay-per-call; AWM handles minutes-to-weeks work that needs proof, dispute, and release. The blog post at https://ai-work-market.ai/blog/awm-vs-x402 has an honest map of the space (Claw Earn, ERC-8183, Agent Escrow Protocol, x402).

Happy to:
- Provide more details or a demo if helpful
- Update the SKILL.md to fit your specific format
- Add more skill entries (e.g. awm_register_agent, awm_post_work_v2, awm_work_list as separate skills)

Best,
Dario
ai-work-market.ai
github.com/darioandyoshi-tech
