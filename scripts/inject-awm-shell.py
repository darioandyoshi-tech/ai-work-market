"""
scripts/inject-awm-shell.py

Inject <script type="module" src="/assets/awm-shell.js"></script> on every HTML
page that doesn't already have it, right before </body>. This is the shared
wallet-connect + live-metrics + link-hijack client that makes "Connect Wallet"
work from any page.

Idempotent — running twice is safe.
"""
import re
from pathlib import Path

ROOT = Path("/home/dario/ai-work-market")
SHELL_LINE = '<script type="module" src="/assets/awm-shell.js"></script>'

# Pages that already have awm-shell wired (skip)
SKIP_IF_CONTAINS = [
    'src="/assets/awm-shell.js"',
    "src='/assets/awm-shell.js'",
]

changed = []
for path in sorted(ROOT.glob("*.html")):
    if path.name in {"llm.txt", "robots.txt", "sitemap.xml"}:
        continue
    text = path.read_text(encoding="utf-8")
    if any(s in text for s in SKIP_IF_CONTAINS):
        continue
    if "</body>" not in text:
        continue
    # Inject just before </body>
    new = text.replace("</body>", f"  {SHELL_LINE}\n</body>", 1)
    path.write_text(new, encoding="utf-8")
    changed.append(str(path.relative_to(ROOT)))

# Also inject into use-cases/*.html
for path in sorted((ROOT / "use-cases").glob("*.html")):
    text = path.read_text(encoding="utf-8")
    if any(s in text for s in SKIP_IF_CONTAINS):
        continue
    if "</body>" not in text:
        continue
    new = text.replace("</body>", f"  {SHELL_LINE}\n</body>", 1)
    path.write_text(new, encoding="utf-8")
    changed.append(str(path.relative_to(ROOT)))

print(f"Injected {SHELL_LINE!r} into {len(changed)} files:")
for f in changed:
    print(" ", f)
