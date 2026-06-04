# How to submit the setZKVerifier proposal to your Safe

## THE WORKING METHOD (5 minutes, always works)

### 1. Open your Safe
- Go to https://app.safe.global
- Network: **Base Mainnet**
- Safe address: `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637`

### 2. New Transaction → Transaction Builder

### 3. Paste the Timelock address in the contract field
```
0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967
```

### 4. Paste THIS exact minimal ABI (single line, no internalType):

```json
[{"inputs":[{"name":"target","type":"address"},{"name":"value","type":"uint256"},{"name":"data","type":"bytes"},{"name":"predecessor","type":"bytes32"},{"name":"salt","type":"bytes32"},{"name":"delay","type":"uint256"}],"name":"schedule","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"name":"target","type":"address"},{"name":"value","type":"uint256"},{"name":"data","type":"bytes"},{"name":"predecessor","type":"bytes32"},{"name":"salt","type":"bytes32"}],"name":"execute","outputs":[],"stateMutability":"payable","type":"function"}]
```

If the Safe app says "Contract ABI doesn't have any public methods":
- Make sure you didn't accidentally add a space or newline at the start/end
- The `stateMutability` is `"nonpayable"` for schedule and `"payable"` for execute — the difference matters
- Try the **pretty-printed version** below as a fallback

```json
[
  {
    "inputs": [
      {"name": "target", "type": "address"},
      {"name": "value", "type": "uint256"},
      {"name": "data", "type": "bytes"},
      {"name": "predecessor", "type": "bytes32"},
      {"name": "salt", "type": "bytes32"},
      {"name": "delay", "type": "uint256"}
    ],
    "name": "schedule",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "target", "type": "address"},
      {"name": "value", "type": "uint256"},
      {"name": "data", "type": "bytes"},
      {"name": "predecessor", "type": "bytes32"},
      {"name": "salt", "type": "bytes32"}
    ],
    "name": "execute",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
]
```

### 5. After ABI is accepted, pick `schedule` and fill:

| Field | Value |
|---|---|
| `target` (address) | `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2` |
| `value` (uint256) | `0` |
| `data` (bytes) | `0xc5090346000000000000000000000000c0038fb94e2d2ee1eeb20b476c4d5322df2a4ca9` |
| `predecessor` (bytes32) | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `salt` (bytes32) | `0x5e2371f388eaa4872084110022a01f64e41f73568b042bce8b512c014b6f6dc3` |
| `delay` (uint256) | `172800` |

### 6. Add transaction → Create batch → Send batch

### 7. Sign with 2-of-3 owners, execute.

The schedule goes to the Timelock. After **48 hours**, return and do a NEW batch with the `execute` function (same parameters minus `delay`).

### 8. After execution, verify:

```bash
cast call 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2 "zkVerifier()(address)" --rpc-url https://mainnet.base.org
# Should return: 0xC0038FB94e2d2ee1Eeb20B476C4d5322dF2A4ca9
```

Or just hit: `curl -sS https://www.ai-work-market.ai/api/system-status | python3 -m json.tool`

---

## If the Safe app shows "unsupported base contract" warning

This is cosmetic. The Safe is functional. Click **"Continue"**, do NOT migrate.

---

## If `schedule` STILL doesn't appear in the function dropdown after pasting the ABI

1. Make sure you clicked "Add ABI" or "Save" after pasting
2. The contract address field must be exactly `0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967` — not the Safe, not the escrow
3. Try clearing the ABI box, re-pasting, and clicking outside the field
4. As a last resort, go to **Settings** → **Known Contracts** → add `0xF8C67A2F…` with the ABI manually, then return to Transaction Builder

If it still fails, copy the exact error text and ping me.
