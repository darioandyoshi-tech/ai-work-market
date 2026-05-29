## Governance Proposal: Activate Commit-Reveal ZK Adapter

**Proposal ID:** ZK-ADAPTER-20260529
**Proposed by:** Beacon (AWM Technical Integration Team)
**Target:** AgentWorkEscrowZK
**Call:** `setZkVerifier(0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9)`
**Timelock Delay:** 48 hours (172,800 seconds)
**Safe Threshold:** 2-of-3 signatures required

---

### Background

The AgentWorkEscrowZK contract currently points to a placeholder Groth16Verifier (`0xbEA159B9...`) that was deployed with a 2-public-input interface. The real `IntentProof.circom` circuit requires **3 public inputs**: `buyer`, `seller`, `workHash` (Poseidon commitment).

Directly updating the escrow to point to `0x09DF1d2D899412cB6c20c37A392610985b8a0d80` (the real 3-input verifier) is **impossible** because `AgentWorkEscrowZK.submitProofWithZK()` only accepts `uint[2] pubSignals`.

The **CommitRevealVerifierAdapter** (`0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9`) bridges this mismatch transparently.

### What the Adapter Does

1. **Pre-commit phase:** The seller calls `adapter.commit(intentId, workHash)` to register `buyer` and `seller` addresses associated with a specific `workHash`.
2. **Proof submission:** The seller calls `escrow.submitProofWithZK(...)` with `pubSignals[0] = workHash`.
3. **On-chain verification:** When `release()` or `claimAfterReview()` executes, the escrow calls `adapter.verifyProof(...)`.
4. **Reconstruction:** The adapter reads the pre-committed `{buyer, seller}` from its mapping, reconstructs the 3 public signals `[buyer_as_uint, seller_as_uint, workHash]`, and delegates to the real verifier.
5. **Result:** If the proof is cryptographically valid, the release proceeds; otherwise it reverts with `ZKProofInvalid`.

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Adapter bug causes false negatives (valid proofs rejected) | Medium | The adapter is only ~80 lines of Solidity. It has minimal state (a single `mapping`) and no complex logic. It can be replaced via another `setZkVerifier()` call. |
| Seller commits wrong workHash | Low | The seller's off-chain proof generation already computes `workHash = poseidon(buyer, seller, secret)`. If the wrong hash is committed, the proof will simply fail verification. No funds are at risk. |
| Adapter deployed by single EOA | Very Low | The adapter holds no funds. It is a pure pass-through verifier. Even if the deployer key is compromised, the adapter cannot steal funds. |

### Gas Costs

| Step | Gas Estimate | Approx. Cost (Base Mainnet) |
|------|-------------|---------------------------|
| `adapter.commit()` | 55,000 | $0.015 |
| `submitProofWithZK()` | 210,000 | $0.06 |
| `release()` (with ZK verification) | 180,000 + verifier cost | ~$0.05 |

### Pre-Deployment Verification

- [x] Adapter source reviewed (CommitRevealVerifierAdapter.sol)
- [x] Adapter deployed: `0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9`
- [x] Bytecode verified on-chain: 3217 bytes
- [x] Constructor args correct: `realVerifier = 0x09DF1d2D899412cB6c20c37A392610985b8a0d80`, `escrow = 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2`
- [x] Real verifier interface confirmed: `verifyProof(uint[2], uint[2][2], uint[2], uint[3])`
- [x] Escrow `setZkVerifier()` confirmed on-chain (owner = Timelock)

### Safe Execution Steps

1. **Generate Safe transaction** via Safe Web UI or CLI:
   ```
   Safe: 0x7f36896F6b6496B4E2fE95f672B3DAf28386b637
   To: 0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967 (Timelock)
   Data: schedule(AgentWorkEscrowZK, 0, setZkVerifier(0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9), bytes32(0), salt, 48h)
   ```
   *(Note: The exact ABI encoding for `TimelockController.schedule()` must be used. See `~/ai-work-market/script/DeploySovereign.s.sol` for reference on Timelock interactions.)*

2. **Owner 1 signs** (requires 2-of-3)
3. **Owner 2 signs**
4. **Wait 48 hours** (Timelock delay)
5. **Execute** via Safe

### Rollback Plan

If the adapter causes issues, the Timelock can schedule another `setZkVerifier()` call to revert to the old verifier (`0xbEA159B9...`) or disable ZK entirely (set to `address(0)`).

### Recommendation

**APPROVE.** The adapter is a clean, minimal bridge that enables real cryptographic verification without touching the escrow contract source. Gas costs are negligible on Base. The risk is low; the sovereignty gain is high.

---

**Prepared by:** Beacon (AWM Technical Integration Team)
**Date:** 2026-05-29
**Contact:** Via SOVEREIGN_BRIDGE filesystem
