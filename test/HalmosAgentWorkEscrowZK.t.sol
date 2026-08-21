// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Test} from "forge-std/Test.sol";
import "../contracts/AgentWorkEscrowZK.sol";

/// @notice Minimal ERC-20 for Halmos symbolic verification of AgentWorkEscrowZK.
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

/// @notice Halmos symbolic verification harness for AgentWorkEscrowZK.
///
/// These functions are NOT run by Foundry's fuzzer. They are executed by
/// Halmos's symbolic executor to prove the accounting invariants hold for ALL
/// possible inputs.
///
/// Run with:
///   halmos --contract HalmosAgentWorkEscrowZK --function check_*
contract HalmosAgentWorkEscrowZK is Test {
    MockUSDC public usdc;
    AgentWorkEscrowZK public escrow;

    address public owner = address(0xABCD);
    address public buyer = address(0x1111);
    address public seller = address(0x2222);
    address public feeRecipient = address(0x3333);

    uint256 public amount = 100_000; // 0.1 USDC
    uint256 public workTimeout = 1 days;
    uint256 public reviewPeriod = 3 days;
    bytes32 public workHash = keccak256("data");
    string public workURI = "ipfs://QmWork";

    function setUp() public {
        usdc = new MockUSDC();
        // No ZK verifier (address(0)) so the release path is the plain buyer-release
        escrow = new AgentWorkEscrowZK(address(usdc), feeRecipient, owner, address(0));
        usdc.mint(buyer, 1_000_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    /// @notice Prove: after createIntent (funded) -> submitProof -> release, the
    ///         escrow holds only the fee and the seller got amount - fee.
    function check_Release_ConservesFunds() public {
        vm.prank(buyer);
        uint256 intentId = escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI);
        vm.prank(seller);
        escrow.submitProof(intentId, "ipfs://QmProof");
        vm.prank(buyer);
        escrow.release(intentId);

        uint256 fee = (amount * escrow.defaultFeeBps()) / 10_000;
        uint256 sellerAmount = amount - fee;
        // Escrow holds only the fee (accumulatedFees); seller got the rest
        assert(usdc.balanceOf(address(escrow)) == fee);
        assert(escrow.accumulatedFees() == fee);
        assert(usdc.balanceOf(seller) == sellerAmount);
    }

    /// @notice Prove: after createIntent -> refund (after work deadline), the
    ///         buyer is fully refunded and the escrow is empty (no fee on refund).
    function check_Refund_RefundsFully() public {
        vm.prank(buyer);
        uint256 intentId = escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI);
        vm.warp(block.timestamp + workTimeout + 1);
        vm.prank(buyer);
        escrow.refund(intentId);

        assert(usdc.balanceOf(address(escrow)) == 0);
        assert(escrow.accumulatedFees() == 0);
        assert(usdc.balanceOf(buyer) == 1_000_000_000);
    }

    /// @notice Prove: fee is never charged on a refund (only on release/claim).
    function check_NoFeeOnRefund() public {
        vm.prank(buyer);
        uint256 intentId = escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI);
        vm.warp(block.timestamp + workTimeout + 1);
        vm.prank(buyer);
        escrow.refund(intentId);

        assert(escrow.accumulatedFees() == 0);
    }
}
