# AI Work Market Mainnet Monitoring Plan

Status: **required before Base mainnet launch**. This plan defines the minimum production monitoring and alerting for `AgentWorkEscrow` on Base mainnet and the supporting app/API rails.

Related docs: `docs/production-readiness/security-launch-checklist.md`, `docs/production-readiness/incident-response.md`, `contracts/AgentWorkEscrow.sol`, `deployments/base-sepolia.json`, `sdk/index.js`, `bin/awm.js`, `api/`.

## Scope

### Must monitor

- Base mainnet `AgentWorkEscrow` contract events and read-only state.
- Canonical Base mainnet USDC balance and transfers involving the escrow contract.
- Owner/admin events from OpenZeppelin `Ownable2Step`.
- Intent lifecycle health: funded, proof submitted, released, refunded, disputed, resolved, stuck.
- Fee accounting: `accumulatedFees`, `FeesWithdrawn`, fee recipient and fee bps changes.
- RPC/indexer lag and failed event ingestion.
- Public production APIs and private delivery/Stripe fulfillment paths.
- Failed CLI/SDK settlement actions when run by production automation.

### Explicit contract constraints

- `AgentWorkEscrow` v0.4 has **no pause function**. Monitoring must alert early enough for operators to disable frontend/API funding paths and warn users.
- Owner cannot resolve non-disputed intents. Monitoring must distinguish normal lifecycle states from cases requiring user action or dispute opening.
- `Disputed` freezes normal release/refund/claim flow until `resolveDispute`; every dispute needs support/operator ownership.
- Direct `createIntent` exists. If production policy requires seller-signed offers, monitoring should flag `IntentCreated` events that do not have a matching `SignedOfferFunded` in the same transaction.

## Production metadata required

Create `deployments/base-mainnet.json` before enabling alerts. It must include:

- `network`: `Base mainnet`.
- `chainId`: `8453`.
- `contract`: `AgentWorkEscrow`.
- `address`: production escrow address.
- `usdc`: canonical Base mainnet USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` unless official docs change before launch).
- `owner`: Safe/timelock address.
- `feeRecipient`: treasury Safe/address.
- Deployment tx hash, verification link, commit/tag, launch caps, and support contact.

Monitoring must refuse to run in production mode if chain ID, contract address, USDC, owner, or fee recipient do not match approved metadata.

## Event coverage matrix

| Event | Source | Priority | Required handling |
|---|---|---|---|
| `IntentCreated(intentId,buyer,seller,amount,workHash,workURI,workDeadline,reviewPeriod,feeBps)` | `AgentWorkEscrow` | Info / High if anomalous | Record intent, principal, parties, deadlines, fee. Alert if amount exceeds beta cap, daily volume threshold, unknown direct creation, zero/invalid metadata mismatch, or sudden spike. |
| `SignedOfferFunded(intentId,offerDigest,nonce)` | `AgentWorkEscrow` | Info | Link to `IntentCreated`; mark seller-signed flow. Alert if production policy requires signed offers and missing within same tx. |
| `OfferNonceCancelled(seller,nonce)` | `AgentWorkEscrow` | Info | Track seller cancellation volume; alert only on suspicious burst for high-volume seller. |
| `ProofSubmitted(intentId,proofURI,reviewDeadline)` | `AgentWorkEscrow` | Info / Medium | Update status and review deadline. Alert if proof URI inaccessible according to optional off-chain checker or review deadline exceeds expected bounds. |
| `Released(intentId,sellerAmount,feeAmount)` | `AgentWorkEscrow` | Info | Reconcile seller transfer and fee accrual. Alert if no matching USDC transfer or fee math mismatch. |
| `ClaimedAfterReview(intentId,sellerAmount,feeAmount)` | `AgentWorkEscrow` | Info | Same reconciliation as `Released`; alert if claimed unusually soon or after disputed state. |
| `Refunded(intentId,amount)` | `AgentWorkEscrow` | Info | Reconcile buyer transfer and terminal status. Alert on unexpected high-value refund or mismatch. |
| `Disputed(intentId,openedBy,disputeURI)` | `AgentWorkEscrow` | **High** | Page support/operator. Create support case. Freeze normal lifecycle expectations. Preserve evidence. |
| `DisputeResolved(intentId,buyerAmount,sellerAmount,feeAmount,chargeFee)` | `AgentWorkEscrow` | High | Verify Safe approval, split, transfers, fee accrual, and support case closure. Alert if not tied to approved ticket. |
| `FeesWithdrawn(recipient,amount)` | `AgentWorkEscrow` | High | Verify recipient equals treasury, amount equals previous `accumulatedFees`, and accounting entry exists. |
| `FeeRecipientUpdated(feeRecipient)` | `AgentWorkEscrow` | **Critical unless scheduled** | Page operators/signers. Verify change ticket. Disable funding if unauthorized. |
| `DefaultFeeBpsUpdated(feeBps)` | `AgentWorkEscrow` | High / Critical if > approved cap | Verify change ticket and public fee disclosure. Alert if exceeds approved production fee, even though contract cap is 10%. |
| `OwnershipTransferStarted(previousOwner,newOwner)` | `Ownable2Step` | **Critical unless scheduled** | Page signers. Verify new owner is approved Safe/timelock. Disable funding if suspicious. |
| `OwnershipTransferred(previousOwner,newOwner)` | `Ownable2Step` | **Critical unless scheduled** | Verify final owner readback, update metadata only after approved change. |
| `Transfer(from/to,value)` | Canonical USDC | Medium / High if anomalous | Track transfers where `from` or `to` is escrow. Reconcile with lifecycle events and `accumulatedFees`. |

## Derived state and accounting checks

Run on every new block or at least every 1 minute during launch beta.

### Intent state index

For each intent ID from `1` to `nextIntentId - 1`, maintain:

- buyer, seller, amount, feeBps.
- createdAt, workDeadline, reviewDeadline, reviewPeriod.
- workHash, workURI, proofURI, disputeURI.
- status: `None`, `Funded`, `ProofSubmitted`, `Released`, `Refunded`, `Disputed`, `Resolved`.
- tx hashes for create/fund/proof/release/refund/dispute/resolve.
- support case link if disputed or stuck.

### Escrow accounting approximation

The monitor should compute:

- `openPrincipal = sum(amount for status in Funded, ProofSubmitted, Disputed)`.
- `onchainFees = accumulatedFees()`.
- `expectedMinBalance = openPrincipal + onchainFees`.
- `actualBalance = USDC.balanceOf(escrow)`.
- `balanceDelta = actualBalance - expectedMinBalance`.

Alert rules:

- Critical if `actualBalance < expectedMinBalance` by more than 1 raw USDC unit.
- Medium if `actualBalance > expectedMinBalance` by more than 1 raw unit; likely accidental USDC transfer, accounting bug, or indexing gap.
- High if any terminal event lacks a matching USDC `Transfer` in the same tx.
- High if fee computed from event differs from `amount * feeBps / 10_000` for normal release/claim.

### Stuck lifecycle checks

- `Funded` past `workDeadline` by > 1 hour: Medium; buyer can refund if no proof. Create reminder/support task.
- `Funded` past `workDeadline` by > 24 hours with amount above beta high-value threshold: High.
- `ProofSubmitted` past `reviewDeadline` by > 1 hour: Medium; seller can claim after review. Notify seller/support if supported.
- `ProofSubmitted` past `reviewDeadline` by > 24 hours with amount above threshold: High.
- `Disputed` open > 2 business days without support acknowledgement: High.
- `Disputed` open > 7 business days or past published SLA: Critical/business escalation.

## Thresholds for capped mainnet beta

Set exact dollar caps before launch. Initial recommended defaults:

| Metric | Warning | High | Critical |
|---|---:|---:|---:|
| Single intent amount | > 100 USDC | > 500 USDC | > approved per-intent cap |
| Total open principal | > 1,000 USDC | > 3,000 USDC | > approved beta TVL cap |
| New intents per hour | > 10 | > 25 | > 50 or clear spam |
| Direct `createIntent` without `SignedOfferFunded` | any if not approved | > 1/day | high-value direct creation |
| Disputes | any = High | > 3/day | any high-value dispute or SLA breach |
| RPC/indexer lag | > 3 blocks | > 10 blocks or > 2 min | > 15 min blind during live funds |
| API 5xx rate | > 1% for 5 min | > 5% for 5 min | > 20% or funding/status unavailable |
| Balance mismatch | any unexplained | > 1 raw USDC unit | deficit or unexplained transfer involving escrow |
| Admin event without scheduled change | n/a | n/a | any |

## Dashboards

Minimum dashboard panels:

1. **Contract health**
   - Latest indexed block, chain head, lag.
   - RPC provider status and backup RPC status.
   - Contract address, owner, fee recipient, default fee bps, accumulated fees, USDC balance.
2. **Funds at risk / TVL**
   - Open principal by status.
   - Total funded, released, refunded, resolved, fees accrued, fees withdrawn.
   - Balance reconciliation delta.
3. **Lifecycle funnel**
   - Intent count by status.
   - Intent volume by day/hour.
   - Median time from funded -> proof, proof -> release/claim, dispute -> resolution.
4. **Disputes and stuck intents**
   - Open disputes with age, amount, owner, SLA clock.
   - Funded past work deadline.
   - ProofSubmitted past review deadline.
5. **Admin/security events**
   - Owner transfer started/completed.
   - Fee recipient/default fee changes.
   - Fees withdrawn.
6. **App/API health**
   - Vercel/API 2xx/4xx/5xx by route.
   - Stripe webhook verification failures and unprocessed events.
   - Private delivery link/download errors.
   - CLI/SDK automation failures if any production jobs run.

## API route checks

Production checks should cover:

- `api/agent-products.js`: product catalog available and does not advertise unsafe mainnet escrow if disabled.
- `api/payment-request.js`: Stripe/payment request creation success rate and latency.
- `api/stripe-webhook.js`: signature verification failures, event volume, unhandled event types, fulfillment lag.
- `api/fulfillment-receipt.js`: receipt generation success/error rate.
- `api/private-delivery-link.js`: auth failures vs successes, no token leakage in logs.
- `api/private-delivery-download.js`: download success/4xx/5xx, suspicious repeated downloads.
- `api/delivery-status.js`: valid status responses and session lookup failure rate.
- `api/protected-resource.js`: availability and correct no-PII/no-secret behavior.

Recommended alert thresholds:

- High: any route required for paid fulfillment has 5xx > 5% for 5 minutes.
- High: Stripe webhook signature verification failures > 3 in 10 minutes.
- Medium: delivery link/download 4xx spike > 20/minute, possible token guessing or stale links.
- Critical: production env secret accidentally logged or exposed; follow incident runbook and rotate.

## Alert routing

| Alert class | Recipients | Escalation |
|---|---|---|
| Critical admin/security/fund deficit | Technical operator, incident commander, Safe signers, support owner | Page immediately; if no ack in 5 min, call out-of-band signer path. |
| Disputed event | Support owner, technical operator | Ack within launch SLA; escalate if high-value or no ack in 30 min. |
| Stuck high-value intent | Support owner, technical operator | Create support task; escalate after 24h or user complaint. |
| RPC/indexer blind spot | Technical operator | Fail over provider; disable funding if blind > 15 min during live funds. |
| API/Stripe outage | API/frontend operator, support owner | Disable broken routes or publish degraded-service note if prolonged. |
| Accounting mismatch | Technical operator, security reviewer | Treat deficit as SEV0; surplus/mismatch as SEV1 until reconciled. |

Every alert must include: severity, environment, chain ID, contract address, block number, tx hash/event, amount/status when relevant, dashboard link, runbook link, and first recommended action.


## Implemented read-only monitor

A first executable monitoring gate exists at `scripts/escrow-monitor.js`. It is safe/read-only: no private key, no signing, no funds movement.

Example:

```bash
npm run monitor:escrow -- --blocks 500
npm run monitor:escrow -- --json > /tmp/awm-escrow-monitor.json
```

It checks:

- RPC chain ID vs deployment metadata.
- `owner()`, `feeRecipient()`, `defaultFeeBps()`, `nextIntentId()`, `accumulatedFees()`.
- Escrow USDC balance.
- Recent `AgentWorkEscrow` events in a configurable block window.
- Critical/high alerts for owner/fee recipient mismatch, admin/security events, disputes, dispute resolutions, fees withdrawn, and fee updates.

Production mode refuses to run unless Base mainnet deployment metadata declares required production ownership fields:

```bash
node scripts/escrow-monitor.js --deployment deployments/base-mainnet.json --production
```

This script is not a replacement for a durable indexer/pager. It is the first gate and emergency snapshot tool; production launch still requires durable cursoring, alert routing, dashboards, backup RPC, and tested incident drills.

## Implementation options

Any production-grade stack is acceptable if it meets coverage and reliability requirements. Viable options:

1. **OpenZeppelin Defender Monitor + Safe**
   - Fastest path for admin/event alerts.
   - Configure event monitors for all contract events plus Ownable events and USDC transfers.
   - Route Critical/High to pager/chat/email.
2. **Custom Node/ethers indexer**
   - Use final ABI from `artifacts/AgentWorkEscrow.json`, deployment metadata, primary + backup RPC.
   - Persist last processed block and intent table in durable storage.
   - Emit metrics to Grafana/Prometheus/Datadog/Sentry or equivalent.
3. **Hosted indexer/subgraph plus direct RPC fallback**
   - Good dashboard UX, but must retain direct RPC fallback for incident response.

Minimum reliability requirements:

- Durable cursor/checkpoint; no memory-only event ingestion.
- Reorg handling: wait a small confirmation window for low-priority metrics, but alert quickly on admin/security events with follow-up confirmation.
- Backfill from deployment block on startup.
- Backup RPC and explorer path.
- Alert test mode/dry run.
- No private keys required for monitoring.

## Suggested event monitor pseudocode

```js
// Sketch only; do not paste secrets into code or logs.
const deployment = loadDeployment('deployments/base-mainnet.json');
assert(deployment.chainId === 8453);
assert(deployment.usdc === CANONICAL_BASE_USDC);

const escrow = new ethers.Contract(deployment.address, escrowAbi, provider);
const usdc = new ethers.Contract(deployment.usdc, erc20Abi, provider);

for (const log of await provider.getLogs({ address: deployment.address, fromBlock, toBlock })) {
  const parsed = escrow.interface.parseLog(log);
  switch (parsed.name) {
    case 'Disputed': alertHigh(parsed, log); break;
    case 'FeeRecipientUpdated': alertCriticalUnlessScheduled(parsed, log); break;
    case 'DefaultFeeBpsUpdated': alertHighUnlessScheduled(parsed, log); break;
    case 'DisputeResolved': requireApprovedTicket(parsed, log); break;
    case 'FeesWithdrawn': verifyTreasuryAndAccounting(parsed, log); break;
    default: indexLifecycleEvent(parsed, log);
  }
}

const actual = await usdc.balanceOf(deployment.address);
const fees = await escrow.accumulatedFees();
const nextIntentId = await escrow.nextIntentId();
// Backfill/read intents and compute expectedMinBalance.
```

## Pre-launch alert tests

Before mainnet launch, prove and record:

- Test alert delivery reaches technical operator and support/business owner.
- Event backfill from deployment block works on Base Sepolia or a fork.
- `Disputed` event produces High alert and support case.
- `FeeRecipientUpdated`/`DefaultFeeBpsUpdated`/ownership event produces Critical/High alert in a test/fork environment.
- Stuck `Funded` and `ProofSubmitted` synthetic cases appear on dashboard.
- RPC provider failure triggers failover and lag alert.
- API 5xx synthetic check triggers route-specific alert.
- Monitoring can be restored from an empty database using deployment block + logs.

## Mainnet launch monitoring checklist

Do not enable production funding until each item has evidence:

- [ ] `deployments/base-mainnet.json` exists and is reviewed.
- [ ] Dashboard URL recorded internally.
- [ ] Alert recipients and escalation path configured.
- [ ] Primary and backup RPC configured.
- [ ] Contract metadata readback matches deployment: `usdc`, `owner`, `feeRecipient`, `defaultFeeBps`, `MAX_FEE_BPS`, `nextIntentId`.
- [ ] Event monitors cover all events in the matrix.
- [ ] USDC balance reconciliation check is live.
- [ ] Stuck/disputed intent jobs are live.
- [ ] API/Stripe/private delivery health checks are live.
- [ ] Critical test alert acknowledged by humans.
- [ ] Incident runbook dry run completed and timestamped.

## Operating rhythm during beta

- First 24 hours after launch: watch every transaction manually in addition to automated alerts.
- Daily during beta: reconcile open principal, terminal events, fees, and Stripe/manual fulfillment records.
- Weekly: review thresholds, dispute SLAs, failed alerts, support tickets, and launch caps.
- Before raising caps: require zero unresolved Critical/High incidents, clean reconciliation, and updated public risk copy.
