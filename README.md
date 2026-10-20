# omarnabi.com

Personal site with a live layer: visitors see each other's cursors, reactions, and chat; Omar sees who's here, where they're from, and what they did, and gets phone alerts for the moments that matter.

Everything runs as **one Cloudflare Worker** on the free plan:

| Piece | What it does |
| --- | --- |
| repo root (`index.html`, `js/`, …) | The site (static files served by Workers Static Assets) |
| `src/worker.js` → `Lobby` Durable Object | Live room over WebSockets (hibernating, so idle time costs nothing), Beat my AI leaderboard, visit history, phone alerts. Data lives in the object's built-in SQLite. |
| `/ingest/*` | First-party proxy for PostHog analytics, so ad blockers don't drop it |
| `js/live.js` | Browser client for the live room |
| `js/analytics.js` | PostHog loader (off when no key, for you, and for Do Not Track) |

## What you get

**Visitors see:** a "2 here now" pill, other people's cursors with a nickname and city, emoji reactions, `/` cursor chat, a ticker of what people are doing ("Swift Falcon won a series 4-2"), "Omar is here · wave" when you're online, and a real leaderboard for Beat my AI.

**You see** (only on devices with your owner key): the **Live now** panel with each visitor's tile, city and country, company network when there is one, device, referrer (LinkedIn, HN, a `?ref=` tag), and their actions this visit; **Recent visits** with the same details for the last 2,000 visits; a **Remove for 24h** button for trolls. Your own visits are never logged or counted in analytics.

**Your phone buzzes** when someone copies your email, builds a plan, runs `sudo hire omar`, beats CR-AI, or waves at you while you're offline. Optional: every new visitor (`NOTIFY_JOINS`).

## Deploy (about 20 minutes)

1. **Cloudflare account.** Free plan is enough. Install Node 20+, then:
   ```sh
   npm install
   npx wrangler login
   ```
2. **Secrets.**
   ```sh
   npx wrangler secret put OWNER_KEY    # paste a long random string, e.g. from: openssl rand -hex 24
   npx wrangler secret put NTFY_TOPIC   # a long random name, e.g. omar-site-7f3k2q9x
   ```
3. **Phone alerts.** Install the free **ntfy** app (iOS/Android), tap +, and subscribe to the same topic name. Anyone who knows the topic can read it, so keep it random.
4. **Deploy.**
   ```sh
   npm run deploy
   ```
   You'll get a `*.workers.dev` URL. Open it as `https://…workers.dev/#owner=YOUR_OWNER_KEY` once on each device you use; the key is saved in that browser and removed from the address bar. `#owner=off` forgets it.
5. **Your domain.** Add `omarnabi.com` to Cloudflare (Websites → Add a site, then switch your registrar's nameservers to the two Cloudflare gives you). Then uncomment the `routes` block in `wrangler.jsonc` and deploy again. Cloudflare issues the certificate automatically. For www → apex, add a Redirect Rule in the dashboard.
6. **Analytics (optional).** Create a free PostHog project, copy the project API key (`phc_…`) into `js/config.js`, and deploy. Turn on Session Replay in PostHog if you want to watch recordings of visits.
7. **Auto-deploy (optional).** Push this folder to a GitHub repo, then add two repo secrets: `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Every push to `main` deploys.

## Before launch

- Replace the placeholder email `hello@omarnabi.com` in `index.html` (search `emailAddr`).
- Read `privacy.html` and adjust anything that doesn't match your choices.
- `SHARE_CITY` in `wrangler.jsonc`: `"1"` shows visitors' cities to each other, `"0"` shows them only to you.

## Develop and test

```sh
cp .dev.vars.example .dev.vars   # once; local owner key is dev-owner-key
npm run dev          # http://localhost:8787/#owner=dev-owner-key
npm test             # starts a throwaway server and runs the two-browser end-to-end checks
```
Tests use Playwright; run `npx playwright install chromium` once.

Useful during launch: `npm run tail` streams live logs from production.

## How company names work

Cloudflare tags each connection with the network it came from (`asOrganization`). Visitors on an office network or VPN often show the company ("Acme Corp"); people at home or on mobile show their ISP ("Comcast", "T-Mobile"). It's a hint, not an identity. The site never stores IP addresses: they're hashed with a salt and used only for rate limits and removals.

## Costs

Free-plan limits are far above a personal site's traffic: 100,000 Worker requests a day, and Durable Objects bill WebSocket messages at 20 messages per request with hibernation. Cursor updates are throttled to about 16 a second per visitor and pings are answered without waking the object.

## Files

```
src/worker.js            Worker router + Lobby Durable Object
index.html        the site
js/live.js        live room client (window.siteLive)
js/analytics.js   PostHog loader
js/config.js      public settings (PostHog key)
privacy.html      plain-language privacy page
og.png            link preview image
scripts/build-index.py   converted the prototype page into index.html (kept for reference)
test/                    end-to-end checks
```
