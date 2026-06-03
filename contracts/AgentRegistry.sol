// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice Enhanced registry for AWM agents — reputation, profile, verification, earnings.
/// @dev    v2 fixes:
///         - OZ import paths (was `../ERC20.sol` which doesn't exist in this repo)
///         - `agentProfiles.length` is illegal on a mapping — replaced with a counter (`agentCount`)
/// @custom:version 2.0
contract AgentRegistry is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public reputationToken;

    struct AgentProfile {
        address agent;
        string metadataURI;
        uint256 reputationScore;
        uint256 completedJobs;
        uint256 successfulJobs;
        uint256 disputedJobs;
        uint256 totalEarned;
        bool isVerified;
        uint256 registeredAt;
        uint256 lastUpdated;
    }

    mapping(address => uint256) public agentToTokenId;
    mapping(uint256 => AgentProfile) public agentProfiles;
    /// @notice Total registered agents — replaces illegal `mapping.length` access in v1.
    uint256 public agentCount;

    event AgentRegistered(address indexed agent, uint256 indexed tokenId, string metadataURI);
    event ProfileUpdated(uint256 indexed tokenId, string metadataURI);
    event JobCompleted(uint256 indexed tokenId, bool success, uint256 amountEarned);
    event VerificationStatusChanged(uint256 indexed tokenId, bool isVerified);
    event ReputationUpdated(uint256 indexed tokenId, uint256 newScore);

    modifier onlyRegisteredAgent() {
        require(agentToTokenId[msg.sender] != 0, "Agent not registered");
        _;
    }

    constructor(address _reputationToken) Ownable(msg.sender) {
        if (_reputationToken != address(0)) {
            reputationToken = IERC20(_reputationToken);
        }
    }

    function register(string calldata metadataURI) external returns (uint256) {
        require(msg.sender != address(0), "Zero address");
        require(agentToTokenId[msg.sender] == 0, "Already registered");
        require(bytes(metadataURI).length > 0, "Empty metadata");

        agentCount += 1;
        uint256 tokenId = agentCount;
        agentToTokenId[msg.sender] = tokenId;

        agentProfiles[tokenId] = AgentProfile({
            agent: msg.sender,
            metadataURI: metadataURI,
            reputationScore: 0,
            completedJobs: 0,
            successfulJobs: 0,
            disputedJobs: 0,
            totalEarned: 0,
            isVerified: false,
            registeredAt: block.timestamp,
            lastUpdated: block.timestamp
        });

        emit AgentRegistered(msg.sender, tokenId, metadataURI);
        return tokenId;
    }

    function updateProfile(string calldata metadataURI) external onlyRegisteredAgent {
        uint256 tokenId = agentToTokenId[msg.sender];
        require(bytes(metadataURI).length > 0, "Empty metadata");

        agentProfiles[tokenId].metadataURI = metadataURI;
        agentProfiles[tokenId].lastUpdated = block.timestamp;

        emit ProfileUpdated(tokenId, metadataURI);
    }

    function recordJobCompletion(bool success, uint256 amountEarned) external onlyRegisteredAgent {
        uint256 tokenId = agentToTokenId[msg.sender];
        AgentProfile storage profile = agentProfiles[tokenId];

        profile.completedJobs += 1;
        if (success) {
            profile.successfulJobs += 1;
        } else {
            profile.disputedJobs += 1;
        }
        profile.totalEarned += amountEarned;
        profile.lastUpdated = block.timestamp;

        // Simple success-rate based reputation (0-1000)
        if (profile.completedJobs > 0) {
            profile.reputationScore = (profile.successfulJobs * 1000) / profile.completedJobs;
        }

        emit JobCompleted(tokenId, success, amountEarned);
        emit ReputationUpdated(tokenId, profile.reputationScore);
    }

    function setVerificationStatus(uint256 tokenId, bool isVerified) external onlyOwner {
        require(tokenId > 0 && tokenId <= agentCount, "Invalid token ID");
        agentProfiles[tokenId].isVerified = isVerified;
        agentProfiles[tokenId].lastUpdated = block.timestamp;

        emit VerificationStatusChanged(tokenId, isVerified);
    }

    function getAgentProfileByAddress(address agent)
        external
        view
        returns (uint256 tokenId, AgentProfile memory profile)
    {
        tokenId = agentToTokenId[agent];
        if (tokenId == 0) {
            return (0, AgentProfile(address(0), "", 0, 0, 0, 0, 0, false, 0, 0));
        }
        return (tokenId, agentProfiles[tokenId]);
    }

    function getAllAgentIds() external view returns (uint256[] memory) {
        uint256 count = agentCount;
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = i + 1;
        }
        return ids;
    }
}
