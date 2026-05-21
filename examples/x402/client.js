const http = require('http');

async function requestQuote(project) {
  console.log(`\x1b[32m--- Requesting Quote for ${project} ---\x1b[0m`);
  const data = JSON.stringify({ project });
  
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    hostname: 'localhost',
    port: 3000,
    path: '/quote-integration-work',
    body: data
  };

  const req = await new Promise((resolve) => {
    const request = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
      });
    });
    request.write(data);
    request.end();
  });

  return req.body;
}

async function simulateAWMFlow(quote) {
  console.log(`\n\x1b[34m--- Step 1: x402 Handoff Analysis ---\x1b[0m`);
  console.log(`\x1b[33mCrossover point discovered:\x1b[0m ${quote.handoff_type}`);
  console.log(`x402 access granted via: ${quote.x402_access_meta.endpoint}`);
  console.log(`AWM Escrow triggered for deliverable: ${quote.awm_work_spec.title}`);

  console.log(`\n\x1b[34m--- Step 2: Commitment & Funding ---\x1b[0m`);
  console.log(`Estimated Price: ${quote.awm_work_spec.price_usd} ${quote.awm_work_spec.currency}`);
  console.log(`Action: Sign offer ${quote.awm_offer.offer_id} → Fund on ${quote.awm_work_spec.network}`);
  console.log(`Funding URI: ${quote.awm_offer.funding_uri}`);

  console.log(`\n\x1b[34m--- Step 3: Delivery & Proof ---\x1b[0m`);
  console.log(`Proof Format: ${quote.proof_convention.format}`);
  console.log(`Submission Endpoint: ${quote.proof_convention.submission_endpoint}`);
  console.log(`Expected: [${quote.proof_convention.required_fields.join(', ')}]`);

  console.log(`\n\x1b[33m--- RESULT ---\x1b[0m`);
  console.log(`The agent has successfully transitioned from a pay-per-call consultation (x402) to a scoped, escrowed delivery (AWM).`);
}

async function run() {
  try {
    await requestQuote('Custom AI Agent Integration');
    const quote = await requestQuote('Custom AI Agent Integration');
    await simulateAWMFlow(quote);
  } catch (e) {
    console.error('\x1b[31mError running demo script:\x1b[0m', e);
  }
}

// The requestQuote function actually needs to be called once to start 
// (the server is started separately in case this is user wants to run it)
// Since we are in a headless env, we'll just mock the call
async function main() {
  console.log('Starting x402-to-AWM Handoff Demo Client...');
  try {
    await run();
  } catch (e) {
    console.log('Error: Server not running. Start the server first with: node server.js');
  }
}

main();
