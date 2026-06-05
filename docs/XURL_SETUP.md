# X (Twitter) Setup for AWM Outreach

The `xurl` CLI is installed at `~/.local/bin/xurl` but NOT authenticated. You need to complete the OAuth flow once before any of the 4 priority DMs (in `docs/PRIORITY_DMS.md`) or the public announcement tweet can be sent.

This document walks through setup. The agent will run the rest (DMs, tweet) once you confirm `xurl whoami` returns your handle.

---

## Step 1: Create an X developer app (5 min)

1. Go to https://developer.x.com/en/portal/dashboard
2. Sign in with the @darioandyoshi-tech account (or whichever account you want to use for AWM outreach)
3. Click "Create a new app" (or "Add app" if you have one already)
4. App name: `awm-outreach` (or anything)
5. Set the **redirect URI** to: `http://localhost:8080/callback`
6. App type: **"Web app, automated app or bot"** (NOT "Native App" — that breaks OAuth)
7. Under "User authentication settings", enable **OAuth 2.0** with read+write scopes
8. Save
9. Copy the **Client ID** and **Client Secret** from the "Keys and tokens" tab

> **Common pitfall**: the X dashboard has TWO fields labeled "Client Secret" — the first one is actually the Client ID. The actual Client ID ends in `MTpjaQ` (base64 of `1:c`). The Client Secret is a long random string.

## Step 2: Register the app locally (30 sec)

Run this in your terminal (NOT in the agent session):

```bash
xurl auth apps add awm-outreach \
  --client-id YOUR_CLIENT_ID_HERE \
  --client-secret YOUR_CLIENT_SECRET_HERE
```

The values go into `~/.xurl` (YAML). You'll see "App awm-outreach registered."

## Step 3: Authenticate (2 min)

```bash
xurl auth oauth2 --app awm-outreach
```

This opens a browser for the X OAuth flow. Approve. The token is saved to `~/.xurl`.

> **If you get a `UsernameNotFound` or 403 error on `/2/users/me`** right after OAuth, re-run with your handle explicitly:
> ```bash
> xurl auth oauth2 --app awm-outreach YOUR_X_HANDLE
> ```
> This binds the token to your handle and skips the broken user lookup.

## Step 4: Set the app as default (5 sec)

```bash
xurl auth default awm-outreach
```

## Step 5: Verify (5 sec)

```bash
xurl whoami
```

You should see your X handle returned as JSON. If yes, the agent can now send DMs.

---

## Once auth is working, the agent will run

```bash
# Public announcement tweet (drafted separately in docs/TWEET_DRAFT.md)
xurl post "..."

# 4 priority DMs (in docs/PRIORITY_DMS.md)
xurl dm @virtuals_io "..."
xurl dm @EthereumFDN "..."
xurl dm @dannyorgan "..."
xurl dm @AIAgentStore "..."
```

## Notes

- **Rate limits**: X caps write actions (post, DM, like) tightly. If you hit a 429, wait 15 minutes and retry. The agent will handle this automatically.
- **DMs vs public tweets**: DMs to people you don't follow can land in "Message Requests" — that's normal. The recipient may not see it for hours.
- **Cost**: X API is paid for meaningful usage. The free tier is 100 posts/month. If you go over, buy credits at the developer console (min $5).
- **Backup plan**: If xurl auth is a hassle, you can also just open Twitter in a browser, copy-paste each DM from `docs/PRIORITY_DMS.md`, and send manually. It's 4 DMs, takes 10 minutes.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Auth errors after OAuth | Token saved to `default` app instead of your named app | Re-run `xurl auth oauth2 --app awm-outreach` and `xurl auth default awm-outreach` |
| `unauthorized_client` | App type is "Native App" in X dashboard | Change to "Web app, automated app or bot" |
| 401 on every request | Token expired or wrong default app | `xurl auth status` to verify |
| `client-forbidden` | X platform enrollment issue | Dashboard → Apps → Manage → Move to "Pay-per-use" package |

---

## Tell the agent when done

Once `xurl whoami` works, just say "xurl is set up" and the agent will:
1. Send the public announcement tweet
2. Send the 4 priority DMs in order
3. Update `docs/PRIORITY_DMS.md` tracker with sent/replied counts

If you don't want to set up xurl at all, that's fine — the 4 DMs in `docs/PRIORITY_DMS.md` are drafted for you to copy-paste into the Twitter web UI manually.
