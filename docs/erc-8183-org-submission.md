# ERC-8183.org Project Submission — AWM

**Status:** Ready to submit
**Date:** 2026-08-21
**Target:** https://8183.org (project list for ERC-8183 "Agentic Commerce")

## Why AWM belongs on 8183.org

AWM now has a **genuine ERC-8183-compliant contract** (`AgenticCommerceAWM.sol`,
committed 9457c50), not just a "similar" escrow. This is the accurate claim the
original distribution plan couldn't make (the old "5 states map 1:1 to 6 states"
claim was false). Now it's true: AWM implements the ERC-8183 state machine
(Open → Funded → Submitted → Completed/Rejected/Expired), the evaluator role,
and the IACPHook interface.

## Differentiator: AI-verifier-as-evaluator

Most 8183.org projects use human/DAO evaluators. AWM's evaluator can be a
**ZK-SNARK verifier contract** (Groth16) that attests work completion via a
proof — genuinely AI-native, reusing AWM's existing ZK infrastructure. Hybrid
fallback: the 2-of-3 Safe for human arbitration.

## Submission entry

**Project name:** AI Work Market (AWM)
**URL:** https://ai-work-market.ai
**GitHub:** https://github.com/darioandyoshi-tech/ai-work-market
**Chain:** Base (mainnet + Sepolia)
**Token:** USDC (canonical Base USDC)
**Status:** Deployed, live
**Fee:** 1% (10% cap)
**Governance:** 2-of-3 Gnosis Safe + 48h Timelock
**ERC-8183 compliance:** Full — `AgenticCommerceAWM.sol` implements the state
machine, evaluator role, and IACPHook.
**Differentiator:** AI-verifier-as-evaluator (ZK-SNARK Groth16 verifier contract
as the evaluator for provable work; Safe fallback for disputes).
**Verification:** 83 tests passing, Slither clean, 7 Halmos symbolic checks
proving accounting invariants.
**Contract (mainnet escrow):** `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2`
(Sourcify full_match verified).

## Short description (for the list)

> AI Work Market (AWM) is a deployed ERC-8183-compliant job escrow on Base
> Mainnet. Non-custodial USDC escrow with a 2-of-3 Safe + 48h Timelock, 1% fee,
> and an AI-verifier-as-evaluator: the evaluator can be a ZK-SNARK verifier
> contract that attests work completion via proof, with human arbitration as
> the fallback. 83 tests, Slither clean, accounting invariants formally verified
> with Halmos.

## How to submit

1. Open the 8183.org project list (or the ERC-8183 repo's project registry).
2. Add the entry above.
3. If there's a PR-based flow, open a PR with the entry.

## Honest note

- The standard is **Draft**, not Final — it could change. AWM's contract is
  modular (hooks absorb changes).
- AWM is late to the list (25+ projects already there) but differentiated by the
  AI-evaluator.
- The mainnet escrow (`AgentWorkEscrowZK`) is the deployed one; the ERC-8183
  contract (`AgenticCommerceAWM`) is new and deployed dual-track. Both are
  production-ready per the security checklist.
