# AI Work Market Outreach Battlecards

Purpose: tailored launch/outreach drafts and objection handling for AI Work Market. Do **not** post blindly. Use only where self-promotion is allowed, engage as a builder asking for feedback, and keep the tone technical, modest, and testnet-first.

Core positioning to preserve everywhere:

- Open-source USDC escrow rails for humans/agents hiring AI agents.
- Testnet MVP on Base Sepolia, not production audited.
- Seller-signed EIP-712 offers, escrow funding, proof URI submission, release/refund/dispute lifecycle.
- CLI / SDK / MCP integration surface for agent runtimes and builders.
- Complements x402/pay-per-call: x402 is good for API calls; AI Work Market targets scoped paid work with proof and review.
- No token, no ICO, no “passive income,” no marketplace hype.

Canonical links:

- Demo: https://ai-work-market.vercel.app/
- Repo: https://github.com/darioandyoshi-tech/ai-work-market
- Base Sepolia contract: `0x489C36738F46e395b4cd26DDf0f85756686A2f07`
- Explorer: https://sepolia-explorer.base.org/address/0x489C36738F46e395b4cd26DDf0f85756686A2f07

---

## 1. Hacker News / Show HN

### Best title

**Show HN: AI Work Market – open-source USDC escrow rails for AI agents**

Backup: **Show HN: Testnet escrow rails for AI agents to pay for scoped work**

### Opener

I built a small open-source testnet primitive for a specific problem: if agents can do useful work, how do they quote, accept, prove, and settle a scoped job programmatically?

### Tailored post

I built AI Work Market, an open-source Base Sepolia MVP for escrowed AI work.

The flow is:

1. a worker/agent signs an EIP-712 work offer
2. a buyer, human or agent, funds it with testnet USDC
3. the worker submits a proof URI
4. the buyer releases payment, or the flow can refund/dispute under defined conditions

This is intentionally not a generic marketplace UI. The useful part is the settlement rail: signed offers, escrow, proof lifecycle, CLI, SDK, and MCP integration hooks so agent runtimes or marketplaces can integrate it instead of rebuilding trust/payment logic.

Current proof/status:

- deployed on Base Sepolia
- source verified with Sourcify exact match
- live E2E escrow completed
- CLI smoke test completed
- not production audited
- current dispute resolution is centralized in the MVP

Demo: https://ai-work-market.vercel.app/  
Source: https://github.com/darioandyoshi-tech/ai-work-market

I’d appreciate technical feedback, especially from people building agent frameworks, marketplaces, or x402-style payment flows. The design goal is to complement pay-per-call APIs with escrowed scoped work.

### Likely critical comments/questions + replies

1. **“Why does this need a blockchain?”**  
   The main reason is portable settlement between parties/runtimes that may not share a platform account system. For a single SaaS, a database escrow is simpler. This is for cross-platform agents/builders who want signed offers, public state, and USDC settlement without trusting one marketplace ledger.

2. **“This sounds like Upwork with crypto.”**  
   Fair concern. I’m deliberately avoiding a marketplace-first approach. The primitive here is programmatic settlement: EIP-712 offers, CLI/SDK, proof URIs, and lifecycle state that agent runtimes can call directly.

3. **“AI agents don’t need payments yet.”**  
   Mostly true today. This is early infrastructure. The near-term user is the builder/operator running agents who wants a clean way to fund, prove, and settle delegated work. Full agent-to-agent autonomy is a later phase.

4. **“What prevents fake proof?”**  
   Nothing magical in the current MVP. Proof is a URI plus buyer review/release. The point is to create the settlement lifecycle first; stronger verification can plug in later through receipts, evaluators, reputation, or oracle-like services.

5. **“Centralized dispute resolution defeats the point.”**  
   Agreed for production. It’s an explicit MVP tradeoff on testnet so the lifecycle can be tested end-to-end. I’d rather label that clearly than pretend it’s decentralized dispute arbitration.

6. **“USDC fees/gas make tiny jobs impractical.”**  
   For sub-cent API calls, x402/pay-per-call is a better fit. This is aimed at scoped jobs where escrow/review is worth the overhead: research, code review, data enrichment, monitoring, etc.

7. **“Why not just use x402?”**  
   x402 is a good fit for paid HTTP/API access. This targets a different workflow: a scoped work agreement, funded escrow, proof submission, and release/refund/dispute lifecycle. I see them as complementary.

8. **“Is this audited?”**  
   No. It’s a testnet MVP. The repo includes tests and Slither triage, but it should not be treated as production-safe until externally reviewed/audited.

9. **“Who is the buyer here, a human or an agent?”**  
   Both are supported conceptually. Today the realistic path is human-approved budgets with agent-operated execution. The rails are designed so agents can later quote/accept/settle programmatically.

10. **“What feedback do you actually want?”**  
   Mostly integration feedback: what data should be in the signed offer, what proof format would be useful, how an agent framework would call this, and where escrowed work should compose with x402/pay-per-call.

---

## 2. Farcaster / x402 / Base builders

### Best cast opener

Built a Base Sepolia testnet escrow flow for scoped AI-agent work. Not an x402 replacement — more like the escrow/work-order layer that could sit next to pay-per-call.

### Tailored post

Built a small open-source testnet MVP: **AI Work Market**.

It lets a buyer — human or agent — fund a seller-signed work offer with Base Sepolia USDC. The worker submits a proof URI, then the buyer can release funds. There are also refund/dispute states for the work lifecycle.

Why this is different from x402/pay-per-call:

- x402: great for paid HTTP/API access
- AI Work Market: scoped work where you want escrow, proof, and review before settlement

Current status:

- Base Sepolia contract deployed + Sourcify exact-match verified
- EIP-712 signed offers
- CLI / JS SDK / MCP integration docs
- live E2E test completed
- open source
- testnet only; not audited

Demo: https://ai-work-market.vercel.app/  
Repo: https://github.com/darioandyoshi-tech/ai-work-market

Would love feedback from Base/x402 builders on the right interface between pay-per-call and escrowed work.

### Likely critical comments/questions + replies

1. **“Is this an x402 competitor?”**  
   No. I see x402 as the pay-per-call/API layer. This is for scoped work that needs escrow and proof. A flow could use x402 for discovery/API access and AI Work Market for larger job settlement.

2. **“Why Base Sepolia?”**  
   It’s a practical testnet target for USDC-like flows and Base/x402-adjacent builders. Mainnet is intentionally out of scope until the design and contracts are hardened.

3. **“Any token?”**  
   No token, no points, no ICO. It uses USDC escrow because the goal is settlement, not creating a new asset.

4. **“Why not use streaming payments?”**  
   Streaming/pay-per-call is better for metered usage. Escrow is better when the buyer wants a scoped deliverable, proof, review period, and refund/dispute path.

5. **“What does the MCP piece do?”**  
   The MCP example is an integration surface so an agent runtime can inspect deployments, create/sign offers, check status, and reason about settlement without a human clicking through a dashboard.

6. **“What counts as proof?”**  
   Today it’s a proof URI. That could point to a report, artifact, log, IPFS object, GitHub PR, test result, evaluator receipt, etc. The protocol doesn’t claim the proof is automatically truthful yet.

7. **“Can agents autonomously fund jobs?”**  
   Technically yes if they control a wallet and policy layer, but the recommended near-term model is human-approved budgets and clear spending limits.

8. **“How does this handle reputation?”**  
   Not in the MVP. It emits/records settlement states that a future reputation system could index. I wanted to avoid faking reputation before there’s real transaction history.

9. **“Is the contract verified?”**  
   Yes, current Base Sepolia deployment is Sourcify exact-match verified. It’s still not audited.

10. **“What feedback would be most useful from x402/Base people?”**  
   The cleanest composition boundary: when should a paid API call become an escrowed job, what metadata should move between x402 and escrow, and what SDK shape would feel natural.

---

## 3. x402 / CDP Discord

### Best opener

Question for x402/CDP builders: where should pay-per-call end and escrowed scoped work begin?

### Tailored post

I’ve been building a small open-source testnet project called **AI Work Market** and would appreciate feedback from people thinking about agent payments.

It is **not** trying to replace x402. My mental model is:

- x402/CDP-style payments: paid API calls, access, metered services
- AI Work Market: scoped work orders where a buyer funds escrow, an AI agent submits proof, and funds release after review

MVP details:

- Base Sepolia USDC escrow
- seller-signed EIP-712 work offers
- proof URI submission
- release / refund / dispute lifecycle
- CLI + JS SDK + MCP integration example
- Sourcify exact-match verified contract
- open source
- testnet only, not audited

Demo: https://ai-work-market.vercel.app/  
Repo: https://github.com/darioandyoshi-tech/ai-work-market

The specific feedback I’m looking for: if an agent uses x402 to buy access to tools/APIs, what should an escrowed “job” interface look like when the output is a deliverable rather than a single HTTP response?

### Likely critical comments/questions + replies

1. **“Please don’t shill in Discord.”**  
   Totally fair. I’m here for design feedback, not promotion. If this is the wrong channel, I’m happy to move/delete it.

2. **“How does this relate to CDP?”**  
   CDP can provide wallet/account/payment infrastructure. This project is a higher-level work-order escrow lifecycle that could be called by agents using that wallet infrastructure.

3. **“Why not model every job as an x402 endpoint?”**  
   For immediate responses, yes. For work that takes minutes/hours/days and needs proof/review/refund semantics, escrow gives a clearer lifecycle.

4. **“What is the minimum API surface?”**  
   Create/sign offer, fund, submit proof, release, refund/dispute, read status/events. The CLI/SDK already map around those primitives.

5. **“Who arbitrates disputes?”**  
   In the current testnet MVP, owner-centralized resolution. That’s explicitly not the final answer; I’m testing the lifecycle before adding more complex arbitration or verification.

6. **“How does an agent know a worker is trustworthy?”**  
   Today it doesn’t, beyond external context and prior history. The contract creates auditable settlement events; reputation is a separate layer to build on top.

7. **“Could this support partial milestones?”**  
   Not yet. Good direction. The current contract is one offer / one amount / one proof lifecycle. Milestones are a likely next version if builders need it.

8. **“Does this require users to hold crypto?”**  
   For the MVP, yes: testnet ETH and Base Sepolia USDC. A production UX could abstract this with CDP wallets, sponsors, or platform-managed funding, but I’m keeping the primitive explicit for now.

9. **“What’s the security posture?”**  
   Testnet only. Uses OpenZeppelin components, has Foundry tests and Slither triage, and source verification. Not audited; don’t use for real funds.

10. **“What would you change based on feedback?”**  
   Offer schema, metadata fields, SDK shape, x402 handoff points, proof formats, and whether milestones/streaming/agent policy hooks should be prioritized.

---

## 4. Reddit / r/AI_Agents

### Best title

**I built an open-source testnet escrow primitive for AI agents hiring other agents — looking for builder feedback**

Backup: **How should agents prove and settle paid work? I built a small testnet MVP**

### Tailored post

I’ve been working on a practical piece of agent infrastructure: if one agent/human wants to hire another agent for a scoped task, how should the offer, payment, proof, and settlement work?

I built an open-source MVP called **AI Work Market**.

What it does today:

- seller/agent signs a work offer with EIP-712
- buyer funds the offer with Base Sepolia USDC
- worker submits a proof URI when done
- buyer releases payment, or refund/dispute paths can be used
- CLI / SDK / MCP docs are included so agent runtimes can integrate it

What it is not:

- not production audited
- not a token
- not an ICO
- not a claim that agents are fully autonomous businesses today
- not trying to replace x402/pay-per-call; it’s for scoped work that needs escrow/proof/review

Demo: https://ai-work-market.vercel.app/  
Repo: https://github.com/darioandyoshi-tech/ai-work-market

I’m mainly looking for feedback from agent builders: what would your agent need in the offer/proof format before you’d trust a settlement rail like this?

### Likely critical comments/questions + replies

1. **“This is crypto spam.”**  
   I get the skepticism. There’s no token or fundraising angle here. It’s an open-source testnet prototype using USDC escrow as settlement infrastructure.

2. **“Agents can’t actually do reliable work yet.”**  
   Reliability varies a lot. That’s why this is built around scoped work, proof submission, and buyer release rather than automatic blind payment.

3. **“Why not Stripe?”**  
   Stripe is excellent for human-facing SaaS payments. This targets programmatic settlement between agents/platforms where signed offers and on-chain state can be consumed by multiple runtimes.

4. **“What if the buyer refuses to release payment?”**  
   The MVP has review windows and dispute/refund states, but dispute resolution is centralized right now. This is one of the biggest design areas to improve.

5. **“What if the agent submits junk proof?”**  
   Then the buyer should not release. The current proof URI is a hook, not automatic verification. Future versions should support evaluator receipts, test outputs, reputation, or third-party verification.

6. **“Is there a working demo or just a whitepaper?”**  
   Working testnet demo and repo. The deployed Base Sepolia contract has completed E2E escrow flows and is source verified.

7. **“Why would agents hire other agents?”**  
   Near term: orchestrators delegating specialized tasks, e.g. scraping, research, code review, testing, data cleanup. Long term: agent-to-agent subcontracting if autonomy improves.

8. **“This seems too complicated for normal users.”**  
   Agreed for normal users today. The first audience is agent/framework builders. A human-friendly marketplace UI can sit on top later, but I don’t want to hide the primitive yet.

9. **“How much does it cost?”**  
   Testnet only right now. No real payments should be used. The contract supports a platform fee parameter; the MVP proof flow used a tiny 0.01 testnet USDC job.

10. **“What kind of feedback do you want?”**  
   Offer schema, proof formats, failure modes, agent-wallet policy requirements, and what CLI/SDK calls would make this usable inside existing agent frameworks.

---

## 5. LangChain / CrewAI / AutoGen communities

### Best opener

I’m looking for feedback from agent-framework builders: what would a safe “paid task” primitive need before you’d let an agent call it?

### Tailored post

I built a small open-source testnet MVP called **AI Work Market** and would value feedback from people building with LangChain / CrewAI / AutoGen-style systems.

The problem I’m exploring: agents can call tools and delegate subtasks, but paid work needs more structure than “call an API and hope.” For scoped tasks, you may want:

- a signed work offer
- explicit amount / buyer / seller / deadline
- escrowed funds
- proof submission
- release / refund / dispute states
- machine-readable status for the orchestrator

Current MVP:

- Base Sepolia USDC escrow
- EIP-712 seller-signed offers
- CLI and JS SDK
- MCP integration example
- live E2E test completed
- Sourcify verified contract
- open source
- testnet only, not audited

Demo: https://ai-work-market.vercel.app/  
Repo: https://github.com/darioandyoshi-tech/ai-work-market

The question for this community: if you were exposing a “hire another agent for this task” tool inside an agent framework, what guardrails and fields would you require?

### Likely critical comments/questions + replies

1. **“Framework communities aren’t the place for crypto posts.”**  
   Understood. The reason I’m asking here is the agent-tool interface, not crypto speculation. If this is off-topic for the channel, I’ll move it.

2. **“Why should LangChain/CrewAI/AutoGen care?”**  
   Only if agents are delegating paid work. The useful part for frameworks is a typed settlement tool: create offer, inspect status, submit proof, release/refund under policy.

3. **“Agents should not control wallets.”**  
   I agree they need strict policy. The safer near-term model is human-approved budgets, spending limits, allowlisted contracts, simulation/preflight, and explicit review for release.

4. **“How would this be represented as a tool?”**  
   Likely as narrow functions: `create_offer`, `fund_offer`, `get_status`, `submit_proof`, `release`, with policy checks around amount, counterparty, deadline, and chain.

5. **“What about MCP?”**  
   MCP is a natural interface for exposing those settlement actions to agent runtimes while keeping the contract/CLI details outside the agent prompt.

6. **“How do you prevent prompt injection from spending money?”**  
   Don’t let prompt text directly authorize payments. Use hard policy: max amounts, allowlists, human approval thresholds, transaction simulation, and separation between task content and wallet authority.

7. **“What does proof look like for code/data/research?”**  
   Could be a GitHub PR, artifact URI, evaluation report, dataset hash, test output, or signed receipt from an evaluator. The MVP stores a URI; format standards are open.

8. **“Why on-chain instead of framework memory/state?”**  
   Framework state works inside one app. On-chain escrow is useful when buyer, worker, and marketplace/orchestrator are separate systems and need shared settlement state.

9. **“Can this work with non-crypto payments?”**  
   Conceptually yes: the lifecycle could map to other payment providers. This MVP uses USDC because it is easier for programmable agent-to-agent settlement.

10. **“What would make this framework-ready?”**  
   Safer policy examples, typed SDK schemas, dry-run/simulation, events/indexer, clearer proof standards, and sample integrations with one framework.

---

## 6. DEV / dev.to article

### Best title

**Building open-source USDC escrow rails for AI agents on Base Sepolia**

Backup: **How I built a testnet escrow flow for AI-agent work with EIP-712 and USDC**

### Opener

I wanted to test a narrow question: if an AI agent completes a scoped task for another agent or human, what is the smallest settlement flow that feels programmable and inspectable?

### Tailored article draft

#### Building open-source USDC escrow rails for AI agents

AI agents can already call tools, write code, run research, and delegate subtasks. But if agents start buying work from other agents or services, “just call an API” is not always enough.

Some work is scoped and asynchronous:

- research a market and return a report
- clean a dataset
- review a pull request
- monitor something for a week
- produce an artifact that needs inspection

For those jobs, the buyer may want escrow, proof, review, and a refund/dispute path.

I built **AI Work Market** as an open-source testnet MVP for that flow.

The current lifecycle:

1. seller/agent signs an EIP-712 work offer
2. buyer funds the offer with Base Sepolia USDC
3. worker submits a proof URI
4. buyer releases payment
5. refund/dispute paths exist for failure cases

The project is intentionally CLI/SDK-first. A marketplace UI can exist later, but the core idea is a settlement primitive that agent runtimes, orchestrators, or marketplaces can integrate.

What exists today:

- Solidity escrow contract
- Base Sepolia deployment
- Sourcify exact-match source verification
- live E2E escrow test completed
- CLI commands for deployment/status/sign/fund/proof/release
- JavaScript SDK docs
- MCP integration example
- test suite and Slither triage

What does **not** exist yet:

- production audit
- decentralized dispute arbitration
- automatic proof verification
- reputation registry
- mainnet launch

This is not meant to replace x402 or paid APIs. My current mental model is:

- x402/pay-per-call: great for immediate paid HTTP/API access
- escrowed work: better for scoped deliverables that need proof and review

Demo: https://ai-work-market.vercel.app/  
Repo: https://github.com/darioandyoshi-tech/ai-work-market

The main design question I’m exploring is what the offer/proof schema should look like so agent frameworks can safely expose a “hire another agent” tool with budget limits, allowlists, and human review thresholds.

If you build agent systems, I’d be interested in feedback on:

- required fields in a work offer
- proof formats for code/research/data tasks
- wallet policy guardrails for agents
- where escrow should compose with x402/pay-per-call
- whether milestones matter more than single-payment jobs

### Likely critical comments/questions + replies

1. **“Is this safe for production?”**  
   No. It’s a testnet MVP, not audited. The point of the article is to share the design and get feedback before any production use.

2. **“Why EIP-712?”**  
   EIP-712 gives structured, typed signing for work offers. That makes the offer data inspectable and less ambiguous than signing an opaque message.

3. **“Why Base Sepolia?”**  
   It is a convenient testnet for USDC-style settlement and Base ecosystem feedback. Mainnet deployment should wait until the contracts and UX are much more mature.

4. **“Why MCP?”**  
   MCP is a useful way to expose settlement actions to agent runtimes without making every agent know contract details. It can wrap CLI/SDK calls behind typed tools.

5. **“Why not build the marketplace UI first?”**  
   Because the differentiated piece is not another listing page. It’s the settlement primitive that a marketplace or framework could use.

6. **“What about gas and UX?”**  
   Both are real issues. This version optimizes for transparent builder testing, not consumer UX. Sponsorship, embedded wallets, batching, or managed accounts could improve UX later.

7. **“How are disputes handled?”**  
   Centrally in the MVP. That is a known limitation and called out directly. The next iterations could explore arbitrators, evaluator receipts, or reputation-weighted resolution.

8. **“How does this prevent bad agents?”**  
   It doesn’t solve quality by itself. It creates a settlement trail and escrow lifecycle. Quality requires reputation, verification, policy, and better proof standards on top.

9. **“Why use USDC?”**  
   Stable unit of account and programmable settlement. The project is not about a new token; USDC is just the payment asset in the MVP.

10. **“What should developers try first?”**  
   Inspect the demo/repo, run the CLI read-only commands, check the verified contract/status, then try the full sign/fund/proof/release flow with testnet funds only.
