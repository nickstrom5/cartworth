# Nationwide staple-price sampler

Prices a short list of grocery staples in every US state and turns them into
`basket/stats/stats.json` — the file the iPhone app reads for loading-screen facts like:

> The cheapest state for milk this week is Texas — $2.29/gal at ALDI in Houston.

It reuses the app's existing adapters (`src/adapters/instacart.js`, `wholefoods.js`,
`traderjoes.js`) and comparison helpers (`shared/compare.js`, `shared/match.js`,
`shared/units.js`). Nothing under `src/` or `shared/` is modified.

## What it samples

| | |
|---|---|
| **Where** | 50 states + DC, 1–2 ZIPs each (largest metro first) — `states.js` |
| **Stores per ZIP** | Target → ALDI → Walmart → 1–2 regional chains — `retailers.js` |
| **What** | 14 staples with strict comparability rules — `staples.js` |

Per ZIP the sampler always *tries* Target, ALDI and Walmart, then the regional chains listed for
that ZIP (Kroger/Ralphs/Fry's…, Safeway/Albertsons/Jewel-Osco…, Publix, H-E-B, Wegmans, Hy-Vee,
Meijer, Stop & Shop, Giant, Food Lion, Harris Teeter, Rouses, Schnucks, Cub, Foodland, …). A chain
is skipped unless Instacart resolves a **real store within 40 miles** of the ZIP — Instacart
otherwise falls back to a "canonical" store on the other side of the country (asking for a Walmart
near Houston returns one in Antioch, California), which would silently poison the data.

### Price basis — read this before quoting numbers

| Basis | Source | Meaning |
|---|---|---|
| `shelf` | ALDI's in-store shop on `www.aldi.us`, Walmart on Instacart ("No markups"), Whole Foods, Trader Joe's | the price you'd pay in the store |
| `online` | every other Instacart marketplace chain | Instacart's listed price, labelled by Instacart as *"Prices vary from in-store"* — typically **at or above** the shelf price |

Two things the data made clear and the app copy should respect:

* **Walmart is not nationwide on Instacart.** It resolved at only ~11 of 83 sampled ZIPs
  (parts of CA, CT, DE, DC, MD, MI, NJ, NY, OK, PA). It is still the best shelf-price baseline where
  it exists, but it cannot be the cross-state constant.
* **Target is the only chain available at all 51 jurisdictions**, so it is used as the like-for-like
  baseline (`item.baseline` in `stats.json`) — one chain, one pricing policy, 51 states. Its prices
  are `online`, so treat them as a consistent index rather than as shelf prices.

Facts that compare two states only ever compare prices measured the same way (shelf vs shelf, or
Target vs Target), so an Instacart markup can never be reported as a regional price difference.

## Running it

Always run with `--disable-warning=ExperimentalWarning` (node:sqlite is noisy), and always with
`BASKET_DATA_DIR` pointed somewhere scratch so the sampler's cache never mixes with the app's own
data directory. `env.js` defaults it to `/tmp/basket-sampler` if you forget.

```bash
cd basket

# See the plan; makes no requests
node --disable-warning=ExperimentalWarning scripts/sampler/run.js --dry-run

# Partial run: a few states, all staples (~4 min per ZIP)
BASKET_DATA_DIR=/tmp/basket-sampler \
node --disable-warning=ExperimentalWarning scripts/sampler/run.js --states IL,TX,CA,NY,FL,MT

# Full weekly run: 51 states, 83 ZIPs
BASKET_DATA_DIR=/tmp/basket-sampler \
node --disable-warning=ExperimentalWarning scripts/sampler/run.js

# Continue an interrupted / rate-limited run (same week, same options)
BASKET_DATA_DIR=/tmp/basket-sampler \
node --disable-warning=ExperimentalWarning scripts/sampler/run.js --resume

# Rebuild stats.json from the raw samples — no network at all
node --disable-warning=ExperimentalWarning scripts/sampler/aggregate.js
```

### Options

| Flag | Meaning |
|---|---|
| `--states IL,TX` | only these states (default: all 51) |
| `--items milk,eggs` | only these staples (ids from `staples.js`) |
| `--chains aldi,target` | only these chains |
| `--zips-per-state N` | first N ZIPs per state — `1` roughly halves a full run |
| `--max-stores N` | at most N chains per ZIP, in order Target, ALDI, Walmart, regionals — so a capped run keeps the nationwide baseline |
| `--extras` | also price Whole Foods and Trader Joe's (shelf prices, limited footprint) |
| `--resume` | continue the run in `stats/sampler-progress.json` |
| `--dry-run` | print the plan only |
| `--shops-only` | resolve and print the store for every ZIP+chain, run no searches |
| `--delay MS` | pause between store searches (default 1000) |
| `--max-miles N` | reject stores farther than this from the ZIP (default 40) |
| `--no-aggregate` | don't rebuild `stats.json` at the end |
| `--quiet` | one line per store instead of per staple |

### Runtime

About **3.5 s per search** plus the 1 s politeness delay, strictly one request at a time.

| Scope | Searches | Wall clock |
|---|---|---|
| One ZIP, 14 staples, 4 chains | ~56 | ~4 min |
| 6 states, both ZIPs (validation run) | ~640 | ~45 min |
| **Full 51 states, 83 ZIPs** | ~4,400 | **~5–6 hours** |
| Full run, `--zips-per-state 1` | ~2,700 | ~3.5 hours |

The full run is meant to be left alone overnight, once a week. It checkpoints after **every**
search, so `--resume` costs nothing if it's interrupted.

### Politeness

* strictly sequential requests, ~1 s between searches (an empty result is retried once — a
  store that answers every other query with 40 results and one with 0 is having a hiccup)
* guest sessions, store lookups and the HTTP cache are reused (`BASKET_DATA_DIR`)
* HTTP 429 → backs off 30 s, 60 s, 120 s; after 3 in a row it saves progress and exits with a
  resume hint (exit code 2)
* 8 hard errors in a row also stops the run cleanly

### Weekly schedule (optional — nothing is installed for you)

Save as `~/Library/LaunchAgents/com.basket.sampler.plist`, then
`launchctl load ~/Library/LaunchAgents/com.basket.sampler.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.basket.sampler</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>/Users/YOU/Developer/claudecode/basket/scripts/sampler/run.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOU/Developer/claudecode/basket</string>
  <key>EnvironmentVariables</key>
  <dict><key>BASKET_DATA_DIR</key><string>/tmp/basket-sampler</string></dict>
  <!-- Sundays at 02:00 -->
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/basket-sampler/sampler.log</string>
  <key>StandardErrorPath</key><string>/tmp/basket-sampler/sampler.err</string>
</dict>
</plist>
```

A laptop that's asleep at 02:00 won't run it (`launchd` fires the job late on wake, which is fine
for weekly stats). Add a second `--resume` job an hour later if you want belt and braces.

## Output files (`basket/stats/`)

| File | What |
|---|---|
| `stats.json` | the app's file: per-staple national/state aggregates + facts (24 by default, `aggregate.js --facts N`; fewer when the data is too thin to support them) |
| `samples.jsonl` | raw samples, one line per store+staple, **including every plausible candidate** |
| `store-picks.json` | the chosen product at every store — use this to spot-check matching |
| `sampler-progress.json` | checkpoint: options, resolved stores, completed tasks, counts |
| `aggregate-log.json` | discarded outliers, no-match combos, dropped thin states, self-check warnings |
| `archive/samples-YYYY-MM-DD.jsonl.gz` | previous weeks, moved aside (gzipped) when a new run starts |

A full run's `samples.jsonl` is roughly 45 MB because it keeps the candidate lists that make
re-matching possible; archives compress to about a tenth of that. `stats.json` runs a few hundred
KB for all 51 states — if the app only wants loading-screen copy, ship the `facts` array on its own
(a few KB) and keep the rest server-side.

### `stats.json` shape

```jsonc
{
  "version": 1,
  "generatedAt": "2026-09-22T19:40:00.000Z",
  "weekOf": "2026-09-21",                  // Monday of the run's week
  "coverage": { "states": 6, "zips": 12, "stores": 46, "shelfStores": 14, "priced": 560, "noMatch": 21, "errors": 0, "invariantFailures": 0 },
  "notes": { "basis": "…", "prices": "…", "min": "…", "states": "…" },
  "items": [{
    "id": "milk",
    "label": "Milk, whole, 1 gallon",
    "noun": "milk",                        // for fact sentences
    "plural": false,                       // "milk costs" vs "bananas cost"
    "unit": "gal", "unitText": "/gal",
    "national": {
      "median": 3.49, "min": 2.29, "max": 6.19, "stores": 120, "states": 51,
      "minState": "TX", "minStore": "Walmart", "minCity": "Houston", "minBasis": "shelf",
      "maxState": "HI", "maxStore": "Safeway", "maxCity": "Honolulu", "maxBasis": "online",
      "shelfStores": 44, "shelfMin": 2.29, "shelfMinState": "TX", "shelfMinStore": "Walmart",
      "shelfMinCity": "Houston", "shelfMedian": 3.12, "onlineMedian": 3.79
    },
    "states": {
      "TX": {
        "median": 2.99, "min": 2.29, "max": 4.19,
        "minStore": "Walmart", "minCity": "Houston",
        "stores": 4, "basis": "shelf",     // basis of the min price
        "minProduct": "Great Value Whole Vitamin D Milk",
        "shelfStores": 2, "shelfMin": 2.29, "shelfMinStore": "Walmart", "shelfMinCity": "Houston",
        "shelfMedian": 2.81, "onlineMin": 3.19, "onlineMedian": 3.59,
        "baseline": 3.29                   // Target's price in this state
      }
    },
    "confidence": "high",                   // low | medium | high — gate superlative copy on this
    "cheapestState": "TX",
    "priciestState": "HI",
    "cheapestChain": { "name": "ALDI", "wins": 31, "of": 38 },   // states where it had the lowest price
    "chains": { "ALDI": { "median": 2.55, "stores": 38, "states": 38, "wins": 31, "basis": "shelf" } },
    "baseline": { "chain": "Target", "states": 51, "median": 3.59, "cheapestState": "TX", "cheapestPrice": 2.99, "priciestState": "HI", "priciestPrice": 5.49 },
    "discarded": 2                          // outliers dropped for this staple
  }],
  "facts": [{
    "id": "milk-cheapest-state", "type": "cheapest-state", "item": "milk",
    "text": "The cheapest state for milk this week is Texas — $2.29/gal at Walmart in Houston.",
    "state": "TX", "value": 2.29,
    "unit": "gal", "asOf": "2026-09-21", "confidence": "high", "stores": 4, "states": 51
  }]
}
```

**Numbers you can rely on.** Within one scope — a state block, or `national` — `min`, `median` and
`max` are computed over the same set of priced stores, so `min <= median <= max` always holds. The
shelf-price view lives in its own fields (`shelfMin`, `shelfMedian`, `shelfMinStore`…) and never
redefines `min`; use those when the copy wants to say "cheapest shelf price". Aggregation ends with
a self-check of that invariant plus "does `cheapestState` exist in `states`", and any violation is
written to `aggregate-log.json` (and counted in `coverage.invariantFailures`) instead of shipping
silently.

**Thin data is dropped, not published.** A state needs at least 2 priced stores to get a block at
all; states below that are removed from the item (national figures included) and logged as
`thin-state`. Each item also carries `confidence` — `high` (≥25 states and ≥60 stores), `medium`
(≥10 and ≥25), otherwise `low` — so the app and any public page can refuse to print a nationwide
superlative that a partial run cannot support. Every fact repeats `confidence`, `stores`, `states`
and `asOf` so a fact string can never outlive the data behind it.

Fact `type`s: `cheapest-state`, `priciest-state`, `spread` ("X costs N% more in A than B"),
`baseline-spread` (same chain, two states), `chain` ("ALDI had the lowest price in N states"),
`range`, `median`. When fewer than 45 states were sampled the wording says so ("Of the 6 states we
checked…"), so partial runs never over-claim. A superlative is only written when there is a clear
winner — if three states all sit at $2.89/lb, no state is called the cheapest — and a `spread` needs
at least 8% between the two states it names.

## How comparability is enforced (`staples.js`)

A store search for "milk" returns infant formula, kefir and chocolate milk; relevance scoring alone
gives *"Organic Vitamins A & D 2% Reduced Fat Milk, 38% Less Fat Than Whole Milk"* a 0.96. So each
staple pins down one shopping-comparable product with four layers:

1. **Category allow/deny** against Instacart's own taxonomy — the same category names across
   retailers (`[Plain Milk]` vs `[Chocolate Milk]`, `[Chicken Breast]` vs `[Frozen Chicken Breasts]`).
2. **`require` / `reject` regexes** over `"<brand> <name> | <category>"` — fat level, 80/20 lean
   ratio, "spread" vs real peanut butter, and so on.
3. **A package-size window** in base units, which is what actually makes prices comparable:
   gallon jugs, 12-count eggs, 20 oz loaves, 1 lb butter, 5 lb potato bags, 52–64 fl oz OJ,
   15–18 oz peanut butter, 9–13 oz coffee. Where a pack size changes the per-unit price a lot,
   a staple can list **size tiers** (`sizeTiers`): potatoes take the standard 5 lb bag wherever it
   exists and only fall back to 10 lb at stores that don't carry it, so a bulk bag's lower
   per-pound price can't masquerade as a cheap state. The pick records `sizeTier > 0` when it fell
   back. Cheddar deliberately uses one window instead: per pound it costs the same at 8 oz and
   16 oz, so a single window maximises coverage with no bias.
4. **`shared/compare.js` `bestPerStore()`** — relevance (with each staple's include/exclude word
   lists) then cheapest unit price among what survived.

| Staple | Reported as | Comparability rule |
|---|---|---|
| `milk` | `/gal` | whole milk, gallon jugs only |
| `eggs` | `/dozen` | Grade A large, exactly 12 (count read from the name — ALDI lists a dozen as "24 oz") |
| `bread` | per 20-oz loaf | white sandwich bread, 20 oz exactly — a real shelf price, not a normalised one |
| `bananas` | `/lb` | loose per lb, or each converted with `shared/units.js` weights (flagged `est`) |
| `chicken` | `/lb` | fresh boneless skinless breast, no frozen/split/thin-sliced/diced/organic |
| `beef` | `/lb` | 80/20 ground beef, 0.75–3.5 lb (no patties, no 5 lb chubs) |
| `butter` | `/lb` | salted, 1 lb (ALDI's is named "Sweet Cream Butter" — category catches it) |
| `coffee` | `/oz` | ground, 9–13 oz bag/brick (canisters are cheaper per oz) |
| `cheddar` | `/lb` | 6–17 oz block or shredded, no slices/snacks/blends/flavoured |
| `potatoes` | `/lb` | 5 lb russet bag (10 lb fallback), never loose |
| `rice` | `/lb` | long grain white, 2–5 lb, nothing instant |
| `orange-juice` | `/gal` | 52–64 fl oz carton of 100% OJ |
| `peanut-butter` | `/oz` | creamy, 15–18 oz jar, not "spread" |
| `apples` | `/lb` | gala, loose or 2–5 lb bag |

### Fixing a matching problem

`samples.jsonl` keeps **every plausible candidate**, so matching is re-runnable offline:

```bash
# 1. look at what was picked, and what wasn't
node -e 'const p=require("./stats/store-picks.json").picks; console.log(p.filter(x=>x.item==="beef"))'
cat stats/aggregate-log.json | head -40

# 2. edit the rules in scripts/sampler/staples.js
# 3. rebuild — no requests
node --disable-warning=ExperimentalWarning scripts/sampler/aggregate.js
```

Only changing a staple's `query` needs a re-fetch (the search text itself changed).

## Caveats

* **Online vs shelf.** Most chains are priced from the Instacart marketplace, which Instacart itself
  labels *"Prices vary from in-store"*. Those prices are usually at or above the shelf price. Every
  price carries a `basis`, each scope also reports shelf-only figures (`shelfMin`, `shelfMedian`),
  and facts label an online price as such.
* **Metros, not states.** One or two ZIPs in a state's largest metro is not a statewide average.
  "Cheapest state" means "cheapest of the stores we sampled".
* **Chain coverage differs by state.** States with an ALDI or a Walmart on Instacart get shelf
  prices; states without (much of the Mountain West, Alaska, Hawaii) only have marked-up online
  prices, which makes them look pricier than they are. Compare `item.baseline` (Target everywhere)
  for a like-for-like read.
* **Sale prices count** — they're what you'd pay this week. Loyalty-card prices do **not**
  (they need a card, and Instacart doesn't show them consistently); the everyday price is used.
* **Estimated weights.** Produce sold by the each (a single banana, a single apple) is converted to
  a per-pound price using `shared/units.js` typical weights. Those picks are flagged `est`.
* **Assortment gaps are real.** Some stores genuinely don't carry a staple that week — an ALDI with
  no gala apples, a Target with no 20 oz white loaf. Those show up in `aggregate-log.json` as
  `noMatch` rather than being filled with a wrong product.
* **Outliers are dropped**, not fixed: any store price above 3× or below 0.3× the national median
  for that staple is discarded and logged as a probable bad match.
* Instacart deploys new GraphQL query hashes regularly; the adapter rediscovers them automatically,
  but a run that suddenly errors everywhere usually means the site changed.
