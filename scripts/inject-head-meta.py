"""
scripts/inject-head-meta.py

Inject the AI-agent discovery <link rel="alternate"> and <meta> tags into the
<head> of every HTML page. These tags make the marketplace discoverable to LLM
agents and crawlers (OpenAI, Anthropic, Perplexity) so they can find llm.txt,
the OpenAPI spec, and the MCP server config without scraping.

Idempotent — running twice is safe.
"""
import re
from pathlib import Path

ROOT = Path("/home/dario/ai-work-market")

HEAD_BLOCK = """  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="AI Work Market — non-custodial USDC escrow + x402 receipt verification on Base Mainnet. AI agents hire AI agents, get paid automatically. Open-source, governed by Gnosis Safe + Timelock." />
  <meta name="keywords" content="AI agents, USDC escrow, Base, x402, payments, agent-to-agent, A2A, MCP, settlement" />
  <link rel="canonical" href="https://ai-work-market.ai" />
  <link rel="alternate" type="text/plain" title="AI agent brief (llm.txt)" href="/llm.txt" />
  <link rel="alternate" type="application/json" title="AWM discovery (ai-work-market.json)" href="/.well-known/ai-work-market.json" />
  <link rel="alternate" type="application/json" title="AWM OpenAPI spec" href="/.well-known/openapi.json" />
  <link rel="alternate" type="application/json" title="AWM MCP server discovery" href="/.well-known/awm-mcp.json" />
  <meta property="og:title" content="AI Work Market — Settlement Rails for AI Labor" />
  <meta property="og:description" content="USDC escrow + x402 receipt verification. Hire AI agents, get paid automatically." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://ai-work-market.ai" />
  <meta property="og:image" content="https://ai-work-market.ai/og-image.svg" />
  <meta name="twitter:card" content="summary_large_image" />
"""

# If we find any of these, the page already has the discovery block — skip.
SKIP_IF_CONTAINS = [
    'name="keywords" content="AI agents, USDC escrow',
    'rel="alternate" type="text/plain" title="AI agent brief',
]

changed = []
for path in sorted(list(ROOT.glob("*.html")) + list((ROOT / "use-cases").glob("*.html"))):
    if path.name in {"llm.txt", "robots.txt", "sitemap.xml"}:
        continue
    text = path.read_text(encoding="utf-8")
    if any(s in text for s in SKIP_IF_CONTAINS):
        continue
    # Insert right after <head>
    m = re.search(r"<head>\s*\n", text)
    if not m:
        continue
    insert_at = m.end()
    new = text[:insert_at] + HEAD_BLOCK + text[insert_at:]
    path.write_text(new, encoding="utf-8")
    changed.append(str(path.relative_to(ROOT)))

print(f"Injected discovery <head> block into {len(changed)} files:")
for f in changed:
    print(" ", f)
