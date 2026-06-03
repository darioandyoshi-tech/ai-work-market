"""
scripts/update-html-to-mainnet.py

Bulk-update all HTML files in the project root + dist/ + use-cases/ to:
  - Replace any "Base Sepolia" / "base-sepolia" label with "Base Mainnet" / "base-mainnet"
  - Replace the four legacy Sepolia contract addresses with the production mainnet address
  - Replace "testnet" mentions with "mainnet" where they refer to the live network

Does not touch:
  - The llm.txt, .well-known/*, api/*.js, or markdown documentation
  - HTML files that already say "Base Mainnet" or are .gitignored

Idempotent — running twice is safe.
"""
import re
from pathlib import Path

ROOT = Path("/home/dario/ai-work-market")
EXTS = {".html"}

# (lowercased find → replacement) — order matters
REPLACEMENTS = [
    # Legacy contract addresses
    ("0x489C36738F46e395b4cd26DDf0f85756686A2f07", "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"),
    ("0x489c36738f46e395b4cd26ddf0f85756686a2f07", "0x8b49ff5b1dda19dc868e7a7f83a3e06cb869dae2"),
    ("0x9Da29895d8b3302369EC464e6B49DaDFa327B9Ce", "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"),
    ("0x9da29895d8b3302369ec464e6b49dadfa327b9ce", "0x8b49ff5b1dda19dc868E7A7F83A3E06CB869Dae2"),
    ("0x3E01267AFfb2C63637c64cFCB0ef98A6e0D58594", "0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2"),
    ("0x3e01267affb2c63637c64cfcb0ef98a6e0d58594", "0x8b49ff5b1dda19dc868e7a7f83a3e06cb869dae2"),
    # Network labels
    ("Base Sepolia", "Base Mainnet"),
    ("base-sepolia", "base-mainnet"),
    ("BASE_SEPOLIA", "BASE_MAINNET"),
    # Subtle wording in pages that said "testnet" but referred to the live escrow
    ("on Base Sepolia testnet", "on Base Mainnet"),
    ("on Base Sepolia.", "on Base Mainnet."),
    ("on Base Sepolia,", "on Base Mainnet,"),
    ("on Base Sepolia ", "on Base Mainnet "),
]

# Always skip these — they're documentation, not site copy
SKIP = {
    "AGENT_WORKER_SETUP.md",
    "AWM_GNOSIS_SAFE_COMPLETE_SUMMARY.md",
    "AWM_GNOSIS_SAFE_TEST_SUMMARY.md",
    "AWM_READY_FOR_TESTING.md",
    "AWM_STATUS_SUMMARY.md",
    "BATCH_RUNNER_GUIDE.md",
    "DEPLOYMENT_SUCCESS_GUIDE.md",
    "EXECUTION_AUTHORIZATION_SUMMARY.md",
    "EXECUTION_COMPLETE.md",
    "EXECUTION_READY.md",
    "FINAL_DEPLOYMENT_SOLUTION.md",
    "FINAL_DIAGNOSIS_AND_FIX.md",
    "FINAL_GNOSIS_SAFE_PROTOCOL.md",
    "FINAL_STATUS.md",
    "FINAL_SYSTEM_STATUS.md",
    "GNOSIS_SAFE_CONNECTION_FIX.md",
    "AWM_COMPLETE_REFERENCE.md",
    "STATUS_SUMMARY.md",
}

changed = []
for path in sorted(ROOT.rglob("*")):
    if not path.is_file() or path.suffix not in EXTS:
        continue
    if any(part in SKIP for part in path.parts):
        continue
    if "node_modules" in path.parts or "out/" in str(path) or ".vercel/" in str(path):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        continue
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding="utf-8")
        changed.append(str(path.relative_to(ROOT)))

print(f"Updated {len(changed)} files:")
for f in changed:
    print(f"  {f}")
