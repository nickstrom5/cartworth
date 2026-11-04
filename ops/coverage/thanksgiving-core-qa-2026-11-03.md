# Thanksgiving core list QA, 3 Nov 2026

Code: `main` at 44b00a1 (build 6's matcher, deployed). Fixes on `claude/thanksgiving-core-list-e3f5b7`.

What ran:
- A 27-item Thanksgiving dinner list through `ops/coverage/holiday-matrix.mjs --holiday thanksgiving-core`
  (new; the app's own Thanksgiving list has 14 items, this one asks for each form a shopper might type):
  whole, frozen and fresh turkey, "turkey", turkey breast, stuffing mix, cranberry sauce (plain, jellied,
  whole berry), canned pumpkin, pie crust, evaporated milk, sweet and russet potatoes, green beans, cream
  of mushroom soup, french fried onions, dinner rolls, butter, heavy cream, gravy, celery, onions, brown
  sugar, marshmallows, pecans, pumpkin pie.
- The metro ZIP of 13 states, none in the Halloween runs except TX and the required AK and HI: Northeast
  NJ, NH; Southeast NC, SC, VA; Midwest WI, NE; TX; Mountain UT, NV; West Coast OR; AK; HI. Every row is in
  `ops/coverage/thanksgiving-core-2026-11-03/` in the main checkout, not committed, like the Halloween
  runs (`<ST>-thanksgiving-core.json`; `.partial*.json` when Instacart refused part of the state). The fixes went in as each state came back, so later states ran on fixed code.
- Newark again at the end with every fix in (`rerun/NJ-thanksgiving-core.json`), against its first run.
- An offline probe of the same list against ~150 likely product names (`relevance()` only), before the
  live run, to find what to look for.

**Instacart refused this Mac from 21:30 CST onward** (five QA sessions share the IP). Newark was the
only state run whole before it; after that, each state got one try (after the first 429 the app sends
Instacart nothing more for the cooldown, so a refused state costs it one request), five minutes apart.
Partial states still priced every store that is not on Instacart: ALDI, Whole Foods, Trader Joe's,
Walmart's chain-wide prices, and Fred Meyer, QFC and Kroger through the Kroger API. Instacart came back
around 23:00; NH, SC, NE, NV and a second try at NC and WI were whole.

| State | Metro ZIP | Priced stores | Run | Items answered | Refused |
|---|---|---|---|---|---|
| NJ | Newark 07104 | 23 | complete, and rerun with the fixes | 26/27, then 27/27 | |
| NC | Charlotte 28205 | 14 | partial, then complete | 27/27 | |
| WI | Milwaukee 53215 | 12 | partial, then complete | 27/27 | |
| TX | Dallas 75206 | 16 | partial, then complete | 27/27 | |
| UT | Salt Lake City 84106 | 9 | partial | 22/27 | 7 stores |
| OR | Portland 97206 | 12 | partial | 23/27 | 10 stores |
| AK | Anchorage 99503 | 4 | partial | 8/27 | 4 stores (all Instacart) |
| HI | Honolulu 96814 | 8 | complete | 27/27 | |
| NH | Manchester 03104 | 9 | complete | 27/27 | |
| SC | Greenville 29607 | 12 | complete | 27/27 | |
| NE | Omaha 68114 | 9 | complete | 27/27 | |
| NV | Las Vegas 89102 | 17 | complete | 27/27 | |
| VA | Virginia Beach 23462 | 14 | partial | 27/27 | 11 stores |

Not retried (time): UT, OR, AK and VA stay partial; every one of their wrong picks above came from the
stores that did answer.

## Bugs, most visible first

All fixed in `shared/match.js` and `ios/App/Core/Match.swift`, with tests in
`test/qa-thanksgiving-core.test.js` and `ThanksgivingCoreTests` (`ios/Tests/CoreTests.swift`).

1. **"canned pumpkin" had no answer at all.** Newark, 23 stores: nothing. The whole-pumpkin rules from
   Halloween (a bare "pumpkin" is one to carve) read "canned pumpkin" as a pumpkin search, and no can says
   "canned": Libby's "100% Pure Pumpkin" scored 0.06. Walmart's 15 oz "Great Value Pumpkin" also missed
   "pumpkin puree", the app's own Thanksgiving item. A can (by name, aisle, or a sub-2 lb net weight) now
   answers both; after the fix ALDI's can, Food Club's 100% Pure Pumpkin, Green Giant and Libby's #10 can
   answer in Milwaukee, Dallas and Honolulu, and pie mix, pumpkin pie spice and carving pumpkins do not.
2. **"turkey" was answered by other parts of the bird.** Newark: Walmart's "FESTIVE Ground Turkey" and
   ALDI's "Kirkwood Ground Turkey" answered "turkey" and "frozen turkey"; Food Bazaar's "TURKEY WING CUT
   UP" "turkey"; its "Turkey Neck" "fresh turkey"; ACME's deli "Herb Roasted Turkey Breast" was the best
   "turkey breast". Whole Foods' deli turkey by the pound has no aisle: "No Salt Turkey", $13.99/lb, was
   Salt Lake City's only "turkey". A turkey search now names the part it wants (ground, breast, wing,
   neck, deli, sliced, bacon, sausage...), by name or by aisle, and "turkey" with no part named is the bird.
3. **"pie crust" was a whole pie at six stores.** Mrs. Smith's "Original Flaky Crust Dutch Apple
   Pie", 37 oz in Frozen Pies at $7.99-$8.99, was the best pie crust at Stop & Shop, Weis, ACME, Kings and
   Food Bazaar (Newark), and ShopRite's "Fresh Bake Store Baked Double Crust Lemon Pie" at ShopRite,
   ahead of Pillsbury's crusts. Pie shells, which are pastry, were refused. Letting pie shells
   in let in Albertsons' and Vons' "Mini Phyllo" pastry shells, 15 ct, the best pie crust in Las Vegas
   at $0.40 a shell; phyllo, tart and mini shells are out again.
4. **"fresh turkey" was a frozen bird.** "fresh" is a stop word, so Walmart's "Shady Brook Farms Frozen
   Whole Turkey" at $0.84/lb was Newark's best fresh turkey (Wegmans' fresh bird: $2.99/lb). Elsewhere
   "fresh turkey" was answered by ALDI's turkey stuffing (Charlotte), an oven bag (Dallas), a turkey brine
   (Costco, Anchorage), a breast roast filed under Turkey Breast (Piggly Wiggly, Milwaukee), BJ's
   "Infinite Herbs Turkey Blend" (Virginia Beach), in Greenville SC by The Fresh Market's "The Turkey
   Trot (Half Panini)" and Sprouts' "Turkey Carnitas", and in the Newark rerun by Key Food's "Organic
   Heirloom Brown Turkey Fig Tree" (8 oz of Brown Turkey figs). 'stuffing' and 'brine' are trap words
   now, a prepared, sandwich or seasoning aisle is not a turkey, "turkey fig" is a fig, and "fresh" in
   the query rejects a frozen bird.
   Charlotte's "fresh turkey" headline was Ingles' "Fresh Hen & Turkey", **1 ea at $3.59**: a
   per-pound price on a bird sold "each" with no weight. A whole turkey sold "1 ea" with no weight is
   now listed but gets no price per bird (`wholeBirdEach` in `src/normalize.js`, ProductFactory.swift).
5. **"heavy cream" was light cream, then whipped cream.** BJ's "Wellsley Farms Light Cream" and Stew
   Leonard's "Byrne Dairy Light Cream", both filed under Heavy Creams, were Newark's two best heavy cream;
   Trader Joe's aerosol "Sweetened Whipped Heavy Cream" answered in Dallas.
6. **Real staples scored under the cut, so a store showed nothing.** Condensed cream of mushroom soup
   (ALDI, Price Rite, Wegmans store brands sat at exactly 0.55; 'condensed' is a plant-base word for milk),
   every turkey gravy (0.37; 'turkey' is a trap), stuffing that does not say "mix" (Pepperidge Farm,
   0.28), pie shells (0.28), PET evaporated milk (0.37; 'pet' is a trap).
7. **"onions" was frozen pearl onions at an estimated $0.33/lb.** Walmart's "Great Value Pearl Onions",
   12 ct in Frozen Onions at $1.98, was Honolulu's best onions: a frozen bag, its weight guessed as twelve
   full-size onions. A frozen vegetable no longer answers a fresh-vegetable search (frozen green beans
   still answer "green beans"). In Dallas, Natural Grocers' "Produce Onions Cipollini (Bagged)", 1 ea at
   $0.19, was the best onions at an estimated $0.38/lb, the bag weighed as one onion: "bag" was on the
   not-one-piece list, "bagged" was not (`shared/units.js`, `Units.swift`).
8. **Prepared foods answered produce searches.** Pulmuone's "Sweet Potato Bungeo Pang", a frozen Korean
   pastry in Frozen Asian Meals stated as 12.7 lb (the bag is ounces), was second-best sweet potatoes at
   99 Ranch ($0.76/lb) and H Mart ($0.94/lb) in Newark; in the rerun H Mart's "HAITAI Baked Sweet Potato"
   5 ct (Prepared Potatoes) took its place. Trader Joe's "Garlic Shiitake Green Beans" (Entrées & Sides)
   answered "green beans" in Charlotte. A meal, side, dessert or prepared-food aisle no longer answers;
   prepared produce (cut celery) still does.
9. **"pumpkin pie" was a pie pumpkin or a can.** Fresh Market's per-lb "Organic Sugar Pie Pumpkin" and
   Food Bazaar's canned "One-Pie Pumpkin" answered it in Newark (and Jewel's per-lb "Pumpkin Pie" in
   Chicago in the Halloween QA). The produce and the can are not the pie.
10. **Snack nuts, nut cakes and in-shell nuts answered "pecans".** Trader Joe's "Candied Pecans" and
    "Sweet & Spicy Pecans", 5 oz at $15.97/lb (Dallas, Salt Lake City); El Super's "Pecan Brazo Gitano",
    a cake roll (Las Vegas); Food Lion's "Diamond In Shell Pecans", weighed with the shells, against
    shelled pecans (Greenville). For any nut search that does not ask for them.
11. **Thanksgiving table and kitchen goods scored as food** (offline probe, then live): a "Turkey
    Centerpiece" (0.92 for "turkey"), a "Gravy Boat" (0.92 for "gravy"), a "Pie Crust Shield", turkey-size
    oven bags, a roasting rack, a baster. Added to the non-food trap; asking for one still finds it.
12. **Woodman's "Chinese Celery"**, a leaf vegetable of its own, answered "celery" (Milwaukee), and
    Albertsons' and Vons' "Onions Shallots" ($0.59/lb) answered "onions" (Las Vegas).
13. **Per-lb celery was ranked by one rib.** Instacart's "each (est.)" for a per-lb "Celery Stalk" prices
    a single rib: Hannaford's at $3.39/lb came to $0.47 "each" and Weis's at $6.89/lb to $0.62, each the
    best celery in its ZIP (Manchester NH, Newark) against whole bunches at $1.50 to $2.23. Per-lb celery
    now keeps its per-pound price and no per-bunch one, as per-lb pumpkins do (`noEachEstimate` in
    `shared/units.js` and `Units.swift`).

Fixed as a side effect: Walmart's $0.84/lb "Shady Brook Farms Frozen Young Turkey" was flagged "price
looks wrong" in Newark next to an identical $0.84/lb bird that won, because the median was ground and
deli turkey. In the rerun the median is birds and the flag is gone.

Three older pricing tests used deli and ground turkey as their "turkey" market (DEFECT 10 and its
controls in `qa-thanksgiving-pricing.test.js`, the drumsticks control in `qa-pricing-round2.test.js`,
and P17b's Primo Taglio deli breast). Their markets are now whole birds or drumsticks at the same
ratios, so they still test the plausibility guard and not the old matching.

## Wrong units and sizes (not fixed here)

- **BJ's "Foxy Organic Celery Hearts", 4 ea at $2.59**, is Newark's celery headline in the rerun at
  $0.65 a heart, against whole bunches at $1.50 to $2.23. A heart is smaller than a bunch; the per-count
  comparison treats them as the same thing.
- **ALDI's "L'oven Fresh Yeast Dinner Rolls", 13 oz at $0.29**, was the best dinner rolls in Charlotte,
  Milwaukee and Dallas ($0.36/lb). Probably a stale markdown or a wrong price on Instacart's ALDI
  listing; nothing in the row contradicts itself.
- **BJ's prices are mostly flagged "sizes disagree"** (a 14.5 oz can of green beans at $16.29, a 6 oz
  graham crust at $12.69): BJ's lists case prices against single-item sizes. They are kept out of the
  headline, as designed, but almost none of BJ's 27 items in Newark had a usable price.
- Costco's 10 lb sweet potatoes at $4.71 ($0.47/lb) were flagged implausible-low in Newark; it may be real
  (Costco answered $5.59 to $7.45 elsewhere).
- **Smart & Final's "Double L Ranch Meats Turkey Breast Random Cuts", stated 4 lb at $2.39**, is Las
  Vegas's best turkey breast at $0.60/lb. "Random cuts" is a random-weight pack, so $2.39 is almost
  certainly per pound. Nothing flags it: $0.60 is a fifth of the median, inside the guard's 1/8.
- **Natural Grocers' "Mary's Whole Organic Turkey" at $33.19/lb** (Omaha, "fresh turkey"): a whole
  bird's price shown per pound. Third, not the headline; with three matches the guard does not run.
- **Fiesta's "El Venado Halves Pecan", stated 15 oz at $2.29** ($2.44/lb, Dallas), is a third of
  any other pecan price; 1.5 oz is likelier. Not flagged (inside 1/8 of the median); second, not first.
- Hannaford's "Festive Frozen Turkey Breast", stated 1 lb at $1.69 (Manchester NH), looks like a per-lb
  price on a random-weight breast; it reads the same either way.
- Canned green beans (15 oz at $0.50, net weight with the liquid) win "green beans" everywhere over fresh
  at $2-3/lb. Canned is what green bean casserole uses; left as is, for the owner.
- Walmart's chain-wide "Great Value Graham Pie Shell" is Honolulu's best pie crust. Graham crusts answer
  "pie crust" by decision (Sept 2026); still the owner's call.

## Out-of-region and default stores

No chain from outside the region was turned on anywhere. But the default 8 put **shelf-priced stores
before online-priced ones, whatever the distance**: in Newark Key Food (12.2 mi) and Sprouts (14.9 mi)
are on by default while ShopRite (0.8 mi), Stop & Shop (1.4 mi) and Costco (4.8 mi) are off
(`defaultStoreIds` in `src/directory.js`). Same cause as Halloween QA bug 5 (Sprouts at 21.5 mi in
Forest Hills). Not changed here; it is not a matcher fix.

## Newark rerun, with the fixes

Same ZIP, 23 stores, three and a half hours later. 13 of 27 headlines changed: seven because the wrong
product no longer answers, six (frozen turkey, stuffing mix, russet potatoes, green beans, gravy,
marshmallows) from one right answer to another as prices and the newly admitted products moved. Canned
pumpkin went from no answer to Walmart's 15 oz can at $1.07/lb; pie crust from a whole pie at six
stores to Pillsbury, store-brand and Marie Callender's crusts; heavy
cream from light cream at five stores to heavy whipping cream; "turkey" from ground turkey, wings and
deli breast at 19 stores to whole birds (Walmart's Butterball at $0.97/lb); "turkey breast" from ACME's
deli breast to ALDI's "Kirkwood Bone-In Turkey Breasts" at $1.99/lb; gravy picked up the turkey gravies
at Sprouts, Whole Foods and Key Food; condensed store-brand soups now answer at six stores; the per-lb
"Celery Stalk" and the candied pecans no longer rank. Two new wrong picks surfaced and were fixed (the
Brown Turkey figs and the Haitai baked sweet potato, above). Cranberry sauce, evaporated milk, sweet
potatoes, butter, brown sugar, french fried onions and dinner rolls were right before and are unchanged.

## Works well

- Whole and frozen turkey were real birds in every state that answered, per lb, from $0.84 (Walmart,
  chain-wide) to $3.65 (Publix). Cranberry sauce (jellied and whole berry, kept apart), evaporated milk,
  russet potatoes, butter, brown sugar, marshmallows, french fried onions and celery were right everywhere.
- Turkey breast found bone-in and boneless roasts (Butterball, Jennie-O, store brands) once deli
  slices stopped answering.

## Still open

- Whole Foods lists no aisle, so a bird and its deli turkey are told apart by name only ("No Salt",
  "Peppered", "In House", "Herb"). A Whole Foods deli turkey named only "Turkey" would still answer.
- Instacart-priced Hannaford, Wegmans and ShopRite list some random-weight packs (breasts, celery
  hearts) with a per-pound price on a "1 lb" or "4 ea" size; nothing in the row says which it is.
- "Smoked Whole Turkey" (fully cooked) scores 0.53 for "whole turkey": just under the cut, by the
  existing 'smoked' rule. Left alone.
- Tooling: `scripts/price-audit.js` searches the stores one after another, so a 23-store ZIP takes 25
  minutes for 27 items. Five sessions at once tripped Instacart's limit within half an hour, and it
  stayed refused for about 90 minutes.
- iOS: `PurchaseTests` failed (four buy tests) and then hung on a fresh simulator when run inside the
  whole AppTests suite; run alone they pass, 16 of 16, on this branch and on `main`. Not related to
  these changes; the matcher suites were run with `-skip-testing:AppTests/PurchaseTests`.
