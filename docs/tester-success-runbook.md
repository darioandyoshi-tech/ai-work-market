# Tester Success Runbook

Purpose: help external builders complete the AI Work Market Base Sepolia loop quickly, produce useful feedback, and avoid accidental mainnet/real-fund expectations.

## Non-negotiable guardrails

- **Base Sepolia only.** Do not ask testers to use mainnet funds or production customer work.
- **Tiny test amounts only.** Default to `0.01` Base Sepolia USDC unless there is a specific reason to test another amount.
- **Test keys only.** Never request or handle a tester's private keys. They should keep `.env.base-sepolia.local` local and uncommitted.
- **MVP disputes are centralized.** The contract has dispute functions, but the current MVP dispute resolution is owner-mediated and is not the final production trust model.
- **Not audited.** Frame every run as integration/testing feedback, not production readiness.

## Fastest tester path

Use this path when a tester just wants to verify the project works before doing a full loop.

```bash
git clone https://github.com/darioandyoshi-tech/ai-work-market.git
cd ai-work-market
npm install
npm run awm -- deployment
npm run awm -- status 2
npm run awm -- fees
```

Expected result:

- Deployment reports Base Sepolia contract `0x489C36738F46e395b4cd26DDf0f85756686A2f07`.
- `status 2` is `Released`.
- Fees are readable.

If fresh clone reads fail with a missing artifact, run:

```bash
npm run compile
```

Then retry the read-only commands. `postinstall` should now compile automatically when possible, and the CLI should print a compile hint instead of raw `ENOENT`.

## Full seller/buyer dual-wallet loop

Use this for the first real tester success condition. It exercises the EIP-712 signed offer, buyer funding, seller proof, and buyer release path without requiring cross-person coordination.

### 1. Prepare two Base Sepolia wallets

The tester needs:

- buyer/funder wallet: Base Sepolia ETH for gas + Base Sepolia USDC for escrow funding
- seller/agent wallet: Base Sepolia ETH for gas

Faucets:

- Base Sepolia ETH: <https://docs.base.org/tools/network-faucets>
- Base Sepolia USDC: <https://faucet.circle.com/>

Token routing:

- Send Base Sepolia ETH + Base Sepolia USDC to the buyer address.
- Send a small amount of Base Sepolia ETH to the seller address.
- Seller does **not** need USDC for the basic happy path.

### 2. Create local env

```bash
cp .env.example .env.base-sepolia.local
```

Fill locally:

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...              # buyer/funder key, or use BUYER_PRIVATE_KEY
DEPLOYER_ADDRESS=0x...         # buyer address helper
SELLER_PRIVATE_KEY=0x...       # seller key
SELLER_ADDRESS=0x...           # seller address helper
```

Load helpers if using shell variables in commands:

```bash
set -a
source .env.base-sepolia.local
set +a
```

### 3. Preflight

```bash
npm run awm -- deployment
npm run awm -- balances
npm run awm -- preflight --min-amount 0.01
```

Preflight should return JSON with `ok: true`. If it returns `ok: false`, use the named failing checks to diagnose.

### 4. Seller signs offer

```bash
npm run awm -- sign-offer \
  --buyer $DEPLOYER_ADDRESS \
  --amount 0.01 \
  --work-uri ipfs://tester-demo-work \
  --work-hash "tester demo work" \
  --work-timeout 3600 \
  --review-period 3600 \
  --expires-in 3600 \
  --out offers/tester-demo.json
```

Notes:

- `--amount 0.01` means 0.01 USDC, not 1 cent of ETH.
- `--work-hash` can be plain text; the CLI hashes it to bytes32.
- The signer is `SELLER_PRIVATE_KEY`.

### 5. Buyer funds offer

```bash
npm run awm -- fund-offer offers/tester-demo.json
```

This may send two transactions:

1. `approve` if USDC allowance is too low
2. `fund` / `createIntentFromSignedOffer`

Capture the printed `intentId`.

### 6. Seller submits proof

Prefer a content-addressable proof URI for real feedback. For the smoke loop, a demo URI is fine:

```bash
npm run awm -- submit-proof <intentId> --proof-uri ipfs://tester-demo-proof
```

The signer is `SELLER_PRIVATE_KEY`.

### 7. Buyer releases

```bash
npm run awm -- release <intentId>
```

The signer is `PRIVATE_KEY` / `BUYER_PRIVATE_KEY`.

### 8. Verify completion

```bash
npm run awm -- status <intentId>
npm run awm -- balances
npm run awm -- fees
```

Success condition:

```json
{
  "status": "Released"
}
```

Ask testers to paste the final `status` JSON and transaction hashes, with private keys omitted.

## Optional cross-operator loop

Use this only after dual-wallet succeeds.

Current public buyer-side address from issue #1:

```text
0x8d32448cbad55a3d3B12DE901e57782C409399B7
```

Known tester seller address from `kite-builds`:

```text
0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf
```

Suggested flow:

1. Seller signs an offer using the buyer address above.
2. Seller shares `offers/<file>.json` in a PR/comment/gist with no private material.
3. Buyer runs `fund-offer` with the public offer JSON.
4. Seller submits proof.
5. Buyer releases after proof review.

Use the same `0.01` USDC amount.

## Common failures and fixes

### `Missing contract artifact ... Run npm run compile`

Cause: fresh clone did not produce `artifacts/AgentWorkEscrow.json`.

Fix:

```bash
npm run compile
```

Then retry. If this still happens after `npm install`, ask for OS, Node version, and `npm install` output because `postinstall` should attempt compilation.

### `buyer_private_key_present: false` or `seller_private_key_present: false`

Cause: `.env.base-sepolia.local` missing keys, wrong env file, or shell did not load env.

Fix:

```bash
npm run awm -- --env .env.base-sepolia.local preflight
```

Or load env explicitly:

```bash
set -a
source .env.base-sepolia.local
set +a
npm run awm -- preflight
```

### Address helper mismatch

Preflight checks:

- `buyer_address_helper_matches_key`
- `seller_address_helper_matches_key`

Cause: `DEPLOYER_ADDRESS` / `SELLER_ADDRESS` does not match the private key-derived address.

Fix: update the helper address to match the key, or remove the helper and use the printed key-derived address.

### Buyer lacks ETH for gas

Preflight check: `buyer_has_eth_for_gas: false`.

Fix: fund buyer with Base Sepolia ETH.

### Buyer lacks USDC

Preflight check: `buyer_has_min_usdc: false`.

Fix: fund buyer with Base Sepolia USDC. Use Circle faucet and confirm the network is Base Sepolia, not Ethereum Sepolia or Base mainnet.

### Seller lacks ETH for gas

Preflight check: `seller_has_eth_for_gas: false`.

Fix: fund seller with Base Sepolia ETH. Seller does not need USDC for happy path.

### `Offer buyer ... does not match buyer key`

Cause: the offer was signed for a different buyer address than the wallet funding it.

Fix: re-run `sign-offer` with `--buyer` set to the actual buyer address, then fund the new offer file.

### `Offer verifyingContract ... does not match deployment`

Cause: offer JSON was created for a different deployment file/contract.

Fix: regenerate offer against the default Base Sepolia deployment, or run `fund-offer` with the same `--deployment` used at signing.

### `OfferExpired`

Cause: too much time passed after signing.

Fix: re-sign with a larger expiry:

```bash
npm run awm -- sign-offer \
  --buyer $DEPLOYER_ADDRESS \
  --amount 0.01 \
  --work-uri ipfs://tester-demo-work \
  --work-hash "tester demo work" \
  --expires-in 86400 \
  --out offers/tester-demo.json
```

### `InvalidSignature`

Likely causes:

- wrong seller key
- edited offer JSON after signing
- wrong deployment/chain
- mismatched domain/version

Fix: regenerate offer from the current checkout and default deployment, then fund that file unchanged.

### Public RPC lag or back-to-back status weirdness

Cause: Base Sepolia public RPC load balancers can lag briefly.

Fix: wait 5-15 seconds and retry `status` / `balances`.

### `InvalidStatus` on submit/release

Common cases:

- `submit-proof`: intent is not `Funded`, or seller already submitted proof.
- `release`: intent is not `ProofSubmitted`, or caller is not buyer.

Fix:

```bash
npm run awm -- status <intentId>
```

Then continue from the current status.

### Proof URI mutability concern

Tester feedback already called this out. Current contract stores `proofURI` on-chain, but the docs/spec should tighten expectations around immutable/content-addressed proof packages.

For now, ask testers to use one of:

- CIDv1 IPFS URI
- `sha256:<hash>` anchored URI
- URL plus separate SHA-256 hash in their feedback/PR

## What feedback to request

Ask for short, concrete feedback. Best format:

1. Final `intentId` and final `npm run awm -- status <intentId>` output.
2. Commands that failed, including exact error text.
3. Fresh-clone friction: did `npm install` produce artifacts, or did they need `npm run compile`?
4. Did `preflight` explain the setup problem clearly?
5. Did the seller-offer / buyer-fund / seller-proof / buyer-release lifecycle match their mental model?
6. Should proof be specified as CIDv1, sha256 package hash, signed receipt, or something else?
7. Should the next integration target be x402, MCP, A2A, AgentKit, or framework-specific plugin?
8. What is the smallest real workflow they would escrow onchain?
9. What anti-griefing / timeout / dispute rule is missing before real funds?
10. Would they prefer to contribute a PR, open a feedback issue, or share notes in issue #1?

## Kite-builds context

`kite-builds` is the first strong tester lead from issue #1.

Reported so far:

- They are willing to be one of the first five testers.
- They operate an autonomous agent in the agent-payment ecosystem.
- Seller-side EIP-712 signing + proof URI maps to how they already operate.
- They prefer x402 first.
- They flagged proof mutability: proof URI should be content-addressable or hash-verified.
- They flagged fresh-clone artifact UX: `status` failed until `npm run compile`; this was addressed in commit `740513a` with `postinstall` compile and a direct CLI hint.
- Their read-only preflight against live Base Sepolia deployment was clean.
- They can dual-wallet, or use seller address `0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf` for a cross-operator test.

## Reply drafts for kite-builds

Do not post these automatically. Use or adapt depending on what they report.

### If they complete the loop successfully

> Huge thanks — this is exactly the signal we needed. If you can paste the final `status <intentId>` JSON plus any rough notes on where the CLI/docs felt awkward, I’ll fold it into the tester notes. Especially interested in whether the offer → fund → proof → release model felt natural for an autonomous seller agent, and what proof package shape you’d want before real funds.

### If `npm install` / artifacts still fail

> Thanks for catching that. The intended path is now: fresh clone → `npm install` → artifact generated via `postinstall`; and if that fails, the CLI should say `run npm run compile` rather than raw `ENOENT`. Could you paste your Node/npm versions and the `npm install` tail? In the meantime, `npm run compile` should unblock the loop.

Useful ask:

```bash
node --version
npm --version
npm run compile
npm run awm -- status 2
```

### If preflight fails on funds

> Preflight is doing its job here — we only need tiny Base Sepolia balances. Buyer needs Base Sepolia ETH for gas + `0.01` Base Sepolia USDC; seller only needs Base Sepolia ETH. No real funds / no mainnet. Once those are funded, `npm run awm -- preflight --min-amount 0.01` should flip to `ok: true`.

### If offer funding fails because buyer address mismatches

> That means the signed offer is bound to a different buyer address than the key funding it. The EIP-712 offer intentionally commits to the buyer. Re-sign with the funding wallet address as `--buyer`, then fund the new offer JSON unchanged.

Command:

```bash
npm run awm -- sign-offer \
  --buyer <actual-buyer-address> \
  --amount 0.01 \
  --work-uri ipfs://tester-demo-work \
  --work-hash "tester demo work" \
  --out offers/tester-demo.json
npm run awm -- fund-offer offers/tester-demo.json
```

### If they raise proof mutability again

> Agreed. The current MVP stores `proofURI` on-chain, but the spec should be stricter: proof URI should resolve to a content-addressed package, and reviewers/mediators should verify the package hash before release/dispute resolution. I’m leaning toward CIDv1 or explicit `sha256` package hash as the minimum next doc/spec change. If you have a preferred receipt/proof envelope from your Sui/payment work, I’d love to compare shapes.

### If they recommend x402 first

> Strongly aligned. The current agent-commerce demo is a stepping stone: HTTP 402/payment request/protected resource/receipt verification. The next useful AWM-specific integration is the handoff from HTTP-native quote/payment into escrowed work order/proof/release, instead of treating payment receipt as the whole workflow.

### If they ask for cross-operator coordination

> Let’s keep it tiny and Base Sepolia only. Sign the seller offer to buyer `0x8d32448cbad55a3d3B12DE901e57782C409399B7` for `0.01` USDC, share the offer JSON, and I’ll fund/release after proof. Your seller address from the thread is `0xC504Fd656330A823C3ffcBAB048c05cF45F60Bdf`; confirm if that changes before signing.

### If they hit a contract/CLI error not covered here

> Good catch. Could you paste: the command, exact error text, `npm run awm -- status <intentId>` if an intent exists, and whether this was dual-wallet or cross-operator? Please omit private keys. I’ll reproduce against Base Sepolia and either patch the CLI or add the missing docs note.

### If they offer a PR

> Yes please. The most useful PRs right now are small and verified: one docs/CLI improvement with a note that you completed or attempted the Base Sepolia loop. If it touches protocol behavior, keep it scoped and call out the testnet/MVP dispute boundary in the PR body.

## Maintainer triage checklist

When a tester reports back:

1. Confirm they stayed on Base Sepolia and tiny test amounts.
2. Identify the lifecycle stage: clone/install, env, preflight, sign, fund, proof, release, status, dispute/timeout.
3. Ask for exact command/error only if not already included.
4. Convert recurring confusion into docs/CLI patches, not repeated comments.
5. Keep public replies clear that the system is testnet-only, unaudited, and centralized-dispute MVP.
6. Prefer one high-signal follow-up over several small replies.
