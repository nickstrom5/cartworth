# Putting the web app live

The web app is the Node server (`server.js`, `src/`, `shared/`) and the browser app it serves
(`public/`). It is separate from the marketing site (`site/`, deployed to Cloudflare by `wrangler`)
and from the iPhone app. This page is what a host needs, and the checklist for launch day.

## What the host must provide

| Need | Why |
|---|---|
| **Exactly one instance** | Politeness to retailers (one request in flight per retailer, 700 ms apart, stop on 429) and every per-visitor limit live in the process. Two instances would double what each retailer sees and halve every limit. Scale up (a bigger machine), never out. |
| Node 22.13 or newer | `node:sqlite`. The `Dockerfile` uses `node:22-slim`. |
| A persistent disk at `BASKET_DATA_DIR` | The shared cache and price history (SQLite). Measured growth is bounded by the built-in retention; budget 1–2 GB. Losing it loses only cache and history, never anyone's data (that lives in browsers). |
| Outbound HTTPS to the retailers | Instacart, the chains' own sites, Flipp, Kroger's API, zippopotam.us and Nominatim (ZIP lookup). |
| HTTPS in front (TLS-terminating proxy or CDN) | Set `BASKET_TRUST_PROXY=1` for one hop (`BASKET_TRUST_CF=1` too if it is Cloudflare), or every visitor shares one rate-limit bucket. |
| Graceful stop | The server drains for `BASKET_SHUTDOWN_GRACE_MS` (10 s) on SIGTERM; give the platform's stop timeout at least 15 s. |
| Health check | `GET /api/health` → `{"ok":true}`. Details (store health, queues, memory of the guard) only with `X-Health-Token: $BASKET_HEALTH_TOKEN`. |

Hosts that fit: any VM or single-container service with a volume (Fly.io with one machine and a
volume, Render with a disk, Railway with a volume, a small VPS behind Caddy or nginx). Serverless
functions do not fit: the server holds long streaming searches, an in-memory politeness queue and a
SQLite file.

Environment (full list in `server-security.md`): `HOST=0.0.0.0`, `PORT`, `BASKET_DATA_DIR`,
`BASKET_TRUST_PROXY`, `BASKET_HEALTH_TOKEN`, and, once Kroger approves, `KROGER_CLIENT_ID` /
`KROGER_CLIENT_SECRET` (`kroger-launch.md`). Never set `BASKET_OFFLINE` in production.

Weekly, schedule the vacuum the live server deliberately does not run:
`node scripts/db-maintenance.js --json` (Sunday 04:17 is the documented slot).

## Fly.io, step by step (the chosen host)

`fly.toml` at the repo root holds the settings: one always-on machine in Ashburn (`iad`, a
base-price region; about $3 a month with the volume, before traffic at $0.02/GB), 512 MB,
a 3 GB volume at `/data`, the `/api/health` check and a 15 s stop. Steps 1 and 5 need the owner's
accounts; the rest are commands from the repo root.

1. **Account (owner):** `brew install flyctl`, then `fly auth login`, which opens the browser. Fly
   asks for a card; check fly.io/pricing for what one small machine and a 3 GB volume cost.
2. **App and volume:** `fly apps create cartworth` (names are global: if it is taken, pick another
   and change `app` in `fly.toml`), then `fly volumes create cartworth_data --region iad --size 3 --yes`.
3. **Health token:** `TOKEN=$(openssl rand -hex 24); echo "$TOKEN"; fly secrets set BASKET_HEALTH_TOKEN="$TOKEN"`.
   Keep the printed value: Fly never shows a secret again, and monitoring `/api/health` needs it.
   (The live deployment's value is in `~/.config/cartworth/fly-health-token` on the owner's Mac.)
4. **Deploy:** `fly deploy --ha=false` (a first deploy otherwise starts two machines, which
   breaks the one-instance rule and doubles the bill). Then `fly status` must show exactly one machine, and
   `curl https://cartworth.fly.dev/api/health` must answer `{"ok":true}`.
5. **Address (owner, in Cloudflare):** `fly certs add app.cartworth.app` prints the records Fly
   wants: an **A** record `app` → the app's shared IPv4 and an **AAAA** record `app` → its IPv6
   (`fly ips list`). Add both in Cloudflare's DNS for cartworth.app as **DNS only** (grey cloud),
   then `fly certs check app.cartworth.app` until it says Issued; Fly renews it. Proxied through
   Cloudflare instead, the server would see two proxy hops; see the note in `fly.toml`.
6. Carry on with "After deploying" below.

**Live since 28 Sep 2026:** app `cartworth` on the owner's Fly account, one machine and the
`cartworth_data` volume in `iad`, at https://app.cartworth.app (and https://cartworth.fly.dev).
The certificate is issued. `npm run smoke -- --url https://cartworth.fly.dev` and one `--live` run
passed (store directory for 60618 in 61 s, a search streamed in 4 s). It is not linked from cartworth.app until the site's `/app/` page is changed (step 4 below).

## Launch checklist

Before:
1. `npm test` passes (all suites, including axe on every screen and the production smoke test).
2. `CHROME_PATH=… NODE_USE_ENV_PROXY=1 node scripts/e2e-live.mjs` passes: every tab, desktop and
   phone, against live retailers. Run it when nothing else is asking retailers.
3. Decide the web app's address (e.g. `app.cartworth.app`) and point it at the host.
4. Update `site/app/index.html` ("not open yet") to link to it, and redeploy the site. The web app's
   footer already links back to `cartworth.app/privacy`, `/terms` and `/support`.

After deploying:
5. `npm run smoke -- --url https://<the address>` (read-only; headers, compression, refusals, health).
6. `npm run smoke -- --url https://<the address> --live` once: one real directory and one search.
7. Watch `/api/health` with the token for the first day: `stores` shows any retailer that is failing,
   `guard.shed` how often shoppers were answered with saved prices or "busy".

## What the launch review measured (24 Sep 2026)

- Lighthouse, first visit: performance 94 mobile / 100 desktop; accessibility, best practices and
  SEO 100. Page weight 263 KB.
- Load, offline (cache and saved prices only): 300 shoppers for 60 s, 535 requests/s, p95 under
  150 ms on every endpoint, peak 160 MB, no errors.
- With real retailers, the one-request-at-a-time rule is the ceiling: a new ZIP's first store
  lookup takes up to a minute, and when many shoppers need uncached prices at the same retailer at
  once, the queue beyond ~20 requests is answered with saved prices or "busy, try again" rather than
  a long wait (`BASKET_MAX_BACKLOG`).
