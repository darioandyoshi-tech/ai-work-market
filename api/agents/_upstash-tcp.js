// api/agents/_upstash-tcp.js
// Tiny RESP3 client over TLS for Upstash Redis. No npm dependencies.
// Use when you have rediss://...:6379 credentials but no REST API token.
//
// Usage:
//   const makeUpstashTcp = require('./_upstash-tcp.js');
//   const up = makeUpstashTcp({
//     url: 'rediss://default:password@host:6379',
//   });
//   await up.set('key', 'value');
//   const v = await up.get('key');

const { URL } = require('url');
const tls = require('tls');

function makeUpstashTcp(opts) {
  if (typeof opts === 'string') opts = { url: opts };
  const u = new URL(opts.url);
  const password = decodeURIComponent(u.password);
  const host = u.hostname;
  const port = parseInt(u.port || '6379', 10);

  // Parse a Redis array command into RESP protocol bytes.
  // RESP2: "*<n>\r\n$<l>\r\n<arg>\r\n..."
  function encode(args) {
    let out = '*' + args.length + '\r\n';
    for (const a of args) {
      const s = String(a);
      out += '$' + Buffer.byteLength(s, 'utf8') + '\r\n' + s + '\r\n';
    }
    return out;
  }

  // Parse one RESP reply. Returns the value and a remaining buffer.
  function parse(buf) {
    if (buf.length === 0) return { value: null, rest: buf };
    const type = String.fromCharCode(buf[0]);
    const rest = buf.slice(1);
    if (type === '+') {
      // Simple string
      const idx = rest.indexOf('\r\n');
      return { value: rest.slice(0, idx).toString(), rest: rest.slice(idx + 2) };
    }
    if (type === '-') {
      const idx = rest.indexOf('\r\n');
      throw new Error('Redis error: ' + rest.slice(0, idx).toString());
    }
    if (type === ':') {
      const idx = rest.indexOf('\r\n');
      return { value: parseInt(rest.slice(0, idx).toString(), 10), rest: rest.slice(idx + 2) };
    }
    if (type === '$') {
      const idx = rest.indexOf('\r\n');
      const len = parseInt(rest.slice(0, idx).toString(), 10);
      const body = rest.slice(idx + 2);
      if (len < 0) return { value: null, rest: body.slice(2) };
      return { value: body.slice(0, len).toString(), rest: body.slice(len + 2) };
    }
    if (type === '*') {
      const idx = rest.indexOf('\r\n');
      const n = parseInt(rest.slice(0, idx).toString(), 10);
      let cur = rest.slice(idx + 2);
      const arr = [];
      for (let i = 0; i < Math.abs(n); i++) {
        const r = parse(cur);
        arr.push(r.value);
        cur = r.rest;
      }
      return { value: arr, rest: cur };
    }
    throw new Error('Unknown RESP type: ' + type);
  }

  // One persistent connection per function instance. Vercel serverless may
  // close the function after each request, so we reconnect on demand.
  let _conn = null;
  let _buf = Buffer.alloc(0);
  let _waiters = [];
  let _ready = null;

  function ensureConn() {
    if (_conn && !_conn.destroyed) return _ready;
    _ready = new Promise((resolve, reject) => {
      _conn = tls.connect({ host, port, servername: host, rejectUnauthorized: true }, () => {
        // Send AUTH command
        const authCmd = encode(['AUTH', password]);
        _conn.write(authCmd);
      });
      _conn.on('data', (chunk) => {
        _buf = Buffer.concat([_buf, chunk]);
        // Try to drain all complete replies
        while (_waiters.length > 0) {
          try {
            const r = parse(_buf);
            _buf = r.rest;
            const w = _waiters.shift();
            w.resolve(r.value);
          } catch (e) {
            if (e.message.includes('Unknown') || e.message.includes('Unexpected')) break;
            // incomplete buffer, wait for more
            break;
          }
        }
      });
      _conn.on('error', (err) => {
        while (_waiters.length > 0) {
          const w = _waiters.shift();
          w.reject(err);
        }
        _ready = null;
      });
      _conn.on('close', () => {
        _ready = null;
      });
      // Resolve ready after AUTH completes
      const origWaiters = _waiters;
      _waiters = [];
      origWaiters.push({ resolve: () => resolve(), reject });
      // The AUTH reply will be the first one parsed above
    });
    return _ready;
  }

  async function call(...args) {
    await ensureConn();
    return new Promise((resolve, reject) => {
      _waiters.push({ resolve, reject });
      try {
        _conn.write(encode(args));
      } catch (e) {
        _waiters.pop();
        reject(e);
      }
    });
  }

  return {
    get: (k) => call('GET', k),
    set: (k, v) => call('SET', k, typeof v === 'string' ? v : JSON.stringify(v)),
    hset: (k, obj) => {
      const entries = Object.entries(obj);
      return call('HSET', k, ...entries.flat());
    },
    hgetall: async (k) => {
      const arr = (await call('HGETALL', k)) || [];
      const out = {};
      for (let i = 0; i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
      return out;
    },
    smembers: (k) => call('SMEMBERS', k),
    sadd: (k, v) => call('SADD', k, typeof v === 'string' ? v : JSON.stringify(v)),
    ping: () => call('PING'),
    _using: `${host}:${port} (TLS, password auth)`,
  };
}

module.exports = makeUpstashTcp;
