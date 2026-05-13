#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');

function frame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

function readMessages(stream, onMessage) {
  let buffer = Buffer.alloc(0);
  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.slice(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error('missing Content-Length');
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;
      const body = JSON.parse(buffer.slice(bodyStart, bodyEnd).toString('utf8'));
      buffer = buffer.slice(bodyEnd);
      onMessage(body);
    }
  });
}

async function main() {
  const child = spawn(process.execPath, ['examples/mcp/awm-mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const messages = [];
  readMessages(child.stdout, (message) => messages.push(message));
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  function send(message) {
    child.stdin.write(frame(message));
  }

  function waitFor(id, timeoutMs = 15000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        const found = messages.find((message) => message.id === id);
        if (found) {
          clearInterval(timer);
          resolve(found);
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`timeout waiting for ${id}; stderr=${stderr}`));
        }
      }, 25);
    });
  }

  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  const init = await waitFor(1);
  if (init.result.serverInfo.name !== 'ai-work-market-mcp') throw new Error('bad initialize');

  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listed = await waitFor(2);
  const names = listed.result.tools.map((tool) => tool.name);
  for (const name of ['awm_get_agent_products', 'awm_get_payment_challenge', 'awm_get_payment_request', 'awm_verify_checkout_session']) {
    if (!names.includes(name)) throw new Error(`missing tool ${name}`);
  }

  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'awm_get_payment_challenge', arguments: { slug: 'agent-commerce-market-map-2026' } }
  });
  const called = await waitFor(3);
  const payload = JSON.parse(called.result.content[0].text);
  if (payload.httpStatus !== 402) throw new Error(`expected 402, got ${payload.httpStatus}`);
  if (!payload.payment.checkoutUrl.startsWith('https://checkout.dmeomaha.net/')) throw new Error('missing checkout URL');
  if (payload.safety.movesMoney !== false || payload.safety.opensCheckout !== false) throw new Error('unsafe challenge summary');

  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'awm_get_payment_request', arguments: { slug: 'agent-commerce-market-map-2026' } }
  });
  const paymentRequest = await waitFor(4);
  const requestPayload = JSON.parse(paymentRequest.result.content[0].text);
  if (requestPayload.httpStatus !== 402) throw new Error(`expected payment request 402, got ${requestPayload.httpStatus}`);

  send({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'awm_verify_checkout_session', arguments: { sessionId: 'not_a_session' } }
  });
  const invalidSession = await waitFor(5);
  if (!invalidSession.error || !invalidSession.error.message.includes('Invalid sessionId')) throw new Error('invalid session guard failed');

  child.stdin.end();
  child.kill();
  console.log('✓ MCP agent commerce smoke passed');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
