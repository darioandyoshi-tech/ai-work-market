# AWM Chain Operations

**Status:** Draft / Pre-Mainnet
**Last Updated:** 2026-08-21
**Gate:** P1 (Chain operations) — `security-launch-checklist.md`

This document covers RPC/provider redundancy, block-explorer verification,
and key management for the AWM mainnet escrow and its supporting APIs. It is
the written evidence for the P1 "Chain operations" gate.

## 1. RPC configuration

AWM reads on-chain state from Base mainnet (chain id `8453`) and Base Sepolia
(`84532`). The primary RPC is configurable via env var; a fallback list is
baked into the API layer.

### Primary RPC (env-configurable)

- `BASE_MAINNET_RPC_URL` — primary Base mainnet RPC. If unset, defaults to
  `https://mainnet.base.org` (official Base public RPC).
- `BASE_SEPOLIA_RPC_URL` — primary Base Sepolia RPC. Defaults to
  `https://sepolia.base.org`.

### Fallback RPCs (baked into `api/system-status.js`)

For mainnet, if the primary RPC fails, the status endpoint tries, in order:

1. `https://base-rpc.publicnode.com`
2. `https://base-mainnet.public.blastapi.io`
3. `https://base.llamarpc.com`
4. `https://1rpc.io/base`

For Sepolia:

1. `https://base-sepolia-rpc.publicnode.com`
2. `https://base-sepolia.public.blastapi.io`

The fallback list is filtered to exclude the configured primary so the same
endpoint is not retried twice.

### Recommended production RPC posture

- Set `BASE_MAINNET_RPC_URL` to a reliable provider (e.g. Alchemy/Infura/QuickNode
  dedicated endpoint) for the primary path.
- Keep the public fallbacks as a second/third tier for resilience.
- For write/settlement operations (CLI, treasury relay), use a dedicated,
  authenticated RPC and verify the tx on a block explorer after broadcast —
  do not rely on a single public RPC for settlement.

## 2. Block-explorer verification path

- **Base mainnet:** `https://basescan.org`
- **Base Sepolia:** `https://sepolia.basescan.org`
- **Sourcify:** `https://repo.sourcify.dev` (contract source verification;
  the mainnet escrow was verified via Sourcify full_match on 2026-06-04).

Operators verify any settlement tx (release, refund, claim, resolveDispute,
fee withdrawal) by confirming the tx hash on Basescan and reading back the
resulting contract state (`intents(id)`, `accumulatedFees`, balances) before
declaring success.

## 3. Key management

### Contract ownership (mainnet)

- `owner()` = `0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967` — a
  `TimelockController` with `getMinDelay() = 172800s` (48h).
- The Timelock's proposer/executor = 2-of-3 Gnosis Safe
  `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637`.
- No single signer can move escrowed funds without a 48-hour public delay.

### Fee recipient (mainnet)

- `feeRecipient()` = `0xec89c40CA296F502cD033e07f18DA5E01cdd197d` — a deployer
  EOA that is also one of the three Safe signers. Documented in `trust.html`
  as a governance gap: the recipient is not itself governed by the Safe, but
  changing it requires the 48h timelock.

### Signer / key hygiene

- Safe signers must be hardware-wallet backed and geographically/account
  separated (per `security-launch-checklist.md` P0 gate).
- **Never** deploy or sign from ad-hoc shell history with raw private keys.
  Use `forge script` with a temporary deployer key, then transfer ownership
  to the Safe and discard the deployer key.
- API secrets (`AWM_DELIVERY_TOKEN`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `AWM_X402_CONSUME_SECRET`, `KV_REST_API_TOKEN`)
  live in Vercel env, rotated on any suspected exposure.

## 4. Deployment reproducibility

- Deployment is via `forge script script/DeployAgentWorkEscrow.s.sol` with
  `--rpc-url`, `--broadcast`, `--verify` (see `security-launch-checklist.md`
  § Mainnet deployment runbook).
- Record tx hash, contract address, constructor args, compiler version,
  optimizer settings, and verification link in `deployments/base-mainnet.json`.
- Post-deploy readbacks: `usdc()`, `feeRecipient()`, `owner()`,
  `defaultFeeBps()`, `MAX_FEE_BPS()`, `nextIntentId()`.

## 5. Related

- `docs/production-readiness/security-launch-checklist.md` (P1 Chain ops gate,
  mainnet runbook)
- `docs/production-readiness/monitoring-plan.md` (RPC/indexer lag alerting)
- `api/system-status.js` (RPC fallback implementation)
- `docs/TREASURY_RUNBOOK.md` (treasury withdrawal SOP)
