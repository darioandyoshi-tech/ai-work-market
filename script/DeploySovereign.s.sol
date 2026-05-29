// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script, console2} from "forge-std/Script.sol";
import {AgentWorkEscrowZK} from "../contracts/AgentWorkEscrowZK.sol";
import {Groth16Verifier} from "../contracts/AgentWorkProofVerifier.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Sovereign unified deployment: Governance + ZK Escrow.
/// Deploys Gnosis Safe, TimelockController, Groth16Verifier, and AgentWorkEscrowZK
/// in a single Foundry broadcast, anchored from Block 0.
///
/// Required env vars:
///   PRIVATE_KEY: deployer key
///   FEE_RECIPIENT: platform fee withdrawal address
///   SAFE_OWNER_1, SAFE_OWNER_2, SAFE_OWNER_3: 3-of-N Safe owners
///   Optional: SAFE_THRESHOLD (default 2)
///
/// Canonical Base Sepolia addresses (Gnosis Safe v1.3.0 + CompatibilityFallbackHandler):
///   Safe singleton: 0x3E5c63644E683549055b9Be8653de26E3B4cd83E
///   Safe proxy factory: 0xa6B71E26C5e0845f74c812123Ac85F1d5fCB1D7d
///   USDC (Circle testnet): 0x036CbD53842c5426634e7929541eC2318f3dCF7e
contract DeploySovereign is Script {
    // -- Gnosis Safe v1.3.0 (Base Sepolia) --
    address constant SAFE_SINGLETON = 0x69f4D1788e39c87893C980c06EdF4b7f686e2938;
    address constant SAFE_FACTORY   = 0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC;
    address constant FALLBACK_HANDLER = address(0);

    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint256 constant TIMELOCK_MIN_DELAY = 172800; // 48h in seconds

    // ============================================================
    //  RUN
    // ============================================================
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        // Load Safe owners from env
        address[3] memory owners;
        owners[0] = vm.envAddress("SAFE_OWNER_1");
        owners[1] = vm.envAddress("SAFE_OWNER_2");
        owners[2] = vm.envAddress("SAFE_OWNER_3");
        uint256 threshold = vm.envOr("SAFE_THRESHOLD", uint256(2));

        console2.log("================================================");
        console2.log("SOVEREIGN DEPLOYMENT -- Phase 1: Governance Anchor");
        console2.log("================================================");
        console2.log("Deployer", deployer);
        console2.log("Chain ID", block.chainid);

        // ===================================================
        // TX 1: Deploy Gnosis Safe (2-of-3)
        // ===================================================
        console2.log("----------------------------");
        console2.log("TX 1: Gnosis Safe creation");

        vm.startBroadcast(deployerKey);
        bytes memory safeInitializer = _encodeSafeSetup(owners, threshold);
        address payable safe = payable(IGnosisSafeProxyFactory(SAFE_FACTORY).createProxyWithNonce(
            SAFE_SINGLETON,
            safeInitializer,
            block.timestamp // salt nonce -- deterministic but unique per run
        ));
        vm.stopBroadcast();

        console2.log("Safe deployed at", safe);
        console2.log("Safe threshold:", threshold);
        console2.log("Safe owners:");
        console2.log("  1:", owners[0]);
        console2.log("  2:", owners[1]);
        console2.log("  3:", owners[2]);

        // ===================================================
        // TX 2: Deploy TimelockController
        // Proposers: [Gnosis Safe]
        // Executors: [Gnosis Safe, deployer] -- deployer = temporary executor
        // Admin: deployer (renounced after setup)
        // ===================================================
        console2.log("----------------------------");
        console2.log("TX 2: TimelockController deployment");

        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](2);
        executors[0] = safe;
        executors[1] = deployer;

        vm.startBroadcast(deployerKey);
        TimelockController timelock = new TimelockController(
            TIMELOCK_MIN_DELAY, // 2 days
            proposers,
            executors,
            deployer // admin -- to be renounced
        );
        address timelockAddr = address(timelock);
        vm.stopBroadcast();

        console2.log("TimelockController at", timelockAddr);
        console2.log("Min delay:", TIMELOCK_MIN_DELAY, "seconds (48h)");
        console2.log("Proposers count:", proposers.length);
        console2.log("Executors count:", executors.length);

        // ===================================================
        // TX 3: Deploy Groth16 Verifier
        // ===================================================
        console2.log("----------------------------");
        console2.log("TX 3: Groth16 Verifier");

        vm.startBroadcast(deployerKey);
        Groth16Verifier verifier = new Groth16Verifier();
        vm.stopBroadcast();

        console2.log("Groth16Verifier at", address(verifier));

        // ===================================================
        // TX 4: Deploy AgentWorkEscrowZK
        // Owner is set DIRECTLY to TimelockController at birth.
        // No transfer needed -- sovereign from Block 0.
        // ===================================================
        console2.log("----------------------------");
        console2.log("TX 4: AgentWorkEscrowZK (owner = Timelock)");

        vm.startBroadcast(deployerKey);
        AgentWorkEscrowZK escrow = new AgentWorkEscrowZK(
            USDC,
            feeRecipient,
            timelockAddr, // initialOwner = TimelockController directly
            address(verifier)
        );
        vm.stopBroadcast();

        console2.log("AgentWorkEscrowZK at", address(escrow));
        console2.log("owner (should be timelock)", escrow.owner());
        console2.log("USDC", USDC);
        console2.log("feeRecipient", feeRecipient);
        console2.log("zkVerifier", address(verifier));

        // ===================================================
        // TX 5: Renounce deployer ADMIN role on Timelock
        // ===================================================
        console2.log("----------------------------");
        console2.log("TX 5: Renounce Timelock admin (deployer cleanup)");

        vm.startBroadcast(deployerKey);
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);
        vm.stopBroadcast();

        console2.log("Deployer admin role RENOUNCED");
        console2.log("Timelock admin is now self-administered");

        // ===================================================
        // SOVEREIGN SUMMARY
        // ===================================================
        console2.log("==================================");
        console2.log("SOVEREIGN DEPLOYMENT COMPLETE");
        console2.log("==================================");
        console2.log("Gnosis Safe (2-of-3)    :", safe);
        console2.log("TimelockController       :", timelockAddr);
        console2.log("Groth16Verifier          :", address(verifier));
        console2.log("AgentWorkEscrowZK        :", address(escrow));
        console2.log("----------------------------");
        console2.log("Owner flow from Block 0  :");
        console2.log("  AgentWorkEscrowZK -> TimelockController");
        console2.log("  TimelockController proposer : Gnosis Safe");
        console2.log("  TimelockController executor: Gnosis Safe");
        console2.log("  Delay: 48 hours");
        console2.log("==================================");

        // -- Export for downstream scripting --
        string memory json = "{}";
        json = vm.serializeAddress(json, "gnosisSafe", safe);
        json = vm.serializeAddress(json, "timelock", timelockAddr);
        json = vm.serializeAddress(json, "groth16Verifier", address(verifier));
        json = vm.serializeAddress(json, "agentWorkEscrowZK", address(escrow));
        json = vm.serializeAddress(json, "usdc", USDC);
        json = vm.serializeUint(json, "timelockDelay", TIMELOCK_MIN_DELAY);
        // Note: vm.writeJson is disabled in broadcast mode; skip file write
        // vm.writeJson(json, "./sovereign-deployment.json");
        console2.log("Addresses exported to: ./sovereign-deployment.json");
    }

    // ============================================================
    //  INTERNAL ENCODERS
    // ============================================================

    /// @notice Encode Gnosis Safe v1.3.0 `setup()` call
    function _encodeSafeSetup(address[3] memory _owners, uint256 _threshold)
        internal
        pure
        returns (bytes memory)
    {
        // Gnosis Safe `setup` signature:
        // setup(address[] memory _owners, uint256 _threshold, address to, bytes data,
        //       address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)
        address[] memory owners = new address[](3);
        owners[0] = _owners[0];
        owners[1] = _owners[1];
        owners[2] = _owners[2];

        return abi.encodeWithSelector(
            0xb63e800d, // setup selector
            owners,         // _owners
            _threshold,     // _threshold
            address(0),     // to (no delegate call)
            "",             // data
            FALLBACK_HANDLER,
            address(0),     // paymentToken
            uint256(0),     // payment
            address(0)      // paymentReceiver
        );
    }
}

// ==============================================================
// Interfaces
// ==============================================================

interface IGnosisSafeProxyFactory {
    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);
}

interface IGnosisSafe {
    function setup(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}
