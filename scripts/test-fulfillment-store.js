#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { recordEvent, getSessionRecord } = require('../api/_fulfillment-store');

async function main() {
  console.log('Testing Fulfillment Store Persistence...');
  
  const STORE_PATH = path.join(process.cwd(), 'artifacts', 'fulfillment-log.json');
  
  // Clear store for clean test
  if (fs.existsSync(STORE_PATH)) {
    fs.unlinkSync(STORE_PATH);
  }

  const testEvent = {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_test_abc',
        amount_total: 1000,
        currency: 'usd'
      }
    },
    productSlug: 'agent-commerce-market-map-2026'
  };

  console.log('Recording event...');
  const record = recordEvent(testEvent);
  assert.ok(record, 'Should return recorded object');
  assert.strictEqual(record.id, 'evt_test_123');

  console.log('Checking file persistence...');
  const fileExists = fs.existsSync(STORE_PATH);
  assert.ok(fileExists, 'Store file should exist');

  const fileContent = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  assert.strictEqual(fileContent.events.length, 1);
  assert.strictEqual(fileContent.events[0].id, 'evt_test_123');

  console.log('Testing duplicate prevention...');
  recordEvent(testEvent);
  const updatedContent = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  assert.strictEqual(updatedContent.events.length, 1, 'Should not record duplicate event IDs');

  console.log('Testing session lookup...');
  const sessionRec = getSessionRecord('cs_test_abc');
  assert.ok(sessionRec, 'Should find record by session ID');
  assert.strictEqual(sessionRec.id, 'evt_test_123');

  console.log('✓ Fulfillment store tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
