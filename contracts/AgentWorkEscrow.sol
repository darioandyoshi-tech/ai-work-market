// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentWorkEscrow
/// @notice USDC escrow for agent-to-agent work on Base/Base Sepolia.
/// @dev v0.4 uses OpenZeppelin EIP712/SignatureChecker/SafeERC20/ReentrancyGuard/Ownable2Step.
contract AgentWorkEscrow is EIP712, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Funded,
        ProofSubmitted,
        Released,
        Refunded,
        Disputed,
        Resolved
    }

    struct Intent {
        address buyer;
        address seller;
        uint96 feeBps;
        uint256 amount;
        uint256 createdAt;
        uint256 workDeadline;
        uint256 reviewDeadline;
        uint256 reviewPeriod;
        bytes32 workHash;
        string workURI;
        Status status;
        string proofURI;
        string disputeURI;
    }

    IERC20 public immutable usdc;
    address public feeRecipient;

    uint96 public defaultFeeBps = 100;
    uint96 public constant MAX_FEE_BPS = 1_000;
    uint96 public constant BPS_DENOMINATOR = 10_000;

    uint256 public constant MIN_WORK_TIMEOUT = 1 hours;
    uint256 public constant MAX_WORK_TIMEOUT = 30 days;
    uint256 public constant MIN_REVIEW_PERIOD = 1 hours;
    uint256 public constant MAX_REVIEW_PERIOD = 14 days;
    uint256 public constant MAX_URI_BYTES = 512;

    bytes32 public constant SELLER_OFFER_TYPEHASH = keccak256(
        "SellerOffer(address buyer,address seller,uint256 amount,bytes32 workHash,bytes32 workURIHash,uint256 workTimeoutSeconds,uint256 reviewPeriodSeconds,uint256 nonce,uint256 offerExpiresAt)"
    );

    uint256 public nextIntentId = 1;
    uint256 public accumulatedFees;

    mapping(uint256 => Intent) public intents;
    mapping(bytes32 => bool) public usedOfferDigests;
    mapping(address => mapping(uint256 => bool)) public cancelledNonces;

    event IntentCreated(
        uint256 indexed intentId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        bytes32 workHash,
        string workURI,
        uint256 workDeadline,
        uint256 reviewPeriod,
        uint96 feeBps
    );
    event SignedOfferFunded(uint256 indexed intentId, bytes32 indexed offerDigest, uint256 nonce);
    event OfferNonceCancelled(address indexed seller, uint256 indexed nonce);
    event ProofSubmitted(uint256 indexed intentId, string proofURI, uint256 reviewDeadline);
    event Released(uint256 indexed intentId, uint256 sellerAmount, uint256 feeAmount);
    event ClaimedAfterReview(uint256 indexed intentId, uint256 sellerAmount, uint256 feeAmount);
    event Refunded(uint256 indexed intentId, uint256 amount);
    event Disputed(uint256 indexed intentId, address indexed openedBy, string disputeURI);
    event DisputeResolved(uint256 indexed intentId, uint256 buyerAmount, uint256 sellerAmount, uint256 feeAmount, bool chargeFee);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event DefaultFeeBpsUpdated(uint96 feeBps);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidTimeout();
    error InvalidReviewPeriod();
    error InvalidFee();
    error InvalidSplit();
    error InvalidURI();
    error UriTooLong();
    error InvalidWorkHash();
    error SelfEscrow();
    error NotBuyer();
    error NotSeller();
    error NotParty();
    error NotFeeRecipient();
    error InvalidStatus();
    error WorkDeadlinePassed();
    error RefundUnavailable();
    error ClaimUnavailable();
    error NoFees();
    error OfferExpired();
    error OfferUsed();
    error OfferCancelled();
    error InvalidSignature();

    constructor(address usdc_, address feeRecipient_) EIP712("AI Work Market", "0.4") Ownable(msg.sender) {
        if (usdc_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        feeRecipient = feeRecipient_;
    }

    /// @notice Test/admin-friendly direct intent creation. Production flows should prefer createIntentFromSignedOffer.
    function createIntent(
        address seller,
        uint256 amount,
        uint256 workTimeoutSeconds,
        uint256 reviewPeriodSeconds,
        bytes32 workHash,
        string calldata workURI
    ) external nonReentrant returns (uint256 intentId) {
        intentId = _createIntent(msg.sender, seller, amount, workTimeoutSeconds, reviewPeriodSeconds, workHash, workURI);
    }

    /// @notice Buyer funds an escrow from a seller-signed EIP-712 offer.
    function createIntentFromSignedOffer(
        address seller,
        uint256 amount,
        uint256 workTimeoutSeconds,
        uint256 reviewPeriodSeconds,
        bytes32 workHash,
        string calldata workURI,
        uint256 nonce,
        uint256 offerExpiresAt,
        bytes calldata signature
    ) external nonReentrant returns (uint256 intentId) {
        if (block.timestamp > offerExpiresAt) revert OfferExpired();
        if (cancelledNonces[seller][nonce]) revert OfferCancelled();

        bytes32 offerDigest = getOfferDigest(
            msg.sender,
            seller,
            amount,
            workHash,
            keccak256(bytes(workURI)),
            workTimeoutSeconds,
            reviewPeriodSeconds,
            nonce,
            offerExpiresAt
        );
        if (usedOfferDigests[offerDigest]) revert OfferUsed();
        if (!SignatureChecker.isValidSignatureNow(seller, offerDigest, signature)) revert InvalidSignature();

        usedOfferDigests[offerDigest] = true;
        intentId = _createIntent(msg.sender, seller, amount, workTimeoutSeconds, reviewPeriodSeconds, workHash, workURI);

        emit SignedOfferFunded(intentId, offerDigest, nonce);
    }

    /// @notice Seller cancels a not-yet-funded signed offer nonce.
    function cancelOfferNonce(uint256 nonce) external {
        cancelledNonces[msg.sender][nonce] = true;
        emit OfferNonceCancelled(msg.sender, nonce);
    }

    function getOfferDigest(
        address buyer,
        address seller,
        uint256 amount,
        bytes32 workHash,
        bytes32 workURIHash,
        uint256 workTimeoutSeconds,
        uint256 reviewPeriodSeconds,
        uint256 nonce,
        uint256 offerExpiresAt
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SELLER_OFFER_TYPEHASH,
                buyer,
                seller,
                amount,
                workHash,
                workURIHash,
                workTimeoutSeconds,
                reviewPeriodSeconds,
                nonce,
                offerExpiresAt
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function submitProof(uint256 intentId, string calldata proofURI) external {
        _validateIPFSURI(proofURI);
        Intent storage intent = intents[intentId];
        if (msg.sender != intent.seller) revert NotSeller();
        if (intent.status != Status.Funded) revert InvalidStatus();
        if (block.timestamp >= intent.workDeadline) revert WorkDeadlinePassed();

        uint256 reviewDeadline = block.timestamp + intent.reviewPeriod;
        intent.proofURI = proofURI;
        intent.reviewDeadline = reviewDeadline;
        intent.status = Status.ProofSubmitted;

        emit ProofSubmitted(intentId, proofURI, reviewDeadline);
    }

    function release(uint256 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        if (msg.sender != intent.buyer) revert NotBuyer();
        if (intent.status != Status.ProofSubmitted) revert InvalidStatus();

        intent.status = Status.Released;
        (uint256 feeAmount, uint256 sellerAmount) = _feeSplit(intent.amount, intent.feeBps);
        accumulatedFees += feeAmount;
        usdc.safeTransfer(intent.seller, sellerAmount);

        emit Released(intentId, sellerAmount, feeAmount);
    }

    function claimAfterReview(uint256 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        if (msg.sender != intent.seller) revert NotSeller();
        if (intent.status != Status.ProofSubmitted) revert InvalidStatus();
        if (block.timestamp < intent.reviewDeadline) revert ClaimUnavailable();

        intent.status = Status.Released;
        (uint256 feeAmount, uint256 sellerAmount) = _feeSplit(intent.amount, intent.feeBps);
        accumulatedFees += feeAmount;
        usdc.safeTransfer(intent.seller, sellerAmount);

        emit ClaimedAfterReview(intentId, sellerAmount, feeAmount);
    }

    function refund(uint256 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        if (msg.sender != intent.buyer) revert NotBuyer();
        if (intent.status != Status.Funded) revert InvalidStatus();
        if (block.timestamp <= intent.workDeadline) revert RefundUnavailable();

        intent.status = Status.Refunded;
        usdc.safeTransfer(intent.buyer, intent.amount);

        emit Refunded(intentId, intent.amount);
    }

    function dispute(uint256 intentId, string calldata disputeURI) external {
        _validateIPFSURI(disputeURI);
        Intent storage intent = intents[intentId];
        if (msg.sender != intent.buyer && msg.sender != intent.seller) revert NotParty();
        if (intent.status != Status.Funded && intent.status != Status.ProofSubmitted) revert InvalidStatus();

        intent.disputeURI = disputeURI;
        intent.status = Status.Disputed;

        emit Disputed(intentId, msg.sender, disputeURI);
    }

    function resolveDispute(uint256 intentId, uint256 buyerAmount, uint256 sellerAmount, bool chargeFee)
        external
        onlyOwner
        nonReentrant
    {
        Intent storage intent = intents[intentId];
        if (intent.status != Status.Disputed) revert InvalidStatus();
        if (buyerAmount + sellerAmount != intent.amount) revert InvalidSplit();

        intent.status = Status.Resolved;

        uint256 feeAmount = 0;
        uint256 sellerNet = sellerAmount;
        if (chargeFee && sellerAmount > 0) {
            (feeAmount, sellerNet) = _feeSplit(sellerAmount, intent.feeBps);
            accumulatedFees += feeAmount;
        }

        if (buyerAmount > 0) usdc.safeTransfer(intent.buyer, buyerAmount);
        if (sellerNet > 0) usdc.safeTransfer(intent.seller, sellerNet);

        emit DisputeResolved(intentId, buyerAmount, sellerNet, feeAmount, chargeFee);
    }

    function withdrawFees() external nonReentrant {
        if (msg.sender != feeRecipient) revert NotFeeRecipient();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoFees();
        accumulatedFees = 0;
        usdc.safeTransfer(feeRecipient, amount);
        emit FeesWithdrawn(feeRecipient, amount);
    }

    function setFeeRecipient(address feeRecipient_) external onlyOwner {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }

    function setDefaultFeeBps(uint96 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();
        defaultFeeBps = feeBps_;
        emit DefaultFeeBpsUpdated(feeBps_);
    }

    function _createIntent(
        address buyer,
        address seller,
        uint256 amount,
        uint256 workTimeoutSeconds,
        uint256 reviewPeriodSeconds,
        bytes32 workHash,
        string calldata workURI
    ) internal returns (uint256 intentId) {
        _validateIntentInputs(buyer, seller, amount, workTimeoutSeconds, reviewPeriodSeconds, workHash, workURI);

        intentId = nextIntentId++;
        uint256 workDeadline = block.timestamp + workTimeoutSeconds;

        intents[intentId] = Intent({
            buyer: buyer,
            seller: seller,
            feeBps: defaultFeeBps,
            amount: amount,
            createdAt: block.timestamp,
            workDeadline: workDeadline,
            reviewDeadline: 0,
            reviewPeriod: reviewPeriodSeconds,
            workHash: workHash,
            workURI: workURI,
            status: Status.Funded,
            proofURI: "",
            disputeURI: ""
        });

        usdc.safeTransferFrom(buyer, address(this), amount);

        emit IntentCreated(intentId, buyer, seller, amount, workHash, workURI, workDeadline, reviewPeriodSeconds, defaultFeeBps);
    }

    function _validateIntentInputs(
        address buyer,
        address seller,
        uint256 amount,
        uint256 workTimeoutSeconds,
        uint256 reviewPeriodSeconds,
        bytes32 workHash,
        string calldata workURI
    ) internal pure {
        if (seller == address(0) || buyer == address(0)) revert ZeroAddress();
        if (seller == buyer) revert SelfEscrow();
        if (amount == 0) revert InvalidAmount();
        if (workHash == bytes32(0)) revert InvalidWorkHash();
        _validateBasicURI(workURI);
        if (workTimeoutSeconds < MIN_WORK_TIMEOUT || workTimeoutSeconds > MAX_WORK_TIMEOUT) revert InvalidTimeout();
        if (reviewPeriodSeconds < MIN_REVIEW_PERIOD || reviewPeriodSeconds > MAX_REVIEW_PERIOD) {
            revert InvalidReviewPeriod();
        }
    }

    function _validateBasicURI(string calldata uri) internal pure {
        bytes memory b = bytes(uri);
        uint256 len = b.length;
        if (len == 0) revert InvalidURI();
        if (len > MAX_URI_BYTES) revert UriTooLong();
    }

    function _validateIPFSURI(string calldata uri) internal pure {
        bytes memory b = bytes(uri);
        uint256 len = b.length;
        if (len < 7) revert InvalidURI(); // Must be at least "ipfs://"
        if (len > MAX_URI_BYTES) revert UriTooLong();
        if (
            b[0] != 'i' || b[1] != 'p' || b[2] != 'f' || b[3] != 's' || 
            b[4] != ':' || b[5] != '/' || b[6] != '/'
        ) {
            revert InvalidURI();
        }
    }

    function _feeSplit(uint256 amount, uint96 feeBps) internal pure returns (uint256 feeAmount, uint256 sellerAmount) {
        feeAmount = (amount * feeBps) / BPS_DENOMINATOR;
        sellerAmount = amount - feeAmount;
    }
}
