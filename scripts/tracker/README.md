# Cartworth price tracker

A daily capture of grocery prices at every priceable store within 25 miles of four ZIPs
(60618 Chicago, 60148 Lombard, 53211 Milwaukee, 53142 Kenosha), for the terms in
[`terms.txt`](terms.txt), kept as history for trend stories and mirrored to Google Sheets through
Google Drive.

It prices nothing itself. It calls the product's own pipeline — `src/directory.js` to find the
stores near a ZIP, `src/search.js` `searchStore` / `searchAds` to price a term — and the product's
own `shared/compare.js` `bestPerStore` to pick each store's answer, so every pricing fix in the
product reaches the tracker's next run.

```
capture.js   one run = one daily capture              stats.js    social-worthy stats, honestly
core.js      the run loop (deps injected)             rows.js     results -> rows (pure)
limiter.js   per-host politeness, under the product   columns.js  every column contract
isolation.js never opens <repo>/data/basket.db        version.js  parser_version fingerprint
trackerdb.js tracker.db schema                        exports.js  CSVs, local-first, then Drive
run-daily.sh launchd entry point                      install.sh / uninstall.sh
```

## Run it

```sh
# the plan, no network
node --disable-warning=ExperimentalWarning scripts/tracker/capture.js --dry-run
# one term, one ZIP (about 3 minutes the first time: the store lookup is cached for 3 days)
node --disable-warning=ExperimentalWarning scripts/tracker/capture.js --zips 60618 --terms butter
# the full capture (2-3 hours; what launchd runs at 06:30 — see "How long a run takes")
node --disable-warning=ExperimentalWarning scripts/tracker/capture.js
# stats
node --disable-warning=ExperimentalWarning scripts/tracker/stats.js            # everything
node --disable-warning=ExperimentalWarning scripts/tracker/stats.js rows --term butter --store jewel
```

Data: `~/Library/Application Support/Cartworth/tracker/` (`tracker.db`, `product-cache.db`,
`exports/`, `runs/<run>.json`). Drive: `My Drive/Cartworth/price-tracker/{daily,incoming,imported,archive}`.
Log (launchd): `~/Library/Logs/Cartworth/tracker.log`.

## What a row is

**Ground truth** — what the retailer showed: product, brand, size as listed, price (per package,
or per lb when `price_per` = lb), regular price, sale flag, promo text, card/member price and its
label, basis, store, store location id, ZIP, captured-at. **Derived** — unit price and unit,
relevance, implausible / size-conflict / low-relevance flags — all stamped with `parser_version`, a
fingerprint of the parser files, so history can be recomputed after a parser fix and a unit-price
"change" caused by a parser change is never read as a real one. The retailer's product id and
store location id let the same SKU on the same shelf be followed day to day.

**Basis**: `shelf`, `online-instacart` (the store's Instacart listing — at or above its shelf, and
not the store's own app: Jewel's Instacart listing is not the Jewel app), `national` (Walmart's
chain-wide listing, no local store), `weekly-ad` (the circular; detail only, never in the Sheet).

`captured_at` is when the store answered a fresh (cache-bypassing) search. Weekly-ad rows are the
exception: the product caches a Flipp ad search for an hour and offers no bypass, so a second run
within the hour re-reads the same ad (ads run for a week, so the content is still current).

Nothing is excluded silently. Per term per store the top 5 by relevance are kept, plus the store's
best comparable item if it ranked lower; flagged rows among them are kept and marked. Every
search attempt is recorded in `captures` — including failures, a 429-closed host, and a stale
cached answer the product offered after a failed live search, which is **refused** (not today's
price) rather than recorded.

## Politeness

`limiter.js` replaces `globalThis.fetch` — the one road out of `src/http.js` — for the whole run.
Per host: one request in flight (including the body), at least 700 ms from the end of one response
to the start of the next, HTTP 429 closes the host for the rest of the run, three 403s in a row
mark it blocked. It never evades anything: no user-agent changes, no challenge solving. Every run
reports requests per host and the smallest gap it actually left (`runs/<run>.json`, the log, and
the `_run` row of `daily_summary`).

## How long a run takes (measured, not intended)

The 23 Sep smoke run (butter, 60618) found 19 priceable stores, 15 of them on www.instacart.com,
and made 135 requests in 2.8 minutes with a smallest idle gap of 700 ms and never two in flight to
one host. An Instacart store search is 2 requests (SearchResultsPlacements, then Items) and took
3.7-6.3 s each (mean 4.6 s): Instacart answers in about 1.6 s and the rule adds 0.7 s. One term at
60618 took 69 s. The whole capture — 40 terms x 4 ZIPs, roughly 45-55 Instacart store-ZIPs — is
therefore about 3,500-4,400 requests to www.instacart.com and 2-2.8 hours, not 30-40 minutes. The
other hosts (ALDI, Woodman's, Whole Foods, Trader Joe's, Flipp) run in parallel lanes and finish
first. Only fewer Instacart searches make it shorter (fewer terms, fewer stores, or staples every
other day); the politeness rule is not a knob.

## Owner steps

1. Sheet: follow [`marketing/sheets/SETUP.md`](../../marketing/sheets/SETUP.md).
2. Daily job: `scripts/tracker/install.sh` — only once you are happy for the Mac to send about
   4,000-5,000 polite requests to grocery sites every morning (2-3 hours from 06:30).
   `uninstall.sh` removes it.
