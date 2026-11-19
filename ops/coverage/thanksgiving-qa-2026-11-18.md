# Thanksgiving QA, 18-19 Nov 2026 (8 days out)

Two things happened. The Thanksgiving core list (`holiday-matrix.mjs --holiday thanksgiving-core`, 27
items) ran in the last 18 places, so it has now run in every state and DC. And every answer still in
the QA cache was re-scored offline with today's code and read line by line.

- **States.** Morning: CT, IA and OK for the first time, and OR, UT and VA again (they ran on 3 Nov).
  Afternoon: AR, DE, KS, MS, NM, RI. Night: DC, ID, ME, MT, ND, SD, VT, WV, WY. All 21 runs came back
  whole and Instacart did not refuse this Mac (`thanksgiving-core-2026-11-18/`, not committed).
- **The re-score.** `ops/coverage/rescore-cache.mjs` rebuilds each cached store listing, runs today's
  `makeProduct` and the production comparison on it, and writes one line per answer: 1,107 answers
  (27 items in 41 metro ZIPs). It asks no store anything. Thirteen reviewers read all of them and
  reported 92 findings in 47 groups. I checked each group I fixed against the rows myself and measured
  every fix over the whole cache before keeping it; the groups I did not fix are listed at the end as
  reports, not as verified defects.
- **The review of the fixes.** Four more reviewers then attacked the fixes themselves, running the old
  and new code side by side over every cached item (36,853 names, 107,504 distinct rows). They found
  14 places where the first cut was wrong or stopped short; all are fixed and tested (see "What the
  review of the fixes changed"). One of them compiled the iPhone code and ran it against the web code
  on all 378,235 cached rows: the two agreed on every field of every row but one, an old difference
  in how an accented name is read. I fixed that on the web and ran the same comparison again after
  the last change: no difference on any cached row, nor on 13,125 synthetic ones.

## Fixed in PR #32 (morning)

1. **A turkey breast at $2.99 a pound was shown at 50¢/lb, "81% less than the next-best store".**
   Fred Meyer's "Butterball Fresh Bone-In Turkey Breast, All Natural, 3-9 lbs." came as stated "6 lb",
   sold "each", $2.99: a price per pound over the piece's weight. A turkey with a weight range in its
   name, 3 lb or more, priced "each" under $10 keeps its price and loses its unit price.
2. **Flour answered "turkey".** Costco's "Lehi Roller Mills Turkey Flour, 25 lbs" won "turkey" in Salt
   Lake City at $0.64/lb.

## Fixed in this PR

Measured against `main` over all 1,107 answers: **110 get a different winner** and 234 more a different
runner-up, claim or number of stores priced. By item: stuffing mix 36, gravy 27, turkey breast 7,
french fried onions and pie crust 6 each, whole/frozen/fresh turkey and whole berry cranberry sauce 4
each, turkey 3, dinner rolls and onions 2, butter, evaporated milk, heavy cream, pecans and russet
potatoes 1.

### Wrong winners from the new states

1. **Per-pound turkey breasts with no weight range in the name.** The morning's rule missed the same
   Butterball breast at Dillons, named without its range: Wichita's best turkey breast at 50¢/lb. Cub's
   "Festive Frozen Turkey Breast" (4.5 lb, $1.99) had won Minneapolis at 44¢/lb and Smart & Final's
   "Turkey Breast Random Cuts" (4 lb, $2.39) Phoenix and Los Angeles at 60¢/lb since 13 Nov. With no
   range, the price has to be one the kind never sells for: a whole bird that works out under 37¢/lb,
   a breast under 99¢/lb, the cheapest either has sold for by the pound (`turkeyPerLbConflict`). Real
   package prices stand: Fry's 14 lb bird at $9.66 (69¢/lb), ALDI's 3 lb ground turkey at $9.95. Of 56
   each-priced turkeys of 3 lb or more under $10 in the cache, the rule flags 48, all prices per pound;
   the other 8 are ground turkey, franks, gravy and one deli item.
2. **One store turned a whole comparison.** In Hartford, C-Town returned 19 turkey breasts stated only
   as "each" (all $1.09). They outvoted 13 per-pound rows from eight stores, so "turkey breast" was
   compared by count: two stores priced, ALDI's $1.99/lb left out. The dimension now follows the stores
   when another one gives at least twice as many of them, and at least three, a real unit price
   (`dominantDim`). That moves this one answer of 1,107.
3. **A placeholder price won.** Smith's lists "Butterball Fresh Premium Young Turkey" by the pound at
   $0.10 in Salt Lake City and Albuquerque, beside its other fresh Butterball at $1.99. In Albuquerque
   it was the best whole turkey, "90% less than the next-best store". Of 35,389 cached rows sold by the
   pound, the three at 10¢ or less are all wrong and the next (El Super's 25¢ onions) is real. A price
   per pound of 10¢ or less is flagged "price looks wrong" and never wins (`PER_LB_PLACEHOLDER`).

### A label word hid the cheapest row

4. **Kroger's own turkey.** "Kroger® Tender and Juicy Whole Frozen Turkey", $0.99/lb, scored 0.40
   because "tender" is the word for chicken tenders. It was hidden in 16 ZIPs with a Kroger banner.
   Smith's is Salt Lake City's best turkey (Harmons was shown at $1.09, "11% less"), Fred Meyer is
   Boise's, and Albuquerque's "20% less" claim was a tie.
5. **ALDI's cheapest stuffing mix.** "Chef's Cupboard Real Chicken Broth Stuffing Mix", 6 oz at 78¢,
   scored 0.37 ("broth") in every ALDI answer. ALDI now wins stuffing mix at $2.08/lb in 32 ZIPs; in
   three, Walmart had been shown "less than ALDI". Kroger's "Chicken Flavored Stuffing Mix" ($1.09)
   was hidden the same way and now wins Boise, Cheyenne and Portland.
6. **"Vitamin D" milk.** "Carnation Evaporated Milk Vitamin D" and every "Vitamin D Whole Milk" scored
   0.40: "vitamin" is the supplement aisle's word. This reaches well past Thanksgiving (it is the usual
   name for whole milk); only evaporated milk could be measured here.
7. **Also hidden:** "Bone In" written without a hyphen (0.12; Stater Bros' $1.99/lb breast tied Los
   Angeles' winner), "Beef Flavored" gravy at Food Lion and Walmart, "Graham Cracker" and "All Butter"
   pie crusts, Costco's "All Butter Dinner Rolls", Trader Joe's "Pecan Pieces Dry Toasted" (Seattle's
   best pecans), and "Broth Basted" turkeys.
8. **The trade's other names.** "Whole Cranberry Sauce" (Ocean Spray's own catalogue name) never
   matched "whole berry cranberry sauce": 69 store rows were missing. "Crispy Fried Onions" matched
   "french fried onions" only for French's, whose brand supplied the word. Brown-and-serve rolls were
   not dinner rolls, and a bakery's "Pie, Pumpkin" was read as a pie pumpkin.
9. **A word of the maker's name.** Every "Stew Leonard's ..." product scored 0.40 because "stew" is a
   look-alike word, so that chain had no ranked turkey, butter, milk or heavy cream in Hartford or
   Queens. "Hotel Bar" and "Danish Creamery" butter, "Turkey Hill" and "Fry's" milk, "Wonder Bread"
   dinner rolls and "Le Sauce & Co." gravy were hidden the same way. A maker's word is now forgiven
   when the store filed the product under exactly what was searched. Over all 36,853 cached items
   that changes 143 verdicts, every one an admit; it moves one winner (see below).

### A look-alike won

10. **Tater tots were Cheyenne's best butter** (Sam's Club "Kinder's Garlic Butter ... Crispy Tots");
   **gravy granules** Portland's and Washington's best gravy (Grocery Outlet's Bisto, a dry mix, by
   weight against jars); **turnover shells** Providence's best pie crust and the runner-up behind
   Hartford's "50% less"; **table cream** Cheyenne's best heavy cream. "Celery Cabbage" (napa) and
   "Zulka Sugar, Pure Cane" (filed under Brown Sugars) were named runners-up in claims; pecan
   crostatas backed Hartford's "62% less" on pecans; a turkey spice blend was Vallarta's turkey breast.

### Sizes

11. **"2 Count 15 oz" was read as two 15 oz packs.** `settleCountFirst` took a stated size equal to the
    name's as "one unit, so N of them", which is how a warehouse club lists a multipack. At a
    supermarket it is the package said twice. Meijer's "Ready-to-Bake Pie Crusts 2 Count 15 oz" was the
    best pie crust in Louisville, Indianapolis, Columbus and Detroit at half its price; Dierbergs'
    "Split Top Dinner Rolls 16 ct - 20 oz" read 22¢/lb. Every supermarket weight of this shape in the
    cache is one package (10 products at 60 stores); the clubs' are packs, except one that says
    "Package". Drinks keep the pack reading everywhere.
12. **Butter sticks, a #10 can and Costco's rolls.** Meijer's "Salted Butter Sticks 8 oz 2 ct" read as
    two half-pounds ($2.69/lb, the runner-up named in four cities' butter claims). "#10 Can, 117oz"
    read as ten cans. Costco's "16-count, 2-pack" rolls read as two rolls ($4.16 each, its row in 23
    ZIPs), "7.5 lbs, 60-count" as 450 lb and "Hamburger Buns, 32 oz, 16-count" as 32 lb.
13. **Trader Joe's gravy was fluid ounces.** Its aisle is "Dressing & Seasoning", and "dressing" is a
    liquid word. The 17.6 oz carton at $1.69 had no price per pound, so Trader Joe's had no gravy at
    all; it now wins gravy at $1.54/lb in 25 ZIPs. "Franz Milk Rolls" and a tequila-lime turkey
    tenderloin were liquids the same way.
14. **A produce word is not a piece of produce.** A 6 oz can of "Crispy French Fried Onions" stated
    "1 each" was weighed as one fresh onion and was Portland's and Boise's best french fried onions at
    an estimated $7.98/lb; avocado, garlic and onion rolls were weighed as avocados, garlic and onions.
    "Russet Potato 80 ct" (a carton grade) was 80 potatoes and Seattle's best russets at 18¢/lb. Sam's
    Club's $5-9 "Sweet Potato (Yam)", a bag stated "1 each", read $9-15/lb in 23 ZIPs. A jumbo onion
    was weighed at half a pound; at 0.9 lb Trader Joe's is Seattle's best onions.
15. **The slug said it another way.** Sprouts' "Orange Sweet Potatoes" (".../yams-jewel") and Grocery
    Outlet's pie crusts ("...-pie-shell") were set aside as "listing names another product".

### What the review of the fixes changed

The first cut of the fixes above had these faults; each now has a test marked REVIEW.

- The pumpkin-pie fix admitted the squash again: stores file "PIE PUMPKIN" under the Pumpkin Pie aisle
  too. It now needs the comma ("Pie, Pumpkin") or the pie's width as well as the aisle.
- The turkey floors were set under the cheapest real prices (25¢ and 75¢), so the same breast one
  price step up ($4.99 over 6 lb) would have passed. They are now at those prices (37¢ and 99¢).
- The dimension rule could be turned by two stray rows when a shopper has only two or three stores
  enabled: "pumpkin pie" by volume, on a wine and a protein drink. It now needs three stores.
- "Vitamin D" was folded into one word, which hid the vitamin from a search for vitamins and let
  "Evaporated Vitamin D Milk" pass as milk. The label is now forgiven in place.
- "Delights" in a maker's name ("Northwest Delights Organic Pecans") was read as a confection;
  "roll butter" answered "rolls"; a "tot" in "Happy Tot" baby food was read as tater tots.
- Costco piece counts under 100 lb ("Hamburger Buns, 32 oz, 16-count") were still read as packs. Ten
  or more of 24 oz or more are pieces; every real club multipack in the cache is fewer or smaller.
- A drink whose size is written "oz" ("Chicken Broth 6 Pack 14.5 oz") lost its pack reading at a
  supermarket, and sauces named after bread or gravy ("Spring Roll Sweet Chili Sauce", "Home Style
  Gravy Sauce") left the volume comparison.
- A placeholder was only recognised as a list price by the pound, not as a card price or as "1 lb".
- Two older faults found on the way: the web read an accented name differently from the iPhone
  (`slugWords`), and `scripts/price-audit.js` has always reported an empty "excluded" list because it
  passed the wrong argument to `excludedCheaper`.

Tests: five new files under `test/` (`qa-*-2026-11-18.test.js`, `qa-*-2026-11-19.test.js`) and their
ports in `CoreTests.swift`. Web: 987 pass, 1 skipped (as before). iPhone unit tests: 506 pass.

The search cache version is unchanged, so a store answer cached before the deploy keeps its old sizes
until it expires (20 minutes, or up to three days where a store cannot be reached and a saved answer
is served).

## New winners worth one look

The fixes are right, but they put prices on top that I could not check offline.

- **Indianapolis, evaporated milk:** Save-A-Lot's "Carnation Evaporated Milk Vitamin D", 12 fl oz at
  55¢. Its own house brand is $1.97.
- **Oklahoma City, onions:** Homeland's "Organic Yellow Onion", 4 lb at $1.79 (45¢/lb). A size-outlier
  flag used to hide it by a hair; its own 3 lb bags are $3.09.
- **Phoenix and Los Angeles, whole berry cranberry sauce:** Smart & Final's #10 can (117 oz, $11.99),
  as its jellied can already was for cranberry sauce.
- **Denver, Salt Lake City, Albuquerque and Portland, french fried onions:** Costco's "Fresh Gourmet
  Crispy Onions", 24 oz at $5.96-$7.45, filed under Crispy Fried Onions.
- **Seattle, Boise and Portland, fresh turkey:** Fred Meyer's "Kroger® Tender & Juicy Premium Young
  Turkey (20-24 lbs)" at $0.99/lb. It is filed under Whole Turkey, not Frozen Whole Turkey.
- **Philadelphia, whole berry cranberry sauce**, and **Virginia Beach, dinner rolls:** Grocery Outlet
  closeouts (Ocean Spray at 99¢; brown-and-serve rolls, 12 for $1.49).
- **Queens, pie crust:** Bravo's "White Rose Tea Inc. Deep Dish Pie Crusts" at $2.19/lb, hidden until
  now by the "Tea" in the maker's name. Bravo is one of the stores with prices too low to believe.

## For the owner

Decisions, or prices nobody can verify from a cache. The first group changes what shoppers see today.

- **Corn bread stuffing is still hidden, on purpose.** "Pepperidge Farm Corn Bread Classic Stuffing"
  scores 0.48 ("bread"). Un-hiding it would headline Walmart's chain-wide price of 50¢ for the 12 oz
  bag in six cities; Walmart's shelf price elsewhere is about $2.68. Walmart's chain-wide $1.68 for
  the Herb Seasoned bag is $1.00 under every local Walmart shelf price in the cache too; it had been
  winning 14 ZIPs, and ALDI's 78¢ box now beats it in 12. One live check of that listing would settle
  both.
- **Stores whose feeds carry prices too low to believe:** C-Town in Hartford (turkey breasts at $1.09
  each, a 5 lb potato bag at $1.09; it won 10 of 27 items on 18 Nov), Bravo in Queens (cream, 29¢/lb green
  beans, 79¢ cranberry sauce), Save-A-Lot (onions, the Carnation can above), Kroger's "Celery Sticks,
  1 lb" at 29¢ in Detroit and 39¢ in Indianapolis. Nothing compares a row with its own store's shelf.
- **Bulk packs win on unit price:** Costco Business Center in Salt Lake City (a 30 lb butter case, a
  50 lb onion sack) and Smart & Final's #10 cans. No rule limits pack size.
- **A turkey flagged "priced per lb" is not ranked at that price.** The flag is right, but the store
  is then shown on another row: Smart & Final at $5.33/lb where its breast is $2.39/lb, Weis on a bird
  at twice its frozen price. Ranking the row at its per-pound price would fix it; it needs a display
  decision ("$2.39/lb, est.").
- **One dimension per answer drops the cheapest pack.** Walmart's $1.36 and ALDI's $1.88 pie crusts
  are stated by count, so they are missing from pie crust in 26 of 32 ZIPs although their slugs state
  the weight. The same shape: celery (ALDI's 95¢ bunch in count ZIPs), pumpkin pies sized in inches.
- **Costco's 10 lb sweet potato bag is set aside in Jackson, Miami, Boston and Detroit** as a size
  outlier, and wins 16 other ZIPs. I measured two looser rules; both also clear rows that are wrong.
- **Club multipacks priced as one unit** when the name carries no count: BJ's (Libby's, Carnation,
  Land O Lakes), Sam's 4 lb butter read as 1 lb (so Sam's real $2.57-$3.09/lb butter never ranks), BJ's
  "4 ct" butter read as four sticks. All err on the dear side.
- **Canned solids stated in fluid ounces** (Kroger's 29 oz pumpkin, Costco's 12-can Campbell's) get
  only a volume price and drop out of a by-weight answer.
- **Judgment calls:** prepared stuffing tubs against dry mix by the pound; in-shell pecans not
  labelled so (Minneapolis, Queens, Wilmington); ground pecans (Chicago); a "fresh turkey" answered by
  a bird that may be frozen (ALDI's brined turkey wins it in 24 ZIPs); an estimated per-bird price
  winning (Marc's $10.19 Butterball, Columbus); Rhodes frozen dough as dinner rolls (18 ZIPs).
- **Reported, not checked:** green bean and canned pumpkin look-alikes, non-food aisles that are not
  a veto, a per-pound slug on a "1 ct" sweet potato, Sam's heavy cream with no size, Whole Foods'
  member price not used in a claim, dried onion spices that still answer "onions" (dear, so they do
  not win, but they sit in the pool the plausibility flags are judged against).
- **From the morning, still open:** Hartford's garbled feed names, Portland's Bisto and Reser's rows
  (now gone from the top), Food Lion's 29¢ sweet potato estimate.

## iPhone

None of this is in build 10 (1.0.3), which is in TestFlight. The iOS code and tests are in this PR; it
reaches phones in the next build.
