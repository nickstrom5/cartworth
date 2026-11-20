# Thanksgiving QA, 20 Nov 2026 (6 days out)

The 18-19 Nov review of every cached Thanksgiving answer left 49 groups of findings; #33 fixed 15. This
round works through the rest that need no decision from the owner, offline, against the same cache
(`ops/coverage/rescore-2026-11-18/cache-search.tsv`: 1,107 answers, 27 items in 41 metro ZIPs,
83,925 distinct store rows). No store was asked anything.

Four reviewers then attacked the fixes, running main and this branch side by side over every cached row
and over names the cache lacks: 28 findings, all but two fixed here (see "What the review changed").

Measured against `main` over all 1,107 answers: **63 get a different winner** (49 a different store, 14
the same store's other row), 47 more a different runner-up, claim or number of stores priced, and no
answer changes dimension. By item:

- **Pie crust, 36 ZIPs:** ALDI's two-pack ($1.88, $2.13/lb) wins 17, Walmart's ($1.24-$1.36) 15,
  Costco's Pillsbury 8-count ($8.70 for 56.4 oz, $2.47/lb) 4. Most had shown Trader Joe's at $3.27/lb
  or a Kroger store at $2.79-$2.99.
- **Dinner rolls, 20:** Walmart's brown-and-serve dozen ($1.05, 8-9c a roll) wins 14, ALDI's L'oven
  Hawaiian rolls ($1.99 for 12 oz) 2 of the answers by weight, Smith's Kroger dough 2, Wegmans and
  Kroger one each.
- **Celery, 6:** a bag of hearts priced per heart no longer wins (BJ's in four, Sprouts and Albertsons).
- **Cranberry sauce, 1:** Bravo's plain can at $1.09/lb in Queens.
- Runner-ups and claims: Costco's Campbell's 12-pack in cream of mushroom soup (15 answers), Sam's
  Club's and BJ's real butter in butter (Sam's from 18th to 5th in Queens, BJ's from 21st to 10th),
  Kroger's 29 oz pumpkin and the real cans of Weis, C-Town and Vons in canned pumpkin.

## Fixed

### A row stated in the other dimension was left out

1. **The slug states the other dimension.** A product keeps the one size its listing states, and a
   comparison is in one dimension, so a row stated in the other was simply missing, however cheap.
   Walmart's "Great Value 2 Pack 9 Inch Deep Dish Pie Crusts" ("2 ct", $1.36, slug
   ".../deep-dish-pie-crusts-16-oz") and ALDI's two crusts ($1.88, ".../pie-crust-14-1-oz") were
   missing from pie crust, an answer by weight, in 26 of 32 ZIPs, and a dearer store was shown as the
   cheapest. Walmart's "12 oz" brown-and-serve dozen (".../dinner-rolls-12-ct") had no price per roll
   where rolls are compared by count. The slug's figure is now a second unit price, in the other
   dimension only (`otherDimFromSlug`):
   - it never chooses which dimension an answer is in, and the dimension picker does not offer a
     dimension that only slug figures fill;
   - it is an estimate: shown "est." (the web says the size was read from the store's listing), and a
     claim made on it names no exact percentage (Walmart's crusts may be 12 oz, not 16);
   - the plausibility guard judges it against the stated figures, in every dimension, count included:
     a slug figure under a quarter of the cheapest stated one is flagged (`flagSlugFigures`). Every
     right slug figure that is a store's cheapest row in the cache is at 0.38 of the cheapest stated
     figure or more, and a misread is about a tenth. (The first cut measured against the median, which
     premium rows pull up: it flagged Walmart's real $1.36 crusts in 12 ZIPs.)
   - the size says where it came from: "2 ct · 16 oz", "12 oz · 12 ct".
   An old iPhone test marked "known defect" (Jewel's Lucerne butter, "4 ea" under a 16 oz slug, left out
   of the per-ounce comparison so Jewel's bar was $7.99/lb) now passes and is a regression test.

### Wrong winners

2. **Celery hearts priced per heart.** BJ's "Foxy Organic Celery Hearts", "4 each" at $2.59, was $0.65 a
   heart and won celery in Hartford, Queens, Atlanta and Miami, "59% less" than a $1.59 bunch. A bag of
   hearts is now one package, whatever it counts ("1 pack · 4 each").
3. **Strawberry cranberry sauce.** Bravo's "Sa Strawberry Cranberry Sauce" at $0.79/lb headlined
   "cranberry sauce" in Queens over its plain can at $1.09. A second flavour on a cranberry sauce is
   another variety; horseradish, chipotle, apple, dipping, barbecue and hot sauces are other sauces.
4. **Canned pumpkin look-alikes.** Gummy "Mello Creme Pumpkins" were Weis's canned pumpkin in two ZIPs,
   a bakery "Pie, Pumpkin" C-Town's and Save-A-Lot's, pumpkin porridge and energy sticks H Mart's and 99
   Ranch's. A small pumpkin-something whose name or aisle says candy, pie, porridge, paint, baby food,
   yoghurt and the like is no longer a can; a pie pumpkin in a filling aisle (Festal's) still is.
5. **Green bean look-alikes.** Sam's Club's "Mixed Vegetables A Blend Of Carrots Corn Green Beans And
   Peas" was its green beans in about ten ZIPs; green lima, mung and black beans were H Mart's and 99
   Ranch's. Another bean before "beans" and a blend of vegetables now count against green beans.
6. **"Sweet Corn With Butter" was Sam's butter** in about ten ZIPs, and Brussels sprouts with butter,
   bacon or pecans, broccoli with cheese and hot cocoa with marshmallows answered the same way. When the
   searched word follows "with" directly, the product is what comes before it (11 refusals over every
   cached item, all right; "Heinz Brown with Onions Gravy" is still gravy).

### Sizes

7. **Canned solids stated in fluid ounces** had only a price per gallon in an answer by weight: Kroger's
   "Kroger Pumpkin, 29oz" in 20 ZIP/store rows, Costco's Campbell's "Cream of Mushroom Soup, 10.5 fl oz,
   12-Count" in 11 ZIPs, O Organics' green beans and pumpkin. A can whose own name says what it is, whose
   aisle or name says it is a can, and which is no drink or dessert is read by net weight
   (`coerceSolid`). Of 33 cached items whose words alone fitted, only the four cans pass.
8. **Warehouse-club butter.** Sam's "Member's Mark Salted Sweet Cream Butter Sticks", "16 oz" at $11.88
   under ".../butter-sticks-4-lb", is four pounds at $2.97/lb; read as one, Sam's real butter never
   ranked in any of its 25 ZIPs. BJ's "Wellsley Farms" butter, "4 ct" at $11.49 under a 1 lb slug, is
   four 1 lb boxes ($2.87/lb), not four sticks. In a club's butter aisle only: elsewhere slugs drop
   decimal points ("...-214-oz" is Ghirardelli's 21.4 oz bag).
9. **Smaller ones.** A whole turkey stated at 18 or 20 oz (Fairway's Maplecrest, Weis's Young Turkey,
   Food Bazaar's 12 oz Zenu deli loaf in Whole Turkey) loses its unit price; "1 lb" is still a price per
   pound (Stop & Shop's $0.59 hen). A bag of rolls stated "1 each" at $2 or more has no price per roll
   (Natural Grocers' $6.29 Hawaiian Rolls); a bakery single at $0.49 keeps it. A "1 ct" produce row under
   a "-per-lb" slug gets no per-piece price. "Cream Heavy Whipping", "Danzeisen Dairy Cream" and a bare
   "qt" are volumes. Bravo's "Sa Farina Cream" (farina is a wheat cereal) is not heavy cream.

### Tools

10. `ops/coverage/rescore-lib.mjs`: a cached pack-line conflict ("6 × 4 oz") is no longer carried over
    when today's size already is that pack, and a row it carries a conflict onto shows no slug figure,
    as in the app.

## What the review changed

The first cut had these faults; each has a test marked REVIEW
(`test/qa-backlog-review-2026-11-20.test.js` and `BacklogReviewTests` in `CoreTests.swift`).

- **The slug figure read things that are not the size.** The product id ("/57858643-l-b-brioche-dinner-
  rolls-8-ct" read "8 ct · 57858643 L" at Lunds & Byerlys), a Whole Foods ASIN tail, a dropped decimal
  in pounds ("...-15-lb" for Meijer's 1.5 lb of brown sugar), "up to 19 lb" pumpkins, a per-pound ham
  ("...-priced-per-pound-2232lb"), shrimp size grades ("31-to-40-count") and decimals ("3-50-ct") as
  pieces, an "-each" that restates the ounces (Grassland's butter "16 oz · 16 ct"), a count that
  contradicts the row's own (Meijer's "French Dinner Rolls 10 ct" under "-8-ct"), one unit's weight
  ("...-15-oz-6-ct"). All refused now. A dropped decimal in two-digit ounces cannot be told from a real
  size and is left to the guard, which now judges slug figures in a count answer too, where nothing
  checked them: Walmart's Hawaiian rolls still read "4 ct · 45 oz" (4.5 oz), and are flagged in an
  answer by weight.
- **The picker, the member price, the tooltip and price history** treated a slug figure like a stated
  one: "by count" butter would have shown Grassland at a quarter of its price per stick, and the web's
  history recorded the slug figure where the iPhone recorded none.
- **The rolls rule** removed real single-roll prices (Bashas' 49c bolillos); **the cream patterns**
  caught Reddi-wip and matched across the aisle's name; **the 4 lb turkey floor** caught seasonings,
  gizzards and a turkey sub; **coerceSolid** would have read pumpkin cold brew, energy drinks and canned
  cocktails as cans of pumpkin.
- **The matcher rules reached past Thanksgiving**: the sauce compounds refused Trader Joe's "Habanero
  Hot Sauce" for "habanero sauce" and every dipping sauce; the bean rule refused "Refried Pinto Beans"
  for "refried beans" and red kidney beans for "red beans"; "farina" refused Caputo's "Farina 00" flour;
  the flavour rule halved "Mocha Chocolate Sauce"; "peas" never matched the blend list. Each rule is now
  limited to the search it was written for.

## Checks

- Tests: three new files under `test/` (`qa-backlog-sizes-2026-11-20.test.js`,
  `qa-backlog-matcher-2026-11-20.test.js`, `qa-backlog-review-2026-11-20.test.js`) and their ports in
  `CoreTests.swift` (`BacklogSizesTests`, `BacklogClubButterTests`, `BacklogMatcherTests`,
  `BacklogReviewTests`). Web: 1,022 pass, 1 skipped (as before). iPhone unit tests: 541 pass.
- Every distinct cached item scored by main and by this branch for the 27 queries and 43 more that touch
  these rules (sauces, beans, flour, cereal, cream, the "with" foods): 168 verdicts change, every one a
  refusal of a look-alike (58 for "pumpkin puree" and 52 for "canned pumpkin", 34 green beans, 10
  cranberry sauce, the 11 "with" foods and Nalley's "Chili Con Carne With Beans" for "chili beans", the
  farina). None of the searches the review used to break the first cut loses a product.
- The iPhone code compiled and run beside the web code over all 378,235 cached rows and 13,125
  synthetic ones, after the last change: no difference on any field of any row.
- The tools: `ops/coverage/rescore-diff.mjs` (two answer files, answer by answer),
  `verdict-flips.mjs` (every cached item scored by two code trees) and `product-diff.mjs` (every cached
  row rebuilt by two code trees), each against a copy of main made with `git archive`.

## For the owner

- **Sam's Member's Mark butter is still a pound at $11-12 under its "-each" listings.** The same 4 lb
  pack appears under ".../butter-sticks-each" slugs with no weight; only a sibling listing at the same
  price and name says 4 lb. In Cheyenne that leaves King Soopers' $3.79 as the best butter where Sam's is
  about $3.09/lb. Fixing it needs evidence from another listing (cross-listing inference), which no rule
  of one row can see.
- **Slug figures in two-digit ounces are trusted.** A slug can drop a decimal point ("...-45-oz" for
  4.5 oz); about one in forty two-digit ounce slugs in the cache does. The plausibility guard catches a
  tenfold error unless the real price is about twice the median or more. Refusing all two-digit ounces
  would lose Walmart's and ALDI's crusts.
- **The search cache version is unchanged** (web 20, iPhone 16), as in #33: a cached answer keeps its old
  sizes until it expires (20 minutes), or for up to three days where a store errors and a saved answer is
  served. Bumping it would throw away that three-day fallback the week of Thanksgiving.
- The decisions and reports in the 18-19 Nov note's "For the owner" still stand (corn bread stuffing,
  stores with unbelievable prices, bulk packs, turkeys flagged as priced per pound, prepared stuffing).

## iPhone

None of this is in build 11 (1.0.3), which is in App Review. The iOS code and tests are in this PR; it
reaches phones in a later build.
