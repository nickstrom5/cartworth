# Facts the posts may use, and where each one comes from

Use only what is on this page. If a post needs a number that is not here, it does not get a
number. Dates matter: grocery prices change weekly, so every figure below is a snapshot.

## What the product does (from `site/index.html` and `marketing/APP_STORE_LISTING.md`)

- Type an item; Cartworth prices it at the grocery stores near a US ZIP, all at once.
- Every price is converted to one unit: per pound, per gallon, per dozen or per count.
- Every price is labelled: shelf, online (a delivery or pickup listing, which can run above the
  shelf), national (one chain-wide price, not your store's) or weekly ad.
- Weekly ads are shown with their conditions: limits, must-buy quantities, card or digital coupon,
  and the price without the coupon.
- A list with sizes ("whole turkey 14 lb") is priced at each store. The trip plan shows the
  cheapest single store, the best two-store and three-store splits, and the cherry-pick total.
- More than 70 chains. Some publish no prices Cartworth can read; for those it shows the weekly ad
  and says it has no prices.
- **Web app: free, no account, unlimited searches**, weekly ads, list, trip planning, up to 60 price
  watches. `https://app.cartworth.app`
- **iPhone app:** live on the App Store since 6 Nov 2026, iOS 17 or later. Free tier: three
  searches a day, one price watch, this week's ads, the list. Pro ($3.99 a month, $19.99 a year,
  $29.99 once) adds unlimited searches and watches, alerts, recipe photo to list, trip planning,
  price history and next week's ads.
- No account, no sign-up, no analytics or ad SDK. On iPhone, searches go straight from the phone to
  the retailer's site. On the web they go through Cartworth's server, which caches results by
  store, ZIP and term for twenty minutes.
- Prices are read from what retailers publish online: a few on their own sites, most through
  Instacart's storefront for that chain; weekly ads from the circular service stores use. Nothing
  crowdsourced or estimated from other data.
- Independent. Not affiliated with, endorsed by or partnered with any retailer.
- 1.0.1, with the 9 Nov fixes, is in App Review as of 10 Nov. Don't promise a date.

## Things it honestly does not do

- It does not promise or calculate "what you'll save". The site's FAQ: "Nobody can honestly answer
  that".
- When two prices have different bases (one shelf, one online), it says "less than the next-best
  store" with **no number** (`ops/coverage/thanksgiving-deals-2026-11-03.md`).
- Prices within the uncertainty of their bases are shown as "≈ same", with no saving claimed. On
  3 Nov in Chicago, milk at $2.53 shelf and $2.99 online read "≈ same"
  (`ops/coverage/thanksgiving-ios-qa-2026-11-03.md`).
- Loose produce priced "each" is marked as an estimate.

## Checked examples (no store names in public posts)

| # | What was seen | Where and when | Source |
|---|---|---|---|
| 1 | "whole turkey" answered at 8 of 20 priced stores, from **$0.99/lb** (a frozen bird, ad terms "Limit 1 at sale price") to **$3.29/lb**. Bases were mixed (online and shelf), so the app claimed "less than the next-best store" with no number. | Chicago 60618, 3 Nov 2026 | `thanksgiving-deals-2026-11-03.md`, "What ran" |
| 2 | A fresh turkey listed at **$1,099.99** was flagged as a wrong price and kept out of the ranking. | Chicago 60618, 3 Nov 2026 | same |
| 3 | A weekly ad's "$1 off" a $16.99 bottle was being read as a $1.00 price, "94% off". It is $15.99, 6% off. Found in QA and fixed. | Chicago 60618 ad, 3 Nov 2026 | same, bug 1 |
| 4 | An ad's "$0.58/lb, save $2.19 per pack" was shown as "79% off". On the 10 lb pack it is 27%. Found in QA; the app now shows no percentage for that kind of ad. | New Orleans 70115, 9 Nov 2026 | `qa-2026-11-09.md`, fix 1 |
| 5 | Turkey ads in three cities carried conditions such as "with card", "Limit 1", "with $25 purchase" and "with an additional $50 purchase". The app now reads the spend threshold and shows it as a badge. | Chicago, Phoenix, Atlanta ads, 3 Nov 2026 | `thanksgiving-deals-2026-11-03.md`, bug 4 |
| 6 | Across 12 metro ZIPs that answered, the lowest "whole turkey" price per pound that Cartworth showed ranged from **$0.79 to $2.69** when you leave out chain-wide prices. | 3 Nov 2026; Newark, Charlotte, Milwaukee, Dallas, Portland OR, Anchorage, Honolulu, Manchester NH, Greenville SC, Omaha, Las Vegas, Virginia Beach | raw run files, see below |
| 7 | A search for "canned pumpkin" returned nothing at 23 stores; "pie crust" returned a whole apple pie at six. Both found in QA and fixed. | Newark 07104, 3 Nov 2026 | `thanksgiving-core-qa-2026-11-03.md`, bugs 1 and 3 |
| 8 | The 14-item Thanksgiving list was run in five more states with 8 to 11 priced stores each. | Denver, Louisville, New Orleans, Detroit, Oklahoma City, 9 Nov 2026 | `qa-2026-11-09.md` |
| 9 | USDA thawing guidance, as the guide quotes it: about a day in the refrigerator for every 4 to 5 pounds. | n/a | `site/guides/thanksgiving-dinner-prices.html` |

### About "turkey at $0.84/lb in five metros"

Do not use it that way. The 3 Nov run (`ops/coverage/thanksgiving-core-2026-11-03/*.json` in the
main checkout, not committed) shows $0.84/lb as the top "whole turkey" answer in 11 of the 12
metros that answered, but in ten of those it is the **same chain-wide online listing** from one
national chain, labelled `national`, on a product whose size reads "39 lb". It is one published
price repeated in every ZIP, not ten local findings, and nobody checked it against a shelf. Only
Newark's $0.84 carried a shelf label. Said plainly: "one national chain's chain-wide listing was
$0.84/lb on 3 Nov; the lowest local prices ran from $0.79 to $2.69 depending on the city."

Per-metro lowest local (non-chain-wide) "whole turkey" answer, 3 Nov, with its label. For the
press pitch and for replies only, never as a ranking of cities or stores, and re-check first:

| Metro ZIP | Lowest local answer | Label |
|---|---|---|
| Manchester NH 03104 | $0.79/lb | online |
| Dallas 75206 | $0.99/lb | online |
| Milwaukee 53215 | $0.99/lb | online |
| Portland OR 97206 (partial run) | $0.99/lb | online |
| Virginia Beach 23462 (partial run) | $0.99/lb | online |
| Omaha 68114 | $1.27/lb | shelf |
| Newark 07104 | $1.29/lb | online |
| Charlotte 28205 | $1.29/lb | online |
| Las Vegas 89102 | $1.39/lb | online |
| Anchorage 99503 (partial run) | $1.39/lb | online |
| Honolulu 96814 | $1.99/lb | online |
| Greenville SC 29607 | $2.69/lb | online |

Salt Lake City (partial run) had no whole-turkey answer. "Partial" means some stores refused the
run that night, so a lower price may have existed.

## Not to be said

- Any "save $X" or "X% cheaper" figure, any "cheapest store" or "cheapest city".
- User, download or rating counts. None are recorded in the repo.
- "Official", "verified by", "partner".
- "Instacart marks up" (compliance rule 23). Say "the store's online listing".
- Apple Intelligence, a Kroger API, or nationwide price statistics as features
  (`APP_STORE_LISTING.md`, corrections 1 to 3).
