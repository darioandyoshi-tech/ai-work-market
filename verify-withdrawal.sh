#!/usr/bin/env bash
# Simple AWM withdrawal verifier
# Usage: ./verify-withdrawal.sh <tx_hash> [expected_address]

set -euo pipefail

API="https://api-sepolia.base.org/api"
CONTRACT="0x489C36738F46e395b4cd26DDf0f85756686A2f07"
FEE_EVENT_TOPIC="0xddf252adbe128986631e76d779ba6116e9e57429a1c64b192b4eeade647c48e9"

TX_HASH="${1:?Error: tx hash required}"
EXPECTED="${2:-}"

# Get transaction receipt
RESPONSE=$(curl -s "$API?module=transaction&action=gettxreceipt&txhash=$TX_HASH")
STATUS=$(echo "$RESPONSE" | jq -r '.result.status')

if [[ "$STATUS" != "1" ]]; then
    echo "❌ Transaction failed (status: $STATUS)"
    exit 1
fi

echo "✅ Transaction successful"

# Check for FeesWithdrawn event
LOGS=$(curl -s "$API?module=logs&action=getlogs&address=$CONTRACT&txhash=$TX_HASH")
HAS_EVENT=$(echo "$LOGS" | jq -e --arg topic "$FEE_EVENT_TOPIC" '.result[] | select(.topics[0] == $topic)' | grep -q . && echo true || echo false)

if [[ "$HAS_EVENT" == "true" ]]; then
    echo "✅ FeesWithdrawn event found"

    # Extract details if needed
    EVENT=$(echo "$LOGS" | jq -r --arg topic "$FEE_EVENT_TOPIC" '.result[] | select(.topics[0] == $topic)' | head -1)
    RECIPIENT="0x$(echo "$EVENT" | jq -r '.topics[2]' | cut -c27-)"
    AMOUNT_HEX=$(echo "$EVENT" | jq -r '.data')
    AMOUNT_DEC=$(echo "ibase=16; $AMOUNT_HEX" | bc)

    echo "💰 Amount withdrawn: $AMOUNT_DEC wei"

    if [[ -n "$EXPECTED" && "$RECIPIENT" != "$EXPECTED" ]]; then
        echo "⚠️  Recipient mismatch: got $RECIPIENT, expected $EXPECTED"
    else
        echo "📬 Funds sent to: $RECIPIENT"
    fi
else
    echo "❌ No FeesWithdrawn event found"
    exit 1
fi

echo "🔗 https://sepolia-explorer.base.org/tx/$TX_HASH"
