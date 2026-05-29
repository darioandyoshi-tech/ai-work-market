#!/usr/bin/env python3
"""
AWM Commit-Reveal ZK Verification Test Script
Demonstrates full workflow: commit -> submitProofWithZK -> release with on-chain verification.

Usage:
  export SELLER_KEY=0x...
  export BUYER_KEY=0x...
  export ADAPTER_ADDRESS=0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9
  python3 test_commit_reveal_zk.py INTENT_ID

Prerequisites:
  - Seller has already generated proof (proof.json, public.json) via generate_proof.js
  - Python dependencies: web3, eth-account (already installed in session)
"""

import json, os, sys, time
from decimal import Decimal
from eth_account import Account
from web3 import Web3
from web3.middleware import geth_poa_middleware

# === Configuration ===
RPC_URL = "https://mainnet.base.org"
CHAIN_ID = 8453
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
ESCROW = "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
ADAPTER = os.environ.get("ADAPTER_ADDRESS", "0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9")
CIRCUITS_DIR = os.path.expanduser("~/ai-work-market/circuits")

ERC20_ABI = [
    {"name":"balanceOf","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"name":"approve","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
    {"name":"allowance","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"name":"transfer","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},
]

ESCROW_ABI = [
    {"name":"intents","inputs":[{"name":"","type":"uint256"}],"outputs":[
        {"name":"buyer","type":"address"},{"name":"seller","type":"address"},{"name":"amount","type":"uint256"},
        {"name":"feeBps","type":"uint256"},{"name":"workDeadline","type":"uint256"},{"name":"reviewDeadline","type":"uint256"},
        {"name":"reviewPeriod","type":"uint256"},{"name":"workHash","type":"bytes32"},{"name":"workURI","type":"string"},
        {"name":"proofURI","type":"string"},{"name":"status","type":"uint8"}
    ],"stateMutability":"view","type":"function"},
    {"name":"submitProofWithZK","inputs":[
        {"name":"intentId","type":"uint256"},
        {"name":"proofURI","type":"string"},
        {"name":"pA","type":"uint256[2]"},
        {"name":"pB","type":"uint256[2][2]"},
        {"name":"pC","type":"uint256[2]"},
        {"name":"pubSignals","type":"uint256[2]"}
    ],"outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"name":"release","inputs":[{"name":"intentId","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"name":"nextIntentId","inputs":[],"outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"name":"zkVerifier","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"name":"setZkVerifier","inputs":[{"name":"verifier","type":"address"}],"outputs":[],"stateMutability":"nonpayable","type":"function"},
]

ADAPTER_ABI = [
    {"name":"commit","inputs":[{"name":"intentId","type":"uint256"},{"name":"workHash","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"name":"commits","inputs":[{"name":"","type":"uint256"}],"outputs":[
        {"name":"buyer","type":"address"},{"name":"seller","type":"address"},{"name":"timestamp","type":"uint256"}
    ],"stateMutability":"view","type":"function"},
    {"name":"realVerifier","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"name":"escrow","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"},
]

# === Setup ===
w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(geth_poa_middleware, layer=0)

escrow = w3.eth.contract(address=ESCROW, abi=ESCROW_ABI)
usdc = w3.eth.contract(address=USDC, abi=ERC20_ABI)
adapter = w3.eth.contract(address=ADAPTER, abi=ADAPTER_ABI)

def load_key(label):
    k = os.environ.get(f"{label.upper()}_KEY")
    if not k:
        raise RuntimeError(f"Set {label.upper()}_KEY env var")
    return Account.from_key(k)

def build_tx(contract_func, value=0, gas_mult=1.2):
    est = contract_func.estimate_gas({'from': account.address, 'value': value})
    return {
        'from': account.address,
        'to': contract_func.address,
        'gas': int(est * gas_mult),
        'nonce': w3.eth.get_transaction_count(account.address),
        'value': value,
        'maxFeePerGas': w3.eth.gas_price * 2,
        'maxPriorityFeePerGas': max(1, w3.eth.gas_price // 1000),
        'chainId': CHAIN_ID,
    }

def sign_and_send(tx_dict, acct):
    # Attach data after tx dict is built
    signed = acct.sign_transaction(tx_dict)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    return receipt

def shorten(addr): return f"{addr[:6]}...{addr[-4:]}"

# === Main ===
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 test_commit_reveal_zk.py INTENT_ID")
        sys.exit(1)

    intent_id = int(sys.argv[1])

    # Load proof artifacts (generated by generate_proof.js)
    with open(os.path.join(CIRCUITS_DIR, 'proof.json')) as f:
        proof = json.load(f)
    with open(os.path.join(CIRCUITS_DIR, 'public.json')) as f:
        pub_signals = json.load(f)  # expect [buyer, seller, workHash]

    # Extract values
    pA = [int(proof['pi_a'][0]), int(proof['pi_a'][1])]
    pB = [[int(proof['pi_b'][0][0]), int(proof['pi_b'][0][1])], [int(proof['pi_b'][1][0]), int(proof['pi_b'][1][1])]]
    pC = [int(proof['pi_c'][0]), int(proof['pi_c'][1])]
    buyer_uint = int(pub_signals[0])
    seller_uint = int(pub_signals[1])
    workHash = int(pub_signals[2])

    buyer_addr = Web3.to_checksum_address(f"{buyer_uint:040x}")
    seller_addr = Web3.to_checksum_address(f"{seller_uint:040x}")

    # Load keys
    seller = load_key("seller")
    buyer = load_key("buyer")

    print(f"=== Commit-Reveal ZK Test for Intent #{intent_id} ===")
    print(f"Buyer:  {buyer_addr} ({shorten(buyer.address)})")
    print(f"Seller: {seller_addr} ({shorten(seller.address)})")
    print(f"workHash: {workHash}")
    print(f"Adapter:  {ADAPTER}")

    # Verify adapter state
    rv = adapter.functions.realVerifier().call()
    esc = adapter.functions.escrow().call()
    print(f"\nAdapter realVerifier: {rv}")
    print(f"Adapter escrow:       {esc}")
    assert Web3.to_checksum_address(rv) == "0x09DF1d2D899412cB6c20c37A392610985b8a0d80", "Wrong real verifier"
    assert Web3.to_checksum_address(esc) == ESCROW, "Wrong escrow"

    # Check current escrow zkVerifier
    current_verifier = escrow.functions.zkVerifier().call()
    print(f"\nEscrow current zkVerifier: {current_verifier}")
    if Web3.to_checksum_address(current_verifier) == Web3.to_checksum_address(ADAPTER):
        print("✅ Adapter already active!")
    else:
        print("⚠️  Adapter NOT yet activated. Governance required.")
        print("   Run this test again after Safe/Timelock approves setZkVerifier(adapter).")
        # Exit here — cannot proceed without governance
        sys.exit(0)

    # STEP 1: Seller commits workHash to adapter
    print(f"\nSTEP 1: Seller commits workHash to adapter...")
    account = seller
    commit_func = adapter.functions.commit(intent_id, workHash)
    tx = build_tx(commit_func)
    tx['data'] = commit_func.build_transaction({'from': seller.address, 'gas': tx['gas'], 'nonce': tx['nonce']})['data']
    receipt = sign_and_send(tx, seller)
    print(f"   Commit tx: {receipt.transactionHash.hex()} (gas {receipt.gasUsed})")

    # Verify commit stored
    c = adapter.functions.commits(workHash).call()
    print(f"   Stored: buyer={c[0]}, seller={c[1]}, ts={c[2]}")
    assert Web3.to_checksum_address(c[0]) == buyer_addr, "Buyer mismatch in commit"
    assert Web3.to_checksum_address(c[1]) == seller_addr, "Seller mismatch in commit"

    # STEP 2: Seller submits ZK proof via escrow
    print(f"\nSTEP 2: Seller submits proof to escrow (pubSignals=[workHash, 1])...")
    pubSignals = [workHash, 1]
    submit_func = escrow.functions.submitProofWithZK(intent_id, "ipfs://QmTestZKProof", pA, pB, pC, pubSignals)
    tx = build_tx(submit_func)
    tx['data'] = submit_func.build_transaction({'from': seller.address, 'gas': tx['gas'], 'nonce': tx['nonce']})['data']
    receipt = sign_and_send(tx, seller)
    print(f"   Submit tx: {receipt.transactionHash.hex()} (gas {receipt.gasUsed})")

    # STEP 3: Buyer releases (triggers adapter.verifyProof -> real verifier)
    print(f"\nSTEP 3: Buyer releases (on-chain ZK verification runs)...")
    release_func = escrow.functions.release(intent_id)
    tx = build_tx(release_func)
    tx['data'] = release_func.build_transaction({'from': buyer.address, 'gas': tx['gas'], 'nonce': tx['nonce']})['data']
    receipt = sign_and_send(tx, buyer)
    print(f"   Release tx: {receipt.transactionHash.hex()} (gas {receipt.gasUsed})")

    # Final intent state
    intent = escrow.functions.intents(intent_id).call()
    statuses = {0: 'Pending', 1: 'Funded', 2: 'ProofSubmitted', 3: 'Released', 4: 'Refunded', 5: 'Disputed'}
    print(f"\n✅ Intent #{intent_id} status: {statuses.get(intent[10], intent[10])}")
    print(f"   Seller received: {intent[2]} USDC units ({intent[2]/1e6:.2f} USDC)")
    print("\n=== Commit-Reveal ZK E2E Test COMPLETE ===")
