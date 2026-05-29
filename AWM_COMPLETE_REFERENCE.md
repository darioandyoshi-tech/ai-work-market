# AWM Sovereign Deployment — Complete Reference

## Deployed Contracts (Base Mainnet, Chain ID 8453)

| Contract | Address | Role | Verified |
|----------|---------|------|----------|
| Safe Proxy | `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637` | Multi-sig owner | Sourcify ✅ |
| TimelockController | `0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967` | Escrow owner | Sourcify ✅ |
| Groth16Verifier | `0xbEA159B9982c790B872093736E54590bec295132` | ZK proof validator | Sourcify ✅ |
| AgentWorkEscrowZK | `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2` | Settlement layer | Sourcify ✅ |

## E2E Test Transactions (Intent #2)

| Step | Function | Tx Hash | Block |
|------|----------|---------|-------|
| Fund wallet | `cast send` | `0x9fe0...` | 46629295 |
| Approve USDC | `approve()` | `0x8f0e...` | 46629683 |
| Create intent | `createIntent()` | `0x81e2...` | 46629817 |
| Submit proof | `submitProof()` | `0xa3c3...` | 46629851 |
| Release funds | `release()` | `0x4570...` | 46629888 |

## Safe Configuration

- **Threshold:** 2-of-3
- **Owners:**
  1. `0xec89c40CA296F502cD033e07f18DA5e01cdd197d` (deployer)
  2. `0x5d03e94ee2eddde143e7c17095195e7a54afe142`
  3. `0x2dAF658B01e257206375798a15832E9f547D65dD`

## Timelock Configuration

- **Delay:** 48 hours (172,800 seconds)
- **PROPOSER_ROLE:** Granted to Safe
- **EXECUTOR_ROLE:** Granted to Safe

## Access Control

- `escrow.owner()` → Timelock ✅
- Deployer has **ZERO** admin roles ✅
- `withdrawFees()` reverts for non-owner ✅
- `transferOwnership(0x0)` reverts for non-owner ✅

## Fee Structure

- Protocol fee: 1.00%
- Fee recipient: `0xec89c40CA296F502cD033e07f18DA5e01cdd197d`
- Current accumulated: ~12,995,660 USDC units

## Monitoring

- **Event Watcher:** `hermes cron job d6cee2141f1c` (every 15 min)
- **Bridge Monitor:** `hermes cron job c58e84ed1f04` (every 15 min)
- **Filesystem Bridge:** `~/.openclaw/workspace/SOVEREIGN_BRIDGE/`

## Verification (Sourcify)

Basescan API is blocked (V2 migration). Use Sourcify:
```bash
unset ETHERSCAN_API_KEY
forge verify-contract 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 \
  contracts/AgentWorkEscrowZK.sol:AgentWorkEscrowZK \
  --verifier sourcify --chain 8453
```

## Files

- `~/ai-work-market/sovereign-deployment-mainnet.json` — Machine-readable manifest
- `~/ai-work-market/SOVEREIGN_TEST_REPORT.md` — Full E2E results
- `~/.hermes/skills/awm-deployment/SKILL.md` — Reusable deployment playbook
- `~/.hermes/scripts/awm-event-watcher.py` — On-chain event poller
- `~/.hermes/scripts/awm-bridge-monitor.py` — Accountability monitor
- `~/openclaw_workspace/trading-bot/AWM_INTEGRATION_PLAN.md` — Trading integration

## Contact / Bridge

- **Filesystem bridge:** `~/.openclaw/workspace/SOVEREIGN_BRIDGE/`
- **Agents:** `yoshi-auditor`, `contract-deployer` (Beacon identity)
- **Cron status:** `hermes cron list`
