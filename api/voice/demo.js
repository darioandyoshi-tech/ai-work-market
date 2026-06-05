// api/voice/demo.js
// Demo endpoint for the AI receptionist. Returns a text script that
// simulates what the voice agent would say, so prospects can see the
// flow without spending Twilio minutes.

const VERTICALS = {
  dental: {
    name: 'Maple Family Dental',
    greeting: "Thanks for calling Maple Family Dental. This is Sarah, the AI receptionist. How can I help you today?",
    sample: [
      { caller: "Hi, I just cracked a tooth and I'm in a lot of pain.", sarah: "Oh no, I'm sorry to hear that. That sounds urgent. We have an emergency line that can get you in within the hour. Can I get your name and the best number to reach you?" },
      { caller: "Sure, it's Alex Chen, 555-0142.", sarah: "Got it, Alex. Someone from our emergency team will call you back in the next 5 minutes. In the meantime, avoid chewing on that side and rinse with warm salt water. Take care." },
    ],
  },
  realestate: {
    name: 'Coastal Realty Group',
    greeting: "Thanks for calling Coastal Realty Group. This is Sarah. Are you looking to buy, sell, or just have a question?",
    sample: [
      { caller: "I'm thinking about putting my house on the market in the next few months.", sarah: "Great, we can definitely help with that. What area is the property in?" },
      { caller: "Mar Vista, 90230.", sarah: "Perfect. One of our agents will pull comps in your area and follow up within 1 business day to schedule a free listing consultation. Can I get your name and email?" },
    ],
  },
  law: {
    name: 'Hartley & Associates Law',
    greeting: "Thanks for calling Hartley and Associates. This is Sarah. How can I help you?",
    sample: [
      { caller: "I was in a car accident last week and I'm not sure what to do.", sarah: "I'm sorry to hear that. The first thing to do is get medical attention if you haven't already. Our attorneys handle car accident cases and offer free consultations. Can I get your name and the best number to reach you?" },
    ],
  },
  hvac: {
    name: 'Cool Air HVAC',
    greeting: "Thanks for calling Cool Air HVAC. This is Sarah. Are you calling about a service issue, a new install, or a maintenance plan?",
    sample: [
      { caller: "Yeah, my AC is out and it's 100 degrees in here.", sarah: "I hear you, let's get that fixed fast. A tech can be out within 2 hours. What's your address and the best number to reach you?" },
    ],
  },
};

module.exports = function handler(req, res) {
  const url = new URL(req.url, 'https://x');
  const vertical = url.searchParams.get('vertical') || 'dental';
  const v = VERTICALS[vertical] || VERTICALS.dental;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({
    ok: true,
    vertical,
    business: v.name,
    greeting: v.greeting,
    sampleConversation: v.sample,
    voiceProvider: 'Twilio + Polly.Joanna + GPT-4',
    costPerMinute: '$0.05-0.10/min (Twilio $0.013/min + OpenAI $0.0001/token + Polly $0.04/min)',
    setup: {
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || 'NOT CONFIGURED',
      voiceWebhookUrl: 'https://ai-work-market.ai/api/voice/inbound',
      statusCallbackUrl: 'https://ai-work-market.ai/api/voice/status',
    },
    pricing: {
      setup: '$0 (1 hour of configuration included in the first month)',
      monthly: '$1,000-2,000/month depending on call volume',
      perCall: '$0.10-0.50 per call (Twilio + OpenAI cost, passed through at cost)',
    },
    cta: 'Ready to set this up for your business? Email yoshi@ai-work-market.ai or visit /receptionist to apply.',
  }, null, 2));
};
