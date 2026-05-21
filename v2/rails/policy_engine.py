import os, time, pathlib, json
from datetime import datetime

ROOT = pathlib.Path('/home/dario/.openclaw/workspace')
POLICY_STATE = ROOT / 'projects/ai-work-market/v2/state/POLICY_STATE.md'

class AWMPolicyEngine:
    def __init__(self):
        self.state_file = POLICY_STATE
        
    def log_transaction(self, agent_id, amount, purpose):
        ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_entry = f"- {ts} | {agent_id} | ${amount} | {purpose}\n"
        with open(self.state_file, 'a') as f:
            f.write(log_entry)
        print(f"💳 Transaction Logged: {agent_id} paid ${amount} for {purpose}")

    def validate_budget(self, agent_id, amount):
        # In a full implementation, this would parse the POLICY_STATE.md table
        # For Alpha, we return True if amount < $50
        return amount <= 50.0

    def request_payment(self, agent_id, amount, purpose):
        if self.validate_budget(agent_id, amount):
            self.log_transaction(agent_id, amount, purpose)
            return {"status": "approved", "tx_id": "awm-v2-tx-" + str(int(time.time()))}
        else:
            return {"status": "denied", "reason": "Budget limit exceeded"}

if __name__ == '__main__':
    engine = AWMPolicyEngine()
    # Test run
    print("AWM 2.0 Policy Engine Online. Testing internal rails...")
    res = engine.request_payment('awm-orchestrator', 5.0, 'Sourcing high-fit candidates')
    print(f"Test Payment: {res}")
