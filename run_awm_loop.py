#!/usr/bin/env python3
"""
Full AWM automation loop (simulated):
  - register agents & work (if not already present)
  - auto‑assign open work
  - start work → complete work (with dummy proof)
  - update agent earnings and fee pool (simulated)
  - repeat until interrupted (Ctrl‑C)

This version simulates the blockchain transactions by updating the local JSON
and tracking fees earned. It does not send actual transactions, but it shows
the money flow as intended.

Requires:
  - discovery_system.py (AWMDiscovery class)
  - .env with BASE_SEPOLIA_RPC_URL and PRIVATE_KEY (for compatibility, though not used for tx)
"""

import os
import time
import logging
from typing import List, Optional

# Import the discovery class
from discovery_system import AWMDiscovery
from dotenv import load_dotenv

# ----------------------------------------------------------------------
# Configuration (feel free to tweak)
# ----------------------------------------------------------------------
LOOP_INTERVAL_SEC = 15          # how long to wait between cycles
MAX_ITERATIONS = 5           # None = run forever; set an int for a limited run
USE_DUMMY_PROOF = True          # set False if you want to supply a real IPFS hash later
DUMMY_PROOF = "ipfs://bafybeigdyrzt5wfp7ud7h..."  # placeholder
FEE_BPS = 50                    # fee basis points (50 = 0.5%)
# ----------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)

def load_env() -> tuple[str, str]:
    """Load .env file and read RPC URL and private key from environment."""
    load_dotenv()  # loads .env file in the current directory
    rpc = os.getenv("BASE_SEPOLIA_RPC_URL")
    pk = os.getenv("PRIVATE_KEY")
    if not rpc or not pk:
        raise RuntimeError("BASE_SEPOLIA_RPC_URL or PRIVATE_KEY not set in environment")
    return rpc, pk

def ensure_agents(disc: AWMDiscovery) -> List[str]:
    """Register a few demo agents if they are not already present."""
    agent_specs = [
        {
            "name": "Yoshi-Research-Bot",
            "caps": ["research", "analysis", "report-writing", "data-collection"],
            "wallet": "0x742d35Cc6634C0532925a3b8D4C0532950532950",
            "meta": {
                "version": "1.2.0",
                "specialties": ["market-research", "competitive-analysis"],
                "max_concurrent": 3,
                "typical_rate": 50,
            },
        },
        {
            "name": "Patrick-Dev-Bot",
            "caps": ["debugging", "coding", "web-development", "smart-contracts"],
            "wallet": "0x8ba1f109551bD432803012645Hac136c22C501eE",
            "meta": {
                "version": "2.1.0",
                "languages": ["Solidity", "Python", "JavaScript", "Rust"],
                "specialties": ["security-patches", "bug-fixes"],
                "max_concurrent": 5,
                "typical_rate": 75,
            },
        },
        {
            "name": "AuditSec-Bot",
            "caps": ["security-audit", "code-review", "vulnerability-assessment", "penetration-testing"],
            "wallet": "0x9b67e888d76a034b8d4123456789012345678901",
            "meta": {
                "version": "1.0.0",
                "certifications": ["CEH", "OSCP", "CSSLP"],
                "specialties": ["smart-contract-audit", "defi-security"],
                "max_concurrent": 2,
                "typical_rate": 100,
            },
        },
    ]

    ids = []
    for spec in agent_specs:
        aid = disc.register_agent(
            agent_name=spec["name"],
            capabilities=spec["caps"],
            wallet_address=spec["wallet"],
            metadata=spec["meta"],
        )
        ids.append(aid)
        logging.info(f"Registered agent '{spec['name']}' → {aid}")
    return ids

def ensure_work(disc: AWMDiscovery) -> List[str]:
    """Register a few demo work requests if they are not already present."""
    work_specs = [
        {
            "requester": "Web3 Startup Alpha",
            "description": "Research current trends in AI agent marketplaces and create competitive analysis report",
            "skills": ["research", "analysis", "report-writing"],
            "budget": 300.0,
            "deadline": "2026-06-15",
            "meta": {"priority": "high", "deliverable": "PDF report with slides", "estimated_hours": 10},
        },
        {
            "requester": "DeFi Protocol Beta",
            "description": "Fix reentrancy vulnerability in token contract and add security tests",
            "skills": ["debugging", "coding", "smart-contracts", "security-audit"],
            "budget": 500.0,
            "deadline": "2026-06-10",
            "meta": {"priority": "urgent", "contract_address": "0x123...", "estimated_hours": 8},
        },
        {
            "requester": "DAO Governance Group",
            "description": "Create comprehensive guide for DAO token voting mechanisms and best practices",
            "skills": ["research", "analysis", "report-writing"],
            "budget": 250.0,
            "deadline": "2026-06-20",
            "meta": {"priority": "medium", "format": "Markdown guide", "estimated_hours": 12},
        },
    ]

    ids = []
    for spec in work_specs:
        wid = disc.register_work_request(
            requester=spec["requester"],
            description=spec["description"],
            required_skills=spec["skills"],
            budget_usdc=spec["budget"],
            deadline=spec["deadline"],
            metadata=spec["meta"],
        )
        ids.append(wid)
        logging.info(f"Registered work request → {wid}")
    return ids

def update_agent_earnings(disc: AWMDiscovery, work_id: str, amount: float, fee_bps: int = FEE_BPS) -> float:
    """
    Update the agent's earnings and return the fee amount.
    This simulates the blockchain transaction where the agent gets (amount - fee)
    and the fee goes to the fee recipient.
    """
    work_obj = disc.get_work_request_by_id(work_id)
    if work_obj is None:
        logging.warning(f"Work {work_id} not found.")
        return 0.0
    assigned_to = work_obj.get("assigned_to")
    if not assigned_to:
        logging.warning(f"Work {work_id} has no assigned agent.")
        return 0.0
    agent_obj = disc.get_agent_by_id(assigned_to)
    if agent_obj is None:
        logging.warning(f"Agent {assigned_to} not found.")
        return 0.0
    # Calculate fee
    fee_amount = amount * fee_bps / 10000.0
    agent_amount = amount - fee_amount
    # Update agent's total_earned
    agent_obj["total_earned"] = agent_obj.get("total_earned", 0.0) + agent_amount
    agent_obj["total_completed"] = agent_obj.get("total_completed", 0) + 1
    # Save the updated agent data back to the discovery data
    disc._save_data()
    logging.info(f"Agent {agent_obj['name']} earned {agent_amount:.2f} USDC (fee: {fee_amount:.2f} USDC)")
    return fee_amount

def main():
    rpc_url, private_key = load_env()

    # Initialize the discovery object
    disc = AWMDiscovery()                     # uses awm_data.json in cwd

    # Ensure we have some agents & work in the JSON database
    agent_ids = ensure_agents(disc)
    work_ids   = ensure_work(disc)

    # Track fees earned by the fee recipient (our wallet)
    fees_earned = 0.0

    logging.info("=== AWM automation loop started (simulated) ===")
    iteration = 0
    try:
        while True:
            iteration += 1
            logging.info(f"--- Loop iteration {iteration} ---")

            # 1️⃣  Auto‑assign any open work
            assignments: List[dict] = disc.auto_assign_work()
            if not assignments:
                logging.info("No open work to assign – waiting for new requests.")
            else:
                for a in assignments:
                    wid = a["work_id"]
                    aid = a["agent_id"]
                    logging.info(f"Auto‑assigned work {wid} → agent {aid} (score {a['match_score']:.3f})")

                    # 2️⃣  Start the work (mark as in_progress)
                    if disc.start_work(wid):
                        logging.info(f"Work {wid} started.")
                    else:
                        logging.warning(f"Failed to start work {wid} (maybe not in 'open' state).")
                        continue

                    # 3️⃣  Complete the work
                    work_obj = disc.get_work_request_by_id(wid)
                    if work_obj is None:
                        logging.warning(f"Work {wid} not found.")
                        continue

                    budget = work_obj.get("budget_usdc", 0.0)
                    actual_payment = float(budget)   # we pay the full budget
                    proof = DUMMY_PROOF if USE_DUMMY_PROOF else ""

                    if not disc.complete_work(wid, proof_uri=proof, actual_payment=actual_payment):
                        logging.warning(f"Failed to complete work {wid}.")
                        continue

                    logging.info(f"Work {wid} marked as completed.")

                    # 4️⃣  Update agent earnings and fee pool (simulated)
                    fee_amount = update_agent_earnings(disc, wid, actual_payment, FEE_BPS)
                    fees_earned += fee_amount
                    logging.info(f"Fee recipient (you) earned {fee_amount:.2f} USDC (total fees: {fees_earned:.2f} USDC)")

                # End of for loop (assignments)

            # 5️⃣  Show a quick snapshot of the ecosystem
            stats = disc.get_stats()
            logging.info(
                f"📊 Stats → WR: {stats['work_requests']} | "
                f"Agents: {stats['agents']} | "
                f"Finished: {stats['completed_work_count']} | "
                f"Fees earned (simulated): {fees_earned:.2f} USDC"
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