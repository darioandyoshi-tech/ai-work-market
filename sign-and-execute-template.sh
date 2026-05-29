#!/bin/bash
# ============================================================
# Safe Multi-Sig Sign & Execute Template
# ============================================================
# This script demonstrates how to collect two signatures and
# execute a Safe transaction when threshold = 2-of-3.
#
# USAGE:
#   export SAFE_OWNER_1_KEY=0x...
#   export SAFE_OWNER_2_KEY=0x...
#   bash sign-and-execute-template.sh schedule
#   # Wait 48h after schedule tx mines
#   bash sign-and-execute-template.sh execute
#
# OR for direct exec (only if threshold temporarily lowered):
#   export SAFE_OWNER_KEY=0x...
#   bash sign-and-execute-template.sh direct
#
# SAFETY: This script ONLY signs transactions. It does NOT store keys.
# ============================================================

set -euo pipefail

RPC_URL="https://mainnet.base.org"
CHAIN_ID="8453"

SAFE="0x7f36896F6b6496B4E2fE95f672B3DAf28386b637"
TIMELOCK="0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967"
ESCROW="0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
ADAPTER="0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9"

# Safe ABI (partial — execTransaction)
SAFE_ABI='[{"name":"execTransaction","inputs":[{"name":"to","type":"address"},{"name":"value","type":"uint256"},{"name":"data","type":"bytes"},{"name":"operation","type":"uint8"},{"name":"safeTxGas","type":"uint256"},{"name":"baseGas","type":"uint256"},{"name":"gasPrice","type":"uint256"},{"name":"gasToken","type":"address"},{"name":"refundReceiver","type":"address"},{"name":"signatures","type":"bytes"}],"outputs":[{"name":"success","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"name":"nonce","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]'

# --- Helpers ---

# Build execTransaction calldata for Safe tx
build_safe_transaction() {
    local to="$1"
    local value="$2"
    local data="$3"
    local operation="$4"
    
    # Safe transaction hash (EIP-712 domain + tx hash)
    # For proper signing, we need to compute the SafeTx hash.
    # For single-owner direct exec (threshold=1), we can bypass multi-sig.
    # But with threshold=2, we need proper EIP-712 signing.
    
    # This is a simplified template. In practice, use Safe SDK or
    # Safe Transaction Service for proper off-chain signature collection.
    
    echo "Safe tx: to=$to value=$value data=$data operation=$operation"
    
    # Get Safe nonce
    local nonce=$(cast call "$SAFE" "nonce()(uint256)" --rpc-url "$RPC_URL")
    echo "Safe nonce: $nonce"
    
    # For threshold=1 we'd call cast send directly. For threshold=2,
    # we need the Safe Transaction Service or manual signature concatenation.
    echo ""
    echo "=== IMPORTANT: Threshold is 2-of-3 ==="
    echo "For proper multi-sig, use Safe Transaction Service API or Web UI."
    echo "Direct cast send only works if threshold >= 1 AND you provide"
    echo "concatenated signatures from multiple owners."
    echo ""
}

# Schedule call
case "${1:-}" in
    schedule)
        echo "=== PROPOSE: Timelock.schedule() ==="
        # Encode Timelock.schedule(ESCROW, 0, setZkVerifier(ADAPTER), 0x00, salt, 48h)
        local inner=$(cast calldata "setZkVerifier(address)" "$ADAPTER")
        local schedule=$(cast calldata "schedule(address,uint256,bytes,bytes32,bytes32,uint256)" "$ESCROW" 0 "$inner" 0x0000000000000000000000000000000000000000000000000000000000000000 0xd102ad6d58035e1b2930e0dcd24ab1075a8c0fb62e5b2f0b32653a384724147f 172800)
        
        echo "Safe execTransaction will call:"
        echo "  to: $TIMELOCK"
        echo "  data (Timelock.schedule): $schedule"
        build_safe_transaction "$TIMELOCK" 0 "$schedule" 0
        
        echo ""
        echo "--- Save this calldata and import to Safe Web UI ---"
        echo "Safe URL: https://app.safe.global/m:8453:$SAFE"
        echo ""
        echo "{"
        echo '  "to": "'"$TIMELOCK"'",'
        echo '  "value": "0",'
        echo '  "data": "'"$schedule"'",'
        echo '  "operation": 0'
        echo "}"
        ;;
        
    execute)
        echo "=== EXECUTE: Timelock.execute() ==="
        # Encode Timelock.execute(ESCROW, 0, setZkVerifier(ADAPTER), 0x00, salt)
        local inner=$(cast calldata "setZkVerifier(address)" "$ADAPTER")
        local execute=$(cast calldata "execute(address,uint256,bytes,bytes32,bytes32)" "$ESCROW" 0 "$inner" 0x0000000000000000000000000000000000000000000000000000000000000000 0xd102ad6d58035e1b2930e0dcd24ab1075a8c0fb62e5b2f0b32653a384724147f)
        
        echo "Safe execTransaction will call:"
        echo "  to: $TIMELOCK"
        echo "  data (Timelock.execute): $execute"
        build_safe_transaction "$TIMELOCK" 0 "$execute" 0
        
        echo ""
        echo "--- Import to Safe Web UI after 48h delay ---"
        echo "Safe URL: https://app.safe.global/m:8453:$SAFE"
        echo ""
        echo "{"
        echo '  "to": "'"$TIMELOCK"'",'
        echo '  "value": "0",'
        echo '  "data": "'"$execute"'",'
        echo '  "operation": 0'
        echo "}"
        ;;
        
    direct)
        echo "=== DIRECT EXECUTION (requires threshold=1 or manual signature collection) ==="
        # This is for advanced users with access to multiple owner keys.
        # For 2-of-3, you'd need to concatenate vrs signatures.
        echo "See Safe SDK for proper signature collection:"
        echo "https://github.com/safe-global/safe-core-sdk"
        ;;
        
    *)
        echo "Usage: $0 {schedule|execute|direct}"
        echo ""
        echo "  schedule  — Generate schedule() calldata for Safe"
        echo "  execute   — Generate execute() calldata for Safe (after 48h)"
        echo "  direct    — Direct execution (requires threshold=1)"
        echo ""
        echo "Export SAFE_OWNER_1_KEY and optionally SAFE_OWNER_2_KEY before running."
        exit 1
        ;;
esac
