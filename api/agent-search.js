// api/agent-search.js
// Semantic-ish search over the product catalog. Pure read-only.
//
// Strategy: TF-IDF over product name, description, capability tags, and
// categories. No vector DB needed — for the size of the catalog (a few
// dozen products), this is fast, free, and good enough. When the catalog
// grows past ~1000 products, swap in a vector index (Pinecone, pgvector,
// or the Vercel KV-backed HNSW).
//
// Returns ranked results with a score, matching fields, and the same
// shape as /api/agent-products so the consumer doesn't need to switch
// parsers.

const fs = require('fs');
const path = require('path');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=30');
  res.end(JSON.stringify(body, null, 2));
}

function tokenize(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\/]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 32);
}

function loadCatalog() {
  const p = path.join(__dirname, '..', 'products', 'catalog.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return raw.products || [];
}

function fieldsOf(p) {
  return [
    p.name,
    p.description,
    p.type,
    p.status,
    Array.isArray(p.capabilities) ? p.capabilities.join(' ') : '',
    Array.isArray(p.tags) ? p.tags.join(' ') : '',
    Array.isArray(p.paymentRails) ? p.paymentRails.join(' ') : '',
  ].join(' ');
}

// Build a tiny in-memory inverted index keyed by token.
function buildIndex(products) {
  const docs = products.map((p) => ({ p, tokens: tokenize(fieldsOf(p)) }));
  const df = new Map();
  for (const d of docs) {
    const seen = new Set();
    for (const t of d.tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  return { docs, df, N: docs.length };
}

function scoreIndex(idx, query) {
  const qt = tokenize(query);
  if (qt.length === 0) return [];
  const scores = new Map();
  const idf = (term) => Math.log(1 + (idx.N + 1) / (1 + (idx.df.get(term) || 0)));

  for (const term of qt) {
    for (const d of idx.docs) {
      let tf = 0;
      for (const t of d.tokens) if (t === term || t.includes(term)) tf += (t === term ? 2 : 1);
      if (tf > 0) {
        scores.set(d.p.id, (scores.get(d.p.id) || 0) + tf * idf(term));
      }
    }
  }

  // Rank
  const ranked = [];
  for (const d of idx.docs) {
    const s = scores.get(d.p.id) || 0;
    if (s > 0) {
      // Find which fields matched (for explainability)
      const matches = [];
      for (const [field, text] of [['name', d.p.name], ['description', d.p.description], ['capabilities', (d.p.capabilities || []).join(' ')], ['type', d.p.type], ['tags', (d.p.tags || []).join(' ')]]) {
        const ft = tokenize(text);
        for (const term of qt) {
          if (ft.includes(term) || ft.some((t) => t.includes(term))) {
            if (!matches.includes(field)) matches.push(field);
          }
        }
      }
      ranked.push({ product: d.p, score: Math.round(s * 100) / 100, matchedFields: matches });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const q = String((req.query && req.query.q) || '').trim();
  const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit || '10'), 10) || 10));
  const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

  const products = loadCatalog();
  const idx = buildIndex(products);
  const ranked = q ? scoreIndex(idx, q) : products.map((p) => ({ product: p, score: 0, matchedFields: [] }));

  const total = ranked.length;
  const hits = ranked.slice(offset, offset + limit);

  return json(res, 200, {
    schema: 'ai-work-market.agent-search.v1',
    generatedAt: new Date().toISOString(),
    query: { q, limit, offset },
    total,
    count: hits.length,
    results: hits,
    next: offset + limit < total ? `?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset + limit}` : null,
  });
};
