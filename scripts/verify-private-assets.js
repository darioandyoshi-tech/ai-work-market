#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

const privateAssets = [
  'products/agent-commerce-market-map/packet.md',
  'products/agent-commerce-market-map/source-index.md',
  'products/awm-work-intake-n8n/README.md',
  'products/awm-work-intake-n8n/setup.md',
  'products/awm-work-intake-n8n/test-data.json',
  'products/awm-work-intake-n8n/workflow.json'
];

function readIgnore(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return new Set(text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')));
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

const gitignore = readIgnore('.gitignore');
const vercelignore = readIgnore('.vercelignore');

const tracked = new Set(execFileSync('git', ['ls-files', '--', ...privateAssets], {
  cwd: root,
  encoding: 'utf8'
}).split(/\r?\n/).filter(Boolean));

for (const asset of privateAssets) {
  if (tracked.has(asset)) fail(`${asset} is tracked by git`);
  if (!gitignore.has(asset)) fail(`${asset} is missing from .gitignore`);
  if (!vercelignore.has(asset)) fail(`${asset} is missing from .vercelignore`);
}

const catalogText = fs.readFileSync(path.join(root, 'products/catalog.json'), 'utf8');
for (const asset of privateAssets) {
  const publicPath = `/${asset}`;
  if (catalogText.includes(publicPath) || catalogText.includes(asset)) {
    fail(`products/catalog.json references private asset path ${asset}`);
  }
}

if (!process.exitCode) {
  console.log(`✓ ${privateAssets.length} private fulfillment assets are untracked, ignored by Vercel, and absent from public catalog paths.`);
}
