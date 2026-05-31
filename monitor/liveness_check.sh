#!/bin/bash
# Sovereign Liveness Heartbeat
TIMESTAMP=$(date +%s)
SATELLITE_FILE="/home/dario/ai-work-market/monitor/last_pulse.txt"
echo "$TIMESTAMP" > "$SATELLITE_FILE"

# Simple check to see if we are actually alive
if [ $? -eq 0 ]; then
    echo "Sovereign Heartbeat: ACTIVE"
else
    echo "Sovereign Heartbeat: CRITICAL FAILURE"
    exit 1
fi
