// api/agents/_upstash-rest.js
// Tiny Upstash Redis REST client. No SDK install required — uses fetch.
//
// Upstash REST API format (https://upstash.com/docs/redis/api/rest):
//   GET  https://<host>/<COMMAND>/<arg1>/<arg2>/...  (args in path)
//   POST https://<host>/<COMMAND>                    (args in JSON body)
//
// The body for POST is a JSON array of string args.
//
// Auth: Authorization: Bearer <token>
//
// We use '-' as the separator in keys (not ':') to avoid any URL encoding
// issues with Vercel's fetch implementation.

function makeUpstash(url, token) {
  if (!url) url = process.env.UPSTASH_REDIS_REST_URL;
  if (!token) token = process.env.UPSTASH_REDIS_REST_TOKEN;

  function encodePathArg(s) {
    return encodeURIComponent(String(s));
  }

  async function call(method, command, args) {
    if (!url) throw new Error('UPSTASH_REDIS_REST_URL not set (env or arg)');
    if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN not set (env or arg)');
    args = args || [];

    let fullUrl;
    let fetchOpts;

    if (method === 'GET') {
      // Path-based: /<COMMAND>/<arg1>/<arg2>/...
      const path = '/' + command + '/' + args.map(encodePathArg).join('/');
      fullUrl = url + path;
      fetchOpts = {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
      };
    } else {
      // Body-based: /<COMMAND> with body = JSON array of args
      fullUrl = url + '/' + command;
      fetchOpts = {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      };
    }

    const res = await fetch(fullUrl, fetchOpts);
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
