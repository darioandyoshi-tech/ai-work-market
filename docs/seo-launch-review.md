# AI Work Market SEO + Launch Readiness Review

Reviewed: public HTML pages, `vercel.json`, `.well-known/*`, `llms.txt`, product catalog/API metadata, README, and launch/positioning docs.

## Executive summary

AI Work Market is commercially live for Stripe product/service checkout, but the protocol should keep being described as a Base Sepolia testnet MVP. The public site has strong positioning and clear safety language, but the SEO layer is thin: no canonical tags, no OpenGraph/Twitter metadata, no structured data, no `robots.txt`, no `sitemap.xml`, and no social preview image.

Priority: add discoverability metadata without weakening the boundary: **Stripe checkout live; AWM escrow protocol testnet-only, not audited, not mainnet/production escrow.**

## SEO quick wins

1. **Add canonical URLs to every public page**
   - `/` → `https://ai-work-market.vercel.app/`
   - `/products`, `/agent-commerce`, `/integration-sprint`, `/first-agents`, `/trust`, `/manifesto`, `/founding-testers`, `/purchase-complete`
   - Also canonicalize sample/product markdown URLs if indexed.

2. **Add OpenGraph + Twitter cards**
   - Currently pages only have `<title>` and mostly `<meta name="description">`.
   - Add `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:image`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`.
   - Create one 1200×630 social image: “AI Work Market — proof-backed AI work / signed offers → escrow → proof → release”.

3. **Ship `robots.txt` and `sitemap.xml`**
   - No current `robots.txt`/sitemap found.
   - Include HTML pages, `llms.txt`, `.well-known` discovery URLs, public docs/samples only if intentionally indexable.
   - Do not index paid/private fulfillment surfaces or session-specific receipt URLs.

4. **Add JSON-LD structured data**
   - Home: `SoftwareApplication` or `Organization` + `WebSite`.
   - Products page: `ItemList` with `Product`/`Service` entries and `Offer` pricing.
   - Integration sprint: `Service`.
   - Agent commerce demo: `TechArticle` or `SoftwareApplication`.
   - Trust page: `WebPage` / `FAQPage` if Q&A sections are added.

5. **Tighten page titles/descriptions around high-intent phrases**
   - Current titles are decent but inconsistent.
   - Reuse phrases from positioning docs: “AI labor”, “AI agent payments”, “escrow rails”, “proof-backed AI work”, “x402 escrow integration”, “HTTP 402 agent commerce”.

6. **Add internal links from the homepage to commercial pages above the fold**
   - Ensure `/products`, `/agent-commerce`, and `/integration-sprint` are prominent on `/`.
   - Keep `/trust` nearby so “live checkout” does not imply “production escrow”.

7. **Add a small footer/status badge across pages**
   - Suggested text: “Stripe checkout live for products/services. AWM protocol escrow is Base Sepolia testnet-only.”
   - This helps conversion and compliance/trust simultaneously.

## Recommended metadata

### Global defaults

- Site name: `AI Work Market`
- Canonical origin: `https://ai-work-market.vercel.app`
- Primary keywords:
  - `AI agent payments`
  - `AI labor escrow`
  - `agent commerce`
  - `proof-backed AI work`
  - `USDC escrow for AI agents`
  - `x402 escrow integration`
  - `HTTP 402 payment challenge`
  - `MCP agent commerce`
  - `signed AI work offers`
  - `Base Sepolia escrow`

Meta keywords are not important for Google, but this keyword set is useful for copy, OG descriptions, docs, and directory submissions.

### `/`

- Current title: `AI Work Market — Settlement Rails for AI Labor`
- Recommended title: `AI Work Market — Escrow Rails for AI Agent Work`
- Recommended description: `AI Work Market helps humans and AI agents buy proof-backed AI work with signed offers, USDC escrow, proof submission, and programmable release. Testnet protocol; live Stripe checkout for products.`
- Recommended schema: `SoftwareApplication` + `Organization` + `WebSite`.

### `/products`

- Current title: `AI Work Market Products — Proof-backed AI work artifacts`
- Recommended title: `Proof-Backed AI Work Products — AI Work Market`
- Recommended description: `Buy verified AI work artifacts, n8n workflow templates, and x402 escrow integration services. Stripe checkout is live; protocol escrow remains testnet-only.`
- Recommended schema: `ItemList` containing:
  - `Product`: Agent Commerce Market Map 2026, `$79`
  - `Product`: AI Work Intake → Escrow → Proof n8n Workflow, `$49`
  - `Service`: x402 → Escrow Integration Sprint, `$1,500`

### `/agent-commerce`

- Current title: `Agent Commerce Demo — AI Work Market`
- Recommended title: `HTTP 402 Agent Commerce Demo — AI Work Market`
- Recommended description: `Try a live HTTP 402 protected-resource flow for agent-readable products: catalog discovery, payment request, Stripe receipt verification, and proof metadata without exposing paid files.`
- Recommended schema: `SoftwareApplication` or `TechArticle`.

### `/integration-sprint`

- Current title: `x402 → Escrow Integration Sprint — AI Work Market`
- Recommended title: `x402 Escrow Integration Sprint — Proof-Backed Agent Payments`
- Recommended description: `A fixed-scope 48-hour sprint for x402, MCP, AgentKit, and Base builders who need scoped work terms, proof packages, and escrow-style settlement around paid agent access.`
- Recommended schema: `Service` with `Offer` price `$1500`.

### `/first-agents`

- Current title: `First Agents — AI Work Market Settlement Layer`
- Recommended title: `First Agents — Test AI Work Settlement Rails`
- Recommended description: `Join the first AI agents and builders testing signed offers, Base Sepolia USDC escrow, proof submission, and release flows for accountable AI labor.`
- Recommended schema: `WebPage` / `Event` only if there is a dated campaign window.

### `/trust`

- Current title: `AI Work Market Trust Policy`
- Recommended title: `AI Work Market Trust Policy — Proof, Escrow, Review, Disputes`
- Recommended description: `The trust policy for AI Work Market: scoped work, proof artifacts, buyer review, refund/dispute paths, and current Base Sepolia testnet limits.`
- Recommended schema: `WebPage`; consider `FAQPage` if converted into explicit Q&A.

### `/manifesto`

- Current title: `AI Work Market Manifesto`
- Recommended title: `AI Work Market Manifesto — A Trusted Work Layer for AI Labor`
- Recommended description: `AI labor needs scoped tasks, payment guarantees, proof of delivery, review, disputes, and reputation. AI Work Market is building the trusted work layer.`
- Recommended schema: `Article`.

### `/founding-testers`

- Current title: `Become a Founding AI Work Market Tester`
- Recommended title: `Become a Founding AI Work Market Tester`
- Recommended description: `AI Work Market is recruiting agent builders, framework maintainers, and operators to test signed offers, Base Sepolia escrow, proof submission, and release flows.`
- Recommended schema: `WebPage`.

### `/purchase-complete`

- Current title: `Purchase complete — AI Work Market`
- Missing: `meta description`.
- Recommended: keep `noindex` unless there is a strong reason to index checkout success pages.
- Recommended robots tag: `<meta name="robots" content="noindex, nofollow">`.

## Suggested JSON-LD snippets

### Home page `SoftwareApplication`

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "AI Work Market",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web, CLI, SDK",
  "url": "https://ai-work-market.vercel.app/",
  "codeRepository": "https://github.com/darioandyoshi-tech/ai-work-market",
  "description": "Escrow rails for humans and AI agents to buy proof-backed AI work with signed offers, USDC escrow, proof submission, and programmable release.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "availability": "https://schema.org/OnlineOnly"
  }
}
```

### Products page `ItemList`

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "AI Work Market Products",
  "url": "https://ai-work-market.vercel.app/products",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "Agent Commerce Market Map 2026",
        "description": "Verified research packet for agent commerce, x402, MCP, A2A, agent marketplaces, and settlement gaps.",
        "offers": { "@type": "Offer", "price": "79", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
      }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": {
        "@type": "Product",
        "name": "AI Work Intake → Escrow → Proof n8n Workflow",
        "description": "Workflow template for work order intake, escrow status tracking, proof collection, and release/dispute routing.",
        "offers": { "@type": "Offer", "price": "49", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
      }
    },
    {
      "@type": "ListItem",
      "position": 3,
      "item": {
        "@type": "Service",
        "name": "x402 → Escrow Integration Sprint",
        "description": "48-hour integration sprint for scoped agent work terms, proof packages, and escrow-style settlement around paid agent access.",
        "offers": { "@type": "Offer", "price": "1500", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
      }
    }
  ]
}
```

## Sitemap, robots, and canonical needs

### Add `robots.txt`

Suggested contents:

```txt
User-agent: *
Allow: /
Disallow: /api/fulfillment-receipt
Disallow: /api/delivery-status
Disallow: /purchase-complete
Sitemap: https://ai-work-market.vercel.app/sitemap.xml
```

Notes:
- Keep `/api/agent-products`, `/api/payment-request`, and `/api/protected-resource` crawlable only if intentional. They are agent-facing; search indexing may be noisy.
- If indexed API JSON is undesirable, disallow `/api/` except allow key discovery endpoints through `.well-known` and `llms.txt`.

### Add `sitemap.xml`

Recommended URLs:

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ai-work-market.vercel.app/</loc></url>
  <url><loc>https://ai-work-market.vercel.app/products</loc></url>
  <url><loc>https://ai-work-market.vercel.app/agent-commerce</loc></url>
  <url><loc>https://ai-work-market.vercel.app/integration-sprint</loc></url>
  <url><loc>https://ai-work-market.vercel.app/first-agents</loc></url>
  <url><loc>https://ai-work-market.vercel.app/founding-testers</loc></url>
  <url><loc>https://ai-work-market.vercel.app/trust</loc></url>
  <url><loc>https://ai-work-market.vercel.app/manifesto</loc></url>
  <url><loc>https://ai-work-market.vercel.app/llms.txt</loc></url>
  <url><loc>https://ai-work-market.vercel.app/.well-known/ai-work-market.json</loc></url>
  <url><loc>https://ai-work-market.vercel.app/.well-known/agent-products.json</loc></url>
  <url><loc>https://ai-work-market.vercel.app/.well-known/awm-mcp.json</loc></url>
</urlset>
```

### Canonical implementation notes

Because Vercel `cleanUrls` is enabled, canonical links should use clean routes, not `.html` paths:

```html
<link rel="canonical" href="https://ai-work-market.vercel.app/products">
```

Add a redirect or canonical for direct `.html` access if search engines discover both `/products` and `/products.html`.

## `.well-known` and `llms.txt` review

Good:
- `.well-known/ai-work-market.json` clearly states status, chain, warnings, and capabilities.
- `.well-known/agent-products.json` exposes product discovery.
- `.well-known/awm-mcp.json` labels tools read-only and safety-bounded.
- `llms.txt` is useful and current enough for agent-facing discovery.

Recommended improvements:
1. Add `url`/`sameAs` fields consistently across `.well-known` files.
2. Add `lastUpdated` timestamps.
3. In `agent-products.json`, explicitly say `baseSepoliaEscrowProductionReady: false` or equivalent.
4. In `llms.txt`, add a top-level commercial boundary near the first paragraph:
   - `Stripe checkout is live for products/services. AWM protocol escrow is Base Sepolia testnet-only and not production escrow.`
5. Consider adding `/ai-plugin.json` or similar only if targeting a specific agent directory that expects it; otherwise current `.well-known` is enough.

## Launch readiness checklist

### A. Stripe commercial live readiness

Status: **mostly live / acceptable for first sales, with trust and ops gaps to close.**

- [x] Product storefront exists at `/products`.
- [x] Live Stripe checkout links are present for $79, $49, and $1,500 offers.
- [x] `purchase-complete` page exists and explains manual fulfillment.
- [x] Paid assets are not public static files; public samples are separate.
- [x] Agent catalog exposes checkout/payment request/protected resource URLs.
- [x] Site repeatedly states Stripe checkout is live while protocol escrow is testnet-only.
- [ ] Add `noindex` to `/purchase-complete` and disallow it in `robots.txt`.
- [ ] Add customer-facing refund/fulfillment/support terms, even if lightweight.
- [ ] Ensure Stripe webhook/receipt verification behavior is documented for production operators.
- [ ] Add social metadata and product schema before broad launch posts.
- [ ] Add a visible contact/support channel for purchase issues.
- [ ] Validate payment links point to the intended products/prices and completion URL.

Commercial launch language that is safe:

> AI Work Market has live Stripe checkout for proof-backed AI work artifacts and integration services. Fulfillment is manual for v1. The AWM escrow protocol remains Base Sepolia testnet-only and is not production escrow.

### B. Production protocol / mainnet readiness

Status: **not live / not ready; should remain explicitly testnet-only.**

- [x] Base Sepolia deployment exists.
- [x] Contract source verification and E2E testnet flow are documented.
- [x] CLI/SDK/MCP examples exist for builders.
- [x] Public trust pages warn: not audited, not mainnet-ready, centralized dispute handling.
- [ ] Independent smart-contract audit.
- [ ] Production dispute/arbiter/verifier model.
- [ ] Admin key hardening/multisig/timelock/ownership runbook.
- [ ] Mainnet USDC receiving/settlement strategy separate from testnet escrow.
- [ ] Legal/commercial terms for real escrowed work and disputes.
- [ ] Monitoring, incident response, and withdrawal/fee accounting runbook.
- [ ] Reputation/verifier receipts or another reliable acceptance record.
- [ ] Explicit risk disclosures for buyers/sellers before any mainnet funds.

Protocol launch language that is safe:

> The protocol is a Base Sepolia testnet MVP for signed offers, USDC escrow, proof submission, and release/refund/dispute flows. It is not audited, not mainnet-ready, and not production escrow.

## Highest-impact next patch

1. Add `robots.txt`, `sitemap.xml`, canonical tags, OG/Twitter metadata, and JSON-LD to the 7 public HTML pages.
2. Add one social preview image.
3. Add `noindex` to `/purchase-complete`.
4. Add a small global status/footer line separating live Stripe commerce from testnet protocol escrow.

This would materially improve SEO, link previews, agent/directory ingestion, and launch trust without changing the product itself.
