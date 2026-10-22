# Cartworth

Grocery price comparison for anywhere in the US. Enter a ZIP code and Cartworth finds the chains near
you, prices the same item at each one, compares them **per unit** and labels where every price came
from. It also shows the week's ads.

- **Web app:** [app.cartworth.app](https://app.cartworth.app)
- **Website:** [cartworth.app](https://cartworth.app)
- **iPhone and iPad:** native SwiftUI app (iOS 17+), in `ios/`

## What's in this repo

| Path | What it is |
| --- | --- |
| `server.js`, `src/` | Node server: a stateless price proxy with a SQLite cache. No accounts, sessions or per-visitor data. |
| `src/adapters/` | One module per price source: weekly ads, store-level search and nearest-store lookup |
| `shared/` | Pure logic shared by the server and the browser app: unit pricing, product matching, deal terms, seasonal items |
| `public/` | The browser app: plain JavaScript, no framework or build step. Each visitor's ZIP, stores and lists stay in their own browser. |
| `ios/` | The SwiftUI app (XcodeGen `project.yml`, SwiftData, StoreKit 2), with unit and UI tests |
| `site/` | The marketing site: hand-written HTML and CSS on Cloudflare. See [`site/README.md`](site/README.md). |
| `design/sprout/` | The Sprout design system: tokens, components and a contrast table for light and dark |
| `test/` | 53 Node test files: pricing, matching, accessibility (axe), security and tenant isolation |
| `scripts/` | Smoke and load tests, price and catalog audits, the nationwide price sampler and a daily price tracker |
| `ops/` | Deployment, server hardening and coverage sweeps |
| `marketing/` | App Store listing, screenshots and launch checklists |

## How prices are found

Every price is labeled with its source and whether it's a shelf price or a weekly-ad price.

| Source | Used for |
| --- | --- |
| Flipp | Weekly ads for every chain near a ZIP |
| Instacart storefronts | Shelf prices for ALDI, Woodman's and other chains sold through Instacart |
| Kroger Public API | Exact store prices for Mariano's (optional; uses your own free developer keys) |
| Whole Foods Market | Store-level search and the weekly sales flyer |
| Trader Joe's | Nearest store and product search |

All requests are rate-limited per host, one or two at a time with a gap between them (700 ms by default). A source that
answers "too many requests" is left alone until its wait is over (see `src/http.js` and
`test/qa-http-politeness.test.js`).

## Run it

Needs Node 22.13 or later (it uses the built-in `node:sqlite`).

```bash
npm start        # http://localhost:4747
npm run dev      # restarts on changes to server.js, src/ and shared/
npm test         # the Node test suite
npm run smoke    # end-to-end checks against a running server
```

There are no npm dependencies to install. Configuration is all environment variables, listed in
[`ops/server-security.md`](ops/server-security.md).

### iOS

```bash
cd ios
xcodegen generate
open Cartworth.xcodeproj
```

## Deploying

CI (`.github/workflows/ci.yml`) runs the tests on every pull request and on `main`. On `main` it also deploys the web app to
Fly.io and runs the smoke test against app.cartworth.app. The marketing site in `site/` deploys
separately to Cloudflare. Steps: [`ops/deploy-web.md`](ops/deploy-web.md).
