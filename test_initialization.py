#!/usr/bin/env python3
"""
Simple test of live demo initialization - checks configuration and connectivity
without attempting to send transactions.
"""

import os
from web3 import Web3
from eth_account import Account

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

def test_initialization():
    print("=" * 60)
    print("🧪 AWM Live Demo Initialization Test")
    print("=" * 60)
    
    try:
        # Initialize Web3 connection
        rpc_url = os.getenv('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org')
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            raise ConnectionError("Failed to connect to Sepolia RPC")
        print("🔗 Connected to Sepolia: ✅")
        
        # Load account from private key
        private_key = os.getenv('PRIVATE_KEY')
        if not private_key:
            raise ValueError("PRIVATE_KEY not found in environment")
        account = Account.from_key(private_key)
        address = account.address
        print(f"📍 Account: {address}")
        
        # Contract addresses
        contract_address = os.getenv('ESCROW', '0x489C36738F46e395b4cd26DDf0f85756686A2f07')
        usdc_address = os.getenv('USDC', '0x036CbD53842c5426634e7929541eC2318f3dCF7e')
        print(f"📄 AWM Contract: {contract_address}")
        print(f"💵 USDC Contract: {usdc_address}")
        
        # Try to get balances
        try:
            # ETH balance
            eth_balance = w3.from_wei(w3.eth.get_balance(address), 'ether')
            print(f"💰 ETH Balance: {eth_balance}")
            
            # USDC balance (simple ERC20)
            usdc_abi = [{"constant":True,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}]
            usdc_contract = w3.eth.contract(address=usdc_address, abi=usdc_abi)
            usdc_balance = usdc_contract.functions.balanceOf(address).call() / 1e6
            print(f"💵 USDC Balance: {usdc_balance}")
        except Exception as e:
            print(f"⚠️  Could not retrieve balances: {e}")
            print("   This might be due to network issues or contract not being accessible.")
        
        # Check if we have sufficient balance for a test
        if usdc_balance < 1.0:
            print(f"\n⚠️  Warning: USDC balance is less than 1.0. A live test would fail.")
            print(f"   Please fund the account with Sepolia USDC for testing.")
        else:
            print(f"\n✅ Sufficient USDC balance for testing (≥1.0 USDC)")
        
        print(f"\n✅ Initialization successful! The demo is ready to run.")
        print(f"   To run a full live demo, execute: python poc/demo_live.py")
        print(f"   (or the improved version once the transaction bug is fixed)")
        
    except Exception as e:
        print(f"❌ Initialization failed: {e}")
        print("\n📋 Setup Guidance:")
        print("   1. Ensure you have a .env file with the following variables:")
        print("      BASE_SEPOLIA_RPC_URL=https://sepolia.base.org")
        print("      PRIVATE_KEY=your_sepolia_account_private_key")
        print("      ESCROW=0x489C36738F46e395b4cd26DDf0f85756686A2f07 (optional, default)")
        print("      USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e (optional, default)")
        print("   2. The account in PRIVATE_KEY must have:")
        print("      - Sepolia ETH for gas (can get from faucet)")
        print("      - Sepolia USDC for escrow (can get from faucet)")
        print("   3. Install required packages:")
        print("      pip install web3 eth-account dotenv")
        print("   4. For IPFS functionality, optionally install:")
        print("      pip install ipfshttpclient")
        print("      (or ensure an IPFS daemon is running)")

if __name__ == "__main__":
    test_initialization()