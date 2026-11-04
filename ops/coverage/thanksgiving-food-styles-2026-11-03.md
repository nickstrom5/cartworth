# Thanksgiving food styles QA, 3 Nov 2026

Code: `main` at 44b00a1 (build 6's matcher), and this branch's fixes. Nothing deployed.

What ran:
- 30 regional, cultural and dietary Thanksgiving styles through the production search path
  (`directory → searchStore → bestPerStore`, as `scripts/price-audit.js` runs it) in 7 ZIPs:
  El Paso 79901, Houston 77004, Atlanta 30308, New Orleans 70115, Brooklyn 11226, Honolulu 96814,
  Minneapolis 55408. 81 priced stores in all, every directory fully resolved.
- Every product every store returned was saved, so each answer below is scored twice from the same
  live results: with `main`'s matcher and with this branch's. 30,038 distinct (query, product)
  pairs; the iPhone matcher (`ios/App/Core/Match.swift`) scores all of them identically to
  `shared/match.js` after the fixes.
- Instacart answered 429 to the first run while another session was sweeping; that run was thrown
  away. The paced rerun waited out every Instacart 429. Walmart kept answering 429 intermittently:
  the rows marked `*` below are missing Walmart and are partial.

## Answers per style

Stores with a real answer / stores priced, `main` → this branch. `*` = partial (Walmart rate-limited).

| Style | 79901 | 77004 | 30308 | 70115 | 11226 | 96814 | 55408 |
|---|---|---|---|---|---|---|---|
| collard greens | 3/7 | 5/14 | 8/13 | 3/8 | 13/20 | 2/8 | 4/11 |
| cornbread dressing | 0→**3**/7 | 0→**3**/14* | 2→**3**/13 | 1→**2**/8 | 1→**10**/20 | 0→**3**/8 | 0→**4**/11 |
| sweet potato pie | 2/7 | 3/14* | 5/13 | 3/8 | 5/20 | 2/8 | 2/11 |
| chitterlings | 0→**1**/7 | 0→**3**/14 | 0→**2**/13* | 0→**2**/8 | 0→**2**/20 | 0→**1**/8 | 0→**2**/11 |
| smoked turkey wings | 1/7 | 3/14 | 3/13 | 2/8 | 6/20 | 1/8 | 2/11 |
| mac and cheese | 6→**7**/7 | 10/14 | 11→**12**/13 | 7/8 | 18→**19**/20 | 6→**7**/8 | 10/11 |
| tamales | 2→**6**/7 | 3→**10**/14 | 4→**6**/13 | 1→**5**/8 | 6→**10**/20 | 3→**4**/8 | 3→**7**/11 |
| pernil | 0/7 | 0/14 | 0/13 | 0/8 | 0/20 | 0/8 | 0/11 |
| arroz con gandules | 0/7 | 0/14 | 0/13 | 0/8 | 0/20 | 0/8 | 0/11 |
| flan | 1→**3**/7 | 2→**5**/14 | 0→**4**/13 | 0→**2**/8 | 5→**9**/20 | 0→**2**/8 | 0→**3**/11 |
| tres leches | 1→**2**/7 | 2→**5**/14 | 1→**4**/13 | 0→**2**/8 | 1→**4**/20 | 1/8 | 1→**2**/11 |
| andouille | 0→**4**/7 | 0→**7**/14* | 0→**8**/13 | 1→**6**/8 | 4→**14**/20 | 0→**4**/8 | 1→**6**/11 |
| turducken | 0/7 | 0/14 | 0/13 | 0/8 | 0/20 | 0/8 | 0/11 |
| kosher turkey | 0/7 | 1/14* | 0/13 | 0/8 | 6/20 | 0/8 | 0/11 |
| halal turkey | 0/7 | 0/14* | 0/13 | 0/8 | 1/20 | 0/8 | 0/11 |
| tofurky | 1→**4**/7 | 1→**4**/14 | 2→**5**/13 | 1→**2**/8 | 6→**11**/20 | 2→**4**/8 | 3→**6**/11 |
| plant based roast | 2→**1**/7 | 4→**2**/14 | 3→**0**/13 | 2→**0**/8 | 9→**4**/20 | 4→**2**/8 | 5→**0**/11 |
| vegan gravy | 0→**1**/7 | 0→**1**/14 | 0/13 | 0/8 | 0→**1**/20 | 0/8 | 0/11 |
| vegan butter | 1→**3**/7 | 1→**4**/14 | 1→**4**/13 | 1→**3**/8 | 2→**13**/20 | 0→**3**/8 | 0→**6**/11 |
| gluten free stuffing | 1/7 | 2/14 | 3/13 | 2/8 | 7→**8**/20 | 0/8 | 5/11 |
| gluten free pie crust | 1/7 | 1/14 | 2/13 | 1/8 | 5/20 | 1/8 | 4/11 |
| lumpia wrappers | 0/7 | 0→**1**/14 | 0/13 | 0/8 | 0/20 | 1→**2**/8 | 0/11 |
| japchae noodles | 0→**1**/7 | 1→**2**/14* | 1→**3**/13 | 0→**1**/8 | 1→**4**/20 | 0→**3**/8 | 0→**2**/11 |
| wild rice | 4→**3**/7 | 7→**2**/14 | 8→**2**/13 | 4→**1**/8 | 15→**5**/20 | 5→**1**/8 | 8→**6**/11 |
| spiral ham | 2/7 | 4→**5**/14 | 2→**4**/13 | 3→**4**/8 | 6→**8**/20 | 2/8 | 2→**3**/11 |
| honey ham | 6/7 | 9/14 | 10/13 | 6/8 | 16→**17**/20 | 5/8 | 9/11 |
| prime rib | 3/7 | 2→**6**/14 | 2→**3**/13 | 2→**4**/8 | 2/20 | 3→**4**/8 | 2→**3**/11 |
| oysters | 4→**3**/7 | 10→**9**/14 | 8→**7**/13 | 4→**3**/8 | 16→**14**/20 | 5/8 | 7/11 |
| hawaiian rolls | 5/7 | 9/14 | 9/13 | 6/8 | 15/20 | 6/8 | 9/11 |
| canned yams | 0→**4**/7 | 0→**7**/14 | 0→**5**/13 | 0→**5**/8 | 0→**13**/20 | 0→**2**/8 | 0→**6**/11 |

The ZIPs: El Paso 79901, Houston 77004, Atlanta 30308, New Orleans 70115, Brooklyn 11226,
Honolulu 96814, Minneapolis 55408. A falling count is a wrong answer removed (plant based roast,
wild rice, oysters); see below.

## Bugs, most visible first (all fixed on this branch, web and iPhone)

1. **"vegan butter" barely had an answer.** One store per ZIP at most, two in Brooklyn and none in
   Honolulu or Minneapolis. The plant butters every store stocks are labelled "Plant Butter",
   "Plant-Based" or "Dairy Free", rarely "vegan", and a plant base (oat, soy, coconut, "plant") was itself a penalty.
   Now 3 to 13 stores per ZIP: Country Crock Dairy Free Plant Butter, Melt, Miyoko's, Le Grand. A
   diet word in the query is now a requirement that the stricter labels meet: plant-based meets
   vegan, vegan meets vegetarian, dairy-free meets vegan only for a dairy food (a dairy-free gravy
   can still be turkey stock). Nut and seed butters and vegan butter cookies are still refused.
2. **"plant based roast" was answered with slices, shreds, wings and hot dogs in all 7 ZIPs.**
   Field Roast's Creamy Original slices (Walmart), pepperoni slices (Kroger), BBQ shreds and buffalo
   wings (Minneapolis) and Whole Foods' "Classic Smoked Plant Based Frankfurter" all scored 0.76–0.80, because the maker is called Field Roast. The head
   noun of a search no longer counts when only the brand supplies it, and a name that repeats its
   brand is read without it. The real roasts now answer: Field Roast Celebration Roast, Gardein
   Turk'y Roast, Tofurky Roast & Gravy, Whole Foods' Hazelnut Cranberry roast and Tofurky's stuffed
   roast (both refused before, for "stuffed" and the flavour). Atlanta and New Orleans now show no
   answer rather than a wrong one, and so does Minneapolis, where all five answers were wrong.
3. **"wild rice" was a 90-second pouch of long grain rice.** "Great Value Ready-to-Heat
   90-Second Long Grain & Wild Rice" was the best wild rice in all 7 ZIPs, Minneapolis
   included. Rice-A-Roni, Near East, Minute and Bowl & Basket blends made up
   most of the other answers, with H Mart's and Foodland's "Wild Sweet Rice" (glutinous rice) and, in
   Minneapolis, Cub's "Wild Harvest Rice, Organic, Brown, Long Grain" (the brand is Wild Harvest).
   Blends ("& Wild Rice", "with Wild Rice", "Blend", "Medley") and names without the
   words together are now refused unless the shopper asks for a blend. Lundberg, Whole Foods and
   other plain wild rice answer; in Minneapolis, Canoe and KC's Best Minnesota wild rice (6 stores).
4. **Regional names had no answer though the stores carry the product.** Now matched on both sides
   of the comparison:
   - "cornbread dressing" (no answer in 4 ZIPs): Southern dressing is labelled stuffing. Now 2–10 stores.
   - "chitterlings" (no answer anywhere): "Pork Chitterlings" was refused for "pork", and "Chitlins"
     never matched. Now 1–3 stores per ZIP (Smithfield, IBP, Uncle Lou's, Aunt Bessie's).
   - "canned yams" (no answer anywhere): the cans say "Yams" or "Cut Sweet Potatoes in Syrup", not
     "canned". US yams are now sweet potatoes (not a mountain, purple, Chinese or ube yam), and a
     syrup or a canned aisle is "canned". Now 2–13 stores (Bruce's, Princella, Glory, ALDI).
   - "andouille" (no answer in 4 ZIPs): andouille is a sausage, and 'sausage' was a trap. Now 4–14.
   - "mac and cheese": boxed macaroni and cheese ("Macaroni & Cheese Dinner") never matched "mac";
     the answers were Daiya, Goodles, a DEVOUR bacon bowl and Zatarain's. Now the boxed dinners.
   - "japchae noodles": now sweet potato glass noodles and dang myun (1–4 stores, was 0–1).
   - "tres leches" and "flan": the cake and flavoured flans (coconut, vanilla) were refused. 1–9 stores.
5. **"prime rib" was a beef stick, pork ribs and short ribs.** "Archer Prime Rib Style Beef Stick",
   1 oz, in El Paso, Houston, Brooklyn and Honolulu; The Fresh Market's "Prime St. Louis Pork Spare
   Ribs" (Atlanta, Brooklyn) and "Prime Short Ribs" (New Orleans); Costco's "USDA Prime Beef Chuck
   Short Ribs" (El Paso, Honolulu). Prime rib is now a beef rib roast, so ribeye and standing rib
   roasts answer (Houston: 6 stores, was 2). The first version of this fix let in BJ's "Boneless Pork
   Rib Roast" (Atlanta) and Albertsons' "Chuck Cross Rib Roast" (El Paso); both are refused now.
6. **"oysters" matched oyster mushrooms.** Albertsons' and Sprouts' (El Paso), The Fresh Market's
   King Oyster Mushrooms (New Orleans) and Seafood City's (Honolulu): the rule that keeps oyster
   mushrooms in a mushroom search also let them answer "oysters". Also refused now: 99 Ranch's King
   Oyster Mushroom and H Mart's "Tobagi Oyster Kimchi", which the first version of this fix let through.
7. **"tamales" was candy and tamale dough.** Kroger's "HOT TAMALES 4.25oz Tropical Heat Box"
   (Atlanta, Chewy Candy) and El Super's "Coarse-Ground Tamale Masa" (El Paso). Hot Tamales in a candy
   aisle or a candy box are now refused for "tamales" (Rouses' Delta-style "Old Style Hot Tamales"
   still answer), and masa is a trap ("tamale masa" still finds it). Tamales went from 1–6 stores per
   ZIP to 4–10. Frozen tamales and
   frozen lumpia wrappers are no longer marked down for being frozen, which brought in Seafood City's
   lumpia wrappers in Houston.
8. **Hardening found while fixing, not seen as a wrong live headline:** a vegan analogue no longer
   answers a plain "turkey", "butter" or "ham" search ("Field Roast Celebration Roast Vegan" filed
   under Turkey scored 0.88 for "turkey" in a probe). "gluten free" is one claim: "Fat Free" and
   "Sugar Free" no longer half meet it. A search for a whole brand ("tofurky", "kerrygold") finds
   that brand's products, a word of a brand does not ("Milk-Bone" for "milk").
   Spiral hams that are glazed or fully cooked, and "Pecan Smoked" andouille, are no longer refused.

## Not fixed: coverage gaps and proposals

- **No answer anywhere: "pernil", "arroz con gandules", "turducken".** Not a matching problem: the
  stores' own searches return no pork shoulder for "pernil", no Goya mix for "arroz con gandules",
  and nothing for "turducken" in any of the 81 stores (Fiesta, El Super, Food Bazaar, CTown, Rouses
  included). The matcher now treats "pernil" as pork shoulder, so a search alias would answer it.
  Proposed: a small table of search aliases in the search layer, on both platforms, used when a
  store returns nothing (pernil → pork shoulder; arroz con gandules → gandules; lumpia wrappers →
  spring roll wrappers; turducken → none, say so).
- **"halal turkey" and "kosher turkey" have almost no answers.** Halal: one store (ShopRite
  Brooklyn, turkey wings). Kosher: Brooklyn 6 stores, Houston Costco only. The qualifiers are
  respected, which is right; the answers that do exist are parts (drumsticks, wings, ground), the
  same as a plain "turkey" search.
- **"collard greens" headlines canned seasoned greens.** Glory and Margaret Holmes 27 oz cans win in
  every ZIP, because a fresh bunch is priced per bunch and the comparison is by weight. Fresh
  bunches priced per pound (Food Bazaar $1.49/lb) do rank. Same shape as the Halloween per-lb
  pumpkins, inverted: the card could name per-bunch greens separately.
- **"tamales" includes canned tamales.** Hormel's 15 oz cans in chili sauce are the cheapest tamales
  by weight in El Paso, Atlanta, New Orleans and Honolulu. They are tamales; a shopper buying
  for Thanksgiving wants fresh or frozen.
  Left alone: the name gives no sign of the can, and per-dozen packs are counts.
- **"flan" includes a dry mix.** Walmart's "Royal Flan - No Caramel (8 Servings)", 3.81 oz. Its
  name never says mix.
- **Costco "Empire Kosher Turkey, 14-16 lbs" shows size "1416 lb"** in Houston. The price per
  pound ($4.44) and the estimated $67.75 package are right; the size text comes from Instacart.
- **"lumpia wrappers"** answer only at Filipino grocers (Seafood City Houston, Foodland Honolulu).
- **"gluten free stuffing" has no answer in Honolulu**, and "vegan gravy" none in Atlanta, New Orleans
  or Honolulu: the stores searched carry none.

## Occasion suggestions (proposed, not added)

`shared/seasonal.js` is generated from `ios/App/Services/Seasonal.swift`, and the Thanksgiving card
belongs to the deals and occasion-card session, so this is a proposal for that change. The list is
the classic dinner only. Each of these styles now answers in every one of the 7 ZIPs (gluten free stuffing in 6), so they
could be offered as "make it your way" suggestions on the card without showing an empty result:

- Southern: collard greens, cornbread dressing, sweet potato pie, mac and cheese, smoked turkey
  wings, chitterlings, canned yams
- Latino: tamales, flan, tres leches
- Cajun: andouille, oysters
- Vegan and gluten-free: vegan butter, gluten free stuffing, gluten free pie crust, tofurky
- Also: honey ham, spiral ham, prime rib, Hawaiian rolls, wild rice, japchae noodles

Not yet: plant based roast (4 of 7), vegan gravy (3), kosher turkey (2), lumpia wrappers (2), halal
turkey (1), pernil, arroz con gandules and turducken (none).

## Tests

- `test/qa-thanksgiving-food-styles.test.js`: every case above, wrong answers rejected and real
  ones matched, plus controls.
- `ios/Tests/CoreTests.swift`, `ThanksgivingFoodStylesTests`: the same cases against the iPhone matcher.
- Parity: the 30,038 live (query, product) pairs from this run score identically in Swift and JS.
- The iOS core XCTests (CoreTests, PricingRound2Tests, ThanksgivingPricingTests: 332 tests, the new
  class included) pass, built with Xcode 1.app's Swift as a macOS package from the same files
  `ios/linux/run-core-tests.sh` uses. The simulator run did not finish: xcodebuild sat idle on both
  iPhone 18 simulators for over 30 minutes while other sessions' runs were also stuck there.
