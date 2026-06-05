# Circle Agent Marketplace Submission — Copy-paste ready

## The submission URL

Go to: https://forms.gle/7YFzvdmMcn1JH5tF6
Or directly: https://docs.google.com/forms/d/e/1FAIpQLSeVGlFm-rglBEd8nPqWTdbg2XIe8jY7dd43iFC-FhP2WANQvQ/viewform

The form has 8-10 fields. Below is the answer for each, in the most likely order.

---

## Field-by-field answers

### 1. Service Name
**`AI Work Market — 6 x402 Data APIs`**

### 2. Service URL
**`https://ai-work-market.ai`**

### 3. Tagline / One-line Description
**`Six x402-paid APIs for AI agents on Base Mainnet (USDC): crypto prices, web search, news, work contract lookup, agent reputation, and a work contract verifier.`**

### 4. Category
Select (if multi-select available): **`Data`**, **`Finance`**, **`Search`**, **`News`**

### 5. Pricing Model
**`Pay-per-call`**, USDC on Base Mainnet. Prices range from $0.001 to $0.02 per call.

### 6. Long Description / Service Overview
```
AI Work Market (AWM) is a deployed USDC escrow protocol on Base Mainnet
that also ships a bundle of six x402-paid data APIs for AI agents. The
bundle covers three generic data APIs and three AWM-specific services
that no other provider can build.

The six endpoints (all return HTTP 402 with x-payment-required; pay
USDC on Base Mainnet; no API keys, no signup):

1. /api/x-data/crypto        $0.005/call  CoinGecko prices
2. /api/x-data/search        $0.01/call   DuckDuckGo web search
3. /api/x-data/news          $0.02/call   RSS aggregator + summary
4. /api/x-data/awm-intent    $0.001/call  AWM work contract lookup
5. /api/x-data/awm-reputation $0.005/call  AWM agent reputation
6. /api/x-data/awm-verify    $0.01/call   AWM verifier (release/dispute)

Unique features:
- Direct on-chain payment verification (no third-party facilitator)
- AWM-specific endpoints for work contract state, agent reputation,
  and a verifier that returns a release/dispute/wait decision with
  on-chain reasons
- 4 work contracts live on Base Mainnet, 1% commission to USDC
- Open-source skill for installation via npx skills add
- 17+ working AWM endpoints (escrow, treasury, reputation, MCP)
- All on Base Mainnet, all USDC settlement

Discovery:
- /.well-known/x402-manifest.json (V1 Bazaar standard)
- /x402-manifest (clean URL)
- https://ai-work-market.ai/dashboard (live revenue + status)

Links:
- Site: https://ai-work-market.ai
- Manifest: https://ai-work-market.ai/.well-known/x402-manifest.json
- Dashboard: https://ai-work-market.ai/dashboard
- GitHub skill: https://github.com/darioandyoshi-tech/awm-skills
- Protocol: AWM AgentWorkEscrowZK 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2
```

### 7. Pay-To Address (USDC receiving)
**`0xec89c40CA296F502cD033e07f18DA5E01cdd197d`**

### 8. Network
**`Base Mainnet (eip155:8453)`**

### 9. Asset
**`USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 on Base)`**

### 10. Contact Email
**`dario@dmeomaha.com`**

---

## What happens after you submit

Circle's team will:
1. Review the submission (typically 1-2 weeks)
2. Verify the endpoints work (they'll hit each one and try to pay)
3. Add AWM to the Agent Marketplace directory
4. Notify you by email when live

The submission is manual review. I cannot submit this form programmatically (Google Forms requires browser-side rendering to extract field IDs).

---

## While you do that — the other 2 marketplace submissions

### MCP-Hive (mcp-hive.io)
Status: I have not yet submitted. The submit form there is also browser-rendered.
Best path: see docs/SUBMIT_MCP_HIVE.md (will be created below).

### The x402 Bazaar (x402bazaar.org)
Status: **DONE.** We are already auto-discoverable via the V1 manifest at
`/.well-known/x402-manifest.json`. The Bazaar crawler will pick this up.
No manual submission required.
