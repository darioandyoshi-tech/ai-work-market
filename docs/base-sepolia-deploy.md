# Base Sepolia Deployment Runbook

## Status
Prepared only. Do not broadcast until Dario confirms deployment inputs and funding.

## Required inputs
- `PRIVATE_KEY`: funded deployer private key. Keep out of git/history.
- `BASE_SEPOLIA_RPC_URL`: RPC URL.
- `USDC`: canonical Base Sepolia USDC token address.
- `FEE_RECIPIENT`: address allowed to withdraw accumulated platform fees.

## Dry-run / simulation
```bash
export BASE_SEPOLIA_RPC_URL="..."
export USDC="..."
export FEE_RECIPIENT="..."
export PRIVATE_KEY="..."
forge script script/DeployAgentWorkEscrow.s.sol:DeployAgentWorkEscrow \
  --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

## Broadcast
Only after review and confirmation:

```bash
forge script script/DeployAgentWorkEscrow.s.sol:DeployAgentWorkEscrow \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify
```

## Post-deploy checks
- Confirm constructor params:
  - `usdc()` equals canonical USDC for target chain.
  - `feeRecipient()` equals intended fee recipient.
  - `owner()` equals deployer/admin wallet.
- Fund a tiny buyer test wallet with Base Sepolia ETH + USDC.
- Approve escrow for test amount.
- Create one signed-offer escrow.
- Submit proof.
- Release or claim after review.
- Withdraw fees if any accrued.

## Current security gates before deployment
- `npm run compile` → success.
- `forge test -vvv` → 18 passed, 0 failed, 0 skipped.
- Slither → 0 high/medium, 4 accepted low timestamp findings.
