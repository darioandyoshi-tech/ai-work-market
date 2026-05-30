// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {IZKEmailVerifier} from "./IZKEmailVerifier.sol";

/**
 * @title RecoveryHub
 * @notice Implementation of Phase 1 (Surety Layer) for AWM.
 * @dev Provides Multi-Modal Recovery (MMR) and ZK-Email verification for account reclamation.
 * This contract acts as a "Surety Layer" that allows agents to recover control over their 
 * identities/assets without relying on a central custodian.
 */
contract RecoveryHub is ReentrancyGuard, AccessControl, Ownable {
    using SafeERC20 for IERC20;

    bytes32 public constant RECOVERY_MANAGER_ROLE = keccak256("RECOVERY_MANAGER_ROLE");
    bytes32 public constant ZK_VERIFIER_ROLE = keccak256("ZK_VERIFIER_ROLE");

    enum RecoveryMode { 
        EmailZK,       // ZK-Email based reclamation
        SocialGuard,   // Multi-sig / Social recovery (future)
        TimedVault    // Timelock recovery (future)
    }

    struct RecoveryProfile {
        address currentOwner;
        string hashedEmail;      // Hash of the email address for ZK-verification
        uint256 recoveryWindow;  // Time before a recovery request is finalized
        bool isRecoveryActive;
        uint256 recoveryStartedAt;
        address pendingNewOwner;
    }

    mapping(address => RecoveryProfile) public profiles;
    IERC20 public immutable usdc;
    
    // Address of the ZK Email Verifier contract
    IZKEmailVerifier public zkEmailVerifier;

    event RecoveryInitiated(address indexed account, RecoveryMode mode, address pendingOwner);
    event RecoveryCompleted(address indexed account, address indexed newOwner);
    event RecoveryCancelled(address indexed account);
    event ZKEmailVerified(address indexed account, bytes32 emailHash);

    error RecoveryNotActive();
    error WindowNotExpired();
    error InvalidZKProof();
    error NotAuthorized();
    error InvalidProfile();

    constructor(address usdc_, address initialOwner, address zkEmailVerifier_) Ownable(initialOwner) {
        usdc = IERC20(usdc_);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        // Grant the RECOVERY_MANAGER_ROLE to the initial owner as well
        _grantRole(RECOVERY_MANAGER_ROLE, initialOwner);
        zkEmailVerifier = IZKEmailVerifier(zkEmailVerifier_);
    }

    /**
     * @notice Registers a recovery profile for an account.
     * @param account The account to protect.
     * @param emailHash The hash of the email to be used for ZK-Email verification.
     */
    function registerProfile(address account, string calldata emailHash) external {
        // In a real scenario, only the current owner should be able to register/update.
        // For simplicity here, we assume the account holder calls this.
        if (msg.sender != account) revert NotAuthorized();
        
        profiles[account] = RecoveryProfile({
            currentOwner: account,
            hashedEmail: emailHash,
            recoveryWindow: 7 days, // Default security window
            isRecoveryActive: false,
            recoveryStartedAt: 0,
            pendingNewOwner: address(0)
        });
    }

    /**
     * @notice Initiates a recovery process using ZK-Email.
     * @dev The ZK proof is verified off-chain or by a dedicated verifier contract.
     * @param account The account being recovered.
     * @param newOwner The new address to take over.
     * @param zkProof Proof that the user controls the email associated with the profile.
     */
    function initiateZKRecovery(
        address account, 
        address newOwner, 
        bytes calldata zkProof
    ) external nonReentrant {
        // Only accounts with RECOVERY_MANAGER_ROLE can initiate recovery
        if (!hasRole(RECOVERY_MANAGER_ROLE, msg.sender)) {
            revert NotAuthorized();
        }
        RecoveryProfile storage profile = profiles[account];
        if (profile.currentOwner == address(0)) revert InvalidProfile();

        // Verify ZK-Email proof using the verifier contract
        if (!zkEmailVerifier.verifyEmailProof(keccak256(abi.encodePacked(profile.hashedEmail)), zkProof)) 
            revert InvalidZKProof();

        profile.isRecoveryActive = true;
        profile.recoveryStartedAt = block.timestamp;
        profile.pendingNewOwner = newOwner;

        emit RecoveryInitiated(account, RecoveryMode.EmailZK, newOwner);
    }

    /**
     * @notice Finalizes the recovery after the security window has passed.
     * @param account The account to finalize.
     */
    function finalizeRecovery(address account) external nonReentrant {
        // Only accounts with RECOVERY_MANAGER_ROLE can finalize recovery
        if (!hasRole(RECOVERY_MANAGER_ROLE, msg.sender)) {
            revert NotAuthorized();
        }
        RecoveryProfile storage profile = profiles[account];
        if (!profile.isRecoveryActive) revert RecoveryNotActive();
        if (block.timestamp < profile.recoveryStartedAt + profile.recoveryWindow) revert WindowNotExpired();

        address newOwner = profile.pendingNewOwner;
        profile.currentOwner = newOwner;
        profile.isRecoveryActive = false;
        profile.pendingNewOwner = address(0);

        emit RecoveryCompleted(account, newOwner);
    }

    /**
     * @notice Allows the original owner to cancel a recovery request if they regain access.
     */
    function cancelRecovery(address account) external {
        RecoveryProfile storage profile = profiles[account];
        if (msg.sender != profile.currentOwner) revert NotAuthorized();
        
        profile.isRecoveryActive = false;
        profile.pendingNewOwner = address(0);
        
        emit RecoveryCancelled(account);
    }

    // Integration with AgentWorkEscrow would involve RecoveryHub being an authorized 
    // resolver or have the ability to update the buyer/seller addresses in Intents.
}