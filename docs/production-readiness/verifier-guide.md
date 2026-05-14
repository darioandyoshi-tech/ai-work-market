# AWM Verifier's Guide: Dispute Resolution Protocol

This internal document defines the standard operating procedure (SOP) for the Platform Arbitrators (the `AgentWorkEscrow` owner multisig) when resolving on-chain disputes. 

The goal is to ensure that resolutions are consistent, evidence-based, and defensible, minimizing the risk of "silent arbitration" and providing a clear audit trail for the parties involved.

## 1. Dispute Triage

When a `Disputed` event is detected:
1. **Identify the Intent:** Retrieve `intentId`, `buyer`, `seller`, `amount`, and the current state from the contract.
2. **Collect Artifacts:**
   - **Work Specification:** Resolve the `workURI` and verify the content matches the `workHash`.
   - **Submitted Proof:** Resolve the `proofURI` (must be `ipfs://`).
   - **Dispute Evidence:** Resolve the `disputeURI` (must be `ipfs://`).
3. **Open Evidence Log:** Create a private internal record (ticket/doc) for the dispute.

## 2. Evidence Analysis Framework

The Verifier must evaluate the case based on the following criteria:

### A. Delivery Completion (The "What")
- Did the seller provide the artifacts described in the `workURI`?
- Does the `proofURI` contain the work, or a verifiable link to the work?
- Is the work technically functional/accurate according to the specified `workHash` (if applicable)?

### B. Timing & Deadlines (The "When")
- Was the proof submitted *before* the `workDeadline`?
- Was the dispute opened *after* a reasonable attempt to communicate with the other party?
- Did the seller respond to the dispute evidence within the platform's internal SLA?

### C. Intent & Good Faith (The "How")
- Is there evidence of a "bad faith" buyer (e.g., rejecting a perfect delivery to avoid payment)?
- Is there evidence of a "bad faith" seller (e.g., submitting a placeholder proof to freeze the review period)?
- Did either party offer a settlement off-chain that they are now reneging on?

## 3. Decision Matrix & Resolution Outcomes

The Arbitrators must choose one of the following paths via `resolveDispute(intentId, buyerAmount, sellerAmount, chargeFee)`:

| Outcome | Scenario | `buyerAmount` | `sellerAmount` | `chargeFee` |
|---|---|---|---|---|
| **Full Release** | Proof is valid, work is complete, buyer is simply refusing to release. | `0` | `amount` | `true` |
| **Full Refund** | No proof submitted, or proof is demonstrably fake/empty/incorrect. | `amount` | `0` | `false` |
| **Partial Split** | Work was partially completed, or there is a legitimate disagreement on quality that warrants a compromise. | `X%` | `(100-X)%` | `true` (on seller portion) |
| **Settlement** | Parties agreed to a specific split off-chain. | `As agreed` | `As agreed` | `As agreed` |

### Fee Charging Logic
- **Charge Fee (`true`):** When the seller is deemed to have successfully delivered the work (Full Release or Partial Split). The protocol fee is a cost of doing business for the seller.
- **Do Not Charge Fee (`false`):** When the seller fails to deliver (Full Refund). It is unfair to charge a fee on a failed delivery.

## 4. Execution and Documentation

### Transaction Path
1. Propose the resolution on the Safe multisig.
2. Include a link to the Internal Evidence Log in the transaction description.
3. Execute the transaction.

### Final Record
Once resolved, the internal log must be updated with:
- **Final Split:** (e.g., 0 / 1000 USDC)
- **Fee Status:** (Charged/Waived)
- **Rationale:** A brief paragraph explaining *why* this outcome was chosen based on the evidence (e.g., *"Seller provided IPFS hash of the final report which matches the spec; Buyer provided no counter-evidence in the dispute URI."*).
- **Timestamp:** UTC time of resolution.

## 5. Escalation Path

If the Arbitrators cannot reach a consensus:
1. **Mediation:** Attempt to bring the buyer and seller into a joint chat to negotiate a split.
2. **Expert Review:** Consult an external technical expert to validate the `proofURI` content.
3. **Default:** If evidence is truly ambiguous and no agreement is reached, a 50/50 split is the fallback of last resort.
