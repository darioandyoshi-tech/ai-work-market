// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script, console2} from "forge-std/Script.sol";
import {AgentWorkEscrow} from "../contracts/AgentWorkEscrow.sol";

/// @notice Deployment script for Base Sepolia / Base.
/// @dev Required env vars:
/// - PRIVATE_KEY: deployer private key, used only when broadcasting.
/// - USDC: canonical USDC token address for the target chain.
/// - FEE_RECIPIENT: address allowed to withdraw accumulated platform fees.
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
        console2.log("owner", escrow.owner());
    }
}
