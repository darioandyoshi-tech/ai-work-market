// api/x-data/crypto.js
// x402-paid crypto prices API. Wraps CoinGecko's free tier (no key required).
// $0.005 per call on Base Mainnet. USDC.
//
// Usage:
//   curl -s https://ai-work-market.ai/api/x-data/crypto?ids=bitcoin,ethereum
//     -> 402 with payment instructions
//   (pay USDC, retry with x-payment header)
//   -> { bitcoin: { usd: 95000, usd_24h_change: 2.3 }, ... }

const { withX402 } = require('../_x402-gate');

const handler = withX402(
  {
    price: '$0.005',
    network: 'sepolia',
    description: 'Crypto prices from CoinGecko (USD, 24h change, market cap). Up to 50 coins per call.',
    extra: { category: 'data', source: 'coingecko', tags: ['crypto', 'prices', 'finance'] },
  },
  async (req, _res, payment) => {
    const url = new URL(req.url, 'https://x');
    const ids = url.searchParams.get('ids') || 'bitcoin,ethereum';
    const vs = url.searchParams.get('vs') || 'usd';
    const include24h = url.searchParams.get('include_24h_change') !== 'false';
    const includeMcap = url.searchParams.get('include_market_cap') !== 'false';

    // CoinGecko free API — no key required
    const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`
      + (include24h ? '&include_24hr_change=true' : '')
      + (includeMcap ? '&include_market_cap=true' : '');

    let data;
    try {
      const r = await fetch(cgUrl, {
        headers: { 'User-Agent': 'ai-work-market/1.0 (+https://ai-work-market.ai)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) {
        const err = { error: 'upstream_error', status: r.status, hint: r.status === 429 ? 'CoinGecko rate limit hit' : 'CoinGecko upstream error' };
        return { ...err, ...payment };
      }
      data = await r.json();
    } catch (e) {
      return { error: 'fetch_failed', message: e.message, ...payment };
    }

    return {
      ok: true,
      source: 'coingecko',
      vs_currency: vs,
      timestamp: new Date().toISOString(),
      payment,
      data,
    };
  }
);

module.exports = handler;
module.exports.GET = handler;
module.exports.POST = handler;
