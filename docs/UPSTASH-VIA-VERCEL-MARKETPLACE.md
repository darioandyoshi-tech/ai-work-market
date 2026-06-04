# 2-minute Upstash setup for AWM (Vercel Marketplace path)

Use this if you want to click through Vercel's UI rather than upstash.com directly.

## Step 1 (30 sec): Open the Vercel Storage page
https://vercel.com/dme1/ai-work-market/stores

## Step 2 (60 sec): Click Upstash in the Marketplace
- Click the **"Upstash"** tile (under "Marketplace Database Providers" → "Serverless DB (Redis, Vector, Queue, Search)")
- Click **"Add Integration"** (or "Install" depending on version)
- If it asks you to log in to Upstash, do so with Google
- **Database name**: `awm-agent-registry`
- **Region**: pick one close to your Vercel deployment. Check the "Region" of your project at https://vercel.com/dme1/ai-work-market → Settings → General. Match it.
  - Most likely **US East** (iad1) — the default for new Vercel projects
  - But could be **US West** (sfo1) or **EU West** (dub1)
- **Plan**: Free (default)
- **Project to link**: `ai-work-market` (under team `dme1`)
- Click **"Create"** or **"Continue"**

## Step 3 (10 sec): Wait for env vars to be set
Vercel will auto-set:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

in Production environment. Vercel will also auto-trigger a redeploy (~30 sec).

## Step 4 (5 sec): Verify it works
```bash
curl -sS https://www.ai-work-market.ai/api/agent-onboard -X POST \
  -H "content-type: application/json" \
  -d '{"address":"0xec89c40CA296F502cD033e07f18DA5E01cdd197d","name":"Upstash Test","capabilities":["upstash-test"]}'
```

In the JSON response, look for:
```json
"storage": {"backend": "upstash", "totalCards": 1}
```

If you see `"backend": "upstash"`, you're done. The agent-card registry now persists across Vercel instance restarts.

## If the response shows "in-memory (NOT for production cross-instance use)"
- The env vars didn't propagate yet. Wait 30 sec and re-test.
- Or the integration installed but didn't link to the right project. Check https://vercel.com/dme1/ai-work-market/settings/environment-variables and confirm the two UPSTASH_REDIS_REST_* vars are listed for Production.
- If missing, the integration didn't link. Remove and re-add it.

## Cost
- Upstash free tier: 10,000 commands/day, 256MB
- Estimated AWM usage: 100-1000 commands/day (one SET per onboard, one GET per discovery). Comfortably free.
- If you exceed: ~$0.20 per 100K commands after the free tier.

## Alternative: just paste the values manually
If the Marketplace flow is acting weird, you can do it without the integration:
1. Sign in to https://console.upstash.com
2. Create database as described above
3. Copy REST URL and token
4. `cd ~/ai-work-market && vercel env add UPSTASH_REDIS_REST_URL production` and paste
5. `vercel env add UPSTASH_REDIS_REST_TOKEN production` and paste
6. The code auto-detects either source — same backend, same result.
