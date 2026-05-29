"""AWM Client — Python wrapper for AgentWorkEscrowZK on Base Mainnet.

No private key storage. Pass wallet to constructor when needed.

Example:
    from awm_client import AWMClient
    client = AWMClient("https://mainnet.base.org")
    status = client.get_intent_status(2)

With signer:
    client = AWMClient("https://mainnet.base.org", private_key="0x...")
    tx = client.create_intent(seller="0x50E8...", amount_usdc=1, work_hash="0x...", work_uri="ipfs://...")
"""

import os
import json
from decimal import Decimal
from web3 import Web3
from eth_account import Account

# ─── Base Mainnet defaults ──────────────────────────────────────────────────
ESCROW_ADDR = "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"
USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# Minimal ERC-20 ABI for approve/allowance/balanceOf
USDC_ABI = [
    {"constant": False, "inputs": [{"name": "spender", "type": "address"},
                                      {"name": "amount", "type": "uint256"}],
     "name": "approve", "outputs": [{"name": "", "type": "bool"}], "type": "function", "stateMutability": "nonpayable"},
    {"constant": True, "inputs": [{"name": "owner", "type": "address"},
                                     {"name": "spender", "type": "address"}],
     "name": "allowance", "outputs": [{"name": "", "type": "uint256"}], "type": "function", "stateMutability": "view"},
    {"constant": True, "inputs": [{"name": "account", "type": "address"}],
     "name": "balanceOf", "outputs": [{"name": "", "type": "uint256"}], "type": "function", "stateMutability": "view"},
]

# Minimal AWM escrow ABI — auto-built below from JSON
# (see load_abi() for filesystem fallback)

STATUS_MAP = {
    0: "None",
    1: "Funded",
    2: "ProofSubmitted",
    3: "Completed",
    4: "Disputed",
    5: "Refunded",
    6: "Resolved",
}

# Inline ABI for AWM functions we use
AWM_ABI = [
    {"inputs": [{"name": "seller", "type": "address"}, {"name": "amount", "type": "uint256"},
                {"name": "workTimeoutSeconds", "type": "uint256"}, {"name": "reviewPeriodSeconds", "type": "uint256"},
                {"name": "workHash", "type": "bytes32"}, {"name": "workURI", "type": "string"}],
     "name": "createIntent", "outputs": [{"name": "intentId", "type": "uint256"}],
     "type": "function", "stateMutability": "nonpayable"},
    {"inputs": [{"name": "intentId", "type": "uint256"}, {"name": "proofURI", "type": "string"}],
     "name": "submitProof", "outputs": [], "type": "function", "stateMutability": "nonpayable"},
    {"inputs": [{"name": "intentId", "type": "uint256"}],
     "name": "release", "outputs": [], "type": "function", "stateMutability": "nonpayable"},
    {"inputs": [{"name": "", "type": "uint256"}],
     "name": "intents", "outputs": [{"name": "buyer", "type": "address"}, {"name": "seller", "type": "address"},
                                     {"name": "feeBps", "type": "uint96"}, {"name": "amount", "type": "uint256"},
                                     {"name": "createdAt", "type": "uint256"}, {"name": "workDeadline", "type": "uint256"},
                                     {"name": "reviewDeadline", "type": "uint256"}, {"name": "reviewPeriod", "type": "uint256"},
                                     {"name": "workHash", "type": "bytes32"}, {"name": "workURI", "type": "string"},
                                     {"name": "status", "type": "uint8"}, {"name": "proofURI", "type": "string"},
                                     {"name": "disputeURI", "type": "string"}],
     "type": "function", "stateMutability": "view"},
    {"inputs": [], "name": "nextIntentId", "outputs": [{"name": "", "type": "uint256"}],
     "type": "function", "stateMutability": "view"},
    {"inputs": [], "name": "owner", "outputs": [{"name": "", "type": "address"}],
     "type": "function", "stateMutability": "view"},
    {"inputs": [], "name": "feeRecipient", "outputs": [{"name": "", "type": "address"}],
     "type": "function", "stateMutability": "view"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "intentId", "type": "uint256"},
                                     {"indexed": True, "name": "buyer", "type": "address"},
                                     {"indexed": True, "name": "seller", "type": "address"}],
     "name": "IntentCreated", "type": "event"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "intentId", "type": "uint256"}],
     "name": "ProofSubmitted", "type": "event"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "intentId", "type": "uint256"}],
     "name": "Released", "type": "event"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "intentId", "type": "uint256"}],
     "name": "Refunded", "type": "event"},
    {"anonymous": False, "inputs": [{"indexed": True, "name": "intentId", "type": "uint256"}],
     "name": "Disputed", "type": "event"},
]


class AWMClient:
    """Interact with AgentWorkEscrowZK on Base Mainnet."""

    def __init__(self, rpc_url: str, private_key: str = None,
                 escrow_addr: str = ESCROW_ADDR, usdc_addr: str = USDC_ADDR):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not self.w3.is_connected():
            raise ConnectionError(f"Cannot connect to RPC: {rpc_url}")

        self.escrow = self.w3.eth.contract(address=Web3.to_checksum_address(escrow_addr), abi=AWM_ABI)
        self.usdc = self.w3.eth.contract(address=Web3.to_checksum_address(usdc_addr), abi=USDC_ABI)
        self.account = None
        if private_key:
            self.account = Account.from_key(private_key)

    # ─── View functions ───────────────────────────────────────────────────────

    def get_intent_status(self, intent_id: int) -> dict:
        """Return human-readable intent state."""
        raw = self.escrow.functions.intents(intent_id).call()
        return {
            "intentId": intent_id,
            "buyer": raw[0],
            "seller": raw[1],
            "feeBps": raw[2],
            "amount": raw[3],              # in USDC units (6 decimals)
            "createdAt": raw[4],
            "workDeadline": raw[5],
            "reviewDeadline": raw[6],
            "reviewPeriod": raw[7],
            "workHash": raw[8].hex() if raw[8] else "0x0",
            "workURI": raw[9],
            "statusRaw": raw[10],
            "status": STATUS_MAP.get(raw[10], f"Unknown({raw[10]})"),
            "proofURI": raw[11],
            "disputeURI": raw[12],
        }

    def next_intent_id(self) -> int:
        return self.escrow.functions.nextIntentId().call()

    def owner(self) -> str:
        return self.escrow.functions.owner().call()

    def fee_recipient(self) -> str:
        return self.escrow.functions.feeRecipient().call()

    def usdc_balance(self, holder: str) -> int:
        return self.usdc.functions.balanceOf(Web3.to_checksum_address(holder)).call()

    def allowance(self, owner: str, spender: str = None) -> int:
        spender = spender or self.escrow.address
        return self.usdc.functions.allowance(Web3.to_checksum_address(owner), Web3.to_checksum_address(spender)).call()

    # ─── Write functions (require private_key) ────────────────────────────────

    def _send(self, contract_func, value=0) -> dict:
        """Sign and broadcast a transaction."""
        if not self.account:
            raise RuntimeError("Private key required. Pass private_key= to constructor.")

        gas_price = self.w3.eth.gas_price  # Dynamic base-fee gas price on Base
        tx = contract_func.build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "value": value,
            "maxFeePerGas": int(gas_price * 1.2),
            "maxPriorityFeePerGas": self.w3.to_wei("0.001", "gwei"),
        })
        signed = self.w3.eth.account.sign_transaction(tx, self.account.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return {
            "txHash": tx_hash.hex(),
            "status": receipt["status"],
            "gasUsed": receipt["gasUsed"],
            "block": receipt["blockNumber"],
        }

    def approve_usdc(self, amount: int, spender: str = None) -> dict:
        """Approve USDC for escrow. amount in USDC units (6 decimals)."""
        spender = spender or self.escrow.address
        return self._send(self.usdc.functions.approve(Web3.to_checksum_address(spender), amount))

    def create_intent(self, seller: str, amount_usdc: int, work_hash: str, work_uri: str,
                       work_timeout: int = 604800, review_period: int = 86400) -> dict:
        """Create a new intent. Returns {txHash, intentId}."""
        if isinstance(work_hash, str):
            work_hash = bytes.fromhex(work_hash.replace("0x", ""))
        if not isinstance(work_hash, (bytes, bytearray)) or len(work_hash) != 32:
            raise ValueError("workHash must be 32-byte hex string or bytes")

        func = self.escrow.functions.createIntent(
            Web3.to_checksum_address(seller),
            int(amount_usdc * (10 ** 6)),
            work_timeout,
            review_period,
            bytes(work_hash),
            work_uri,
        )
        return self._send(func)

    def submit_proof(self, intent_id: int, proof_uri: str) -> dict:
        """Seller submits proof (non-ZK)."""
        return self._send(self.escrow.functions.submitProof(intent_id, proof_uri))

    def release(self, intent_id: int) -> dict:
        """Buyer releases funds."""
        return self._send(self.escrow.functions.release(intent_id))

    # ─── Utility ──────────────────────────────────────────────────────────────

    @staticmethod
    def status_name(status_code: int) -> str:
        return STATUS_MAP.get(status_code, f"Unknown({status_code})")

    @staticmethod
    def usdc_units(amount: int) -> Decimal:
        """Convert raw units (e.g. 1000000) to human-readable (1.0)."""
        return Decimal(amount) / Decimal(10 ** 6)


# CLI sanity check
if __name__ == "__main__":
    import sys
    rpc = os.environ.get("BASE_RPC", "https://mainnet.base.org")
    client = AWMClient(rpc)
    print(f"Connected: {client.w3.is_connected()}")
    print(f"Block: {client.w3.eth.block_number}")
    print(f"Escrow owner: {client.owner()}")
    print(f"Next intent ID: {client.next_intent_id()}")
    print(f"Intent #2 status: {client.get_intent_status(2)}")
