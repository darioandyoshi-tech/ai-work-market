// api/agents/_upstash-rest.js
// Tiny Upstash Redis REST client. No SDK install required — uses fetch.
// Works in any Vercel serverless function. Falls back to no-op if env vars
// are missing.
//
// Two ways to use:
//   1. From env vars: const upstash = require('./_upstash-rest.js');
//      // Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
//   2. With explicit args: const upstash = makeUpstash(url, token);

function makeUpstash(url, token) {
  if (!url) url = process.env.UPSTASH_REDIS_REST_URL;
  if (!token) token = process.env.UPSTASH_REDIS_REST_TOKEN;

  async function call(command, args) {
    if (!url) throw new Error('UPSTASH_REDIS_REST_URL not set (env or arg)');
    args = args || [];
    const fullUrl = url + '/' + encodeURIComponent(JSON.stringify([command].concat(args)));
    const res = await fetch(fullUrl, {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`upstash ${command} returned ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.result;
  }

  return {
    get: (k) => call('GET', [k]),
    set: (k, v) => call('SET', [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    hset: (k, obj) => {
      const entries = Object.entries(obj);
      return call('HSET', [k].concat(entries.flat()));
    },
    hgetall: async (k) => {
      const arr = (await call('HGETALL', [k])) || [];
      const out = {};
      for (let i = 0; i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
      return out;
    },
    smembers: (k) => call('SMEMBERS', [k]),
    sadd: (k, v) => call('SADD', [k, typeof v === 'string' ? v : JSON.stringify(v)]),
    // For introspection / debug
    _using: url ? url.replace(/\/\/.*@/, '//***@') : '(no url)',
  };
}

module.exports = makeUpstash();
