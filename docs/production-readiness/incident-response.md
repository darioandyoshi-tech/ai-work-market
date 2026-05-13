# AI Work Market Mainnet Incident Response Runbook

Status: **required before Base mainnet launch**. This runbook applies to production `AgentWorkEscrow` deployments that hold real Base mainnet USDC and to the supporting public UI, API, CLI/SDK docs, Stripe fulfillment APIs, and monitoring stack.

Related docs: `docs/production-readiness/security-launch-checklist.md`, `docs/security-notes.md`, `docs/slither-triage.md`, `docs/base-sepolia-deploy.md`, `contracts/AgentWorkEscrow.sol`, `api/`, `bin/awm.js`, `sdk/index.js`.

## Non-negotiable constraints

- **No pause exists in `AgentWorkEscrow` v0.4.** There is no on-chain freeze switch. Incident containment must use UI/API disablement, public warnings, caps/allowlists, signer coordination, and normal contract lifecycle/dispute operations.
- **Owner powers are limited but sensitive.** The owner can call `resolveDispute`, `setDefaultFeeBps`, `setFeeRecipient`, and `transferOwnership`/`acceptOwnership` through `Ownable2Step`. Production owner must be a Safe/timelock path before launch.
- **Funds in normal lifecycle cannot be arbitrarily pulled.** Non-disputed escrows can only move through buyer release, seller claim after review deadline, buyer refund after work deadline with no proof, or party-opened dispute followed by owner resolution.
- **Off-chain evidence matters.** Work specs, proof URIs, dispute URIs, support threads, API logs, Stripe events, and signer actions must be preserved before making irreversible resolutions.
- **Keep secrets out of incident channels.** Never paste private keys, production tokens, webhook secrets, RPC auth strings, or customer private data into tickets/docs/chat.

## Incident roles

Fill these before launch and keep current in the private ops roster.

| Role | Primary responsibility | Required access |
|---|---|---|
| Incident commander | Owns severity, timeline, decisions, and handoffs | Ops ticket/chat, dashboards, deployment metadata |
| Chain operator | Reads contract state, prepares Safe transactions, verifies txs | RPC/explorer, Safe proposer access, ABI/deployment metadata |
| Multisig signers | Review and execute owner actions when needed | Hardware wallets, Safe access, out-of-band contact path |
| API/frontend operator | Disables or restores risky production paths | Vercel/project admin, feature flags/env vars, deploy access |
| Support/business owner | User comms, affected-user list, refund/dispute coordination | Support inbox/CRM, approved comms templates |
| Security reviewer | Root-cause analysis and evidence preservation | Logs, repo, audit context, monitoring data |

Minimum on-call coverage for launch beta: one technical operator plus one support/business owner, with at least quorum awareness for the owner Safe.

## Severity definitions

| Severity | Definition | Examples | Target response |
|---|---|---|---|
| **SEV0** | Active exploit, confirmed or likely fund loss, private-key/admin compromise, malicious deployment/config, or any condition where new deposits are dangerous. | Compromised owner/deployer/signer key; wrong USDC asset on mainnet; unauthorized `OwnershipTransferStarted`; suspicious `setFeeRecipient`; exploit draining or locking funds; frontend routes users to attacker contract; high/critical audit finding discovered post-launch. | Page immediately. Triage starts within 5 minutes. Disable funding paths within 15 minutes. Public warning if deposits may be unsafe. |
| **SEV1** | Real funds materially stuck or at risk, bad operational transaction, signer compromise suspicion, high-priority dispute failure, monitoring blind spot during active funds, or production config mismatch without active loss. | Intent stuck beyond SLA; bad fee bps/recipient; failed Safe execution for needed dispute resolution; indexer misses events; RPC outage prevents monitoring; owner Safe threshold/signers misconfigured. | Triage starts within 15 minutes. Containment/mitigation plan within 1 hour. |
| **SEV2** | User-visible outage/degradation that does not immediately endanger funds. | API outage; Vercel deploy regression; Stripe webhook fulfillment delay; CLI/SDK docs mismatch; delayed support replies; dashboard partial failure with backup explorer available. | Triage starts within business hour / launch on-call window. Update users if prolonged. |
| **SEV3** | Low-risk defect, documentation issue, non-urgent support problem, or expected user error. | Confusing copy, minor status display bug, failed non-critical smoke job, single support ticket with clear user-side fix. | Track in normal backlog; escalate if pattern grows. |

## SEV0 / SEV1 first 15 minutes

1. **Declare the incident.**
   - Create an internal ticket/chat with timestamp, severity, commander, and suspected impact.
   - Use a short title: `SEV0 AgentWorkEscrow suspected feeRecipient compromise`, `SEV1 stuck intent batch after RPC outage`, etc.
2. **Stop new risky inflow.** Because the contract has no pause:
   - Disable mainnet escrow funding UI/API paths and any public CTA that encourages funding.
   - If no feature flag exists, deploy a maintenance banner/page or remove production deployment metadata from public flows.
   - Keep read-only status pages available when safe.
   - Do **not** disable support/contact routes.
3. **Preserve evidence before changing state.**
   - Snapshot current deployment metadata: contract, chain ID `8453`, canonical USDC, owner, pending owner, fee recipient, default fee bps, `nextIntentId`, `accumulatedFees`, contract USDC balance.
   - Export recent events from the incident window: `IntentCreated`, `SignedOfferFunded`, `ProofSubmitted`, `Released`, `ClaimedAfterReview`, `Refunded`, `Disputed`, `DisputeResolved`, `FeesWithdrawn`, `FeeRecipientUpdated`, `DefaultFeeBpsUpdated`, `OwnershipTransferStarted`, `OwnershipTransferred`, ERC-20 `Transfer` involving escrow.
   - Save API error logs, Stripe webhook event IDs, Vercel deploy IDs, and support tickets relevant to the incident.
4. **Notify required people.**
   - Incident commander -> technical operator + support owner.
   - For any owner action or admin compromise suspicion -> all Safe signers through the approved out-of-band contact path.
   - For likely user impact -> prepare public warning draft immediately, even if not posted yet.
5. **Classify affected surface.**
   - Contract/admin, funds/lifecycle, frontend/API, Stripe/private delivery, RPC/indexer/monitoring, docs/comms, or mixed.

## First hour actions

1. **Build the affected-intent list.**
   - Enumerate intents created during the suspicious window and any intents currently `Funded`, `ProofSubmitted`, or `Disputed`.
   - For each: buyer, seller, amount, status, work deadline, review deadline, proof/dispute URI, tx hashes, support contact, and current next action.
2. **Verify accounting.**
   - Compare contract USDC balance to unresolved principal plus `accumulatedFees`.
   - Reconcile recent `Released`/`ClaimedAfterReview`/`Refunded`/`DisputeResolved` events against ERC-20 transfers.
   - Flag any mismatch > 1 USDC raw unit, any negative derived balance, or any transfer not explained by contract event flow.
3. **Decide containment path.**
   - Contract exploit or bad deployment: keep funding disabled, publish warning, stop launch, prepare migration/redeployment plan.
   - Admin compromise suspicion: halt owner actions unless they protect funds; rotate/deprecate compromised signer; consider ownership transfer to clean Safe/timelock if safe and reviewed.
   - Bad fee recipient/default fee: prepare Safe transaction to restore expected value; disclose if user economics were affected.
   - Stuck/disputed intents: contact parties, collect evidence, prepare multisig dispute resolutions only after review.
   - API/Stripe outage: keep escrow unaffected; disable only broken product/fulfillment routes; preserve webhook event IDs for replay/manual fulfillment.
4. **Prepare user communication.**
   - If additional deposits may be risky, publish a warning before full root cause is known.
   - If funds are safe but UX is degraded, publish a status note with known workarounds.
   - Avoid speculation, blame, private data, and irreversible promises.
5. **Document decisions.**
   - Every Safe transaction, deploy rollback, feature flag, user message, and manual fulfillment must have a ticket link, timestamp, approver, and tx/deploy ID.

## Contract-specific response playbooks

### Suspected active exploit or wrong mainnet deployment parameter

- Confirm `usdc()` equals canonical Base mainnet USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` unless official docs change before launch).
- Confirm `owner()` is the approved Safe/timelock and `feeRecipient()` is approved treasury, not a hot EOA.
- Disable funding UI/API and public funding copy.
- Do not create new intents for testing on the affected contract.
- Identify all open intents and their legal/lifecycle options.
- If contract is unsafe for continued use, prepare a new audited deployment and migration guidance; do not imply funds can be force-migrated from existing non-disputed intents.

### Unauthorized or suspicious admin event

Monitor and respond to:

- `OwnershipTransferStarted(previousOwner, newOwner)`
- `OwnershipTransferred(previousOwner, newOwner)`
- `FeeRecipientUpdated(feeRecipient)`
- `DefaultFeeBpsUpdated(feeBps)`
- `DisputeResolved(intentId, buyerAmount, sellerAmount, feeAmount, chargeFee)`

Actions:

1. Verify whether the event was approved in the change calendar/ticket.
2. If not approved, treat as SEV0 until proven otherwise.
3. Disable new funding paths.
4. Contact Safe signers out-of-band.
5. If pending owner is malicious and current owner is still safe, use Safe to correct/cancel by starting transfer to approved owner or taking the documented Safe-specific recovery path.
6. If fee recipient/fee bps was changed incorrectly, prepare a Safe transaction to restore expected values.
7. Audit all transactions from the same signer/safe module around the incident window.

### Dispute or stuck-funds incident

- `Disputed` events are **high priority by default**.
- Preserve work spec, proof URI, dispute URI, buyer/seller messages, and tx history.
- Acknowledge affected parties within the published dispute SLA.
- Do not resolve from incomplete evidence unless there is a documented emergency (e.g. clearly malicious duplicate artifact, court/order/legal requirement, or both parties sign a settlement).
- Prepare `resolveDispute(intentId, buyerAmount, sellerAmount, chargeFee)` as a Safe transaction only after support/business and security review.
- After execution, verify emitted `DisputeResolved` and ERC-20 transfers match the approved split.

### Monitoring/indexer outage while funds are live

- Fail over to backup RPC/explorer and direct `eth_getLogs` queries.
- Keep funding enabled only if at least one trustworthy event/state path is working and the on-call operator can still detect `Disputed`, owner changes, and anomalous transfers.
- If blind to contract events for > 15 minutes during active beta, escalate to SEV1 and disable new funding until monitoring is restored.

### Stripe/private delivery incident

Production paid-product APIs currently include `api/payment-request.js`, `api/stripe-webhook.js`, `api/private-delivery-link.js`, `api/private-delivery-download.js`, `api/delivery-status.js`, and shared helpers.

- Verify Stripe webhook signature status and event IDs.
- Preserve Vercel logs before retention expires.
- If fulfillment is delayed but payment is valid, manually fulfill through the documented support SOP and record evidence.
- If access-token links are exposed or abused, rotate `AWM_DELIVERY_TOKEN`/delivery secrets and invalidate affected links where possible.
- Do not mix Stripe refunds with on-chain escrow refunds without a reconciliation note; they are separate rails.

## On-chain state snapshot checklist

Use deployment metadata plus the final mainnet ABI/artifact. Record outputs in the incident ticket.

- Network and chain ID: Base mainnet `8453`.
- Contract address and source verification link.
- `usdc()`.
- `owner()` and any pending owner if available through `Ownable2Step` ABI.
- `feeRecipient()`.
- `defaultFeeBps()`.
- `MAX_FEE_BPS()`.
- `nextIntentId()`.
- `accumulatedFees()`.
- Canonical USDC `balanceOf(escrow)`.
- Recent event range and latest finalized block.
- Open intents: any `Funded`, `ProofSubmitted`, `Disputed`.

## User communication templates

### Public warning: new deposits unsafe

> We are investigating a production escrow issue affecting AI Work Market on Base mainnet. Do **not** create or fund new escrow intents until we post an all-clear. Existing users should preserve work/proof/dispute records and contact support at [support contact]. We will update this notice by [time].

### Public status: degraded service, funds not currently believed at risk

> AI Work Market escrow/status services are degraded. We are keeping existing on-chain state observable through Base explorer while we restore normal monitoring/API service. We do not currently have evidence of fund loss. Next update by [time].

### Direct affected-user acknowledgement

> We are tracking an issue with your escrow intent `[intentId]` on Base mainnet. Please do not take additional on-chain action for this intent until we finish review unless instructed by your wallet/security team. Preserve the work spec, proof, dispute evidence, and transaction links. We will follow up by [time/SLA].

### Dispute evidence request

> Your escrow intent `[intentId]` is in dispute. Please send: (1) original scope/work URI, (2) proof/delivery URI and artifact access, (3) relevant messages, (4) requested outcome, and (5) any agreed settlement. Do not include private keys or wallet seed phrases. We target acknowledgement within [SLA] and resolution within [SLA].

### All-clear / recovery

> We have mitigated the AI Work Market incident affecting [surface]. New escrow funding is [enabled/remaining disabled] as of [time]. Impact: [summary]. Affected intents/users: [summary]. We will publish a postmortem with root cause and corrective actions by [date].

## Recovery and reopening gates

Do not re-enable mainnet funding until all applicable items are true:

- Root cause is understood and documented.
- Unsafe UI/API/config has been fixed and deployed.
- Contract readbacks match approved deployment metadata.
- Monitoring is current and alerting has passed a test alert.
- Affected open intents have a tracked support/dispute path.
- Any Safe/admin txs were verified on-chain and reconciled.
- Support/business owner approves reopening message.
- Incident commander explicitly downgrades/closes the incident.

## Postmortem requirements

Publish internally for every SEV0/SEV1 and for repeated SEV2s.

Include:

- Summary and severity.
- Timeline with UTC and local timestamps.
- Impact: users, intents, amounts, duration, lost/degraded functionality.
- Root cause and contributing factors.
- What worked / what failed.
- Exact tx hashes, deploy IDs, alert IDs, ticket links.
- Corrective actions with owners and deadlines.
- User communications sent.
- Whether launch caps, dispute policy, monitoring thresholds, or contract design must change.

## Dry-run requirement before launch

Before mainnet beta, run at least two tabletop exercises and record timestamps/evidence:

1. SEV0: suspicious `FeeRecipientUpdated` or ownership transfer event.
2. SEV1: indexer/RPC outage plus a `Disputed` event and one stuck `ProofSubmitted` intent.

Each drill must prove that operators can disable funding paths, snapshot contract state, reach Safe signers, produce a public warning draft, and restore/verify monitoring without exposing secrets.
