# Thanksgiving deals QA, 3 Nov 2026

Code: `main` at 44b00a1 (build 6, deployed). Thanksgiving is Thursday 26 Nov 2026.

Scope: turkey pricing in the "Best price" headline and the per-store chart, weekly-ad terms for
turkey loss leaders and multi-buys, the inverted "94% off", and the Thanksgiving occasion card.
Sibling sessions cover the core list, food styles, the iOS UI and the web site.

What ran:
- The live Whole Foods sales flyer, Lakeview (60618): all 46 promotions, grouped by price shape.
- Live Flipp "turkey" search in Chicago 60618, Phoenix 85016 and Atlanta 30308: 73 ad items, 37
  of them birds or near-birds, read through `toDeal`.
- A live `scripts/price-audit.js` run of "whole turkey" and "turkey" in Chicago 60618 (20 priced
  stores, no refusals). "whole turkey" is right: Mariano's Jennie-O frozen bird at $0.99/lb
  ("Limit 1 At Sale Price"), then Woodman's $1.49, Tony's $1.79, Caputo's and Sunset $2.19, Meijer
  $2.79, Strack $2.99 and Pete's $3.29, all per lb. The claim is "less than the next-best store",
  with no number, because the two prices have different bases (online and shelf). Pete's "Schauls
  Premium Fresh Young Turkey" at $1,099.99 was correctly flagged and kept out. No Chicago store
  sold a bird per bird without a weight, so the bug 3 fix changed none of these answers; it is
  preventive here.
- `bestPerStore`, `excludedCheaper` and `savingsClaim` on mixed per-lb, per-bird and stated-weight
  birds, before and after the fix.
- `featured()` for every day of November at 0:30, 12:30 and 23:30, in eight time zones (all US
  zones, Honolulu, Anchorage, UTC), and October for Canadian Thanksgiving.

## Bugs, most visible first

1. **"94% off" for "$1 off".** Whole Foods states some sales as a dollar amount off ("$1 off",
   Reg. $16.99, Pizzolato Spumante Rosé, Lakeview). `wfmDeal` in `src/deals.js` and
   `wholeFoodsDeals` in `ios/App/Services/DealsModel.swift` read the first dollar figure on the
   sale line as the sale price, so the deal became a $1.00 bottle and `1 - 1/16.99` = 94% off. It
   is $15.99, 6% off. The percent was not inverted in the display code: the sale price was wrong at
   the source, and the Deals card, the "save 94%" line in the detail view, the percent sort and the
   "30%+ off" filter all used it. **Fixed** in a shared parser, `wholeFoodsSale` (shared/deals.js)
   and `WholeFoodsSale.parse` (ios/App/Core/Deals.swift), used on both sides.
2. **"4 for $5.56" was one item at $5.56.** The same first-dollar read made Whole Foods' multi-buys
   (avocados 4 for $5.56, raspberries 2 for $6.67) one item at the bundle total. **Fixed** by the
   same parser: qty 4, $1.39 each. Avocados' $1.39 each is above their $1.09 regular price, so no
   percent is claimed.
3. **A turkey sold per bird with no weight dropped out of "Best price".** The turkey form of the
   Halloween pumpkin bug, in the other direction. Turkey searches compare by the pound, because most
   birds are sold by the pound, so a bird priced "1 ea, $12.99" had no price per pound. It was left
   out of the headline and the per-store chart and named only as "not comparable per lb". Unlike a
   pumpkin, a whole bird has a typical weight. **Fixed:** `wholeTurkey` (shared/units.js,
   `Units.wholeTurkey` on iOS) gives a per-bird price an estimated price per pound at
   `TYPICAL_TURKEY_LB` = 14 lb (the 12–16 lb printed on most frozen birds). The estimate is marked
   "est.", so `savingsClaim` never states an exact saving against it. A per-pound bird also shows
   an estimated price per bird on the web ("~$11.06 per 14 lb bird (est.)", in the result row and
   in the product detail). That figure is display-only, in `estBird`, never `estPkg`.
   `excludedCheaper` reads `estPkg` as a register price, and a first attempt that put the estimate
   there named Festival's $2.89 "1 each" as cheaper than a $48.86 estimated bird (caught by
   qa-pricing-round2). Guards: only whole birds (not breast, ground, deli, parts, roasts, pet food,
   oven bags or pans), and only per-bird prices of $5 or more. A $2.89 "each" is a price per pound
   with the "lb" missing (Festival). A stated weight is used as given and is never replaced.
4. **A spend threshold was read nowhere, and "LIMIT ONE" was not a limit.** "$0.59/lb with $25
   purchase" parsed to nothing, so the card showed a bare $0.59/lb. **Fixed:** `parseDeal` and
   `DealParser.parse` read `minSpend` in these forms: "with $25 purchase", "with additional $25
   purchase", "and $35 purchase", "with any $50 or more purchase", "when you spend $100" and "w/ $35
   purch.". They don't read it from "with $5 mail-in rebate" or "$5 off". The limit is now read
   from "limit one" through "limit six" as well as digits. The web card and the iOS card and detail
   view show a "With $25 purchase" badge. Live Flipp data had one more case: Food City (Atlanta)
   puts the threshold after the price ("Only $0.96" / "*PER LB with an additional $50 purchase."),
   and Flipp's post-price text was not parsed for terms. **Fixed** on both sides (`toDeal`,
   `FlippSource.deal`).
5. **A points turkey counted as free with nothing to buy.** `freeOffer("FREE turkey with 1,500
   points")` returned `noPurchase: true`, label "Free". **Fixed:** needs 'points', label "Free with
   rewards points". A spend-gated freebie is now labelled "Free with a $100 purchase". This bug
   can't reach shoppers yet: `freeOffer`'s result (`deal.free`) is computed but no screen renders
   it, and iOS has no port.
6. **The Thanksgiving card vanished at midnight, on Black Friday.** That is when leftover frozen
   birds are marked down. Halloween had the same problem (Halloween bug 4). **Fixed:** Thanksgiving
   is now in `DAY_AFTER` (web) and `Seasonal.dayAfter` (iOS). It stays one more day: "Thanksgiving
   was yesterday", with the line "Frozen turkeys and pie fixings are often marked down today — check
   the weekly ads." It is gone on 28 Nov.

## Checked and right

- **Turkey ranking.** The comparison picks the pound in every mix tried (per-lb majority, per-bird
  majority, stated weights). A stated-weight bird (Fry's "Kroger Frozen Whole Turkey", 14 lb,
  $9.66) is an exact $0.69/lb. "12-16 lb" in a name is read as its low end and marked "est.", so it
  reads $1.67/lb, not $1.43 (see follow-ups).
- **Weekly-ad turkeys, live.** "$0.98/lb with card" (Mariano's), "$0.58/lb With Card", orig $0.98
  → 41% off (Fry's), "Digital Member Deal $0.97 lb Thank You Card Price" (Bashas', card and
  coupon) and "lb/cs" (Restaurant Depot) all parse right. So do multi-buys: "10 for $10", "2/$5",
  a bare "10 for" against its $10 total, "5/$5 when you buy 5" (must buy 5), and "$1 off" against a
  base price ($15.99).
- **The card's window.** It first appears on 5 Nov ("in 21 days") and counts down to "is tomorrow"
  on the 25th and "is today" on the 26th. On Friendsgiving Saturday (21 Nov) it says "in 5 days".
  It shows beside Diwali (8 Nov) until the 8th, then beside Hanukkah (4 Dec) from 13 Nov. Every
  boundary falls at local midnight, identically in New York, Chicago, Denver, Phoenix, Los Angeles,
  Anchorage, Honolulu and UTC. The countdown is calendar days on both sides, so it isn't thrown off
  by the 1 Nov clock change.
- **Canadian Thanksgiving** (12 Oct 2026) is not an occasion, and nothing Thanksgiving-related shows
  in October. 2027 (25 Nov) and 2028 (23 Nov) follow the fourth-Thursday rule.

## Follow-ups, not fixed here

- **A bare "turkey" search headlines ground turkey.** In Chicago, "turkey" answered at only 4 of 20
  stores: ALDI Kirkwood Ground Turkey at $2.19/lb, "48% less" than Woodman's Perdue ground turkey,
  then Whole Foods ground and Trader Joe's deli breast. Meanwhile "whole turkey" finds eight birds
  from $0.99/lb. Every price is right, but in November someone typing "turkey" usually means the
  bird. The occasion card's list says "whole turkey", so its chip is fine. The matcher and the
  query refinement belong to the core-list and food-styles sessions; a "whole turkey" refine chip
  for "turkey" in November is one option.

- **Weight ranges read at the low end.** "12-16 lb" is priced as 12 lb everywhere (`parseSize`).
  For a bird sold at one price, the midpoint is the fairer estimate. The rule is general, though:
  it covers every product with a range, so changing it needs its own pass.
- **"Thanksgiving is today" still says to compare the weekly ads.** By then a frozen bird is too
  late: it needs about a day of fridge thawing per 4–5 lb, three days for 14 lb. A thaw-by nudge
  from the Sunday before ("buy a frozen bird by today to thaw it in the fridge") would help more.
- **No Friendsgiving card.** It is usually the Saturday before (21 Nov). The Thanksgiving card covers
  it, but a mention in its blurb would help.
- **iOS doesn't show an estimated price per bird.** The phone ranks per-bird turkeys by the
  estimate, but its result rows don't display `estPkg` at all, so there is nowhere to add the
  "~$11 per 14 lb bird" line without UI work. The iOS UI session owns that.
- **Kroger and Fry's "Butterball Bone-In Turkey $95" ad items** look like catering or holiday-meal
  listings. They show as $95.00 deals and would match "whole turkey" in the occasion's deal
  matches. They are not wrong prices, but they are not birds.
- `test/qa-kroger-launch.test.js` "a Kroger answer with a max-age is kept and reused" failed once in
  the full run while xcodebuild was compiling, and passed alone (9/9). It is a timing test.

## Tests

- Web: `test/qa-thanksgiving-deals.test.js`, 15 tests: bugs 1–6, their controls, and the countdown
  in eight time zones (one child process per zone). WEB_TOTALS
- iOS: `ThanksgivingDealsTests` in `ios/Tests/ThanksgivingPricingTests.swift`, with the same cases
  as the web tests. IOS_TOTALS
