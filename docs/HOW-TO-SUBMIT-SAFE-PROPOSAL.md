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
| `data` (bytes) | `0x9691352800000000000000000000000000c0038fb94e2d2ee1eeb20b476c4d5322df2a4ca9` |
| `predecessor` (bytes32) | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `salt` (bytes32) | `0xd102ad6d58035e1b2930e0dcd24ab1075a8c0fb62e5b2f0b32653a384724147f` |
| `delay` (uint256) | `172800` |

NOTE: Use the inner-call data `0x96913528…` (setZkVerifier) here, NOT the wrapper `0xc5090346…` (which is the old v1 selector). The Safe app will encode the schedule() call wrapping this inner data automatically.

### 6. Add transaction → Create batch → Send batch

### 7. Sign with 2-of-3 owners, execute.

The schedule goes to the Timelock. After **48 hours**, return and do a NEW batch with the `execute` function (same parameters minus `delay`):

| Field | Value |
|---|---|
| `target` | `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2` |
| `value` | `0` |
| `data` | `0x9691352800000000000000000000000000c0038fb94e2d2ee1eeb20b476c4d5322df2a4ca9` |
| `predecessor` | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `salt` | `0xd102ad6d58035e1b2930e0dcd24ab1075a8c0fb62e5b2f0b32653a384724147f` (MUST match schedule salt) |

### Operation status (verified live 2026-06-03 17:00 UTC)

- **Schedule tx hash**: `0x18cc2eb70da5f2827e4d4a4ae3e446cd446a98ff5f6ba7e9e05c4215b81cb93e` (block 46875959)
- **Operation ID**: `0xfe72f1dcfaa3de1cb07c1914c16200f707f3e2b7d255eaf7538f21b1bfed2e4a`
- **isOperationPending**: TRUE
- **isOperationReady**: FALSE (wait 48h)
- **Earliest execute**: 2026-06-06T03:11:13Z (block timestamp 1780715473)
- **isOperationDone**: FALSE

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
