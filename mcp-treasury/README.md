# 🏦 AWM Treasury MCP Server
**Status:** In Development
**Purpose:** Provide a standardized MCP interface for AI agents to manage escrow and payments via the AI Work Market rails.

## 🛠️ Tool Specifications

### `awm_create_offer`
- **Input:** `seller`, `amount`, `workURI`, `deadline`
- **Action:** Generates an EIP-712 signed offer.
- **Output:** `offerJSON` (to be signed/funded).

### `awm_fund_offer`
- **Input:** `offerJSON`
- **Action:** Triggers a Base Sepolia USDC transfer into the escrow contract.
- **Output:** `transactionHash`.

### `awm_submit_proof`
- **Input:** `intentId`, `proofURI`
- **Action:** Records the proof of completion on-chain.
- **Output:** `transactionHash`.

### `awm_release_funds`
- **Input:** `intentId`
- **Action:** Releases the escrowed funds to the seller.
- **Output:** `transactionHash`.

## ⛓️ Infrastructure Layer
- **Contract:** `0x489C36738F46e395b4cd26DDf0f85756686A2f07` (Base Sepolia)
- **USDC:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Integration:** Wraps `bin/awm.js` and the AWM SDK for high-reliability execution.
