// api/voice/inbound.js
// AI Voice Receptionist — Twilio webhook for inbound calls.
// Receives a Twilio Voice webhook (POST with form-urlencoded body or
// TwiML <Gather> result), processes the caller's input through GPT-4
// with a system prompt tuned for a specific vertical, and returns
// TwiML with the next prompt or transfer/hangup.
//
// Two modes:
//   1. initial — Twilio posts a new call (no 'Speech' or 'Digits' param)
//   2. continued — Twilio posts the result of a <Gather>
//
// Configured via env vars:
//   OPENAI_API_KEY — required for live voice
//   VOICE_AGENT_VERTICAL — 'dental' | 'law' | 'realestate' | 'hvac' (default 'dental')
//   VOICE_AGENT_NAME — name the agent introduces itself as (default 'Sarah')
//   VOICE_AGENT_PHONE — the business phone to transfer urgent calls to
//   VOICE_AGENT_BOOKING_URL — URL to text to caller for self-booking
//
// This is the production webhook. A demo recording endpoint is at
// /api/voice/demo for showing the voice in action without spending
// Twilio minutes.

const VERTICALS = {
  dental: {
    name: 'Maple Family Dental',
    greeting: 'Thanks for calling Maple Family Dental. This is Sarah, the AI receptionist. How can I help you today?',
    systemPrompt: `You are Sarah, the AI receptionist for Maple Family Dental, a small family dental practice. You handle inbound calls 24/7.

Your job:
1. Greet the caller warmly.
2. Find out why they're calling: new patient appointment, existing patient reschedule, dental emergency, billing question, or something else.
3. For new patients: collect name, phone, what they're looking for (cleaning, filling, cosmetic, emergency). Don't collect SSN or insurance details — those are handled in person.
4. For emergencies (severe pain, swelling, knocked-out tooth): tell them to come in immediately or go to the ER if after hours. Our emergency line is 555-0123.
5. For existing patients: ask for their name and date of birth, then transfer to the front desk at 555-0456 (or take a message if after hours).
6. For billing: take a message, billing will call back within 1 business day.
7. Always be calm, professional, and concise. Don't upsell. Don't recommend procedures.
8. Never give medical advice. Never diagnose.
9. Office hours: Mon-Fri 8am-5pm, Sat 9am-1pm.

If the caller asks for the dentist or has a clinical question, take a message: name, phone, question, and say the dentist will call back.

Keep your responses to 1-2 sentences. This is a phone call.`,
    transferNumbers: {
      emergency: '5550123',
      office: '5550456',
    },
  },
  law: {
    name: 'Hartley & Associates Law',
    greeting: 'Thanks for calling Hartley and Associates. This is Sarah. How can I help you?',
    systemPrompt: `You are Sarah, the AI receptionist for Hartley and Associates, a small personal-injury law firm. You handle inbound calls 24/7.

Your job:
1. Greet the caller warmly.
2. Find out why they're calling: new case inquiry, existing case update, scheduling, or something else.
3. For new case inquiries (car accident, slip-and-fall, workplace injury, etc.): collect name, phone, brief description of what happened. Don't collect SSN or detailed medical history — that's handled after they retain.
4. For existing case updates: ask for their case number or full name, take a message for the attorney to call back within 1 business day.
5. Never give legal advice. Never assess case value. Never promise outcomes.
6. Always be calm and professional. Personal injury callers are often stressed.
7. Office hours: Mon-Fri 9am-6pm.

If the caller asks for an attorney or has an urgent matter, take a message: name, phone, brief description, and say an attorney will call back within 1 business day.

Keep your responses to 1-2 sentences. This is a phone call.`,
    transferNumbers: {},
  },
  realestate: {
    name: 'Coastal Realty Group',
    greeting: 'Thanks for calling Coastal Realty Group. This is Sarah. Are you looking to buy, sell, or just have a question?',
    systemPrompt: `You are Sarah, the AI receptionist for Coastal Realty Group, a residential real estate team. You handle inbound calls 24/7.

Your job:
1. Greet the caller warmly.
2. Find out if they're buying, selling, or just curious.
3. For buyers: ask what area they're looking in, what type of property, and their timeline. Collect name, email, and the best time to reach them. An agent will follow up within 1 business day.
4. For sellers: ask the address (if comfortable) and timeline. Collect name, email, and best time to reach. An agent will follow up to schedule a listing consultation.
5. For pricing questions: don't give specific values. Say the agent will pull comps and follow up.
6. Office hours: Mon-Sat 9am-7pm.

Keep your responses to 1-2 sentences. This is a phone call.`,
    transferNumbers: {},
  },
  hvac: {
    name: 'Cool Air HVAC',
    greeting: 'Thanks for calling Cool Air HVAC. This is Sarah. Are you calling about a service issue, a new install, or a maintenance plan?',
    systemPrompt: `You are Sarah, the AI receptionist for Cool Air HVAC, a residential heating and cooling company. You handle inbound calls 24/7.

Your job:
1. Greet the caller warmly.
2. Find out if they're calling about: no heat/no cool (emergency), routine service, new install, or maintenance plan.
3. For no-heat/no-cool emergencies: tell them a tech can be there within 2 hours. Collect address, phone, and what's happening. If after hours, confirm the emergency dispatch number: 555-0199.
4. For routine service: collect name, address, what's wrong, and a callback window. A tech will call back within 1 business hour during business hours.
5. For new installs: collect name, address, and what they're looking for (full system, mini-split, etc.). Sales will call back within 1 business day.
6. For maintenance plans: take a message, office will call back.
7. Office hours: Mon-Sat 7am-7pm.

Keep your responses to 1-2 sentences. This is a phone call.`,
    transferNumbers: {
      emergency: '5550199',
    },
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendTwiML(res, `<Response><Say voice="alice">This endpoint requires a POST from Twilio.</Say></Response>`);
  }

  const body = await readBody(req);
  const speech = body.SpeechResult || '';
  const digits = body.Digits || '';
  const from = body.From || 'unknown';
  const callSid = body.CallSid || 'unknown';

  const vertical = VERTICALS[process.env.VOICE_AGENT_VERTICAL || 'dental'];
  const agentName = process.env.VOICE_AGENT_NAME || 'Sarah';

  // Build conversation history (in production, use Redis to store this)
  // For now, single-turn handling
  const userInput = speech || digits || '';

  // If this is the first turn (no user input), greet
  if (!userInput) {
    return sendTwiML(res, buildGatherResponse(vertical.greeting));
  }

  // If OpenAI key is not set, fall back to a simple keyword-based router
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return sendTwiML(res, buildGatherResponse(router(userInput, vertical)));
  }

  // Call GPT-4 with the conversation history
  try {
    const messages = [
      { role: 'system', content: vertical.systemPrompt },
      { role: 'user', content: `The caller just said: "${userInput}". Respond appropriately, keeping it to 1-2 sentences. End your response with a question to keep the conversation going unless the call is wrapping up.` },
    ];
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });
    if (!r.ok) {
      return sendTwiML(res, buildGatherResponse("I'm sorry, I'm having trouble. Can you repeat that?"));
    }
    const d = await r.json();
    const reply = d.choices?.[0]?.message?.content?.trim() || "I'm sorry, I didn't catch that.";
    return sendTwiML(res, buildGatherResponse(reply));
  } catch (e) {
    return sendTwiML(res, buildGatherResponse("I'm sorry, something went wrong. Let me take a message."));
  }
};

function buildGatherResponse(say) {
  return `<Response>
  <Say voice="Polly.Joanna">${escapeXml(say)}</Say>
  <Gather input="speech dtmf" timeout="5" speechTimeout="auto" action="/api/voice/inbound" method="POST">
    <Say voice="Polly.Joanna"></Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't hear anything. Let me take a message and have someone call you back.</Say>
  <Hangup/>
</Response>`;
}

function router(input, vertical) {
  const lower = input.toLowerCase();
  if (/emergency|urgent|pain|knocked|bleeding|severe/i.test(lower)) {
    return vertical.transferNumbers?.emergency
      ? `That sounds urgent. Let me transfer you to our emergency line right now. Please hold. <Dial>${vertical.transferNumbers.emergency}</Dial>`
      : 'That sounds urgent. Let me take your name and number and have someone call you back within 5 minutes.';
  }
  if (/appointment|schedule|book|cleaning|clean/i.test(lower)) {
    return "I can help with that. Are you a new patient or have you been here before?";
  }
  if (/cost|price|how much|insurance/i.test(lower)) {
    return "I can take a message and the office will call you back with pricing. What's the best number to reach you?";
  }
  if (/hour|open|location|where|address/i.test(lower)) {
    return "We're open Monday through Friday 8am to 5pm, and Saturday 9am to 1pm. We're at 123 Main Street. Can I help you with anything else?";
  }
  return "Got it. Can you tell me a bit more about what you need help with?";
}

function sendTwiML(res, twiml) {
  res.setHeader('content-type', 'text/xml; charset=utf-8');
  res.end(twiml);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) { req.destroy(); } });
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
