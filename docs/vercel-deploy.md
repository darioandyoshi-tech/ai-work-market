# Vercel Demo Deployment

The repository is Vercel-ready for a static demo deployment. Deployment is intentionally not automatic because publishing externally should be confirmed first.

## What Vercel serves

- `/` rewrites to `demo/index.html`
- `demo/offers.json` remains available as sample marketplace data
- Markdown docs remain in the repo for GitHub/readme use

Config: [`../vercel.json`](../vercel.json)

## Preview deploy

```bash
npx vercel --yes
```

## Production deploy

```bash
npx vercel --prod --yes
```

## Environment

No runtime secrets are needed for the static demo.

Do **not** upload `.env.base-sepolia.local`, private keys, or wallet secrets to Vercel. The demo is read-only and points at the public Base Sepolia deployment.

## Suggested checks before publishing

```bash
node --check bin/awm.js
node --check sdk/index.js
python3 -m json.tool demo/offers.json >/tmp/awm-offers.json
npm audit --omit=dev
npm run awm -- status 2
```

## Rollback

Use the Vercel dashboard or CLI deployment list/rollback flow. Keep the last known-good demo copy in `demo/index.html` and avoid publishing from a dirty working tree when possible.
