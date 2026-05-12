# AgentWorkEscrow Security Notes — v0.4

## Current assumptions
- Prototype is intended for Base/Base Sepolia canonical USDC-style ERC-20, not arbitrary fee-on-transfer/rebasing tokens.
- Work/proof/dispute evidence is stored as off-chain URIs. The contract enforces URI presence/size, not semantic truth.
- Dispute resolution is centralized by the contract owner for MVP only. This is accepted for testnet, but production needs a stronger arbiter/verifier model.
- Seller payout after review is based on buyer inaction after proof submission; real production flows need stronger verifier/oracle integration.

## Implemented controls
- OpenZeppelin `EIP712` for typed-data hashing and domain separator handling.
- OpenZeppelin `SignatureChecker` for seller signatures, including EOA low-`s` enforcement and EIP-1271 smart-wallet support.
- OpenZeppelin `SafeERC20` for USDC transfers.
- OpenZeppelin `ReentrancyGuard` on token-moving entrypoints.
- OpenZeppelin `Ownable2Step` for safer admin handoff.
- Seller-signed offers bind buyer, seller, amount, work hash, work URI hash, work timeout, review period, nonce, and expiry.
- Replay protection through `usedOfferDigests`.
- Seller-side offer cancellation through `cancelOfferNonce`.
- Immutable work metadata stored on intent: `workHash` and `workURI`.
- Separate work deadline and review deadline.
- Deadline boundary made deterministic: seller proof must be before `workDeadline`; buyer refund is only after `workDeadline`.
- Buyer refund only when no proof is submitted before work deadline.
- Seller claim path after proof + expired review window.
- Buyer and seller can both open disputes.
- Dispute reason URI and proof URI required and capped to 512 bytes.
- Partial owner dispute resolution with optional platform fee on seller allocation.
- Zero-fee withdrawal rejected.
- Self-escrow rejected.
- Fee cap prevents owner from setting platform fee above 10%.
- Events emitted for creation, funding from signed offers, proof, release, refund, dispute, resolution, fee updates, and withdrawals.

## Fixed from v0.3 independent review
- Replaced custom `_recover()` with OpenZeppelin `SignatureChecker`.
- Replaced cached custom `DOMAIN_SEPARATOR` with OpenZeppelin `EIP712`.
- Added EIP-1271-compatible signature validation.
- Added seller offer nonce cancellation.
- Fixed exact-deadline race between `submitProof` and `refund`.
- Added tests for high-`s` malleable signatures, cancelled nonces, and deadline boundary behavior.
- Replaced custom ERC-20 wrappers with OpenZeppelin `SafeERC20`.
- Replaced custom reentrancy/ownership logic with OpenZeppelin primitives.

## Remaining known MVP weaknesses
- Owner is still trusted arbitrator in disputes.
- Either party can dispute and freeze normal lifecycle until owner resolution. This is acceptable for testnet but needs better production design.
- No verifier/oracle/Verity receipt integration yet.
- No on-chain reputation registry.
- No emergency recovery for unrelated ERC-20 tokens.
- Deployment must use canonical USDC; arbitrary ERC-20 behavior is out of scope.

## Latest gates
- `npm run compile` → success.
- `forge test -vvv` → 18 passed, 0 failed, 0 skipped.
- `uvx --from slither-analyzer slither . --filter-paths 'lib|node_modules' --json slither-report.json` → only Low timestamp findings, accepted because the contract is deadline-based with hour/day-scale windows.

## Next pre-testnet task
- Prepare and dry-run a Base Sepolia deployment script.
- Confirm deployment inputs before broadcasting: deployer wallet/private key, Base Sepolia RPC, canonical Base Sepolia USDC address, fee recipient, and test ETH/USDC.
