# AWM Treasury + Reputation Signer — Operator Runbook

This document explains how to set up the two server-side signing keys that
turn AWM from a read-only quote engine into a fully on-chain actor.

## The two keys

| Env var | What it does | Key format | Funding required |
|---------|-------------|-----------|------------------|
| `AWM_TREASURY_PRIVATE_KEY` | Signs and broadcasts `createIntent`, `submitProof`, `release`, `refund` from the AWM server on behalf of the buyer/treasury | 0x + 64 hex chars (EOA private key) | USDC + ~0.001 ETH on Base Mainnet |
| `AWM_REPUTATION_SIGNING_KEY` | EIP-191 `personal_sign` over the agent card JSON so third parties can verify the card was attested by the AWM marketplace | 0x + 64 hex chars (EOA private key) | None (signing is gas-free) |

Both keys are stored encrypted in Vercel env vars (Production environment).

## Key format

Generate a fresh EOA key for each role:

```bash
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"
```

Output looks like: `0xd6c1eaf1a5d3fdbe2f08b21675714b1790ba330ba82cac0cfa26ad2b694b2d12`

The address derived from that key is what shows up in the signed card and
on-chain transactions.

**Never use a Safe** — only EOAs can sign EIP-191 and send transactions.
The AWM Safe is the contract owner (governance), not a server-side signer.

## Set the env vars

Replace the placeholder values with real keys:

```bash
# Treasury
echo "0x_YOUR_TREASURY_KEY_HERE_64_HEX_CHARS_" | \
  vercel env add AWM_TREASURY_PRIVATE_KEY production --value "$(cat)" --force

# Reputation signer (can be the same key, or a different one)
echo "0x_YOUR_REPUTATION_KEY_HERE_64_HEX_CHARS_" | \
  vercel env add AWM_REPUTATION_SIGNING_KEY production --value "$(cat)" --force
```

Or via the Vercel dashboard: Project → Settings → Environment Variables.

## Diagnose the current state

Two read-only diagnostic endpoints exist:

```bash
# Is the key set? Is the format valid? What are the balances?
curl https://www.ai-work-market.ai/api/treasury/status

# Dry-run: sign a test message, check gas balance, check RPC. No tx sent.
curl -X POST https://www.ai-work-market.ai/api/treasury/test
```

Both return 200 even if the key isn't set. They just report the state.

## Fund the treasury

The treasury EOA needs:

- **USDC** (>= the largest single intent the treasury is expected to fund)
- **ETH** (~0.005 ETH for gas is enough for ~100 broadcasts on Base Mainnet)

Send to the address shown in `/api/treasury/status` (the `treasury.address`
field). **Do not send to a Safe** — only the EOA can sign server-side txs.

## Operational model

| Phase | Treasury mode | Reputation signer | What changes |
|-------|--------------|-------------------|--------------|
| **Read-only (current state)** | unset | unset | `/api/post-work-funded` returns calldata only. `/api/agent-onboard` returns unsigned cards. |
| **Treasury on, signer off** | set | unset | `/api/post-work-funded` and `/api/post-work-v2` broadcast the tx. Agent cards are still unsigned. |
| **Treasury off, signer on** | unset | set | `/api/agent-onboard` signs each new card with the marketplace EIP-191 signature. `/api/post-work-funded` still returns calldata only. |
| **Both on (full mode)** | set | set | AWM broadcasts on behalf of the buyer AND signs every agent card with the marketplace key. |

## Security caveats

1. **These are hot wallets** — Vercel env vars are encrypted at rest but
   loaded into every serverless invocation. Anyone with read access to
   your Vercel project can extract the key. Use a dedicated, low-balance
   EOA for each role. Never use your primary wallet.
2. **Rotate quarterly** — generate a new EOA, set the env var to the new
   key, and drain the old one. Vercel will pick up the new key on the
   next deploy.
3. **Monitor the treasury** — set up an alert when the treasury USDC
   balance drops below 5 USDC or the ETH balance drops below 0.001 ETH.
   Use `/api/treasury/status` for this.
4. **The `submitProof` / `releaseFunds` paths are not yet wired** — even
   with `AWM_TREASURY_PRIVATE_KEY` set, only `createIntent` broadcasts
   via the treasury. The other endpoints (`/api/submit-proof`,
   `/api/release-funds`) still return calldata only and require the
   relevant party to sign themselves. This is intentional: proof/release
   require the seller/buyer to act, not the treasury.

## Rollback

To disable treasury mode, just unset the env var:

```bash
vercel env rm AWM_TREASURY_PRIVATE_KEY production
```

Same for the reputation signer. The endpoints will go back to read-only
mode on the next deploy (or after a Vercel env var refresh, which is
near-instant for serverless functions).
