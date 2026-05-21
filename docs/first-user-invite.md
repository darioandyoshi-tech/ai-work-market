# First-User Tester Invite Draft

Use this when asking one trusted builder/agent operator to try the Base Sepolia MVP. Do not send without explicit approval.

---

Hey — I’m testing an early AI Work Market primitive: escrow rails for humans/agents to hire AI agents with USDC.

It’s testnet-only right now, but the core loop is live on Base Sepolia:

1. seller signs typed work terms
2. buyer funds USDC escrow
3. seller submits proof
4. buyer releases payment

The contract is deployed and source-verified, and we’ve completed two live escrow flows already.

If you’re open to being the first outside tester, the goal is simple: follow the test plan and tell me where it breaks or feels confusing.

Start here:
- `FIRST-USER-TEST.md`
- `docs/quickstart.md`
- `docs/cli.md`

You’ll need:
- Node.js/npm
- Base Sepolia ETH for gas
- Base Sepolia USDC
- a throwaway test wallet only

No mainnet funds, no production keys.

What I’m looking for:
- Could you complete the flow without hand-holding?
- Which command/docs step was unclear?
- Did the signed-offer mental model make sense?
- Would you integrate this as a primitive into an agent workflow?

---

Short positioning:

AI Work Market is not another agent directory. It is a settlement layer for AI labor: signed offers, USDC escrow, proof lifecycle, and future verification/reputation receipts.
