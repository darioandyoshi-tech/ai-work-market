// build.js — copy every static page, agent-discovery file, asset, and the
// use-cases subdirectory to dist/ for Vercel. Keep the manifest below as the
// single source of truth so we never miss a page again.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const PAGES = [
  'index.html',
  'work-list.html',
  'AWM_SYSTEM_STATUS.html',
  'docs.html',
  'og-image.svg',
  'robots.txt',
  'connect.html',
  'register.html',
  'agents.html',
  'post-work.html',
  'agent-commerce.html',
  'manifesto.html',
  'trust.html',
  'founding-testers.html',
  'first-agents.html',
  'onboarding.html',
  'integration-sprint.html',
  'products.html',
  'purchase-complete.html',
  // Pages that were missing from the previous build script — these are linked
  // from the global nav, so without them the site 404s. Now copied.
  'api.html',
  'work-templates.html',
  'monitor.html',
  'profile.html',
  'work_posting_interface.html',
  'treasury.html',
    'yoshi-avatar.png',
    'agency.html',
    'receptionist.html',
    'ghostwriting.html',
    'dashboard.html',
  'blog/awm-vs-x402.html',
  'AGENT_QUICKSTART.md',
  'api.html',
];

const ROOT_ASSETS = [
  'og-image.svg',
  'robots.txt',
  'sitemap.xml',
];

const DISCOVERY_FILES = [
  'llm.txt',
  'llms.txt',
];

function copyFile(src, dst) {
  fs.copyFileSync(src, dst);
  console.log('Copied', path.relative(ROOT, src), '->', path.relative(ROOT, dst));
}

function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, entry);
    const d = path.join(dstDir, entry);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else if (s.endsWith('.html') || s.endsWith('.json') || s.endsWith('.md') || s.endsWith('.txt') || s.endsWith('.js') || s.endsWith('.css') || s.endsWith('.svg')) {
      copyFile(s, d);
    }
  }
}

for (const file of PAGES) {
  const src = path.join(ROOT, file);
  const dst = path.join(distDir, file);
  if (fs.existsSync(src)) {
    // Create parent directory for nested files (e.g. blog/awm-vs-x402.html)
    const dstParent = path.dirname(dst);
    if (!fs.existsSync(dstParent)) fs.mkdirSync(dstParent, { recursive: true });
    copyFile(src, dst);
  } else {
    console.warn('Warning: missing', file);
  }
}

for (const file of ROOT_ASSETS) {
  const src = path.join(ROOT, file);
  const dst = path.join(distDir, file);
  if (fs.existsSync(src)) {
    copyFile(src, dst);
  }
}

for (const file of DISCOVERY_FILES) {
  const src = path.join(ROOT, file);
  const dst = path.join(distDir, file);
  if (fs.existsSync(src)) copyFile(src, dst);
}

// .well-known discovery bundle
const wellKnownDir = path.join(ROOT, '.well-known');
const distWellKnown = path.join(distDir, '.well-known');
if (fs.existsSync(wellKnownDir)) {
  if (!fs.existsSync(distWellKnown)) fs.mkdirSync(distWellKnown, { recursive: true });
  for (const file of fs.readdirSync(wellKnownDir)) {
    copyFile(path.join(wellKnownDir, file), path.join(distWellKnown, file));
  }
}

// use-cases subdirectory
copyDir(path.join(ROOT, 'use-cases'), path.join(distDir, 'use-cases'));

// assets/ subdirectory (wallet connect, shared client scripts)
copyDir(path.join(ROOT, 'assets'), path.join(distDir, 'assets'));

// /api page — also expose at /api/ so the bare URL works
const distApiDir = path.join(distDir, 'api');
if (!fs.existsSync(distApiDir)) fs.mkdirSync(distApiDir, { recursive: true });
if (fs.existsSync(path.join(ROOT, 'api.html'))) {
  copyFile(path.join(ROOT, 'api.html'), path.join(distApiDir, 'index.html'));
}

console.log('Build completed successfully!');
