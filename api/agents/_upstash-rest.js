// api/agents/_upstash-rest.js
// Tiny Upstash Redis REST client. No SDK install required — uses fetch.
//
// CRITICAL quirk (verified empirically):
//   Vercel's fetch implementation decodes %3A (colon) and %2F (slash)
//   in URL path segments BEFORE sending the request. So if a path has
//   /foo%3Abar, Vercel sends /foo:bar. Upstash then sees the colons
//   in arg positions and fails to parse the command.
//
// Workaround: Base64-encode all VALUES (args 2+) before sending. Base64
// uses only A-Z, a-z, 0-9, +, /, = — and we use URL-safe base64 (with
// - and _ instead of + and /) which has NO chars that Vercel decodes.
// KEYS (arg 1) are sent as-is because the registry uses safe keys
// (no colons or slashes after the colon-stripping fix).
//
// On read, we reverse the base64 transform for values.

function makeUpstash(url, token) {
  if (!url) url = process.env.UPSTASH_REDIS_REST_URL;
  if (!token) token = process.env.UPSTASH_REDIS_REST_TOKEN;

  function b64encode(s) {
    return Buffer.from(String(s), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    if (s == null) return s;
    const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  // For path-based: base64-encode EVERYTHING (keys and values) so that
  // no part of the path contains ':' or '/' that Vercel fetch would decode.
  // We use URL-safe base64 (with - and _ instead of + and /) and no padding.
  // All chars in the result are URL-safe: A-Z, a-z, 0-9, -, _.
  function encodePathArg(s) {
    return b64encode(s);
  }

  async function call(method, command, args) {
    if (!url) throw new Error('UPSTASH_REDIS_REST_URL not set (env or arg)');
    if (!token) throw new Error('UPSTASH_REDIS_REST_TOKEN not set (env or arg)');
    args = args || [];

    // Every arg is b64-encoded (both keys and values).
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
    _b64decode: b64decode,

    // String ops
    get: async (k) => {
      const v = await call('GET', 'GET', [k]);
      return v == null ? null : b64decode(v);
    },
    set: (k, v) => call('POST', 'SET', [k, b64encode(String(v))]),

    // Hash ops
    hset: (k, obj) => {
      const entries = Object.entries(obj);
      return call('POST', 'HSET', [k, ...entries.flatMap(([f, v]) => [b64encode(f), b64encode(String(v))])]);
    },
    hgetall: async (k) => {
      const arr = (await call('GET', 'HGETALL', [k])) || [];
      const out = {};
      for (let i = 0; i < arr.length; i += 2) {
        out[b64decode(arr[i])] = b64decode(arr[i + 1]);
      }
      return out;
    },

    // Set ops
    smembers: async (k) => {
      const arr = (await call('GET', 'SMEMBERS', [k])) || [];
      return arr.map(b64decode);
    },
    sadd: (k, v) => call('POST', 'SADD', [k, b64encode(String(v))]),

    // Utility
    ping: () => call('GET', 'PING', []),
  };
}

module.exports = makeUpstash;
