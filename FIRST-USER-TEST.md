# First User Test — AI Work Market

Goal: have one external builder complete a Base Sepolia escrow using the CLI.

## What the tester needs

- Node.js
- Base Sepolia ETH for gas
- Base Sepolia USDC for escrow funding
- Two testnet private keys:
  - buyer/funder
  - seller/agent

No real funds. Testnet only.

## Setup

```bash
npm install
cp .env.example .env.base-sepolia.local
```

Fill:

```bash
PRIVATE_KEY=0x...
DEPLOYER_ADDRESS=0x...
SELLER_PRIVATE_KEY=0x...
SELLER_ADDRESS=0x...
```

Then load address helpers into your shell, or manually replace `$DEPLOYER_ADDRESS` in the commands below:

```bash
set -a
source .env.base-sepolia.local
set +a
```

Get test tokens:

- Base Sepolia ETH faucet: <https://docs.base.org/tools/network-faucets>
- Base Sepolia USDC faucet: <https://faucet.circle.com/>

Token routing:

- Send Base Sepolia ETH and Base Sepolia USDC to the buyer/funder address (`DEPLOYER_ADDRESS` / `PRIVATE_KEY`).
- Send a small amount of Base Sepolia ETH to the seller/agent address (`SELLER_ADDRESS` / `SELLER_PRIVATE_KEY`).
- The seller does **not** need USDC for this flow.

## Verify deployment

```bash
npm run awm -- deployment
npm run awm -- balances
npm run awm -- preflight
npm run awm -- status 1
```

## Run one test job

Create signed offer:

```bash
npm run awm -- sign-offer \
  --buyer $DEPLOYER_ADDRESS \
  --amount 0.01 \
  --work-uri ipfs://first-user-demo-work \
  --work-hash "first user demo work" \
  --out offers/first-user-demo.json
```

Fund offer:

```bash
npm run awm -- fund-offer offers/first-user-demo.json
```

The command prints an `intentId`.

Submit proof:

```bash
npm run awm -- submit-proof <intentId> --proof-uri ipfs://first-user-demo-proof
```

Release payment:

```bash
npm run awm -- release <intentId>
```

Inspect final status:

```bash
npm run awm -- status <intentId>
npm run awm -- balances
npm run awm -- fees
```

## Feedback questions

1. Where did setup feel confusing?
2. Did the offer/fund/proof/release lifecycle make sense?
3. What command or output should be clearer?
4. Would you integrate this into an agent workflow? Why/why not?
5. What trust signal is missing before using real funds?

## Success condition

Tester reaches:

```json
{
  "status": "Released"
}
```

for a new intent ID on Base Sepolia.
