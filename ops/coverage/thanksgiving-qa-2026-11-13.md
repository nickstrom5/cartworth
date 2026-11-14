# Thanksgiving QA, 13 Nov 2026 (13 days out)

The 27-item Thanksgiving core list (`holiday-matrix.mjs --holiday thanksgiving-core`) in the metro
ZIP of 14 more states (AZ, CA, CO, FL, GA, IL, LA, MA, MI, MN, NY, OH, PA, WA; results in
`thanksgiving-core-2026-11-13/`), the web app's list planner on a 20-item Thanksgiving list in Chicago,
and the iPhone app in the simulator. The state run takes about 20 minutes a state. All 14 done: AZ, CA (26 of 27 items; a restart stopped it), CO, FL, GA, IL, LA, MA on 13 Nov; MI, MN, NY, OH, PA, WA on 14 Nov (Instacart refused this Mac partway through WA, so Seattle's last items have fewer stores).

## Fixed

1. **A whole bird answered a search for a cut.** Costco's "Fresh Hen Turkey" (a whole bird), which
   Instacart files under Turkey Breast, scored 0.88 for "turkey breast" in Phoenix: the aisle supplied
   the word "breast". A whole chicken filed under Chicken Breast did the same. When the query names a
   cut, a name that says it is the whole bird and names no cut is another purchase
   (`wholeBirdForCut`, shared/match.js and Match.swift).
2. **A gummy candy was Phoenix's best "pecans".** Bashas' "Durham-Ellis Pecan Co. Orange Slices"
   (Gummy Candies) scored 0.72, "pecan" coming from the maker's name. The nut searches' candy-aisle
   rule knew "candy" but not "candies".
3. **A watch's best store at a tie was arbitrary.** "whole turkey" in Chicago headlined Mariano's
   Instacart 99¢/lb over ALDI's 99¢ shelf price. A watch now breaks ties the way the comparison
   screen does: shelf before online before chain-wide, exact before estimated, then store id
   (`byWatchPrice` / `Compare.watchOrder`), for the headline and the store list, web and iPhone.
4. **Planning a long list looked stuck.** A 20-item list at 8 Chicago stores took about 5 minutes on
   a cold cache behind a spinning button. The planner now shows what it is doing and for how long,
   and after a few seconds says a long list takes a few minutes the first time and that prices are
   kept 20 minutes, so planning again is quick (`PlanningNote`, public/js/views/list.js).

5. **Weekly-ad prices never reached the best price** (the owner spotted Mariano's turkey). Mariano's
   ad: Jennie-O frozen turkey 58¢/lb with card (limit 5), Butterball 88¢/lb with digital coupon;
   Cartworth's best "whole turkey" in Chicago was 99¢. Ads only showed in the strip, as "$0.58" with no
   unit or condition. On the owner's choice the ad is now *said*, not ranked: "Lower in this week's ad:
   Jennie-O Turkey, 58¢/lb at Mariano's (with card, limit 5)." beside the best price (web and iPhone),
   on the watch card, and as "Ad 58¢/lb at Mariano's · with card" on the widget. Behind it:
   - the strip reads the fine print of its best few matches before answering (`searchAds`,
     `PriceSearch.ads`), and also searches the head word ("turkey" for "whole turkey"), since
     Flipp's search wants every word and Mariano's ad never says "whole";
   - "With Card" / "WITH DIGITAL COUPON" in the item's own price text now count as conditions;
   - a turkey that names no part but is sold as a bird ("Frozen, Grade A", "10 lb and up", "Hen")
     answers "whole turkey" (`wholeBirdImplied`); Costco's "Fresh Hen Turkey" did not before;
   - a watch check reads the ads alongside, skips them while the server is shedding lookups, and
     gives up on them after 8 s.
6. **"Add all to my list" led nowhere** (the owner: "I expected at least a button to easily see the
   pricing of those items"). The web card turns into "See prices for my list (N items)", which
   opens the list and plans it at once; while it runs the plan panel says "Pricing your list · Asking
   N stores about M items" (on a phone the page jumps to it). The iPhone holiday screen does the
   same, and no longer adds the list twice when tapped again.
7. **iPhone list plans gave no sign of progress.** 14 Thanksgiving items at the Chicago stores ran
   over five minutes on a first run behind a small spinner. It now says "Priced 4 of 14 items at 21
   stores · 1m 12s", and after a few seconds why it takes that long.

8. **Knob onions answered "onions"** (Pete's "Medium Knob Onions", one bunch at 9¢, Chicago's
   cheapest), and **"Filled Milk"** (vegetable fat for the butterfat) was the runner-up "evaporated
   milk" in New Orleans and Phoenix. Both are now compounds that need asking for by name.

9. **A whole turkey "1 ea" at $5-$6 won "whole turkey" in four of six states** (14 Nov): Kowalski's
   organic fresh $5.49 (Minneapolis), Bravo's Jennie-O $5.19 (Queens), Weis' kosher $5.79
   (Philadelphia), Metropolitan Market's free-range brined $5.29 (Seattle), each read as one 14 lb bird
   at 37-41¢/lb. They are prices per pound under an "each" label. The per-bird floor rose from $5 to
   $10 (`TURKEY_EACH_MIN`, `Units.turkeyEachMin`); below it a bird is listed but not ranked per lb.
   Marc's Butterball at $10.19 a bird (73¢/lb) still counts.
10. **Pastries and bread answered "pecans"**: Bravo's "Lady Linda Pecan Twirls" (Queens) and Whole
    Foods' "Organic Raisin Pecan Sliced" (Seattle), neither with an aisle. A nut search now passes over
    a name that makes the nut a baked good or another food (`NUT_FORM_RE` / `nutFormRx`).

## Checked, looks right (CO, FL, GA, IL, LA, MA, MI, MN, NY, OH, PA, WA)

- Whole turkey is under $1/lb everywhere: Walmart's chain-wide 84¢, Publix 65¢ (Florida and Georgia,
  Instacart), Stop & Shop 59¢ and Big Y 79¢ in Boston, ALDI's 99¢ shelf price.
- Store brands win the canned and dry staples (ALDI, Woodman's, Hannaford, Great Value), at prices
  that agree across states (canned pumpkin $0.99-$1.00, green beans $0.50, butter $1.99/lb at ALDI).
- Pumpkin pie answers with whole pies (Costco and Sam's 58 oz at about $2/lb; Trader Joe's in Boston).

## New

- **iPhone widget for a watched product** (owner's idea): small, medium and Lock Screen sizes. It
  shows the best price near you, the store and the kind of price (Instacart, chain-wide, estimate,
  saved), "at your target" / "lowest seen" / "on sale" or the change since the last check, a trend
  line once checks span six hours, and when it was checked. Long-press → Edit Widget picks the
  product; with none picked it shows a target hit, then a lowest price, then the latest. Tapping it
  opens that watch in Tracking. The app writes a small snapshot to the App Group
  `group.app.cartworth.ios` after every check; the widget never asks a store itself.

## For the owner

- **Flavoured cranberry sauce**: Bravo's "Sa Strawberry Cranberry Sauce" (16 oz, 79¢) is Queens' best
  "cranberry sauce". It is a cranberry sauce, so it stays; say if a flavoured one should need asking for.
- **Save-A-Lot white onions, 3 lb for 43¢** (Columbus), may be a real loss leader or a data error.

- **Planning a long list on a first run is slow** (about 5 minutes for 14-20 items on web and
  iPhone): every store is asked about every item at the stores' pace. Both now say so while it runs;
  making it faster means asking fewer stores per item or keeping prices longer.
- **Smart & Final "Double L Ranch Meats Turkey Breast Random Cuts", 4 lb $2.39** ($0.60/lb) is
  Phoenix's best turkey breast. Instacart's own page says the same, so Cartworth reports it as an
  Instacart price; it may be a data error at the store.
