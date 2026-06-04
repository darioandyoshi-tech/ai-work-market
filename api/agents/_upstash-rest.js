// api/agents/_upstash-rest.js
// Tiny Upstash Redis REST client. No SDK install required — uses fetch.
//
// IMPORTANT: We use '-' as the separator in keys (not ':') because Vercel's
// fetch implementation decodes '%3A' (URL-encoded colon) back to ':' before
// sending the request to Upstash. Upstash then parses the URL incorrectly:
// /SADD/awm%3Aagent-cards%3Aids becomes SADD awm:agent-cards:ids which
// is treated as SADD with one key 'awm' and one member 'agent-cards:ids',
// leading to "ERR wrong number of arguments for 'sadd' command".
// Using '-' avoids the encoding dance entirely.
//
// Upstash REST API format:
//   GET  https://<host>/<COMMAND>/<arg1>/<arg2>/...
//   POST https://<host>/<COMMAND>/<arg1>/<arg2>/...
//
// Auth: Authorization: Bearer <token>

function makeUpstash(url, token) {
  if (!url) url = process.env.UPSTASH_REDIS_REST_URL;
  if (!token) token = process.env.UPSTASH_REDIS_REST_TOKEN;

  function encodePathArg(s) {
    // Don't encode '-' or '_' or alphanumerics. We do need to encode some
    // things (like '#' or '?' or '%') to avoid URL parsing issues, but we
    // AVOID encoding ':' which Vercel's fetch layer will decode.
    return encodeURIComponent(String(s));
  }

  async function call(method, command, args) {
    if (!url) throw new Error('UPSTASH_REDIS_REST_URL not set (env or arg)');
    if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN not set (env or arg)');
    args = args || [];

    const path = '/' + command + '/' + args.map(encodePathArg).join('/');
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
