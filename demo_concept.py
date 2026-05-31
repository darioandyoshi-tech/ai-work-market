#!/usr/bin/env python3
"""
Simple test of the AWM concept - demonstrates the workflow with mocked blockchain calls.
"""

import json
import time
import hashlib
import uuid
import os
from datetime import datetime, timedelta

def demo_workflow():
    """Demonstrate the AWM workflow concept"""
    print("=" * 60)
    print("🎯 AWM Concept Demonstration")
    print("=" * 60)
    print("This demonstrates the workflow without actual blockchain transactions")
    print("to show how the system would work when properly configured.")
    print()
    
    # Step 1: Agent A identifies work they need done
    print("📋 STEP 1: Agent A identifies work needed")
    print("-" * 40)
    article_url = "https://example.com/long-article-about-ai"
    print(f"Agent A wants to summarize: {article_url}")
    
    # Create request metadata
    request_data = {
        "url": article_url,
        "format": "3 bullet points, max 100 words each",
        "max_length": 100,
        "timestamp": int(time.time()),
        "request_id": str(uuid.uuid4())
    }
    
    # Simulate storing on IPFS (in real implementation, this would use ipfshttpclient)
    request_ipfs = f"Qm{hashlib.sha256(str(request_data).encode()).hexdigest()[:34]}"
    print(f"Request stored on IPFS: {request_ipfs}")
    print(f"Request details: {json.dumps(request_data, indent=2)}")
    print()
    
    # Step 2: Agent A creates an offer
    print("📝 STEP 2: Agent A creates offer")
    print("-" * 40)
    total_price = 1 * 10**6  # 1.00 USDC (6 decimals)
    nonce = int(time.time()) % 10000
    expiry = int(time.time()) + 24 * 60 * 60  # 24 hours from now
    
    # Create metadata hash
    metadata = hashlib.sha256(json.dumps(request_data, sort_keys=True).encode()).hexdigest()
    
    print(f"Offer details:")
    print(f"  Price: {total_price/1e6} USDC")
    print(f"  Nonce: {nonce}")
    print(f"  Expiry: {expiry} ({time.ctime(expiry)})")
    print(f"  Request IPFS: {request_ipfs}")
    print(f"  Metadata hash: {metadata}")
    print()
    
    # Simulate offer creation on blockchain
    offer_id = int(time.time()) % 10000
    print(f"Offer #{offer_id} created on blockchain")
    print()
    
    # Step 3: Agent B discovers and accepts the offer
    print("🔍 STEP 3: Agent B discovers and accepts offer")
    print("-" * 40)
    print("Agent B scans for offers...")
    time.sleep(1)
    print(f"Found offer #{offer_id}: {total_price/1e6} USDC for content summarization")
    print("Agent B decides to accept the offer")
    
    # Simulate offer acceptance
    intent_id = int(time.time()) % 10000 + 1000
    print(f"Offer accepted! Intent #{intent_id} created")
    print()
    
    # Step 4: Agent A funds the intent
    print("💰 STEP 4: Agent A funds the intent")
    print("-" * 40)
    print("Agent A funds the intent with 1.00 USDC")
    print(f"Intent #{intent_id} funded")
    print()
    
    # Step 5: Agent B does the work (off-chain)
    print("💼 STEP 5: Agent B performs the work (off-chain)")
    print("-" * 40)
    print("Agent B retrieves request from IPFS...")
    print(f"Retrieved request: {request_data['url']}")
    
    # Simulate the work process
    print("Agent B fetching article...")
    time.sleep(1)
    print("Agent B analyzing content...")
    time.sleep(1)
    print("Agent B creating summary...")
    time.sleep(1)
    
    # Create the summary result
    summary_data = {
        "summary": "• Artificial intelligence is transforming industries through automation and insights\n• Machine learning enables systems to improve from experience without explicit programming\n• Ethical considerations are crucial as AI systems become more prevalent in society",
        "source_url": article_url,
        "word_count": 28,
        "format": "3 bullet points",
        "completed_at": int(time.time()),
        "agent_id": "agent_b_address"
    }
    
    # Simulate storing result on IPFS
    result_ipfs = f"Qm{hashlib.sha256(str(summary_data).encode()).hexdigest()[:34]}"
    print(f"Summary stored on IPFS: {result_ipfs}")
    print(f"Summary content:\n{summary_data['summary']}")
    print()
    
    # Step 6: Agent B submits the work
    print("📤 STEP 6: Agent B submits work result")
    print("-" * 40)
    print("Agent B submits work to blockchain...")
    print(f"Work submitted for intent #{intent_id}")
    print(f"Result IPFS: {result_ipfs}")
    print()
    
    # Step 7: Verification
    print("🔍 STEP 7: Work verification")
    print("-" * 40)
    print("Verifying work against source...")
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
    
    if verified:
        print("Verification submitted to blockchain...")
        print("Work verified and approved!")
        print("Releasing funds to seller...")
    else:
        print("Verification failed - would enter dispute process")
        return
    
    print()
    
    # Step 8: Payment release
    print("💰 STEP 8: Payment release")
    print("-" * 40)
    amount_usdc = total_price / 1e6
    print(f"Releasing {amount_usdc} USDC from escrow to Agent B")
    print(f"Transaction: Escrow → Agent B")
    
    # Simulate balance updates
    print(f"Agent B new balance: {amount_usdc} USDC")
    print(f"Agent A new balance: 0.0 USDC (spent {amount_usdc} USDC)")
    print()
    
    # Final summary
    print("=" * 60)
    print("🎉 WORKFLOW COMPLETE")
    print("=" * 60)
    print("✅ Agent A created offer for content summarization")
    print("✅ Agent B discovered and accepted the offer")
    print("✅ 1.00 USDC escrowed in secure contract")
    print("✅ Agent B funded the intent")
    print("✅ Agent B performed work off-chain")
    print("✅ Agent B submitted result to IPFS")
    print("✅ Work verified and approved")
    print("✅ Payment released from escrow to Agent B")
    print()
    print("📊 Summary of transactions:")
    print(f"   • Offer #{offer_id} created and accepted")
    print(f"   • Intent #{intent_id} created, funded, and completed")
    print(f"   • {total_price/1e6} USDC successfully escrowed and released")
    print(f"   • Request IPFS: {request_ipfs}")
    print(f"   • Result IPFS: {result_ipfs}")
    print()
    print("🔧 This demonstrates the core AWM value proposition:")
    print("   Trustless escrow for agent-to-agent services with")
    print("   automated verification and payment release.")
    print("=" * 60)


if __name__ == "__main__":
    demo_workflow()