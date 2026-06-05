// api/x-data/news.js
// x402-paid news + auto-summary API. Wraps free RSS feeds from major sources.
// $0.02 per call on Base Mainnet. USDC.
//
// Usage:
//   curl -s "https://ai-work-market.ai/api/x-data/news?topic=crypto&max=5"
//     -> 402 with payment
//   -> { results: [{ title, url, source, publishedAt, summary, payment }] }
//
// Topics map to RSS feed URLs (all free, no key required).
// Summary is extracted (first 280 chars of <description>), not LLM-generated,
// to keep this endpoint's cost at ~$0 (no LLM call needed).

const { withX402 } = require('../_x402-gate');

const FEEDS = {
  crypto: [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
    { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  ],
  tech: [
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  ],
  ai: [
    { name: 'Hacker News (AI)', url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+agent' },
    { name: 'r/MachineLearning', url: 'https://www.reddit.com/r/MachineLearning/.rss' },
  ],
  world: [
    { name: 'Reuters', url: 'https://feeds.reuters.com/Reuters/worldNews' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ],
  business: [
    { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss' },
    { name: 'WSJ Markets', url: 'https://feeds.a]djournal.com/wsj/public/page/2_3020-markets.html' },
  ],
};

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchFeed(feed, max) {
  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': 'ai-work-market/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [];
    // Parse <item> blocks (most RSS)
    const itemBlocks = xml.split(/<item[\s>]/i).slice(1);
    for (const block of itemBlocks) {
      const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const dateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      if (titleMatch && linkMatch) {
        items.push({
          title: stripHtml(titleMatch[1]),
          url: stripHtml(linkMatch[1]),
          source: feed.name,
          publishedAt: dateMatch ? new Date(dateMatch[1]).toISOString() : null,
          summary: descMatch ? stripHtml(descMatch[1]).slice(0, 280) : '',
        });
      }
      if (items.length >= max) break;
    }
    return items;
  } catch (_) {
    return [];
  }
}

const handler = withX402(
  {
    price: '$0.02',
    network: 'mainnet',
    description: 'News + auto-summary from top RSS sources. Topics: crypto, tech, ai, world, business. Up to 10 items per call.',
    extra: { category: 'data', source: 'rss-aggregator', tags: ['news', 'rss', 'research'] },
  },
  async (req, _res, payment) => {
    const url = new URL(req.url, 'https://x');
    const topic = (url.searchParams.get('topic') || 'crypto').toLowerCase();
    const max = Math.min(parseInt(url.searchParams.get('max') || '5', 10), 10);
    const feeds = FEEDS[topic] || FEEDS.crypto;

    // Fetch all feeds in parallel
    const allItems = (await Promise.all(feeds.map(f => fetchFeed(f, max)))).flat();
    // Sort by date desc
    allItems.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    const top = allItems.slice(0, max);

    return {
      ok: true,
      source: 'rss-aggregator',
      topic,
      count: top.length,
      timestamp: new Date().toISOString(),
      results: top,
      payment,
    };
  }
);

module.exports = handler;
