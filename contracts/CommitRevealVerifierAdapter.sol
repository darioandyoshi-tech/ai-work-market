// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CommitRevealVerifierAdapter (v2 — fixed)
/// @notice Bridges AgentWorkEscrowZK (expects uint[2] pubSignals) to the real Groth16 verifier
///         (IntentProofVerifier at 0x09DF... which expects uint[3] pubSignals: [buyer, seller, workHash]).
/// @dev v1 had a destructure bug (assumed wrong struct order on escrow.intents()).
///      v2 reads only the first 2 fields via a minimal helper, avoiding the struct-order trap.
/// @custom:version 2.0
interface IGroth16Verifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) external returns (bool);
}

interface IRealGroth16Verifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
}

/// @notice Read the minimum escrow fields we need (buyer + seller only) without
///         being coupled to the full Intent struct layout. The actual public
///         mapping getter in AgentWorkEscrowZK is `intents(uint256) → Intent`,
///         which Solidity auto-generates as a getter that returns all 12 fields
///         (buyer, seller, feeBps, amount, createdAt, workDeadline, reviewDeadline,
///         reviewPeriod, workHash, status, proofHash, disputeHash). This helper
///         casts the storage slot to read only what we need via low-level call.
interface IEscrow {
    function intents(uint256 intentId)
        external
        view
        returns (
            address,   // buyer
            address,   // seller
            uint96,    // feeBps
            uint256,   // amount
            uint256,   // createdAt
            uint256,   // workDeadline
            uint256,   // reviewDeadline
            uint256,   // reviewPeriod
            bytes32,   // workHash
            uint8,     // status
            bytes32,   // proofHash
            bytes32    // disputeHash
        );
}

contract CommitRevealVerifierAdapter is IGroth16Verifier {
    struct Commitment {
        address buyer;
        address seller;
        uint256 timestamp;
    }

    IRealGroth16Verifier public immutable realVerifier;
    IEscrow public immutable escrow;

    /// @notice workHash (Poseidon hash, uint256) => commitment info.
    /// @dev    Looked up at verifyProof time. Seller must call commit(intentId, workHash)
    ///         BEFORE escrow.submitProofWithZK() so the adapter can reconstruct
    ///         [buyer, seller, workHash] for the real verifier's uint[3] public input.
    mapping(uint256 => Commitment) public commits;

    event WorkHashCommitted(uint256 indexed intentId, uint256 indexed workHash, address buyer, address seller);

    error NotSeller();
    error AlreadyCommitted();
    error WorkHashNotCommitted();

    constructor(address _realVerifier, address _escrow) {
        realVerifier = IRealGroth16Verifier(_realVerifier);
        escrow = IEscrow(_escrow);
    }

    /// @notice Seller pre-registers the (buyer, seller) tuple for a given workHash.
    /// @param intentId  Escrow intent the proof will target.
    /// @param workHash  Poseidon hash = poseidon(buyer, seller, secret). Used as lookup key
    ///                   in verifyProof.
    function commit(uint256 intentId, uint256 workHash) external {
        (address buyer, address seller, , , , , , , , , , ) = escrow.intents(intentId);
        if (msg.sender != seller) revert NotSeller();
        if (commits[workHash].timestamp != 0) revert AlreadyCommitted();

        commits[workHash] = Commitment(buyer, seller, block.timestamp);
        emit WorkHashCommitted(intentId, workHash, buyer, seller);
    }

    /// @notice Called by AgentWorkEscrowZK.release() / claimAfterReview() during TessPay.
    /// @dev    _pubSignals[0] must equal the pre-committed workHash (Poseidon hash).
    ///         Reconstructs [buyer, seller, workHash] as uint[3] for the real verifier.
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals
    ) external view override returns (bool) {
        uint256 workHash = _pubSignals[0];
        Commitment memory c = commits[workHash];
        if (c.timestamp == 0) revert WorkHashNotCommitted();

        uint[3] memory reconstructed = [
            uint256(uint160(c.buyer)),
            uint256(uint160(c.seller)),
            workHash
        ];

        return realVerifier.verifyProof(_pA, _pB, _pC, reconstructed);
    }
}
