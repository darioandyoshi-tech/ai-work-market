const { execSync } = require('child_process');
const path = require('path');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.end('method not allowed');
    return;
  }

  const { id } = req.query;

  if (!id) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Missing intent ID' }));
    return;
  }

  try {
    // Execute the CLI tool directly
    const cliPath = path.join(process.cwd(), 'bin', 'awm.js');
    const output = execSync(`node ${cliPath} status ${id}`, { encoding: 'utf8' });
    
    // The CLI output is typically formatted text; we need to parse it or’
    // ensure the CLI can output JSON. For the demo, we'll return the raw output 
    // wrapped in a JSON object.
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      intentId: id,
      rawStatus: output.trim(),
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Failed to fetch contract status', details: error.message }));
  }
};
