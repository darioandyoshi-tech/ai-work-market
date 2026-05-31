#!/usr/bin/env python3
"""
Simple demonstration of the AWM concept: Agent A hires Agent B for content summarization.

This is a simplified simulation showing the workflow without actual blockchain interactions.
In a real implementation, this would interact with deployed smart contracts on a testnet.
"""

import json
import time
import hashlib
import uuid
from datetime import datetime, timedelta

class MockBlockchain:
    """Simulates blockchain interactions for demonstration purposes"""
    
    def __init__(self):
        self.escrow_contract = MockEscrowContract()
        self.ipfs = MockIPFS()
        print("🔧 Mock blockchain initialized")
    
    def get_balance(self, address):
        # Simulate checking USDC balance
        balances = {
            "0xAgentA00000000000000000000000000000000": 10.00,  # 10 USDC
            "0xAgentB00000000000000000000000000000000": 5.00   # 5 USDC
        }
        return balances.get(address, 0.0)
    
    def transfer_usdc(self, from_addr, to_addr, amount):
        print(f"💸 Transferring {amount} USDC from {from_addr[:10]}... to {to_addr[:10]}...")
        return True

class MockIPFS:
    """Simulates IPFS storage for demonstration"""
    
    def __init__(self):
        self.storage = {}
        self.counter = 0
    
    def add(self, data):
        """Store data and return a hash"""
        if isinstance(data, dict):
            data = json.dumps(data)
        elif not isinstance(data, str):
            data = str(data)
            
        # Generate a simple hash (in reality, this would be a real IPFS hash)
        hash_input = f"{data}{self.counter}{time.time()}"
        hash_value = hashlib.sha256(hash_input.encode()).hexdigest()[:16]
        self.counter += 1
        
        self.storage[hash_value] = data
        return f"Qm{hash_value}"
    
    def get(self, hash_value):
        """Retrieve data by hash"""
        # Remove Qm prefix if present
        clean_hash = hash_value.replace("Qm", "")
        return self.storage.get(clean_hash, f"Data not found for {hash_value}")

class MockEscrowContract:
    """Simulates the AWM escrow contract"""
    
    def __init__(self):
        self.offers = {}
        self.intents = {}
        self.next_offer_id = 1
        self.next_intent_id = 1
        self.balances = {}  # escrow balances by intentId
        print("📜 Mock escrow contract initialized")
    
    def create_offer(self, maker, total_price, nonce, expiry, uri, metadata):
        """Create a new offer"""
        offer_id = self.next_offer_id
        self.next_offer_id += 1
        
        offer = {
            "id": offer_id,
            "maker": maker,
            "taker": None,  # Filled when accepted
            "total_price": total_price,  # in wei (USDC has 6 decimals)
            "nonce": nonce,
            "expiry": expiry,
            "uri": uri,
            "metadata": metadata,
            "status": "created",
            "created_at": int(time.time())
        }
        
        self.offers[offer_id] = offer
        print(f"📝 Offer #{offer_id} created by {maker[:10]}... for {total_price/1e6} USDC")
        return offer_id
    
    def accept_offer(self, offer_id, taker):
        """Accept an offer (simplified - in reality would involve signing)"""
        if offer_id not in self.offers:
            return False, "Offer not found"
        
        offer = self.offers[offer_id]
        if offer["status"] != "created":
            return False, "Offer not available"
        
        if offer["maker"] == taker:
            return False, "Cannot accept your own offer"
        
        # Check if expiry has passed
        if time.time() > offer["expiry"]:
            offer["status"] = "expired"
            return False, "Offer expired"
        
        # Accept the offer
        offer["taker"] = taker
        offer["status"] = "accepted"
        
        # Create an intent (escrow agreement)
        intent_id = self.next_intent_id
        self.next_intent_id += 1
        
        intent = {
            "id": intent_id,
            "offer_id": offer_id,
            "buyer": offer["maker"],
            "seller": offer["taker"],
            "amount": offer["total_price"],
            "uri": offer["uri"],  # In real version, this would be content URI
            "status": "created",  # created, funded, working, completed, disputed, etc.
            "created_at": int(time.time()),
            "work_deadline": int(time.time()) + 24*60*60,  # 24 hours to complete
            "expiry": int(time.time()) + 7*24*60*60,       # 7 days total
        }
        
        self.intents[intent_id] = intent
        self.balances[intent_id] = offer["total_price"]  # Escrow the funds
        
        print(f"✅ Offer #{offer_id} accepted by {taker[:10]}...")
        print(f"🔐 Intent #{intent_id} created with {offer['total_price']/1e6} USDC escrowed")
        
        return True, intent_id
    
    def fund_intent(self, intent_id, funder):
        """Fund the intent (in real version, this would be done by the buyer)"""
        if intent_id not in self.intents:
            return False, "Intent not found"
        
        intent = self.intents[intent_id]
        if intent["buyer"] != funder:
            return False, "Only buyer can fund"
        
        if intent["status"] != "created":
            return False, "Intent not in fundable state"
        
        # In real version, this would transfer funds from buyer to contract
        intent["status"] = "funded"
        print(f"💰 Intent #{intent_id} funded by {funder[:10]}...")
        return True
    
    def start_work(self, intent_id, worker):
        """Start working on the intent"""
        if intent_id not in self.intents:
            return False, "Intent not found"
        
        intent = self.intents[intent_id]
        if intent["seller"] != worker:
            return False, "Only seller can start work"
        
        if intent["status"] != "funded":
            return False, "Intent not funded"
        
        intent["status"] = "working"
        intent["started_at"] = int(time.time())
        print(f"💼 Work started on intent #{intent_id} by {worker[:10]}...")
        return True
    
    def submit_work(self, intent_id, worker, result_uri):
        """Submit work result"""
        if intent_id not in self.intents:
            return False, "Intent not found"
        
        intent = self.intents[intent_id]
        if intent["seller"] != worker:
            return False, "Only seller can submit work"
        
        if intent["status"] != "working":
            return False, "Intent not in working state"
        
        intent["result_uri"] = result_uri
        intent["submitted_at"] = int(time.time())
        intent["status"] = "submitted"
        print(f"📤 Work submitted for intent #{intent_id} by {worker[:10]}...")
        print(f"   Result URI: {result_uri}")
        return True
    
    def verify_work(self, intent_id, verifier, approved=True):
        """Verify the work (simplified - in reality would be more complex)"""
        if intent_id not in self.intents:
            return False, "Intent not found"
        
        intent = self.intents[intent_id]
        # In a real system, verification might be done by:
        # - Oracle services
        # - Juror voting
        # - Automated checks
        # - Challenge periods
        
        if approved:
            intent["status"] = "completed"
            intent["verified_at"] = int(time.time())
            intent["verifier"] = verifier
            print(f"✅ Work verified and approved for intent #{intent_id} by {verifier[:10]}...")
            
            # In real version, this would release funds to seller
            print(f"💰 Releasing {intent['amount']/1e6} USDC to seller {intent['seller'][:10]}...")
            return True
        else:
            intent["status"] = "disputed"
            intent["disputed_at"] = int(time.time())
            print(f"⚠️  Work disputed for intent #{intent_id} by {verifier[:10]}...")
            return False
    
    def get_intent(self, intent_id):
        """Get intent details"""
        return self.intents.get(intent_id)
    
    def get_offer(self, offer_id):
        """Get offer details"""
        return self.offers.get(offer_id)

def simulate_content_summarization():
    """Simulate the content summarization workflow"""
    print("=" * 60)
    print("🚀 AWM Content Summarization Proof of Concept")
    print("=" * 60)
    
    # Initialize mock blockchain
    blockchain = MockBlockchain()
    ipfs = MockIPFS()
    
    # Define agent addresses
    AGENT_A = "0xAgentA00000000000000000000000000000000"  # Requestor
    AGENT_B = "0xAgentB00000000000000000000000000000000"  # Processor
    
    print(f"\n👤 Agent A (Requestor): {AGENT_A}")
    print(f"👤 Agent B (Processor): {AGENT_B}")
    print(f"💰 Agent A balance: {blockchain.get_balance(AGENT_A)} USDC")
    print(f"💰 Agent B balance: {blockchain.get_balance(AGENT_B)} USDC")
    
    # Step 1: Agent A finds an article they want summarized
    print("\n" + "=" * 60)
    print("📋 STEP 1: Agent A identifies work needed")
    print("=" * 60)
    
    article_url = "https://example.com/long-article-about-ai"
    print(f"🔍 Agent A wants to summarize: {article_url}")
    
    # Create request metadata
    request_data = {
        "url": article_url,
        "format": "3 bullet points, max 100 words each",
        "max_length": 100,
        "timestamp": int(time.time()),
        "request_id": str(uuid.uuid4())
    }
    
    # Store request on IPFS
    request_ipfs = ipfs.add(request_data)
    print(f"📄 Request stored on IPFS: {request_ipfs}")
    print(f"📋 Request details: {json.dumps(request_data, indent=2)}")
    
    # Step 2: Agent A creates an offer
    print("\n" + "=" * 60)
    print("📝 STEP 2: Agent A creates offer")
    print("=" * 60)
    
    # Create offer parameters
    total_price = 1 * 10**6  # 1.00 USDC (6 decimals)
    nonce = int(time.time()) % 10000
    expiry = int(time.time()) + 24 * 60 * 60  # 24 hours from now
    
    # Create the offer
    offer_id = blockchain.escrow_contract.create_offer(
        maker=AGENT_A,
        total_price=total_price,
        nonce=nonce,
        expiry=expiry,
        uri=request_ipfs,
        metadata=hashlib.sha256(json.dumps(request_data, sort_keys=True).encode()).hexdigest()
    )
    
    # Step 3: Agent B discovers and accepts the offer
    print("\n" + "=" * 60)
    print("🔍 STEP 3: Agent B discovers and accepts offer")
    print("=" * 60)
    
    # Simulate Agent B scanning for offers
    print("🔍 Agent B scanning for available offers...")
    time.sleep(1)  # Simulate scanning delay
    
    # Check the offer
    offer = blockchain.escrow_contract.get_offer(offer_id)
    if offer and offer["status"] == "created":
        print(f"✅ Found offer #{offer_id}: {offer['total_price']/1e6} USDC for content summarization")
        
        # Agent B decides to accept
        success, result = blockchain.escrow_contract.accept_offer(offer_id, AGENT_B)
        if success:
            intent_id = result
            print(f"🎯 Offer accepted! Intent #{intent_id} created")
            
            # Fund the intent (Agent B would normally do this, but for simplicity we'll have Agent A fund)
            blockchain.escrow_contract.fund_intent(intent_id, AGENT_A)
        else:
            print(f"❌ Failed to accept offer: {result}")
            return
    else:
        print("❌ No suitable offers found")
        return
    
    # Step 4: Agent B does the work (off-chain)
    print("\n" + "=" * 60)
    print("💼 STEP 4: Agent B performs the work (off-chain)")
    print("=" * 60)
    
    print("🔍 Agent B retrieving request from IPFS...")
    request_data_from_ipfs = ipfs.get(request_ipfs)
    #print(f"📥 Request data: {request_data_from_ipfs}")
    
    # Handle the case where we might get a string or dict
    if isinstance(request_data_from_ipfs, dict):
        request_data_parsed = request_data_from_ipfs
    elif isinstance(request_data_from_ipfs, str) and request_data_from_ipfs.startswith("{") and request_data_from_ipfs.endswith("}"):
        try:
            request_data_parsed = json.loads(request_data_from_ipfs)
        except:
            request_data_parsed = request_data  # fallback to original
    else:
        request_data_parsed = request_data  # fallback to original
    
    article_url = request_data_parsed.get("url", article_url)
    print(f"📄 Agent B will summarize: {article_url}")
    
    # Simulate the work process
    print("📖 Agent B fetching article...")
    time.sleep(1)
    print("🧠 Agent B analyzing content...")
    time.sleep(1)
    print("✍️  Agent B creating summary...")
    time.sleep(1)
    
    # Create the summary result
    summary_data = {
        "summary": "• Artificial intelligence is transforming industries through automation and insights\n• Machine learning enables systems to improve from experience without explicit programming\n• Ethical considerations are crucial as AI systems become more prevalent in society",
        "source_url": article_url,
        "word_count": 28,
        "format": "3 bullet points",
        "completed_at": int(time.time()),
        "agent_id": AGENT_B
    }
    
    # Store result on IPFS
    result_ipfs = ipfs.add(summary_data)
    print(f"📄 Summary stored on IPFS: {result_ipfs}")
    print(f"📋 Summary content:\n{summary_data['summary']}")
    
    # Step 5: Agent B submits the work
    print("\n" + "=" * 60)
    print("📤 STEP 5: Agent B submits work result")
    print("=" * 60)
    
    success = blockchain.escrow_contract.submit_work(intent_id, AGENT_B, result_ipfs)
    if success:
        print("✅ Work submitted successfully")
    else:
        print("❌ Failed to submit work")
        return
    
    # Step 6: Verification (simplified)
    print("\n" + "=" * 60)
    print("🔍 STEP 6: Work verification")
    print("=" * 60)
    
    # In a real system, this might involve:
    # - Automatic checks against source material
    # - Oracle services
    # - Juror voting
    # - Challenge periods
    
    print("🔍 Verifying work against source...")
    # Simple verification: check that summary mentions key concepts
    summary_text = summary_data["summary"].lower()
    key_concepts = ["artificial intelligence", "machine learning", "ethical"]
    matches = sum(1 for concept in key_concepts if concept in summary_text)
    
    if matches >= 2:  # At least 2 out of 3 key concepts found
        print(f"✅ Verification passed: {matches}/3 key concepts found in summary")
        verified = True
    else:
        print(f"❌ Verification failed: only {matches}/3 key concepts found")
        verified = False
    
    # Submit verification result
    if verified:
        success = blockchain.escrow_contract.verify_work(intent_id, "0xVerifier00000000000000000000000000000000", approved=True)
        if success:
            print("🎉 Work verified and approved!")
        else:
            print("❌ Verification submission failed")
            return
    else:
        print("❌ Work verification failed - would enter dispute process")
        # In a real system, this would trigger dispute resolution
        return
    
    # Step 7: Payment release (simulated)
    print("\n" + "=" * 60)
    print("💰 STEP 7: Payment release")
    print("=" * 60)
    
    intent = blockchain.escrow_contract.get_intent(intent_id)
    if intent and intent["status"] == "completed":
        amount_usdc = intent["amount"] / 1e6
        print(f"💰 Releasing {amount_usdc} USDC from escrow to Agent B")
        print(f"📬 Transaction: Escrow → {AGENT_B[:10]}...")
        
        # Update balances (simulated)
        # In real version, this would be an actual blockchain transaction
        print(f"💰 Agent B new balance: {blockchain.get_balance(AGENT_B) + amount_usdc} USDC")
        print(f"💰 Agent A new balance: {blockchain.get_balance(AGENT_A) - amount_usdc} USDC")
        
        print("✅ Payment released successfully!")
    else:
        print("❌ Intent not in completed state - payment not released")
        return
    
    # Final summary
    print("\n" + "=" * 60)
    print("🎉 PROOF OF COMPLETE SUCCESSFULLY")
    print("=" * 60)
    print("✅ Agent A created offer for content summarization")
    print("✅ Agent B discovered and accepted the offer")
    print("✅ 1.00 USDC escrowed in secure contract")
    print("✅ Agent B performed work off-chain")
    print("✅ Agent B submitted result to IPFS")
    print("✅ Work verified and approved")
    print("✅ Payment released from escrow to Agent B")
    print("\n📊 Summary of transactions:")
    print(f"   • Offer #{offer_id} created and accepted")
    print(f"   • Intent #{intent_id} created, funded, and completed")
    print(f"   • {total_price/1e6} USDC successfully escrowed and released")
    print(f"   • Request IPFS: {request_ipfs}")
    print(f"   • Result IPFS: {result_ipfs}")
    print("\n🔧 This demonstrates the core AWM value proposition:")
    print("   Trustless escrow for agent-to-agent services with")
    print("   automated verification and payment release.")
    print("=" * 60)

if __name__ == "__main__":
    simulate_content_summarization()