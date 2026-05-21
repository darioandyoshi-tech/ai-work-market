# AWM Production Incident Response Runbook

**Status:** Draft / Pre-Mainnet
**Last Updated:** 2026-05-20
**Criticality:** P0 Production Gate

This document defines the procedures for identifying, triaging, and resolving security and operational incidents on the AI Work Market (AWM) mainnet escrow.

## 1. Severity Definitions

| Level | Description | Examples | Action Requirement |
|---|---|---|---|
| **SEV0** | **Critical / Active Exploit** | Private key compromise, fund draining, critical logic bug allowing unauthorized release. | Immediate notification of all signers, total UI/API shutdown, public warning. |
| **SEV1** | **High / Major Dysfunction** | Funds stuck in escrow, incorrect fee recipient, signer suspected compromise, critical API failure. | Notify signers, disable affected UI paths, initiate triage/resolution within 4 hours. |
| **SEV2** | **Medium / Operational** | API outages, Stripe fulfillment delays, monitoring failures, minor logic errors not affecting funds. | Log incident, notify technical operator, resolve within 24-48 hours. |

## 2. First 15 Minutes (The "Panic" Phase)

Upon detection of a **SEV0** or **SEV1**:

1.  **Stop Promotion**: Immediately disable any active marketing or "Fund Now" buttons in the frontend/API.
2.  **Frontend Kill-Switch**: 
    -   Deploy a "Maintenance/Emergency" overlay to `trust.html` and `index.html`.
    -   Disable `createIntent` and `createIntentFromSignedOffer` endpoints in the API.
3.  **State Snapshot**:
    -   Run `scripts/escrow-monitor.js` to capture the current state of all intents.
    -   Export the last 100 events from the blockchain explorer/node.
4.  **Alert Signers**: Trigger the emergency contact path (Signal/Telegram) to all Safe multisig owners.

## 3. First Hour (The Triage Phase)

1.  **Identify Impact**:
    -   Determine if the bug is in the contract, the SDK, or the API.
    -   Identify specifically affected `intentId`s and user addresses.
2.  **Public Communication**:
    -   Post a warning on the official X/Discord/Website: *"We are investigating an issue with AWM Escrow. Please do not fund new intents until further notice."*
3.  **Containment**:
    -   If the issue is an API leak, rotate `AWM_DELIVERY_SIGNING_SECRET` and Stripe keys immediately.
    -   If the issue is a contract bug, identify if a `resolveDispute` or `refund` path can be used to rescue funds.

## 4. Recovery and Resolution

1.  **The Fix**:
    -   If the contract is compromised: since there is no `pause()` function, the only remedy is to coordinate with the Safe multisig to manually `resolveDispute` and return funds to users.
    -   If the API is the issue: deploy the fix to Vercel, verify in staging, then promote to production.
2.  **Verification**:
    -   Run `npm run check:all` to ensure no regressions.
    -   Perform a smoke test with a tiny USDC amount on mainnet.
3.  **Gradual Re-entry**:
    -   Enable the UI for a small set of allowlisted testers before full public restoration.

## 5. Postmortem Process

Within 72 hours of resolution, the team must produce a report containing:
-   **Timeline**: Exact timestamps of detection, action, and resolution.
-   **Root Cause**: Why did this happen? (e.g., logic error, key leak, RPC failure).
-   **Impact**: Total funds at risk, total funds lost (if any), number of users affected.
-   **Corrective Action**: What changes to the contract, tests, or ops process prevent this from happening again?
-   **User Comms**: Final statement to the community.

## 6. Emergency Contact Roster

| Role | Contact Method | Secondary Method |
|---|---|---|
| Lead Dev | [REDACTED/INTERNAL] | [REDACTED/INTERNAL] |
| Multisig Signer 1 | [REDACTED/INTERNAL] | [REDACTED/INTERNAL] |
| Multisig Signer 2 | [REDACTED/INTERNAL] | [REDACTED/INTERNAL] |
| Business/Legal | [REDACTED/INTERNAL] | [REDACTED/INTERNAL] |
