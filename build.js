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
  'AWM_SYSTEM_STATUS.html',
  'docs.html',
  'og-image.svg',
  'robots.txt'
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

console.log('Build completed successfully!');