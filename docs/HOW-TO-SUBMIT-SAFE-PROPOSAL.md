# How to submit the setZKVerifier proposal to your Safe

Three methods. Try in this order. Method 1 (manual paste) is the most reliable and what the AWM team's been using for months.

## Method 1: Manual paste in Safe Transaction Builder (RECOMMENDED — always works)

1. Open https://app.safe.global and connect to your Safe:
   - Network: Base Mainnet
   - Safe address: `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637`

2. Go to **"New Transaction"** → **"Transaction Builder"**.

3. In the **"Enter address or ENS"** field, paste:
   ```
   0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967
   ```
   (This is the Timelock contract.)

4. The ABI box will appear. **Click the ABI box** and paste this full TimelockController ABI:

   ```json
   [
     {
       "inputs": [
         { "internalType": "address", "name": "target", "type": "address" },
         { "internalType": "uint256", "name": "value", "type": "uint256" },
         { "internalType": "bytes", "name": "data", "type": "bytes" },
         { "internalType": "bytes32", "name": "predecessor", "type": "bytes32" },
         { "internalType": "bytes32", "name": "salt", "type": "bytes32" },
         { "internalType": "uint256", "name": "delay", "type": "uint256" }
       ],
       "name": "schedule",
       "outputs": [],
       "stateMutability": "nonpayable",
       "type": "function"
     },
     {
       "inputs": [
         { "internalType": "address", "name": "target", "type": "address" },
         { "internalType": "uint256", "name": "value", "type": "uint256" },
         { "internalType": "bytes", "name": "data", "type": "bytes" },
         { "internalType": "bytes32", "name": "predecessor", "type": "bytes32" },
         { "internalType": "bytes32", "name": "salt", "type": "bytes32" }
       ],
       "name": "execute",
       "outputs": [],
       "stateMutability": "payable",
       "type": "function"
     }
   ]
   ```

5. Click **"Add ABI"**. You should now see `schedule` and `execute` in the function dropdown.

6. Select **`schedule`** and fill in:
   - `target` (address): `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2`
   - `value` (uint256): `0`
   - `data` (bytes): `0xc5090346000000000000000000000000c0038fb94e2d2ee1eeb20b476c4d5322df2a4ca9`
   - `predecessor` (bytes32): `0x0000000000000000000000000000000000000000000000000000000000000000`
   - `salt` (bytes32): `0x5e2371f388eaa4872084110022a01f64e41f73568b042bce8b512c014b6f6dc3`
   - `delay` (uint256): `172800`

7. Click **"Add transaction"** then **"Create batch"** (don't add a second transaction — execute is done AFTER 48h as a separate batch).

8. Click **"Send batch"** → sign with Owner 1 → get Owner 2 to also sign → Execute.

9. The schedule lands. 48 hours later, come back and create a NEW batch with the **`execute`** function on the Timelock, using the same parameters minus `delay`:

   - `target`: `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2`
   - `value`: `0`
   - `data`: `0xc5090346000000000000000000000000c0038fb94e2d2ee1eeb20b476c4d5322df2a4ca9`
   - `predecessor`: `0x0000000000000000000000000000000000000000000000000000000000000000`
   - `salt`: `0x5e2371f388eaa4872084110022a01f64e41f73568b042bce8b512c014b6f6dc3`

10. Sign and execute.

That's it. Method 1 takes 5 minutes. No JSON parsing needed.

---

## Method 2: Try the JSON import

If Method 1 feels tedious, the Safe Transaction Builder has a "Use Batch" tab that accepts JSON. The format Safe expects is documented at:
https://docs.safe.global/safe-core-aa-sdk/sign-onchain-transactions/transaction-builder

Try `safeproposal-schedule-only.json` (simplified, schedule-only). If it errors:

- **"No importable data"** → wrong file format. Switch to Method 1.
- **"Invalid transaction"** → the `contractMethod.inputs` array doesn't match the function signature. Switch to Method 1.
- **"Contract not found"** → the Safe app doesn't recognize the Timelock address. Add it as a known contract first (Settings → Known Contracts → add `0xF8C67A2F…0967` with the Timelock ABI).

---

## Method 3: Use the Safe Apps section (also works)

1. In app.safe.global, go to **Apps** → search for "Transaction Builder" (the official Safe app) → open it.
2. Same as Method 1 from there.

The "New Transaction" button in the main UI sometimes routes through a simpler interface; the Apps section gives the full Transaction Builder with the ABI paste box.

---

## After execution — verify on-chain

```bash
# Should return 0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9
cast call 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 "zkVerifier()(address)" --rpc-url https://mainnet.base.org
```

The AWM `/api/system-status` endpoint will also reflect the new zkVerifier:
`curl -sS https://www.ai-work-market.ai/api/system-status | python3 -m json.tool`
