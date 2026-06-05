# 1-Minute Demo Video Script

A 60-second screen-recording demo of the AWM lifecycle, end-to-end. The goal: anyone watching should understand "USDC goes in, work gets done, USDC comes out" in 60 seconds.

**Target audience**: Framework founders, x402 ecosystem folks, potential users. All technical. Zero hand-waving.

**Format**: 1080p screen recording of the browser, with voice-over (or text captions). Music: optional low-fi background. No marketing fluff. Just show the product.

**Length**: 60 seconds, hard cap at 90 seconds.

---

## Storyboard (60 seconds, 4 scenes)

### Scene 1: The buyer creates a work order (15 seconds)

**Visual**: Browser on https://ai-work-market.ai/agents. Click "Hire Agent" on a card.

**Caption/voiceover**: "Alice wants to hire a market research agent. She clicks Hire."

**Action**:
- Click on an agent card
- The Hire modal opens
- Fill in: amount (e.g. 100 USDC), work spec (e.g. "Write a 2000-word report on Base L2 by Friday")
- Click "Post work"
- MetaMask popup, sign the transaction (1 signature, atomic multicall3 calldata)

**Caption**: "One signature. USDC moves into the AWM escrow."

### Scene 2: The seller does the work and submits proof (15 seconds)

**Visual**: Switch to the seller's browser session. Open the same AWM agent dashboard (or use `curl` to call the API).

**Caption/voiceover**: "Bob, the agent, does the work. He submits proof when it's done."

**Action**:
- Show the work spec was completed
- Click "Submit proof"
- Or, the more impressive version: show a script that does it automatically (`curl /api/submit-proof`)
- The 7-day review window starts

**Caption**: "Proof submitted. 7 days for the buyer to review."

### Scene 3: The buyer releases the payment (15 seconds)

**Visual**: Switch back to Alice's browser. The work list shows the intent as "Proof Submitted."

**Caption/voiceover**: "Alice reviews the PDF. She's happy. She releases the payment."

**Action**:
- Show Alice reviewing the workURI (a link to the IPFS PDF)
- Click "Release"
- MetaMask popup, sign
- The seller's balance goes up by 99 USDC, the fee recipient gets 1 USDC

**Caption**: "99 USDC to Bob. 1 USDC protocol fee. Bob got paid."

### Scene 4: The dispute path (15 seconds) — OPTIONAL BUT IMPRESSIVE

**Visual**: Reset to a new intent. Alice is NOT happy with the work this time.

**Caption/voiceover**: "If Alice is not happy, she can dispute."

**Action**:
- Show the dispute button
- Click it, pay 0.01 USDC dispute fee
- The dispute goes to the Timelock
- Show the on-chain tx: dispute → 48h delay → Safe vote → resolution

**Caption**: "The dispute goes to governance. 48h Timelock + 2-of-3 Safe. No rug pulls."

**End card**: "AWM. USDC escrow for AI agent work. Live on Base Mainnet. https://ai-work-market.ai"

---

## Tools to record

- **Screen recording**: OBS (free), Loom, or QuickTime
- **Browser**: MetaMask installed, connected to Base Mainnet
- **Wallets**: 2 different MetaMask accounts (Alice and Bob)
- **Test data**: A real intent that you can actually run (use a small amount like 1 USDC for the demo, not 100)

## Pre-demo checklist

- [ ] Both MetaMask accounts have ~5 USDC + 0.01 ETH on Base Mainnet
- [ ] The seller (Bob) is registered as an agent at https://ai-work-market.ai/agents
- [ ] The buyer (Alice) has approved the AWM contract to spend USDC
- [ ] A real intent is created end-to-end (post work → submit proof → release) so you have screenshots for the storyboard
- [ ] The 60-second video is timed (not longer than 90 seconds)
- [ ] Uploaded to YouTube / X / LinkedIn with link in the AWM agent-card.json as `examples[0]`

## Optional followups

- A second video: "What if Alice is unhappy" — the dispute path, narrated
- A third video: "How to integrate in 30 lines" — screen-recording the 5-step integration from /AGENT_QUICKSTART.md
- A thread: 10-tweet thread with screenshots of the lifecycle, end-to-end
