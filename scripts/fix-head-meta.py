"""
scripts/fix-head-meta.py

The previous version of inject-head-meta.py injected meta tags AFTER <head> but
BEFORE the existing <meta charset> / <meta viewport>, putting non-charset meta
inside the first 1024 bytes. Browsers tolerate this but it violates the HTML
spec, and the W3C validator flags it. This script moves <meta charset="utf-8">
and <meta name="viewport" ...> to be the FIRST two meta/link tags in <head>.

Idempotent.
"""
import re
from pathlib import Path

ROOT = Path("/home/dario/ai-work-market")

def fix(text: str) -> str:
    if "<head>" not in text:
        return text
    head_open_match = re.search(r"<head>\s*\n", text)
    if not head_open_match:
        return text
    head_start = head_open_match.end()
    # Find end of <head>
    head_end = text.find("</head>", head_start)
    if head_end < 0:
        return text
    head = text[head_start:head_end]
    # Extract any existing charset and viewport meta lines
    charset = re.search(r'<meta\s+charset="[^"]+"\s*/?>', head)
    viewport = re.search(r'<meta\s+name="viewport"[^/]+/>', head)
    if not charset and not viewport:
        return text
    # Remove them from the body of <head> (they'll be re-inserted at the top)
    body = head
    if charset:
        body = body.replace(charset.group(0), '')
    if viewport:
        body = body.replace(viewport.group(0), '')
    # Build the new head: charset, viewport, then the rest (with cleaned leading whitespace)
    new_head = ''
    if charset:
        new_head += '  ' + charset.group(0) + '\n'
    if viewport:
        new_head += '  ' + viewport.group(0) + '\n'
    # Trim any leading blank lines from the body
    body = body.lstrip('\n')
    return text[:head_start] + new_head + body + text[head_end:]

changed = []
for path in sorted(list(ROOT.glob("*.html")) + list((ROOT / "use-cases").glob("*.html"))):
    if path.name in {"llm.txt", "robots.txt", "sitemap.xml"}:
        continue
    text = path.read_text(encoding="utf-8")
    new = fix(text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        changed.append(str(path.relative_to(ROOT)))

print(f"Fixed head meta order in {len(changed)} files:")
for f in changed:
    print(" ", f)
