#!/usr/bin/env bash
# Simple AWM withdrawal verifier for Base Sepolia testnet
# Usage: verify-awm-withdrawal <tx_hash> [expected_wallet_address]

# Exit on any error
set -euo pipefail

# Constants
API="https://api-sepolia.base.org/api"
CONTRACT="0x489C36738F46e395b4cd26DDf0f85756686A2f07"
FEE_EVENT_TOPIC="0xddf252adbe128986631e76d779ba6116e9e57429a1c64b192b4eeade647c48e9"  # keccak256("FeesWithdrawn(address,uint256)")

# Arguments
TX_HASH="${1:?Error: Transaction hash required. Usage: verify-awm-withdrawal <tx_hash> [expected_wallet]}"
EXPECTED_WALLET="${2:-}"

# Helper for colored output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; }

main() {
    log "Verifying AWM withdrawal: $TX_HASH"
    
    # 1. Check transaction status
    local tx_response
    tx_response=$(curl -s "$API?module=transaction&action=gettxreceipt&txhash=$TX_HASH")
    
    if [[ -z "$tx_response" || "$tx_response" == *"Null"* ]]; then
        error "Transaction not found or invalid hash"
        exit 1
    fi
    
    local status
    status=$(echo "$tx_response" | jq -r '.result.status')
    local from_addr
    from_addr=$(echo "$tx_response" | jq -r '.result.from')
    local to_addr
    to_addr=$(echo "$tx_response" | jq -r '.result.to')
    local gas_used
    gas_used=$(echo "$tx_response" | jq -r '.result.gasUsed')
    
    if [[ "$status" != "1" ]]; then
        error "Transaction failed (status: $status)"
        # Try to get revert reason if available
        local revert_reason
        revert_reason=$(echo "$tx_response" | jq -r '.result.revertReason // "Unknown"')
        [[ "$revert_reason" != "null" ]] && warn "Revert reason: $revert_reason"
        exit 1
    fi
    
    log "Transaction successful"
    log "  From: $from_addr"
    log "  To:   $to_addr"
    log "  Gas:  $gas_used"
    
    # 2. Check for FeesWithdrawn event
    local logs_response
    logs_response=$(curl -s "$API?module=logs&action=getlogs&address=$CONTRACT&txhash=$TX_HASH")
    
    if [[ -z "$logs_response" || "$logs_response" == *"Null"* ]]; then
        error "Failed to fetch logs"
        exit 1
    fi
    
    local fee_events
    fee_events=$(echo "$logs_response" | jq -r --arg topic "$FEE_EVENT_TOPIC" '.result[] | select(.topics[0] == $topic)')
    
    if [[ -z "$fee_events" ]]; then
        error "No FeesWithdrawn event found in transaction logs"
        warn "This could mean:"
        warn "  - Wrong transaction hash"
        warn "  - Transaction didn't call withdrawFees()"
        warn "  - Contract address mismatch"
        exit 1
    fi
    
    # Parse the first FeesWithdrawn event (should be only one)
    local recipient_hex
    recipient_hex=$(echo "$fee_events" | jq -r '.topics[2]')
    local amount_hex
    amount_hex=$(echo "$fee_events" | jq -r '.data')
    
    # Convert recipient from hex (remove padding, take last 20 bytes)
    local recipient
    recipient="0x${recipient_hex:26}"
    
    # Convert amount from hex to decimal
    local amount_dec
    amount_dec=$(echo "ibase=16; $amount_hex" | bc)
    
    log "FeesWithdrawn event found:"
    log "  Recipient: $recipient"
    log "  Amount (raw): $amount_dec wei"
    
    # Get USDC decimals for proper display
    local usdc_info
    usdc_info=$(curl -s "$API?module=token&action=gettokeninfo&contractaddress=0x036CbD53842c5426634e7929541eC2318f3dCF7e")
    local usdc_decimals
    usdc_decimals=$(echo "$usdc_info" | jq -r '.result.decimals // 6')
    
    # Calculate USDC amount
    local amount_usdc
    amount_usdc=$(echo "scale=$usdc_decimals; $amount_dec / (10 ** $usdc_decimals)" | bc)
    
    log "  Amount: $amount_usdc USDC"
    
    # 3. Optional: Validate against expected wallet
    if [[ -n "$EXPECTED_WALLET" ]]; then
        # Normalize addresses for comparison (lowercase)
        local recipient_lower
        recipient_lower=$(echo "$recipient" | tr '[:upper:]' '[:lower:]')
        local expected_lower
        expected_lower=$(echo "$EXPECTED_WALLET" | tr '[:upper:]' '[:lower:]')
        
        if [[ "$recipient_lower" != "$expected_lower" ]]; then
            warn "Recipient ($recipient) does NOT match expected wallet ($EXPECTED_WALLET)"
            warn "  (This might be OK if fees went to a different address)"
        else
            log "Recipient matches expected wallet"
        fi
    fi
    
    log ""
    log "🔗 View on explorer: https://sepolia-explorer.base.org/tx/$TX_HASH"
    log "✅ Verification PASSED"
}

# Run main function with all arguments
main "$@"
