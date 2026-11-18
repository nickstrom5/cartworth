# Thanksgiving QA, 18 Nov 2026 (8 days out)

Code: `main` at a9a430c (PR #31, Fly v16). The 27-item Thanksgiving core list
(`holiday-matrix.mjs --holiday thanksgiving-core`) in six states no run had covered: Hartford (14
priced stores), Des Moines (7), Oklahoma City (8), Portland (11), Salt Lake City (10) and Virginia
Beach (13). All six came back whole; Instacart did not refuse this Mac
(`thanksgiving-core-2026-11-18/`, not committed).

## Fixed

1. **A turkey breast at $2.99 a pound was shown at 50¢/lb, "81% less than the next-best store".**
   Fred Meyer's "Butterball Fresh Bone-In Turkey Breast, All Natural, 3-9 lbs." came as stated "6 lb",
   sold "each", $2.99. The range means the piece is weighed at the till, the 6 lb is its middle, and
   the $2.99 buys a pound. It won "turkey breast" in Portland. The QA cache holds the same shape seven
   more times, none of them caught before: Kroger's listing of the same breast ($0.33/lb), Smith's
   "Jennie-O Whole Fresh Turkey (16-20 lb)" at $1.59 ($0.08/lb), Giant's Shady Brook and Butterball
   birds ($0.02, $0.05 and $0.18/lb) and Martin's "Frozen Whole Turkey" ($0.12 and $0.20/lb). A turkey
   with a weight range in its name, 3 lb or more, priced "each" under $10 (the floor a whole bird
   already has, `TURKEY_EACH_MIN`) is a price per pound: it keeps its price and loses its unit price,
   so it is never crowned (`rangedTurkeyPerLbConflict`, src/normalize.js and ProductFactory.swift). Of
   283,088 cached rows the rule flags 32: these 8, and 24 that another check had already flagged. A
   real each price stands (Harris Teeter's "Kroger Whole Frozen Turkey (14-16 lb)" at $18.99).
2. **Flour answered "turkey".** Costco's "Lehi Roller Mills Turkey Flour, 25 lbs" (aisle "Bread
   Flour"; Turkey is a wheat) won "turkey" in Salt Lake City at $0.64/lb, "41% less" than Harmons'
   Norbest bird at $1.09/lb. "turkey flour" is now a compound that must be asked for by name
   (`HEAD_COMPOUNDS`, shared/match.js and Match.swift).

Tests: test/qa-ranged-turkey-per-lb-2026-11-18.test.js and `RangedTurkeyPerLbTests` (CoreTests.swift).
Web 960 pass, 1 skipped; iOS 483 pass.

## Checked, looks right

- ALDI's evaporated milk wins where there is an ALDI (95¢ in Des Moines and Oklahoma City, 79¢ in
  Virginia Beach), so the 15 Nov fix holds in three more states.
- Whole turkey: Stop & Shop 59¢/lb (Hartford), Publix 65¢ (Virginia Beach), ALDI 69¢ (Des Moines,
  Oklahoma City), Albertsons 99¢ (Portland), Harmons $1.09 (Salt Lake City).
- ALDI again wins the canned and dry staples at the prices seen elsewhere.

## For the owner

- **Costco Business Center cases win in Salt Lake City**: butter is "Butter, Salted, Block, 1 lb,
  30-count" at $64.68 ($2.16/lb, "20% less"), onions a 50 lb sack at $24.87. The unit prices are
  right, but nobody buys 30 lb of butter for Thanksgiving. No rule limits pack size today.
- **C-Town "Fr Turkey Breast", 1 ea at $1.09** is Hartford's best turkey breast, as an estimate. It is
  almost certainly $1.09 a pound, but the listing has no range or weight to prove it, so the new rule
  does not reach it.
- **Two Hartford winners carry garbled names from the store's feed**: Stop & Shop's
  "'' +COV FRSH PCNS 1PC MS -" (pecans, 1 lb at $2.39, "62% less"; likely in-shell) and C-Town's
  "Georgia Poultry Laboratory Network 9244 Double Crust Round" (pie crust, 19 oz at $1.39, "50% less").
  Both sit in the right aisle, so they match; the prices are plausible but unusually low.
- **Portland**: stuffing mix goes to a prepared stuffing (Reser's, 22 oz) and gravy to Bisto gravy
  granules, a dry mix compared by weight with jars. Neither claims a saving.
- **Fred Meyer's "Tequila Lime Flavor Turkey Breast Tenderloin, 24 OZ" is read as 24 fl oz**, so it
  drops out of the per-pound comparison. It never wins anything; noted, not fixed.
- Food Lion's 29¢ "each" sweet potato wins Virginia Beach too, as an estimate (see 15 Nov).
