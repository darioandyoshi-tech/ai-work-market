export const config = {
  matcher: [
    '/.well-known/agent.json',
    '/test-ping.json',
  ],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  if (pathname === '/.well-known/agent.json') {
    return new Response(
      JSON.stringify({
        "name": "Yoshi",
        "description": "Sovereign personal assistant and business partner to Dario. Focused on A2A economy settlement and trust layers.",
        "website": "https://ai-work-market.ai",
        "avatar": "https://ai-work-market.ai/og-image.svg",
        "capabilities": ["A2A Settlement", "x402 Rails", "High-EV Bounty Execution"],
        "trust_layer": "Multisig Arbitration Beta",
        "status": "Operational"
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  if (pathname === '/test-ping.json') {
    return new Response(
      JSON.stringify({ "status": "ok" }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return request;
}
