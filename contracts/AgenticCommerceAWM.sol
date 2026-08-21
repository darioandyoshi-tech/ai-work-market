// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/// @notice IACPHook interface (ERC-8183 normative).
interface IACPHook {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}

/// @notice Groth16 ZK-SNARK verifier interface (matches AgentWorkProofVerifier).
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[2] calldata pubSignals
    ) external view returns (bool);
}

/// @title AgenticCommerceAWM
/// @notice ERC-8183 "Agentic Commerce" compliant job escrow with evaluator
///         attestation, reusing AWM's production primitives.
///
/// @dev Implements the ERC-8183 state machine (Open -> Funded -> Submitted ->
///      Terminal) with a single evaluator per job, optional IACPHook, optional
///      platform fee on completion, and ERC-2771-style gasless meta-transactions
///      via a single trusted forwarder (implemented manually to avoid the
///      Context diamond-inheritance conflict with Ownable2Step).
///
///      AWM differentiator: the evaluator MAY be a ZK-SNARK verifier contract
///      (AI-verifier-as-evaluator) for provable work, with the 2-of-3 Safe as
///      the human fallback for disputes. This is the "hybrid evaluator" model
///      from docs/erc-8183-alignment-spec.md.
///
///      This is a NEW contract deployed alongside the existing AgentWorkEscrowZK
///      (dual-track). It does not migrate live intents.
contract AgenticCommerceAWM is Context, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ //
    // ERC-8183 state machine
    // ------------------------------------------------------------------ //
    enum Status {
        Open,       // 0
        Funded,     // 1
        Submitted,  // 2
        Completed,  // 3 (terminal)
        Rejected,   // 4 (terminal)
        Expired     // 5 (terminal)
    }

    struct Job {
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        Status status;
        address hook;          // IACPHook, address(0) = none
        bytes32 deliverable;   // set on submit
        bytes32 completionReason; // set on complete/reject
    }

    // ------------------------------------------------------------------ //
    // State
    // ------------------------------------------------------------------ //
    IERC20 public immutable paymentToken;
    address public treasury;          // platform fee recipient
    IGroth16Verifier public zkVerifier; // optional AI evaluator backend
    address public trustedForwarder;   // ERC-2771 forwarder (address(0) = disabled)

    uint96 public defaultFeeBps = 100; // 1% platform fee on completion
    uint96 public constant MAX_FEE_BPS = 1_000; // 10% cap
    uint96 public constant BPS_DENOMINATOR = 10_000;

    uint256 public constant MAX_DESCRIPTION_BYTES = 512;
    uint256 public constant MIN_EXPIRY = 1 hours;
    uint256 public constant MAX_EXPIRY = 365 days;

    uint256 public nextJobId = 1;
    uint256 public accumulatedFees;

    mapping(uint256 => Job) public jobs;

    // Function selectors for hook routing (ERC-8183 data encoding)
    bytes4 public constant SET_PROVIDER_SELECTOR = bytes4(keccak256("setProvider(uint256,address,bytes)"));
    bytes4 public constant SET_BUDGET_SELECTOR = bytes4(keccak256("setBudget(uint256,uint256,bytes)"));
    bytes4 public constant FUND_SELECTOR = bytes4(keccak256("fund(uint256,uint256,bytes)"));
    bytes4 public constant SUBMIT_SELECTOR = bytes4(keccak256("submit(uint256,bytes32,bytes)"));
    bytes4 public constant COMPLETE_SELECTOR = bytes4(keccak256("complete(uint256,bytes32,bytes)"));
    bytes4 public constant REJECT_SELECTOR = bytes4(keccak256("reject(uint256,bytes32,bytes)"));

    // ------------------------------------------------------------------ //
    // Events (ERC-8183 + AWM extensions)
    // ------------------------------------------------------------------ //
    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, string description, address hook);
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, uint256 providerAmount, uint256 feeAmount, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId, uint256 refundAmount);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event TreasuryUpdated(address indexed treasury);
    event DefaultFeeBpsUpdated(uint96 feeBps);
    event ZKVerifierSet(address indexed verifier);

    // ------------------------------------------------------------------ //
    // Errors
    // ------------------------------------------------------------------ //
    error InvalidEvaluator();
    error InvalidExpiry();
    error InvalidProvider();
    error NotClient();
    error NotProvider();
    error NotEvaluator();
    error NotOpen();
    error NotFunded();
    error NotSubmitted();
    error NotFundedOrSubmitted();
    error BudgetMismatch();
    error ZeroBudget();
    error NotExpired();
    error DescriptionTooLong();
    error FeeTooHigh();
    error ZKVerificationFailed();

    // ------------------------------------------------------------------ //
    // Constructor
    // ------------------------------------------------------------------ //
    /// @param paymentToken_ ERC-20 used for escrow (canonical Base USDC in prod)
    /// @param treasury_     platform fee recipient (Safe/treasury, not hot EOA)
    /// @param initialOwner_ contract owner (Timelock/Safe in prod)
    /// @param trustedForwarder_ ERC-2771 forwarder (address(0) to disable gasless)
    /// @param zkVerifier_   optional Groth16 verifier used as AI evaluator backend
    constructor(
        address paymentToken_,
        address treasury_,
        address initialOwner_,
        address trustedForwarder_,
        address zkVerifier_
    ) Ownable(initialOwner_) {
        if (paymentToken_ == address(0)) revert InvalidEvaluator();
        if (treasury_ == address(0)) revert InvalidEvaluator();
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
        trustedForwarder = trustedForwarder_;
        if (zkVerifier_ != address(0)) zkVerifier = IGroth16Verifier(zkVerifier_);
    }

    // ------------------------------------------------------------------ //
    // Admin
    // ------------------------------------------------------------------ //
    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidEvaluator();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setDefaultFeeBps(uint96 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        defaultFeeBps = feeBps_;
        emit DefaultFeeBpsUpdated(feeBps_);
    }

    function setZKVerifier(address verifier_) external onlyOwner {
        zkVerifier = IGroth16Verifier(verifier_);
        emit ZKVerifierSet(verifier_);
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        paymentToken.safeTransfer(treasury, amount);
        emit FeesWithdrawn(treasury, amount);
    }

    /// @notice Rescue unrelated ERC-20s accidentally sent to the contract.
    ///         Cannot rescue the payment token (that is escrow).
    function rescueTokens(address token_, uint256 amount) external onlyOwner nonReentrant {
        if (token_ == address(paymentToken)) revert InvalidEvaluator();
        IERC20(token_).safeTransfer(msg.sender, amount);
    }

    // ------------------------------------------------------------------ //
    // ERC-8183 core functions
    // ------------------------------------------------------------------ //
    /// @notice Create a job in Open state. Provider MAY be address(0) (set later).
    function createJob(
        address provider_,
        address evaluator_,
        uint256 expiredAt_,
        string calldata description_,
        address hook_
    ) external returns (uint256 jobId) {
        if (evaluator_ == address(0)) revert InvalidEvaluator();
        if (expiredAt_ <= block.timestamp) revert InvalidExpiry();
        if (expiredAt_ > block.timestamp + MAX_EXPIRY) revert InvalidExpiry();
        if (bytes(description_).length > MAX_DESCRIPTION_BYTES) revert DescriptionTooLong();

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client: _msgSender(),
            provider: provider_,
            evaluator: evaluator_,
            description: description_,
            budget: 0,
            expiredAt: expiredAt_,
            status: Status.Open,
            hook: hook_,
            deliverable: bytes32(0),
            completionReason: bytes32(0)
        });
        emit JobCreated(jobId, _msgSender(), provider_, evaluator_, expiredAt_, description_, hook_);
    }

    /// @notice Client sets the provider for a job created with provider=0.
    function setProvider(uint256 jobId, address provider_, bytes calldata optParams) external {
        Job storage job = jobs[jobId];
        if (job.status != Status.Open) revert NotOpen();
        if (_msgSender() != job.client) revert NotClient();
        if (provider_ == address(0)) revert InvalidProvider();
        if (job.provider != address(0)) revert InvalidProvider();

        _before(jobId, SET_PROVIDER_SELECTOR, abi.encode(provider_, optParams));
        job.provider = provider_;
        _after(jobId, SET_PROVIDER_SELECTOR, abi.encode(provider_, optParams));
        emit ProviderSet(jobId, provider_);
    }

    /// @notice Client or provider sets/negotiates the budget while Open.
    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        Job storage job = jobs[jobId];
        if (job.status != Status.Open) revert NotOpen();
        address caller = _msgSender();
        if (caller != job.client && caller != job.provider) revert NotClient();

        _before(jobId, SET_BUDGET_SELECTOR, abi.encode(amount, optParams));
        job.budget = amount;
        _after(jobId, SET_BUDGET_SELECTOR, abi.encode(amount, optParams));
        emit BudgetSet(jobId, amount);
    }

    /// @notice Client funds the escrow. expectedBudget guards against front-running.
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != Status.Open) revert NotOpen();
        if (_msgSender() != job.client) revert NotClient();
        if (job.budget == 0) revert ZeroBudget();
        if (job.budget != expectedBudget) revert BudgetMismatch();
        if (job.provider == address(0)) revert InvalidProvider();

        _before(jobId, FUND_SELECTOR, optParams);
        paymentToken.safeTransferFrom(job.client, address(this), job.budget);
        job.status = Status.Funded;
        _after(jobId, FUND_SELECTOR, optParams);
        emit JobFunded(jobId, job.budget);
    }

    /// @notice Provider submits work, moving Funded -> Submitted.
    function submit(uint256 jobId, bytes32 deliverable_, bytes calldata optParams) external {
        Job storage job = jobs[jobId];
        if (job.status != Status.Funded) revert NotFunded();
        if (_msgSender() != job.provider) revert NotProvider();

        _before(jobId, SUBMIT_SELECTOR, abi.encode(deliverable_, optParams));
        job.deliverable = deliverable_;
        job.status = Status.Submitted;
        _after(jobId, SUBMIT_SELECTOR, abi.encode(deliverable_, optParams));
        emit JobSubmitted(jobId, deliverable_);
    }

    /// @notice Evaluator attests completion. If a ZK verifier is set and the
    ///         evaluator is the verifier contract, the proof is checked first.
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != Status.Submitted) revert NotSubmitted();
        if (_msgSender() != job.evaluator) revert NotEvaluator();

        // AI-verifier-as-evaluator: if the evaluator is the ZK verifier contract,
        // the caller must be that contract (or the trusted forwarder relaying for
        // it). The proof is passed via optParams and verified before completion.
        if (address(zkVerifier) != address(0) && job.evaluator == address(zkVerifier)) {
            _verifyZKProof(optParams);
        }

        _before(jobId, COMPLETE_SELECTOR, abi.encode(reason, optParams));

        uint256 fee = (job.budget * defaultFeeBps) / BPS_DENOMINATOR;
        uint256 providerAmount = job.budget - fee;
        if (fee > 0) accumulatedFees += fee;

        job.status = Status.Completed;
        job.completionReason = reason;

        _after(jobId, COMPLETE_SELECTOR, abi.encode(reason, optParams));

        if (providerAmount > 0) paymentToken.safeTransfer(job.provider, providerAmount);
        emit JobCompleted(jobId, providerAmount, fee, reason);
    }

    /// @notice Client rejects while Open; evaluator rejects while Funded/Submitted.
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = jobs[jobId];
        Status status = job.status;
        address caller = _msgSender();

        if (status == Status.Open) {
            if (caller != job.client) revert NotClient();
        } else if (status == Status.Funded || status == Status.Submitted) {
            if (caller != job.evaluator) revert NotEvaluator();
        } else {
            revert NotOpen();
        }

        _before(jobId, REJECT_SELECTOR, abi.encode(reason, optParams));

        uint256 refund = job.budget;
        job.status = Status.Rejected;
        job.completionReason = reason;

        _after(jobId, REJECT_SELECTOR, abi.encode(reason, optParams));

        if (refund > 0) paymentToken.safeTransfer(job.client, refund);
        emit JobRejected(jobId, caller, reason);
    }

    /// @notice Permissionless refund after expiry. NOT hookable (per ERC-8183).
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.status != Status.Funded && job.status != Status.Submitted) revert NotFundedOrSubmitted();
        if (block.timestamp < job.expiredAt) revert NotExpired();

        uint256 refund = job.budget;
        job.status = Status.Expired;
        if (refund > 0) paymentToken.safeTransfer(job.client, refund);
        emit JobExpired(jobId, refund);
    }

    // ------------------------------------------------------------------ //
    // Hooks
    // ------------------------------------------------------------------ //
    function _before(uint256 jobId, bytes4 selector, bytes memory data) private {
        address hook = jobs[jobId].hook;
        if (hook != address(0)) IACPHook(hook).beforeAction(jobId, selector, data);
    }

    function _after(uint256 jobId, bytes4 selector, bytes memory data) private {
        address hook = jobs[jobId].hook;
        if (hook != address(0)) IACPHook(hook).afterAction(jobId, selector, data);
    }

    // ------------------------------------------------------------------ //
    // ZK verification (AI evaluator backend)
    // ------------------------------------------------------------------ //
    /// @dev optParams must be abi.encode(pA, pB, pC, pubSignals) matching the
    ///      Groth16 verifier signature. pubSignals[0] must be 1 (valid).
    function _verifyZKProof(bytes memory optParams) private view {
        (
            uint256[2] memory pA,
            uint256[2][2] memory pB,
            uint256[2] memory pC,
            uint256[2] memory pubSignals
        ) = abi.decode(optParams, (uint256[2], uint256[2][2], uint256[2], uint256[2]));

        if (pubSignals[0] != 1) revert ZKVerificationFailed();
        if (!zkVerifier.verifyProof(pA, pB, pC, pubSignals)) revert ZKVerificationFailed();
    }

    // ------------------------------------------------------------------ //
    // ERC-2771 (manual, single trusted forwarder)
    // ------------------------------------------------------------------ //
    /// @dev If msg.sender is the trusted forwarder, the real sender is the
    ///      last 20 bytes of msg.data (ERC-2771 convention).
    function _msgSender() internal view override(Context) returns (address) {
        if (msg.sender == trustedForwarder && msg.data.length >= 20) {
            address sender;
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
            return sender;
        }
        return msg.sender;
    }

    function setTrustedForwarder(address forwarder_) external onlyOwner {
        trustedForwarder = forwarder_;
    }

    // ------------------------------------------------------------------ //
    // Views
    // ------------------------------------------------------------------ //
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function isTrustedForwarder(address forwarder) external view returns (bool) {
        return forwarder == trustedForwarder;
    }
}
