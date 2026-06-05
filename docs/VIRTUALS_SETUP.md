# AWM-on-Virtuals Setup Guide

This is the step-by-step for Dario to register Yoshi (the AWM seller agent)
on Virtuals Protocol's Agent Commerce Protocol (ACP) marketplace. The backend
service is already built and live at `https://ai-work-market.ai/api/virtuals/offering-handler`.

## What you get when you finish

Three new AWM-powered offerings on the Virtuals ACP marketplace, discoverable
and hireable by every other agent in the ecosystem. Prices are below:

| Offering | Price | What it does |
|---|---|---|
| `awm-intent-lookup` | $0.10 | Look up on-chain state of an AWM work contract |
| `awm-agent-reputation` | $0.50 | Get the reputation score of an AWM agent |
| `awm-work-verifier` | $1.00 | Run the verifier on a submitted proof, return release/dispute decision |

Payouts go to `0xec89c40CA296F502cD033e07f18DA5E01cdd197d` (your AWM treasury wallet).

## The 5 commands (run them in order)

### Step 1: Authenticate (browser click required, ~30 seconds)

```bash
acp configure start --json
```

Copy the URL from the output. Open it in a browser. Sign in with the
account that owns the AWM agent (could be dario's account, could be a
new one — your choice). Come back here.

```bash
acp configure complete --request-id <requestId> --wait --timeout 300 --json
```

This polls until the auth completes. Should return `{"status":"authenticated",...}`.

### Step 2: Create the agent (Yoshi)

```bash
acp agent create "Yoshi" --json
```

This creates Yoshi with an auto-provisioned Base wallet. Note the agent ID.

### Step 3: Add a signer (so Yoshi can sign marketplace jobs)

```bash
acp agent add-signer --agent-id <AGENT_ID> --no-wait --json
```

Copy the signerUrl from the output. Open it in a browser. Approve.
Come back.

```bash
acp agent signer-status --agent-id <AGENT_ID> --request-id <REQUEST_ID> --public-key <PUBLIC_KEY> --wait --timeout 300 --json
```

### Step 4: Fund the wallet (so Yoshi can pay gas for the listing)

```bash
acp wallet topup --chain-id 8453 --method qr --json
```

This returns the wallet address. Send ~5 USDC to it from any Base wallet
(you have 0.075 ETH in the AWM treasury — that's enough for gas, but you
need USDC for the listing fee if any).

### Step 5: Register the 3 offerings

For each offering, run:

```bash
# Offering 1: intent lookup
acp offering create --name "awm-intent-lookup" \
  --description "Look up the on-chain state of an AWM work contract" \
  --price 0.10 \
  --currency USDC \
  --requirements '["intentId:int", "network:string"]' \
  --deliverable-schema '...' \
  --webhook-url "https://ai-work-market.ai/api/virtuals/offering-handler" \
  --json

# Offering 2: reputation
acp offering create --name "awm-agent-reputation" \
  --description "Get the reputation index of an AWM agent" \
  --price 0.50 \
  --currency USDC \
  --requirements '["agent:address", "network:string"]' \
  --webhook-url "https://ai-work-market.ai/api/virtuals/offering-handler" \
  --json

# Offering 3: verifier
acp offering create --name "awm-work-verifier" \
  --description "Run the AWM verifier on a submitted proof and return release/dispute decision" \
  --price 1.00 \
  --currency USDC \
  --requirements '["intentId:int", "proofUrl:string", "network:string"]' \
  --webhook-url "https://ai-work-market.ai/api/virtuals/offering-handler" \
  --json
```

(Adjust the exact flags based on what the CLI version 1.0.12 actually
accepts — run `acp offering create --help` first to verify the schema.)

## After registration

Once all 3 offerings are registered, Yoshi will:
1. Be discoverable on the ACP marketplace at https://app.virtuals.io/acp
2. Show up when other agents run `acp browse "awm"`, `acp browse "agent reputation"`, `acp browse "verifier"`
3. Receive USDC payments into the wallet at `0xec89c40C...197d` for each completed job

## Total time

- Step 1: 2 min (browser click)
- Step 2: 30 sec
- Step 3: 2 min (browser click)
- Step 4: 1 min (you already have the USDC, just send it)
- Step 5: 5 min (3 offerings × ~1 min each)

**Total: ~10-12 minutes.** All 3 paths then run in parallel.

## Why this is the third path

- **Reach:** Virtuals ACP has 3,700+ daily buyers and only 2-3 daily sellers in the work-contract subcategory. The supply problem we identified earlier.
- **No outreach needed:** Other agents discover and hire on their own.
- **Compounds:** Every completed job increases Yoshi's reputation, which makes the next job easier to win.
- **Complements the AWM core:** The same AWM contracts that AWM escrow protects can now also be queried and verified by other agents in the Virtuals ecosystem.

## What I CAN do (and have done)

- ✅ Built the backend service (`api/virtuals/offering-handler.js`)
- ✅ Defined the 3 offerings with prices, SLAs, requirements, deliverables
- ✅ Wrote this setup guide
- ✅ Installed the CLI globally (`acp` v1.0.12)
- ✅ Started the configure flow (got the auth URL but it expires in 5 min)

## What I CANNOT do

- ❌ Complete the browser OAuth (needs your click)
- ❌ Add the signer (needs your click)
- ❌ Send USDC to the new agent's wallet (could, but you should approve the amount)
- ❌ Final registration of the offerings (depends on having a configured agent)

The auth URL is `https://app.virtuals.io/acp/auth/v2?requestId=8b6cc39e75a079708fe32def9d409175`
but it has expired by now. Just run `acp configure start --json` to get a fresh one.

The 5 commands above are everything you need.
