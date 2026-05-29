#!/bin/bash
# Sovereign Contract Suite - Basescan Verification Script
# Run after deployment with: bash verify-all.sh

set -euo pipefail

API_KEY="\${ETHERSCAN_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "ERROR: Set ETHERSCAN_API_KEY env var first"
  echo "  export ETHERSCAN_API_KEY=your_key_here"
  exit 1
fi

BASERPC="https://mainnet.base.org"
CHAIN_ID=8453
VERIFY_URL="https://api.basescan.org/api"

echo "=== Verifying 4 contracts on Base Mainnet ==="
echo ""

# ── 1. TimelockController ──────────────────────────────────
echo "[1/4] Verifying TimelockController at 0xF8C67A...0967..."
forge verify-contract \
  0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967 \
  lib/openzeppelin-contracts/contracts/governance/TimelockController.sol:TimelockController \
  --chain-id $CHAIN_ID \
  --constructor-args \
    $(cast abi-encode "constructor(uint256,address[],address[],address)" \
      172800 \
      '[0x7f36896f6b6496B4E2fE95f672B3DAf28386b637]' \
      '[0x7f36896f6b6496B4E2fE95f672B3DAf28386b637,0xec89c40CA296F502cD033e07f18DA5E01cdd197d]' \
      0xec89c40CA296F502cD033e07f18DA5E01cdd197d) \
  --watch || echo "  FAILED (may need manual submission)"

echo ""

# ── 2. Groth16Verifier ─────────────────────────────────────
echo "[2/4] Verifying Groth16Verifier at 0xbEA159...5132..."
forge verify-contract \
  0xbEA159B9982c790B872093736E54590bec295132 \
  contracts/AgentWorkProofVerifier.sol:Groth16Verifier \
  --chain-id $CHAIN_ID \
  --watch || echo "  FAILED (may need manual submission)"

echo ""

# ── 3. AgentWorkEscrowZK ───────────────────────────────────
echo "[3/4] Verifying AgentWorkEscrowZK at 0x8b49FF...Dae2..."
forge verify-contract \
  0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 \
  contracts/AgentWorkEscrowZK.sol:AgentWorkEscrowZK \
  --chain-id $CHAIN_ID \
  --constructor-args \
    $(cast abi-encode "constructor(address,address,address,address)" \
      0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
      0xec89c40CA296F502cD033e07f18DA5E01cdd197d \
      0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967 \
      0xbEA159B9982c790B872093736E54590bec295132) \
  --watch || echo "  FAILED (may need manual submission)"

echo ""

# ── 4. Safe Proxy ──────────────────────────────────────────
echo "[4/4] NOTE: Safe proxy is automatically verified by Gnosis."
echo "  If not, submit proxy source at https://basescan.org/proxyChecker"
echo "  Proxy: 0x7f36896F6b6496B4E2fE95f672B3DAf28386b637"
echo ""

echo "=== Verification attempt complete ==="
echo ""
echo "If any failed, use this manual URL:"
echo "  https://basescan.org/verifyContract"
echo ""
echo "Addresses to verify:"
echo "  TimelockController: 0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967"
echo "  Groth16Verifier:    0xbEA159B9982c790B872093736E54590bec295132"
echo "  AgentWorkEscrowZK:  0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
