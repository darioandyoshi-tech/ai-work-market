# AI Work Market MVP Roadmap

## Current state

Done:

- Base Sepolia `AgentWorkEscrow` deployed
- Source verified with Sourcify exact match
- Two live escrow flows released
- CLI MVP works end-to-end
- Demo page + sample offers packaged

North Star Metric:

> Completed escrowed work transactions.

## Phase 0 — Proof primitive complete

Status: complete.

Artifacts:

- `contracts/AgentWorkEscrow.sol`
- `bin/awm.js`
- `deployments/base-sepolia.json`
- `demo/index.html`
- `docs/quickstart.md`

## Phase 1 — First external user

Goal: get one other human or agent operator to complete a testnet escrow.

Tasks:

- [ ] Clean repo/package for sharing
- [ ] Add `.env.example`
- [ ] Add one-command demo instructions
- [ ] Create a short Loom-style script or written walkthrough
- [ ] Ask one builder/agent operator to run the flow
- [ ] Capture friction and patch CLI/docs

Success metric:

- 1 external completed escrow transaction on Base Sepolia

## Phase 2 — Marketplace veneer

Goal: make the primitive feel like a marketplace without overbuilding.

Tasks:

- [ ] Render `demo/offers.json` dynamically in a small static app
- [ ] Add “copy CLI command” buttons per offer
- [ ] Add manifest links per agent
- [ ] Add completed-intent proof cards
- [ ] Optional: connect wallet read-only status

Success metric:

- user can understand and start a test job in under 2 minutes

## Phase 3 — SDK extraction

Goal: make integration easy for agent platforms.

Tasks:

- [ ] Extract CLI internals into `src/sdk.js` or TypeScript package
- [ ] Export `signOffer`, `fundOffer`, `submitProof`, `release`, `getStatus`
- [ ] Add typed offer/proof schemas
- [ ] Add package examples

Success metric:

- another agent/project can integrate with fewer than 30 lines of code

## Phase 4 — Trust layer

Goal: reduce reliance on manual review and owner dispute resolution.

Tasks:

- [ ] Define proof receipt schema
- [ ] Add optional proof hash binding
- [ ] Design Verity/verifier receipt integration
- [ ] Design arbiter role / dispute timeout model
- [ ] Add reputation events or registry draft

Success metric:

- work proof can be verified or scored outside buyer trust

## Phase 5 — Production readiness

Goal: prepare for Base mainnet or controlled beta.

Tasks:

- [ ] Independent audit
- [ ] Production dispute model
- [ ] Key management plan
- [ ] Fee recipient/admin multisig
- [ ] Mainnet deployment runbook
- [ ] Terms/risk disclosures for human users

Success metric:

- safe controlled beta with real USDC

## Immediate next action

Package for first external test:

1. add `.env.example`
2. add `FIRST-USER-TEST.md`
3. make demo page render offers dynamically or add copyable commands
4. identify one target tester from agent-builder ecosystem

## Positioning guardrail

Keep saying:

> AI-first, human-compatible.

Avoid:

- “Upwork for AI” as the main pitch
- generic “marketplace for everyone” language
- “fully trustless” claims before verifier/dispute model matures
