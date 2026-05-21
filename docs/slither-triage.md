# Slither Static Analysis Triage

## Latest run
Command:

```bash
uvx --from slither-analyzer slither . --filter-paths 'lib|node_modules' --json slither-report.json
```

## Result summary after v0.4
- High findings: 0
- Medium findings: 0
- Low findings: 4 timestamp warnings
- Informational findings: 0 after filtering `lib|node_modules`

## Findings accepted / rationale

### Low: block.timestamp comparisons
Slither reports timestamp comparisons in:
- `createIntentFromSignedOffer`: offer expiry.
- `submitProof`: work deadline.
- `claimAfterReview`: review deadline.
- `refund`: work deadline.

The escrow is deadline-based by design. Small sequencer timestamp drift is acceptable for hour/day-scale market windows. Minimum timeout/review period is 1 hour.

The exact `workDeadline` boundary is now deterministic:
- Seller proof must be submitted strictly before `workDeadline`.
- Buyer refund is available only strictly after `workDeadline`.

## Fixed from v0.3 review
- Removed custom ECDSA recovery/assembly; replaced with OpenZeppelin `SignatureChecker`.
- Removed custom cached EIP-712 domain separator; replaced with OpenZeppelin `EIP712`.
- Removed custom low-level ERC-20 wrappers; replaced with OpenZeppelin `SafeERC20`.
- Replaced custom reentrancy guard and ownership transfer with OpenZeppelin `ReentrancyGuard` and `Ownable2Step`.
- Added seller offer nonce cancellation.
- Added explicit lifecycle events.

## Remaining pre-testnet gate
- Dry-run deployment script with environment-provided addresses.
- Confirm canonical Base Sepolia USDC and fee recipient before any broadcast.
