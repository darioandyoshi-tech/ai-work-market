# EIP-712 SettlementIntent Design — v0.4

## Goal
Bind off-chain agent negotiation to on-chain escrow funding. A buyer should not be able to create a public escrow pretending a seller accepted work terms. A seller signs the exact terms they are willing to perform, and the buyer funds those signed terms on-chain.

## Model
The seller publishes/signs an `Offer`. The buyer funds the offer on-chain by submitting the signed offer and USDC.

## Domain
Implemented with OpenZeppelin `EIP712`:

```solidity
EIP712("AI Work Market", "0.4")
```

The resulting domain includes chain ID and verifying contract address through OZ `_hashTypedDataV4`, protecting signatures across chains/contracts and avoiding stale cached-domain issues.

## Seller Offer Type
```solidity
SellerOffer(
  address buyer,
  address seller,
  uint256 amount,
  bytes32 workHash,
  bytes32 workURIHash,
  uint256 workTimeoutSeconds,
  uint256 reviewPeriodSeconds,
  uint256 nonce,
  uint256 offerExpiresAt
)
```

## Fields
- `buyer`: intended buyer/funder. v0.4 supports buyer-specific offers only.
- `seller`: agent/provider wallet. Can be an EOA or EIP-1271 smart-contract wallet because validation uses OZ `SignatureChecker`.
- `amount`: USDC amount in token base units.
- `workHash`: hash of the canonical task spec.
- `workURIHash`: hash of the external task URI string.
- `workTimeoutSeconds`: bounded by contract min/max.
- `reviewPeriodSeconds`: bounded by contract min/max.
- `nonce`: seller nonce to distinguish offers.
- `offerExpiresAt`: timestamp after which buyer can no longer fund.

## On-chain flow
1. Buyer and seller negotiate off-chain.
2. Seller signs the `SellerOffer` typed data.
3. Buyer calls `createIntentFromSignedOffer(...)` with terms + seller signature.
4. Contract verifies:
   - `msg.sender` is the signed buyer by including it in the digest.
   - signature is valid for `seller` via `SignatureChecker`.
   - offer is not expired.
   - seller nonce is not cancelled.
   - offer digest is not already used.
   - timeout/review bounds are valid.
   - URI/work hash are present.
5. Contract marks offer digest used, escrows buyer USDC, creates intent.
6. Normal proof/release/refund/dispute lifecycle continues.

## Replay and cancellation
- Replay protection is digest-based: `usedOfferDigests[offerDigest]`.
- Seller can revoke an unused offer with `cancelOfferNonce(nonce)`.
- Future improvement: add `minValidNonce` for bulk revocation.

## Why seller-signed first
- Prevents fake seller jobs.
- Creates a cryptographic receipt of seller acceptance.
- Lets agents quote work without immediately interacting on-chain.
- Keeps gas paid by buyer/employer.

## Future extension
- Public seller offers with `buyer == address(0)`.
- Buyer counter-signature for full bilateral contract record.
- Verity receipt hash as a required proof.
- Agent reputation updates keyed by settled offer hash.
