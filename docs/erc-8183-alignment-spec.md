# AWM ↔ ERC-8183 Alignment Spec

**Status:** Draft for review (Dario + Hermes)
**Date:** 2026-08-21
**Author:** Yoshi (with Dario's mandate: make AWM production-ready)
**Version:** 0.1

---

## 1. Purpose

This document specifies how AWM (AI Work Market) aligns with the current
[ERC-8183 "Agentic Commerce"](https://eips.ethereum.org/EIPS/eip-8183) standard
(merged Draft, 2026-02-25), and how AWM becomes a **reference implementation**
with an **AI-verifier-as-evaluator** centerpiece.

The goal is the "10x leverage" the original distribution plan chased: if AWM is
cited in the EIP repo and listed on 8183.org, it inherits the standard's gravity
instead of competing as an unknown.

---

## 2. Current state (verified 2026-08-21)

### 2.1 ERC-8183 (the standard we align to)
- **Status:** Draft, merged into ethereum/ERCs (PR #1581), 25+ projects on 8183.org
- **Model:** Job escrow with **evaluator attestation**
- **States (4):** Open → Funded → Submitted → Terminal (Completed/Rejected/Expired)
- **Roles (3):** Client, Provider, Evaluator
- **Evaluator:** single address per job, set at creation; MAY be the client, MAY be a smart contract
- **Hooks:** optional `IACPHook` (beforeAction/afterAction) for extensibility
- **Reputation:** composes with ERC-8004 (Trustless Agents)
- **Gasless:** recommends ERC-2771 (meta-transactions)
- **Reference impl:** `AgenticCommerce.sol` (minimal) + `AgenticCommerceHooked.sol` (extension)

### 2.2 AWM (what we have)
- **Deployed:** Base Mainnet `0x8b49...Dae2` (AgentWorkEscrowZK), Base Sepolia `0x489C...2f07` (AgentWorkEscrow)
- **Model:** Buyer-release escrow with 2-of-3 Gnosis Safe + 48h Timelock dispute resolution
- **States (7):** None, Funded, ProofSubmitted, Released, Refunded, Disputed, Resolved
- **Roles:** Buyer, Seller, Owner (Safe) as dispute arbiter
- **ZK:** Groth16 verifier (`AgentWorkProofVerifier.sol`), TessPay auto-pay on valid proof
- **Registry:** `AgentRegistry.sol` (reputation, completedJobs, disputedJobs)
- **Tests:** 31 passing (recovered + fixed, committed b674ef4)
- **Gaps:** no third-party audit, no formal verification, no ERC-8183 alignment

---

## 3. The core tension (honest)

AWM's design philosophy is **"buyer is the evaluator, Safe is the arbiter,
human-in-the-loop."** ERC-8183's is **"a designated evaluator attests, optionally
a contract."** These are genuinely different trust models — not just different
state names.

The original plan's claim ("AWM's 5 states map 1:1 to ERC-8183's 6 states") is
**no longer accurate** — the standard moved to a 4-state evaluator-attestation
model with hooks. Sending that claim as-is would be dishonest.

**The alignment strategy:** rather than force AWM's existing contract to fake a
1:1 mapping, we build a **new ERC-8183-compliant contract** that keeps AWM's
strengths (Safe governance, IPFS evidence, fee split, ZK verification) while
implementing the standard's evaluator + hooks model. The **AI-verifier-as-evaluator**
is the differentiator that makes AWM "AI-native" rather than just another escrow.

---

## 4. State machine mapping

| ERC-8183 | AWM (current) | Notes |
|----------|--------------|-------|
| Open | None | Job created, budget not set |
| Funded | Funded | Budget escrowed |
| Submitted | ProofSubmitted | Provider submits work |
| Completed | Released | Evaluator attests → payment |
| Rejected | Refunded | Evaluator/client rejects → refund |
| Expired | Refunded | Timeout → refund |
| — | Disputed | AWM extension (Safe arbitration) |
| — | Resolved | AWM extension (Safe split) |

**Key insight:** ERC-8183's `Completed` is triggered by the **evaluator**, not the
buyer. AWM's `Released` is triggered by the **buyer** (or seller auto-claim).
The alignment requires introducing an **evaluator role** that can call
`complete()`/`reject()`.

---

## 5. Evaluator design — the AI-verifier centerpiece

### 5.1 The three evaluator options in ERC-8183
1. **Evaluator = client** (no third party) — simplest, but no independent attestation
2. **Evaluator = human/DAO** (e.g., the Safe) — AWM's current model
3. **Evaluator = smart contract** — arbitrary checks (ZK proof, off-chain signals)

### 5.2 AWM's differentiator: AI-verifier-as-evaluator
AWM already has the primitive: `AgentWorkProofVerifier.sol` (Groth16 ZK-SNARK
verifier) + `CommitRevealVerifierAdapter.sol`. The alignment makes this the
**evaluator**:

- **Evaluator = a verifier contract** that checks a ZK proof of work completion
- On `submit()`, the verifier contract attests completion → calls `complete()`
- This is **TessPay generalized**: verify-then-pay, but now as a first-class
  ERC-8183 evaluator role

**Why this wins:**
- It's genuinely AI-native (an AI agent's work is verified by a proof, not a human)
- It's a defensible position no other 8183 project has (most use human/DAO evaluators)
- It reuses AWM's existing ZK infrastructure (no new crypto)
- It composes with ERC-8004 reputation (verifier can write attestations)

### 5.3 Hybrid evaluator (recommended)
For production, use a **hybrid**:
- **Primary evaluator:** the ZK verifier contract (fast, automatic, for provable work)
- **Fallback evaluator:** the 2-of-3 Safe (human arbitration for disputes/edge cases)

This gives AWM both the speed of AI verification and the safety of human
arbitration — the best of both trust models.

---

## 6. Hooks plan

ERC-8183's `IACPHook` (beforeAction/afterAction) is the extension point. AWM
should implement these hooks:

| Hook | Purpose |
|------|---------|
| `FundTransferHook` | Two-phase escrow (bridge/swap use case) — from the EIP example |
| `BiddingHook` | Multi-provider bidding (off-chain signed bids) |
| `ReputationHook` | Write attestations to ERC-8004 on complete/reject |
| `ZKVerificationHook` | Verify ZK proof before `complete()` (the AI-evaluator) |

The `ZKVerificationHook` is the bridge between AWM's existing ZK system and the
ERC-8183 hook model — it lets the verifier contract act as evaluator via the
hook callback.

---

## 7. ERC-8004 reputation interop

ERC-8183 recommends composing with ERC-8004 (Trustless Agents) for reputation.
AWM's `AgentRegistry.sol` already tracks reputation (reputationScore,
completedJobs, disputedJobs). The alignment:

- On `complete()`, emit ERC-8004-compatible attestation (provider succeeded)
- On `reject()`, emit attestation (job rejected for reason)
- The `ReputationHook` writes these to the ERC-8004 registry
- AWM's `AgentRegistry` becomes the reputation source of truth

---

## 8. ERC-2771 gasless support

ERC-8183 recommends ERC-2771 (meta-transactions) for gasless execution. AWM
should add a trusted forwarder so agents can submit work without holding ETH.
This is a production requirement for agent-to-agent commerce (agents often
don't hold gas).

---

## 9. Implementation plan (phased)

### Phase 1 — Alignment spec (THIS DOCUMENT) ✅
Review by Dario + Hermes before code.

### Phase 2 — New ERC-8183-compliant contract
- `AgenticCommerceAWM.sol`: implements ERC-8183 state machine + evaluator + hooks
- Reuse: Safe governance, IPFS evidence, fee split, ZK verifier
- Add: evaluator role, IACPHook interface, ERC-8004 attestation, ERC-2771 forwarder
- Tests: extend the 31-test suite to cover the new contract

### Phase 3 — Security hardening
- Third-party audit (the #1 trust moat gap)
- Formal verification prep (Certora/Halmos/Scribble)
- Slither + static analysis clean

### Phase 4 — Production deployment package
- Deployment scripts (Base mainnet + Sepolia)
- Verification (Sourcify + Etherscan)
- Monitoring + incident response (already drafted in docs/production-readiness/)
- Governance (Safe + Timelock) wiring

### Phase 5 — Distribution (the plan that was never executed)
- Submit to 8183.org project list
- DM Virtuals/EF dAI with the NEW accurate alignment claim
- GitHub issues (AutoGen, OpenClaw, x402)
- Skill hubs + marketplace submissions

---

## 10. Open questions for Dario/Hermes

1. **Dual-track or migrate?** Do we deploy the new ERC-8183 contract alongside
   the existing AWM mainnet contract, or migrate? (Recommend dual-track initially —
   the existing contract has live intents.)
2. **Evaluator default:** ZK-verifier-first or Safe-first for the hybrid?
   (Recommend ZK-first for provable work, Safe fallback for disputes.)
3. **Scope of Phase 2:** full contract + tests, or contract + tests + audit prep
   in one pass?
4. **Timeline:** is there a target date for mainnet deployment?

---

## 11. Honest risk assessment

- **The standard is Draft, not Final.** ERC-8183 could change. Mitigation: build
  to the current spec, keep the contract modular (hooks absorb changes).
- **25+ projects already on 8183.org.** AWM is late but differentiated (AI-evaluator).
- **x402 is building escrow itself.** The "AWM = work-contract layer" framing is
  contested. Mitigation: position AWM as the *evaluator-attestation* layer, which
  x402's atomic payments don't cover.
- **No third-party audit yet.** This is the #1 blocker for real adoption. Must be
  addressed before mainnet with real funds.

---

*This spec is the reviewable deliverable. No contract code is written until
Dario/Hermes approve the evaluator design and dual-track decision.*
