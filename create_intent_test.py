"""
Test script: Create Intent #3 via Python AWMClient.
Usage: python3 create_intent_test.py
Requires: deployer private key via DEPLOYER_KEY env var.
"""

import os, sys, secrets
sys.path.insert(0, os.path.expanduser("~/ai-work-market"))

from awm_client import AWMClient

RPC = os.environ.get("BASE_RPC", "https://mainnet.base.org")
ESCROW = "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# Use test seller from earlier
TEST_SELLER = "0x50E85593b2CbCfcc53324a41CDA41Fe7bAf89028"

# Generate random workHash (must be 32 bytes, non-zero)
WORK_HASH = secrets.token_hex(32)
WORK_URI = "ipfs://QmAWMTestIntent3PythonCreated"

AMOUNT_USDC = 1  # 1.0 USDC

def main():
    key = os.environ.get("DEPLOYER_KEY")
    if not key:
        print("ERROR: Set DEPLOYER_KEY env var")
        sys.exit(1)

    client = AWMClient(RPC, private_key=key)
    deployer = client.account.address
    print(f"Connected: block={client.w3.eth.block_number}, deployer={deployer}")

    # 1. Check balances
    bal = client.usdc_balance(deployer)
    print(f"Deployer USDC balance: {client.usdc_units(bal)} USDC")
    if bal < AMOUNT_USDC * 1_000_000:
        print("ERROR: Insufficient USDC")
        sys.exit(1)

    # 2. Check / set allowance
    allow = client.allowance(deployer)
    print(f"Current allowance to escrow: {client.usdc_units(allow)} USDC")
    if allow < AMOUNT_USDC * 1_000_000:
        print("Approving USDC for escrow...")
        result = client.approve_usdc(1_000_000)  # Approve 1.0 USDC
        print(f"  Approve tx: {result['txHash']}, status={result['status']}")

    # 3. Create Intent
    print(f"\nCreating Intent #3:")
    print(f"  seller: {TEST_SELLER}")
    print(f"  amount: {AMOUNT_USDC} USDC")
    print(f"  workHash: 0x{WORK_HASH}")
    print(f"  workURI: {WORK_URI}")

    result = client.create_intent(
        seller=TEST_SELLER,
        amount_usdc=AMOUNT_USDC,
        work_hash="0x" + WORK_HASH,
        work_uri=WORK_URI,
        work_timeout=604800,
        review_period=86400,
    )
    print(f"  createIntent tx: {result['txHash']}, status={result['status']}")

    # 4. Verify
    intent_id = client.next_intent_id() - 1
    status = client.get_intent_status(intent_id)
    print(f"\nIntent #{intent_id} state:")
    for k, v in status.items():
        print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
