// api/agents/_upstash-rest.js
// Tiny Upstash Redis REST client. No SDK install required — uses fetch.
//
// Upstash REST API format (per https://upstash.com/docs/redis/api/rest):
//   GET  https://<host>/<COMMAND>/<arg1>/<arg2>/...
//   POST https://<host>/<COMMAND>/<arg1>/<arg2>/...   (with body for write commands)
//
// Auth: Authorization: Bearer <UPSTASH_REDIS_REST_TOKEN>
//
// All command args are URL-path encoded. Strings/numbers only.

function makeUpstash(url, token) {
  if (!url) url = process.env.UPSTASH_REDIS_REST_URL;
  if (!token) token = process.env.UPSTASH_REDIS_REST_TOKEN;

  function encodePathArg(s) {
    // Upstash wants URL-encoded path segments. encodeURIComponent encodes
    // most special chars except some that we need to handle manually.
    return encodeURIComponent(String(s));
  }

  async function call(method, command, args) {
    if (!url) throw new Error('UPSTASH_REDIS_REST_URL not set (env or arg)');
    if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN not set (env or arg)');
    args = args || [];

    // Build path: /<COMMAND>/<arg1>/<arg2>/...
    const path = '/' + command + args.map(encodePathArg).join('/');
    const fullUrl = url + path;

    const res = await fetch(fullUrl, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`upstash ${command} returned ${res.status}: ${text}`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(`upstash ${command} error: ${data.error}`);
    }
    return data.result;
  }

  return {
    _using: url ? url.replace(/\/\/.*@/, '//***@') : '(no url)',

    // String ops
    get: (k) => call('GET', 'GET', [k]),
    set: (k, v) => call('POST', 'SET', [k, String(v)]),

    // Hash ops
    hset: (k, obj) => {
      const entries = Object.entries(obj);
      // HSET key field1 value1 field2 value2 ...
      return call('POST', 'HSET', [k, ...entries.flatMap(([f, v]) => [f, String(v)])]);
    },
    hgetall: async (k) => {
      const arr = (await call('GET', 'HGETALL', [k])) || [];
      const out = {};
      for (let i = 0; i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
      return out;
    },

    // Set ops
    smembers: (k) => call('GET', 'SMEMBERS', [k]),
    sadd: (k, v) => call('POST', 'SADD', [k, String(v)]),

    // Utility
    ping: () => call('GET', 'PING', []),
  };
}

module.exports = makeUpstash;
