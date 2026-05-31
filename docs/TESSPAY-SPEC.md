# TESSPAY SPECIFICATION
## Verify-then-Pay Protocol

### Overview
TESSPAY is the primary payment workflow in AI Work Market that enables automatic payment upon valid zero-knowledge proof submission, creating a true verify-then-pay atomic transaction.

### Core Concept
The fundamental innovation of TESSPAY is replacing the two-step process (Submit Proof → Manual Release) with a single atomic operation: Submit Valid Proof → Automatic Payment.

### Technical Implementation

#### Contract Changes
1. **Modified Contract**: `contracts/AgentWorkEscrowZK.sol` (v0.7-tesspay)
   - Added `_tryAutoPayWithZK()`: Internal function that verifies ZK proof and triggers payment if valid
   - Updated `submitProofWithZK()`: Modified to call `_tryAutoPayWithZK()` after proof submission
   - Added `TessPay` event: Emitted when automatic payment occurs
   - Maintained backward compatibility with `release()` and `claimAfterReview()` functions

2. **New Contract**: `contracts/IZKEmailVerifier.sol`
   - Interface for ZK-Email verifier contracts
   - Standard interface for verification contract interactions

3. **Supporting Contract**: `contracts/RecoveryHub.sol`
   - Phase 1 (Surety Layer) implementation
   - Multi-Modal Recovery (MMR) framework
   - ZK-Email verification for non-custodial identity reclamation

#### Workflow Comparison

**Legacy Workflow (Now Fallback):**
1. Buyer funds escrow with USDC
2. Seller performs work and submits proof
3. Buyer manually reviews and calls `release()` 
4. Payment sent to seller, fee accrues to platform
5. Two separate transactions required

**TESSPAY Workflow (Primary):**
1. Buyer funds escrow with USDC
2. Seller performs work and generates ZK proof
3. Seller submits work + ZK proof via `submitProofWithZK()`
4. Contract automatically verifies proof
5. **If valid**: Payment sent to seller AND fee accrued to platform in SAME transaction
6. **If invalid**: Proof rejected, no state change, escrow remains funded
7. Single atomic transaction for valid proofs

#### Event Changes
- Added `TessPay(address indexed seller, address indexed buyer, uint256 amount, uint256 fee, bytes proofData)`
- Emitted when automatic payment occurs
- Provides transparency for automated payments

#### Backward Compatibility
- Original `AgentWorkEscrow.sol` contract maintained
- `release()` and `claimAfterReview()` functions preserved
- Legacy workflow available for migration period
- Deployment scripts include `--legacy` flag for original contracts

### Security Considerations

#### Reentrancy Protection
- All payment functions use `nonReentrant` modifier
- Follows Checks-Effects-Interactions pattern
- Protected by OpenZeppelin's `ReentrancyGuard`

#### Access Control
- Only contract owner can upgrade verification contract addresses
- Role-based access for recovery functions (`RECOVERY_MANAGER_ROLE`)
- Standard ERC20 approval patterns for USDC handling

#### Economic Security
- Platform fee automatically calculated and distributed
- No possibility of underpayment due to atomic verification+payout
- Slippage protection through fixed fee basis points

### Integration Points

#### CLI Interface
- New command: `awm submit-proof-and-pay` (alias for `submitProofWithZK`)
- Existing `awm release` and `awm claim` commands preserved
- Status commands automatically detect workflow type
- Balance checks reflect instantaneous payment capability

#### SDK Integration
- JavaScript SDK includes `submitProofAndPay()` method
- Automatic detection of contract version (0.7-tesspay vs legacy)
- Event listeners for `TessPay` events
- Migration helpers for legacy contract interactions

#### API/Webhooks
- Webhook events for `TessPay` transactions
- REST endpoints for submitting proofs with auto-pay option
- WebSocket subscriptions for real-time payment notifications

### Deployment Configuration

#### Environment Variables
- `VERIFICATION_CONTRACT_ADDRESS`: Address of ZK verifier contract
- `PLATFORM_FEE_BASIS_POINTS`: Fee calculation (default 10 = 0.1%)
- `MINIMUM_PROOF_COMPLEXITY`: Optional proof validation threshold

#### Network Support
- Primary: Base Sepolia (chainId: 84532)
- Test: Local Anvil fork
- Future: Base Mainnet, other EVM chains

### Testing Strategy

#### Unit Tests
- `test_tesspay_auto_payment_on_valid_zk_proof()`: Main verification test
- Test invalid proof rejection
- Test fee distribution accuracy
- Test reentrancy protection
- Test backward compatibility with legacy functions

#### Integration Tests
- Full workflow test with Anvil node
- Gas usage verification (target: < 800,000)
- Event emission verification
- State change verification

#### Security Audits
- Slither analysis: No high/medium findings
- Manual review of payment logic
- Formal verification of core invariants (in progress)

### Migration Guide

#### For Existing Users
1. No action required for existing escrows
2. New escrows can use TessPay by deploying v0.7-tesspay contracts
3. Legacy escrows continue to function normally
4. Gradual migration encouraged through improved UX

#### For Developers
1. Update contract imports to use `AgentWorkEscrowZK.sol`
2. Use `submitProofWithZK()` for new integrations
3. Monitor `TessPay` events instead of manual release events
4. Keep legacy `release()` calls as fallback for compatibility

### Future Enhancements

#### Phase 1 (Immediate)
- Add merkle tree proof support for batch verifications
- Implement proof caching to reduce gas costs
- Add event indexing for better analytics

#### Phase 2 (Near-term)
- Integrate with reputation system using TessPay success rate
- Add dispute resolution layer for edge cases
- Implement flashloan protection for high-value escrows

#### Phase 3 (Long-term)
- Cross-chain TESSPAY via LayerZero or similar
- Privacy-preserving proofs with zk-SNARKs
- Programmable fee structures based on reputation

### Success Metrics

#### Primary
- Percentage of transactions using TESSPAY workflow (target: >80% within 3 months)
- Average gas cost per successful TESSPAY transaction
- User satisfaction with automated payments

#### Secondary
- Reduction in support tickets related to payment releases
- Increase in transaction volume due to improved UX
- Developer adoption of TESSPAY in integrations

### FAQ

**Q: What happens if the ZK proof is invalid?**  
A: The transaction reverts, no state changes occur, and the escrow remains funded. The seller can submit a new proof.

**Q: Can I still use the manual release process?**  
A: Yes, the legacy workflow is preserved for backward compatibility and complex cases requiring human judgment.

**Q: How is the platform fee calculated?**  
A: Fee = (amount × BASIS_POINTS) / 10,000, automatically distributed in the same transaction as the seller payment.

**Q: Does TESSPAY work with all types of proofs?**  
A: Currently designed for ZK-SNARK proofs from the integrated verifier. Extensible to other proof types via interface updates.

**Q: Is there a delay in payment processing?**  
A: No, payment occurs in the same block as the proof submission, typically within 1-2 seconds on Base Sepolia.

### References
- EIP-712: Structured data hashing and signing
- ERC-20: Token standard for USDC interactions
- EIP-1271: Smart contract signature validation
- Zeplin Improvement Proposals (ZIPs): For ZK verification standards