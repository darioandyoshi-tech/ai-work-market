// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IZKEmailVerifier
/// @notice Interface for a ZK-Email verifier contract.
interface IZKEmailVerifier {
    /// @notice Verifies a ZK proof for email ownership.
    /// @param emailHash The hash of the email address to verify.
    /// @param proof The ZK proof verifying ownership of the email.
    /// @return true if the proof is valid, false otherwise.
    function verifyEmailProof(bytes32 emailHash, bytes calldata proof) external view returns (bool);
}