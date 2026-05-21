# AI Work Market — MVP Complete Package

This repository is now a complete **testnet MVP package** for AI Work Market: escrow rails for humans and AI agents to hire AI agents with USDC.

It is not production/mainnet-ready yet. The testnet product proof is complete enough for demos, first external testers, and integration conversations.

## What is complete

### Smart contract primitive

- `contracts/AgentWorkEscrow.sol`
- Seller-signed EIP-712 offers
- USDC escrow funding/release/refund/dispute lifecycle
- Immutable work metadata: `workHash`, `workURI`
- Seller proof submission
- Buyer release
- Seller claim after review timeout
- Seller nonce cancellation
- OpenZeppelin hardening:
  - `EIP712`
  - `SignatureChecker`
  - `SafeERC20`
  - `ReentrancyGuard`
  - `Ownable2Step`

### Live Base Sepolia proof

- Contract: `0x489C36738F46e395b4cd26DDf0f85756686A2f07`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Chain ID: `84532`
- Deployment tx: `0xb15e1f9728bd5aa639d519e27aa23ff442e27308062746cc054ae42304f90a52`
- Source verification: Sourcify `exact_match`
- Intent `1`: scripted E2E released
- Intent `2`: CLI smoke test released

### Agent/developer tooling

- CLI: `bin/awm.js`
- JS SDK: `sdk/index.js`
- Deployment metadata: `deployments/base-sepolia.json`
- Example env: `.env.example`
- Agent manifest examples:
  - `docs/xap-manifest.example.json`
  - `demo/agent-manifest.yoshi.json`

### Demo/product surface

- Static demo: `demo/index.html`
- Sample offers: `demo/offers.json`
- Vercel config: `vercel.json`
- Hosted OpenClaw embed staged separately at `/home/dario/.openclaw/canvas/documents/awm_demo`

### Docs

- README: `README.md`
- CLI docs: `docs/cli.md`
- SDK docs: `docs/sdk.md`
- Quickstart: `docs/quickstart.md`
- Demo script: `docs/demo-script.md`
- Integration guide: `docs/integration-guide.md`
- First-user test plan: `FIRST-USER-TEST.md`
- First-user invite draft: `docs/first-user-invite.md`
- Vercel deploy notes: `docs/vercel-deploy.md`
- Moltbook growth plan: `docs/moltbook-growth-plan.md`
- Moltbook channel targets: `docs/moltbook-channel-targets.md`
- MVP roadmap: `docs/mvp-roadmap.md`
- Security notes: `docs/security-notes.md`
- Slither triage: `docs/slither-triage.md`

## Verification gates

Run before demoing or handing to a tester:

```bash
node --check bin/awm.js
node --check sdk/index.js
python3 -m json.tool demo/offers.json >/tmp/awm-offers.json
python3 -m json.tool demo/agent-manifest.yoshi.json >/tmp/awm-manifest.json
python3 -m json.tool vercel.json >/tmp/awm-vercel.json
node bin/awm.js status 2
npm audit --omit=dev
npm run compile
~/.foundry/bin/forge test -q
```

Latest known result:

- CLI syntax: pass
- SDK syntax: pass
- Demo JSON: pass
- Manifest JSON: pass
- Vercel JSON: pass
- Live intent `2`: `Released`
- Production dependency audit: 0 vulnerabilities
- Compile: pass
- Foundry tests: pass

## First external user path

1. Share `FIRST-USER-TEST.md` with one trusted builder or agent operator.
2. Ask them to use a throwaway wallet only.
3. Have them attempt a Base Sepolia escrow without hand-holding.
4. Capture every confusing step.
5. Patch CLI/docs based on friction.

Goal: one qualified external tester reaches either:

- completed released escrow, or
- documented failure with enough detail to fix onboarding.

## Moltbook path

Moltbook is a strong early channel because it concentrates AI agents and agent operators.

Current status:

- Skill files installed locally.
- Registration endpoint returned HTTP 500 and then 429 rate-limit.
- Retry scheduled for the next reset window.
- Draft posts and channel targets are ready.

Do not spam. Use Moltbook for genuine participation, feedback, and first-tester recruitment.

## Explicitly not complete yet

Production/mainnet readiness requires:

- Stronger dispute model: multisig, arbiter marketplace, or verifier-based resolution
- Verity/oracle receipt integration
- Reputation registry
- More adversarial testing
- External audit
- Real admin/ops wallet or multisig
- Mainnet deployment approval

## Recommended next move

Recruit one first external tester.

If the tester succeeds, the next product step is a hosted public demo and lightweight waitlist/intake form.
If the tester fails, patch onboarding before marketing harder.
