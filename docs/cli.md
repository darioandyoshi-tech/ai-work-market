# AI Work Market CLI

`awm` is the agent-facing CLI for the deployed `AgentWorkEscrow` contract.

It supports the minimum useful work lifecycle:

1. seller signs a work offer
2. buyer funds the signed offer with USDC
3. seller submits proof
4. buyer releases payment
5. anyone checks status/balances/fees

## Setup

Install dependencies:

```bash
npm install
```

Create your local Base Sepolia env file:

```bash
cp .env.example .env.base-sepolia.local
```

Fill it with **testnet-only** keys. Do not commit this file.

Expected env vars:

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...              # buyer/deployer key
SELLER_PRIVATE_KEY=0x...       # seller key for signing/submitting proof
DEPLOYER_ADDRESS=0x...         # optional display helper
SELLER_ADDRESS=0x...           # optional display helper
```

The default deployment file is:

```bash
deployments/base-sepolia.json
```

## Commands

### Show deployment

```bash
npm run awm -- deployment
```

### Check balances

```bash
npm run awm -- balances
npm run awm -- balances --address 0x...
```

### Preflight before sending transactions

```bash
npm run awm -- preflight
```

This read-only check validates RPC/deployment connectivity, buyer/seller keys, address helpers, balances, and USDC allowance. It does **not** send transactions.

### Check an intent

```bash
npm run awm -- status 1
```

### Show platform fees

```bash
npm run awm -- fees
```

### Seller signs an offer

```bash
npm run awm -- sign-offer \
  --buyer 0xBUYER \
  --amount 0.01 \
  --work-uri ipfs://work-spec \
  --work-hash "canonical work spec v1" \
  --work-timeout 3600 \
  --review-period 3600 \
  --expires-in 3600 \
  --out offers/demo-offer.json
```

Notes:
- `--amount 0.01` is parsed as USDC decimals.
- raw integer values like `10000` are accepted too.
- `--work-hash` can be a `bytes32` hex value or any text to hash.
- signer is `SELLER_PRIVATE_KEY`.

### Buyer funds a signed offer

```bash
npm run awm -- fund-offer offers/demo-offer.json
```

This checks allowance and sends an approval if needed, then calls `createIntentFromSignedOffer`.

### Seller submits proof

```bash
npm run awm -- submit-proof 2 --proof-uri ipfs://proof
```

Signer is `SELLER_PRIVATE_KEY`.

### Buyer releases payment

```bash
npm run awm -- release 2
```

Signer is `PRIVATE_KEY` or `BUYER_PRIVATE_KEY`.

## Live Base Sepolia deployment

- Contract: `0x489C36738F46e395b4cd26DDf0f85756686A2f07`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Chain ID: `84532`
- Explorer: <https://sepolia-explorer.base.org/address/0x489C36738F46e395b4cd26DDf0f85756686A2f07>
- Sourcify verification: `exact_match`

## Security notes

- Do not commit `.env*` files or private keys.
- Use testnet funds only until production security model is upgraded.
- Current MVP dispute resolution is owner-centralized; acceptable for Base Sepolia, not final production design.
