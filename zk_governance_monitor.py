#!/usr/bin/env python3
"""
AWM Governance Monitor
Watches the blockchain for Safe governance proposal execution.
Triggers notification when ZKVerifierSet event fires with adapter address.

Since zkVerifier() may be a private state variable (no auto getter),
we monitor the ZKVerifierSet event instead.

Usage:
    export TELEGRAM_BOT_TOKEN=***  # optional
    export TELEGRAM_CHAT_ID=...   # optional
    python3 zk_governance_monitor.py [block_start]

Can be run as a cron job or continuous watcher:
    hermes cron create "*/30 * * * *" \
      --name "ZK-Governance-Monitor" \
      --script "zk_governance_monitor.py" \
      --no-agent
"""

import os, sys, time
import requests
from web3 import Web3

# === Configuration ===
RPC_URL = "https://mainnet.base.org"
ESCROW = "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
ADAPTER = "0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9"

w3 = Web3(Web3.HTTPProvider(RPC_URL))

def compute_topic0(sig):
    return Web3.keccak(text=sig).hex()

ZK_VERIFIER_SET_TOPIC = compute_topic0("ZKVerifierSet(address)")

KNOWN_TOPICS = {
    "ZKVerifierSet": ZK_VERIFIER_SET_TOPIC,
    "WorkReleased": compute_topic0("WorkReleased(uint256)"),
    "ZKProofSubmitted": compute_topic0("ZKProofSubmitted(uint256)"),
    "ZKProofInvalid": compute_topic0("ZKProofInvalid(uint256)"),
}

def send_telegram(message):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"Telegram send failed: {e}")
        return False

def scan_activations(from_block, to_block):
    """Scan for ZKVerifierSet events pointing to adapter."""
    try:
        logs = w3.eth.get_logs({
            "address": ESCROW,
            "fromBlock": from_block,
            "toBlock": to_block,
            "topics": [ZK_VERIFIER_SET_TOPIC]
        })
        return logs
    except Exception as e:
        print(f"RPC scan error: {e}")
        return []

def decode_address(log_topic):
    """Extract address from indexed topic (32-byte padded)."""
    return w3.to_checksum_address("0x" + log_topic.hex()[-40:])

def one_shot_check(block_start=None):
    """Single check — useful for cron."""
    if block_start is None:
        block_start = w3.eth.block_number - 5000  # ~4h on Base

    block_end = w3.eth.block_number
    print(f"Scanning blocks {block_start} to {block_end} for ZKVerifierSet...")
    logs = scan_activations(block_start, block_end)

    for log in logs:
        new_verifier = decode_address(log.topics[1])
        if new_verifier.lower() == ADAPTER.lower():
            msg = (
                f"✅ *ADAPTER ACTIVATED!*\n"
                f"Block: `{log.blockNumber}`\n"
                f"Tx: `{log.transactionHash.hex()}`\n"
                f"New zkVerifier: `{new_verifier}`\n\n"
                f"Commit-reveal ZK workflow is LIVE."
            )
            print(msg)
            send_telegram(msg)
            return 0
        else:
            print(f"   Found ZKVerifierSet at {log.blockNumber} but address {new_verifier} != {ADAPTER}")

    print("⏳ Adapter not yet activated. No matching ZKVerifierSet event found.")
    return 1

def monitor_continuous(poll_interval=60, lookback=100):
    """Continuous monitoring — runs until detected."""
    print(f"=== AWM Governance Monitor ===")
    print(f"Watching escrow: {ESCROW}")
    print(f"Target adapter:  {ADAPTER}")
    print(f"Poll interval:   {poll_interval}s")
    print(f"Event topic:     {ZK_VERIFIER_SET_TOPIC}")
    print()

    latest = w3.eth.block_number
    print(f"Starting from block: {latest}")

    while True:
        time.sleep(poll_interval)
        current = w3.eth.block_number
        if current <= latest:
            continue

        from_block = max(latest + 1, current - lookback)
        print(f"Scanning {from_block}..{current}...")
        logs = scan_activations(from_block, current)

        for log in logs:
            new_verifier = decode_address(log.topics[1])
            tx = log.transactionHash.hex()
            print(f"   ZKVerifierSet at {log.blockNumber}: {new_verifier}")

            if new_verifier.lower() == ADAPTER.lower():
                msg = (
                    f"🚨 *GOVERNANCE EXECUTED — ADAPTER LIVE*\n"
                    f"Block: `{log.blockNumber}`\n"
                    f"Tx: `{tx}`\n\n"
                    f"ZK verification is now enforced on AgentWorkEscrowZK."
                )
                print(f"\n{msg}")
                send_telegram(msg)
                return

        latest = current

    # Also print status periodically
        if current % 600 == 0:  # every ~10 min
            print(f"... still monitoring at block {current}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--continuous":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        monitor_continuous(poll_interval=interval)
    else:
        block = int(sys.argv[1]) if len(sys.argv) > 1 else None
        sys.exit(one_shot_check(block))
