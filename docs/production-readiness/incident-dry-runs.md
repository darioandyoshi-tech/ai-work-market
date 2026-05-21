# AI Work Market Incident Dry-Runs

This document records simulated incident response exercises to verify the `incident-response.md` runbook and the `verifier-guide.md` protocol. 

Dry-runs are designed to ensure that the multisig operators (arbitrators) can efficiently triage and resolve disputes without hesitation during a real production event.

## Dry Run #1: Malicious/Invalid Proof Resolution

**Date:** 2026-05-16
**Severity:** SEV1 (Stuck funds / Invalid delivery)
**Scenario:** A seller submits a `proofURI` that satisfies the contract's `ipfs://` prefix requirement but contains no actual work (e.g., a text file saying "coming soon" or a 404). The buyer, upon seeing the empty proof, opens a dispute via `disputeURI`.

### 1. Triage (Simulation)
- **Event Detected:** `Disputed(intentId: 42, openedBy: 0xBuyer, disputeURI: "ipfs://QmDispute...")`
- **Artifact Collection:**
    - **Work Specification:** `workURI` resolved $\rightarrow$ "Detailed Market Map of AI Agents 2026". Matches `workHash`.
    - **Submitted Proof:** `proofURI` resolved $\rightarrow$ "I'm still working on it, please wait." (Invalid delivery).
    - **Dispute Evidence:** `disputeURI` resolved $\rightarrow$ Screenshot of the empty proof and a log of failed communication attempts.

### 2. Analysis (per Verifier's Guide)
- **Delivery Completion:** FAILED. The content of the proof does not match the work specification.
- **Timing:** Proof was submitted before `workDeadline`, but the content is fraudulent/insufficient.
- **Good Faith:** Seller attempted to "freeze" the review period by submitting a placeholder. This is a bad-faith action.

### 3. Resolution Decision
- **Outcome:** Full Refund.
- **Reasoning:** The seller failed to deliver the agreed-upon work. The buyer is entitled to a full return of the principal.
- **Fee Status:** `chargeFee = false`. No fee is charged on failed deliveries.
- **Proposed Transaction:** `resolveDispute(42, amount, 0, false)`

### 4. Outcome & Lessons Learned
- **Execution:** Simulated Safe transaction proposed and signed.
- **Lesson 1:** The on-chain `_validateIPFSURI` check is a "smoke test" only. It prevents garbage strings but cannot verify content.
- **Lesson 2:** The arbitrator's ability to resolve disputes is the only safety net against "placeholder" proofs.
- **Lesson 3:** We must ensure the `disputeURI` is as robust as the `proofURI` for the arbitrator to have a full picture.

**Status:** ✅ COMPLETED

---

## Dry Run #2: The "Ghost" Buyer

**Date:** 2026-05-16
**Severity:** SEV2 (Operational friction / Stuck release)
**Scenario:** Seller delivers work and submits a valid `proofURI`. The buyer, having received the work, ceases all communication and does not call `release()`. The review period expires without a dispute being opened.

### 1. Triage (Simulation)
- **Event Detected:** `ProofSubmitted(intentId: 101, proofURI: "ipfs://QmValidWork...", reviewDeadline: T+X)`
- **Observation:** `block.timestamp` has passed `reviewDeadline`, but `status` remains `ProofSubmitted`.
- **Seller Action:** Seller reports "Buyer is ghosting me" or simply monitors the chain.

### 2. Analysis (per Verifier's Guide)
- **Delivery Completion:** SUCCESS. The `proofURI` resolved to the correct deliverables.
- **Timing:** The review period has lapsed. The buyer had the agreed-upon window to inspect and release or dispute.
- **Good Faith:** The seller fulfilled the obligation. The buyer's silence after the deadline is interpreted as tacit acceptance or negligence.

### 3. Resolution Decision
- **Outcome:** Seller Claim (Autonomous).
- **Reasoning:** The contract's `claimAfterReview` function is specifically designed for this "ghosting" scenario to prevent funds from being locked indefinitely.
- **Proposed Action:** Seller calls `claimAfterReview(101)`.
- **Alternative (if Disputed first):** If the buyer had opened a dispute and then disappeared, the Arbitrator would execute `resolveDispute(101, 0, amount, true)`.

### 4. Outcome & Lessons Learned
- **Execution:** Verified that `claimAfterReview` correctly handles the fee split and transfers funds to the seller without requiring owner intervention.
- **Lesson 1:** The "Ghost Buyer" is handled by the protocol itself, reducing the burden on the Arbitrator.
- **Lesson 2:** The `reviewPeriod` is a critical trust parameter; if too short, honest buyers may miss the window. If too long, sellers are exposed to liquidity locks.
- **Lesson 3:** Documentation should explicitly tell sellers that they *must* call `claimAfterReview` themselves if the buyer doesn't release.

**Status:** ✅ COMPLETED
