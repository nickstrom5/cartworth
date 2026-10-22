# cartworth.app: the public marketing site

Four hand-written HTML pages plus one stylesheet, in the Sprout design (design/sprout/). No build step,
no framework, no bundler, no package.json, no external JavaScript libraries, no analytics and no
trackers. The two Sprout fonts (DM Sans, Baloo 2; SIL OFL, licences in fonts/) are self-hosted in
fonts/, because the CSP allows nothing off-site. What is
in this folder is exactly what ships.

To look at it locally, serve the folder rather than opening the files directly, because the
cross-page links are root-relative (`/`, `/#pricing`) so that they are correct once deployed:

```sh
cd site && python3 -m http.server 8080
# then open http://localhost:8080/
```

`index.html` on its own opens fine from the filesystem; only the links between pages need the
server.

```
site/
  index.html      the landing page
  privacy.html    required: linked from the iPhone app's Settings and its paywall
  terms.html      required: linked from the iPhone app's Settings and its paywall
  support.html    required: linked from Settings, and it is the App Store Support URL
  styles.css      the only stylesheet, shared by all four pages
  appstore.js     one constant: the App Store URL. See "Before you launch the app" below.
  robots.txt
  sitemap.xml
  img/            empty except for its own README, which lists the images the site expects
```

The three legal and support pages are not optional. `ios/App/UI/Settings/SettingsView.swift` links
to `https://cartworth.app/privacy`, `/terms` and `/support`, and `PaywallView.swift` links to
`/terms` and `/privacy`. If those URLs do not resolve, the App Store submission fails on guideline
3.1.2, and shipped builds have dead links in the purchase flow.

---

## 1. Before you deploy: the fill-in checklist

Six things. Search the folder for `[OWNER:` and you will find most of them.

| # | What | Where | Why it matters |
|---|---|---|---|
| 1 | **Support email address** | `support.html` (the "Get in touch" table), `terms.html` (Contact) | This is the only way anyone can reach you. App Review checks that the Support URL leads somewhere real. |
| 2 | **Response time you can actually meet** | `support.html` | Say "within two business days" only if that is true. An unmet promise is worse than no promise. |
| 3 | **Privacy contact email** | `privacy.html` (Contact) | Can be the same address as support. |
| 4 | **Governing law: your US state** | `terms.html` (Governing law) | Currently a placeholder. Pick the state you actually operate from. |
| 5 | **Legal entity name and address** | `terms.html` (Contact) | Use the name exactly as registered, if you incorporate. It should match the copyright line you put in App Store Connect. |
| 6 | **The images** | `img/` | See `img/README.md`. The site is designed to look finished without them, but the phone screenshots are the strongest thing on the page. |

Placeholders render as an obvious amber monospace chip, so nothing slips through unnoticed. Grep
before you deploy:

```sh
grep -rn "\[OWNER:" site
```

That grep must return nothing before the site goes live.

---

## 2. Before you launch the app: the App Store URL

The App Store listing does not exist yet, so the site never pretends it does. Every App Store
button reads **"Coming to the App Store"**, is not a live link, and falls back to the pricing
section, where the plans are explained. That is deliberate and it is the honest state.

The URL lives in exactly one place: the `APP_STORE_URL` constant at the top of `appstore.js`. It is
currently an empty string. When the app is approved:

```js
var APP_STORE_URL = 'https://apps.apple.com/us/app/cartworth/id0000000000';
```

Redeploy, and every App Store button on every page becomes a live link and relabels itself to
"Download on the App Store". Nothing else changes.

If you would rather not depend on JavaScript for that link, you can instead edit each element
marked `data-appstore` in the HTML directly (set its `href` and change the text inside the
`data-appstore-label` span), then delete `appstore.js` and its `<script>` tags. There are three such
buttons in `index.html` and none on the other pages.

Two related notes:

- The site does **not** currently use Apple's official "Download on the App Store" badge artwork,
  because the listing does not exist. When you add it, use the current official badge from Apple's
  marketing resources, unmodified, at or above Apple's minimum size and clear space. Do not recolour
  or redraw it.
- `SoftwareApplication` JSON-LD on the landing page deliberately omits `downloadUrl` and
  `availability` while the app is unreleased. Add `"downloadUrl"` alongside the offers once it is
  live.

---

## 3. The `/app/` link: read this before you deploy the web app

Every page has an "Open the free web app" button pointing at `/app/`. That path is where the
existing Node web app (`server.js` in the repo root) is expected to live, alongside these static
pages on the same domain.

**The web app as it stands is a single-user, local-first application and must not be put on a public
URL as-is.** Specifically:

- `src/settings.js` keeps one global settings record, so the ZIP code, search radius and store
  selection are shared by every visitor. The first person to set a ZIP sets it for everyone.
- `src/db.js` writes one SQLite file containing one shopping list, one watchlist and one price
  history, again shared by everyone.
- `server.js` binds to `127.0.0.1` by default, and its CORS check assumes localhost origins.
- The Kroger API credentials, if set, live in that same shared settings record.

Before `cartworth.app/app/` can serve the public you need per-visitor separation (a session cookie
keyed to its own settings and data rows, at minimum), a real bind address behind a reverse proxy, a
rate limit, and a fresh look at the CORS check. That is application work, not site work, and it is
out of scope for this folder. Until it is done, either:

- **point `/app/` somewhere honest** (a "coming soon" page, or a short page explaining you can run
  it yourself from the repo), or
- **remove the web app buttons**, which means editing the `/app/` links and the free-web-vs-app
  comparison table in `index.html`, plus the "Website, $0" plan card.

Do not ship the marketing claims about a free website while the free website is not actually
servable. They are load-bearing on the landing page, the comparison table and the pricing section.

If the web app ends up on a different host or path, search and replace `/app/` across the four HTML
files. It appears in the header, the hero, the app section, the pricing card, the closing call to
action and the footer of each page.

---

## 4. Deploying

**The domain is registered on Cloudflare (cartworth.app), so Cloudflare Pages is the path of least
resistance: same account, DNS already there, and it reads the `_redirects` and `_headers` files that
are already committed here.** Pages serves `privacy.html` at `/privacy` on its own; `_redirects` must
not also rewrite `/privacy` to `/privacy.html`, which loops (see the note in that file). Check with
`npx wrangler pages dev site` before changing it.

### Cloudflare Workers (how cartworth.app is deployed)

The `cartworth` Worker in the Cloudflare account builds from `main` with `npx wrangler deploy`.
`/wrangler.jsonc` at the repo root publishes this folder, and only this folder, as static assets;
`site/.assetsignore` keeps this README, `img/README.md`, `tools/` and the other hosts' configs out.
Check locally with `npx wrangler dev` from the repo root before changing either file.

### Cloudflare Pages, start to finish

1. Cloudflare dashboard, **Compute (Workers & Pages)** then **Create** then **Pages**. Connect the
   git repo, or use **Direct Upload** and drag this `site/` folder in if the repo is not on GitHub.
2. Build settings: framework preset **None**, **no build command**, and the output directory is
   this folder (`site` if you connected the whole repo, `/` if you uploaded just this folder). There
   is no build step by design. Production branch: `main`.
3. **Custom domains** then add `cartworth.app` and `www.cartworth.app`. Because the domain is already
   in this Cloudflare account, the DNS records are created for you.
4. Confirm after it is live:
   - `https://cartworth.app/privacy`, `/terms` and `/support` all return 200 with no `.html`.
     **The shipping iOS app hardcodes these three paths** (see `ios/App/UI/Settings/SettingsView.swift`
     and `PaywallView.swift`). If they 404, App Review hits dead links inside the purchase flow,
     which is a 3.1.2 rejection.
   - The security headers from `_headers` are present: `curl -sI https://cartworth.app | grep -i
     content-security-policy`.

### The support mailbox

`support@cartworth.app` is published on all three legal pages and goes in App Store Connect's
Support URL field. **App Review opens it, and a bouncing address is a rejection.** Cloudflare
**Email Routing** (Email then Email Routing in the dashboard) forwards it to any inbox for free:
add the route, verify the destination address, and let Cloudflare add the MX and SPF records.
Send yourself a test message before you submit.

### Other hosts

Configs for the alternatives are committed too, so nothing is locked in: `_redirects` and `_headers`
(Cloudflare Pages, Netlify), `netlify.toml` (Netlify), `vercel.json` (Vercel). Keep them in sync when
you change one. Avoid GitHub Pages: it has no rewrite support, so the three extensionless legal URLs
silently 404.

It is four static files. Any static host works: Netlify, Cloudflare Pages, Vercel, GitHub Pages, S3
plus CloudFront, or nginx on a box you already own. Upload the contents of this folder as the site
root.

### The one requirement: clean URLs

The iPhone app links to `https://cartworth.app/privacy`, `/terms` and `/support`, with no `.html`.
The canonical tags and `sitemap.xml` use those same extensionless URLs. So the host **must** serve
`privacy.html` at `/privacy`, and so on.

Most hosts do this for you:

- **Netlify** and **Cloudflare Pages**: on by default. `/privacy` serves `privacy.html`, and
  `/privacy.html` redirects to `/privacy`. Nothing to configure.
- **Vercel**: set `"cleanUrls": true` in `vercel.json`.
- **GitHub Pages**: not supported. Either restructure to `privacy/index.html`, `terms/index.html`,
  `support/index.html`, or use a different host.
- **nginx**: add `try_files $uri $uri.html $uri/ =404;` to the location block.
- **Apache**: `Options +MultiViews`, or an explicit rewrite.
- **S3 plus CloudFront**: a CloudFront Function or Lambda@Edge that appends `.html` to
  extensionless requests.

Whatever you use, verify all three before submitting to App Review:

```sh
curl -sI https://cartworth.app/privacy | head -1
curl -sI https://cartworth.app/terms   | head -1
curl -sI https://cartworth.app/support | head -1
```

All three must be `200`, or a `301` to a URL that is `200`.

### Other host settings worth getting right

- **HTTPS, with HTTP redirected to it.** Non-negotiable; the app links to `https://` URLs.
- **One canonical hostname.** Pick `cartworth.app` or `www.cartworth.app` and 301 the other to it.
  The canonical tags in these files all use the bare `cartworth.app`, so if you prefer `www`, update
  every `<link rel="canonical">`, every `og:url`, `sitemap.xml` and `robots.txt` to match.
- **Caching.** `styles.css` and the images are safe to cache hard; the HTML should be revalidated so
  a legal change goes live immediately. Something like `Cache-Control: public, max-age=3600` on the
  HTML and `max-age=31536000, immutable` on the assets. If you set a long cache on `styles.css`,
  remember to bust it when you edit the file, since there is no build step to fingerprint it.
- **Compression.** Turn on gzip or brotli. The whole site is text.
- **Security headers**, all easy here because the site loads nothing from anywhere else:
  ```
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  ```
  That CSP holds as written today because there is no inline script and no inline `<style>` block.
  The one inline attribute in use is `onerror` on the screenshot `<img>` tags, which is an event
  handler attribute and is blocked by that CSP. The consequence is cosmetic and only matters while
  an image file is missing: with the CSP on, a missing screenshot shows the browser's own
  broken-image state inside the frame instead of the clean grey placeholder. Once the images in
  `img/` exist, there is no difference. If you want both, add the images first.

### After deploying

1. Submit `https://cartworth.app/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
2. Run the landing page through the Rich Results Test and validate the JSON-LD.
3. Check the social card with Facebook's sharing debugger and X's card validator. Both need
   `img/og-cartworth.png` to exist.
4. Open every page at 375px wide and confirm there is no horizontal scroll.
5. Toggle your OS between light and dark and look at each page in both.

---

## 5. What is on the site, and why it says what it says

Everything on these pages was written against the shipping source, not against a feature wish list.
The claims that matter and where they came from:

- **"More than seventy chains."** `ios/App/Sources/RetailerCatalog.swift` has 75 chains;
  `shared/catalog.js`, which the web app uses, has 119. "More than seventy" is true of both, which
  is why the number is phrased that way. If you edit either catalogue, re-check the phrasing.
- **Free tier: three searches a day, one price watch.** `UsageMeter.freeSearchesPerDay` and
  `UsageMeter.freeWatchItems` in `ios/App/Services/Entitlements.swift`.
- **Pricing: $3.99 monthly, $19.99 yearly, $29.99 lifetime.** `Products.storekit` and
  `PaywallView.placeholderPrice`. The lifetime product is a non-consumable, which is why the site
  and the terms both call it a one-time purchase rather than a plan.
- **Which features are Pro.** Taken from the `pro.isPro` checks in the iOS UI: next week's ads,
  trip planning, price history, recipe import, alerts and favorite brands are gated. Seasonal
  guides are not gated, and the comparison table says so.
- **What the free website does.** Taken from the routes in `server.js`: search, deals for this week
  and next, watches, list, list optimisation and history are all ungated, which is why the site
  claims the website is fully featured rather than a demo. The website has no browser geolocation,
  which is why "use your current location" is listed as an app-only row.
- **Privacy claims.** Checked against `ios/App/Resources/PrivacyInfo.xcprivacy` (tracking false, no
  tracking domains, no collected data types), the absence of any Swift package dependency in
  `ios/project.yml`, `Geo.swift` (when-in-use only, kilometre accuracy), `StoredModels.swift` (plain
  SwiftData, no CloudKit) and `RecipeImporter.swift` (Vision on device). The privacy page
  deliberately says that maps and geocoding go through Apple's own services, and that the web
  version's price requests come from a server rather than from your browser, because both are true
  and omitting them would make the "nothing leaves your device" line misleading.

### Compliance rules that are baked in, and must stay baked in

From `marketing/APP_STORE_LISTING.md` and `marketing/SOCIAL_MEDIA_BRIEF.md`:

1. **No retailer logos, wordmarks or branding**, and nothing that implies a partnership. The site
   uses invented "Store A / Store B / Store C" names in its one price illustration for exactly this
   reason, and carries an explicit non-affiliation statement in the footer of all four pages.
2. **No guaranteed-savings claims.** There is no dollar figure and no percentage anywhere on the
   site, and the FAQ answers "how much will it save me?" by saying nobody can honestly tell you.
   Keep it that way. It is both an advertising-substantiation risk and a credibility risk.
3. **Every example price carries a visible label.** The hero illustration says "Illustration, not a
   screenshot. Example prices, September 2026. Varies by location." If you change those numbers, or
   reuse the block elsewhere, re-date the label. If more than a few weeks pass, re-date it anyway.
4. **No invented ratings or reviews.** The JSON-LD has no `aggregateRating` and no `review` node,
   on purpose. Fabricated ratings are dishonest and are a Google structured-data penalty. Do not add
   them until you have real App Store ratings, and then only real numbers.
5. **Shelf versus online prices stay labeled.** It is the product's main honesty claim and it is
   repeated on the landing page, the support page and in the terms.

---

## 6. Editing it later

- **Design tokens** at the top of `styles.css` are copied verbatim from the web app's
  `public/app.css`: same palette, same radii, same shadows, same type stack, both themes designed
  rather than auto-inverted. If you restyle the app, copy the new token block over so the two keep
  matching.
- **Dark mode** is `prefers-color-scheme` only. There is no theme toggle and no stored preference,
  so nothing to flash on first paint.
- **Adding a page** means: copy the header and footer from `support.html`, give it a unique
  `<title>` and meta description, set `<link rel="canonical">`, update the Open Graph and Twitter
  tags, add JSON-LD, and add it to `sitemap.xml`. All four of those are per-page and none of them
  are generated.
- **The FAQ JSON-LD must match the visible text.** Google requires the answer to be on the page. If
  you reword a question or an answer in `index.html` or `support.html`, reword the matching entry in
  that page's `FAQPage` block at the bottom of the file.
- **Accessibility**: skip link, one `<h1>` per page, headings in order, real `<table>` markup with
  scope attributes, `<details>` accordions that work without JavaScript, alt text on every image,
  visible focus rings, and `prefers-reduced-motion` respected. If you add anything, keep all of it.
- **Do not add a font from a font CDN, an analytics snippet or a chat widget** without revisiting
  the privacy policy, which currently states plainly that this site loads none of those. The policy
  is a promise, not a description of a default.
