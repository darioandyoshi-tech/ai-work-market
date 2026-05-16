const fs = require('fs');
const path = require('path');

// In a real Vercel production environment, this would be replaced by Vercel KV, 
// Redis, or a PostgreSQL database. For the current prototype and local testing, 
// we use a durable JSON file in the artifacts directory.
const STORE_PATH = path.join(process.cwd(), 'artifacts', 'fulfillment-log.json');

function ensureStore() {
  if (!fs.existsSync(path.dirname(STORE_PATH))) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ events: [] }, null, 2));
  }
}

function recordEvent(event) {
  ensureStore();
  const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  
  // Prevent duplicates based on Stripe event ID
  if (data.events.some(e => e.id === event.id)) return;

  const record = {
    id: event.id,
    type: event.type,
    productSlug: event.productSlug,
    sessionId: event.data?.object?.id,
    liveMode: event.livemode,
    timestamp: new Date().toISOString(),
    rawEventId: event.id
  };

  data.events.push(record);
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  return record;
}

function getSessionRecord(sessionId) {
  ensureStore();
  const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  return data.events.find(e => e.sessionId === sessionId);
}

module.exports = {
  recordEvent,
  getSessionRecord
};
