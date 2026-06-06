const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalog = require(path.join(root, 'products', 'catalog.json'));

for (const product of catalog.products || []) {
  if (!product.sha256) continue;

  assert.ok(
    product.verificationUrl,
    `${product.slug} has a sha256 proof but no verificationUrl`
  );

  const relativePath = product.verificationUrl.replace(/^\//, '');
  const absolutePath = path.join(root, relativePath);
  assert.ok(
    fs.existsSync(absolutePath),
    `${product.slug} verificationUrl is advertised but missing: ${relativePath}`
  );

  const receipt = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  assert.strictEqual(
    receipt.productId,
    product.slug,
    `${product.slug} verification receipt productId must match catalog slug`
  );
  assert.strictEqual(
    receipt.asset && receipt.asset.sha256,
    product.sha256,
    `${product.slug} verification receipt sha256 must match catalog`
  );
}

console.log('public proof URL checks passed');
