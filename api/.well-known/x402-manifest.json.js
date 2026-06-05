// api/.well-known/x402-manifest.json.js
// x402 Bazaar discovery manifest. Lists all 6 /api/x-data/* endpoints so
// x402-aware agents and marketplaces can discover them.
//
// Standard: https://docs.cdp.coinbase.com/x402/bazaar
// Also: /x402-manifest (per the discovery spec)

const { withX402 } = require('../_x402-gate');

// IMPORTANT: this is the discovery manifest itself, not a paid endpoint.
// We serve it as a regular (non-paid) API so the Bazaar crawler can read it
// without paying.

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const base = 'https://ai-work-market.ai';
  const manifest = {
    $schema: 'https://x402.org/schemas/x402-discovery.v1.json',
    x402Version: 2,
    name: 'AI Work Market — x402 Data API Bundle',
    description: 'Six x402-paid data and lookup APIs for AI agents. Crypto prices, web search, news + summary, AWM intent lookup, agent reputation, and work contract verifier. Paid in USDC on Base Mainnet. Direct on-chain verification (no third-party facilitator).',
    homepage: 'https://ai-work-market.ai',
    contact: {
      name: 'Dario',
      url: 'https://ai-work-market.ai',
    },
    // The receiving address — the AWM x402 treasury
    payTo: '0xec89c40CA296F502cD033e07f18DA5E01cdd197d',
    network: 'eip155:8453', // Base Mainnet
    assets: [
      {
        symbol: 'USDC',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        network: 'eip155:8453',
        chainId: 8453,
      },
    ],
    verification: {
      method: 'direct-on-chain',
      description: 'Buyer sends a USDC.transfer(payTo, amount) tx, then retries the request with x-payment: <base64 of { tx, payer }>. We verify the tx receipt on-chain (12+ confirmations, amount/recipient/payer match). No third-party facilitator required.',
    },
    // The actual endpoints
    endpoints: [
      {
        id: 'awm-crypto',
        path: '/api/x-data/crypto',
        method: 'GET',
        price: '$0.005',
        priceUsdc: '0.005',
        priceAtomicUnits: '5000',
        network: 'eip155:8453',
        asset: 'USDC',
        description: 'Crypto prices in USD, 24h change, market cap. Up to 50 coins per call via CoinGecko.',
        queryParams: { ids: 'comma-separated coin ids (default: bitcoin,ethereum)', vs: 'currency code (default: usd)' },
        example: `${base}/api/x-data/crypto?ids=bitcoin,ethereum,solana`,
        category: 'data',
        tags: ['crypto', 'prices', 'finance', 'coingecko'],
      },
      {
        id: 'awm-search',
        path: '/api/x-data/search',
        method: 'GET',
        price: '$0.01',
        priceUsdc: '0.01',
        priceAtomicUnits: '10000',
        network: 'eip155:8453',
        asset: 'USDC',
        description: 'Web search via DuckDuckGo. Up to 10 results with title, URL, snippet.',
        queryParams: { q: 'search query (required)', max: '1-10 (default 10)' },
        example: `${base}/api/x-data/search?q=USDC+escrow+Base`,
        category: 'data',
        tags: ['search', 'web', 'research'],
      },
      {
        id: 'awm-news',
        path: '/api/x-data/news',
        method: 'GET',
        price: '$0.02',
        priceUsdc: '0.02',
        priceAtomicUnits: '20000',
        network: 'eip155:8453',
        asset: 'USDC',
        description: 'News + auto-summary from top RSS feeds. Topics: crypto, tech, ai, world, business. Up to 10 items per call.',
        queryParams: { topic: 'crypto|tech|ai|world|business (default: crypto)', max: '1-10 (default 5)' },
        example: `${base}/api/x-data/news?topic=ai&max=5`,
        category: 'data',
        tags: ['news', 'rss', 'research'],
      },
      {
        id: 'awm-intent',
        path: '/api/x-data/awm-intent',
        method: 'GET',
        price: '$0.001',
        priceUsdc: '0.001',
        priceAtomicUnits: '1000',
        network: 'eip155:8453',
        asset: 'USDC',
        description: 'AWM work contract lookup by intent ID. Reads the escrow contract state via eth_getStorageAt.',
        queryParams: { id: 'numeric intent ID (required)', network: 'mainnet|sepolia' },
        example: `${base}/api/x-data/awm-intent?id=1`,
        category: 'awm',
        tags: ['awm', 'escrow', 'intent', 'lookup'],
      },
      {
        id: 'awm-reputation',
        path: '/api/x-data/awm-reputation',
        method: 'GET',
        price: '$0.005',
        priceUsdc: '0.005',
        priceAtomicUnits: '5000',
        network: 'eip155:8453',
        asset: 'USDC',
        description: 'AWM agent reputation. Returns on-chain reputation score, intents as buyer/seller, completion rates, dispute count, first/last activity.',
        queryParams: { address: '0x... EVM address (required)', network: 'mainnet|sepolia' },
        example: `${base}/api/x-data/awm-reputation?address=0xec89c40CA296F502cD033e07f18DA5E01cdd197d`,
        category: 'awm',
        tags: ['awm', 'reputation', 'agent'],
      },
      {
        id: 'awm-verify',
        path: '/api/x-data/awm-verify',
        method: 'GET',
        price: '$0.01',
        priceUsdc: '0.01',
        priceAtomicUnits: '10000',
        network: 'eip155:8453',
        asset: 'USDC',
        description: 'AWM work contract verifier. Combines on-chain state + agent reputations and returns a release/dispute/wait decision with reasons. The most differentiated endpoint: an agent can use this to decide whether to release USDC.',
        queryParams: { id: 'numeric intent ID (required)', network: 'mainnet|sepolia' },
        example: `${base}/api/x-data/awm-verify?id=1`,
        category: 'awm',
        tags: ['awm', 'verify', 'release', 'dispute', 'decision'],
      },
    ],
    // How to integrate (the standard x402 flow)
    integration: {
      protocol: 'x402',
      version: 2,
      flow: [
        '1. Agent hits any endpoint above',
        '2. Server returns HTTP 402 with x-payment-required header (base64 JSON)',
        '3. The header contains: scheme=exact, network=eip155:8453, amount, asset=USDC, payTo, maxTimeoutSeconds',
        '4. Agent sends USDC.transfer(payTo, amount) on Base Mainnet',
        '5. Agent retries the request with x-payment: <base64 of { tx: "0x...", payer: "0x..." }>',
        '6. Server verifies the on-chain receipt (12+ confirmations, amount/recipient/payer match)',
        '7. Server returns the data with x-payment-response header',
      ],
      examplePaymentHeader: base64({ tx: '0x...', payer: '0x...' }),
    },
  };

  return json(res, 200, manifest);
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300'); // cache 5 min for crawlers
  res.end(JSON.stringify(body, null, 2));
}

function base64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}
