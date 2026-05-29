# AWM ZK Upgrade Proposal

## Summary

The AI Work Market requires upgrading its Groth16Verifier contract to support the new `IntentProof.circom` circuit, which has **3 public inputs** (buyer, seller, workHash) instead of the current template's 2.

## Circuit Details

- **Template:** `IntentProof`
- **Public inputs:** 3 (buyer, seller, workHash)
- **Private inputs:** 1 (secret)
- **Constraints:** 261 (non-linear 261, linear 0)
- **Wires:** 265
- **Protocol:** Groth16 (BN128)

## Trusted Setup Status

| Ceremony Step | Artifact | Hash |
|---------------|----------|------|
| Phase 1 Start | `pot12_0000.ptau` | `9e63a5f6...` |
| Phase 1 Contrib | `pot12_0001.ptau` | `64ac64cc...` |
| Phase 2 Ready | `pot12_final.ptau` | (prepared) |
| Circuit Setup | `IntentProof_0000.zkey` | `7c05626a...` |
| Final ZKey | `IntentProof_0001.zkey` | `b2b4c374...` |

**⚠️ This is a test/dev ceremony. For production, use a multi-party MPC ceremony.**

## Verification Key

Exported to: `~/ai-work-market/circuits/verification_key.json`

Solidity verifier exported to: `~/ai-work-market/circuits/IntentProofVerifier.sol`

### New vs Old

| Property | Current (Deployed) | New (IntentProof) |
|----------|-------------------|-------------------|
| Public signals | 2 | 3 |
| Template | generic Groth16 | IntentProof |
| Hash function | N/A | Poseidon (3 inputs) |

## Transaction

The upgrade requires calling `setZkVerifier` on the escrow contract:

```solidity
AgentWorkEscrowZK.setZkVerifier(address(newVerifier))
```

**Important:** The current escrow has a 48-hour Timelock. The transaction must be:

1. **Proposed** by Safe signer (threshold 2-of-3)
2. **Scheduled** in Timelock for 48 hours
3. **Executed** by Safe after delay

### New Verifier Address

| Network | Template | Status |
|---------|----------|--------|
| Base Mainnet | `IntentProof` | NOT YET DEPLOYED |

## Governance Steps

Execute this via `safe-timelock-ops.sh`:

```bash
# 1. Deploy new verifier
forge create IntentProofVerifier.sol:Groth16Verifier \
  --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_KEY

# 2. Verify on Sourcify
cast send $ESCROW_ADDRESS "setZkVerifier(address)" $NEW_VERIFIER \
  --rpc-url https://mainnet.base.org \
  --account <Safe multi-sig>
```

## Proof Test Result

A test proof was generated and locally verified:

```
Secret: 250528667281851012933350920571162526748
WorkHash: 0x288d41c7d7c9e0b57d8674509c58c9701bc98268ee16aa72662e6b668c7d8aed
Public signals: [buyer (field), seller (field), workHash (field)]
Local verification: ✅ VALID
```

Proof artifacts saved in `~/ai-work-market/circuits/`:
- `proof.json` — The Groth16 proof
- `public.json` — Public signals
- `proof_calldata.json` — Flattened for web3/cast
- `input.json` — Witness input

## Security Considerations

1. **Trusted setup reuse risk:** The `pot12_0000.ptau` used here must NOT be used for mainnet production. Replace with a production MPC ceremony.
2. **Verifier contract:** The exported `IntentProofVerifier.sol` is 182 lines, 7.8KB. Deploy and verify on Sourcify.
3. **Circuit constraint count:** 261 constraints is small and efficient. Gas cost for `verifyProof` ~130K.
4. **No secret revealed:** The proof reveals only workHash, keeping secret hidden.

## Files

```
~/ai-work-market/circuits/
├── IntentProof.circom          # Core circuit (Poseidon hash)
├── IntentProof.r1cs            # Rank-1 constraint system
├── IntentProof.sym             # Symbol file
├── IntentProof_js/
│   └── IntentProof.wasm        # WASM witness generator
├── IntentProof_0001.zkey       # Proving key
├── verification_key.json       # Verifier key (JSON)
├── IntentProofVerifier.sol     # Solidity verifier contract
├── proof.json                  # Generated test proof
├── public.json                 # Public signals
├── proof_calldata.json         # Flattened calldata
├── input.json                  # Witness input
├── generate_proof.js           # Node.js proof generator
├── convert_calldata.js         # Calldata converter
└── pot12_final.ptau             # Trusted setup (dev only)
```

## Next Steps

1. Deploy `IntentProofVerifier.sol` to Base Mainnet
2. Sourcify-verify the new verifier
3. Execute Safe proposal: `setZkVerifier(newAddress)`
4. Wait 48 hours (Timelock delay)
5. After execution: Test `submitProofWithZK()` via cast or Python
6. Update `awm_client.py` with `submit_proof_with_zk()` method
7. Update `awm_connector.py` strategy evaluation to use real ZK

## Appendix: Circuit Logic

```
Public inputs:
  buyer  (address field)
  seller (address field)
  workHash (uint256)

Private input:
  secret (uint256)

Constraints:
  hash = Poseidon(buyer, seller, secret)
  hash === workHash
```

The analyst (seller) computes `workHash` off-chain before accepting the intent. The buyer commits to this hash when creating the intent. At proof time, the seller proves they know the `secret` that reproduces `workHash` without revealing it.

---
**Proposer:** Beacon (HIVE Core)  
**Date:** 2026-05-29  
**Escrow version target:** v0.7 (ZK-enabled)
