# Halloween QA, 24 Oct 2026

Code: `main` at 9c4f010 (build 6's matcher). Live site: app.cartworth.app, same code.

What ran:
- The Halloween list (halloween candy, pumpkin, apple cider, caramel apples) through
  `ops/coverage/holiday-matrix.mjs` in 8 regions not covered before: AZ 85016, GA 30308, HI 96814,
  ME 04102, MN 55408, NM 87110, NY 11375, TN 37211. 8 to 22 priced stores each, no refusals.
- 19 Halloween "food styles" through `scripts/price-audit.js` in Chicago 60618, El Paso 79901,
  Forest Hills 11375 and San Francisco 94110.
- The live web app at phone size (Phoenix 85016, Forest Hills 11375): onboarding, the Halloween
  card, the "pumpkin" search.

## Bugs, most visible first

1. **"pumpkin" still matches non-food, and one counts in the per-store chart.** In Phoenix, ALDI's
   cheapest match for pumpkin is "Kirkton House Pumpkins Vinyl Tablecloth" at $3.39. The list also
   shows Bendon scratch art, Crofton silicone baking pans, a Pumpkin Masters light, a balloon, a glow
   wand and pumpkin porter. The matrix found two more non-food best picks: "Klein International Glow
   Fun Pumpkin Eye Mask" (Fry's, Phoenix) and "The Halloween Collection Pumpkin Ice Mold" (ALDI,
   Minneapolis). The decorative-pumpkin rule in `shared/match.js` is a blocklist that grows each round
   (mini, tigers, licensed, snaps, poppin). Proposed: for a bare "pumpkin", only accept produce: sold
   by the lb, a produce category, or a whole-pumpkin weight. Add a general non-food trap too
   (mask, mold, tablecloth, balloon, wand, light, kit, scratch art, pans, candle, wax).
2. **The cheapest real pumpkins are left out of "Best price".** The headline is per each, so
   Bashas' pumpkin at 44¢/lb, El Super's at 33¢/lb and Fry's 13 lb pumpkin at $7.99 can't
   compete, and a $2.19 "Lolita" small pumpkin wins. Per-lb pumpkins need an estimated price per
   pumpkin (the app already estimates caramel apples), or the card should say per-lb ones are
   listed separately.
3. **Weekly-ad cards say "· terms loading" indefinitely.** `public/js/views/sales.js:294`. Terms are
   fetched only when the deal is opened, so on the compare screen the label never changes (3 cards,
   more than 3 minutes). The deals screen's "checking ad terms…" (line 269) has the same problem.
   Say "open for terms", or fetch terms for the few cards shown.
4. **The Halloween tip vanishes the day it applies.** The card says candy is "50% off on Nov 1",
   but `featured()` in `shared/seasonal.js` drops Halloween at midnight on 31 Oct. Keep it one
   more day, with an "after Halloween" line.
5. **A store 21.5 miles away is switched on by default.** In Forest Hills, Sprouts (Hartsdale, 21.5
   mi) is one of the 8 default stores. Defaults should favour nearer stores.
6. **Suspect single picks:** "pumpkin pie" in Chicago is Jewel "Pumpkin Pie" per lb at $0.99,
   likely the produce pie pumpkin. "caramel apples" in Honolulu is Whole Foods "Caramel Apple
   Blossom" 8 oz (a pastry or candle?). "pumpkin" in Queens is CTown "Pumpkin" 1 ea at $0.59.
   "gluten free cookies" matched a cookie dough; "mexican hot chocolate" matched a truffle bar,
   not a drink mix.

## Coverage gaps, to improve

- **"pan de muerto": no answer in any ZIP**, El Paso included (El Super is there). "kosher candy":
  no answer anywhere. Día de los Muertos (1–2 Nov) has no occasion card, though the app finds
  El Super, Vallarta, Food City and Cardenas in the Southwest. A Día de los Muertos occasion
  (pan de muerto, Mexican hot chocolate, tamales, marigolds, sugar) would fit.
- **El Paso prices only 7 stores**, and 10 of 19 food styles had no answer there.

## Works well

- Halloween candy is a real assorted bag in all 16 states tested over two days. Apple cider is
  right everywhere. Caramel apples are right except Honolulu.
- Fun size, full size, candy corn, peanut-free (Charms, peanut and gluten free), sugar-free
  (Russell Stover), gummy worms, popcorn kernels, caramel dip, apple cider donuts and tamales all
  matched the right products.
- Onboarding: Phoenix found 16 stores, Forest Hills 22. The Halloween card counts down correctly
  across the 1 Nov clock change in every US time zone.

## Tooling note

The food-style audit's fresh directory builds left 19 of 22 stores unresolved in Forest Hills and
most stores in San Francisco. The same ZIP resolved 22 on the live site and in the morning's run,
so it was this Mac's connection to Instacart. The audit printed "unresolved: …" and carried on, so
its results there are partial. It should stop, or say so in each row.
