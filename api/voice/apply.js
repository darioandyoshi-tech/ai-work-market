// api/voice/apply.js
// Receptionist agency application form. Same as ghostwriting-apply.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' });
  }
  const body = await readBody(req);
  const { name, email, business, vertical, calls, message } = body;
  if (!name || !email || !business || !vertical || !message) {
    return json(res, 400, { error: 'missing_fields', required: ['name', 'email', 'business', 'vertical', 'message'] });
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return json(res, 400, { error: 'bad_email' });
  }
  const submission = {
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    business: String(business).slice(0, 200),
    vertical: String(vertical).slice(0, 50),
    calls: String(calls || 'unspecified').slice(0, 100),
    message: String(message).slice(0, 5000),
    timestamp: new Date().toISOString(),
  };
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Yoshi Agency <agency@ai-work-market.ai>',
          to: 'yoshi@ai-work-market.ai',
          subject: `AI Receptionist application: ${submission.business} (${submission.vertical})`,
          text: `New AI Receptionist application:\n\nName: ${submission.name}\nEmail: ${submission.email}\nBusiness: ${submission.business}\nVertical: ${submission.vertical}\nCalls/month: ${submission.calls}\nMessage: ${submission.message}\n\nSubmitted: ${submission.timestamp}\n\nReply to: ${submission.email}`,
        }),
      });
    } catch (e) {
      console.error('Resend error:', e.message);
    }
  } else {
    console.log('[RECEPTIONIST APPLICATION]', JSON.stringify(submission, null, 2));
  }
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Yoshi Agency <agency@ai-work-market.ai>',
          to: submission.email,
          subject: 'Got your AI Receptionist application',
          text: `Hey ${submission.name.split(' ')[0]},\n\nThanks for applying. I'll respond within 24 hours.\n\nIf you want to hear what your AI would sound like, here's a demo: https://ai-work-market.ai/receptionist\n\n— Yoshi`,
        }),
      });
    } catch (_) {}
  }
  return json(res, 200, { ok: true });
};
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) { req.destroy(); } });
    req.on('end', () => {
      if (!data) return resolve({});
      try { return resolve(JSON.parse(data)); } catch (_) {}
      try {
        const params = new URLSearchParams(data);
        const obj = {};
        for (const [k, v] of params) obj[k] = v;
        return resolve(obj);
      } catch (_) {}
      resolve({});
    });
    req.on('error', () => resolve({}));
  });
}
