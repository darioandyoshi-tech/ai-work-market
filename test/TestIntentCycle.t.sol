// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console2} from "forge-std/Test.sol";
import {AgentWorkEscrow} from "../contracts/AgentWorkEscrow.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    function decimals() public view override returns (uint8) {
        return 6;
    }

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

contract TestIntentCycle is Test {
    MockUSDC public usdc;
    AgentWorkEscrow public escrow;
    address public buyer;
    address public seller;
    address public feeRecipient;
    uint256 constant AMOUNT = 1_000_000; // 1 USDC (6 decimals)
    uint256 constant WORK_TIMEOUT = 6 hours; // MIN_WORK_TIMEOUT is 6 hours
    uint256 constant REVIEW_PERIOD = 6 hours; // MIN_REVIEW_PERIOD is 6 hours
    bytes32 public workHash;
    string public workURI;

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();

        // Deploy AgentWorkEscrow with feeRecipient as this test contract (so we can withdraw fees)
        feeRecipient = address(this);
        escrow = new AgentWorkEscrow(address(usdc), feeRecipient, address(this));

        // Create two distinct addresses for buyer and seller
        buyer = vm.addr(1);
        seller = vm.addr(2);

        workHash = keccak256(bytes("test-work"));
        workURI = "ipfs://bafybeigdyrzt5wfp7ud7g67v2v5ftjbgxlhmn6ljhuw55y7yza2qsae6ti";

        // Fund buyer with USDC for testing
        usdc.mint(buyer, 10 * AMOUNT); // 10 USDC

        // Approve escrow to spend buyer's USDC
        vm.startPrank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    function testCreateIntentAndRefund() public {
        // Record next intent ID before creation
        uint256 intentIdBefore = escrow.nextIntentId();

        // Create intent as buyer
        vm.startPrank(buyer);
        uint256 intentId = escrow.createIntent(
            seller,
            AMOUNT,
            WORK_TIMEOUT,
            REVIEW_PERIOD,
            workHash,
            workURI
        );
        vm.stopPrank();

        // Intent ID should be the next one
        assertEq(intentId, intentIdBefore);

        // Fetch the intent struct via public getter
        (
            address intentBuyer,
            address intentSeller,
            uint96 intentFeeBps,
            uint256 intentAmount,
            uint256 intentCreatedAt,
            uint256 intentWorkDeadline,
            uint256 intentReviewDeadline,
            uint256 intentReviewPeriod,
            bytes32 intentWorkHash,
            AgentWorkEscrow.Status intentStatus,   // Status is stored as Status enum in the getter
            bytes32 intentProofHash,
            bytes32 intentDisputeHash
        ) = escrow.intents(intentId);

        // Validate intent fields
        assertEq(intentBuyer, buyer);
        assertEq(intentSeller, seller);
        assertEq(intentAmount, AMOUNT);
        assertEq(intentFeeBps, 100); // defaultFeeBps
        assertEq(intentWorkHash, workHash);

        // Check status is Funded
        assertEq(uint8(intentStatus), uint8(AgentWorkEscrow.Status.Funded));

        // Advance time past work deadline + review period to allow refund
        vm.warp(block.timestamp + WORK_TIMEOUT + REVIEW_PERIOD + 1 seconds);

        // Refund as buyer
        uint256 buyerBalanceBefore = usdc.balanceOf(buyer);
        vm.startPrank(buyer);
        escrow.refund(intentId);
        vm.stopPrank();
        uint256 buyerBalanceAfter = usdc.balanceOf(buyer);

        // Fetch intent after refund
        (
            intentBuyer,
            intentSeller,
            intentFeeBps,
            intentAmount,
            intentCreatedAt,
            intentWorkDeadline,
            intentReviewDeadline,
            intentReviewPeriod,
            intentWorkHash,
            intentStatus,
            intentProofHash,
            intentDisputeHash
        ) = escrow.intents(intentId);

        // Verify intent is Refunded
        assertEq(uint8(intentStatus), uint8(AgentWorkEscrow.Status.Refunded));

        // Verify buyer got their USDC back
        assertEq(buyerBalanceAfter, buyerBalanceBefore + AMOUNT);

        // Verify no fees accumulated (refund means no fee)
        assertEq(escrow.accumulatedFees(), 0);
    }
}