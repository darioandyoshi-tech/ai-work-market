// api/voice/status.js
// Twilio status callback webhook. Logs the call outcome.
// Useful for billing and for showing the prospect a call log.

module.exports = async function handler(req, res) {
  const body = await readBody(req);
  // Log to console (Vercel captures these)
  console.log('[TWILIO CALL]', JSON.stringify({
    callSid: body.CallSid,
    from: body.From,
    to: body.To,
    status: body.CallStatus,
    duration: body.CallDuration,
    direction: body.Direction,
    timestamp: body.Timestamp,
  }, null, 2));
  res.statusCode = 200;
  res.end('OK');
};

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      const obj = {};
      if (data) {
        const params = new URLSearchParams(data);
        for (const [k, v] of params) obj[k] = v;
      }
      resolve(obj);
    });
    req.on('error', () => resolve({}));
  });
}
