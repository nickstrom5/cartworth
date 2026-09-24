# Nationwide coverage sweep — 24 Sept 2026

Question: does Cartworth work for someone in any US state? Checking all ~41,000 ZIPs one at a time
is not feasible at the owner's request limit (one request at a time per retailer, 700 ms apart;
Instacart rate-limited the sweep even at one request every 4 s), so the sweep samples.

**Sample.** 153 ZIPs: every state + DC × {largest metro, a median-area "town" ZIP, a 92nd-percentile-area
"rural" ZIP}, picked from the Census 2024 ZCTA gazetteer by land area. The rural pick is deliberately
remote (Lima MT, Grenville NM, Silver Lake OR).

**Two passes.**
- `flipp-2026-09-24.jsonl`: all 153 ZIPs, from Flipp's circular list only (fast, no Instacart). It shows
  which chains advertise into the ZIP and whether Cartworth can price them. It overstates rural reach
  (Costco's circular goes everywhere) and understates cities (Trader Joe's and Whole Foods have no
  circular), so treat it as a map, not a count.
- `directory-2026-09-24.jsonl`: the real directory build (the same code the app runs) for 30 ZIPs:
  10 in AK/AL/AR/AZ across all three kinds, then rural and small-town ZIPs in 20 more states.

## Findings

| | ZIPs | stores Cartworth located and priced within 25 mi (median) | none located | nothing at all (not even chain-wide) |
|---|---|---|---|---|
| metro | 4 | 7 | 0 | 0 |
| town | 8 | 4 | 3 | 1 |
| rural (remote) | 18 | 0 | 11 | 3 |

From Flipp across all 153: every metro ZIP has local chains Cartworth prices (median 4 besides Costco
and Walmart); 7 of 51 towns and 11 of 51 rural ZIPs have none but Costco/Walmart.

- **Metros and suburbs in every state: works.** Phoenix 16 priced stores, Carmel Valley CA 12, Red Oak TX 12,
  Streetsboro OH 11, Weston FL 10, Birmingham and Little Rock 7.
- **Small towns: mixed.** Usually ALDI or a regional chain within 25 mi (Yatesville GA 4, New Salem PA 5).
- **Remote rural: thin.** Most get only Walmart's chain-wide prices plus weekly ads; the app says so
  ("0 stores it can price within 25 miles, plus chain-wide prices from Walmart" — fixed in this sweep,
  it used to count Walmart as a store within 25 miles). Alaska outside Anchorage, rural Montana and New
  Mexico get nothing priceable; the app shows "No store near this ZIP publishes prices we can read".
- **Grocers advertising locally that Cartworth cannot price** (most-seen first): Restaurant Depot (31 states,
  not a consumer grocer), Ruler Foods (Kroger's discount banner; IL/IN/KY/MO/TN), Bravo, Shoppers
  (MD/DC), Family Fare (MI/MN/ND/NE/SD), Shop 'n Save (PA/WV/OH), C Town, Food Bazaar, Kings, DeCicco,
  Morton Williams, Marc's (OH), IGA, Harvest Foods (MT/WA), Times Supermarket (HI).

## Fixed from this sweep

- Nine of those grocers are on Instacart and are now priced, each slug verified against a local
  store by `scripts/find-slugs.js`: Ruler Foods, Family Fare, Marc's, Strack & Van Til, C-Town, Food
  Bazaar (shelf prices), Kings, Bravo and DeCicco & Sons. Shoppers, Shop 'n Save, Morton Williams and
  Times Supermarket are not on Instacart and stay weekly-ad only.
- A state-by-state catalog review then added nine more, each verified the same way: Rouses (LA/MS/AL),
  Foodland (HI), Reasor's and Homeland (OK), Lunds & Byerlys and Kowalski's (MN), Hornbacher's (ND),
  Ridley's (ID/UT/WY/NV/MT) and Macey's (UT). Not on Instacart: Shaw's, Harps, Coborn's, Sunshine
  Foods, Lidl, H-E-B. Six Kroger banners (Metro Market, Food 4 Less, Gerbes, JayC, City Market,
  Baker's) now price through the Kroger API once the server's keys are set.
- A Seattle staples audit added PCC Community Markets, Metropolitan Market and Town & Country Markets
  (WA). Winn-Dixie stays ads-only: its Instacart storefront only answers from a canonical store ~385 mi
  from Miami, so it would be a chain-wide price at best. Fresco y Más is not on Instacart.
- Onboarding offers "Look within 40 miles" when nothing priceable is within the chosen radius.
- Flipp spells two priced chains "Wegman's" and "FoodCity"; their weekly ads never reached the Sales tab.
- Whole Foods answers "no store near this ZIP" with a 404, which was read as a failed lookup: every rural
  ZIP was left "unresolved" (counts may be low) and rebuilt every few minutes.
- Onboarding counted a chain-wide listing as a store "within 25 miles".

## City staples audits (24 Sept, later)

Denver 80218 (9 priced stores), Atlanta 30307 (13), Phoenix 85016 (17), Cambridge MA 02139 (14);
milk, eggs, butter, chicken breast, bananas, bread, ground beef. Every ZIP resolved every chain.

- Fixed: King Soopers' "2% Reduced Fat Milk Half Gallon", stated "2 gal", was Denver's best milk at
  $1.50/gal. A size only at the end of an Instacart slug is the stated size, not confirmation.
- Fixed: a ZIP geocoded by the Nominatim fallback carried the state's name and lost every regional
  chain for a year.
- Suspect, not changed: Walmart's chain-wide "Crescent Foods Halal Lean Ground Beef 85/15", 1 lb at
  $2.50, is the best ground beef in all four cities. It is labelled chain-wide and online; nothing
  in the row contradicts itself, so no rule can safely reject it.

Second round: Minneapolis 55408 (11 priced stores), Charlotte 28205, Dallas 75206, St. Louis 63110;
milk, eggs, orange juice, cheddar, rice, apples, coffee, chicken thighs.

- Fixed: SunnyD "Citrus Punch", filed under Orange Juice, was the best orange juice in Minneapolis
  and (named "...Orange Juice" by ALDI) in Dallas. Juice drinks are not juice; "from concentrate" is.
- Fixed: "Coffee a la Jaggery" won Dallas coffee, and "Chicken a la King" scored as chicken.
- Charlotte, Dallas and St. Louis came back with every Instacart chain unresolved. Rebuilt alone,
  Charlotte found 13 priced stores; Dallas and St. Louis then hit Instacart 429s and the run stopped.
  Onboarding (web and iOS) now says the list may be short and offers "Check again"; iOS no longer
  caches a failed lookup as "no store" for three days; the directory's stall limit now outlasts
  the slowest permitted Instacart request.
- Re-run once Instacart cooled down: Dallas 16 priced stores, St. Louis 11, nothing unresolved.
  Fixed from it: an apple pectin supplement (180 tablets) was Dallas's best "apples" at an estimated
  $0.30/lb.

Capture sweep (offline): the matcher replayed over the 616 searches in `stats/samples.jsonl`.
Kroger's "bananas" was frozen banana slices and Key Food's a freeze-dried snack, each carried by
a "Frozen/Dried Bananas" category; Snapple Orangeade by "Orange Juice". Fixed; 15 of ~24,000
listings change, all of them those.

Third round: Nashville 37206 (13), Salt Lake City 84105 (11), Burlington VT 05401 (5), New Orleans
70115 (8); ground turkey, yogurt, spaghetti, tomatoes, peanut butter, potatoes, bacon, cereal.
- Fixed: tomato ketchup was the best "tomatoes" in three cities and diced canned tomatoes in the
  fourth; spaghetti squash was the best "spaghetti"; cherry tomatoes were hidden.
- A review of this day's commits found five more defects in the new rules (vitamin D milk hidden,
  "a la carte", the retry-blind timeout, and "Check again" re-enabling stores on web and iOS); fixed.
- Suspect, not changed: Whole Foods' Kimbala "Neat Coffee", 10.2 oz at $3.99, won Dallas coffee by
  3%. Its sibling "Coffee a la Jaggery" is a sweetened mix; this one's name gives nothing to go on.
