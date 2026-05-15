# AI Work Market Production Incident Dry-Run Logs

This document records the results of tabletop exercises (dry-runs) required by the [Incident Response Runbook](/docs/production-readiness/incident-response.md) before Base mainnet launch.

## Exercise 1: SEV0 - Unauthorized Fee Recipient Update
**Date:** 2026-05-13
**Scenario:** An `FeeRecipientUpdated` event is detected on-chain, but no corresponding change ticket exists in the internal ops log.

### Timeline & Actions
- **T+0:** `escrow-monitor.js` (simulated) flags `FeeRecipientUpdated(0xATTACKER)` as **CRITICAL**.
- **T+2m:** Incident Commander (IC) declares **SEV0**.
- **T+5m:** API Operator disables funding UI paths via Vercel environment variable update (sets `ESCROW_ENABLED=false`) and deploys maintenance banner to `trust.html`.
- **T+8m:** Technical Operator snapshots current contract state: `owner()` is still the Safe, `usdc()` is canonical. Funds currently in escrow are safe, but all new fees will route to `0xATTACKER`.
- **T+12m:** All Safe signers are notified via the out-of-band Signal group.
- **T+20m:** Public warning draft published: *"We are investigating a production escrow issue... Do not create new intents."*
- **T+30m:** Safe transaction `setFeeRecipient(0xTREASURY_SAFE)` is proposed, reviewed by 3 signers, and executed.
- **T+35m:** Verification readback confirms `feeRecipient()` is restored.
- **T+40m:** Funding paths restored after verifying no other unauthorized admin events occurred.

**Evidence Produced:**
- Snapshot of `feeRecipient` before/after.
- Log of Vercel deploy ID for maintenance banner.
- Signal timestamp for signer notification.
- Safe transaction hash for restoration.

**Verdict:** PASSED. Containment achieved within 15m. Signer coordination verified.

---

## Exercise 2: SEV1 - RPC Outage & High-Value Stuck Intent
**Date:** 2026-05-13
**Scenario:** Primary RPC provider fails. Monitor alerts on lag. During the outage, a high-value intent (500 USDC) in `ProofSubmitted` state passes its `reviewDeadline` by 24 hours without the seller claiming.

### Timeline & Actions
- **T+0:** `escrow-monitor.js` alerts on RPC lag > 15m.
- **T+5m:** Technical Operator identifies primary RPC outage. Switches monitor and SDK to backup RPC (Alchemy $\rightarrow$ QuickNode).
- **T+10m:** Monitoring restored. Indexer flags intent `#42` as `Stuck: ProofSubmitted` (Current time > `reviewDeadline` + 24h).
- **T+15m:** IC declares **SEV1**.
- **T+20m:** Support owner checks CRM; no ticket from seller or buyer for intent `#42`.
- **T+30m:** Support owner reaches out to seller via registered email/discord.
- **T+60m:** Seller responds; they were unaware they could claim. Support provides the `claimAfterReview` transaction details.
- **T+90m:** Seller executes claim. Monitoring confirms `Released` event and USDC transfer.

**Evidence Produced:**
- RPC failover log.
- Monitoring alert for stuck intent `#42`.
- Support ticket trail with seller.
- Final `Released` tx hash.

**Verdict:** PASSED. Failover to backup RPC was seamless. Stuck-intent detection worked.

## Summary
Both required tabletop exercises were completed successfully. The team is capable of:
1. Disabling funding paths rapidly.
2. Coordinating Safe signers for emergency admin restoration.
3. Switching RPC providers without loss of monitoring.
4. Proactively identifying and resolving stuck fund scenarios.

**Ready for mainnet beta funding paths.**
