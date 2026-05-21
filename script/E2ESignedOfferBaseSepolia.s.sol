// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentWorkEscrow} from "../contracts/AgentWorkEscrow.sol";

/// @notice Tiny live Base Sepolia E2E: seller signs offer, buyer funds escrow, seller submits proof, buyer releases.
/// @dev Required env vars:
/// - PRIVATE_KEY: buyer/deployer key with Base Sepolia ETH + USDC
/// - SELLER_PRIVATE_KEY: seller key; script can fund it with a little ETH
/// - ESCROW: deployed AgentWorkEscrow address
/// - USDC: Base Sepolia USDC address
/// Optional:
/// - E2E_USDC_AMOUNT: amount in USDC base units, default 10000 = 0.01 USDC
contract E2ESignedOfferBaseSepolia is Script {
    function run() external {
        uint256 buyerKey = vm.envUint("PRIVATE_KEY");
        uint256 sellerKey = vm.envUint("SELLER_PRIVATE_KEY");
        address buyer = vm.addr(buyerKey);
        address seller = vm.addr(sellerKey);
        AgentWorkEscrow escrow = AgentWorkEscrow(vm.envAddress("ESCROW"));
        IERC20 usdc = IERC20(vm.envAddress("USDC"));

        uint256 amount = vm.envOr("E2E_USDC_AMOUNT", uint256(10_000));
        uint256 workTimeout = 1 hours;
        uint256 reviewPeriod = 1 hours;
        bytes32 workHash = keccak256("AI Work Market Base Sepolia E2E v1");
        string memory workURI = "ipfs://awm-e2e-work";
        string memory proofURI = "ipfs://awm-e2e-proof";
        uint256 nonce = uint256(keccak256(abi.encodePacked(block.chainid, address(escrow), buyer, seller, block.timestamp)));
        uint256 expiry = block.timestamp + 1 hours;

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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.startBroadcast(buyerKey);
        if (seller.balance < 0.00002 ether) {
            (bool funded,) = payable(seller).call{value: 0.00002 ether}("");
            require(funded, "seller eth funding failed");
        }
        usdc.approve(address(escrow), amount);
        uint256 intentId = escrow.createIntentFromSignedOffer(
            seller,
            amount,
            workTimeout,
            reviewPeriod,
            workHash,
            workURI,
            nonce,
            expiry,
            signature
        );
        vm.stopBroadcast();

        vm.startBroadcast(sellerKey);
        escrow.submitProof(intentId, proofURI);
        vm.stopBroadcast();

        vm.startBroadcast(buyerKey);
        escrow.release(intentId);
        vm.stopBroadcast();

        console2.log("E2E intentId", intentId);
        console2.log("buyer", buyer);
        console2.log("seller", seller);
        console2.log("amount", amount);
        console2.log("escrow", address(escrow));
    }
}
