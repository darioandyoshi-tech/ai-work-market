# ZK Proof Artifacts

## Goal
Generate real Groth16 proof for submitProofWithZK() on AgentWorkEscrowZK.

## Current Status
Scaffolded. Need circom + snarkjs toolchain installed.

## Contract Interface
```
function submitProofWithZK(
    uint256 intentId,
    string memory proofURI,
    uint256[2] memory proof_a,
    uint256[2][2] memory proof_b,
    uint256[2] memory proof_c,
    uint256[1] memory publicSignals
) external;
```
