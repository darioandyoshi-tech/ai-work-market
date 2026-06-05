# MCP Marketplace Submissions — Copy-paste ready

AWM has a working MCP server at /mcp and an A2A agent card at /.well-known/agent-card.json.
We need to submit it to 3 MCP directories. Each has a different submission flow.

---

## 1. mcp.so (largest: 21,846 servers, 50K+ businesses)

### URL
https://mcp.so/submit

### Form fields
- **Type**: MCP Server
- **Name**: `AI Work Market (AWM)`
- **URL**: `https://ai-work-market.ai/mcp`
- **Server Config** (paste this):
```json
{
  "type": "http",
  "url": "https://ai-work-market.ai/mcp",
  "headers": {
    "x-payment-required": "https://ai-work-market.ai/.well-known/x402-manifest.json"
  }
}
```

### Why mcp.so
The largest MCP directory (21,846 servers). They crawl GitHub. Our MCP server is live and the discovery manifest is at /.well-known/x402-manifest.json.

### Submission steps
1. Open https://mcp.so/submit in your browser
2. Select "MCP Server"
3. Paste the Name, URL, and Server Config above
4. Click Submit

The form is React-rendered (no static endpoint to POST to programmatically).

---

## 2. MCP Marketplace (mcp-marketplace.io — curated, security-first)

### URL
https://mcp-marketplace.io/submit (or click "Submit a Tool" in the nav)

### Form fields (estimated)
- **Name**: `AI Work Market (AWM)`
- **Description**: `Settlement rails for AI labor. USDC escrow on Base Mainnet + 6 x402-paid data APIs (crypto prices, web search, news, AWM work contract lookup, agent reputation, work contract verifier).`
- **URL**: `https://ai-work-market.ai/mcp`
- **Category**: `Finance` / `Data` / `Blockchain` / `Development`
- **Pricing**: Free to install, USDC pay-per-call
- **Tags**: `x402`, `USDC`, `Base`, `escrow`, `crypto-prices`, `web-search`, `news`, `agent-reputation`, `MCP`
- **Documentation URL**: `https://ai-work-market.ai/AGENT_QUICKSTART`
- **GitHub**: `https://github.com/darioandyoshi-tech/ai-work-market`
- **Discovery Manifest**: `https://ai-work-market.ai/.well-known/x402-manifest.json`

### Why MCP Marketplace
"Curated, security-first marketplace with built-in payments." Their review process is more rigorous but the listings are higher quality.

### Submission steps
1. Open https://mcp-marketplace.io/ in your browser
2. Sign in (or create an account)
3. Click "Submit a Tool" in the nav
4. Fill in the fields above
5. Submit for review

---

## 3. Glama.ai (the "MCP Directory #1")

### URL
https://glama.ai/mcp (their main directory page)

### Form fields (estimated)
- **Name**: `AI Work Market (AWM)`
- **Endpoint URL**: `https://ai-work-market.ai/mcp`
- **Description**: `Settlement rails for AI labor. USDC escrow on Base Mainnet + 6 x402 data APIs. MCP server with 5 tools (create-intent, submit-proof, release-funds, dispute, agent-reputation) + HTTP server for x402-paid data endpoints.`
- **Category**: `Finance`, `Blockchain`, `Data`
- **Tags**: `x402`, `USDC`, `Base`, `agent-economy`, `escrow`, `data`

### Why Glama.ai
"Trusted by 50,000+ Businesses and Professionals" — Databricks, Accenture, Shopify, Cloudflare, Duolingo, Zomato, Zillow, Square all listed. This is the highest-quality MCP directory.

### Submission steps
1. Open https://glama.ai/mcp in your browser
2. Sign up / sign in
3. Click "Submit" or "Add Server"
4. Fill in the fields
5. Submit

---

## 4. Bonus: awesome-mcp-servers (GitHub list)

The user already has awesome-mcp-servers forked to darioandyoshi-tech/awesome-mcp-servers.

### Action
Open a PR adding AWM to the list. Best section is "Finance" or "Data" (both exist).

---

## What's already in your court for these 3 directories

I prepared 3 copy-paste packets above. Each takes 2-3 minutes to submit. Total time: ~10 minutes.

## What I can submit programmatically

- **GitHub PRs** (awesome-mcp-servers): Yes, fully scriptable
- **mcp.so / mcp-marketplace.io / glama.ai**: No, all are React SPAs with client-rendered forms. Browser required.
