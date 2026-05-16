# AI Work Market Incident Response Runbook

This document defines the procedures for identifying, triaging, and recovering from incidents affecting the AI Work Market (AWM) production environment on Base mainnet.

## 1. Severity Definitions

| Severity | Name | Criteria | Impact |
|---|---|---|---|
| **SEV0** | **Critical / Emergency** | Active exploit, significant loss of user funds, or compromise of the owner/multisig private keys. | Immediate risk to all funds in escrow; loss of platform integrity. |
| **SEV1** | **High / Major** | Stuck funds (e.g., bug in release logic), incorrect deployment parameters, compromise of a single signer's key, or severe API malfunction affecting payment flows. | Partial loss of functionality; users unable to claim funds or refund. |
| **SEV2** | **Medium / Minor** | API outages (Vercel/RPC), Stripe fulfillment delays, monitoring failure, or UI bugs not affecting fund safety. | User friction; delayed fulfillment; degraded experience. |

## 2. Immediate Response (First 15 Minutes)

The goal is to **stop the bleeding** and prevent further loss.

1.  **Halt New Activity:**
    - Disable mainnet escrow interaction paths in the frontend/UI.
    - Update API responses for `private-delivery-link` to return a "Maintenance" status if the incident affects fulfillment.
2.  **State Snapshot:**
    - Perform a full snapshot of the `AgentWorkEscrow` contract state.
    - Export all recent events (`IntentCreated`, `Funded`, `Disputed`, etc.) to a local log for analysis.
3.  **Notification:**
    - Notify all multisig signers via the emergency communication channel (Signal/Telegram).
    - Declare the incident severity (SEV0/1/2).
4.  **Public Warning:**
    - If SEV0/1, publish a "Caution" warning on the landing page and social channels: *"We are investigating an issue with the escrow system. Please do not fund new intents until further notice."*

## 3. Triage and Analysis (First Hour)

1.  **Identification:**
    - Determine the root cause (e.g., smart contract bug, API vulnerability, key compromise, or external dependency failure).
    - Identify all affected `intentId`s and the total amount of USDC at risk.
2.  **Containment:**
    - If the issue is in the API, roll back to the last known stable commit.
    - If the issue is in the contract, determine if `resolveDispute` can be used to rescue funds manually (since the contract has no global `pause`).
3.  **Coordination:**
    - Draft a technical summary for signers to review before executing recovery transactions.

## 4. Recovery Process

1.  **Fund Rescue (If applicable):**
    - Execute `resolveDispute` transactions via the Safe multisig to return funds to rightful owners (Buyer or Seller) based on evidence.
2.  **Parameter Correction:**
    - Use `setFeeRecipient` or `setDefaultFeeBps` if the incident involved incorrect administrative settings.
3.  **Verification:**
    - Run a smoke test on a fresh deployment or a small-value mainnet intent to verify the fix.
4.  **Gradual Re-enablement:**
    - Remove UI blockers.
    - Enable funding for a limited set of allowlisted users first.
    - Monitor the first 10-20 transactions closely before open relaunch.

## 5. Postmortem and Closure

Every SEV0 and SEV1 incident requires a written postmortem within 72 hours:

- **Timeline:** Precise sequence of events (discovery $\rightarrow$ action $\rightarrow$ resolution).
- **Impact:** Number of users affected and total USDC volume.
- **Root Cause:** Detailed explanation of why the failure occurred.
- **Corrective Actions:** Specific code changes, test additions, or process updates to prevent recurrence.
- **User Comms:** Record of all public messages sent.

---
*Last Updated: 2026-05-15*
