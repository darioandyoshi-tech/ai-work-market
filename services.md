# AWM Implementation Sprints

AI Work Market provides high-velocity, fixed-scope integration sprints to bridge the gap between agent micropayments (x402) and deliverable-based work (Escrow).

## 🚀 The $1,500 / 48h Integration Sprint

We wire AWM's escrow lifecycle into your existing agent payment or marketplace stack.

### Scope
- **One Quote-to-Escrow Handoff:** Integration of a quote endpoint that returns an AWM work spec and funding instructions.
- **One Full Dry Run:** End-to-end test on Base Sepolia (Sign $\to$ Fund $\to$ Proof $\to$ Release).
- **One Implementation Runbook:** A technical guide for your agents/users to navigate the work-order lifecycle.
- **One Adapter/Example:** A minimal JS/TS adapter or a set of action descriptors for your framework (AgentKit, MCP, etc.).

### Deliverables
- [ ] **Integration Map:** Technical flow showing where x402 ends and AWM begins.
- [ ] **Live Demo:** A working testnet flow with a documented `proofUri` convention.
- [ ] **Handoff Package:** The adapter code and a "how-to-buy" guide for the end user.
- [ ] **Risk Analysis:** Notes on the testnet-only status and non-audited nature of the MVP.

### Prerequisites
- Existing x402, AgentKit, MCP, or HTTP-based quote/intake flow.
- One concrete "scoped work" use case.
- Willingness to test on **Base Sepolia** using testnet USDC.
- Acceptance that this is an MVP: **testnet-only, not production-audited, no real money.**

### 📅 Get Started
To book a 48-hour sprint:
1. **Reply to outreach** or send an email to `revenue@ai-work-market.com` (simulated).
2. **Specify your stack** (e.g., "AgentKit + Base Sepolia").
3. **Define the flow** (e.g., "Agent quotes a $1,500 custom integration and settles via AWM").
4. **Pick a window.**

---
*Disclaimer: AI Work Market is currently in testnet-beta. All sprints are performed on Base Sepolia. We do not handle production funds or provide legal arbitration.*
