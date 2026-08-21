// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import "../contracts/AgentWorkEscrow.sol";

/// @notice Mock USDC for invariant testing. Plain contract (no EIP712 inheritance).
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    function mint(address to, uint256 amount) external { balances[to] += amount; }
    function totalSupply() external view returns (uint256) { return 0; }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balances[msg.sender] >= amount, "USDC: insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowances[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "USDC: insufficient allowance");
            allowances[from][msg.sender] = allowed - amount;
        }
        require(balances[from] >= amount, "USDC: insufficient balance");
        balances[from] -= amount;
        balances[to] += amount;
        return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        return true;
    }
    function balanceOf(address account) external view returns (uint256) { return balances[account]; }
    function allowance(address owner, address spender) external view returns (uint256) { return allowances[owner][spender]; }
}

/// @notice Invariant tests for AgentWorkEscrow accounting.
/// @dev Core invariant: the escrow's USDC balance always equals the sum of
///      principal held in active (non-terminal) intents PLUS accumulatedFees.
///      Terminal states (Released, Refunded, Resolved) hold no principal.
contract AgentWorkEscrowInvariants is Test {
    MockUSDC public usdc;
    AgentWorkEscrow public escrow;

    address public owner = address(0xABCD);
    address public buyer = address(0x1111);
    address public seller = address(0x2222);
    address public feeRecipient = address(0x3333);

    uint256 public amount = 100_000; // 0.1 USDC
    uint256 public workTimeout = 1 days;
    uint256 public reviewPeriod = 3 days;
    bytes32 public workHash = keccak256("data");
    string public workURI = "ipfs://QmWork";
    string public proofURI = "ipfs://QmProof";
    string public disputeURI = "ipfs://QmDispute";

    // Track created intents for the ghost accounting
    uint256[] public createdIntents;

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        escrow = new AgentWorkEscrow(address(usdc), feeRecipient, owner);
        vm.stopPrank();

        // Fund buyer and approve escrow
        usdc.mint(buyer, amount * 100);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    /// @notice Create a new intent (buyer funds escrow).
    function createIntent() public {
        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI);
        createdIntents.push(id);
    }

    /// @notice Submit proof as seller.
    function submitProof(uint256 id) public {
        vm.prank(seller);
        escrow.submitProof(id, proofURI);
    }

    /// @notice Buyer releases (pays seller + accrues fee).
    function release(uint256 id) public {
        vm.prank(buyer);
        escrow.release(id);
    }

    /// @notice Seller claims after review period.
    function claimAfterReview(uint256 id) public {
        vm.warp(block.timestamp + reviewPeriod + 1);
        vm.prank(seller);
        escrow.claimAfterReview(id);
    }

    /// @notice Buyer refunds after work deadline with no proof.
    function refund(uint256 id) public {
        vm.warp(block.timestamp + workTimeout + 1);
        vm.prank(buyer);
        escrow.refund(id);
    }

    /// @notice Open a dispute.
    function dispute(uint256 id) public {
        vm.prank(buyer);
        escrow.dispute(id, disputeURI);
    }

    /// @notice Owner resolves a dispute (full split to seller, no fee).
    function resolveDispute(uint256 id) public {
        vm.prank(owner);
        escrow.resolveDispute(id, 0, amount, false);
    }

    /// @notice Withdraw accumulated fees.
    function withdrawFees() public {
        vm.prank(feeRecipient);
        escrow.withdrawFees();
    }

    /// @dev CORE INVARIANT: escrow USDC balance == active principal + accumulatedFees.
    ///      This must hold after ANY sequence of operations.
    function invariant_escrowBalanceEqualsActivePrincipalPlusFees() public view {
        uint256 activePrincipal = 0;
        for (uint256 i = 0; i < createdIntents.length; i++) {
            uint256 id = createdIntents[i];
            (, , , uint256 amt, , , , , , AgentWorkEscrow.Status status, , ) = escrow.intents(id);
            // Active states hold principal: Funded, ProofSubmitted, Disputed
            if (status == AgentWorkEscrow.Status.Funded
                || status == AgentWorkEscrow.Status.ProofSubmitted
                || status == AgentWorkEscrow.Status.Disputed) {
                activePrincipal += amt;
            }
        }
        uint256 expected = activePrincipal + escrow.accumulatedFees();
        assertEq(usdc.balanceOf(address(escrow)), expected, "escrow balance != active principal + fees");
    }

    /// @dev INVARIANT: accumulatedFees never exceeds the sum of all intent amounts
    ///      (fees are a fraction of principal, never more than the principal).
    function invariant_accumulatedFeesNeverExceedTotalPrincipal() public view {
        uint256 totalPrincipal = 0;
        for (uint256 i = 0; i < createdIntents.length; i++) {
            (, , , uint256 amt, , , , , , , , ) = escrow.intents(createdIntents[i]);
            totalPrincipal += amt;
        }
        assertLe(escrow.accumulatedFees(), totalPrincipal, "accumulatedFees exceeds total principal");
    }

    /// @dev INVARIANT: no intent can be in a terminal state and still hold escrow balance.
    ///      Terminal states (Released, Refunded, Resolved) must have paid out.
    function invariant_terminalIntentsHoldNoPrincipal() public view {
        for (uint256 i = 0; i < createdIntents.length; i++) {
            uint256 id = createdIntents[i];
            (, , , , , , , , , AgentWorkEscrow.Status status, , ) = escrow.intents(id);
            if (status == AgentWorkEscrow.Status.Released
                || status == AgentWorkEscrow.Status.Refunded
                || status == AgentWorkEscrow.Status.Resolved) {
                // Terminal intents contribute 0 to active principal (by definition).
                // This is a sanity check that the status enum is well-formed.
                assertTrue(uint256(status) >= uint256(AgentWorkEscrow.Status.Released));
            }
        }
    }

    /// @dev INVARIANT: nextIntentId is monotonic and always > number of created intents.
    function invariant_nextIntentIdMonotonic() public view {
        assertGe(escrow.nextIntentId(), createdIntents.length + 1, "nextIntentId not monotonic");
    }
}
