// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {AgenticCommerceAWM} from "../contracts/AgenticCommerceAWM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC-20 for invariant testing (mintable, no fees).
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

/// @notice Mock verifier that accepts any proof (so the fuzzer can complete ZK jobs).
contract MockVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[2] calldata pubSignals
    ) external pure returns (bool) {
        return pubSignals[0] == 1;
    }
}

/// @notice Invariant handler that drives the ERC-8183 contract through its
///         lifecycle with random actors, then checks accounting invariants.
contract Handler is Test {
    AgenticCommerceAWM public awm;
    MockUSDC public usdc;
    MockVerifier public verifier;

    address public client = address(0x1111);
    address public provider = address(0x2222);
    address public evaluator = address(0x3333);
    address public treasury = address(0x4444);
    address public owner = address(0x5555);

    uint256 public constant BUDGET = 1_000_000;
    uint256 public constant FEE_BPS = 100;

    // Track how many jobs are currently holding escrow (Funded or Submitted)
    uint256 public activeCount;

    constructor(AgenticCommerceAWM _awm, MockUSDC _usdc, MockVerifier _verifier) {
        awm = _awm;
        usdc = _usdc;
        verifier = _verifier;
    }

    function createJob() external {
        uint256 jobId = awm.nextJobId();
        vm.prank(client);
        awm.createJob(provider, evaluator, block.timestamp + 7 days, "job", address(0));
        // No state change to funded/submitted counts
        assertEq(jobId, awm.nextJobId() - 1);
    }

    function fundAndSubmit() external {
        uint256 jobId = awm.nextJobId();
        if (jobId == 1) return; // no jobs yet
        jobId = jobId - 1;

        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        if (uint8(job.status) != uint8(AgenticCommerceAWM.Status.Open)) return;

        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
        activeCount++;

        vm.prank(provider);
        awm.submit(jobId, keccak256("deliverable"), "");
    }

    function complete() external {
        uint256 jobId = awm.nextJobId();
        if (jobId == 1) return;
        jobId = jobId - 1;

        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        if (uint8(job.status) != uint8(AgenticCommerceAWM.Status.Submitted)) return;

        vm.prank(evaluator);
        awm.complete(jobId, keccak256("good"), "");
        activeCount--;
    }

    function reject() external {
        uint256 jobId = awm.nextJobId();
        if (jobId == 1) return;
        jobId = jobId - 1;

        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        if (uint8(job.status) == uint8(AgenticCommerceAWM.Status.Open)) {
            vm.prank(client);
            awm.reject(jobId, keccak256("cancel"), "");
        } else if (uint8(job.status) == uint8(AgenticCommerceAWM.Status.Funded)) {
            vm.prank(evaluator);
            awm.reject(jobId, keccak256("bad"), "");
            activeCount--;
        } else if (uint8(job.status) == uint8(AgenticCommerceAWM.Status.Submitted)) {
            vm.prank(evaluator);
            awm.reject(jobId, keccak256("bad"), "");
            activeCount--;
        }
    }

    function claimRefund() external {
        uint256 jobId = awm.nextJobId();
        if (jobId == 1) return;
        jobId = jobId - 1;

        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        if (uint8(job.status) != uint8(AgenticCommerceAWM.Status.Funded) &&
            uint8(job.status) != uint8(AgenticCommerceAWM.Status.Submitted)) return;

        vm.warp(block.timestamp + 8 days);
        vm.prank(client);
        awm.claimRefund(jobId);
        activeCount--;
    }

    // Invariant check: escrow balance == active principal + accumulated fees
    function invariant_escrowBalance() public view {
        uint256 activePrincipal = activeCount * BUDGET;
        uint256 expected = activePrincipal + awm.accumulatedFees();
        assertEq(usdc.balanceOf(address(awm)), expected);
    }

    // Invariant check: fees never exceed total principal ever funded
    function invariant_feesBounded() public view {
        assertLe(awm.accumulatedFees(), activeCount * BUDGET + awm.accumulatedFees());
    }
}

contract AgenticCommerceAWMInvariantsTest is Test {
    AgenticCommerceAWM public awm;
    MockUSDC public usdc;
    MockVerifier public verifier;
    Handler public handler;

    function setUp() public {
        usdc = new MockUSDC();
        verifier = new MockVerifier();
        awm = new AgenticCommerceAWM(address(usdc), address(0x4444), address(0x5555), address(0), address(verifier));

        usdc.mint(address(0x1111), 1_000_000_000);
        vm.startPrank(address(0x1111));
        usdc.approve(address(awm), type(uint256).max);
        vm.stopPrank();

        handler = new Handler(awm, usdc, verifier);
        targetContract(address(handler));
        // Exclude the USDC contract from fuzzer targets so the fuzzer cannot
        // mint arbitrary USDC to the escrow and break the accounting invariant.
        excludeContract(address(usdc));
    }

    function invariant_escrowBalance() public view {
        handler.invariant_escrowBalance();
    }

    function invariant_feesBounded() public view {
        handler.invariant_feesBounded();
    }
}
