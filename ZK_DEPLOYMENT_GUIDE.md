# ZK-SNARK Deployment Guide for AI Work Market

## Prerequisites

1. Have `PRIVATE_KEY` and `SELLER_PRIVATE_KEY` in `.env` or `.env.base-sepolia.local`
2. Have Base Sepolia ETH for gas in the deployer wallet
3. The existing USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Deployment Steps

### Step 1: Export the proof from snarkjs

Generate a fresh proof with real values:
```bash
cd ~/hive_improvement_initiatives/zkp_prototyping/build

# Create fresh trusted setup (already done)
# Compile circuit (already done)

# Generate proof with chosen capability
# For this demo, capability=3, commitment=9
echo '{"commitment": 9, "capability": 3}' > input.json

snarkjs groth16 fullprove input.json AgentWorkProof.wasm AgentWorkProof_0000.zkey proof.json public.json

# The proof.json and public.json are what the seller sends on-chain
```

### Step 2: Deploy contracts to Base Sepolia

```bash
cd ~/ai-work-market
source .env.base-sepolia.local

# Deploy both verifier and escrow
forge script script/DeployZK.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast -vvvv
```

This will deploy:
- `Groth16Verifier` (the snarkjs-generated verifier)
- `AgentWorkEscrowZK` (the enhanced escrow)

### Step 3: Verify on Basescan (Optional)

```bash
# Get API key from https://basescan.org/api
forge verify-contract \
  --chain-id 84532 \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY \
  \u003cVERIFIER_ADDRESS\u003e \
  contracts/AgentWorkProofVerifier.sol:Groth16Verifier

forge verify-contract \
  --chain-id 84532 \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY \
  \u003cESCROW_ADDRESS\u003e \
  contracts/AgentWorkEscrowZK.sol:AgentWorkEscrowZK
```

### Step 4: Test the ZK flow

1. **Create intent** (buyer):
```solidity
escrow.createIntent(
    seller,
    10000,       // 0.01 USDC
    3600,        // 1 hour work timeout
    3600,        // 1 hour review period
    keccak256("task_description"),
    "ipfs://QmWorkHash"
);
```

2. **Submit proof with ZK** (seller):
After generating proof.json and public.json, parse them and call:
```solidity
escrow.submitProofWithZK(
    intentId,
    "ipfs://QmProof",
    [\u003cpa_x0\u003e, \u003cpa_x1\u003e],               // pA from proof.json.pi_a
    [[\u003cpb_x0\u003e, \u003cpb_x1\u003e], [\u003cpb_x2\u003e, \u003cpb_x3\u003e]],  // pB from proof.json.pi_b
    [\u003cpc_x0\u003e, \u003cpc_x1\u003e],               // pC from proof.json.pi_c
    [\u003cpub0\u003e, \u003cpub1\u003e]                    // public.json values
);
```

3. **Release funds** (buyer):
```solidity
// This triggers on-chain ZK verification
escrow.release(intentId);
```

If the ZK proof is valid, funds release. If invalid, transaction reverts with ZKProofInvalid.

### Step 5: Production Considerations

1. **Replace x² with Poseidon**: The current circuit uses `capability² = commitment`. For production, use a proper hash like Poseidon or MiMC from circomlib.

2. **Trusted Setup Ceremony**: The current ptau file was generated locally. For production, run a multi-party ceremony or use a ceremony file from a trusted source like Perpetual Powers of Tau.

3. **Circuit Complexity**: The current circuit has 1 constraint. Real AWM circuits would have hundreds/thousands (hashing, Merkle proofs, arithmetic).

4. **Gas Optimization**: ZK verification costs ~630K gas. Consider batch verification or proof aggregation to amortize costs.

5. **Input Encoding**: Currently capability and commitment are raw integers. In production, encode them as field elements properly.

## Files
- Circuit: `~/hive_improvement_initiatives/zkp_prototyping/circuits/AgentWorkProof.circom`
- Pipeline: `~/hive_improvement_initiatives/zkp_prototyping/scripts/build_and_test.py`
- Escrow Contract: `~/ai-work-market/contracts/AgentWorkEscrowZK.sol`
- Verifier Contract: `~/ai-work-market/contracts/AgentWorkProofVerifier.sol`
- Deployment Script: `~/ai-work-market/script/DeployZK.s.sol`
- Tests: `~/ai-work-market/test/AgentWorkEscrowZK.t.sol`
