# Multisig Governance Setup for AWM

This document outlines the implementation plan for Phase 1 of the AWM governance roadmap: implementing multi-sig admin control to replace single-owner control.

## Current State
The AWM contracts currently use `Ownable2Step` from OpenZeppellent, which provides:
- Single owner control
- Two-step ownership transfer process (to prevent accidental transfers)
- Basic access control via `onlyOwner` modifier

## Target State (Phase 1)
Replace single ownership with Gnosis Safe multi-sig wallet control:
- 2-of-3 multi-sig wallet (can be adjusted based on community preference)
- All administrative functions require multi-sig approval
- Maintain security while reducing single point of failure
- Clear path for evolution to more complex governance in later phases

## Implementation Plan

### 1. Administrative Functions to Protect
Identify all functions that should require multi-sig approval:

#### From `AccessControl.sol` (inherited by contracts):
- `renounceOwnership()` - Already disabled in our contracts (we renounced it)
- `transferOwnership(address newOwner)` - To be replaced
- OnlyOwner functions that should remain but with multi-sig:
  - `updateFeeRecipient(address newRecipient)`
  - `updateFeeBps(uint16 newFeeBps)` 
  - `pause()` / `unpause()` (if we add pausing)
  - Any future admin-only functions

#### Contract-specific admin functions:
- In `AgentWorkEscrow.sol` and `AgentWorkEscrowZK.sol`:
  - Any functions marked `onlyOwner`
  - Constructor parameters that might need updating
  - Emergency functions if added

### 2. Replacement Strategy
Replace `Ownable2Step` with a minimal multi-sig wrapper:

#### Option A: Direct Gnosis Safe Integration
- Use Gnosis Safe SDK to interact with the multi-sig
- Contract calls would need to verify transactions are signed by sufficient owners
- More complex but most secure

#### Option B: Minimal Proxy Approach (Recommended for Phase 1)
- Keep `Ownable2Step` but change the owner to be a Gnosis Safe address
- All admin functions remain `onlyOwner` but now the owner is the multi-sig
- Multi-sig must approve any transaction that calls these functions
- Simpler to implement and audit
- Clear upgrade path to more complex governance

#### Option C: Intermediate Multi-sig Wrapper
- Create a simple access control contract that checks signatures
- More flexible than Option B but simpler than Option A
- Good middle ground

**Recommendation**: Start with Option B for Phase 1, as it:
1. Requires minimal changes to existing contracts
2. Is easy to audit and understand
3. Provides immediate security improvement
4. Has clear path to Phase 2 (adding voting mechanisms)
5. Uses battle-tested Gnosis Safe infrastructure

### 3. Implementation Steps

#### Step 1: Deploy Gnosis Safe
- Deploy a Gnosis Safe singleton (via Gnosis Safe protocol)
- Or use the Gnosis Safe factory to create a new safe
- Configure as 2-of-3 multi-sig with trusted initial owners
  - Initial owners could be: Core dev 1, Core dev 2, Trusted community member

#### Step 2: Transfer Ownership
- Use the `transferOwnership` function (before renouncing) to transfer to the Gnosis Safe address
- This requires the current owner to execute the transfer
- After transfer, the Gnosis Safe controls the contract

#### Step 3: Update Documentation
- Clearly document the Gnosis Safe address
- Explain the 2-of-3 threshold
- Provide instructions for how to submit transactions through the Safe

#### Step 4: Add Interaction Guidelines
- Document how developers/users should interact with the multi-sig
- Explain the transaction submission process
- Provide examples of common administrative actions
- Note any gas considerations for multi-sig transactions

### 4. Security Considerations

#### Benefits of Multi-sig:
- No single point of failure
- Requires collaboration for administrative actions
- Can survive loss of individual keys
- Transparent approval process

#### Risks to Mitigate:
- **Coordination delays**: May slow down emergency responses
  - Mitigation: Consider adding timelock with cancel capability for critical functions
- **Key management**: Proper storage and handling of multiple keys
  - Mitigation: Use hardware security modules or secure key management practices
- **Consensus requirements**: Ensuring honest participation
  - Mitigation: Start with trusted parties, evolve to token-weighted voting

### 5. Integration with Existing Contracts

#### Changes Required:
1. **Ownership Transfer**: Transfer from current owner to Gnosis Safe address
2. **Documentation Updates**: 
   - Update README with new ownership information
   - Add GOVERNANCE.md with multi-sig details
   - Update any deployment scripts
3. **No Contract Code Changes Needed** (if using Option B):
   - Existing `onlyOwner` modifiers will work with Gnosis Safe as owner
   - All admin functions remain functional but now require multi-sig approval
   - Constructor and initialization remain unchanged

#### Contract Audit Points:
- Verify no functions bypass `onlyOwner` checks
- Ensure emergency functions (if added) also respect multi-sig control
- Confirm that renouncing ownership was properly done and cannot be reversed
- Check that all administrative functions are properly protected

### 6. Transaction Examples

#### Common Administrative Actions:
1. **Updating Fee Recipient**:
   - Propose transaction: `updateFeeRecipient(newAddress)` 
   - Submit to Gnosis Safe
   - Require 2/3 owner approvals
   - Execute when threshold met

2. **Updating Fee Percentage**:
   - Propose transaction: `updateFeeBps(newBps)`
   - Follow same approval process
   - Note: Should have reasonable limits (e.g., max 10%?)

3. **Emergency Pausing** (if implemented):
   - Propose transaction: `pause()` or `unpause()`
   - Same approval process
   - Consider if timelock is needed for pausing

### 7. Evolution Path to Phase 2

This multi-sig setup prepares us for Phase 2 governance:

1. **Token-weighted Signaling**:
   - Add signaling functions that token holders can vote on
   - Multi-sig executes signals that reach threshold
   - Start with non-binding signals, evolve to binding

2. **Gradual Decentralization**:
   - Initial multi-sig: 2-of-3 (trusted parties)
   - Evolution: 3-of-5, then 4-of-7 with more diverse participants
   - Eventually: Allow token holders to propose/replace signers

3. **Integration with Gnosis Safe Modules**:
   - Gnosis Safe has modules for:
     - Weekly spend limits
     - Fallback handlers
     - Module-based execution
   - Can add gradually as needed

### 8. Implementation Timeline

**Week 1**: 
- Research and select Gnosis Safe setup approach
- Create governance wallet with test addresses
- Document current admin functions requiring protection

**Week 2**:
- Transfer ownership to Gnosis Safe on testnet
- Verify all admin functions work through multi-sig
- Test emergency procedures
- Document governance process

**Week 3**:
- Create governance documentation
- Update README and add GOVERNANCE.md
- Create example transaction guides
- Community review and feedback

**Week 4**:
- Deploy to mainnet (if testnet successful)
- Announce governance upgrade
- Begin monitoring and feedback collection

### 9. Files to Create/Update

#### New Files:
- `GOVERNANCE.md`: Detailed governance documentation
- `scripts/governance-setup.sh`: Scripts to help with setup (optional)
- `docs/multisig-guide.md`: User guide for interacting with the multi-sig

#### Updates to Existing Files:
- `README.md`: Add badges/indicators for multi-sig governance
- `CONTRIBUTING.md`: Add governance participation guidelines
- Deployment scripts: Update ownership transfer steps

### 10. Success Criteria

**Phase 1 Multi-sig Implementation Success When**:
- [ ] Gnosis Safe deployed and funded
- [ ] Contract ownership transferred to Gnosis Safe
- [ ] All administrative functions require multi-sig approval
- [ ] Emergency procedures documented and tested
- [ ] Clear documentation for users and developers
- [ ] No loss of functionality for end-users
- [ ] Improved security posture (no single point of failure)
- [ ] Ready evolution path to Phase 2 (token-weighted signaling)

This implementation provides immediate security benefits while maintaining simplicity and setting the stage for more advanced governance mechanisms in future phases.