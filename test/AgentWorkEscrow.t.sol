// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "forge-std/Test.sol";
import "../contracts/AgentWorkEscrow.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function setFailTransfers(bool value) external { failTransfers = value; }
}

contract AgentWorkEscrowTest is Test {
    MockUSDC usdc;
    AgentWorkEscrow escrow;

    uint256 sellerPk = 0x5E11;
    address owner = address(0xA11CE);
    address feeRecipient = address(0xFEE);
    address buyer = address(0xB0B);
    address seller;
    address other = address(0x0BAD);

    uint256 amount = 1_000e6;
    uint256 workTimeout = 7 days;
    uint256 reviewPeriod = 2 days;
    bytes32 workHash = keccak256("canonical work spec v1");
    string workURI = "ipfs://QmXoypizS73nZ98P7a6F7v3d4k5l6m7n8o9p0q1r2s3t4u";

    function setUp() public {
        seller = vm.addr(sellerPk);
        usdc = new MockUSDC();
        vm.prank(owner);
        escrow = new AgentWorkEscrow(address(usdc), feeRecipient);
        usdc.mint(buyer, amount * 10);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function testCreateIntentStoresWorkMetadataAndFundsEscrow() public {
        uint256 id = _createIntent();
        (
            address storedBuyer,
            address storedSeller,
            uint96 feeBps,
            uint256 storedAmount,
            ,
            uint256 workDeadline,
            uint256 reviewDeadline,
            uint256 storedReviewPeriod,
            bytes32 storedWorkHash,
            string memory storedWorkURI,
            AgentWorkEscrow.Status status,,
        ) = escrow.intents(id);
        assertEq(storedBuyer, buyer);
        assertEq(storedSeller, seller);
        assertEq(feeBps, 100);
        assertEq(storedAmount, amount);
        assertGt(workDeadline, block.timestamp);
        assertEq(reviewDeadline, 0);
        assertEq(storedReviewPeriod, reviewPeriod);
        assertEq(storedWorkHash, workHash);
        assertEq(storedWorkURI, workURI);
        assertEq(uint256(status), uint256(AgentWorkEscrow.Status.Funded));
        assertEq(usdc.balanceOf(address(escrow)), amount);
    }

    function testRejectsBadCreateInputs() public {
        vm.startPrank(buyer);
        vm.expectRevert(AgentWorkEscrow.ZeroAddress.selector);
        escrow.createIntent(address(0), amount, workTimeout, reviewPeriod, workHash, workURI);
        vm.expectRevert(AgentWorkEscrow.SelfEscrow.selector);
        escrow.createIntent(buyer, amount, workTimeout, reviewPeriod, workHash, workURI);
        vm.expectRevert(AgentWorkEscrow.InvalidAmount.selector);
        escrow.createIntent(seller, 0, workTimeout, reviewPeriod, workHash, workURI);
        vm.expectRevert(AgentWorkEscrow.InvalidWorkHash.selector);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, bytes32(0), workURI);
        
        // URI Validations (Basic)
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, "");
        
        // Now explicitly allow non-IPFS for workURI (since _validateBasicURI is used)
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, "https://github.com/dario/awm");
        
        vm.expectRevert(AgentWorkEscrow.InvalidTimeout.selector);
        escrow.createIntent(seller, amount, 30 minutes, reviewPeriod, workHash, workURI);
        vm.expectRevert(AgentWorkEscrow.InvalidReviewPeriod.selector);
        escrow.createIntent(seller, amount, workTimeout, 30 minutes, workHash, workURI);
        vm.stopPrank();
    }

    function testCreateIntentFromSignedOffer() public {
        uint256 nonce = 42;
        uint256 expiry = block.timestamp + 1 days;
        bytes memory sig = _sellerOfferSig(nonce, expiry);
        vm.prank(buyer);
        uint256 id = escrow.createIntentFromSignedOffer(
            seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce, expiry, sig
        );
        assertTrue(id > 0);
        assertEq(usdc.balanceOf(address(escrow)), amount);
        bytes32 digest = escrow.getOfferDigest(
            buyer, seller, amount, workHash, keccak256(bytes(workURI)), workTimeout, reviewPeriod, nonce, expiry
        );
        assertTrue(escrow.usedOfferDigests(digest));
    }

    function testSignedOfferRejectsExpiredReplayAndBadSignature() public {
        uint256 nonce = 7;
        uint256 expiry = block.timestamp + 1 days;
        bytes memory sig = _sellerOfferSig(nonce, expiry);

        vm.warp(expiry + 1);
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.OfferExpired.selector);
        escrow.createIntentFromSignedOffer(seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce, expiry, sig);

        vm.warp(100);
        expiry = block.timestamp + 1 days;
        sig = _sellerOfferSig(nonce, expiry);
        vm.prank(buyer);
        escrow.createIntentFromSignedOffer(seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce, expiry, sig);
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.OfferUsed.selector);
        escrow.createIntentFromSignedOffer(seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce, expiry, sig);

        bytes memory badSig = _sign(vm.addr(0xBAD), 0xBAD, nonce + 1, expiry + 1 days);
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.InvalidSignature.selector);
        escrow.createIntentFromSignedOffer(seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce + 1, expiry + 1 days, badSig);
    }

    function testSignedOfferRejectsCancelledNonce() public {
        uint256 nonce = 99;
        uint256 expiry = block.timestamp + 1 days;
        bytes memory sig = _sellerOfferSig(nonce, expiry);

        vm.prank(seller);
        escrow.cancelOfferNonce(nonce);

        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.OfferCancelled.selector);
        escrow.createIntentFromSignedOffer(seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce, expiry, sig);
    }

    function testRejectsHighSMalleableSignature() public {
        uint256 nonce = 123;
        uint256 expiry = block.timestamp + 1 days;
        bytes32 digest = escrow.getOfferDigest(
            buyer,
            seller,
            amount,
            workHash,
            keccak256(bytes(workURI)),
            workTimeout,
            reviewPeriod,
            nonce,
            expiry
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerPk, digest);

        uint256 secp256k1n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(secp256k1n - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        bytes memory malleableSig = abi.encodePacked(r, highS, flippedV);

        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.InvalidSignature.selector);
        escrow.createIntentFromSignedOffer(
            seller, amount, workTimeout, reviewPeriod, workHash, workURI, nonce, expiry, malleableSig
        );
    }

    function testSellerCanSubmitProofSetsReviewDeadline() public {
        uint256 id = _createIntent();
        _submitProof(id);
        (,,,,,, uint256 reviewDeadline,,,, AgentWorkEscrow.Status status, string memory proofURI,) = escrow.intents(id);
        assertEq(uint256(status), uint256(AgentWorkEscrow.Status.ProofSubmitted));
        assertEq(proofURI, "ipfs://proof");
        assertEq(reviewDeadline, block.timestamp + reviewPeriod);
    }

    function testProofValidationAndDeadline() public {
        uint256 id = _createIntent();
        vm.prank(seller);
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.submitProof(id, "");
        vm.warp(block.timestamp + workTimeout + 1);
        vm.prank(seller);
        vm.expectRevert(AgentWorkEscrow.WorkDeadlinePassed.selector);
        escrow.submitProof(id, "ipfs://late");
    }

    function testWorkDeadlineBoundary() public {
        uint256 id1 = _createIntent();
        vm.warp(block.timestamp + workTimeout);
        vm.prank(seller);
        vm.expectRevert(AgentWorkEscrow.WorkDeadlinePassed.selector);
        escrow.submitProof(id1, "ipfs://boundary");

        uint256 id2 = _createIntent();
        vm.warp(block.timestamp + workTimeout);
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.RefundUnavailable.selector);
        escrow.refund(id2);
        vm.warp(block.timestamp + 1);
        vm.prank(buyer);
        escrow.refund(id2);
    }

    function testBuyerCanReleaseOnlyAfterProofWithFee() public {
        uint256 id = _createIntent();
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.InvalidStatus.selector);
        escrow.release(id);
        _submitProof(id);
        vm.prank(buyer);
        escrow.release(id);
        uint256 fee = amount / 100;
        assertEq(usdc.balanceOf(seller), amount - fee);
        assertEq(escrow.accumulatedFees(), fee);
    }

    function testBuyerCannotRefundAfterProofAndSellerCanClaimAfterReview() public {
        uint256 id = _createIntent();
        _submitProof(id);
        vm.warp(block.timestamp + workTimeout + 1);
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.InvalidStatus.selector);
        escrow.refund(id);
        vm.prank(seller);
        escrow.claimAfterReview(id);
        uint256 fee = amount / 100;
        assertEq(usdc.balanceOf(seller), amount - fee);
    }

    function testBuyerCanRefundOnlyWhenNoProofAfterWorkDeadline() public {
        uint256 id = _createIntent();
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.RefundUnavailable.selector);
        escrow.refund(id);
        vm.warp(block.timestamp + workTimeout + 1);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.refund(id);
        assertEq(usdc.balanceOf(buyer), buyerBefore + amount);
    }

    function testBuyerAndSellerCanDisputeWithReason() public {
        uint256 id1 = _createIntent();
        vm.prank(buyer);
        escrow.dispute(id1, "ipfs://buyer-reason");
        (,,,,,,,,,, AgentWorkEscrow.Status status1,, string memory reason1) = escrow.intents(id1);
        assertEq(uint256(status1), uint256(AgentWorkEscrow.Status.Disputed));
        assertEq(reason1, "ipfs://buyer-reason");

        uint256 id2 = _createIntent();
        _submitProof(id2);
        vm.prank(seller);
        escrow.dispute(id2, "ipfs://seller-reason");
        (,,,,,,,,,, AgentWorkEscrow.Status status2,, string memory reason2) = escrow.intents(id2);
        assertEq(uint256(status2), uint256(AgentWorkEscrow.Status.Disputed));
        assertEq(reason2, "ipfs://seller-reason");
    }

    function testOnlyPartyCanDisputeAndDisputedIntentCannotMoveNormally() public {
        uint256 id = _createIntent();
        _submitProof(id);
        vm.prank(other);
        vm.expectRevert(AgentWorkEscrow.NotParty.selector);
        escrow.dispute(id, "ipfs://reason");
        vm.prank(buyer);
        escrow.dispute(id, "ipfs://reason");
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.InvalidStatus.selector);
        escrow.release(id);
        vm.warp(block.timestamp + reviewPeriod + 1);
        vm.prank(seller);
        vm.expectRevert(AgentWorkEscrow.InvalidStatus.selector);
        escrow.claimAfterReview(id);
    }

    function testOwnerCanResolvePartialDisputeWithFee() public {
        uint256 id = _createIntent();
        vm.prank(buyer);
        escrow.dispute(id, "ipfs://reason");
        uint256 buyerAmount = 400e6;
        uint256 sellerGross = 600e6;
        vm.prank(owner);
        escrow.resolveDispute(id, buyerAmount, sellerGross, true);
        uint256 fee = sellerGross / 100;
        
        uint256 expectedBuyerBalance = (amount * 10) - amount + buyerAmount;
        assertEq(usdc.balanceOf(buyer), expectedBuyerBalance);
        assertEq(usdc.balanceOf(seller), sellerGross - fee);
        assertEq(escrow.accumulatedFees(), fee);
    }

    function testResolveDisputeValidatesOwnerStatusAndSplit() public {
        uint256 id = _createIntent();
        vm.prank(buyer);
        escrow.dispute(id, "ipfs://reason");
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, buyer));
        escrow.resolveDispute(id, 0, amount, true);
        vm.prank(owner);
        vm.expectRevert(AgentWorkEscrow.InvalidSplit.selector);
        escrow.resolveDispute(id, 1, amount, true);
    }

    function testFeeWithdrawRequiresFees() public {
        vm.prank(feeRecipient);
        vm.expectRevert(AgentWorkEscrow.NoFees.selector);
        escrow.withdrawFees();
        uint256 id = _createIntent();
        _submitProof(id);
        vm.prank(buyer);
        escrow.release(id);
        uint256 fee = amount / 100;
        vm.prank(feeRecipient);
        escrow.withdrawFees();
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    function testAdminControlsAndTwoStepOwnership() public {
        vm.prank(owner);
        escrow.setFeeRecipient(address(0xCAFE));
        assertEq(escrow.feeRecipient(), address(0xCAFE));
        vm.prank(owner);
        escrow.setDefaultFeeBps(250);
        assertEq(escrow.defaultFeeBps(), 250);
        vm.prank(owner);
        vm.expectRevert(AgentWorkEscrow.InvalidFee.selector);
        escrow.setDefaultFeeBps(1_001);
        address newOwner = address(0xBEEF);
        vm.prank(owner);
        escrow.transferOwnership(newOwner);
        assertEq(escrow.pendingOwner(), newOwner);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        escrow.acceptOwnership();
        vm.prank(newOwner);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), newOwner);
    }

    function _createIntent() internal returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, workURI);
    }

    function _submitProof(uint256 id) internal {
        vm.prank(seller);
        escrow.submitProof(id, "ipfs://proof");
    }

    function _sign(address signer, uint256 pk, uint256 nonce, uint256 expiry) internal view returns (bytes memory) {
        bytes32 digest = escrow.getOfferDigest(
            buyer,
            signer,
            amount,
            workHash,
            keccak256(bytes(workURI)),
            workTimeout,
            reviewPeriod,
            nonce,
            expiry
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _sellerOfferSig(uint256 nonce, uint256 expiry) internal view returns (bytes memory) {
        return _sign(seller, sellerPk, nonce, expiry);
    }

    function testURIValidationEdgeCases() public {
        vm.prank(buyer);
        
        // Valid: Minimum length ipfs://
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, "ipfs://");
        
        // Valid: Exact Max Length (512 bytes)
        bytes memory maxBytes = new bytes(512);
        for(uint i = 0; i < 512; i++) {
            if (i < 7) {
                bytes memory prefix = "ipfs://";
                maxBytes[i] = prefix[i];
            } else {
                maxBytes[i] = 'a';
            }
        }
        string memory maxURI = string(maxBytes);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, maxURI);
        
        // Invalid: Too Long (513 bytes)
        bytes memory longBytes = new bytes(513);
        for(uint i = 0; i < 513; i++) {
            if (i < 7) {
                bytes memory prefix = "ipfs://";
                longBytes[i] = prefix[i];
            } else {
                longBytes[i] = 'a';
            }
        }
        string memory tooLongURI = string(longBytes);
        vm.expectRevert(AgentWorkEscrow.UriTooLong.selector);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, tooLongURI);

        // Invalid: Wrong prefix/case/formatting
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, "IPFS://valid");
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, "ipfs:/valid");
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.createIntent(seller, amount, workTimeout, reviewPeriod, workHash, " ipfs://valid");
    }

    function testProofAndDisputeURIValidation() public {
        uint256 id = _createIntent();
        
        // Test proofURI
        vm.prank(seller);
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.submitProof(id, "http://proof.com");
        
        vm.prank(seller);
        escrow.submitProof(id, "ipfs://valid-proof");
        
        // Test disputeURI (buyer side)
        vm.prank(buyer);
        vm.expectRevert(AgentWorkEscrow.InvalidURI.selector);
        escrow.dispute(id, "not-ipfs");
        
        vm.prank(buyer);
        escrow.dispute(id, "ipfs://valid-dispute");
    }
}
