// api/x-data/search.js
// x402-paid web search API. Wraps DuckDuckGo's HTML search (free, no key).
// $0.01 per call on Base Mainnet. USDC.
//
// Usage:
//   curl -s "https://ai-work-market.ai/api/x-data/search?q=USDC+escrow+protocol+Base"
//     -> 402 with payment instructions
//   (pay USDC, retry with x-payment header)
//   -> { results: [{ title, url, snippet }], payment: {...} }

const { withX402 } = require('../_x402-gate');

const handler = withX402(
  {
    price: '$0.01',
    network: 'sepolia',
    description: 'Web search via DuckDuckGo. Up to 10 results per call with title, URL, snippet.',
    extra: { category: 'data', source: 'duckduckgo', tags: ['search', 'web', 'research'] },
  },
  async (req, _res, payment) => {
    const url = new URL(req.url, 'https://x');
    const q = url.searchParams.get('q');
    if (!q) {
      return { error: 'missing_query', hint: 'Pass ?q=your+search+query', ...payment };
    }
    const max = Math.min(parseInt(url.searchParams.get('max') || '10', 10), 10);

    // DuckDuckGo HTML search (no key required, returns HTML)
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

    let html;
    try {
      const r = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ai-work-market/1.0; +https://ai-work-market.ai)',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) {
        return { error: 'upstream_error', status: r.status, ...payment };
      }
      html = await r.text();
    } catch (e) {
      return { error: 'fetch_failed', message: e.message, ...payment };
    }

    // Parse the results (DuckDuckGo's HTML is stable but ugly)
    const results = [];
    // Each result is in a div.result with an a.result__a (title + href) and a.result__snippet
    const resultBlocks = html.split(/class="result\s+results_links/);
    for (let i = 1; i < resultBlocks.length && results.length < max; i++) {
      const block = resultBlocks[i];
      const titleMatch = block.match(/<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>/);
      const hrefMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/);
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      if (titleMatch && hrefMatch) {
        const href = hrefMatch[1];
        // DDG wraps URLs in a redirect — extract the actual URL
        let actualUrl = href;
        const uddgMatch = href.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try { actualUrl = decodeURIComponent(uddgMatch[1]); } catch (_) {}
        }
        results.push({
          title: titleMatch[1].trim(),
          url: actualUrl,
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '',
        });
      }
    }

    return {
      ok: true,
      source: 'duckduckgo',
      query: q,
      timestamp: new Date().toISOString(),
      count: results.length,
      results,
      payment,
    };
  }
);

module.exports = handler;
