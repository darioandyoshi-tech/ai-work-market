# AI Work Market Production Security Launch Checklist

Status: **mainnet blocked**. The Base Sepolia MVP proves the flow, but production/mainnet must not launch until every **P0/P1 gate** below is closed and signed off.

Sources reviewed: `contracts/AgentWorkEscrow.sol`, `test/AgentWorkEscrow.t.sol`, `docs/security-notes.md`, `docs/slither-triage.md`, `docs/base-sepolia-deploy.md`, `deployments/base-sepolia.json`, `script/DeployAgentWorkEscrow.s.sol`, and API routes under `api/`.

## Current Base Sepolia baseline

- Escrow contract: `AgentWorkEscrow` v0.4.
- Testnet deployment: Base Sepolia `0x489C36738F46e395b4cd26DDf0f85756686A2f07`.
- Testnet USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Owner and fee recipient are currently the same EOA: `0x8d32448cbad55a3d3B12DE901e57782C409399B7`.
- Live Base Sepolia E2E passed for signed offer -> fund -> proof -> release.
- Latest documented gates: `npm run compile` success; `forge test -vvv` 18 passed; Slither 0 high/medium with accepted low timestamp warnings.
- Public paid-product APIs currently use Stripe payment links/manual fulfillment. On-chain escrow is explicitly labeled testnet-only in API responses.

## Go/no-go rule

Production means **real user funds on Base mainnet**. Do not deploy or point any public UI/API copy at mainnet escrow until:

1. Contract/admin model is hardened and independently reviewed.
2. Dispute/verifier model is production-defined, documented, and legally supportable.
3. Monitoring, incident response, and customer risk language are live.
4. Mainnet deployment is executed through a reproducible runbook with multisig-controlled ownership.

## P0 hard blockers

| Area | Gate | Exact production requirement | Evidence required |
|---|---|---|---|
| Admin ownership | Multisig owner | Contract owner must be a Safe multisig on Base mainnet, not an EOA. Recommended minimum: 2-of-3 before limited beta, 3-of-5 before open launch. Signers must be named internally, hardware-wallet backed, and geographically/account separated. | Safe address, signer list, threshold, owner read from contract, handoff tx hash if ownership transferred post-deploy. |
| Admin change process | Timelock or public notice | Any owner-controlled action after launch (`resolveDispute`, `setDefaultFeeBps`, `setFeeRecipient`) must have either an on-chain timelock or a documented emergency-only exception. If timelock is deferred for beta, cap beta TVL and publish the centralized-admin risk. | Timelock contract/config or signed exception with TVL cap and public disclosure. |
| Fee recipient | Separate treasury | `feeRecipient` must not be a hot EOA. Use a Safe or dedicated treasury wallet. If different from owner, document who controls it and how fee withdrawals are reconciled. | `feeRecipient()` readback, Safe/treasury link, withdrawal SOP. |
| Disputes | No single-human silent arbitration | Current `onlyOwner resolveDispute` is acceptable only for testnet. Mainnet needs a defined arbitrator/verifier policy before funds are accepted. At minimum: multisig resolution, written evidence standard, response SLA, appeal/escalation path, and conflict-of-interest rule. | Published dispute policy, internal arbiter runbook, sample resolution records, multisig owner. | DONE: see `docs/production-readiness/dispute-policy.md` |
| Audit | External security review | Before mainnet with public funds: independent review of `AgentWorkEscrow.sol`, deployment script, EIP-712 typed-data construction in SDK/CLI, and operational controls. Critical/high findings fixed; medium findings fixed or explicitly risk-accepted. | Audit report or review memo, fix commits, retest evidence. |
| Mainnet USDC | Canonical asset only | Deploy only with canonical Base mainnet USDC. Do not use bridged/wrapped/custom tokens. Contract assumes USDC-style non-rebasing/non-fee-on-transfer behavior. | USDC address source link, constructor arg, post-deploy `usdc()` readback. |
| Legal/risk copy | Production disclaimers | Public app/API/docs must state escrow limitations, centralized dispute authority, no guarantee of work quality, off-chain evidence risk, refund/release rules, fees, supported jurisdiction posture, and support contact. Remove or clearly qualify any copy implying trustless production arbitration. | Updated `trust.html`, product pages, README/docs, API protocol notes. |
| Monitoring | Funds/lifecycle alerts | Mainnet cannot launch without event monitoring for `IntentCreated`, `ProofSubmitted`, `Released`, `Refunded`, `Disputed`, `DisputeResolved`, `FeesWithdrawn`, fee changes, owner transfer events, and stuck/disputed intents. | Monitoring dashboard URL/config, alert recipients, tested alert. |
| Incident response | Runbook live | Need written severity levels, freeze/triage procedure, user comms templates, signer contact path, evidence preservation, and postmortem process. Because the contract has no pause, the response plan must include UI/API disablement and public warning path. | Incident runbook, dry-run timestamp, contact roster. |

## P1 launch gates

| Area | Gate | Requirement | Evidence required |
|---|---|---|---|
| Contract tests | Expanded coverage | Keep current tests and add production-specific cases: owner transfer to Safe, fee recipient changes, max fee enforcement, dispute split edge cases, all lifecycle terminal states, URI length limits, EIP-1271 happy path if smart-wallet sellers are supported. | `forge test -vvv` output and coverage notes. |
| Static/dynamic analysis | Clean analyzer suite | Run Slither on final source; consider Echidna/Foundry invariants for accounting: escrow token balance equals unresolved principal + accumulated fees, no double-release/refund, terminal states cannot move again. | Analyzer outputs, accepted findings doc. |
| Accounting | Reconciliation | Define how platform reconciles `accumulatedFees`, outstanding principal, Stripe revenue, manual fulfillment, and treasury withdrawals. | Reconciliation script/report format. | DONE: see `docs/production-readiness/accounting-reconciliation.md` |
| API hardening | Production secrets and auth | `AWM_DELIVERY_TOKEN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` must be production secrets in Vercel, rotated from any dev values. Avoid `access_token` query auth for production protected resources; mark as deprecated. | Vercel env audit, token rotation date, endpoint behavior test. | DONE: query access_token marked deprecated in api/protected-resource.js |
| Webhook persistence | Durable fulfillment trail | `api/stripe-webhook.js` currently logs verified events but does not persist fulfillment state. For production fulfillment, add durable storage or an explicit manual ops workflow that cannot lose purchases if logs expire. | DB/table or manual ops SOP with Stripe dashboard fallback. |
| Rate limiting | Abuse controls | Add rate limits or provider-level controls for product/payment/status endpoints, especially Stripe session lookups. | Vercel/WAF config or app-level limiter evidence. |
| Privacy | PII minimization | Current APIs avoid returning customer PII; keep this. Document what Stripe data is accessed, where logs go, and retention. | Privacy note and log review. |
| Support | User-facing support path | Publish a support contact and expected response time for paid products, escrow disputes, stuck proofs, and mistaken payments. | Support page/copy. |
| Chain operations | RPC and explorer redundancy | Use reliable mainnet RPC, backup RPC, and block explorer verification path. Avoid deployments from local ad-hoc shell history with raw private keys. | RPC/provider config, backup plan, key-management note. |

## P2 improvements before open launch

- Replace per-offer `cancelOfferNonce` only with optional bulk nonce invalidation (`minValidNonce`) for sellers.
- Consider public-offer semantics only after buyer binding is explicitly redesigned; current offers are buyer-specific.
- Consider emergency rescue for unrelated ERC-20 tokens accidentally sent to the contract, with clear limits to avoid escrowed USDC custody abuse.
- Add a reputation/receipt registry only after dispute/verifier semantics are settled.
- Add signed delivery links for paid assets instead of shared delivery tokens/manual fulfillment.

## Contract-specific review notes

### Implemented controls worth preserving

- OpenZeppelin `EIP712`, `SignatureChecker`, `SafeERC20`, `ReentrancyGuard`, and `Ownable2Step`.
- Seller-signed offers bind buyer, seller, amount, work hash, work URI hash, work timeout, review period, nonce, and expiry.
- Digest replay protection and seller nonce cancellation.
- Work/proof/dispute URI presence and size cap.
- Fee cap of 10% (`MAX_FEE_BPS = 1000`).
- Buyer refund only after work deadline if no proof was submitted.
- Seller claim only after proof and review deadline.
- Both parties can open disputes.

### Mainnet risk items

- `resolveDispute` is centralized under `owner`. This is the biggest production trust assumption.
- There is no `pause`, so incidents must be handled by UI/API shutdown, warnings, and multisig dispute/refund operations.
- A party can dispute and freeze normal lifecycle until owner resolution.
- Evidence is off-chain URI text; the contract does not verify content availability, authorship, or quality.
- No oracle/verifier integration exists yet.
- `createIntent` allows direct buyer-created escrows without seller signature. It is labeled test/admin-friendly; if production UX should require seller-signed offers, the frontend/SDK/API must hide direct creation or the contract should remove/restrict it in a production version.

## Production dispute/verifier model gate

Pick one before mainnet beta and document it publicly.

### Option A — Multisig arbitration beta (fastest acceptable beta)

- Owner is Safe multisig.
- Dispute resolution requires multisig transaction.
- Evidence allowed: original work spec hash/URI, proof URI, off-chain conversation/export, delivery artifacts, timestamps, and payment txs.
- SLA: e.g. acknowledge within 2 business days, target resolution within 7 business days.
- Publish that arbitration is centralized and discretionary.
- Cap per-intent size and total TVL during beta.

### Option B — Verifier/oracle-assisted release (preferred for scaling)

- Proof must include a verifier receipt hash or signed assessment.
- Disputes can route to a defined verifier panel or automated checks.
- Owner/multisig only resolves exceptions.
- Requires new contract/API design and audit.

### Option C — Fully external arbitration

- Use an external arbitration provider or DAO process.
- Contract owner follows signed/recorded external rulings.
- Slower to implement; stronger neutrality if credible.

Recommended path: **Option A for capped private beta only**, then Option B before broad public launch.

## Monitoring requirements

Minimum dashboard/alert set:

- New intent volume and total funded principal.
- Contract USDC balance, estimated unresolved principal, and `accumulatedFees`.
- Intent stuck in `Funded` past work deadline with no refund.
- Intent stuck in `ProofSubmitted` past review deadline with no claim/release.
- Every `Disputed` event as high priority.
- Every `DisputeResolved` event with split details.
- Every `FeesWithdrawn`, `FeeRecipientUpdated`, `DefaultFeeBpsUpdated`.
- `OwnershipTransferStarted` / `OwnershipTransferred` from `Ownable2Step`.
- RPC/indexer lag and failed API/CLI settlement actions.

Alert recipients must include at least one technical operator and one business/support owner.

## Incident response gate

Create `docs/production-readiness/incident-response.md` or equivalent before launch with:

1. Severity definitions:
   - SEV0: active exploit/fund loss/private-key compromise.
   - SEV1: stuck funds, bad deployment parameter, bad fee recipient, signer compromise suspicion.
   - SEV2: API outage, Stripe fulfillment delay, monitoring failure.
2. First 15 minutes:
   - Stop promoting/funding UI paths.
   - Disable mainnet escrow actions in frontend/API if possible.
   - Snapshot contract state and recent events.
   - Notify multisig signers.
3. First hour:
   - Identify affected intents/users.
   - Publish user warning if additional deposits are risky.
   - Prepare dispute/refund/resolution txs if appropriate.
4. Recovery:
   - Verify txs, reconcile balances, reopen only after root cause is fixed.
5. Postmortem:
   - Timeline, impact, root cause, corrective actions, user comms.

## Legal/risk language gate

Before production, public copy must clearly say:

- AI Work Market provides escrow/payment coordination software, not a guarantee of work quality or outcome.
- Work evidence/proofs are off-chain; users are responsible for preserving artifacts.
- Disputes during beta are resolved by the platform/multisig under a published policy, not a court or trustless oracle.
- Crypto payments carry smart-contract, wallet, RPC, chain, and irreversible transaction risks.
- Fees, refund timing, review timing, and dispute timing are disclosed before funding.
- Supported asset/network is Base mainnet USDC only.
- Users must not submit illegal, infringing, regulated, sensitive, or unsafe work requests.
- Support/contact and jurisdiction/company identity are visible.

## Mainnet deployment runbook

Use this only after all P0 gates are complete.

### 1. Freeze release candidate

- Tag source release candidate.
- Record contract commit hash.
- Ensure `contracts/AgentWorkEscrow.sol`, `script/DeployAgentWorkEscrow.s.sol`, SDK/CLI typed-data code, and docs are final.
- No unreviewed changes after audit signoff.

### 2. Preflight checks

Run locally/CI:

```bash
npm ci
npm run compile
forge test -vvv
uvx --from slither-analyzer slither . --filter-paths 'lib|node_modules' --json slither-report.mainnet.json
npm run check:all
```

Required result: compile/test/checks pass; Slither has no high/medium findings unless explicitly signed off.

### 3. Confirm deployment inputs

- Network: Base mainnet.
- Chain ID: `8453`.
- USDC: canonical Base mainnet USDC address from official Circle/Base docs.
- Initial owner/deployer: either the Safe directly if deployment mechanism supports it, or a deployer EOA that immediately transfers ownership to Safe via `transferOwnership` + `acceptOwnership`.
- `FEE_RECIPIENT`: Safe/treasury, not hot EOA.
- Deployer funded with enough ETH only for deployment and verification.

### 4. Simulate deployment

```bash
export BASE_MAINNET_RPC_URL="..."
export USDC="<canonical Base mainnet USDC>"
export FEE_RECIPIENT="<treasury Safe>"
export PRIVATE_KEY="<temporary deployer key>"
forge script script/DeployAgentWorkEscrow.s.sol:DeployAgentWorkEscrow \
  --rpc-url "$BASE_MAINNET_RPC_URL"
```

Verify printed owner/USDC/fee recipient before broadcast.

### 5. Broadcast and verify

```bash
forge script script/DeployAgentWorkEscrow.s.sol:DeployAgentWorkEscrow \
  --rpc-url "$BASE_MAINNET_RPC_URL" \
  --broadcast \
  --verify
```

Record tx hash, contract address, constructor args, compiler version, optimizer settings, and verification link.

### 6. Transfer ownership if deployed by EOA

- Call `transferOwnership(<owner Safe>)` from deployer.
- Call `acceptOwnership()` from Safe.
- Confirm `owner()` returns Safe.
- Remove deployer from operational authority; do not keep production owner as deployer EOA.

### 7. Post-deploy readbacks

Read and record:

- `usdc()` equals canonical Base mainnet USDC.
- `feeRecipient()` equals treasury Safe.
- `owner()` equals owner Safe/timelock.
- `defaultFeeBps()` equals intended fee.
- `MAX_FEE_BPS()` equals 1000.
- `nextIntentId()` equals 1.
- Source verification status.

### 8. Mainnet smoke test with tiny cap

- Use a tiny real USDC amount.
- Seller signs offer.
- Buyer approves/funds.
- Seller submits proof.
- Buyer releases.
- Verify fee accrual and optional fee withdrawal to treasury.
- Run one refund path and one dispute path on tiny internal-only intents if acceptable.

### 9. Publish deployment metadata

Create `deployments/base-mainnet.json` with:

- network, chain ID, contract, tx hash, USDC, owner, fee recipient, deployed timestamp, explorer links.
- verification status.
- smoke-test txs.
- launch caps and dispute policy link.

### 10. Enable production UX gradually

- Start with allowlisted/capped beta.
- Monitor every transaction.
- Increase caps only after no critical incidents for a defined period.

## Remaining blockers summary

1. Replace EOA owner/fee-recipient pattern with Safe/timelock-backed ops.
2. Define and publish dispute/verifier policy.
3. Complete independent audit/review and fix findings.
4. Add production monitoring and incident response.
5. Update legal/risk/product copy for real funds.
6. Harden API secrets/auth/rate limits and Stripe fulfillment persistence.
7. Write and rehearse Base mainnet deployment metadata/runbook.
8. Decide whether direct `createIntent` remains in production contract or is removed/restricted in a production-specific version.

Until these are done, keep on-chain escrow messaging as **Base Sepolia testnet-only** and use Stripe/manual fulfillment for real paid products.
