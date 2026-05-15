# AWM Treasury & Accounting Reconciliation Specification

This document defines the process for reconciling the funds held within the `AgentWorkEscrow` contract against the expected balances of active intents and accumulated fees.

## 1. The Core Invariant
The total balance of the escrow contract must always equal the sum of the principal for all active (non-terminal) intents plus the current `accumulatedFees`.

**Invariant Formula:**
$$\text{Contract Balance (USDC)} = \left( \sum_{\text{Intent} \in \text{Active}} \text{Intent.amount} \right) + \text{accumulatedFees}$$

### Active Intent States
An intent is considered "Active" if its status is one of the following:
- `Funded`
- `ProofSubmitted`
- `Disputed`

Intents in `Released`, `Refunded`, or `Resolved` states are terminal and their funds have been moved out of the contract.

## 2. Reconciliation Process

### Step A: On-Chain Snapshot
1. Query `usdc.balanceOf(AgentWorkEscrow)`.
2. Query `AgentWorkEscrow.accumulatedFees()`.
3. Iterate through all intent IDs from `1` to `nextIntentId - 1`.
4. For each intent, if `status` is Active, add `amount` to the running total.

### Step B: Delta Analysis
- **Zero Delta:** The system is in a consistent state.
- **Positive Delta (Contract > Expected):** Extra funds are present. This could be due to an accidental direct transfer of USDC to the contract address.
- **Negative Delta (Contract < Expected):** Funds are missing. This is a **SEV0** event indicating a potential exploit or critical bug in the fund movement logic.

## 3. Reconciliation with External Revenue (Stripe)
Since the platform uses a hybrid model (On-chain Escrow for A2A work, Stripe for paid products), the "Total Platform Treasury" is the sum of:
1. `AgentWorkEscrow.accumulatedFees()` (unwithdrawn).
2. Safe treasury balance (withdrawn fees).
3. Stripe Payout balance (paid product revenue).

## 4. Operational Cadence
- **Daily:** Automated reconciliation script run via CI/Monitoring.
- **Weekly:** Manual review of the reconciliation report by the business owner.
- **Post-Incident:** Immediate reconciliation after any `SEV0` or `SEV1` event.
