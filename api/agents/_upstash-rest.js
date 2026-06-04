// api/agents/_upstash-rest.js
// Tiny Upstash Redis REST client. No SDK install required — uses fetch.
// Works in any Vercel serverless function. Falls back to no-op if env vars
// are missing.
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

async function call(command, args = []) {
  if (!process.env.UPSTASH_REDIS_REST_URL) throw new Error('UPSTASH_REDIS_REST_URL not set');
  const url = process.env.UPSTASH_REDIS_REST_URL + '/' + encodeURIComponent(JSON.stringify([command, ...args]));
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`upstash ${command} returned ${res.status}`);
  const data = await res.json();
  return data.result;
}

module.exports = {
  get: (k) => call('GET', [k]),
  set: (k, v) => call('SET', [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  hset: (k, obj) => {
    // Upstash HSET takes a single key, then field/value pairs
    const entries = Object.entries(obj);
    return call('HSET', [k, ...entries.flat()]);
  },
  hgetall: async (k) => {
    const arr = await call('HGETALL', [k]) || [];
    const out = {};
    for (let i = 0; i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
    return out;
  },
  smembers: (k) => call('SMEMBERS', [k]),
  sadd: (k, v) => call('SADD', [k, typeof v === 'string' ? v : JSON.stringify(v)]),
};
