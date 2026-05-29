// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script, console2} from "forge-std/Script.sol";
import {AgentWorkEscrowZK} from "../contracts/AgentWorkEscrowZK.sol";
import {Groth16Verifier} from "../contracts/AgentWorkProofVerifier.sol"; // The snarkjs-generated verifier

/// @notice Deploy ZK-enhanced AWM to Base Sepolia.
/// 1. Deploys the Groth16 verifier contract
/// 2. Deploys AgentWorkEscrowZK with verifier address
///
/// Required env vars:
/// - PRIVATE_KEY: deployer private key
/// - USDC: Base Sepolia USDC address (0x036CbD53842c5426634e7929541eC2318f3dCF7e)
/// - FEE_RECIPIENT: address for fee withdrawals
contract DeployZK is Script {
    function run() external returns (address verifier, address escrowZK) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        // Step 1: Deploy Groth16 verifier
        vm.startBroadcast(deployerKey);
        Groth16Verifier verifierContract = new Groth16Verifier();
        vm.stopBroadcast();
        verifier = address(verifierContract);
        console2.log("Groth16Verifier deployed at", verifier);

        // Step 2: Deploy ZK escrow with verifier
        vm.startBroadcast(deployerKey);
        AgentWorkEscrowZK escrow = new AgentWorkEscrowZK(usdc, feeRecipient, tx.origin, verifier);
        vm.stopBroadcast();
        escrowZK = address(escrow);
        console2.log("AgentWorkEscrowZK deployed at", escrowZK);
        console2.log("USDC", usdc);
        console2.log("feeRecipient", feeRecipient);
        console2.log("zkVerifier", verifier);
    }
}
