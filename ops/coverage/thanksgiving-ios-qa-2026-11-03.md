# Thanksgiving QA of the iPhone app, 3–4 Nov 2026

Code: `main` at 44b00a1 (build 6, in App Review) on 3 Nov; on 4 Nov this branch rebased onto `main` at
ecdd7d9 (PRs #12 and #14 merged) and re-walked. Debug build with `/Applications/Xcode 1.app` (release
Xcode), iPhone 18 Pro simulator, iOS 27.0. Live prices, ZIPs 60618 Chicago, 30308 Atlanta and 94110
San Francisco. Web comparison: app.cartworth.app (production, same matcher as build 6).
Screenshots: `thanksgiving-ios-2026-11-03/` (BEFORE = build 6 behaviour, AFTER = this branch).

## Fixed in this branch

1. **Onboarding: the spinner showed on "Use my location" when a ZIP was typed, and the keypad stayed
   up** (3 Nov review recording; reproduced, `02-onboarding-zip-loading-BEFORE.png`). One `busy` flag
   drove both buttons. Now the spinner is on the button that was used, the field and both buttons are
   disabled while it works, and the keypad is dismissed (`08-onboarding-zip-loading-AFTER.png`).
   Found while fixing it:
   - The welcome screen waited for the whole store directory (20–40 s in Chicago and Atlanta) behind
     that spinner, although the store step has its own progress. The store step now opens as soon as
     the ZIP is resolved and shows "Finding prices at 15 stores…" (`09-…-progress-AFTER.png`).
   - If the directory failed outright, the store step showed an empty list and a disabled "Choose at
     least one store" with no way forward. It now shows the error and Try again; the button reads
     "Finding stores…" while the list loads.
   - The ZIP field took any number of digits: "3030830308" left Continue grey with no reason given.
     Now digits only, five at most, and it offers the postal-code autofill.
2. **The milk card named a cheese: "Sold by the lb, so not ranked per gal: Trader Joe's $19.99/lb"**
   (`06-milk-60618-BEFORE.png`). The matcher, not the card: Trader Joe's "Raw Milk Cave Aged Le
   Gruyère" never says "cheese" and scored 0.81 for "milk" (cut 0.55), so `perLbAside` correctly
   listed a per-lb "match". Fixed in `shared/match.js` and `ios/App/Core/Match.swift` together: named
   cheeses (gruyere, mozzarella, cheddar, brie, …) are traps for the dairy searches only (milk, cream,
   butter). Not general traps, because elsewhere a cheese name is a flavour ("White Cheddar Popcorn",
   "Cheddar Crackers" still match). The Gruyère now scores 0.32 (also under the 0.4 weekly-ad bar).
   "Whole Milk Mozzarella" and "Cream Havarti" are caught by the same rule. Production web shows the same line
   today, so this fixes both once deployed. Tests: `test/qa-match-relevance.test.js`,
   `MatchTests.testNamedCheeseIsNotDairy`. After: `11-milk-30308-AFTER.png`.
3. **"Compare" links ran a search the Search tab didn't know about.** `cartworth://search?q=stuffing`
   showed stuffing results under a field still reading "milk"
   (`12-stuffing-deeplink-stale-field-BEFORE.png`). The same path serves Compare from the List, a deal
   and a watch: `MainTabs` called `search.run` directly, so the previous search's refine filters
   stayed on, and the free-search limit was never checked (the search was still counted). It now
   goes through `SearchView.start()` like a typed search. After: the field reads "cranberry sauce"
   and the milk refine chips are gone (`13-cranberry-deeplink-field-AFTER.png`).
4. **Settings: tapping "Update" beside the ZIP also ran "Use my location".** The ZIP field, Update
   and the location arrow share one Form row with default-style buttons, and a tap anywhere in such
   a row fires every button in it. Typing 94110 and tapping Update raised the location-permission
   alert (`24-settings-94110.png`); had it been allowed, the device location could have replaced
   the ZIP just typed. Now `.buttonStyle(.borderless)` on both layouts of the row; after a
   permission reset, Update no longer prompts (`25-settings-update-AFTER.png`).
5. **List: typing a holiday list item after item lost items.** Return added the item and dropped
   focus, so the next item typed went nowhere (4 typed, 2 added: `18-list-thanksgiving.png`).
   Return now keeps the keyboard up (`.submitLabel(.next)`); Return on an empty field, or dragging
   the list, puts it away (`19-list-rapid-add-AFTER.png`, five items in a row).
6. **BEST PRICE card: "Whole Foods Market" wrapped and its second line was drawn over the product
   name** ("Market" on top of "365 ABF Frozen Turkey 10/14", `27-turkey-94110-dark.png`; also seen
   on milk in Atlanta while results streamed in). The card had room for the name on one line.
   `WordFlow` (the never-break-a-word layout in `StoreName`) broke a line on *any* overrun, and the
   `FlowRow` → `StoreTag` HStack hands it back its own ideal width less rounding, so it broke before
   "Market" inside a row sized for one line. It now allows a half-point overrun. Not confirmed on
   screen: when re-run the headline store was Lucky Supermarkets (one line, no overlap,
   `28-turkey-94110-storename-AFTER.png`), and I could not get Whole Foods back on top.

## Not fixed here (other owners, or needs a decision)

- **No Thanksgiving card on 3 Nov.** Thanksgiving is 23 days out and `featured()` looks 21 days
  ahead, so only "Diwali in 5 days" shows, on the phone and on the web alike (`04-search-home-60618.png`). Two
  cards are allowed and the second slot is empty. Thanksgiving shopping (and the turkey ads) start
  earlier than three weeks; a longer lead for Thanksgiving (28–30 days) would show it now.
  `shared/seasonal.js` and `Seasonal.swift` must change together; left to the web/seasonal owner.
- **A bare "turkey" headlines ground turkey in Chicago** (ALDI Kirkwood $2.19/lb), while in Atlanta
  the web's best is ALDI's Butterball Frozen Whole Turkey at $1.27/lb. In November "turkey" usually
  means the bird. For the turkey/deals session.
- **One Instacart 429 switches Instacart off until the app is quit.** `HostGate.block` keeps a
  host blocked "for the life of the process" (the owner's rule). After one 429 (likely tonight, with
  three audit sessions on this Mac's IP), Publix in Atlanta failed for every later search, and its
  "retry" chip can never succeed. iOS keeps an app alive for days, so a shopper sees half their stores
  missing on Thanksgiving week with no explanation. Proposed: block for a time window (for example
  10 minutes, or the `Retry-After` value) and say "Publix is busy, try again in a few minutes" on the
  chip. Not changed: it is a stated owner rule.
- **Milk's weekly-ad strip includes "Carnation Evaporated Milk 12 fl oz, $15.99 (Costco)"** in
  Atlanta. Evaporated milk is an `ALT_BASE` word, but the ad bar (0.4) lets it through. For the deals session.
- Trader Joe's "turkey" is 6 oz of sliced turkey breast at $15.97/lb ("off scale" on the chart). It
  is turkey; TJ's fresh birds are not listed yet.
- **Pumpkin pie headlines a pie that is out of stock** (Atlanta, `14-pumpkin-pie-30308.png`): BEST
  PRICE $3.53/lb, ALDI Bake Shop Pumpkin Pie 24 oz $5.29, and the same row carries "Out of stock".
  The next in-stock price is TJ's $4.40/lb. Out-of-stock rows should not win the headline (or the
  card should say so). For the matcher/compare owner; `Compare` is shared with the web.
- **"Plan the cheapest trip" with 5 items ran over 2 minutes with only a spinner** (Atlanta, Publix
  and Kroger via Instacart still loading on Search at the time; `20-trip-plan-30308.png`). No "2 of
  5 items" progress and no partial plan; I relaunched before it finished. In San Francisco the same
  list took 3–4 minutes (`31-trip-plan-94110.png`). `TripPlanner.price` prices two items at a time
  and each pair waits for every store, so the slowest store sets the pace for the whole list. With a
  15-item Thanksgiving list this is the screen people will wait on.
- **The trip plan's turkey misses the cheaper Lucky price shown on Search.** In 94110 the plan
  says turkey 14 lb is cheapest at Whole Foods, $34.86 ($2.49/lb); Search for "turkey" a few minutes
  earlier headlined Lucky Supermarkets at $1.79/lb ($25.06 for 14 lb). Either "turkey 14 lb"
  matches differently from "turkey", or Lucky's price did not reach the plan. Not chased further.
- **Deals stayed on "Loading weekly ads…"** for the minutes I watched, in Atlanta and in San
  Francisco (`16-deals-30308.png`, `29-deals-94110-dark.png`). Possibly the same Instacart/flyer
  throttling as above; there is no timeout message.
- **A `cartworth://search` link that arrives during launch is dropped.** Opened right after a cold
  launch it left Search on its home screen; the same link with the app running works.
  `.onOpenURL` sits on `MainTabs`, which is not built yet during the ~5 s blank launch screen (debug
  build, seen on every launch today). Worth checking on a release build before treating it as real;
  a Universal Link or widget tap would hit the same path.
- At the largest accessibility size (AX5) the List's "Add item — milk 1 gal…" field stays at its
  small size while everything around it grows (`21-list-dark-AX5.png`), and Settings hyphenates
  "Lo-cation" beside "Atlanta 30308" (`22-settings-dark-AX5.png`). Readable, not broken.

## Parity with app.cartworth.app (Atlanta 30308)

Web on 3 Nov evening, phone on 4 Nov morning (rebased build, so including PR #14's core-list
changes), so prices may have moved between the two.

| Search | Phone | Web |
| --- | --- | --- |
| milk | ALDI Friendly Farms Whole Milk $2.83/gal; no per-lb line (fixed) | Same best price; card still names the Gruyère (production, unfixed) |
| turkey | ALDI Brined Young Turkey 99¢/lb (whole bird); Whole Foods $2.49/lb (`15-…`) | ALDI Butterball Frozen Whole Turkey $1.27/lb |
| cranberry sauce | ALDI Sweet Harvest Jellied 14 oz $1.66/lb; WF $3.07; TJ $3.99 (`13-…`) | WF 365 Organic Jellied 14 oz $3.07/lb; TJ $3.99/lb; no ALDI line |
| pumpkin pie | ALDI Bake Shop 24 oz $3.53/lb (**out of stock**); TJ $4.40; WF $7.99 (`14-…`) | TJ 25.39 oz $6.99 ($4.40/lb); WF $7.99/lb; no ALDI match |
| stuffing | ALDI Chef's Cupboard Turkey Stuffing 6 oz, 15.8¢/oz | — |

The phone found ALDI for cranberry sauce and pumpkin pie where the web did not, a day apart; that
is more likely ALDI's catalogue or a web timeout than a matcher difference (both use the same
`relevance()`), but it is the one parity gap that would change a shopper's answer.

San Francisco 94110 (phone only): 14 chains and 40 other stores within 15 miles, 11 selected by
default. Turkey: Lucky Supermarkets Honeysuckle White Frozen 10–16 lb $1.79/lb; Smart & Final
(online price) $2.19 marked "≈ same"; Whole Foods $2.49; Lucky's $1.99/lb Butterball and Smart &
Final's "10% off" in the ads strip.

Web-only differences seen: opening `#/compare?q=turkey` directly showed the home screen for a few
seconds before the results, and the tab title kept the previous query ("turkey — Cartworth" over
cranberry sauce results) until the results arrived. Pressing Enter in the web search box after a
triple-click select did not submit; the Compare button did. For the web session.

## Works well

- Onboarding by ZIP: Chicago 20 stores within 15 miles, 13 picked by default; Atlanta 14 stores.
  Badges (shelf / Instacart / national / weekly ad only) and distances read clearly.
- Turkey in Chicago: 9 stores priced, with provenance badges ("Instacart") on every online price and
  the TJ deli outlier marked "off scale" instead of stretching the chart.
- Milk: the "≈ same" verdict between ALDI $2.53 and Mariano's online $2.99 correctly claims no saving.

## Checked and fine

- Paywall (launch without `-proUnlocked`, tap Plan): "Trip planning is part of Pro", the seven Pro
  features, Monthly $3.99 / Yearly $19.99 (selected) / Lifetime $29.99, "Not now" (`30-…`). The
  free banner on Search reads "You have 3 free searches today".
- Dark mode: Search home, results, Settings, Deals, List, paywall all legible (`21`–`30`).
- Empty list: "Your list is empty" with the size hint (`17-list-empty.png`).
- VoiceOver labels: the icon-only location arrow is labelled "Use my location"; the store name is
  one element. Not a full VoiceOver pass.

## Not covered

- iPad layouts and rotation: no iPad simulator was free to boot without disturbing the other
  sessions' test runs.
- Offline and slow network: not simulated (needs the Network Link Conditioner on the host).

## Tests

- `npm test` (rebased): 883 tests, 882 pass, 1 skipped, 0 fail.
- iOS `AppTests` on iPhone 18 Pro (rebased, before fixes 4–6): 440 tests, 1 skipped, 0 failures,
  including `MatchTests.testNamedCheeseIsNotDairy`. Re-run after fixes 4–6: 440 tests, 1 skipped,
  0 failures.

## Environment notes

- `-qaReset` did not return the app to onboarding (the app opened on Search); a clean reinstall did.
- Three other sessions ran `xcodebuild test` on the same simulator during this pass. Each run reinstalls the
  app and wipes its data, so the walk had to wait; parallel test runs should use separate simulators.
- The simulator's first launch after a fresh install showed a blank screen for about 5 s (debug build).
