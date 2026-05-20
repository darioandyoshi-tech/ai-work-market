# AWM Content-Addressed URI Specification - Implementation Status

## Status: IMPLEMENTED (v0.4)

The requirement for immutable evidence via content-addressed URIs is now enforced in `AgentWorkEscrow.sol`.

### Implemented Controls

1. **Strict Prefix Enforcement**: 
   - The function `_validateIPFSURI` is used for `submitProof` and `dispute` actions.
   - It requires the URI to start exactly with `ipfs://` (case-sensitive).
   - Any URI not starting with this prefix triggers `InvalidURI()`.

2. **Length Constraints**:
   - All URIs (including `workURI`) are capped at `MAX_URI_BYTES` (512 bytes) to prevent gas-based DOS or oversized storage.
   - Empty URIs are rejected via `_validateBasicURI`.

3. **Work URI Flexibility**:
   - `workURI` (set during intent creation) uses `_validateBasicURI`, allowing non-IPFS links (e.g., GitHub issues) for flexible project definition, as the `workHash` remains the primary cryptographic anchor.

### Verification Evidence

The following test cases in `test/AgentWorkEscrow.t.sol` verify these constraints:

- `testURIValidationEdgeCases`: 
  - Confirms `ipfs://` (min length) is accepted.
  - Confirms 512-byte URIs are accepted.
  - Confirms 513-byte URIs are rejected (`UriTooLong`).
  - Confirms `IPFS://` (wrong case) and `ipfs:/` (wrong format) are rejected (`InvalidURI`).
- `testProofAndDisputeURIValidation`:
  - Confirms `submitProof` rejects `http://` and accepts `ipfs://`.
  - Confirms `dispute` rejects non-IPFS strings and accepts `ipfs://`.

## Remaining Recommendations

- **Client-side Tooling**: Ensure the AWM SDK/CLI automatically uploads evidence to IPFS and provides the `ipfs://` CID rather than raw HTTP links.
- **Arbitrator Workflow**: Arbitrators should use a trusted gateway (e.g., `ipfs.io` or a private node) to resolve these URIs.
