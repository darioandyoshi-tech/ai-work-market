// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script, console2} from "forge-std/Script.sol";
import {AgentWorkEscrow} from "../contracts/AgentWorkEscrow.sol";

/// @notice Deployment script for Base Sepolia / Base.
/// @dev Required env vars:
/// - PRIVATE_KEY: deployer private key, used only when broadcasting.
// - USDC: canonical USDC token address for the target chain.
// - FEE_RECIPIENT: address allowed to withdraw accumulated platform fees.
// - SAFE_MULTISIG: (optional) if set, transfer ownership to this Safe multisig after deployment.
contract DeployAgentWorkEscrow is Script {
    function run() external returns (AgentWorkEscrow escrow) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        vm.startBroadcast(deployerKey);
        escrow = new AgentWorkEscrow(usdc, feeRecipient);
        vm.stopBroadcast();

        console2.log("AgentWorkEscrow deployed at", address(escrow));
        console2.log("USDC", usdc);
        console2.log("feeRecipient", feeRecipient);
        console2.log("owner (deployer)", escrow.owner());

        // If SAFE_MULTISIG is set, transfer ownership to it
        if (vm.envExists("SAFE_MULTISIG")) {
            address safeMultisig = vm.envAddress("SAFE_MULTISIG");
            console2.log("Transferring ownership to Safe multisig:", safeMultisig);
            vm.startBroadcast(deployerKey);
            escrow.transferOwnership(safeMultisig);
            vm.stopBroadcast();
            console2.log("Ownership transferred. New owner:", escrow.owner());
            console2.log("NOTE: The Safe multisig owners must now call acceptOwnership() to complete the transfer.");
        }
    }
}
