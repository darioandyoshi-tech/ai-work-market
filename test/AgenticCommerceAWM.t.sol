// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerceAWM} from "../contracts/AgenticCommerceAWM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC-20 for testing (mintable, no fees, no rebasing).
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

/// @notice Mock Groth16 verifier. Returns true when pubSignals[0] == 1.
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

/// @notice Mock IACPHook that records calls and can be configured to revert.
contract MockHook {
    event Before(uint256 jobId, bytes4 selector);
    event After(uint256 jobId, bytes4 selector);
    bool public revertBefore;
    bool public revertAfter;

    function setRevertBefore(bool v) external { revertBefore = v; }
    function setRevertAfter(bool v) external { revertAfter = v; }

    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata) external {
        if (revertBefore) revert("before-revert");
        emit Before(jobId, selector);
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external {
        if (revertAfter) revert("after-revert");
        emit After(jobId, selector);
    }
}

contract AgenticCommerceAWMTest is Test {
    AgenticCommerceAWM public awm;
    MockUSDC public usdc;
    MockVerifier public verifier;
    MockHook public hook;

    address public client = address(0x1111);
    address public provider = address(0x2222);
    address public evaluator = address(0x3333);
    address public treasury = address(0x4444);
    address public owner = address(0x5555);
    address public stranger = address(0x6666);
    address public forwarder = address(0x7777);

    uint256 public constant BUDGET = 1_000_000; // 1 USDC (6 decimals)
    uint256 public constant FEE_BPS = 100;      // 1%

    function setUp() public {
        usdc = new MockUSDC();
        verifier = new MockVerifier();
        hook = new MockHook();
        awm = new AgenticCommerceAWM(address(usdc), treasury, owner, forwarder, address(verifier));

        usdc.mint(client, 10 * BUDGET);
        usdc.mint(provider, 10 * BUDGET);
        vm.startPrank(client);
        usdc.approve(address(awm), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ //
    // Helpers
    // ------------------------------------------------------------------ //
    function _createJob() internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = awm.createJob(provider, evaluator, block.timestamp + 7 days, "build a widget", address(0));
    }

    function _createJobWithHook() internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = awm.createJob(provider, evaluator, block.timestamp + 7 days, "build a widget", address(hook));
    }

    function _fund(uint256 jobId) internal {
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
    }

    function _submit(uint256 jobId) internal {
        vm.prank(provider);
        awm.submit(jobId, keccak256("deliverable"), "");
    }

    // ------------------------------------------------------------------ //
    // createJob
    // ------------------------------------------------------------------ //
    function test_CreateJob() public {
        uint256 jobId = _createJob();
        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.provider, provider);
        assertEq(job.evaluator, evaluator);
        assertEq(job.budget, 0);
        assertEq(uint8(job.status), uint8(AgenticCommerceAWM.Status.Open));
        assertEq(job.expiredAt, block.timestamp + 7 days);
        assertEq(job.hook, address(0));
        assertEq(awm.nextJobId(), 2);
    }

    function test_CreateJob_RevertZeroEvaluator() public {
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.InvalidEvaluator.selector);
        awm.createJob(provider, address(0), block.timestamp + 7 days, "x", address(0));
    }

    function test_CreateJob_RevertPastExpiry() public {
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.InvalidExpiry.selector);
        awm.createJob(provider, evaluator, block.timestamp, "x", address(0));
    }

    function test_CreateJob_RevertTooFarExpiry() public {
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.InvalidExpiry.selector);
        awm.createJob(provider, evaluator, block.timestamp + 366 days, "x", address(0));
    }

    function test_CreateJob_RevertLongDescription() public {
        string memory long = new string(513);
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.DescriptionTooLong.selector);
        awm.createJob(provider, evaluator, block.timestamp + 7 days, long, address(0));
    }

    function test_CreateJob_ZeroProviderAllowed() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(address(0), evaluator, block.timestamp + 7 days, "x", address(0));
        assertEq(awm.getJob(jobId).provider, address(0));
    }

    // ------------------------------------------------------------------ //
    // setProvider
    // ------------------------------------------------------------------ //
    function test_SetProvider() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(address(0), evaluator, block.timestamp + 7 days, "x", address(0));
        vm.prank(client);
        awm.setProvider(jobId, provider, "");
        assertEq(awm.getJob(jobId).provider, provider);
    }

    function test_SetProvider_RevertNotClient() public {
        uint256 jobId = _createJob();
        vm.prank(stranger);
        vm.expectRevert(AgenticCommerceAWM.NotClient.selector);
        awm.setProvider(jobId, provider, "");
    }

    function test_SetProvider_RevertAlreadySet() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.InvalidProvider.selector);
        awm.setProvider(jobId, provider, "");
    }

    function test_SetProvider_RevertZero() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(address(0), evaluator, block.timestamp + 7 days, "x", address(0));
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.InvalidProvider.selector);
        awm.setProvider(jobId, address(0), "");
    }

    // ------------------------------------------------------------------ //
    // setBudget
    // ------------------------------------------------------------------ //
    function test_SetBudget_ByClient() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        assertEq(awm.getJob(jobId).budget, BUDGET);
    }

    function test_SetBudget_ByProvider() public {
        uint256 jobId = _createJob();
        vm.prank(provider);
        awm.setBudget(jobId, BUDGET, "");
        assertEq(awm.getJob(jobId).budget, BUDGET);
    }

    function test_SetBudget_RevertStranger() public {
        uint256 jobId = _createJob();
        vm.prank(stranger);
        vm.expectRevert(AgenticCommerceAWM.NotClient.selector);
        awm.setBudget(jobId, BUDGET, "");
    }

    // ------------------------------------------------------------------ //
    // fund
    // ------------------------------------------------------------------ //
    function test_Fund() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        assertEq(uint8(job.status), uint8(AgenticCommerceAWM.Status.Funded));
        assertEq(usdc.balanceOf(address(awm)), BUDGET);
        assertEq(usdc.balanceOf(client), 10 * BUDGET - BUDGET);
    }

    function test_Fund_RevertBudgetMismatch() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.BudgetMismatch.selector);
        awm.fund(jobId, BUDGET + 1, "");
    }

    function test_Fund_RevertZeroBudget() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.ZeroBudget.selector);
        awm.fund(jobId, 0, "");
    }

    function test_Fund_RevertNoProvider() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(address(0), evaluator, block.timestamp + 7 days, "x", address(0));
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.InvalidProvider.selector);
        awm.fund(jobId, BUDGET, "");
    }

    function test_Fund_RevertNotClient() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.prank(stranger);
        vm.expectRevert(AgenticCommerceAWM.NotClient.selector);
        awm.fund(jobId, BUDGET, "");
    }

    // ------------------------------------------------------------------ //
    // submit
    // ------------------------------------------------------------------ //
    function test_Submit() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        _submit(jobId);
        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        assertEq(uint8(job.status), uint8(AgenticCommerceAWM.Status.Submitted));
        assertEq(job.deliverable, keccak256("deliverable"));
    }

    function test_Submit_RevertNotProvider() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        vm.prank(stranger);
        vm.expectRevert(AgenticCommerceAWM.NotProvider.selector);
        awm.submit(jobId, keccak256("x"), "");
    }

    function test_Submit_RevertNotFunded() public {
        uint256 jobId = _createJob();
        vm.prank(provider);
        vm.expectRevert(AgenticCommerceAWM.NotFunded.selector);
        awm.submit(jobId, keccak256("x"), "");
    }

    // ------------------------------------------------------------------ //
    // complete (evaluator)
    // ------------------------------------------------------------------ //
    function test_Complete() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        _submit(jobId);

        uint256 fee = (BUDGET * FEE_BPS) / 10_000;
        uint256 providerAmount = BUDGET - fee;

        vm.prank(evaluator);
        awm.complete(jobId, keccak256("good"), "");

        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        assertEq(uint8(job.status), uint8(AgenticCommerceAWM.Status.Completed));
        assertEq(usdc.balanceOf(provider), 10 * BUDGET + providerAmount);
        // Fee is held in escrow until withdrawFees()
        assertEq(usdc.balanceOf(address(awm)), fee);
        assertEq(awm.accumulatedFees(), fee);
    }

    function test_Complete_RevertNotEvaluator() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        _submit(jobId);
        vm.prank(stranger);
        vm.expectRevert(AgenticCommerceAWM.NotEvaluator.selector);
        awm.complete(jobId, keccak256("x"), "");
    }

    function test_Complete_RevertNotSubmitted() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        vm.prank(evaluator);
        vm.expectRevert(AgenticCommerceAWM.NotSubmitted.selector);
        awm.complete(jobId, keccak256("x"), "");
    }

    // ------------------------------------------------------------------ //
    // reject
    // ------------------------------------------------------------------ //
    function test_Reject_Open_ByClient() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        awm.reject(jobId, keccak256("canceled"), "");
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Rejected));
    }

    function test_Reject_Funded_ByEvaluator() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        vm.prank(evaluator);
        awm.reject(jobId, keccak256("bad"), "");
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Rejected));
        assertEq(usdc.balanceOf(client), 10 * BUDGET); // refunded
        assertEq(usdc.balanceOf(address(awm)), 0);
    }

    function test_Reject_Submitted_ByEvaluator() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        _submit(jobId);
        vm.prank(evaluator);
        awm.reject(jobId, keccak256("bad"), "");
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Rejected));
        assertEq(usdc.balanceOf(client), 10 * BUDGET);
    }

    function test_Reject_RevertClientOnFunded() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.NotEvaluator.selector);
        awm.reject(jobId, keccak256("x"), "");
    }

    function test_Reject_RevertEvaluatorOnOpen() public {
        uint256 jobId = _createJob();
        vm.prank(evaluator);
        vm.expectRevert(AgenticCommerceAWM.NotClient.selector);
        awm.reject(jobId, keccak256("x"), "");
    }

    // ------------------------------------------------------------------ //
    // claimRefund (expiry)
    // ------------------------------------------------------------------ //
    function test_ClaimRefund_AfterExpiry() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        vm.warp(block.timestamp + 8 days);
        vm.prank(stranger); // anyone can trigger
        awm.claimRefund(jobId);
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Expired));
        assertEq(usdc.balanceOf(client), 10 * BUDGET);
    }

    function test_ClaimRefund_RevertBeforeExpiry() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.NotExpired.selector);
        awm.claimRefund(jobId);
    }

    function test_ClaimRefund_RevertNotFundedOrSubmitted() public {
        uint256 jobId = _createJob();
        vm.warp(block.timestamp + 8 days);
        vm.prank(client);
        vm.expectRevert(AgenticCommerceAWM.NotFundedOrSubmitted.selector);
        awm.claimRefund(jobId);
    }

    // ------------------------------------------------------------------ //
    // Hooks
    // ------------------------------------------------------------------ //
    function test_Hook_CalledOnFund() public {
        uint256 jobId = _createJobWithHook();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        vm.expectEmit(true, true, true, true, address(hook));
        emit MockHook.Before(jobId, awm.FUND_SELECTOR());
        vm.prank(client);
        awm.fund(jobId, BUDGET, "");
    }

    function test_Hook_RevertBefore_BlocksFund() public {
        uint256 jobId = _createJobWithHook();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        hook.setRevertBefore(true);
        vm.prank(client);
        vm.expectRevert(bytes("before-revert"));
        awm.fund(jobId, BUDGET, "");
        // State unchanged (Open, no escrow)
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Open));
        assertEq(usdc.balanceOf(address(awm)), 0);
    }

    function test_Hook_RevertAfter_RollsBack() public {
        uint256 jobId = _createJobWithHook();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");
        hook.setRevertAfter(true);
        vm.prank(client);
        vm.expectRevert(bytes("after-revert"));
        awm.fund(jobId, BUDGET, "");
        // afterAction reverts -> whole tx rolls back, escrow not moved
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Open));
        assertEq(usdc.balanceOf(address(awm)), 0);
    }

    function test_ClaimRefund_NotHookable() public {
        uint256 jobId = _createJobWithHook();
        _fund(jobId);
        vm.warp(block.timestamp + 8 days);
        // claimRefund has no hook calls; should succeed even with reverting hook
        hook.setRevertBefore(true);
        hook.setRevertAfter(true);
        vm.prank(client);
        awm.claimRefund(jobId);
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Expired));
    }

    // ------------------------------------------------------------------ //
    // ZK evaluator (AI-verifier-as-evaluator)
    // ------------------------------------------------------------------ //
    function test_Complete_WithZKProof() public {
        // Evaluator = the verifier contract itself
        vm.prank(client);
        uint256 jobId = awm.createJob(provider, address(verifier), block.timestamp + 7 days, "zk job", address(0));
        _fund(jobId);
        _submit(jobId);

        // Encode a valid proof: pubSignals[0] == 1
        bytes memory proof = abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
            [uint256(7), uint256(8)],
            [uint256(1), uint256(0)] // valid
        );

        vm.prank(address(verifier));
        awm.complete(jobId, keccak256("zk-good"), proof);
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Completed));
    }

    function test_Complete_WithZKProof_RevertInvalid() public {
        vm.prank(client);
        uint256 jobId = awm.createJob(provider, address(verifier), block.timestamp + 7 days, "zk job", address(0));
        _fund(jobId);
        _submit(jobId);

        // Invalid proof: pubSignals[0] == 0
        bytes memory proof = abi.encode(
            [uint256(1), uint256(2)],
            [[uint256(3), uint256(4)], [uint256(5), uint256(6)]],
            [uint256(7), uint256(8)],
            [uint256(0), uint256(0)] // invalid
        );

        vm.prank(address(verifier));
        vm.expectRevert(AgenticCommerceAWM.ZKVerificationFailed.selector);
        awm.complete(jobId, keccak256("zk-bad"), proof);
    }

    // ------------------------------------------------------------------ //
    // ERC-2771 gasless
    // ------------------------------------------------------------------ //
    function test_Forwarder_RelaysAsClient() public {
        uint256 jobId = _createJob();
        // Client approves via forwarder path: build calldata with appended sender
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");

        // Simulate forwarder: msg.sender = trusted forwarder, last 20 bytes = client
        bytes memory callData = abi.encodeWithSelector(awm.fund.selector, jobId, BUDGET, "");
        bytes memory withSender = abi.encodePacked(callData, client);
        vm.prank(forwarder); // msg.sender = trusted forwarder
        (bool ok, ) = address(awm).call(withSender);
        require(ok, "forwarded call failed");
        assertEq(uint8(awm.getJob(jobId).status), uint8(AgenticCommerceAWM.Status.Funded));
    }

    function test_Forwarder_NotTrusted_IsIgnored() public {
        uint256 jobId = _createJob();
        vm.prank(client);
        awm.setBudget(jobId, BUDGET, "");

        // A non-trusted forwarder's appended sender is NOT honored; msg.sender
        // (the fake forwarder) is used, which is not the client -> revert
        bytes memory callData = abi.encodeWithSelector(awm.fund.selector, jobId, BUDGET, "");
        bytes memory withSender = abi.encodePacked(callData, client);
        vm.prank(stranger); // stranger is not the trusted forwarder
        (bool ok, ) = address(awm).call(withSender);
        assertFalse(ok); // reverted because msg.sender (stranger) != client
    }

    // ------------------------------------------------------------------ //
    // Fees & admin
    // ------------------------------------------------------------------ //
    function test_WithdrawFees() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        _submit(jobId);
        vm.prank(evaluator);
        awm.complete(jobId, keccak256("good"), "");

        uint256 fee = (BUDGET * FEE_BPS) / 10_000;
        vm.prank(owner);
        awm.withdrawFees();
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(awm.accumulatedFees(), 0);
    }

    function test_WithdrawFees_RevertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        awm.withdrawFees();
    }

    function test_SetDefaultFeeBps_RevertTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(AgenticCommerceAWM.FeeTooHigh.selector);
        awm.setDefaultFeeBps(1001);
    }

    function test_RescueTokens() public {
        // Send a random token to the contract, then rescue it
        MockUSDC other = new MockUSDC();
        other.mint(address(awm), 500);
        vm.prank(owner);
        awm.rescueTokens(address(other), 500);
        assertEq(other.balanceOf(owner), 500);
    }

    function test_RescueTokens_RevertPaymentToken() public {
        usdc.mint(address(awm), 500);
        vm.prank(owner);
        vm.expectRevert(AgenticCommerceAWM.InvalidEvaluator.selector);
        awm.rescueTokens(address(usdc), 500);
    }

    // ------------------------------------------------------------------ //
    // Full lifecycle happy path
    // ------------------------------------------------------------------ //
    function test_FullLifecycle() public {
        uint256 jobId = _createJob();
        _fund(jobId);
        _submit(jobId);
        vm.prank(evaluator);
        awm.complete(jobId, keccak256("done"), "");

        AgenticCommerceAWM.Job memory job = awm.getJob(jobId);
        assertEq(uint8(job.status), uint8(AgenticCommerceAWM.Status.Completed));
        assertEq(job.completionReason, keccak256("done"));
        // Fee held in escrow until withdrawFees()
        assertEq(usdc.balanceOf(address(awm)), (BUDGET * FEE_BPS) / 10_000);
        assertEq(awm.accumulatedFees(), (BUDGET * FEE_BPS) / 10_000);
    }
}
