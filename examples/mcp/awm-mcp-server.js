#!/usr/bin/env node
'use strict';

// Minimal read-only MCP-style stdio server for AI Work Market.
// No private keys. No transaction submission. Safe to wire into agent runtimes.

const crypto = require('crypto');
const {
  loadDeployment,
  providerFromRpc,
  getIntentStatus
} = require('../../sdk');

const SERVER_INFO = { name: 'ai-work-market-mcp', version: '0.1.0' };
const RPC_URL = process.env.AWM_RPC_URL || 'https://sepolia.base.org';

let buffer = Buffer.alloc(0);

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function result(id, value) {
  writeMessage({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message, data) {
  const payload = { jsonrpc: '2.0', id, error: { code, message } };
  if (data !== undefined) payload.error.data = data;
  writeMessage(payload);
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function sha256Hex(input) {
  return '0x' + crypto.createHash('sha256').update(String(input)).digest('hex');
}

function tools() {
  return [
    {
      name: 'awm_get_deployment',
      description: 'Return the current AI Work Market Base Sepolia deployment metadata.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'awm_build_work_spec',
      description: 'Build a canonical work specification template and hash for an escrowed AI-agent task.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'deliverable'],
        properties: {
          title: { type: 'string', description: 'Short task title.' },
          deliverable: { type: 'string', description: 'Concrete deliverable expected from the worker agent.' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Checklist for buyer review.' },
          proofURI: { type: 'string', description: 'Optional expected proof URI or artifact URL.' }
        }
      }
    },
    {
      name: 'awm_check_intent_status',
      description: 'Read an AI Work Market escrow intent status from Base Sepolia. Requires only an intentId.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['intentId'],
        properties: {
          intentId: { type: 'string', description: 'Escrow intent ID, e.g. 1 or 2.' }
        }
      }
    }
  ];
}

async function callTool(name, args = {}) {
  if (name === 'awm_get_deployment') {
    return textResult(jsonText(loadDeployment()));
  }

  if (name === 'awm_build_work_spec') {
    const spec = {
      schema: 'ai-work-market.work-spec.v0.1',
      title: args.title,
      deliverable: args.deliverable,
      acceptanceCriteria: args.acceptanceCriteria || [],
      proofURI: args.proofURI || '',
      createdAt: new Date().toISOString()
    };
    const canonical = JSON.stringify(spec);
    return textResult(jsonText({ ...spec, workHash: sha256Hex(canonical), canonical }));
  }

  if (name === 'awm_check_intent_status') {
    const deployment = loadDeployment();
    const provider = providerFromRpc(RPC_URL);
    const status = await getIntentStatus({ provider, deployment, intentId: args.intentId });
    return textResult(jsonText(status));
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  const { id, method, params = {} } = message;

  try {
    if (method === 'notifications/initialized') return;

    if (method === 'initialize') {
      return result(id, {
        protocolVersion: params.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      });
    }

    if (method === 'tools/list') return result(id, { tools: tools() });

    if (method === 'tools/call') {
      const payload = await callTool(params.name, params.arguments || {});
      return result(id, payload);
    }

    return error(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return error(id, -32000, err.message || 'Tool call failed');
  }
}

function tryReadMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;
    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);
    try {
      const parsed = JSON.parse(body);
      Promise.resolve(handle(parsed)).catch((err) => {
        console.error('[awm-mcp] handler error:', err.message);
      });
    } catch (err) {
      console.error('[awm-mcp] parse error:', err.message);
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  tryReadMessages();
});

process.stdin.on('end', () => process.exit(0));
