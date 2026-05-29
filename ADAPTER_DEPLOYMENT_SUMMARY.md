## AWM Commit-Reveal ZK Adapter — Deployment Complete

**Deployed:** 2026-05-29 (Base Mainnet, block ~46631824)
**New Deployer:** `0x7D2Ad997F17B7818b189d2fcC3e0aa1e1B2cE6C8`

---

### Contract Addresses

| Contract | Address | Role |
|----------|---------|------|
| AgentWorkEscrowZK | `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2` | Main escrow (Timelock-owned) |
| IntentProofVerifier (real) | `0x09DF1d2D899412cB6c20c37A392610985b8a0d80` | 3-public-input Groth16 verifier |
| **CommitRevealVerifierAdapter** | **`0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9`** | Bridges escrow (uint[2]) to real verifier (uint[3]) |

### Adapter Design

The adapter implements `IGroth16Verifier` with `verifyProof(uint[2], uint[2][2], uint[2], uint[2])`.

- `_pubSignals[0]` = the Poseidon `workHash` (used as lookup key)
- On `verifyProof`, adapter looks up committed `{buyer, seller}` from its mapping
- Reconstructs `uint[3] = [buyer_as_uint160, seller_as_uint160, workHash]`
- Delegates to `IntentProofVerifier.verifyProof(uint[2], uint[2][2], uint[2], uint[3])`

### New Agent Workflow (for real ZK verification)

1. **Seller calls** `adapter.commit(intentId, workHash)`
   - One-time pre-registration per intent
   - Gas: ~50,000 (= ~$0.01 on Base)

2. **Seller calls** `escrow.submitProofWithZK(intentId, proofURI, pA, pB, pC, [workHash, commitment])`
   - `_pubSignals[0]` must equal the pre-committed `workHash`

3. **Buyer calls** `escrow.release(intentId)`
   - Escrow calls `adapter.verifyProof(...)` internally
   - Adapter reconstructs `[buyer, seller, workHash]`, verifies against real verifier
   - If valid, funds released; if invalid, reverts `ZKProofInvalid`

---

### Governance Required: Activate Adapter

AgentWorkEscrowZK is owned by `Timelock 0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967`.

To activate real ZK verification, Safe must propose through Timelock:

```solidity
// Target: AgentWorkEscrowZK
// Call: setZkVerifier(0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9)
// Note: renounceRole already executed; deployer has no admin power
```

**Safe Configuration:**
- Safe: `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637`
- Threshold: 2-of-3
- Owners:
  1. `0xec89c40CA296F502cD033e07f18DA5e01cdd197d` (original deployer — key lost)
  2. `0x5d03e94ee2eddde143e7c17095195e7a54afe142` (external)
  3. `0x2dAF658B01e257206375798a15832E9f547D65dD` (external)

**⚠️ CRITICAL:** The original deployer key is required to reach threshold=2. If that key is truly lost, the Safe is permanently locked unless owners 2 & 3 act together. This is an **immutable system** by design.

---

### End-to-End Test Plan

1. Generate proof for Intent #3 (or #4)
2. Seller calls `adapter.commit(3, workHash)`
3. Seller calls `escrow.submitProofWithZK(3, ipfs://..., pA, pB, pC, [workHash, 1])`
4. Buyer calls `escrow.release(3)` → adapter verifies → funds released
5. Verify `ZKVerificationPassed` event emitted

**Without governance:** `setZkVerifier()` must point to adapter. Until then, `submitProofWithZK` will revert (or plain `submitProof` bypasses ZK via `zkProofs[intentId].submitted == false`).

---

### Files

- `~/ai-work-market/contracts/CommitRevealVerifierAdapter.sol`
- `~/ai-work-market/script/DeployAdapter.s.sol`
- `~/ai-work-market/broadcast/DeployAdapter.s.sol/8453/run-latest.json`
