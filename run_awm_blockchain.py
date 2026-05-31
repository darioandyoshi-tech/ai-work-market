#!/usr/bin/env python3
"""
Full AWM automation loop with real blockchain transactions:
  - register agents & work (if not already present)
  - create real intents on blockchain
  - submit proof and release payments via smart contract
  - track actual earnings and fees
  - repeat until interrupted (Ctrl-C)

Requires:
  - web3.py installed
  - .env with BASE_SEPOLIA_RPC_URL, PRIVATE_KEY, AWM_CONTRACT_ADDRESS
"""

import os
import time
import logging
import hashlib
from typing import List, Optional, Dict, Any

# Try to import blockchain dependencies, fall back to simulation if missing
try:
    from web3 import Web3
    from eth_account import Account
    BLOCKCHAIN_AVAILABLE = True
except ImportError:
    BLOCKCHAIN_AVAILABLE = False
    logging.warning("Blockchain dependencies not available - running in simulation mode")

# Import the AWM integration and discovery
from awm_integration_final import AWMIntegration
from discovery_system import AWMDiscovery
from dotenv import load_dotenv

# ----------------------------------------------------------------------
# Configuration (feel free to tweak)
# ----------------------------------------------------------------------
LOOP_INTERVAL_SEC = 5           # how long to wait between cycles (reduced for testing)
MAX_ITERATIONS = 1            # None = run forever; set an int for a limited run (set to 1 for testing)
FEE_BPS = 50                    # basis points (50 = 0.5%)
TOKEN_DECIMALS = 6              # USDC has 6 decimals
# ----------------------------------------------------------------------


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)


def get_or_create_agent(dsc: AWMDiscovery, name: str, capabilities: List[str], wallet: str, metadata: Dict) -> str:
    """Get an existing agent by name, or create a new one if it doesn't exist.
    Updates the wallet, capabilities, and metadata to the provided values.
    Also sets the status to "available" and clears the current_task.
    Returns the agent ID."""
    # Look for an existing agent by name
    for agent in dsc.data.get("available_agents", []):
        if agent["name"] == name:
            # Update the wallet, capabilities, and metadata
            agent["wallet_address"] = wallet
            agent["capabilities"] = capabilities
            agent["metadata"] = metadata
            agent["status"] = "available"
            agent["current_task"] = None
            dsc._save_data()
            logging.info(f"Updated agent '{name}' -> wallet: {wallet}, capabilities: {capabilities}, status: available")
            return agent["id"]
    # Otherwise, create a new one
    aid = dsc.register_agent(name, capabilities, wallet, metadata)
    logging.info(f"Created new agent '{name}' -> {aid}")
    return aid


def to_checksum_address(address: str) -> str:
    """Convert an address to checksum format, handling edge cases."""
    if not address or not address.startswith('0x'):
        return address
    try:
        return Web3.to_checksum_address(address)
    except Exception as e:
        logging.warning(f"Failed to convert address {address} to checksum: {e}")
        return address


def load_env() -> dict:
    """Load .env file and return configuration."""
    load_dotenv()
    config = {
        "rpc_url": os.getenv("BASE_SEPOLIA_RPC_URL"),
        "private_key": os.getenv("PRIVATE_KEY"),
        "contract_address": os.getenv("AWM_CONTRACT_ADDRESS", "0x489C36738F46e395b4cd26DDf0f85756686A2f07")
    }
    
    if not config["rpc_url"] or not config["private_key"]:
        raise RuntimeError("BASE_SEPOLIA_RPC_URL or PRIVATE_KEY not set in environment")
        
    return config


def generate_work_hash(uri: str) -> bytes:
    """Generate a bytes32 hash from a URI for use with the AWM contract."""
    return Web3.keccak(text=uri)


def process_work_with_blockchain(awm: AWMIntegration, dsc: AWMDiscovery, work_id: str, agent_id: str) -> float:
    """
    Process a work item using real blockchain transactions:
    1. Create an intent on-chain
    2. Submit proof (dummy for now)
    3. Release payment
    4. Return the fee amount earned
    """
    work_obj = dsc.get_work_request_by_id(work_id)
    if work_obj is None:
        logging.warning(f"Work {work_id} not found.")
        return 0.0
        
    budget = work_obj.get("budget_usdc", 0.0)
    if budget <= 0:
        logging.warning(f"Work {work_id} has no budget.")
        return 0.0
        
    # Get agent info
    agent_obj = dsc.get_agent_by_id(agent_id)
    if agent_obj is None:
        logging.warning(f"Agent {agent_id} not found.")
        return 0.0
        
    agent_wallet = agent_obj.get("wallet_address", "")
    if not agent_wallet:
        logging.warning(f"Agent {agent_id} has no wallet address - skipping blockchain transaction.")
        return 0.0
        
    # Convert to checksum address
    agent_wallet = to_checksum_address(agent_wallet)
    if not agent_wallet:
        logging.warning(f"Agent {agent_id} has invalid wallet address - skipping blockchain transaction.")
        return 0.0
        
    # Convert budget to wei (USDC has 6 decimals)
    budget_wei = int(budget * 10**TOKEN_DECIMALS)
    
    # Use the work description as URI (simplified - in reality would be IPFS hash)
    work_uri = work_obj.get("description", "")[:100]  # Limit length
    work_hash = generate_work_hash(work_uri)
    
    try:
        # Step 1: Create intent on blockchain
        logging.info(f"Creating intent for work {work_id} with budget {budget} USDC...")
        
        # Build transaction for createIntent
        # Based on ABI: createIntent(address seller, uint256 amount, uint256 workTimeoutSeconds, uint256 reviewPeriodSeconds, bytes32 workHash, string workURI)
        # The caller (awm.account.address) is the buyer
        nonce = awm.w3.eth.get_transaction_count(awm.account.address)
        create_txn = awm.contract.functions.createIntent(
            agent_wallet,         # seller (agent)
            budget_wei,           # amount
            3600,                 # workTimeoutSeconds (1 hour)
            1800,                 # reviewPeriodSeconds (30 minutes)
            work_hash,            # workHash
            work_uri              # workURI
        ).build_transaction({
            'from': awm.account.address,
            'nonce': nonce,
            'gas': 200000,
            'gasPrice': awm.w3.eth.gas_price * 2  # Double the gas price to increase chance of being mined
        })
        
        # Sign and send transaction
        signed_txn = awm.account.sign_transaction(create_txn)
        # Handle both old and new web3.py versions
        raw_tx = getattr(signed_txn, 'rawTransaction', getattr(signed_txn, 'raw_transaction', None))
        if raw_tx is None:
            raise AttributeError("SignedTransaction object has no raw transaction attribute")
        tx_hash = awm.w3.eth.send_raw_transaction(raw_tx)
        tx_receipt = awm.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if tx_receipt.status != 1:
            print(f"Transaction receipt for createIntent: {tx_receipt}")
            raise Exception(f"Iint creation transaction failed: {tx_hash.hex()}")
            
        # Extract intentId from logs
        intent_id = None
        for log in tx_receipt.logs:
            try:
                decoded = awm.contract.events.IntentCreated().process_log(log)
                intent_id = decoded.args.intentId
                break
            except:
                continue
                
        if intent_id is None:
            # Fallback: get nextIntentId and subtract 1
            next_id = awm.contract.functions.nextIntentId().call()
            intent_id = next_id - 1
            
        logging.info(f"Intent created with ID: {intent_id}")
        
        # Step 2: Submit proof (dummy for now)
        dummy_proof = "ipfs://bafybeigdyrzt5wfp7ud7h7hub5n6fbqu6yzdiwaj3yhl2b2yp4ibxymvuu/sample-proof"
        logging.info(f"Submitting proof for intent {intent_id}...")
        
        nonce = awm.w3.eth.get_transaction_count(awm.account.address)
        proof_txn = awm.contract.functions.submitProof(
            intent_id,
            dummy_proof
        ).build_transaction({
            'from': awm.account.address,
            'nonce': nonce,
            'gas': 150000,
            'gasPrice': awm.w3.eth.gas_price * 2
        })
        
        signed_proof_txn = awm.account.sign_transaction(proof_txn)
        raw_proof_tx = getattr(signed_proof_txn, 'rawTransaction', getattr(signed_proof_txn, 'raw_transaction', None))
        if raw_proof_tx is None:
            raise AttributeError("SignedTransaction object has no raw transaction attribute")
        proof_tx_hash = awm.w3.eth.send_raw_transaction(raw_proof_tx)
        proof_receipt = awm.w3.eth.wait_for_transaction_receipt(proof_tx_hash, timeout=120)
        
        if proof_receipt.status != 1:
            print(f"Transaction receipt for submitProof: {proof_receipt}")
            raise Exception(f"Proof submission transaction failed: {proof_tx_hash.hex()}")
            
        logging.info(f"Proof submitted for intent {intent_id}")
        
        # Step 3: Release payment
        logging.info(f"Releasing payment for intent {intent_id}...")
        
        nonce = awm.w3.eth.get_transaction_count(awm.account.address)
        release_txn = awm.contract.functions.release(
            intent_id
        ).build_transaction({
            'from': awm.account.address,
            'nonce': nonce,
            'gas': 150000,
            'gasPrice': awm.w3.eth.gas_price * 2
        })
        
        signed_release_txn = awm.account.sign_transaction(release_txn)
        raw_release_tx = getattr(signed_release_txn, 'rawTransaction', getattr(signed_release_txn, 'raw_transaction', None))
        if raw_release_tx is None:
            raise AttributeError("SignedTransaction object has no raw transaction attribute")
        release_tx_hash = awm.w3.eth.send_raw_transaction(raw_release_tx)
        release_receipt = awm.w3.eth.wait_for_transaction_receipt(release_tx_hash, timeout=120)
        
        if release_receipt.status != 1:
            print(f"Transaction receipt for release: {release_receipt}")
            raise Exception(f"Release transaction failed: {release_tx_hash.hex()}")
            
        logging.info(f"Payment released for intent {intent_id}")
        
        # Calculate fee
        fee_amount = budget * FEE_BPS / 10000.0
        agent_amount = budget - fee_amount
        
        # Update local records to reflect completion
        if dsc.complete_work(work_id, proof_uri=dummy_proof, actual_payment=budget):
            # Update agent earnings
            update_agent_earnings(dsc, work_id, agent_amount)
            logging.info(f"Agent {agent_obj['name']} earned {agent_amount:.2f} USDC (fee: {fee_amount:.2f} USDC)")
            return fee_amount
        else:
            logging.warning(f"Failed to mark work {work_id} as completed locally.")
            return 0.0
            
    except Exception as e:
        logging.error(f"Error processing work {work_id} on blockchain: {e}")
        return 0.0


def update_agent_earnings(dsc: AWMDiscovery, work_id: str, agent_amount: float) -> None:
    """Update the agent's earnings in the local database."""
    work_obj = dsc.get_work_request_by_id(work_id)
    if work_obj is None:
        return
        
    assigned_to = work_obj.get("assigned_to")
    if not assigned_to:
        return
        
    agent_obj = dsc.get_agent_by_id(assigned_to)
    if agent_obj is None:
        return
        
    # Update agent's total_earned
    agent_obj["total_earned"] = agent_obj.get("total_earned", 0.0) + agent_amount
    agent_obj["total_completed"] = agent_obj.get("total_completed", 0) + 1
    
    # Save the updated agent data
    dsc._save_data()


def process_work_simulated(dsc: AWMDiscovery, work_id: str, agent_id: str) -> float:
    """Process work in simulation mode (original behavior)."""
    work_obj = dsc.get_work_request_by_id(work_id)
    if work_obj is None:
        logging.warning(f"Work {work_id} not found.")
        return 0.0
        
    budget = work_obj.get("budget_usdc", 0.0)
    if budget <= 0:
        logging.warning(f"Work {work_id} has no budget.")
        return 0.0
        
    # Calculate fee
    fee_amount = budget * FEE_BPS / 10000.0
    agent_amount = budget - fee_amount
    
    # Update agent earnings and mark as completed
    if dsc.complete_work(work_id, proof_uri="ipfs://simulated-proof", actual_payment=budget):
        update_agent_earnings(dsc, work_id, agent_amount)
        logging.info(f"Agent [SIM] {agent_obj['name']} earned {agent_amount:.2f} USDC (fee: {fee_amount:.2f} USDC)")
        return fee_amount
    else:
        logging.warning(f"Failed to complete work {work_id} [SIM].")
        return 0.0


def main():
    # Load environment
    config = load_env()
    
    # Initialize blockchain connection if using real transactions
    awm = None
    use_real_tx = BLOCKCHAIN_AVAILABLE  # Initialize with global value
    
    if use_real_tx:
        try:
            awm = AWMIntegration()
            logging.info("Blockchain connection initialized successfully")
        except Exception as e:
            logging.error(f"Failed to initialize blockchain connection: {e}")
            logging.info("Falling back to simulation mode")
            use_real_tx = False
    
    # Initialize discovery object
    dsc = AWMDiscovery()
    
    # Get or create our three agents with wallets
    our_agent_ids = []
    
    # Agent 1: Yoshi-Research-Bot
    yoshi_id = get_or_create_agent(
        dsc,
        name="Yoshi-Research-Bot",
        capabilities=["research", "analysis", "report-writing", "data-collection"],
        wallet="0x1111111111111111111111111111111111111111",
        metadata={
            "version": "1.2.0",
            "specialties": ["market-research", "competitive-analysis"],
            "max_concurrent": 3,
            "typical_rate": 50,
        },
    )
    our_agent_ids.append(yoshi_id)
    
    # Agent 2: Patrick-Dev-Bot
    patrick_id = get_or_create_agent(
        dsc,
        name="Patrick-Dev-Bot",
        capabilities=["debugging", "coding", "web-development", "smart-contracts", "security-audit"],
        wallet="0x2222222222222222222222222222222222222222",
        metadata={
            "version": "2.1.0",
            "languages": ["Solidity", "Python", "JavaScript", "Rust"],
            "specialties": ["security-patches", "bug-fixes"],
            "max_concurrent": 5,
            "typical_rate": 75,
        },
    )
    our_agent_ids.append(patrick_id)
    
    # Agent 3: AuditSec-Bot
    audit_id = get_or_create_agent(
        dsc,
        name="AuditSec-Bot",
        capabilities=["security-audit", "code-review", "vulnerability-assessment", "penetration-testing"],
        wallet="0x9b67e888d76a034b8d4123456789012345678901",
        metadata={
            "version": "1.0.0",
            "certifications": ["CEH", "OSCP", "CSSLP"],
            "specialties": ["smart-contract-audit", "defi-security"],
            "max_concurrent": 2,
            "typical_rate": 100,
        },
    )
    our_agent_ids.append(audit_id)
    
    logging.info(f"Our agent IDs: {our_agent_ids}")
    
    # Track fees earned by the fee recipient (our wallet)
    fees_earned = 0.0
    
    mode_text = "REAL BLOCKCHAIN" if use_real_tx else "SIMULATED"
    logging.info(f"=== AWM automation loop started ({mode_text}) ===")
    iteration = 0
    
    try:
        while True:
            iteration += 1
            logging.info(f"--- Loop iteration {iteration} ---")
            
            # Check if there are any open work requests
            open_work = dsc.get_open_work_requests()
            if not open_work:
                # No open work, register the three work requests
                logging.info("No open work requests found. Registering new work requests.")
                
                # Work request 1: Research current trends in AI agent marketplaces
                wid1 = dsc.register_work_request(
                    requester="Web3 Startup Alpha",
                    description="Research current trends in AI agent marketplaces and create competitive analysis report",
                    required_skills=["research", "analysis", "report-writing"],
                    budget_usdc=0.1,  # Reduced for testing with small amount
                    deadline="2026-06-15",
                    metadata={"priority": "high", "deliverable": "PDF report with slides", "estimated_hours": 10},
                )
                logging.info(f"Registered work request -> {wid1}")
                
                # Work request 2: Fix reentrancy vulnerability in token contract
                wid2 = dsc.register_work_request(
                    requester="DeFi Protocol Beta",
                    description="Fix reentrancy vulnerability in token contract and add security tests",
                    required_skills=["debugging", "coding", "smart-contracts", "security-audit"],
                    budget_usdc=500.0,
                    deadline="2026-06-10",
                    metadata={"priority": "urgent", "contract_address": "0x123...", "estimated_hours": 8},
                )
                logging.info(f"Registered work request -> {wid2}")
                
                # Work request 3: Create guide for DAO token voting
                wid3 = dsc.register_work_request(
                    requester="DAO Governance Group",
                    description="Create comprehensive guide for DAO token voting mechanisms and best practices",
                    required_skills=["research", "analysis", "report-writing"],
                    budget_usdc=250.0,
                    deadline="2026-06-20",
                    metadata={"priority": "medium", "format": "Markdown guide", "estimated_hours": 12},
                )
                logging.info(f"Registered work request -> {wid3}")
            
            # Get the current open work requests (should be the ones we just registered if none were open)
            open_work = dsc.get_open_work_requests()
            if not open_work:
                logging.info("Still no open work requests after registration – waiting.")
                time.sleep(LOOP_INTERVAL_SEC)
                continue
            
            # Process each open work request
            for work in open_work:
                wid = work["id"]
                # Find the best agent from our_agent_ids that matches this work request
                matches = dsc.find_matching_agents(wid)
                # Filter matches to only our agents
                our_matches = [ (agent, score) for agent, score in matches if agent["id"] in our_agent_ids ]
                if not our_matches:
                    logging.warning(f"No matching agent from our set found for work {wid}. Skipping.")
                    continue
                
                # Sort by score descending (should already be sorted, but just in case)
                our_matches.sort(key=lambda x: x[1], reverse=True)
                best_agent, score = our_matches[0]
                aid = best_agent["id"]
                
                logging.info(f"Selected agent {best_agent['name']} ({aid}) for work {wid} (score {score:.3f})")
                
                # Assign the work to this agent
                if dsc.assign_work(wid, aid):
                    logging.info(f"Assigned work {wid} to agent {aid}.")
                else:
                    logging.warning(f"Failed to assign work {wid} to agent {aid} (maybe not in 'open' state).")
                    continue
                
                # Start the work (mark as in_progress)
                if dsc.start_work(wid):
                    logging.info(f"Work {wid} started.")
                else:
                    logging.warning(f"Failed to start work {wid} (maybe not in 'assigned' state).")
                    continue
                
                # Process the work (either real blockchain or simulated)
                if use_real_tx and awm:
                    fee_amount = process_work_with_blockchain(awm, dsc, wid, aid)
                else:
                    fee_amount = process_work_simulated(dsc, wid, aid)
                
                fees_earned += fee_amount
                logging.info(f"Fee recipient earned {fee_amount:.2f} USDC (total fees: {fees_earned:.2f} USDC)")
            
            # Show a quick snapshot of the ecosystem
            stats = dsc.get_stats()
            logging.info(
                f"📊 Stats → WR: {stats['work_requests']} | "
                f"Agents: {stats['agents']} | "
                f"Finished: {stats['completed_work_count']} | "
                f"Fees earned: {fees_earned:.2f} USDC"
            )
            
            # Stop condition for limited runs
            if MAX_ITERATIONS is not None and iteration >= MAX_ITERATIONS:
                logging.info("Reached max iterations – exiting.")
                break
                
            time.sleep(LOOP_INTERVAL_SEC)
            
    except KeyboardInterrupt:
        logging.info("🛑 Loop interrupted by user – exiting gracefully.")
    except Exception as exc:
        logging.exception(f"Unexpected error: {exc}")
    finally:
        logging.info("=== AWM automation loop finished ===")


if __name__ == "__main__":
    main()