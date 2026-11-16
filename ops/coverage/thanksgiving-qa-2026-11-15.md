# Thanksgiving QA, 15-16 Nov 2026 (11 days out)

Code: `main` at 156cb44 (PR #28, Fly v14). Two passes:

- The 27-item Thanksgiving core list (`holiday-matrix.mjs --holiday thanksgiving-core`) in six states
  no run had covered (TN, MO, MD, IN, KY, AL). **Instacart refused this Mac during Birmingham**, the
  first state, so the run stopped there: ALDI, Whole Foods and Trader Joe's are whole, the Instacart
  stores only for the first few items (`thanksgiving-core-2026-11-15/`, not committed).
- An offline probe of the same list against about 100 product names a store with no aisle could
  return (`relevance()` only): pet food, candles, snacks, drinks, kitchen tools.

## Fixed

1. **ALDI's evaporated milk was dropped in every state.** "ALDI Evaporated Milk", 12 fl oz at 79-95¢,
   comes with the listing URL `.../18647623-baker-s-corner-vitamin-d-added-12-fl-oz`. ALDI renames its
   house brands "ALDI <product>" on Instacart and the URL keeps the brand, so not one word agreed, and
   the check for a listing that names another product (`slugProductConflict`, 9 Nov) withheld its unit
   price. It was dropped this way in 7 of the 12 states with an ALDI in the 13-14 Nov run (in the other
   five ALDI's search did not return the can) and in Birmingham, where the best
   evaporated milk was Whole Foods' organic can at $2.88. A URL that is only a house brand and label
   words ("vitamin d added", "organic") names no product and now contradicts nothing (src/normalize.js,
   ProductFactory.swift). Of 223 rows the check flags in the QA cache, this is the only one it clears;
   the pretzel bag sold as stuffing and the rest stay flagged.
2. **Onion rings, celery soda and marshmallow creme answered the staple** when a store gives no
   aisle: "Onion Rings" scored 0.80 for "onions", Dr. Brown's "Cel-Ray Celery Soda" 0.92 for "celery",
   "Marshmallow Fluff" and Peeps "Marshmallow Chicks" 0.80 for "marshmallows". None won in the state
   runs, where these came from stores that give an aisle, but ALDI and Trader Joe's give only the name.
   Each is now a compound that must be asked for by name (`HEAD_COMPOUNDS`, shared/match.js and
   Match.swift); "onion rings" and "marshmallow fluff" still find them.

## 16 Nov: Indianapolis, Louisville, Baltimore (on PR #29's code, Fly v15)

The run resumed for TN, MO, MD, IN and KY. IN, KY and MD came back whole (12, 11 and 19 priced stores);
Instacart refused this Mac again in St. Louis (7 stores priced, 10 unresolved) and TN was not reached.

- **ALDI's evaporated milk now wins** all three: 95¢ in Indianapolis and Louisville, 79¢ in Baltimore
  ($8.43-10.13/gal, against $30.72/gal before the fix).
- Whole turkey: Giant 49¢/lb (Baltimore), Publix 65¢ (Louisville), Walmart chain-wide 84¢ (Indianapolis).
- ALDI again wins the canned and dry staples at the same prices as elsewhere.

## Checked, looks right (Birmingham, and the probe)

- ALDI wins most of the list at the prices seen elsewhere: butter $1.99/lb, green beans 50¢, canned
  pumpkin 99¢, a 37 oz pumpkin pie $6.99, chopped pecans $3.59 for 8 oz.
- Publix whole turkey 65¢/lb (Instacart), as in Florida and Georgia.
- The probe's other traps are already kept out: gravy dog food, peanut butter, apple butter, cream
  cheese, celery salt, brown sugar oatmeal, sweet potato fries, green bean casserole, Wild Turkey
  bourbon, turkey bacon, pumpkin pie spice, condensed milk for evaporated.

## For the owner

- **Celery "86% less"**: ALDI's 95¢ celery against Whole Foods' "Organic Celery Sticks", 8 oz at
  $3.49, the only other celery found in Birmingham. Cut snack sticks are celery, so the claim stands,
  but it compares a whole head with a convenience pack.
- **Grocery Outlet "Président Salted Butter", 7 oz for 49¢** ($1.12/lb) is the best butter in Baltimore
  and Columbus, 44% under ALDI's $1.99/lb. The same price in both cities means it is Grocery Outlet's own
  Instacart listing; a closeout store can do that, but the brand usually sells for several dollars. Like
  the Save-A-Lot onions, it is too close to real prices for the plausibility guard (8x) to catch.
- **St. Louis and Tennessee** wait for Instacart to let this Mac back in; the run resumes where it
  stopped (`--only TN,MO`; St. Louis's partial run is kept as `MO-thanksgiving-core.partial.json`).

## iPhone 1.0.3

Build 10 (1.0.3) carries every iOS change since 1.0.2: the widget, the weekly-ad callout, the holiday
"See prices" flow, plan progress, and the matcher fixes of 13-15 Nov. Archived with the release Xcode
(27.2, 27B52, iphoneos27.2 SDK) and uploaded to App Store Connect on 16 Nov; it appears in TestFlight
after processing. Not submitted for review.
