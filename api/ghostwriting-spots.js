// api/ghostwriting-spots.js
// Returns the number of ghostwriting spots taken (out of 12).
// In production this would read from a DB. For now, hardcoded.

module.exports = function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  // TODO: replace with real counter when clients are onboarded
  res.end(JSON.stringify({
    spotsTotal: 12,
    spotsTaken: 0,
    note: 'Counter will update as clients are onboarded. Currently accepting applications.',
  }));
};
