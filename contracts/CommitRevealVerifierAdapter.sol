// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CommitRevealVerifierAdapter
/// @notice Bridges AgentWorkEscrowZK (expects uint[2] pubSignals) to IntentProofVerifier (expects uint[3] pubSignals).
/// @dev Sellers must call commit(intentId, workHash) before escrow.submitProofWithZK().
///      On verifyProof, adapter looks up committed buyer/seller, reconstructs uint[3], then delegates to real verifier.
interface IGroth16Verifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) external returns (bool);
}

/// @notice Real verifier exported from snarkJS (expects 3 public inputs: buyer, seller, workHash)
interface IRealGroth16Verifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
}

/// @notice Minimal view into escrow intents struct (first 2 fields needed for access control)
interface IAgentWorkEscrowZK {
    function intents(uint256 intentId) external view returns (
        address buyer,
        address seller,
        uint256 amount,
        uint256 feeBps,
        uint256 workDeadline,
        uint256 reviewDeadline,
        uint256 reviewPeriod,
        bytes32 workHash,
        string memory workURI,
        string memory proofURI,
        uint8 status
    );
}

contract CommitRevealVerifierAdapter is IGroth16Verifier {
    struct Commitment {
        address buyer;
        address seller;
        uint256 timestamp;
    }

    IRealGroth16Verifier public immutable realVerifier;
    IAgentWorkEscrowZK public immutable escrow;

    /// @notice workHash (Poseidon hash) => commitment info (looked up during verifyProof)
    mapping(uint256 => Commitment) public commits;

    event WorkHashCommitted(uint256 indexed intentId, uint256 indexed workHash, address buyer, address seller);

    constructor(address _realVerifier, address _escrow) {
        realVerifier = IRealGroth16Verifier(_realVerifier);
        escrow = IAgentWorkEscrowZK(_escrow);
    }

    /// @notice Seller commits buyer/seller for a given workHash before submitting ZK proof.
    /// @param intentId Which escrow intent this proof belongs to.
    /// @param workHash The Poseidon hash = poseidon(buyer, seller, secret). Used as lookup key in verifyProof.
    function commit(uint256 intentId, uint256 workHash) external {
        (address buyer, address seller,,,,,,,,,) = escrow.intents(intentId);
        require(msg.sender == seller, "Adapter: not seller");
        require(commits[workHash].timestamp == 0, "Adapter: already committed");

        commits[workHash] = Commitment(buyer, seller, block.timestamp);
        emit WorkHashCommitted(intentId, workHash, buyer, seller);
    }

    /// @notice Called by AgentWorkEscrowZK release() / claimAfterReview().
    /// @dev _pubSignals[0] must be the committed workHash (Poseidon hash).
    ///      Adapter reconstructs [buyer, seller, workHash] as uint[3] for the real verifier.
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals
    ) external view override returns (bool) {
        uint256 workHash = _pubSignals[0];
        Commitment memory c = commits[workHash];
        require(c.timestamp != 0, "Adapter: workHash not committed");

        uint[3] memory reconstructed = [
            uint256(uint160(c.buyer)),
            uint256(uint160(c.seller)),
            workHash
        ];

        return realVerifier.verifyProof(_pA, _pB, _pC, reconstructed);
    }
}
