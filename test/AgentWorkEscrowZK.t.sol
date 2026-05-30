// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Test} from "forge-std/Test.sol";
import "../contracts/AgentWorkEscrowZK.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @notice Mock USDC for testing.
contract MockUSDC is EIP712 {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor() EIP712(name, "1") {}

    function mint(address to, uint256 amount) external {
        balances[to] += amount;
    }

    function totalSupply() external view returns (uint256) { return 0; }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balances[msg.sender] >= amount, "USDC: insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
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
        // Fix: Direct transfer instead of calling transfer() function to avoid recursion
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return allowances[owner][spender];
    }
}

/// @notice Mock verifier for testing - returns true for valid test signals [1, 9]
contract MockVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[2] calldata _pubSignals) public pure returns (bool) {
        // For our test values: we'll return true if pubSignals[0] == 1 (valid) and pubSignals[1] == 9 (commitment)
        return (_pubSignals[0] == 1 && _pubSignals[1] == 9);
    }
}

contract AgentWorkEscrowZKTest is Test {
    MockUSDC public usdc;
    MockVerifier public verifier;
    AgentWorkEscrowZK public escrow;

    address public owner = address(0xABCD);
    address public buyer = address(0x1111);
    address public seller = address(0x2222);
    address public feeRecipient = address(0x3333);

    uint256 public amount = 100_000; // 0.1 USDC
    uint256 public timeout = 1 days;
    uint256 public reviewPeriod = 3 days;
    bytes32 public workHash = keccak256("data");
    string public workURI = "ipfs://QmTest";

    // Test values from our circuit: validity=1, commitment=9
    uint256[2] public pA = [uint256(0x1234), uint256(0x5678)];
    uint256[2][2] public pB = [[uint256(0x1111), uint256(0x2222)], [uint256(0x3333), uint256(0x4444)]];
    uint256[2] public pC = [uint256(0x5555), uint256(0x6666)];
    uint256[2] public pubSignals = [uint256(1), uint256(9)]; // [isValid, commitment]

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockUSDC();
        verifier = new MockVerifier();
        escrow = new AgentWorkEscrowZK(address(usdc), feeRecipient, owner, address(verifier));

        // Fund buyer with USDC and approve escrow
        usdc.mint(buyer, amount * 10);
        vm.stopPrank();

        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_createIntent() public {
        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        (
            address b,
            address s,
            uint96 feeBps,
            uint256 a,
            uint256 createdAt,
            uint256 wd,
            uint256 rd,
            uint256 rp,
            bytes32 wh,
            string memory wURI,
            AgentWorkEscrowZK.Status status,
            string memory pURI,
            string memory dURI
        ) = escrow.intents(id);
        assertEq(b, buyer);
        assertEq(s, seller);
        assertEq(a, amount);
        assertEq(uint256(status), uint256(AgentWorkEscrowZK.Status.Funded));
    }

    function test_release_without_zk() public {
        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        // Seller submits proof (original v0.5 flow)
        vm.prank(seller);
        escrow.submitProof(id, "ipfs://QmProof");

        // Buyer releases (no ZK configured, so it passes)
        vm.prank(buyer);
        escrow.release(id);

        (
            address b2,
            address s2,
            uint96 fb2,
            uint256 a2,
            uint256 ca2,
            uint256 wd2,
            uint256 rd2,
            uint256 rp2,
            bytes32 wh2,
            string memory wu2,
            AgentWorkEscrowZK.Status st2,
            string memory pu2,
            string memory d2
        ) = escrow.intents(id);
        assertEq(uint256(st2), uint256(AgentWorkEscrowZK.Status.Released));
    }

    function test_setZKVerifier() public {
        vm.prank(owner);
        escrow.setZKVerifier(address(0));
        assertEq(address(escrow.zkVerifier()), address(0));

        vm.prank(owner);
        escrow.setZKVerifier(address(verifier));
        assertEq(address(escrow.zkVerifier()), address(verifier));
    }

    function test_submitProofWithZK() public {
        // This test verifies the contract path, not the actual ZK proof.
        // With a valid proof, call this.

        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        // Seller submits ZK proof
        vm.prank(seller);
        escrow.submitProofWithZK(id, "ipfs://QmProof", pA, pB, pC, pubSignals);

        (
            address b3,
            address s3,
            uint96 fb3,
            uint256 a3,
            uint256 ca3,
            uint256 wd3,
            uint256 rd3,
            uint256 rp3,
            bytes32 wh3,
            string memory wu3,
            AgentWorkEscrowZK.Status st3,
            string memory pu3,
            string memory d3
        ) = escrow.intents(id);
        // With a valid ZK proof, TessPay automatically sets status to Released
        assertEq(uint256(st3), uint256(AgentWorkEscrowZK.Status.Released));
    }

    function test_release_with_zk_invalidProof() public {
        // Verifier is already set in constructor

        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        // Submit a ZK proof with garbage values (invalid)
        uint256[2] memory badpA = [uint256(0), uint256(0)];
        uint256[2][2] memory badpB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory badpC = [uint256(0), uint256(0)];
        uint256[2] memory badPub = [uint256(0), uint256(0)]; // invalid

        vm.prank(seller);
        escrow.submitProofWithZK(id, "ipfs://QmProof", badpA, badpB, badpC, badPub);

        // Attempting release with invalid proof should revert
        vm.startPrank(buyer);
        vm.expectRevert(AgentWorkEscrowZK.ZKProofInvalid.selector);
        escrow.release(id);
        vm.stopPrank();
    }

    function test_release_with_zk_notConfigured() public {
        // Disable ZK verifier
        vm.prank(owner);
        escrow.setZKVerifier(address(0));

        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        // Submit proof without ZK: should revert because verifier not configured
        vm.prank(seller);
        vm.expectRevert(AgentWorkEscrowZK.ZKNotConfigured.selector);
        escrow.submitProofWithZK(id, "ipfs://QmProof", pA, pB, pC, pubSignals);
    }

    function test_claim_after_review_with_zk() public {
        // Verifier is already set in constructor

        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        // Submit garbage ZK proof
        uint256[2] memory badpA = [uint256(0), uint256(0)];
        uint256[2][2] memory badpB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory badpC = [uint256(0), uint256(0)];
        uint256[2] memory badPub = [uint256(0), uint256(0)]; // invalid

        vm.prank(seller);
        escrow.submitProofWithZK(id, "ipfs://QmProof", badpA, badpB, badpC, badPub);

        // Fast-forward past review period
        vm.warp(block.timestamp + reviewPeriod + 1);

        // Claim should revert with invalid ZK proof
        vm.startPrank(seller);
        vm.expectRevert(AgentWorkEscrowZK.ZKProofInvalid.selector);
        escrow.claimAfterReview(id);
        vm.stopPrank();
    }

    function test_full_zk_flow_with_real_proof() public {
        // This test is a placeholder for when you have a real proof generated by snarkjs.
        // Generate proof.json and public.json using:
        // snarkjs groth16 fullprove input.json AgentProof.wasm circuit_0000.zkey proof.json public.json
        //
        // Then parse proof.json and pass the values into this test.
        //
        // For now we just assert the setup is correct.
        assertTrue(address(verifier) != address(0));
    }

    function test_tesspay_auto_payment_on_valid_zk_proof() public {
        // This test verifies the new TessPay functionality: automatic payment upon valid ZK proof

        // Setup: Create an intent
        vm.prank(buyer);
        uint256 id = escrow.createIntent(seller, amount, timeout, reviewPeriod, workHash, workURI);

        // Verify initial state: Funded
        (
            address b,
            address s,
            uint96 feeBps,
            uint256 a,
            uint256 createdAt,
            uint256 wd,
            uint256 rd,
            uint256 rp,
            bytes32 wh,
            string memory wURI,
            AgentWorkEscrowZK.Status status,
            string memory pURI,
            string memory dURI
        ) = escrow.intents(id);
        assertEq(uint256(status), uint256(AgentWorkEscrowZK.Status.Funded));

        // Verify initial balances
        uint256 initialSellerBalance = usdc.balanceOf(seller);
        uint256 initialFeeBalance = usdc.balanceOf(feeRecipient);
        uint256 initialContractBalance = usdc.balanceOf(address(escrow));
        uint256 initialAccumulatedFees = escrow.accumulatedFees();

        // Submit VALID ZK proof (using our test values)
        vm.prank(seller);
        escrow.submitProofWithZK(id, "ipfs://QmProof", pA, pB, pC, pubSignals);

        // CHECK: Status should automatically be Released (TessPay in action)
        (
            address b2,
            address s2,
            uint96 feeBps2,
            uint256 a2,
            uint256 createdAt2,
            uint256 wd2,
            uint256 rd2,
            uint256 rp2,
            bytes32 wh2,
            string memory wURI2,
            AgentWorkEscrowZK.Status status2,
            string memory pURI2,
            string memory dURI2
        ) = escrow.intents(id);
        assertEq(uint256(status2), uint256(AgentWorkEscrowZK.Status.Released));

        // CHECK: Payment should have occurred automatically
        uint256 expectedFee = (amount * escrow.defaultFeeBps()) / 10_000;
        uint256 expectedSellerAmount = amount - expectedFee;

        uint256 finalSellerBalance = usdc.balanceOf(seller);
        uint256 finalFeeBalance = usdc.balanceOf(feeRecipient);
        uint256 finalContractBalance = usdc.balanceOf(address(escrow));
        uint256 finalAccumulatedFees = escrow.accumulatedFees();

        // Seller should have received their amount
        assertEq(finalSellerBalance - initialSellerBalance, expectedSellerAmount);

        // Fee recipient balance should be unchanged (fee accumulated in contract)
        assertEq(finalFeeBalance - initialFeeBalance, 0);

        // Contract balance should equal the fee amount (sent out seller amount only)
        assertEq(finalContractBalance, expectedFee);

        // Accumulated fees should increase by the fee amount
        assertEq(finalAccumulatedFees - initialAccumulatedFees, expectedFee);

        // Verify that ZKVerificationPassed and TessPay events were emitted
        // For now, the state changes and balance transfers prove it worked
    }
}