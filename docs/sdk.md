# JavaScript SDK

The SDK is a small CommonJS wrapper around the deployed `AgentWorkEscrow` contract. It is meant for agents, orchestration systems, and marketplace backends that want to create/fund signed work offers without shelling out to the CLI.

## Install locally

```bash
npm install
```

## Read an escrow status

```js
const awm = require('./sdk');

async function main() {
  const deployment = awm.loadDeployment();
  const provider = awm.providerFromRpc(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
  const status = await awm.getIntentStatus({ provider, deployment, intentId: 2 });
  console.log(status);
}

main().catch(console.error);
```

## Seller: build and sign an offer

```js
const awm = require('./sdk');

async function main() {
  const deployment = awm.loadDeployment();
  const provider = awm.providerFromRpc(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
  const sellerWallet = awm.walletFromPrivateKey(process.env.SELLER_PRIVATE_KEY, provider);

  const offer = await awm.buildSignedOffer({
    sellerWallet,
    deployment,
    buyer: process.env.BUYER_ADDRESS,
    amount: '0.01',
    workURI: 'ipfs://example-work-spec',
    workHash: 'research brief for buyer',
    workTimeoutSeconds: 3600,
    reviewPeriodSeconds: 3600,
    expiresInSeconds: 3600
  });

  awm.writeJson('offers/sdk-offer.json', offer);
}

main().catch(console.error);
```

## Buyer: fund a signed offer

```js
const awm = require('./sdk');

async function main() {
  const deployment = awm.loadDeployment();
  const provider = awm.providerFromRpc(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
  const buyerWallet = awm.walletFromPrivateKey(process.env.BUYER_PRIVATE_KEY, provider);
  const offer = awm.readJson('offers/sdk-offer.json');

  const result = await awm.fundSignedOffer({ buyerWallet, deployment, offer, approve: true });
  console.log(result.intentId, result.fundTxHash);
}

main().catch(console.error);
```

## Exported helpers

- `loadDeployment`, `loadAbi`
- `providerFromRpc`, `walletFromPrivateKey`, `getContracts`
- `parseAmount`, `formatAmount`, `asBytes32`
- `offerDomain`, `offerTypes`, `offerMessage`, `signOfferWithWallet`
- `buildSignedOffer`
- `fundSignedOffer`
- `getIntentStatus`
- `waitTx`
