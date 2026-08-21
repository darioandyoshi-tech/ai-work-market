// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script, console2} from "forge-std/Script.sol";
import {AgenticCommerceAWM} from "../contracts/AgenticCommerceAWM.sol";

/// @notice Deployment script for AgenticCommerceAWM (ERC-8183) on Base / Base Sepolia.
/// @dev Required env vars:
/// - PRIVATE_KEY: deployer private key, used only when broadcasting.
/// - PAYMENT_TOKEN: canonical USDC address for the target chain.
/// - TREASURY: platform fee recipient (Safe/treasury, not hot EOA).
/// - TRUSTED_FORWARDER: ERC-2771 forwarder (0x0 to disable gasless).
/// - ZK_VERIFIER: Groth16 verifier used as AI evaluator (0x0 to disable).
/// - SAFE_MULTISIG: (optional) if set, transfer ownership to this Safe after deploy.
contract DeployAgenticCommerceAWM is Script {
    function run() external returns (AgenticCommerceAWM awm) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");
        address treasury = vm.envAddress("TREASURY");
        address trustedForwarder = vm.envOr("TRUSTED_FORWARDER", address(0));
        address zkVerifier = vm.envOr("ZK_VERIFIER", address(0));

        vm.startBroadcast(deployerKey);
        awm = new AgenticCommerceAWM(paymentToken, treasury, tx.origin, trustedForwarder, zkVerifier);
        vm.stopBroadcast();

        console2.log("AgenticCommerceAWM deployed at", address(awm));
        console2.log("paymentToken", paymentToken);
        console2.log("treasury", treasury);
        console2.log("trustedForwarder", trustedForwarder);
        console2.log("zkVerifier", zkVerifier);
        console2.log("owner (deployer)", awm.owner());

        // If SAFE_MULTISIG is set, transfer ownership to it
        if (vm.envExists("SAFE_MULTISIG")) {
            address safeMultisig = vm.envAddress("SAFE_MULTISIG");
            console2.log("Transferring ownership to Safe multisig:", safeMultisig);
            vm.startBroadcast(deployerKey);
            awm.transferOwnership(safeMultisig);
            vm.stopBroadcast();
            console2.log("Ownership transferred. New owner:", awm.owner());
            console2.log("NOTE: The Safe multisig owners must now call acceptOwnership() to complete the transfer.");
        }
    }
}
