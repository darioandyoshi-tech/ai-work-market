#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const solcPath = path.join(root, 'node_modules', 'solc');

// Fresh clones should have artifacts after `npm install`, but production installs
// may omit devDependencies. In that case, skip instead of breaking static deploys.
if (!fs.existsSync(solcPath)) {
  console.log('Skipping contract compile: solc is not installed. Run `npm install` then `npm run compile` if CLI artifacts are needed.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'compile.js')], {
  cwd: root,
  stdio: 'inherit',
});

process.exit(result.status || 0);
