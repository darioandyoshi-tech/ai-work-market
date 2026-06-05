// api/ghostwriting-apply.js
// Receive a ghostwriting application. Sends an email to yoshi@ai-work-market.ai
// via Resend (or logs to console if no Resend key).
// Free endpoint — no payment required. This is the lead-capture form.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const body = await readBody(req);
  if (body.__bodyTooLarge) {
    return json(res, 413, { error: 'body_too_large', maxBytes: 64 * 1024 });
  }
  const { name, email, twitter, followers, message } = body;

  if (!name || !email || !twitter || !message) {
    return json(res, 400, { error: 'missing_fields', required: ['name', 'email', 'twitter', 'message'] });
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return json(res, 400, { error: 'bad_email' });
  }

  const submission = {
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    twitter: String(twitter).slice(0, 500),
    followers: String(followers || 'unspecified').slice(0, 100),
    message: String(message).slice(0, 5000),
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || 'unknown',
    ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
  };

  // Send email via Resend (or log)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'Yoshi Agency <agency@ai-work-market.ai>',
          to: 'yoshi@ai-work-market.ai',
          subject: `Ghostwriting application from ${submission.name} (${submission.followers} followers)`,
          text: `New ghostwriting agency application:

Name: ${submission.name}
Email: ${submission.email}
Twitter/LinkedIn: ${submission.twitter}
Followers: ${submission.followers}
Message: ${submission.message}

Submitted: ${submission.timestamp}
IP: ${submission.ip}
UA: ${submission.userAgent}

Reply to: ${submission.email}`,
        }),
      });
    } catch (e) {
      console.error('Resend error:', e.message);
    }
  } else {
    // No Resend key — log to console (Vercel captures these)
    console.log('[GHOSTWRITING APPLICATION]', JSON.stringify(submission, null, 2));
  }

  // Send confirmation email to the applicant
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'Yoshi Agency <agency@ai-work-market.ai>',
          to: submission.email,
          subject: 'Got your ghostwriting application — next steps',
          text: `Hey ${submission.name.split(' ')[0]},

Thanks for applying to the Yoshi AI Ghostwriting Agency. I got your application and will respond within 24 hours.

In the meantime, if you want to see what a voice profile + 7-day calendar looks like for YOUR actual posts, try the free demo at https://ai-work-market.ai/ghostwriting (it's the page you came from).

Quick context: I run 12 clients at $1,500/month each. The agent does 90% of the work; I spend ~3 hours/week reviewing. The bottleneck is client fit, not production capacity.

If we're a fit, the next step is a 30-minute call where I build a sample voice profile live (no charge). If we're not, I'll refer you to someone who is.

— Yoshi
  https://ai-work-market.ai`,
        }),
      });
    } catch (_) {}
  }

  return json(res, 200, { ok: true, message: 'Application sent. Response within 24 hours.' });
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
    let tooLarge = false;
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) { tooLarge = true; req.destroy(); } });
    req.on('end', () => {
      if (tooLarge) {
        return resolve({ __bodyTooLarge: true });
      }
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
