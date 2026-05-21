const http = require('http');

const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/quote-integration-work' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Received quote request for:', data.project);

        // The "Handoff" logic: 
        // x402 provides the access/auth to the agent.
        // AWM provides the escrowed lifecycle for the actual delivery.
        const response = {
          status: 'success',
          handoff_type: 'x402_to_awm_escrow',
          x402_access_meta: {
            endpoint: 'https://api.x402.example/access',
            method: 'GET',
            required_token: 'mock-x402-token-123',
            context: 'Pay-per-call access granted for consultation'
          },
          awm_work_spec: {
            title: 'Custom x402 Integration Sprint',
            description: 'Implement a canonical x402 quote-to-escrow handoff for the buyer\'s agent stack.',
            estimated_duration: '48h',
            deliverables: [
              'One operational quote endpoint',
              'One signed AWM offer',
              'Base Sepolia funding verification',
              'Proof URI submission and release flow'
            ],
            price_usd: 1500,
            currency: 'USDC',
            network: 'base-sepolia'
          },
          awm_offer: {
            offer_id: 'off_987654321',
            seller_address: '0xSellersWalletAddressHere',
            buyer_address: '0xBuyersWalletAddressHere',
            escrow_contract: '0xMockEscrowContractAddress',
            signing_instructions: 'Sign the EIP-712 work order using your private key to commit to the sprint.',
            funding_uri: 'https://awm.example/fund/off_987654321'
          },
          proof_convention: {
            format: 'JSON-LD',
            required_fields: ['github_pr', 'test_logs', 'acceptance_checklist'],
            submission_endpoint: 'https://api.awm.example/submit-proof/off_987654321'
          }
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`AWM x402 Handoff Demo Server running on port ${PORT}`);
  console.log(`POST to http://localhost:${PORT}/quote-integration-work to see the handoff`);
});
