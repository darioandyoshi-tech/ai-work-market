// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/// @notice Encodes the Timelock transaction for Safe multi-sig execution.
/// @dev This script does NOT broadcast. It prints the ABI-encoded transaction data
///      that must be signed by 2-of-3 Safe owners and submitted to the Safe.
///      The Safe then calls Timelock.schedule(), waits 48h, then Timelock.execute().
contract QueueSafeProposal is Script {
    // Safe (2-of-3) — must propose to Timelock
    address constant SAFE = 0x7f36896F6b6496B4E2fE95f672B3DAf28386b637;

    // TimelockController — owner of AgentWorkEscrowZK
    address constant TIMELOCK = 0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967;

    // Target: AgentWorkEscrowZK
    address constant ESCROW = 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2;

    // New adapter to activate
    address constant ADAPTER = 0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2a4ca9;
    
    // Operation: Call (not delegateCall) 
    uint8 constant OP_CALL = 0;

    // Timelock delay: 48 hours = 172800 seconds
    uint256 constant DELAY = 172800;

    function run() external view {
        // Encode: AgentWorkEscrowZK.setZkVerifier(ADAPTER)
        bytes memory data = abi.encodeWithSignature(
            "setZkVerifier(address)",
            ADAPTER
        );

        // Encode: Timelock.schedule(target, value, data, predecessor, salt, delay)
        bytes32 salt = keccak256(abi.encodePacked("ZK-ADAPTER-20260529"));
        bytes32 predecessor = bytes32(0);
        bytes memory scheduleData = abi.encodeWithSignature(
            "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
            ESCROW,
            0,           // value
            data,
            predecessor,
            salt,
            DELAY
        );

        console.log("=== Safe Governance Transaction ===");
        console.log("From (Safe):     ", SAFE);
        console.log("To (Timelock):   ", TIMELOCK);
        console.log("Value:           ", uint256(0));
        console.log("Operation:       ", OP_CALL);
        console.log("\n--- Timelock.schedule() calldata ---");
        console.logBytes(scheduleData);

        // Also prepare the execute() calldata for after 48h delay
        bytes memory executeData = abi.encodeWithSignature(
            "execute(address,uint256,bytes,bytes32,bytes32)",
            ESCROW,
            0,
            data,
            predecessor,
            salt
        );

        console.log("\n--- Timelock.execute() calldata (use after 48h) ---");
        console.logBytes(executeData);

        // Compute unique operation ID
        bytes32 operationId = keccak256(abi.encode(ESCROW, uint256(0), data, predecessor, salt));
        console.log("\n--- Timelock operation ID ---");
        console.logBytes32(operationId);
    }
}
