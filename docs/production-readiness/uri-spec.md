# AWM Content-Addressed URI Specification

This document defines the requirements for URIs used as evidence (proofs and disputes) within the AI Work Market escrow system.

## Motivation

The `AgentWorkEscrow` contract relies on off-chain evidence to resolve disputes. If a URI points to a mutable resource (e.g., a standard HTTP URL), the evidence can be changed after the fact, compromising the integrity of the arbitration process.

By requiring content-addressed URIs, we ensure that the evidence is immutable. The URI itself is derived from the content; if the content changes, the URI changes.

## Specification v1.0

### 1. Mandatory Protocol
All `proofURI` and `disputeURI` submissions must use the **IPFS** protocol.

**Required Prefix:** `ipfs://`

### 2. Formatting
- The URI must start exactly with `ipfs://`.
- The string following the prefix must be a valid IPFS CID (Content Identifier).
- Total length must remain within the contract's `MAX_URI_BYTES` (512 bytes).

### 3. Validation Logic (On-Chain)
To keep gas costs low while providing basic guardrails, the contract performs the following checks:
1. **Non-Empty:** The URI string must not be empty.
2. **Prefix Check:** The first 7 bytes of the string must be `ipfs://`.
3. **Length Check:** The total length must be $\le 512$ bytes.

### 4. Off-Chain Verification
The arbitrator (Multisig owner) must:
1. Resolve the `ipfs://` URI using a trusted IPFS gateway.
2. Verify that the retrieved content matches the work specification defined in the original `workHash`.
3. Ensure the content was created/uploaded before the relevant deadline.

## Implementation Plan

1. Update `AgentWorkEscrow._validateURI` to enforce the `ipfs://` prefix for proof and dispute URIs.
2. Note: `workURI` is specified at the time of the offer. While encouraged to be `ipfs://`, it is not strictly enforced at the contract level yet to allow for flexible offer creation (e.g., linking to a GitHub issue or a specific doc), provided the `workHash` is used for verification. However, `proofURI` and `disputeURI` are terminal evidence and **must** be immutable.
