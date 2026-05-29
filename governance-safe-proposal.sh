#!/bin/bash
# ============================================================
# Safe ZK Adapter Governance — Shell Script for Safe Signers
# ============================================================
# Usage: Run this script with Safe owner private key exported
#        Requires cast (Foundry) and Ethereum account with funds
#
# Step 1: Schedule (any Safe owner)
# Step 2: Wait 48h
# Step 3: Execute (any Safe owner)
#
# NOTE: This script does NOT contain private keys. Export them
#       securely before running.
# ============================================================

set -euo pipefail

# === Configuration ===
RPC_URL="https://mainnet.base.org"
CHAIN_ID="8453"

# Safe (2-of-3)
SAFE="0x7f36896F6b6496B4E2fE95f672B3DAf28386b637"

# TimelockController
TIMELOCK="0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967"

# Targets
ESCROW="0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
ADAPTER="0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9"

# 48h delay
DELAY="172800"

# === Check prerequisites ===
if ! command -v cast &> /dev/null; then
    echo "ERROR: cast (Foundry) not found. Install: https://getfoundry.sh"
    exit 1
fi

if [[ -z "${SAFE_OWNER_KEY:-}" ]]; then
    echo "ERROR: export SAFE_OWNER_KEY=<private_key> before running"
    exit 1
fi

# Derive owner address from key
OWNER_ADDR=$(echo "$SAFE_OWNER_KEY" | cast wallet address)
echo "=== Safe Owner Address: $OWNER_ADDR ==="

# Check if this address is a Safe owner
# (In production, you'd query Safe.getOwners() and verify)
echo "WARNING: Ensure $OWNER_ADDR is one of the Safe owners"
echo ""

# === STEP 1: Check current zkVerifier ===
echo "=== Current Escrow zkVerifier ==="
CURRENT_VERIFIER=$(cast call "$ESCROW" "zkVerifier()(address)" --rpc-url "$RPC_URL")
echo "Current verifier: $CURRENT_VERIFIER"
echo ""

# === STEP 2: Prepare inner call data ===
# setZkVerifier(ADAPTER)
INNER_DATA=$(cast calldata "setZkVerifier(address)" "$ADAPTER")
echo "=== Inner call (setZkVerifier): $INNER_DATA ==="

# === STEP 3: Prepare Timelock.schedule() ===
# We need to call Safe.execTransaction() which then calls Timelock.schedule()
# The Safe execTransaction() signature is:
# execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas,
#                 uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver,
#                 bytes signatures)
#
# For a single owner signing (threshold 1), we'd just send raw. But threshold is 2-of-3,
# so we need to collect signatures from two owners.

# Alternative approach: Use Safe Transaction Builder JSON (see safe-tx-builder-schedule.json)
# Or use the Safe SAFE SDK / API which manages multi-sig signing.

echo ""
echo "=== Governance Proposal Details ==="
echo "Proposal: Activate CommitRevealVerifierAdapter as escrow zkVerifier"
echo "Safe:     $SAFE"
echo "Target:   $ESCROW (via Timelock $TIMELOCK)"
echo "Call:     setZkVerifier($ADAPTER)"
echo "Inner data: $INNER_DATA"
echo "Timelock delay: $DELAY seconds (48h)"
echo ""

# Compute Timelock operation ID
OPERATION_ID=$(cast keccak "$(cast concat-hex "$ESCROW" "0000000000000000000000000000000000000000000000000000000000000000" "$INNER_DATA" "0000000000000000000000000000000000000000000000000000000000000000" "d102ad6d58035e1b2930e0dcd24ab1075a8c0fb62e5b2f0b32653a384724147f")" 2>/dev/null || echo "manual_calculation_needed")
echo "Operation ID: $OPERATION_ID"
echo ""

# === Option 1: Direct execution (only works if threshold=1, but it's 2-of-3) ===
# For demonstration - would fail on-chain due to threshold
# In practice, use Safe Web UI or SDK with collected signatures

echo "=== Multi-Sig Signing Process ==="
echo ""
echo "Since Safe threshold is 2-of-3, this script cannot execute directly."
echo ""
echo "Recommended workflow:"
echo ""
echo "1. Import safe-tx-builder-schedule.json into Safe Web UI"
echo "   URL: https://app.safe.global/m:8453:$SAFE"
echo ""
echo "2. Sign with Owner 1 (current key: $OWNER_ADDR)"
echo ""
echo "3. Get second signature from another Safe owner"
echo "   (e.g., 0x5d03... or 0x2dAF...)"
echo ""
echo "4. Submit transaction (this calls Timelock.schedule())"
echo ""
echo "5. Wait 48 hours from block timestamp of schedule tx"
echo ""
echo "6. After 48h, import safe-tx-builder-execute.json"
echo "   and sign+execute Timelock.execute() with 2-of-3"
echo ""
echo "=== Alternative: Manual cast send (if you have multiple owner keys) ==="
echo ""
echo "You can concatenate signatures from two private keys:"
echo ""
echo "    export SAFE_OWNER_1_KEY=0x..."
echo "    export SAFE_OWNER_2_KEY=0x..."
echo "    ./sign-and-execute.sh"
echo ""
echo "See: sign-and-execute.sh template below"

# Store the inner data for use by other scripts
mkdir -p /tmp/awm-governance
echo "$INNER_DATA" > /tmp/awm-governance/setZkVerifier_calldata.txt
echo "$SAFE" > /tmp/awm-governance/safe_address.txt
echo "$TIMELOCK" > /tmp/awm-governance/timelock_address.txt
echo "$ADAPTER" > /tmp/awm-governance/adapter_address.txt
echo "$ESCROW" > /tmp/awm-governance/escrow_address.txt

echo ""
echo "=== Governance data saved to /tmp/awm-governance/ ==="
echo "Ready for Safe Transaction Builder import"
