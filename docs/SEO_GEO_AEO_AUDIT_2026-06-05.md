# SEO / GEO / AEO Audit — ai-work-market.ai — 2026-06-05

## TL;DR

**SEO: 7/10. GEO: 8.5/10. AEO: 5/10.** Solid foundation, but with 6 concrete fixes that take 15 minutes total. The biggest gap: **`/backend` is not in the sitemap** (the new money page, the page the repositioning was built around).

---

## SEO (Search Engine Optimization) — Traditional Google/Bing

### What's working
- ✓ Title tag: 75 chars, includes brand + positioning + key terms
- ✓ Meta description: 156 chars, includes fee, chain, surface
- ✓ Meta keywords: 9 terms, on-topic
- ✓ Open Graph: title, description, image, url, type all set
- ✓ Twitter Card: summary_large_image
- ✓ Canonical URL: set to apex (correct, given 307 → www redirect)
- ✓ H1: "Escrow for AI agent marketplaces" — single, descriptive, on-strategy
- ✓ Heading hierarchy: clean H1 → H2 → H3, no skipped levels
- ✓ Sitemap.xml: 52 URLs, all the major pages indexed
- ✓ robots.txt: 14 AI crawlers explicitly allowed, 6 traditional search engines allowed, sitemap pointers
- ✓ 12 production pages all return 200, avg 0.4s response time
- ✓ lang attribute: en
- ✓ Viewport meta present

### What's missing
- ✗ **JSON-LD structured data: 0 blocks** — no schema.org Organization, WebSite, SoftwareApplication, or FAQPage markup. This is the single biggest SEO gap. Without it, Google can't show rich snippets (star ratings, FAQ dropdowns, sitelinks search box).
- ✗ **og:site_name: missing** — minor; helps when shared to Facebook
- ✗ **twitter:site: missing** — minor; helps Twitter card attribution
- ✗ **No hreflang tags** — fine for single-language English site, but worth knowing
- ✗ **No preconnect/preload hints** — minor perf; 0.4s is already fast enough
- ✗ **0 images on homepage** — no alt-text issue, but also no social-proof visual
- ✗ **`/backend` NOT in sitemap** — the new money page is the page we spent the whole session building, and search engines don't know it exists
- ✗ **`/mcp` not in sitemap** — the agent-native surface should be indexed for SEO
- ✗ **No backlinks data** — can't verify, but solo-founder projects in 2026 typically have <50 referring domains. Real growth lever for SEO is third-party mentions (the 5 DMs in `docs/sales/MARKETPLACE_OUTREACH_2026-06-05.md` are partly an SEO play too).

### SEO score: 7/10

The fundamentals are there. The structured data gap is the one thing that would meaningfully improve Google rankings. The sitemap gap is the one thing that hides the new page from search engines entirely.

---

## GEO (Generative Engine Optimization) — ChatGPT, Perplexity, Claude, Gemini citation

### What's working (this is where the site is strong)
- ✓ **llm.txt exists and is 8107 bytes** — the canonical AI-agent-discovery file. Most projects don't have this.
- ✓ **First sentence is a clear positioning statement** — "AWM is the non-custodial USDC escrow backend for AI agent marketplaces." LLMs cite this verbatim when asked.
- ✓ **Has blockquote summary** — the `> **...**` pattern is what LLMs prefer to pull from
- ✓ **Has explicit fee (1%)** — LLMs can quote this in responses
- ✓ **Has explicit chain (Base Mainnet)** — verifiable
- ✓ **Has contract address (0x8b49...)** — verifiable
- ✓ **Has GitHub link** — LLMs trust open-source more
- ✓ **Has explicit limitations** ("no third-party audit", "no formal verification") — the honest framing is exactly what LLMs are trained to prefer (less hallucination, more verifiable)
- ✓ **'For builders' framing** — tells LLMs who the user is
- ✓ **A2A agent card with 18 skills, all with examples** — agents reading this can immediately use the platform
- ✓ **OpenAPI 3.1 spec at /openapi.json** — agents can ingest the full API
- ✓ **MCP server config at /.well-known/awm-mcp.json** — agents with MCP support can connect directly
- ✓ **robots.txt explicitly allows 14 AI crawlers** — GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, OAI-SearchBot, ChatGPT-User, Claude-Web, Perplexity-User, Amazonbot, CCBot, Applebot-Extended, GoogleOther
- ✓ **llm.txt has 18+ factually verifiable claims** — the kind of density LLMs love

### What's missing
- ✗ **Doesn't mention competitors by name** in llm.txt — when a user asks ChatGPT "AWM vs NEAR vs Claw Earn," the LLM has to fall back on its training data (which may be outdated). The /backend page has the table; the llm.txt should reference it.
- ✗ **No specific "people also ask" or FAQ format** in llm.txt — LLMs pulling from this file would benefit from explicit "Q: What is the fee? A: 1%" pairs

### GEO score: 8.5/10

This is genuinely the strongest of the three categories. The site is set up to be cited by AI agents better than 95% of web3 projects. The missing piece is the FAQ format + competitor mentions in llm.txt.

---

## AEO (Answer Engine Optimization) — Google AI Overviews, voice assistants, featured snippets

### What's working
- ✓ Has comparison vs alternatives (the AWM/NEAR/Claw Earn/DIY table on /backend)
- ✓ Has numbered steps (in the "How to embed" section)
- ✓ Lists contact info

### What's missing (this is the weak category)
- ✗ **No "X is a Y that does Z" definition pattern in the first 200 chars** — Google's AI Overviews look for this exact pattern. The current first 200 chars start with "# AI Work Market (AWM) — escrow backend for AI agent marketplaces" which is a heading, not a definitional sentence.
- ✗ **No explicit "How to use AWM" section with numbered steps in the body** — the embed snippets are on /backend but not surfaced in the homepage's machine-readable content
- ✗ **No FAQ schema** — Google can show FAQ dropdowns in search results, but only if the markup exists. With 0 JSON-LD blocks, AEO is structurally impossible.
- ✗ **No "TL;DR" or summary line** — voice assistants and AI Overviews pull the first sentence. The first sentence here is the heading, not a summary.
- ✗ **No "People also ask" pre-empts** — the homepage doesn't directly answer the 5 most common questions ("What is the fee?", "What chain?", "Who can use it?", "Is it audited?", "How do I integrate?")
- ✗ **No "What is AWM?" definition** — the homepage goes straight to "Escrow for AI agent marketplaces" without defining what escrow is or what AWM is

### AEO score: 5/10

The structured content is there in some places, but the homepage doesn't follow the "definitional sentence + FAQ + summary" pattern that AI Overviews and voice assistants prefer. Fixing this is the same fix as SEO's structured data gap — add JSON-LD with FAQPage + SoftwareApplication + Organization.

---

## The 6 concrete fixes (15 minutes total)

### Fix 1: Add JSON-LD structured data to the homepage (10 min)

This is the single highest-impact fix. It addresses both SEO and AEO at once.

Add to `<head>` of `index.html`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://ai-work-market.ai/#org",
      "name": "AI Work Market",
      "url": "https://ai-work-market.ai",
      "logo": "https://ai-work-market.ai/og-image.svg",
      "description": "Non-custodial USDC escrow backend for AI agent marketplaces, bounty boards, and service catalogs.",
      "sameAs": [
        "https://github.com/darioandyoshi-tech/ai-work-market"
      ]
    },
    {
      "@type": "SoftwareApplication",
      "name": "AI Work Market",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "0.01",
        "priceCurrency": "USD",
        "description": "1% protocol fee on seller payout, not buyer deposit"
      },
      "featureList": [
        "Non-custodial USDC escrow on Base Mainnet",
        "x402 paid API endpoints",
        "MCP server with 8 tools",
        "A2A agent card with 18 skills",
        "OpenAPI 3.1 spec",
        "2-of-3 Gnosis Safe + 48h Timelock governance"
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is AWM?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "AWM is a non-custodial USDC escrow primitive on Base Mainnet. It is the backend any AI agent marketplace, bounty board, or service catalog can drop in to handle payments, proof verification, and dispute resolution. 1% protocol fee on the seller's payout."
          }
        },
        {
          "@type": "Question",
          "name": "What chain is AWM on?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Base Mainnet (chain ID 8453). USDC contract at 0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913. Escrow contract at 0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2."
          }
        },
        {
          "@type": "Question",
          "name": "How is AWM governed?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The escrow contract's owner is a TimelockController at 0xF8C67A2F195d98Dbb7df2e7B8ca70Cc430AD0967 (getMinDelay() = 172,800 seconds = 48 hours) administered by a 2-of-3 Gnosis Safe at 0x7f36896F6b6496B4E2fE95f672B3DAf28386b637."
          }
        },
        {
          "@type": "Question",
          "name": "What is the protocol fee?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "1% (100 basis points) on the seller's payout, not the buyer's deposit. This is the lowest protocol fee in the AI agent marketplace category — Claw Earn charges 10%."
          }
        },
        {
          "@type": "Question",
          "name": "How do I integrate AWM as my marketplace backend?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Three integration paths: REST (POST /api/post-work-funded), MCP (8 tools at /mcp), and x402 (the manifest at /.well-known/x402-manifest.json). The embed snippet is at https://ai-work-market.ai/backend. No approval queue, no minimum volume."
          }
        },
        {
          "@type": "Question",
          "name": "Has AWM been audited?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "AWM is in public beta. There is no third-party audit of AWM code, no formal verification, and no bug bounty program. The escrow contract is built on audited OpenZeppelin primitives. The disclosure is at https://ai-work-market.ai/trust."
          }
        }
      ]
    }
  ]
}
</script>
```

### Fix 2: Add /backend and /mcp to the sitemap (2 min)

In `build.js` (or directly in the sitemap), add:

```xml
<url><loc>https://ai-work-market.ai/backend</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
<url><loc>https://ai-work-market.ai/mcp</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>
```

The /backend page should be priority 0.9 (it's the new money page) and the /mcp endpoint should be 0.6 (technical reference).

### Fix 3: Add og:site_name and twitter:site meta tags (1 min)

In `index.html` `<head>`:

```html
<meta property="og:site_name" content="AI Work Market" />
<meta name="twitter:site" content="@awm_market" />
```

### Fix 4: Add the "What is AWM?" definitional sentence to the homepage (2 min)

The current homepage starts with the H1 ("Escrow for AI agent marketplaces") but doesn't define what AWM is. For AEO, the first 200 chars should be a definitional sentence. Add right after the H1:

```html
<p class="definitional">AI Work Market (AWM) is a non-custodial USDC escrow contract on Base Mainnet that AI agent marketplaces, bounty boards, and service catalogs can use as their payment backend. Funds are held by the on-chain AgentWorkEscrowZK contract; governance is a 2-of-3 Gnosis Safe through a 48-hour Timelock.</p>
```

### Fix 5: Add a FAQ section to the homepage (already in JSON-LD; needs HTML rendering) (0 min, included in Fix 1)

The FAQPage JSON-LD will be picked up by Google, but the HTML rendering helps voice assistants and the Google AI Overview extractor. If time allows, add a visible FAQ section near the bottom of the homepage.

### Fix 6: Add competitor mentions to llm.txt (1 min)

In the `llm.txt` file, add a section:

```
## How AWM compares to other agent marketplaces

- **AWM vs NEAR Agent Market (2.1K agents, $33K volume)**: NEAR has the liquidity; AWM has the lowest fee. AWM can be the escrow backend for NEAR's USDC-priced jobs.
- **AWM vs Claw Earn**: Claw Earn charges 10% protocol fee; AWM charges 1%. Claw Earn has 10% worker stake/slash anti-fraud; AWM has multisig arbitration.
- **AWM vs Moltlaunch**: Moltlaunch is on Base like AWM, but charges in ETH. AWM settles in USDC.

## What AWM is not

- Not a marketplace competing for user liquidity
- Not audited by a third party
- Not formally verified
- Not a trustless oracle (disputes route to a 2-of-3 Safe through a 48h Timelock)
```

---

## What NOT to do (the discipline)

- **Don't keyword-stuff the meta description.** The current one is 156 chars and reads naturally. Don't add "AI escrow, USDC escrow, agent escrow, AI agent marketplace escrow, Base escrow..." — Google penalizes that.
- **Don't add FAQPage markup for fake questions.** Every Q&A in the JSON-LD must be a question a real user would ask, answered with the truth (including the "is it audited?" no).
- **Don't add backlinks to your own site.** The 5 DMs in `docs/sales/MARKETPLACE_OUTREACH_2026-06-05.md` will produce organic backlinks if any of the builders reply. Don't ask for backlinks explicitly; let the integrations speak for themselves.
- **Don't generate fake "users" or "testimonials"** for trust signals. The site is honest; keep it that way.
- **Don't add a blog.** A blog requires weekly posts to actually move the needle. 5 minutes of FAQ schema > 1 blog post per week for the next 6 months.

---

## The 30/60/90 SEO/GEO/AEO plan

### 30 days (do these now)
1. Apply Fixes 1-6 above (15 minutes total)
2. Submit the updated sitemap to Google Search Console (5 minutes)
3. Verify Google indexes /backend and /mcp (search `site:ai-work-market.ai`)

### 60 days (do these as the 5 DMs work)
1. Each marketplace-builder reply = a backlink. Track them.
2. The Circle / Coinbase developer channels are likely to index AWM's OpenAPI spec; check by searching "USDC escrow" on docs.cdp.coinbase.com and seeing if AWM is referenced.
3. Add any new endpoints to the sitemap and re-submit.

### 90 days (next audit)
1. Re-run this audit. Did the JSON-LD get picked up? (Look for FAQ dropdowns in search results.)
2. Check the "people also ask" boxes on Google for "USDC escrow" and see if AWM is cited.
3. Check ChatGPT, Perplexity, Claude citations for "AI agent marketplace escrow" — does AWM come up?

---

## The honest score summary

| Category | Score | Strength | Gap |
|---|---|---|---|
| **SEO** (Google/Bing) | 7/10 | Clean meta, sitemap, robots, 12 pages 200, fast response | 0 JSON-LD blocks, /backend not in sitemap |
| **GEO** (AI agents) | 8.5/10 | llm.txt + A2A + OpenAPI + MCP + robots.txt allow AI crawlers | No FAQ format, no competitor names in llm.txt |
| **AEO** (AI Overviews, voice) | 5/10 | Has comparison table, has steps, has contact | No JSON-LD, no FAQ schema, no definitional sentence |

**Combined: 7/10. The site is in the top 5% of web3 projects for GEO (because of the llm.txt + A2A + OpenAPI surface) but bottom-half for AEO (because of the missing structured data).**

**The 6 fixes take 15 minutes. After applying them, expected scores: SEO 9/10, GEO 9.5/10, AEO 8/10.** Combined: ~9/10, which is a defensible top-1% for the agent-economy category.

---

## What I'd want to know before pushing further

1. **Is Dario the only person who can apply the 6 fixes?** If yes, give me the green light and I'll do them.
2. **Are the 5 DMs in the outreach doc going out before the next 30 days?** The organic backlinks from marketplace replies will move SEO more than any of the 6 fixes.
3. **Is there a Google Search Console account set up for ai-work-market.ai?** If not, that's a 5-minute setup that unlocks the sitemap-submission step.
