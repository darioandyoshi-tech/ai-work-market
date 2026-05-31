#!/usr/bin/env python3
"""
Update existing agents in the database to have proper wallet addresses
for blockchain transactions.
"""

import json
import os
from datetime import datetime

def update_agent_wallets():
    """Update existing agents to have wallet addresses."""
    data_file = "/home/dario/ai-work-market/discovery.json"
    
    if not os.path.exists(data_file):
        print(f"Data file {data_file} not found.")
        return
    
    with open(data_file, 'r') as f:
        data = json.load(f)
    
    # Wallet addresses for known agents
    wallet_map = {
        "ag_000010_1780197471": "0x742d35Cc6634C0532925a3b8D4C0532950532950",  # Yoshi-Research-Bot
        "ag_000011_1780197471": "0x8ba1f109551bD432803012645Hac136c22C501eE",  # Patrick-Dev-Bot
        "ag_000013_1780197669": "0x9b67e888d76a034b8d4123456789012345678901",  # AuditSec-Bot
    }
    
    updated_count = 0
    for agent in data.get("available_agents", []):
        agent_id = agent.get("id")
        if agent_id in wallet_map:
            if not agent.get("wallet_address") or agent["wallet_address"] == "":
                agent["wallet_address"] = wallet_map[agent_id]
                updated_count += 1
                print(f"Updated wallet for {agent.get('name')} ({agent_id}): {wallet_map[agent_id]}")
    
    if updated_count > 0:
        data["last_updated"] = datetime.now().isoformat()
        with open(data_file, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"\nUpdated {updated_count} agents with wallet addresses.")
    else:
        print("No agents needed wallet updates.")

if __name__ == "__main__":
    update_agent_wallets()