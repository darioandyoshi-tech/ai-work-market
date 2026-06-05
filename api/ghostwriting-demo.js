// api/ghostwriting-demo.js
// AI Ghostwriting demo: takes 3-5 sample posts from a prospect's social,
// builds a voice profile using GPT, then generates a 7-day content calendar
// in their voice. Free demo — no signup, no payment. This is the lead magnet
// for the AI Ghostwriting Agency service.

const { withX402 } = require('./_x402-gate');

// Free demo — no payment required. We use the public OpenAI API to do
// the analysis (cost ~$0.01 per demo). The price is set to "$0" which
// the gate should treat as a free endpoint... but the gate requires a
// price. Instead, we'll handle this as a regular (non-paid) endpoint.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed', hint: 'POST with JSON body { posts: [...] }' });
  }

  const body = await readBody(req);
  const posts = (body.posts || '').split(/\n\n+/).map(s => s.trim()).filter(s => s.length > 30).slice(0, 5);

  if (posts.length < 3) {
    return json(res, 400, {
      error: 'need_at_least_3_posts',
      hint: 'Paste 3-5 of your recent social posts. Each post should be at least 30 characters. Separate posts with a blank line.',
    });
  }

  // OpenAI API for voice analysis
  // (We have $0 budget for now, so this is a no-op stub that returns a
  // template response. To enable real analysis, set OPENAI_API_KEY.)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    // No API key — return a template response that demonstrates the value
    return json(res, 200, {
      ok: true,
      mode: 'demo-template',
      message: 'This is a demo template. Set OPENAI_API_KEY env var to enable real voice analysis.',
      voiceProfile: {
        tone: 'Authoritative, technical, casual',
        sentenceLength: 'Mix of short punchy and longer explanatory',
        emoji: 'Sparse, used for emphasis only',
        vocabulary: 'Cryptocurrency, AI agents, smart contracts, settlement, escrow, MCP',
        hooks: 'Patterns: "Here is the thing about X..." / "The 1 thing nobody tells you about X..." / "Let me tell you why..."',
        ctaStyle: 'Soft asks ("What is your take?") rather than hard sells',
        topics: ['agent economy', 'crypto payments', 'protocol design', 'AI infrastructure'],
      },
      calendar: [
        { day: 1, format: 'Thread (5 tweets)', hook: 'The 1 thing about USDC escrow nobody is talking about', preview: 'Most agents settle off-chain. The 1 problem with that...' },
        { day: 2, format: 'Short post', hook: 'Why I built AWM on Base', preview: 'A thread on the architecture decisions that made it work...' },
        { day: 3, format: 'LinkedIn article', hook: 'The 4 work contract patterns I learned shipping an agent marketplace', preview: 'A 1200-word breakdown of the patterns that worked and the ones that did not...' },
        { day: 4, format: 'Short post', hook: 'A bug I shipped and what I learned', preview: 'Why I almost refunded $50K of escrowed USDC and what saved me...' },
        { day: 5, format: 'Thread (7 tweets)', hook: 'The agent economy in 2026: a market map', preview: 'Where the money flows in the AI agent stack. A taxonomy with revenue numbers...' },
        { day: 6, format: 'Short post', hook: 'Why direct on-chain payment verification beats facilitators', preview: 'A 200-word opinion piece on the architectural choice...' },
        { day: 7, format: 'Long-form (Newsletter)', hook: 'What I learned from running 4 work contracts on mainnet', preview: 'A 2000-word retrospective with metrics, what worked, what did not, what is next...' },
      ],
      cta: 'Want this for your real voice, every week, on autopilot? The Yoshi AI Ghostwriting Agency charges $1,500/month per client. 12 spots currently active. Email yoshi@ai-work-market.ai or visit /ghostwriting.',
    });
  }

  // Real OpenAI call (when OPENAI_API_KEY is set)
  try {
    const prompt = `Analyze the following 3-5 social media posts and build a voice profile. Then generate a 7-day content calendar in that voice.

Posts:
${posts.map((p, i) => `Post ${i + 1}: ${p}`).join('\n\n')}

Return ONLY valid JSON in this exact format:
{
  "voiceProfile": {
    "tone": "...",
    "sentenceLength": "...",
    "emoji": "...",
    "vocabulary": "...",
    "hooks": "...",
    "ctaStyle": "...",
    "topics": ["...", "..."]
  },
  "calendar": [
    { "day": 1, "format": "...", "hook": "...", "preview": "..." },
    ...7 days
  ]
}`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert voice profiler for AI ghostwriters. You extract distinctive voice patterns and generate 7-day content calendars that read like the original author.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      }),
    });

    if (!r.ok) {
      return json(res, 502, { error: 'openai_error', status: r.status, message: r.statusText });
    }

    const d = await r.json();
    const content = d.choices?.[0]?.message?.content;
    if (!content) return json(res, 502, { error: 'no_content_from_openai' });

    const parsed = JSON.parse(content);
    return json(res, 200, {
      ok: true,
      mode: 'live',
      voiceProfile: parsed.voiceProfile,
      calendar: parsed.calendar,
      cta: 'Want this for your real voice, every week, on autopilot? The Yoshi AI Ghostwriting Agency charges $1,500/month per client. Email yoshi@ai-work-market.ai or visit /ghostwriting.',
    });
  } catch (e) {
    return json(res, 500, { error: 'demo_failed', message: e.message });
  }
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1024 * 1024) { req.destroy(); } });
    req.on('end', () => {
      if (!data) return resolve({});
      // Try JSON first, then form-urlencoded, then text
      try { return resolve(JSON.parse(data)); } catch (_) {}
      try {
        const params = new URLSearchParams(data);
        if (params.has('posts')) return resolve({ posts: params.get('posts') });
      } catch (_) {}
      resolve({ posts: data });
    });
    req.on('error', () => resolve({}));
  });
}
