# AWM Formal Verification Prep

**Status:** Prep / Pre-Audit
**Last Updated:** 2026-08-21
**Gate:** P0 (Audit) — `security-launch-checklist.md`

This document prepares AWM's two escrow contracts for formal verification
(Certora / Halmos / Scribble) and an external third-party audit. It is the
written evidence for the P0 "Audit" gate and the #1 trust moat.

## 1. Scope

Two contracts are in scope for audit + formal verification:

1. **`AgentWorkEscrowZK.sol`** — the deployed mainnet escrow (Base `0x8b49...Dae2`),
   buyer-release + 2-of-3 Safe/48h Timelock dispute model, ZK TessPay.
2. **`AgenticCommerceAWM.sol`** — the new ERC-8183-compliant contract (Phase 2),
   evaluator-attestation model with hybrid ZK-verifier/Safe evaluator.

Supporting contracts (in scope for review, lower priority):
- `AgentWorkProofVerifier.sol` (Groth16 verifier — generated, review the wiring not the crypto)
- `CommitRevealVerifierAdapter.sol`
- `AgentRegistry.sol` (reputation)
- `RecoveryHub.sol`

## 2. What is already verified

| Check | Status | Evidence |
|---|---|---|
| Unit tests | ✅ 83 passing | `forge test` (35 original + 48 ERC-8183) |
| Accounting invariants | ✅ | `AgentWorkEscrowInvariants.t.sol` (4) + `AgenticCommerceAWMInvariants.t.sol` (2) |
| Static analysis | ✅ 0 high/med/low | Slither clean on both contracts (triage docs) |
| Deployment reproducibility | ✅ | `script/DeployAgentWorkEscrow.s.sol` + `DeployAgenticCommerceAWM.s.sol` |
| Mainnet state verified | ✅ | `cast` readbacks (owner=Timelock, feeRecipient=Safe, canonical USDC) |

## 3. Formal verification targets (for Certora/Halmos/Scribble)

### 3.1 Accounting invariants (highest value)
These are the properties an auditor/verifier should prove:

1. **Escrow balance conservation** (both contracts):
   `paymentToken.balanceOf(escrow) == activePrincipal + accumulatedFees`
   where activePrincipal = sum of budgets of intents/jobs in non-terminal states.
2. **No double-release/refund**: a terminal intent/job can never move again.
3. **Fee bound**: `accumulatedFees <= totalPrincipalEverFunded` and
   `fee <= budget * MAX_FEE_BPS / BPS_DENOMINATOR`.
4. **No fund loss**: the sum of all payouts + fees + refunds == sum of all
   funds pulled in (conservation across the full lifecycle).

### 3.2 State-machine invariants
5. **Valid transitions only** (ERC-8183 for `AgenticCommerceAWM`):
   Open→Funded→Submitted→Completed/Rejected/Expired; no other transitions.
6. **Role restrictions**: only client can fund/reject-Open; only provider can
   submit; only evaluator can complete/reject-Funded/Submitted.
7. **Reentrancy safety**: token-moving functions are `nonReentrant`; hooks are
   trusted and `claimRefund` is not hookable.

### 3.3 ERC-8183-specific
8. **Hook atomicity**: a reverting after-hook rolls back the whole tx.
9. **ZK evaluator**: `complete()` with evaluator == verifier contract requires
   a valid proof (`pubSignals[0] == 1` and `verifyProof` returns true).

## 4. Recommended verification approach

### Option A — Halmos (symbolic execution, free, local)
- Best for the accounting invariants (3.1) and state-machine (3.2).
- Run: `halmos --contract AgenticCommerceAWM --function invariant_*`
- No external service; fast iteration. **Recommended first pass.**

### Option B — Certora Prover (cloud, commercial)
- Best for full end-to-end property proving and the ERC-8183 spec conformance.
- Requires a Certora account + spec files (`.spec`).
- **Recommended for the final audit sign-off.**

### Option C — Scribble (spec-in-code annotations)
- Annotate invariants directly in Solidity with `/// #invariant` comments.
- Composes with Certora/Halmos. Good for keeping invariants co-located with code.

## 5. Audit-ready package (for external reviewer)

Before engaging an auditor, assemble:

1. **Source** — both contracts + supporting, pinned commit hash.
2. **Test suite** — 83 passing tests, reproducible via `forge test`.
3. **Invariant tests** — 6 accounting/state invariants.
4. **Slither reports** — both triage docs (0 high/med/low).
5. **Deployment scripts** — both, with Safe multisig ownership transfer.
6. **Mainnet readbacks** — `cast` output proving owner/feeRecipient/USDC.
7. **This prep doc** — the verification targets above.
8. **Known risk items** (from `security-launch-checklist.md`):
   - `resolveDispute` centralized under owner (Safe multisig) — biggest trust assumption.
   - No `pause` — incidents handled by UI/API shutdown + multisig ops.
   - Evidence is off-chain URI text; contract does not verify content/quality.
   - Direct `createIntent` exists (test/admin-friendly) — decide production policy.

## 6. Known audit findings to pre-empt

Based on the existing `docs/security-notes.md` (v0.3 independent review already
fixed): signature malleability, deadline races, reentrancy, fee cap, self-escrow,
URI bounds. These are already addressed. The ERC-8183 contract adds hook
reentrancy surface (trusted hooks) and ERC-2771 sender extraction (assembly) —
both documented as by-design in the Slither triage.

## 7. Next actions

1. Install Halmos and run the accounting invariants symbolically (free, local).
2. Write Certora `.spec` files for the 9 targets above.
3. Engage an auditor with the package in §5.
4. Fix any findings; re-run the full suite + Slither; document retest.

## 8. Related
- `docs/production-readiness/security-launch-checklist.md` (P0 Audit gate)
- `docs/production-readiness/slither-triage-erc8183.md`
- `docs/slither-triage.md`
- `docs/security-notes.md`
