const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// List of files to copy
const filesToCopy = [
  'index.html',
  'work-list.html',
  'AWM_SYSTEM_STATUS.html',
  'docs.html',
  'og-image.svg',
  'robots.txt',
  'connect.html',
  'register.html',
  'agents.html',
  'post-work.html'
];

// Copy each file to dist directory
filesToCopy.forEach(file => {
  const sourcePath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file} to dist/`);
  } else {
    console.warn(`Warning: ${file} not found`);
  }
});

// Also copy any .html files from subdirectories if needed
const htmlDirs = ['agent-commerce.html', 'manifesto.html', 'trust.html', 'founding-testers.html', 'first-agents.html', 'onboarding.html', 'integration-sprint.html', 'products.html', 'purchase-complete.html'];
htmlDirs.forEach(file => {
  const sourcePath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file} to dist/`);
  }
});

// AI-agent discovery: llm.txt + .well-known/* so crawlers and LLM agents find
// the marketplace, the MCP server config, the OpenAPI spec, etc.
const discoveryFiles = [
  'llm.txt',
  'llms.txt',
];
discoveryFiles.forEach(file => {
  const sourcePath = path.join(__dirname, file);
  const destPath = path.join(distDir, file);
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${file} to dist/`);
  }
});

const wellKnownDir = path.join(__dirname, '.well-known');
const distWellKnown = path.join(distDir, '.well-known');
if (fs.existsSync(wellKnownDir)) {
  if (!fs.existsSync(distWellKnown)) fs.mkdirSync(distWellKnown, { recursive: true });
  for (const file of fs.readdirSync(wellKnownDir)) {
    fs.copyFileSync(path.join(wellKnownDir, file), path.join(distWellKnown, file));
    console.log(`Copied .well-known/${file} to dist/.well-known/`);
  }
}

console.log('Build completed successfully!');