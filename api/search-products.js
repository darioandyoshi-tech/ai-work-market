// api/search-products.js
// Alias for /api/agent-search with a more discoverable name.
// Per agent feedback: "I want awm_search_products(query)".
// Same shape, same ranking algorithm (TF-IDF), same cache TTL.

const handler = require('./agent-search.js');

module.exports = async function (req, res) {
  // Normalize the request and forward
  // The underlying handler reads req.query.q — make sure it's set.
  if (req.method === 'GET' && req.query && !req.query.q) {
    // Allow `query` as an alternative param name
    if (req.query.query) req.query.q = req.query.query;
  }
  return handler(req, res);
};
