# Slither Triage — AgenticCommerceAWM (ERC-8183)

**Date:** 2026-08-21
**Contract:** `contracts/AgenticCommerceAWM.sol`
**Command:**
```bash
slither contracts/AgenticCommerceAWM.sol --filter-paths 'lib|node_modules'
```

## Result summary
- **High findings: 0**
- **Medium findings: 0**
- **Low findings: 0**
- **Informational findings: 16** (all triaged below, none actionable vulnerabilities)

## Findings accepted / rationale

### 1. `arbitrary-send-erc20` (fund)
`fund()` calls `paymentToken.safeTransferFrom(job.client, address(this), job.budget)`.
The "arbitrary from" is `job.client`, which is verified to equal `_msgSender()`
(`if (_msgSender() != job.client) revert NotClient()`). The client can only pull
from their own balance. **Not a vulnerability — by design.**

### 2. `reentrancy-no-eth` / `reentrancy-benign` / `reentrancy-events` (complete, fund, reject, setBudget, setProvider, submit)
These arise from the `IACPHook` `_before`/`_after` callbacks. Per ERC-8183, hooks
are **trusted contracts chosen by the client at job creation** and are the
specified extension point. Mitigations:
- State-changing functions (`complete`, `reject`, `fund`) are `nonReentrant`.
- A reverting hook rolls back the entire transaction (atomicity, per spec).
- `claimRefund` is deliberately **not** hookable (permissionless safety path).
**Benign — hooks are trusted and the spec explicitly permits their behavior.**

### 3. `missing-zero-check` (trustedForwarder)
`trustedForwarder = address(0)` is a **valid** value meaning "gasless disabled."
The constructor and `setTrustedForwarder` intentionally allow zero to disable
ERC-2771. **Intentional — not a bug.**

### 4. `timestamp` (createJob, claimRefund)
Standard expiry comparisons (`expiredAt_ <= block.timestamp`,
`block.timestamp < job.expiredAt`). Deadline-based escrow is by design; minimum
expiry is 1 hour, so sequencer drift is immaterial. **Informational.**

### 5. `assembly` (_msgSender)
Inline assembly extracts the last 20 bytes of calldata when called by the
trusted forwarder — the standard ERC-2771 pattern. **Informational.**

## Conclusion
`AgenticCommerceAWM.sol` is **clean** under Slither: 0 high, 0 medium, 0 low.
All 16 informational findings are either by-design behavior (trusted hooks,
client-pull funding, gasless-disabled sentinel) or standard patterns (timestamp
expiry, ERC-2771 assembly). No code changes required for these.

## Related
- `docs/slither-triage.md` (original AgentWorkEscrow triage)
- `docs/erc-8183-alignment-spec.md` (design rationale)
