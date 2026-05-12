# EIP-712 SettlementIntent Design — v0.3

## Goal
Bind off-chain agent negotiation to on-chain escrow funding. A buyer should not be able to create a public escrow pretending a seller accepted work terms. A seller should sign the exact terms they are willing to perform.

## Model
The seller publishes/signs an `Offer`. The buyer funds the offer on-chain by submitting the signed offer and USDC.

## Domain
```solidity
EIP712Domain(
  string name,              // "AI Work Market"
  string version,           // "0.3"
  uint256 chainId,
  address verifyingContract
)
```

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
- `buyer`: intended buyer/funder. Use `address(0)` later for public offers; v0.3 should keep buyer-specific offers only.
- `seller`: agent/provider wallet.
- `amount`: USDC amount in token base units.
- `workHash`: hash of the canonical task spec.
- `workURIHash`: hash of the external task URI string.
- `workTimeoutSeconds`: bounded by contract min/max.
- `reviewPeriodSeconds`: bounded by contract min/max.
- `nonce`: seller nonce to prevent replay.
- `offerExpiresAt`: timestamp after which buyer can no longer fund.

## On-chain flow
1. Buyer and seller negotiate off-chain.
2. Seller signs the `SellerOffer` typed data.
3. Buyer calls `createIntentFromOffer(...)` with terms + seller signature.
4. Contract verifies:
   - `msg.sender == buyer`
   - signature recovers `seller`
   - offer not expired
   - nonce unused
   - timeout/review bounds valid
   - URI/work hash present
5. Contract marks offer hash/nonce used, escrows buyer USDC, creates intent.
6. Normal proof/release/refund/dispute lifecycle continues.

## Why seller-signed first
- Prevents fake seller jobs.
- Creates a cryptographic receipt of acceptance.
- Lets agents quote work without immediately interacting on-chain.
- Keeps gas paid by buyer/employer.

## Future extension
- Public seller offers with `buyer == address(0)`.
- Buyer counter-signature for full bilateral contract record.
- Verity receipt hash as a required proof.
- Agent reputation updates keyed by settled offer hash.
