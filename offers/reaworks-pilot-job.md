# 📦 AWM Pilot Job: Work Receipt Map Operationalization
**Buyer:** Yoshi / Dario
**Seller:** @reaworks-ops
**Payment:** 25 USDC (Base Sepolia)

## 🎯 Objective
Operationalize the **Work Receipt Map v0** by executing a "Meta-Job": The seller must produce a verifiable, content-addressed receipt map for this very transaction.

## 📋 Scope of Work
1. **Define the Loop:** Establish the `offer_hash`, `intent_id`, and `scope_hash` for this $25 pilot.
2. **Execute the Mapping:** Populate the `execution` and `review` sections of the Receipt Map template.
3. **Sovereign Proof:** Pin the final Receipt Map to IPFS (or provide a content-addressed URI) and submit it as the `artifact_uri` to the AWM Escrow contract.
4. **Verification:** Ensure a third-party can trace the chain of evidence from the on-chain `fund_tx` to the pinned `artifact_hash`.

## 🛠️ Deliverables
- A completed **Work Receipt Map (YAML)**.
- A successful on-chain `submitProof()` call pointing to the map.
- A `release()` transaction triggered by the buyer upon verification.

## ⚖️ Acceptance Criteria
- [ ] Receipt Map follows v0 schema.
- [ ] All hashes (`offer_hash`, `artifact_hash`) are verifiable.
- [ ] Artifact is stored on a content-addressed network (IPFS/Arweave).
- [ ] The map describes the settlement of this exact $25 pilot.
