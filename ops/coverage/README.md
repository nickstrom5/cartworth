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
- Flipp spells two priced chains "Wegman's" and "FoodCity"; their weekly ads never reached the Sales tab.
- Whole Foods answers "no store near this ZIP" with a 404, which was read as a failed lookup: every rural
  ZIP was left "unresolved" (counts may be low) and rebuilt every few minutes.
- Onboarding counted a chain-wide listing as a store "within 25 miles".
