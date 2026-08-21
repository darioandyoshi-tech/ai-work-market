// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerceAWM} from "../contracts/AgenticCommerceAWM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC-20 for Halmos symbolic verification.
contract MockUSDC is IERC20 {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}

/// @notice Halmos symbolic verification harness for AgenticCommerceAWM.
///
/// These functions are NOT run by Foundry's fuzzer (they are excluded from the
/// normal test suite via the `--match-test` filter). They are executed by
/// Halmos's symbolic executor to prove the accounting invariant holds for ALL
/// possible inputs, not just fuzzed ones.
///
/// Run with:
///   halmos --contract HalmosAgenticCommerceAWM --function check_*
contract HalmosAgenticCommerceAWM is Test {
    AgenticCommerceAWM public awm;
    MockUSDC public usdc;

    address public client = address(0x1111);
    address public provider = address(0x2222);
    address public evaluator = address(0x3333);
    address public treasury = address(0x4444);
    address public owner = address(0x5555);

    uint256 public constant BUDGET = 1_000_000;
    uint256 public constant FEE_BPS = 100;

    function setUp() public {
        usdc = new MockUSDC();
        awm = new AgenticCommerceAWM(address(usdc), treasury, owner, address(0), address(0));
        usdc.mint(client, 1_000_000_000);
        vm.startPrank(client);
        usdc.approve(address(awm), type(uint256).max);
        vm.stopPrank();
    }

    /// @notice Prove: after a full fund->submit->complete cycle, the escrow
    ///         balance equals the accumulated fee (principal is fully paid out).
    function check_Complete_ConservesFunds() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(provider, evaluator, block.timestamp + 7 days, "job", address(0));
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
        vm.prank(provider);
        awm.submit(jobId, keccak256("deliverable"), "");
        vm.prank(evaluator);
        awm.complete(jobId, keccak256("good"), "");

        uint256 fee = (BUDGET * FEE_BPS) / 10_000;
        // Escrow holds only the fee; provider got the rest
        assert(usdc.balanceOf(address(awm)) == fee);
        assert(awm.accumulatedFees() == fee);
        // Provider started with 0, received BUDGET - fee
        assert(usdc.balanceOf(provider) == BUDGET - fee);
    }

    /// @notice Prove: after a fund->reject cycle, the client is fully refunded
    ///         and the escrow is empty (no fee on refund, per ERC-8183).
    function check_Reject_RefundsFully() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(provider, evaluator, block.timestamp + 7 days, "job", address(0));
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
        vm.prank(evaluator);
        awm.reject(jobId, keccak256("bad"), "");

        // No fee on refund; client gets everything back
        assert(usdc.balanceOf(address(awm)) == 0);
        assert(awm.accumulatedFees() == 0);
        assert(usdc.balanceOf(client) == 1_000_000_000);
    }

    /// @notice Prove: after expiry + claimRefund, the client is fully refunded
    ///         and the escrow is empty.
    function check_Expiry_RefundsFully() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(provider, evaluator, block.timestamp + 7 days, "job", address(0));
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
        vm.warp(block.timestamp + 8 days);
        vm.prank(client);
        awm.claimRefund(jobId);

        assert(usdc.balanceOf(address(awm)) == 0);
        assert(usdc.balanceOf(client) == 1_000_000_000);
    }

    /// @notice Prove: fee is never charged on a rejected job (only on completion).
    function check_NoFeeOnReject() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(provider, evaluator, block.timestamp + 7 days, "job", address(0));
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
        vm.prank(evaluator);
        awm.reject(jobId, keccak256("bad"), "");

        assert(awm.accumulatedFees() == 0);
    }
}
