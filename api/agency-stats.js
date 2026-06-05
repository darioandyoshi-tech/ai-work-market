// api/agency-stats.js
// Returns live stats for the Yoshi Agency command center.
// All counters are 0 for now (no clients yet). Will be updated as
// clients are onboarded.

module.exports = function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.end(JSON.stringify({
    ghostwritingClients: 0,
    receptionistClients: 0,
    virtualsJobs: 0,
    x402Calls: 1, // We verified the first one on 2026-06-05
    ghostwritingSpots: 12,
    receptionistSpots: 5,
    updatedAt: new Date().toISOString(),
    note: 'Counters will update as clients are onboarded and jobs are completed.',
  }));
};
