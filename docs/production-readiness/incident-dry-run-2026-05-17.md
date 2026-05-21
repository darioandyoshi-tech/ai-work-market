# AWM Incident Dry-Run: 2026-05-17 (S-01)

**Scenario:** SEV1 - Production API Outage affecting Signed Private Delivery.
**Date:** Sunday, May 17th, 2026
**Operator:** Yoshi (AI Assistant)

## 1. Scenario Definition
- **Incident:** The `api/private-delivery-link` route begins returning `500 Internal Server Error` due to an unexpected failure in the `stripeGet` helper (e.g., an API version mismatch or transient Stripe outage).
- **Impact:** Users who have just paid for a digital product via Stripe are unable to obtain their signed download link. 
- **Symptoms:** 
    - Spike in 5xx errors in Vercel logs.
    - Customer support tickets reporting "Payment successful but no download link received."
    - Monitoring alert: `API 5xx rate > 5% for 5 minutes` (as defined in `monitoring-plan.md`).

## 2. Step-by-Step Response Execution

### T+0: Detection
- **Action:** Monitoring system triggers a **High** alert for `api/private-delivery-link`.
- **Verification:** Operator checks Vercel logs and confirms a cluster of 500 errors.
- **Classification:** SEV1 (Major functionality loss, but no funds are lost/stolen from escrow).

### T+15m: Immediate Response (Stop the Bleeding)
- **Action 1 (Halt):** Update the landing page / product page with a small banner: *"We are experiencing a temporary issue with automatic digital delivery. Our team is on it. If you've already paid, your purchase is safe and we will deliver manually."*
- **Action 2 (Snapshot):** Capture the last 100 failed request IDs from logs to identify affected session IDs.
- **Action 3 (Notification):** Notify technical operator and support owner via emergency channel.

### T+60m: Triage and Analysis
- **Analysis:** Check `api/_commerce-shared.js`. Determine if the failure is in the network layer or a logic error.
- **Discovery:** In this scenario, the issue is a transient Stripe API timeout causing the `stripeGet` promise to reject without a graceful fallback.
- **Containment:** Roll back to the previous stable deployment if a recent change was made. If it's a Stripe outage, prepare the manual fulfillment list.

### T+2h: Recovery Process
- **Action 1 (Manual Fulfillment):**
    - Log into **Stripe Dashboard**.
    - Filter by `checkout.session.completed` within the outage window.
    - For each affected customer, manually verify the product slug.
    - Use the `bin/awm.js` or a manual script to generate a signed download link (if the signing secret is still functional) and email it directly to the customer.
- **Action 2 (Fix):** Implement a retry mechanism or a more robust error handler in `stripeGet` to prevent 500s during transient timeouts.
- **Action 3 (Verification):** Run a test purchase using a Stripe test clock/session to ensure the link is issued correctly.

### T+4h: Closure
- **Action 1 (Re-enable):** Remove the warning banner from the UI.
- **Action 2 (Communication):** Email all affected customers: *"Your delivery link is now active. Sorry for the delay!"*
- **Action 3 (Postmortem):** Document the incident in the internal log.

## 3. Findings & Gaps Identified

### Gap A: Alerting Specificity
The current monitoring plan flags `API 5xx rate`, but it doesn't distinguish between a general 500 and a specific failure in the `private-delivery-link` flow.
- **Fix:** Add a specific alert for `private-delivery-link` 5xx spikes.

### Gap B: Manual Fulfillment Speed
Manual fulfillment via the Stripe Dashboard is slow if there are >50 affected users.
- **Fix:** Consider a "Request Delivery Link" button on the client side that triggers a manual review ticket in the backend, rather than just relying on the user to email support.

### Gap C: Runbook Detail
The `incident-response.md` mentions "Disable mainnet escrow interaction paths," but the launder for "Digital Product Delivery" (Stripe) is slightly different.
- **Fix:** Add a specific "Digital Delivery" sub-section to the recovery process in `incident-response.md`.

## 4. Conclusion
The dry-run confirms that the **Safe Fallback (Stripe Dashboard as source of truth)** is effective. The platform can survive an API outage without losing customer purchase data. The operational path is clear, and the "manual fulfillment" backup is viable.

**Status:** Dry-run SUCCESSFUL.
**Sign-off:** Yoshi 🍈
