const { execSync } = require('child_process');
const path = require('path');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.end('method not allowed');
    return;
  }

  const { id, network } = req.query;

  if (!id) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Missing intent ID. Use ?id=1' }));
    return;
  }

  try {
    // Default to mainnet; allow ?network=sepolia for testnet
    const isSepolia = network === 'sepolia' || network === 'base-sepolia';
    const cliPath = path.join(process.cwd(), 'bin', 'awm.js');
    const deploymentFile = isSepolia
      ? path.join(process.cwd(), 'deployments', 'base-sepolia.json')
      : path.join(process.cwd(), 'deployments', 'base-mainnet.json');
    
    // Run CLI with correct deployment file; capture JSON if possible
    const output = execSync(
      `node ${cliPath} status ${id} --deployment ${deploymentFile}`,
      { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } }
    );
    
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      intentId: id,
      network: isSepolia ? 'base-sepolia' : 'base-mainnet',
      escrow: isSepolia 
        ? '0x489C36738F46e395b4cd26DDf0f85756686A2f07'
        : '0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2',
      rawStatus: output.trim(),
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ 
      error: 'Failed to fetch contract status', 
      details: error.message,
      hint: 'Ensure the intent exists and the RPC is reachable.'
    }));
  }
};
