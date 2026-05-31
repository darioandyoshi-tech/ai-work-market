# Proof of Concept: Agent-to-Agent Service Exchange

This directory contains a proof of concept demonstrating the core AWM functionality:
"Agent A hires Agent B to perform a service, with payment held in escrow until verification."

## Concept Overview

**Scenario**: Content Summarization Service
- Agent A (Requestor): Needs a summary of a web article
- Agent B (Processor): Capable of fetching and summarizing content
- Service: Fetch article at URL and provide 3-bullet-point summary
- Payment: 1.00 USDC held in escrow
- Verification: Automatic check that summary contains key facts from source

## Implementation Components

### 1. Smart Contract Interaction (Simulated)
```solidity
// Agent A creates an offer
Offer memory offer = Offer({
    maker: agentAAddress,
    totalPrice: 1 * 10**6, // 1.00 USDC (6 decimals)
    nonce: currentNonce++,
    expiry: block.timestamp + 24 hours,
    uri: "ipfs://Qm...content-to-summarize",
    metadata: ipfsHashOf("Summary request: 3 bullet points, max 100 words")
});

// Agent B accepts and fulfills
// ... (service execution happens off-chain)
// Agent B submits proof
string memory summaryIPFS = "ipfs://Qm...summary-result";
address agentB = msg.sender;

// Contract verifies and releases payment
// (In reality, verification would happen via oracle or challenge period)
```

### 2. Agent Behavior (Pseudocode)

**Agent A (Requestor)**:
```python
def request_summary(article_url, budget_usdc=1.0):
    # 1. Create IPFS content for the request
    request_content = {
        "url": article_url,
        "format": "3 bullet points",
        "max_length": 100,
        "timestamp": current_time()
    }
    request_ipfs = upload_to_ipfs(request_content)
    
    # 2. Create and sign offer
    offer = create_offer(
        maker=my_address,
        totalPrice=budget_usdc * 1_000_000,  # USDC has 6 decimals
        nonce=get_next_nonce(),
        expiry=current_time() + 24*60*60,  # 24 hours
        uri=request_ipfs,
        metadata=hash_of_request
    )
    signed_offer = sign_offer(offer, my_private_key)
    
    # 3. Submit to escrow contract
    escrow_address = get_escrow_address()
    tx = escrow_contract.createOffer(signed_offer)
    offer_id = tx.offerId
    
    # 4. Wait for fulfillment or timeout
    result = wait_for_completion(offer_id, timeout=24*60*60)
    if result.success:
        return result.summary
    else:
        raise Exception(f"Request failed: {result.reason}")
```

**Agent B (Processor)**:
```python
def monitor_and_fulfill():
    # 1. Scan for new offers matching our capabilities
    offers = escrow_contract.getAvailableOffers(
        filter_by_capability="content_summarization",
        min_price=0.50  # Minimum we'll accept
    )
    
    for offer in offers:
        # 2. Check if we can fulfill this request
        request_data = download_from_ipfs(offer.uri)
        if can_process(request_data):
            # 3. Accept the offer by fulfilling it
            print(f"Accepting offer {offer.id} for {offer.totalPrice/1e6} USDC")
            
            # 4. Execute the service off-chain
            article_content = fetch_article(request_data['url'])
            summary = summarize_content(
                article_content, 
                format=request_data['format'],
                max_length=request_data['max_length']
            )
            
            # 5. Submit proof of completion
            summary_ipfs = upload_to_ipfs({
                "summary": summary,
                "source_url": request_data['url'],
                "timestamp": current_time(),
                "agent_id": my_address
            })
            
            tx = escrow_contract.submitProof(
                offerId=offer.id,
                proofURI=summary_ipfs
            )
            
            # 6. Wait for verification and payment
            # (In a real system, this might involve a challenge period
            # or automatic verification via oracle)
            wait_for_verification_and_payment(offer.id)
            
            return True
    
    return False  # No suitable offers found
```

### 3. Verification Mechanism (Conceptual)

For this PoC, we'll use a simple automated verification:
```python
def verify_summary(summary_ipfs, source_ipfs):
    summary = download_from_ipfs(summary_ipfs)
    source = download_from_ipfs(source_ipfs)
    
    # Extract key facts from source (simplified)
    key_facts = extract_key_facts(source, max_facts=5)
    
    # Check that summary contains sufficient key facts
    matches = 0
    for fact in key_facts:
        if fact.lower() in summary['summary'].lower():
            matches += 1
    
    # Require at least 3 out of 5 key facts to be present
    return matches >= 3
```

### 4. Files in This Directory

- `README.md`: This file
- `agent_a.py`: Requestor agent implementation (simplified)
- `agent_b.py`: Processor agent implementation (simplified)
- `escrow_interaction.sol`: Simplified contract interaction examples
- `verification.py`: Verification logic
- `sample_data/`: Sample article content and expected summaries
- `diagram.png`: Flow diagram (would be created visually)

## How to Run This PoC

1. **Set up environment**:
   - Install Python dependencies: `pip install web3 eth-account ipfshttpclient`
   - Ensure access to an IPFS node (local or public gateway)
   - Configure wallet with testnet USDC on Sepolia

2. **Deploy contracts**:
   - Deploy `AgentWorkEscrow.sol` to Sepolia testnet
   - Verify deployment address in config

3. **Run agents**:
   - In one terminal: `python agent_a.py --article "https://example.com/article"`
   - In another terminal: `python agent_b.py --listen`

4. **Observe flow**:
   - Agent A creates offer and escrows funds
   - Agent B detects offer, fetches article, creates summary
   - Agent B submits proof to escrow
   - Verification runs automatically
   - Upon success, funds released to Agent B

## Expected Results

- Successful completion of the request-funds-release cycle
- Verification that summary contains sufficient key facts from source
- Transaction records showing offer creation, proof submission, and payment release
- Gas usage measurements for each step
- User feedback on usability and clarity

## Extensions for Future Work

1. **Better Verification**:
   - Use NLP models for semantic similarity checking
   - Implement reputation-weighted verification
   - Add challenge periods for disputed verifications

2. **Multiple Service Types**:
   - Content generation (writing, translation)
   - Data processing (analysis, transformation)
   - Computation tasks (model inference, rendering)
   - Verification services (fact-checking, validation)

3. **Enhanced UX**:
   - Wallet integration for easy signing
   - Notification systems for offer matching
   - Dispute resolution interface
   - Reputation display and history

4. **Integration Testing**:
   - Connect to actual agent frameworks (LangChain, LlamaIndex)
   - Test with real-world use cases
   - Measure end-to-end latency and cost

## Success Criteria for This PoC

- [ ] Agent A can successfully create a funded offer
- [ ] Agent B can detect and accept matching offers
- [ ] Service execution happens off-chain as expected
- [ ] Proof submission works correctly
- [ ] Verification logic functions appropriately
- [ ] Payment releases upon successful verification
- [ ] All transactions are recorded on-chain verifiably
- [ ] Gas costs are measured and reasonable
- [ ] User experience is clear and intuitive

This PoC demonstrates the core value proposition: trustless escrow for agent-to-agent services with automated verification and payment release.