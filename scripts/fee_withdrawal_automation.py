#!/usr/bin/env python3
"""
AWM fee withdrawal automation — runtime version.

Reads PRIVATE_KEY from /home/dario/ai-work-market/.env and uses the
real Base Sepolia deployment at deployments/base-sepolia.json.
"""

import json
import os
import sys
from pathlib import Path
from web3 import Web3
from eth_account import Account
from web3.exceptions import TransactionNotFound

# ==== Configuration ====
REPO_ROOT = Path("/home/dario/ai-work-market")
RPC_URL = "https://sepolia.base.org"
DEPLOYMENT_INFO_PATH = REPO_ROOT / "deployments" / "base-sepolia.json"
ARTIFACT_PATH = REPO_ROOT / "artifacts" / "AgentWorkEscrow.json"
ENV_PATH = REPO_ROOT / ".env"
MIN_WITHDRAW_WEI = int(0.001 * 1e6)  # 0.001 USDC (6 decimals)

# ==== Load PRIVATE_KEY from .env ====
def load_private_key():
    if not ENV_PATH.exists():
        print(f"ERROR: .env not found at {ENV_PATH}", file=sys.stderr)
        sys.exit(1)
    pk = None
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("PRIVATE_KEY="):
            pk = line.split("=", 1)[1].strip()
            break
    if not pk or pk.startswith("0xREPLACE"):
        print("ERROR: PRIVATE_KEY missing or unset in .env", file=sys.stderr)
        sys.exit(1)
    return pk

PRIVATE_KEY = load_private_key()
fee_recipient_acct = Account.from_key(PRIVATE_KEY)
FEE_RECIPIENT_ADDRESS = fee_recipient_acct.address
print(f"[fee_withdrawal] Fee recipient address: {FEE_RECIPIENT_ADDRESS}")

# ==== Web3 setup ====
w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 30}))
if not w3.is_connected():
    print("ERROR: Cannot reach Base Sepolia RPC", file=sys.stderr)
    sys.exit(1)
print(f"[fee_withdrawal] Connected to Base Sepolia (chainId={w3.eth.chain_id}, block={w3.eth.block_number})")

# ==== Load deployment info ====
if not DEPLOYMENT_INFO_PATH.exists():
    print(f"ERROR: Deployment info not found at {DEPLOYMENT_INFO_PATH}", file=sys.stderr)
    sys.exit(1)
with open(DEPLOYMENT_INFO_PATH) as f:
    deployment = json.load(f)
ESCROW_ADDRESS = Web3.to_checksum_address(deployment["address"])
USDC_ADDRESS = Web3.to_checksum_address(deployment["usdc"])
print(f"[fee_withdrawal] Escrow: {ESCROW_ADDRESS}")
print(f"[fee_withdrawal] USDC:   {USDC_ADDRESS}")

# ==== Load contract ABI ====
with open(ARTIFACT_PATH) as f:
    artifact = json.load(f)
ABI = artifact["abi"]
escrow = w3.eth.contract(address=ESCROW_ADDRESS, abi=ABI)

USDC_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    }
]
usdc = w3.eth.contract(address=USDC_ADDRESS, abi=USDC_ABI)


def get_accumulated_fees():
    return escrow.functions.accumulatedFees().call()


def get_usdc_balance(addr):
    return usdc.functions.balanceOf(addr).call()


def withdraw_fees():
    fees = get_accumulated_fees()
    if fees == 0:
        print("[fee_withdrawal] No accumulated fees to withdraw.")
        return None
    if fees < MIN_WITHDRAW_WEI:
        print(
            f"[fee_withdrawal] Accumulated fees ({fees} raw / "
            f"{fees / 1e6} USDC) below minimum threshold "
            f"({MIN_WITHDRAW_WEI} raw / {MIN_WITHDRAW_WEI / 1e6} USDC). Skipping."
        )
        return None

    nonce = w3.eth.get_transaction_count(FEE_RECIPIENT_ADDRESS)
    try:
        gas_estimate = escrow.functions.withdrawFees().estimate_gas(
            {"from": FEE_RECIPIENT_ADDRESS}
        )
    except Exception as e:
        print(f"[fee_withdrawal] Gas estimation failed: {e}. Using 100k default.")
        gas_estimate = 100000

    tx = escrow.functions.withdrawFees().build_transaction(
        {
            "from": FEE_RECIPIENT_ADDRESS,
            "nonce": nonce,
            "gas": int(gas_estimate * 1.2),
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        }
    )

    signed_tx = fee_recipient_acct.sign_transaction(tx)
    try:
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        print(f"[fee_withdrawal] TX sent: 0x{tx_hash.hex()}")
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt.status == 1:
            print(
                f"[fee_withdrawal] TX confirmed in block {receipt.blockNumber}, "
                f"gas used: {receipt.gasUsed}"
            )
            return tx_hash.hex()
        else:
            print(f"[fee_withdrawal] TX FAILED on-chain. Receipt: {receipt}")
            return None
    except TransactionNotFound:
        print("[fee_withdrawal] TX not found within timeout.")
        return None
    except Exception as e:
        print(f"[fee_withdrawal] TX error: {e}")
        return None


def main():
    print("=== AWM Fee Withdrawal Automation ===")

    # Sanity check: signer matches configured owner/feeRecipient
    try:
        owner = escrow.functions.owner().call()
        fee_recipient = escrow.functions.feeRecipient().call()
        print(f"[fee_withdrawal] Contract owner:        {owner}")
        print(f"[fee_withdrawal] Contract feeRecipient: {fee_recipient}")
        if (
            owner.lower() != FEE_RECIPIENT_ADDRESS.lower()
            or fee_recipient.lower() != FEE_RECIPIENT_ADDRESS.lower()
        ):
            print(
                "WARNING: signer does not match contract owner/feeRecipient — "
                "withdrawal will revert."
            )
    except Exception as e:
        print(f"[fee_withdrawal] Could not read contract state: {e}")

    # Pre-state
    fees_before = get_accumulated_fees()
    bal_before = get_usdc_balance(FEE_RECIPIENT_ADDRESS)
    print(
        f"[fee_withdrawal] Accumulated fees:  {fees_before} raw "
        f"({fees_before / 1e6} USDC)"
    )
    print(
        f"[fee_withdrawal] Fee recipient USDC balance (before): "
        f"{bal_before} raw ({bal_before / 1e6} USDC)"
    )

    # Withdraw
    tx_hash = withdraw_fees()

    # Post-state
    if tx_hash:
        bal_after = get_usdc_balance(FEE_RECIPIENT_ADDRESS)
        fees_after = get_accumulated_fees()
        withdrawn = bal_after - bal_before
        print(
            f"[fee_withdrawal] Fee recipient USDC balance (after):  "
            f"{bal_after} raw ({bal_after / 1e6} USDC)"
        )
        print(
            f"[fee_withdrawal] Amount withdrawn: {withdrawn} raw "
            f"({withdrawn / 1e6} USDC)"
        )
        print(
            f"[fee_withdrawal] Accumulated fees (after): {fees_after} raw"
        )
        if fees_after != 0:
            print("WARNING: accumulated fees are non-zero after withdrawal.")
        print(f"[fee_withdrawal] Explorer: https://sepolia-explorer.base.org/tx/0x{tx_hash}")
    else:
        print("[fee_withdrawal] No withdrawal performed.")

    print("=== Fee withdrawal automation completed ===")


if __name__ == "__main__":
    main()
