#!/usr/bin/env python3
"""
AWM Discovery System
Simple JSON-based system for discovering work requests and agents
Integrated with AWM smart contract for payments
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Import AWM integration
try:
    from awm_integration_final import AWMIntegration
    AWM_AVAILABLE = True
except ImportError:
    AWM_AVAILABLE = False
    print("Warning: AWM integration not available. Payments will not be processed automatically.")

class AWMDiscovery:
    def __init__(self, data_file: str = "discovery.json"):
        self.data_file = data_file
        self.data = self._load_data()
        # Initialize AWM integration if available
        if AWM_AVAILABLE:
            try:
                self.awm = AWMIntegration()
            except Exception as e:
                print(f"Warning: Could not initialize AWM integration: {e}")
                self.awm = None
        else:
            self.awm = None

    def _load_data(self) -> Dict:
        """Load discovery data from JSON file"""
        if os.path.exists(self.data_file):
            with open(self.data_file, 'r') as f:
                return json.load(f)
        else:
            return {
                "version": "1.0",
                "last_updated": datetime.now().isoformat(),
                "description": "Discovery registry for AWM - tracks work requests and agent capabilities",
                "work_requests": [],
                "available_agents": [],
                "completed_work": [],
                "settings": {
                    "auto_match": True,
                    "notification_enabled": False
                }
            }

    def _save_data(self):
        """Save discovery data to JSON file"""
        self.data["last_updated"] = datetime.now().isoformat()
        with open(self.data_file, 'w') as f:
            json.dump(self.data, f, indent=2)

    def register_work_request(self, requester: str, description: str, 
                            required_skills: List[str], budget_usdc: float,
                            deadline: str = None, metadata: Dict = None) -> str:
        """Register a new work request"""
        work_id = f"wr_{len(self.data['work_requests']) + 1:06d}_{int(datetime.now().timestamp())}"
        
        work_request = {
            "id": work_id,
            "requester": requester,
            "description": description,
            "required_skills": required_skills,
            "budget_usdc": budget_usdc,
            "deadline": deadline,
            "metadata": metadata or {},
            "created_at": datetime.now().isoformat(),
            "status": "open",  # open, assigned, in_progress, completed, cancelled
            "assigned_to": None,
            "assigned_at": None,
            "started_at": None,
            "completed_at": None
        }
        
        self.data["work_requests"].append(work_request)
        self._save_data()
        return work_id

    def register_agent(self, agent_name: str, capabilities: List[str], 
                      wallet_address: str, metadata: Dict = None) -> str:
        """Register an AI agent with its capabilities"""
        agent_id = f"ag_{len(self.data['available_agents']) + 1:06d}_{int(datetime.now().timestamp())}"
        
        agent = {
            "id": agent_id,
            "name": agent_name,
            "capabilities": capabilities,
            "wallet_address": wallet_address,
            "metadata": metadata or {},
            "registered_at": datetime.now().isoformat(),
            "status": "available",  # available, busy, offline, maintenance
            "current_task": None,
            "task_history": [],
            "total_completed": 0,
            "total_earned": 0.0,
            "rating": 5.0
        }
        
        self.data["available_agents"].append(agent)
        self._save_data()
        return agent_id

    def find_matching_agents(self, work_request_id: str) -> List[Tuple[Dict, float]]:
        """Find agents that match a work request's required skills, return (agent, score)"""
        work_request = None
        for wr in self.data["work_requests"]:
            if wr["id"] == work_request_id:
                work_request = wr
                break
        
        if not work_request or work_request["status"] != "open":
            return []
        
        required_skills = set(work_request["required_skills"])
        if not required_skills:
            # If no skills required, return all available agents
            return [(agent, 1.0) for agent in self.data["available_agents"] 
                   if agent["status"] == "available"]
        
        matches = []
        for agent in self.data["available_agents"]:
            if agent["status"] != "available":
                continue
                
            agent_skills = set(agent["capabilities"])
            # Calculate Jaccard similarity: intersection over union
            intersection = required_skills.intersection(agent_skills)
            union = required_skills.union(agent_skills)
            
            if len(intersection) > 0:  # At least one matching skill
                jaccard_score = len(intersection) / len(union) if len(union) > 0 else 0
                # Also consider budget if agent has rate info
                # For now, just use skill match
                matches.append((agent, jaccard_score))
        
        # Sort by score descending
        matches.sort(key=lambda x: x[1], reverse=True)
        return matches

    def assign_work(self, work_request_id: str, agent_id: str) -> bool:
        """Assign work to an agent"""
        # Find work request
        work_request = None
        for wr in self.data["work_requests"]:
            if wr["id"] == work_request_id:
                work_request = wr
                break
        
        if not work_request or work_request["status"] != "open":
            return False
        
        # Find agent
        agent = None
        for a in self.data["available_agents"]:
            if a["id"] == agent_id:
                agent = a
                break
        
        if not agent or agent["status"] != "available":
            return False
        
        # Assign work
        work_request["status"] = "assigned"
        work_request["assigned_to"] = agent_id
        work_request["assigned_at"] = datetime.now().isoformat()
        
        agent["status"] = "busy"
        agent["current_task"] = work_request_id
        
        self._save_data()
        return True

    def start_work(self, work_request_id: str) -> bool:
        """Mark work as started (by agent)"""
        work_request = None
        for wr in self.data["work_requests"]:
            if wr["id"] == work_request_id:
                work_request = wr
                break
        
        if not work_request or work_request["status"] != "assigned":
            return False
        
        work_request["status"] = "in_progress"
        work_request["started_at"] = datetime.now().isoformat()
        self._save_data()
        return True

    def complete_work(self, work_request_id: str, proof_uri: str = None, 
                     actual_payment: float = None) -> bool:
        """Mark work as completed and trigger payment via AWM contract"""
        work_request = None
        for wr in self.data["work_requests"]:
            if wr["id"] == work_request_id:
                work_request = wr
                break
        
        if not work_request or work_request["status"] != "in_progress":
            return False
        
        # Mark as completed
        work_request["status"] = "completed"
        work_request["completed_at"] = datetime.now().isoformat()
        if proof_uri:
            work_request["proof_uri"] = proof_uri
        if actual_payment:
            work_request["actual_payment_usdc"] = actual_payment
        
        # Update agent stats
        agent_id = work_request.get("assigned_to")
        if agent_id:
            for agent in self.data["available_agents"]:
                if agent["id"] == agent_id:
                    agent["status"] = "available"
                    agent["current_task"] = None
                    agent["task_history"].append({
                        "work_id": work_request_id,
                        "completed_at": work_request["completed_at"],
                        "payment": actual_payment or work_request["budget_usdc"]
                    })
                    agent["total_completed"] += 1
                    if actual_payment:
                        agent["total_earned"] += actual_payment
                    # Update rating based on feedback (simplified)
                    break
        
        # Add to completed work
        completed_entry = work_request.copy()
        self.data["completed_work"].append(completed_entry)
        
        # Trigger payment via AWM contract if integration is available
        if self.awm and work_request.get("assigned_to"):
            # Get the agent's wallet address
            agent_wallet = None
            for agent in self.data["available_agents"]:
                if agent["id"] == agent_id:
                    agent_wallet = agent["wallet_address"]
                    break
            
            if agent_wallet:
                payment_amount = actual_payment or work_request["budget_usdc"]
                print(f"Triggering payment of {payment_amount} USDC to {agent_wallet} via AWM contract")
                # In a real implementation, we would call:
                # tx_hash = self.awm.release_payment(work_request_id)
                # For now, we'll just log it
                print(f"Would call AWM contract to release payment for work {work_request_id}")
        
        self._save_data()
        return True

    def cancel_work(self, work_request_id: str, reason: str = None) -> bool:
        """Cancel a work request"""
        work_request = None
        for wr in self.data["work_requests"]:
            if wr["id"] == work_request_id:
                work_request = wr
                break
        
        if not work_request or work_request["status"] not in ["open", "assigned"]:
            return False
        
        work_request["status"] = "cancelled"
        work_request["cancelled_at"] = datetime.now().isoformat()
        if reason:
            work_request["cancel_reason"] = reason
        
        # Free up agent if assigned
        agent_id = work_request.get("assigned_to")
        if agent_id:
            for agent in self.data["available_agents"]:
                if agent["id"] == agent_id:
                    agent["status"] = "available"
                    agent["current_task"] = None
                    break
        
        self._save_data()
        return True

    def get_open_work_requests(self) -> List[Dict]:
        """Get all open work requests"""
        return [wr for wr in self.data["work_requests"] if wr["status"] == "open"]

    def get_available_agents(self) -> List[Dict]:
        """Get all available agents"""
        return [agent for agent in self.data["available_agents"] if agent["status"] == "available"]

    def get_agent_by_id(self, agent_id: str) -> Optional[Dict]:
        """Get agent by ID"""
        for agent in self.data["available_agents"]:
            if agent["id"] == agent_id:
                return agent
        return None

    def get_work_request_by_id(self, work_id: str) -> Optional[Dict]:
        """Get work request by ID"""
        for wr in self.data["work_requests"]:
            if wr["id"] == work_id:
                return wr
        return None

    def get_stats(self) -> Dict:
        """Get system statistics"""
        work_requests = self.data["work_requests"]
        agents = self.data["available_agents"]
        completed = self.data["completed_work"]
        
        # Work stats
        total_work = len(work_requests)
        open_work = len([w for w in work_requests if w["status"] == "open"])
        assigned_work = len([w for w in work_requests if w["status"] == "assigned"])
        in_progress_work = len([w for w in work_requests if w["status"] == "in_progress"])
        completed_work = len([w for w in work_requests if w["status"] == "completed"])
        cancelled_work = len([w for w in work_requests if w["status"] == "cancelled"])
        
        # Agent stats
        total_agents = len(agents)
        available_agents = len([a for a in agents if a["status"] == "available"])
        busy_agents = len([a for a in agents if a["status"] == "busy"])
        offline_agents = len([a for a in agents if a["status"] == "offline"])
        
        # Financial stats
        total_budget_open = sum([w["budget_usdc"] for w in work_requests if w["status"] == "open"])
        total_budget_assigned = sum([w["budget_usdc"] for w in work_requests if w["status"] == "assigned"])
        total_completed_value = sum([w.get("actual_payment_usdc", w["budget_usdc"]) 
                                   for w in work_requests if w["status"] == "completed"])
        
        return {
            "work_requests": {
                "total": total_work,
                "open": open_work,
                "assigned": assigned_work,
                "in_progress": in_progress_work,
                "completed": completed_work,
                "cancelled": cancelled_work
            },
            "agents": {
                "total": total_agents,
                "available": available_agents,
                "busy": busy_agents,
                "offline": offline_agents
            },
            "completed_work_count": len(completed),
            "financial": {
                "total_budget_open": round(total_budget_open, 2),
                "total_budget_assigned": round(total_budget_assigned, 2),
                "total_completed_value": round(total_completed_value, 2)
            }
        }

    def auto_assign_work(self) -> List[Dict]:
        """Automatically assign open work to best matching agents"""
        assignments = []
        open_work = self.get_open_work_requests()
        
        for work in open_work:
            matches = self.find_matching_agents(work["id"])
            if matches:
                best_agent, score = matches[0]
                if self.assign_work(work["id"], best_agent["id"]):
                    assignments.append({
                        "work_id": work["id"],
                        "work_description": work["description"],
                        "agent_id": best_agent["id"],
                        "agent_name": best_agent["name"],
                        "match_score": score
                    })
        
        return assignments

def demo():
    """Demonstrate the discovery system"""
    print("=== AWM Discovery System Demo ===\n")
    
    # Initialize system
    discovery = AWMDiscovery()
    
    # Register some agents
    print("Registering agents...")
    yoshi_id = discovery.register_agent(
        agent_name="Yoshi-Research-Bot",
        capabilities=["research", "analysis", "report-writing", "data-collection"],
        wallet_address="0x742d35Cc6634C0532925a3b8D4C0532950532950",
        metadata={
            "version": "1.2.0",
            "specialties": ["market-research", "competitive-analysis"],
            "max_concurrent": 3,
            "typical_rate": 50  # USD per hour
        }
    )
    
    patchwright_id = discovery.register_agent(
        agent_name="Patchwright-Dev-Bot",
        capabilities=["debugging", "coding", "web-development", "smart-contracts"],
        wallet_address="0x8ba1f109551bD432803012645Hac136c22C501eE",
        metadata={
            "version": "2.1.0",
            "languages": ["Solidity", "Python", "JavaScript", "Rust"],
            "specialties": ["security-patches", "bug-fixes"],
            "max_concurrent": 5,
            "typical_rate": 75
        }
    )
    
    auditling_id = discovery.register_agent(
        agent_name="Auditling-Security-Bot",
        capabilities=["security-audit", "code-review", "vulnerability-assessment", "penetration-testing"],
        wallet_address="0x9b67e888d76a034b8d4123456789012345678901",
        metadata={
            "version": "1.0.0",
            "certifications": ["CEH", "OSCP", "CSSLP"],
            "specialties": ["smart-contract-audit", "defi-security"],
            "max_concurrent": 2,
            "typical_rate": 100
        }
    )
    
    print(f"Registered agents: Yoshi ({yoshi_id}), Patchwright ({patchwright_id}), Auditling ({auditling_id})\n")
    
    # Register work requests
    print("Registering work requests...")
    wr1 = discovery.register_work_request(
        requester="Web3 Startup Alpha",
        description="Research current trends in AI agent marketplaces and create competitive analysis report",
        required_skills=["research", "analysis", "report-writing"],
        budget_usdc=300.0,
        deadline="2026-06-15",
        metadata={
            "priority": "high",
            "deliverable": "PDF report with slides",
            "estimated_hours": 10
        }
    )
    
    wr2 = discovery.register_work_request(
        requester="DeFi Protocol Beta",
        description="Fix reentrancy vulnerability in token contract and add security tests",
        required_skills=["debugging", "coding", "smart-contracts", "security-audit"],
        budget_usdc=500.0,
        deadline="2026-06-10",
        metadata={
            "priority": "urgent",
            "contract_address": "0x123...",
            "estimated_hours": 8
        }
    )
    
    wr3 = discovery.register_work_request(
        requester="DAO Governance Group",
        description="Create comprehensive guide for DAO token voting mechanisms and best practices",
        required_skills=["research", "analysis", "report-writing"],
        budget_usdc=250.0,
        deadline="2026-06-20",
        metadata={
            "priority": "medium",
            "format": "Markdown guide",
            "estimated_hours": 12
        }
    )
    
    print(f"Registered work requests: {wr1}, {wr2}, {wr3}\n")
    
    # Show current stats
    print("--- Current System Stats ---")
    stats = discovery.get_stats()
    print(f"Work Requests: {stats['work_requests']}")
    print(f"Agents: {stats['agents']}")
    print(f"Financial: {stats['financial']}\n")
    
    # Show open work
    print("--- Open Work Requests ---")
    for work in discovery.get_open_work_requests():
        print(f"ID: {work['id']}")
        print(f"  Description: {work['description']}")
        print(f"  Budget: {work['budget_usdc']} USDC")
        print(f"  Skills needed: {', '.join(work['required_skills'])}")
        print()
    
    # Show available agents
    print("--- Available Agents ---")
    for agent in discovery.get_available_agents():
        print(f"ID: {agent['id']}")
        print(f"  Name: {agent['name']}")
        print(f"  Capabilities: {', '.join(agent['capabilities'])}")
        print(f"  Wallet: {agent['wallet_address']}")
        print()
    
    # Show matching results
    print("--- Skill Matching Results ---")
    for work in discovery.get_open_work_requests():
        matches = discovery.find_matching_agents(work["id"])
        print(f"Work: {work['description']}")
        print(f"  Required skills: {', '.join(work['required_skills'])}")
        if matches:
            print("  Matching agents:")
            for agent, score in matches[:3]:  # Top 3
                print(f"    - {agent['name']} (Score: {score:.3f})")
        else:
            print("  No matching agents found")
        print()
    
    # Demonstrate auto-assignment
    print("--- Auto-Assignment Demo ---")
    assignments = discovery.auto_assign_work()
    for assignment in assignments:
        print(f"Assigned '{assignment['work_description']}' to {assignment['agent_name']} "
              f"(Score: {assignment['match_score']:.3f})")
    
    print("\n--- Updated Stats After Assignment ---")
    stats = discovery.get_stats()
    print(f"Work Requests: {stats['work_requests']}")
    print(f"Agents: {stats['agents']}")
    
    # Demonstrate work progression
    print("\n--- Work Progression Demo ---")
    open_work = discovery.get_open_work_requests()
    if open_work:
        work_id = open_work[0]["id"]
        print(f"Starting work {work_id}")
        discovery.start_work(work_id)
        
        print(f"Completing work {work_id} with proof")
        discovery.complete_work(
            work_id, 
            proof_uri="ipfs://bafybeigdyrzt5wfp7ud7h...", 
            actual_payment=open_work[0]["budget_usdc"]
        )
    
    print("\n--- Final Stats ---")
    stats = discovery.get_stats()
    print(f"Work Requests: {stats['work_requests']}")
    print(f"Agents: {stats['agents']}")
    print(f"Completed work count: {stats['completed_work_count']}")
    print(f"Financial: {stats['financial']}")

if __name__ == "__main__":
    demo()