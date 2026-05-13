#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');

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
  const discovery = JSON.parse(fs.readFileSync('.well-known/awm-mcp.json', 'utf8'));
  const discoveryNames = discovery.tools.map((tool) => tool.name);
  for (const name of names) {
    if (!discoveryNames.includes(name)) throw new Error(`discovery missing tool ${name}`);
  }
  for (const tool of listed.result.tools) {
    if (!tool.annotations || tool.annotations.readOnlyHint !== true || tool.annotations.destructiveHint !== false) {
      throw new Error(`unsafe or missing annotations for ${tool.name}`);
    }
  }
  for (const name of ['awm_get_agent_products', 'awm_get_payment_challenge', 'awm_get_payment_request', 'awm_get_machine_payment_contract_preview', 'awm_verify_checkout_session']) {
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
  if (requestPayload.product.id !== payload.product.id) throw new Error('payment challenge/request product mismatch');
  if (requestPayload.payment.checkoutUrl !== payload.payment.checkoutUrl) throw new Error('payment challenge/request checkout mismatch');

  send({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'awm_get_machine_payment_contract_preview', arguments: { slug: 'agent-commerce-market-map-2026', workSpec: { title: 'Review market map', deliverable: 'Verified research packet' } } }
  });
  const preview = await waitFor(5);
  const previewPayload = JSON.parse(preview.result.content[0].text);
  if (previewPayload.safety.movesMoney !== false || previewPayload.state !== 'preview') throw new Error('unsafe reservation preview');

  send({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'awm_get_payment_challenge', arguments: { slug: 'Agent Commerce Market Map' } }
  });
  const invalidSlug = await waitFor(6);
  if (!invalidSlug.error || !invalidSlug.error.message.includes('Invalid slug')) throw new Error('invalid slug guard failed');

  send({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'awm_get_payment_challenge', arguments: { slug: 'definitely-not-a-real-product' } }
  });
  const unknownSlug = await waitFor(7);
  const unknownPayload = JSON.parse(unknownSlug.result.content[0].text);
  if (![400, 404].includes(unknownPayload.httpStatus)) throw new Error(`expected unknown slug 400/404, got ${unknownPayload.httpStatus}`);
  if (unknownPayload.safety.movesMoney !== false) throw new Error('unknown slug safety missing');

  send({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: { name: 'awm_verify_checkout_session', arguments: { sessionId: 'not_a_session' } }
  });
  const invalidSession = await waitFor(8);
  if (!invalidSession.error || !invalidSession.error.message.includes('Invalid sessionId')) throw new Error('invalid session guard failed');

  child.stdin.end();
  child.kill();
  console.log('✓ MCP agent commerce smoke passed');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
