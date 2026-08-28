# PickILL

A live queue board for UIUC's 8 pickleball courts. Students pick a court from
the 2×4 map, join its line, and — once they reach the front — choose singles
or doubles; the app fills the rest of the match from whoever's next in that
court's line.

Built with Next.js (App Router) and a small Redis-backed API, so the queue is
shared in real time across everyone who has the page open (the client polls
the server every few seconds).

## Local development

```
npm install
npm run dev
```

Open http://localhost:3000. Without a database configured (see below) the
queue state just lives in memory for that one `next dev` process — good
enough to click around locally, but it resets on restart and won't work once
deployed (Vercel runs your API routes as separate serverless invocations with
no shared memory). A banner at the top of the page tells you when this
fallback is active.

## Deploying to Vercel

1. **Push this project to a GitHub repo.**
   ```
   git init
   git add -A
   git commit -m "Initial PickILL app"
   gh repo create pickill --private --source=. --push
   ```
   (Or create the repo on github.com and `git push` to it — whatever you're
   comfortable with.)

2. **Import it into Vercel.** Go to https://vercel.com/new, pick the GitHub
   repo, and click Deploy. Vercel auto-detects Next.js — no config needed.

3. **Add a Redis database** (this is what makes the shared queue actually
   persist across serverless invocations):
   - In the Vercel project → **Storage** tab → **Create Database** →
     choose **Redis** (an Upstash-backed integration from the Marketplace).
   - Follow the prompts to connect it to your project. Vercel will add the
     right environment variables automatically (`KV_REST_API_URL` /
     `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` / `..._TOKEN` —
     `lib/store.ts` checks for either).
   - Alternatively, create a free database directly at https://upstash.com,
     then paste its `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
     into your Vercel project's **Settings → Environment Variables**.
   - Redeploy after adding the env vars (Vercel does this automatically when
     you connect an integration; otherwise trigger a redeploy from the
     Deployments tab).

4. **Share the URL.** Everyone who opens it sees and updates the same 8
   courts — no accounts needed. Names are just typed in and remembered per
   device (`localStorage`), not a real login system, which is intentional
   for a low-stakes campus tool.

## How the queue logic works

All the rules live in `lib/logic.ts` as plain functions with no database
dependency, so they're easy to read and to unit test:

- `applyJoin` — adds a player to a court's line, or straight into a forming
  match if that court already has one short of players.
- `applyChooseType` — only the person first in line can call this; it pulls
  the next 1 (singles) or 3 (doubles) people off the queue to fill the match,
  starting it immediately if enough people were waiting, or marking it
  "forming" if not.
- `applyLeave`, `applyCancelForming`, `applyFinish` — self-explanatory.

`app/api/*/route.ts` wraps these with the HTTP layer and Redis persistence;
`app/board.tsx` is the entire UI, polling `/api/state` and posting to
`/api/action`.

## Notes / assumptions

- Courts are numbered 1–4 on the top row, 5–8 on the bottom row. Adjust the
  map in `app/board.tsx` if your facility's signage differs.
- There's no auth — anyone with the link can act as any "player" by typing a
  name. Fine for a trust-based campus tool; not something to put real
  accounts or payments behind.
