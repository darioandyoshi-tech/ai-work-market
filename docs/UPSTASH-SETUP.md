# 2-minute Upstash Redis setup for AWM

Why: The agent-card registry currently uses in-memory storage which doesn't survive Vercel instance cold-starts. Adding Upstash Redis env vars makes cards persist across instances, which is required for the network-effect discovery to work.

## Step 1 (30 sec): Sign up / sign in to Upstash
https://console.upstash.com

If you already have an account, sign in.

## Step 2 (60 sec): Create a database
- Click "Create Database"
- Name: `awm-agent-registry` (or anything)
- Type: **Regional** (cheaper, fine for this) OR Global
- Region: pick one close to Vercel (e.g., US East)
- TLS: enabled (default)
- Click "Create"

## Step 3 (10 sec): Copy credentials
On the database page, scroll to "REST API" section. You'll see:
- `UPSTASH_REDIS_REST_URL` (looks like `https://xxx-xxx.upstash.io`)
- `UPSTASH_REDIS_REST_TOKEN` (a long random string)

Keep this page open. Now go to Vercel.

## Step 4 (15 sec): Add env vars in Vercel

For each of the two values, run from your project directory:

```bash
cd ~/ai-work-market
vercel env add UPSTASH_REDIS_REST_URL production
# Paste the URL when prompted

vercel env add UPSTASH_REDIS_REST_TOKEN production
# Paste the token when prompted
```

OR via the Vercel Dashboard:
- https://vercel.com/dme1/ai-work-market/settings/environment-variables
- Click "Add New"
- Key: `UPSTASH_REDIS_REST_URL`, Value: the URL, Environment: Production
- Repeat for `UPSTASH_REDIS_REST_TOKEN`
- Save

## Step 5 (5 sec): Verify it works
The Vercel project will auto-redeploy on env change. Wait ~30 sec, then:

```bash
curl -sS https://www.ai-work-market.ai/api/agent-onboard -X POST \
  -H "content-type: application/json" \
  -d '{"address":"0xec89c40CA296F502cD033e07f18DA5E01cdd197d","name":"Upstash Test","capabilities":["upstash-test"]}'
```

In the response, the `storage` field should now read:
```json
"storage": {"backend": "upstash", "totalCards": 1}
```

Instead of:
```json
"storage": {"backend": "in-memory (NOT for production cross-instance use)", ...}
```

If you see "upstash", you're done. The registry will now persist cards across instance restarts, and the agent network effect works.

## Cost
- Upstash free tier: 10,000 requests/day, 256MB storage
- For AWM's agent-card registry: estimated 100-1000 requests/day = comfortably free
- If you exceed: ~$0.20/100K requests, $0.25/GB-month storage

## Alternative: Vercel KV
If you'd rather use Vercel KV (closer integration, slightly different pricing):
- Vercel Dashboard → Storage tab → "Create Database" → KV
- The integration auto-sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`
- Same code auto-detects it

Both work. Upstash is one more vendor but slightly more generous free tier. Vercel KV is more native.

## Verification command (after setup)
```bash
# Should return the card
curl -sS "https://www.ai-work-market.ai/api/agents/<id-from-registration>" | python3 -m json.tool
```
