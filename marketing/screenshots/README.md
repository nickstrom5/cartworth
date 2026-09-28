# Cartworth — App Store screenshots

`iPhone-6.9in/` and `iPad-13in/` are the two sets meant for upload. `evidence/` holds frames that
must **not** be uploaded; they are here so the claims below can be checked rather than believed.
The three dated folders at the bottom are the 2026-09-22 QA run, kept for comparison.

Captured **2026-09-23** by `ios/UITests/SubmissionSet.swift` driving the real app against live
store data for ZIP **60618** (Chicago), launched `-qaZip 60618 -proUnlocked`, light appearance,
default Dynamic Type, clean status bar. Every PNG is an unretouched device-resolution frame
straight out of the simulator — no cropping, scaling, retouching or caption artwork. Every price
in every frame is a real price read from a store's own published listing on that date.

Build point: `ios/App` as of **2026-09-23 06:45** local. Other work was editing app sources while
this ran, so re-shoot if `Compare`, `Components`, `SearchView`, `DealsView`, `ListsView` or
`TrackingView` change again.

## Re-capture, 2026-09-28 (read this first)

`2026-09-28-iphone/` (20 frames, iPhone 18 Pro Max, iOS 27.0) and `2026-09-28-ipad/` (9 frames,
iPad Pro 13-inch (M5), iOS 27.0): `scripts/capture-site-shots.sh`, the same `SubmissionSet`, ZIP
60618, `MARKETING=1`, built from `main` at 14dbdc6 plus bc012b8. Two blockers described below are
gone:

- **Shot #3 exists on iPhone:** `2026-09-28-iphone/06-deal-detail-fineprint.png`. Deal pictures
  now obey `-qaHideRemoteImages`, so the frame has no flyer clipping and no packaging. (The
  `HAS-FLYER-ART` file names are fixed in the test; the pictures are hidden in those frames too.)
- **The iPad chips no longer cover the best-price card:** `2026-09-28-ipad/02-search-results.png`
  can be iPad shot #1. Its card reads "49.6¢/lb (33%) less than the next-best store", a savings
  figure that §11's rules keep out of screenshots: decide before using it. (The iPhone card says
  no saving is claimed, because Walmart's chain-wide price was about the same.)

Still open:

- The iPad run skipped the deal, list, recipe and watch steps (the test did not find those
  controls on iPad), so iPad shots #3 to #6 remain the 2026-09-23 frames in `iPad-13in/`.
- `08-your-stores` was skipped on both devices (its toolbar button was not found).
- Confirm on the store's own listing before publishing: Tony's Fresh Market, Dutch Farms Grade A
  Large Eggs, 5 dozen for $5.99 on sale ($1.20 a dozen). It is in the trip plan and watch frames.

iPhone frames for the six shots: `02-search-results` (#1; it also makes #2's point, the 10 lb bag
at 99.9¢/lb against the 20 lb one at $1.02/lb), `02b-search-rows` or `02d-chart-and-rows` (#2),
`06-deal-detail-fineprint` (#3), `04-trip-plan` (#4), `05-recipe-import` with `05b` for prices
(#5), `07-price-watch` with `07b` for the chart (#6).

---

## If you only read one paragraph

**Five of the six App Store shots are ready to upload on the iPhone 6.9" set and four on the iPad
13" set.** What is missing is missing for a stated reason, not because it was skipped: shot #3
(deal detail) is blocked because `DealDetailView` always renders the retailer's flyer clipping,
and the iPad has no shot #1 because two chip scrollers paint over the best-price card. Both are
app-side, both are named below with the file to change, and both would be fixed in minutes by
whoever owns those files. Two things also need a decision from you before upload — the "saves $X"
line on the trip plan, and a caption wording change — and one genuine product bug turned up while
shooting: the trip planner silently drops list items it cannot price anywhere.

## Status at a glance

| Set | Device | Resolution | Required by Apple? |
|---|---|---|---|
| `iPhone-6.9in/` | iPhone 18 Pro Max, iOS 27.0 | 1320 x 2868 | **Yes.** The only iPhone size Apple asks for; it down-scales this set for every smaller iPhone. |
| `iPad-13in/` | iPad Pro 13-inch (M5), iPadOS 27 | 2064 x 2752 | **Yes** — `TARGETED_DEVICE_FAMILY` is `"1,2"`, so the app ships universal. |

## Submission readiness — the six shots

`APP_STORE_LISTING.md` §11 specifies six screenshots. This is what exists for each. Filenames are
the same in both device folders **except** where the row says otherwise.

| # | Listing's screen | File | Ready to upload? |
|---|---|---|---|
| 1 | Search results | iPhone `shot1-search-results.png`. **iPad: none.** | **iPhone yes. iPad no** — the best-price card is unusable there; see "An iPad layout defect" below. |
| 2 | Unit price inverting the ranking | `shot2-unit-price-rows.png` | **Yes.** |
| 3 | Deal detail with the fine print | *(not in the device folders)* | **No. Read "Shot #3" below.** The best candidate is `evidence/iphone-deal-detail-10-for-5-NOT-READY.png`. |
| 4 | Completed trip plan | `shot4-trip-plan.png` | **Yes, subject to one decision below.** |
| 5 | Recipe import result | `shot5-recipe-import.png` | **Yes, with one deviation from the spec.** |
| 6 | Price watch with its history chart | `shot6-price-watch.png` | **Yes, with two deviations from the spec** — no target price, and a short time axis. Both below. |

What each one shows, described from the 6.9" iPhone frame. The iPad frames are the same screens in
the regular-width layout, and the prices on them are the same prices; the two devices were shot
about twenty minutes apart, so a few numbers moved between them, and each frame's own numbers are
internally consistent.

- **`shot1-search-results.png`** — search for "basmati rice". Best-price card reading **$1.00/lb**
  at Tony's Fresh Market (SharSid Classic Basmati Rice, 10 lb, $9.99), then "Cheapest match per
  store" with ten named stores from $1.00 to $3.10/lb, then the first product rows. No weekly-ad
  carousel, no flyer artwork, no "price looks wrong" or "off scale" badge.
- **`shot2-unit-price-rows.png`** — the rows for the same search, and the argument makes itself:
  Trader Joe's 2 lb at $2.99 is **$1.50/lb**, Tony's 20 lb at $25.99 is **$1.30/lb**, Walmart
  20 lb at $20.36 is **$1.02/lb** — the small bag beats the big one per pound in one direction and
  loses in the other, on the same screen. Every row carries its store name, its pack size and a
  shelf/online/national badge. Thumbnails are plain pack shots, which §11 allows explicitly.
  On the iPad frame the right-hand column is empty white: the aside column's content is short, so
  once the rows are scrolled the column beside them has nothing left in it. That is the layout, not
  a capture mistake, and it is the honest reason the iPad frames read as emptier than the phone's.
- **shot #3 is missing** and the reason is below. The best frame the app can currently produce for
  it — a Mariano's "10 for $5.00, $0.50 each" Yoplait deal with "needs digital coupon", "needs
  store card" and its run of dates, which is *exactly* the caption §11 wants — is in
  `evidence/iphone-deal-detail-10-for-5-NOT-READY.png`, because the top quarter of it is the
  retailer's flyer clipping with the ad's own "10/$8 with card / −3.00 off 10" price typography
  baked in.
- **`shot4-trip-plan.png`** — `milk 1 gal`, `large eggs`, `basmati rice`, `orange juice` costed at
  every followed store: **one store $12.75** at Costco against **two stores $8.68** (Costco +
  Tony's), with the three-store and cherry-pick totals beside them and the per-store breakdown
  beneath — Costco $2.97 for the milk, Tony's $5.71 for the other three, and the arithmetic adds
  up on screen ($13.17 / $8.90 on the iPad frame, shot later the same morning). Every store is named in text. **That list is a deliberate choice, not the
  obvious one**, and the reason is a real bug — see "Something found while shooting shot #4"
  below. The capture log records `TRIP_PLAN_COVERAGE=4/4 items costed` for this frame.
- **`shot5-recipe-import.png`** — seven typed ingredients parsed into list rows, pantry staples
  detected and unticked, and an "Add N" action. **No prices** — see decision 4 below. Worth
  knowing: the same seven typed lines parse *differently* on the two devices. The iPhone frame
  reads "eggs" and marks both butter and salt as pantry ("Add 5"); the iPad frame reads
  "eggs 3 ct" and marks only salt ("Add 6"). `RecipeImporter` uses FoundationModels when
  `SystemLanguageModel.default.isAvailable` and its own parser otherwise, so the two devices are
  almost certainly not taking the same path. Neither output is wrong, but do not caption the shot
  as if the parse were deterministic.
- **`shot6-price-watch.png`** — a watch on "large eggs": $1.20/dozen at Tony's, "lowest seen", the
  three cheapest stores by name, and the per-store trend chart. The chart is the fix for the
  2026-09-22 defect: a **fitted** axis (about $2.00–$6.00 against real prices), proper `$x.xx`
  labels instead of `0.00¢`, and drawn lines rather than an empty grid. **Two honest limitations.**
  First, a clean simulator has no price history, so the only samples are the checks this capture
  made and the x axis spans minutes rather than weeks: the chart is real and correct, but it is
  not yet a long-run price story. Second, §11 also asks for **the target price**, and the frame
  does not have one. Setting a target means opening the watch card's `⋯` menu, and that menu is a
  SwiftUI `Menu` whose label is a bare `Image(systemName: "ellipsis.circle")` — it comes back from
  no `app.buttons` query by label or identifier, and a coordinate tap at the card's top-right
  corner did not open it either. Set one by hand in the simulator before shooting if the caption
  needs it, or give that `Menu` an `accessibilityIdentifier` and the test can do it.
  On the **iPhone** frame a second watch card ("butter") is partly visible at the very bottom,
  behind the tab bar — it is the 2026-09-22 capture's watch, still in the app container, and that
  query is the one that matches *peanut* butter. Only its name and its per-pound price are in
  frame, and both are unremarkable, but the iPad frame (fresh container, one watch) is the
  cleaner of the two. Delete the stale watch by hand before shooting if you want only one card.

Supporting frames in each device folder, all clean and uploadable if you want more than six
(the App Store takes up to ten):

| File | What it shows |
|---|---|
| `extra-search-home.png` | The idle Search screen: staples, seasonal produce, "How it compares". No prices, so nothing to defend. |
| `extra-chart-to-rows.png` | iPhone: the per-store chart handing over to the product rows. iPad: the rows further down the list. |
| `extra-your-stores.png` | The store picker: 21 stores within 15 miles, each named, with its price source (shelf / online / national / weekly ad only) and its distance. No logos anywhere. |
| `extra-settings.png` | Location, radius, store count, loyalty-card and Prime toggles, alerts. |
| `extra-shopping-list.png` | The list before it has been costed. |
| `extra-trip-plan-breakdown.png` | The per-store breakdown **without** the option cards — the compliant alternative if decision 1 below goes against the "saves $X" line. |
| `extra-list-rows-priced.png` | The same list after planning, every row carrying `cheapest: <store> <price>`. |
| `extra-price-watch-lower.png` | (iPad only) The watch screen scrolled to the favourites section. |
| `extra-settings-lower.png` | (iPhone only) Settings scrolled down: the Pro state, and the app's own counters — 1,779 products tracked, 2,421 price observations on this simulator. |

### `evidence/` — do not upload any of these

| File | Why it is here | Why it cannot be uploaded |
|---|---|---|
| `iphone-milk-search-results-HAS-FLYER-ART.png` | The same "milk" search that produced the $29.84/gal frame a day earlier, so the pricing fix can be checked. | The weekly-ad carousel is on screen with a fairlife tile and an O Organics tile. |
| `iphone-deals-grid-HAS-FLYER-ART.png` | Shows that *every* card in the Deals grid is a flyer clipping, which is why shot #3 is hard. | Wall-to-wall third-party brand marks and in-ad price typography. |
| `iphone-deal-detail-from-deals-tab-HAS-FLYER-ART.png` | The deal screen reached from the Deals grid. | The flyer scrap at the top carries the retailer's loyalty mark inside a circle. |
| `iphone-product-detail-empty-history.png` | The product sheet with its unit price in every unit — useful, but see below. | Not forbidden, just weak: on a fresh simulator the price-history block reads "No history yet" and the bottom half of the frame is empty. |
| `iphone-deal-detail-10-for-5-NOT-READY.png` | The best shot #3 the app can currently produce, reached through the Search tab's ad carousel. | The top quarter is still the retailer's flyer clipping, with the ad's own price typography in it. |
| `iphone-trip-plan-2-of-4-costed.png` | The frame that exposed the trip-planner bug described below. | "To buy (4)" above a total that covers two of them, with nothing on screen saying so. |

`ipad-deals-grid-HAS-FLYER-ART.png`, `ipad-deal-detail-from-deals-tab-HAS-FLYER-ART.png` and
`ipad-product-detail-empty-history.png` are the iPad equivalents, and
`ipad-search-results-CHIPS-OVER-HERO.png` is the iPad-only layout defect described further down.

---

## Corrections to the previous version of this file

The 2026-09-22 version got two things wrong, and the first one mattered.

1. It said `ios/project.yml` sets `TARGETED_DEVICE_FAMILY: "1"`, that this is an iPhone-only app,
   and that **no iPad set is needed**. That is not what the file says. `TARGETED_DEVICE_FAMILY` is
   `"1,2"` in *both* the project-wide `settings.base` **and** the App target's own `settings.base`
   — and the comment in that file explains why the target-level value is the one that reaches the
   build (XcodeGen's iOS-application preset injects `"1,2"` at target level, which wins over the
   project base, so the base value alone can neither raise nor lower it). The app ships universal,
   App Store Connect shows an iPad tab, and **an iPad 13" set is mandatory**.
   `APP_STORE_LISTING.md` §11 and `APP_STORE_CHECKLIST.md` §10 were right; this file was stale.
2. It listed `iPhone-17/` as a reference folder. The folder was empty; it has been removed.

What is kept from the previous version is its judgement: say plainly which frames cannot be
uploaded and why, rather than shipping something that will come back from review.

---

## The weekly-ad carousel, and why shot #1 is not milk

`SearchView` lays a phone results screen out as `resultsAside` first — best-price card, then
**"In this week's ads"**, then the per-store chart — and only then the product rows. The carousel
sits *between* the best-price card and everything else, so **there is no scroll position that
keeps the hero card and drops the flyer tiles.** Those tiles are retailer flyer clippings; the
2026-09-22 frame carried a fairlife wordmark and an O Organics tile with the ad's own price
typography, which `APP_STORE_LISTING.md` §11 forbids outright.

`model.ads` comes from `PriceSearch.ads(query:place:chainIds:)`, a Flipp item search filtered to
the chains you follow, so **a query with no weekly-ad matches renders no carousel at all.**
Measured against that endpoint for ZIP 60618 on 2026-09-23:

| Query | Weekly-ad matches | Carousel on screen |
|---|---|---|
| `milk` | 24 (fairlife, O Organics, Lactaid…) | yes |
| `olive oil` | 11 | yes |
| `greek yogurt` | 10 | yes |
| `rolled oats` | 9 | yes |
| `peanut butter` | 5 | yes |
| `basmati rice` | **0** | **no** |
| `quinoa` | **0** | **no** |
| `ground cinnamon` | **0** | **no** |

So shot #1 is **basmati rice** — and it is a better shot than milk anyway: ten stores from
$1.00/lb to $3.10/lb with every name legible, and 2 lb / 10 lb / 20 lb bags whose per-pound prices
invert the sticker ranking, which is exactly the point shot #2 exists to make.

**The listing has to follow this choice.** `APP_STORE_LISTING.md` §11 names milk for shots 1 and 2
and captions shot 2 "The bigger jug isn't always cheaper." With the rice frames that caption needs
one word changed ("bag"). That file is not owned by this folder and has not been edited.

---

## The five blockers from the previous attempts

| Blocker (2026-09-22) | Where it stands on 2026-09-23 |
|---|---|
| **1. Retailer flyer artwork** in the weekly-ad carousel above the search results | **Cleared for the search frames** by choosing a query with no weekly-ad matches (above). **Not cleared for deal detail** — see "Shot #3". |
| **2. A mis-parsed $29.84/gal attributed to a named retailer** | **Cleared.** Same search, same ZIP, one day later: Costco reads **$2.97/gal** and sits second-cheapest. The per-store chart runs $2.41 → $11.38 across ten stores with every bar distinguishable. No frame in either set shows a "price looks wrong" or "off scale" badge; the capture log records that check per frame. Evidence: `evidence/iphone-milk-search-results-HAS-FLYER-ART.png` beside `iPhone-18-Pro-Max-6.9in/02-search-results-milk.png`. |
| **3. Empty price-history chart with a $0–$200 axis** | **Cleared** — see shot #6 and the note under it. |
| **4. Three shots never captured** (deal detail, trip plan, recipe import) | **All three are now driven and captured on both devices.** The old selector `scrollViews.otherElements.buttons.element(boundBy: 2)` landed on the sort menu; the new one filters the Deals tab's own search field, taps a card by its label, and then *proves* it is on `DealDetailView` by requiring the "Compare at every store" button before it shoots. The trip plan and the recipe import are driven end to end. Two of the three are shippable; the deal-detail frame is captured but blocked on artwork — see "Shot #3". |
| **5. Dirty status bar** | **Cleared.** Every frame in both sets is 9:41, four bars, Wi-Fi, full battery. |

## Shot #3 — deal detail, and the artwork that will not go away

`DealDetailView` draws `deal.imageURL` at the top of the screen, up to 220pt tall. For the
merchants near ZIP 60618 that image is almost always the **ad scrap**, not a product photo: the
Fage Total Yogurt deal renders the retailer's `for U` loyalty mark inside a circle plus the ad's
own price typography. `APP_STORE_LISTING.md` §11 bans retailer logos *and* circular artwork
specifically.

Three things were tried:

1. **Scroll past it.** The page is shorter than the screen, so there is nothing to scroll — the
   scrolled frame comes out byte-identical to the unscrolled one on both devices.
2. **Pick a different deal.** Every card in the grid for this ZIP is a flyer clipping; see
   `evidence/iphone-deals-grid-HAS-FLYER-ART.png`.
3. **Reach the same screen by the other route.** `FlippSource` builds a flyer-item deal with
   `cutout_image_url` (what the Deals tab uses) and a *search*-item deal with
   `clean_image_url ?? clipping_image_url` (what the Search tab's ad carousel uses). Flipp's
   "clean image" is a product cutout on white, which §11 explicitly allows.
   `testPhase7DealFromSearchCarousel` captures that route. Targeting the carousel is itself
   awkward — the mini-cards carry no identifier and a label match on the search term finds the
   product rows first — so the test taps the carousel by geometry, at a normalised offset below
   the "In this week's ads" header, and falls back to a label match that excludes the best-price
   card.

**Result: both routes land on a flyer clipping.** Via the Deals tab it is the Jewel-Osco Fage
deal with the `for U` loyalty mark in a circle; via the search carousel it is a Mariano's Yoplait
deal with no retailer mark but with the ad's own "10/$8 with card / −3.00 off 10 / 10/$5" price
typography set into the image. In-ad pricing inside the artwork is precisely what disqualified the
previous attempt's O Organics tile, so neither is shipped. A fourth route was checked and does not
exist: the Flipp item search returns **no** items without artwork for this ZIP (0 of 20 for
"eggs", 0 of 58 for "coffee", 0 of 135 for "chicken"), so "find a deal with no image" is not
available either.

**The fix is one line and it is not in this folder's gift.** `DealDetailView` renders
`deal.imageURL` unconditionally; hiding it, or rendering it only when the source supplies a
genuinely clean cutout, makes this screen shippable immediately — the rest of it (price, each-price, regular
price, coupon and card conditions, limits, must-buy, dates, disclaimer) is already exactly what
§11 asks for and carries no third-party artwork at all. That is a change to
`ios/App/UI/Deals/DealDetailView.swift`, which this work does not own.

The frame also exposed something worth knowing: the app's disclaimer line reads *SALE PRICE
WITHOUT COUPON $9.99* while the flyer clipping beside it reads *$6.99*. The app is not wrong — the
Flipp item detail for that deal returns `disclaimer_text: "SALE PRICE WITHOUT COUPON $9.99"`, so
the retailer's data and the retailer's own artwork disagree at source. But a frame showing two
different numbers for the same thing is exactly the kind of thing that must never ship, and it is
a second, independent reason to keep flyer artwork out of a screenshot.

## Something found while shooting shot #4, which is worth more than the screenshot

The first trip-plan frame of this round was taken with the list the earlier capture used —
`milk 1 gal`, `large eggs`, `butter 1 lb`, `bananas 2 lb`. It came out reading **"To buy (4)"**
above **"One store $5.33"**, and only two of the four rows had a `cheapest:` line. Butter and
bananas priced at no store at all, and *nothing on the screen said so*: the option cards showed
"saves $1.16", not "2 not found".

That is not a rendering accident. `TripPlanner.plan` (`ios/App/Services/WatchService.swift`)
begins:

    let items = priced.filter { !$0.perStore.isEmpty }

so an item that could not be priced anywhere is dropped **before** `evaluate` runs, and
`evaluate`'s `missing` counter — the one the option card surfaces as "N not found" — never sees
it. An item that fails everywhere disappears silently; only an item that fails at *the stores in
this particular plan* is counted.

For a screenshot that is fatal: a total sitting under a four-item list that actually covers two of
them is a wrong number, and a wrong number is worse than no number. The frames shipped here
therefore use a list whose items all price, and the capture test now prints
`TRIP_PLAN_COVERAGE=<costed>/<items>` so the next person can see it rather than trust it. The
frame that showed the problem is kept as `evidence/iphone-trip-plan-2-of-4-costed.png`.

**For whoever owns `ios/App/Services/WatchService.swift`:** this is a real product bug, not a
capture artefact. A list item that no followed store can price should still be counted somewhere
the user can see.

## Decisions the owner has to make before uploading

**1. The trip-plan frame states a dollar saving, and the listing forbids that.**
`TripPlanSummary` prints `saves $X` under every option after the first (`ListsView.swift`).
`APP_STORE_LISTING.md` §11 says: "**Never state a dollar amount of savings** anywhere in
screenshots or metadata." Read literally, that rules the trip-plan frame out. The rule is plainly
aimed at aggregate, unprovable claims ("save $40 a week"), and this number is the arithmetic
difference between two totals printed beside it on the same screen for one list on one day — but
it is the owner's rule and the owner's call. If it has to go, the compliant alternative is already
in the folder: `extra-trip-plan-breakdown.png` shows the per-store breakdown without the option
cards.

**2. The best-price card names a competitor and a difference.** Its last line reads
"1.90¢/lb (2%) less than Walmart". That is a per-unit, dated, checkable comparison rather than a
savings claim, and it is the product's entire argument — but it does put a named retailer's price
into a marketing image, so it deserves a conscious yes.

**3. A Walmart "Rollback" badge appears in shot #2.** It is the app's own neutral sale badge
rendering the promotion's name as plain text (`Product.promo`), not Walmart's mark. Nominative
use, but flagged because §11's rules are strict.

**4. Shot #5 has no prices on it, and the spec asks for prices.** §11 describes shot #5 as "the
captured recipe's ingredients parsed into list rows, pantry staples greyed out, **with prices
attached**". `RecipeImportView`'s review screen parses the ingredients and marks the pantry
staples — both visible in the frame — but it attaches no prices, and in this app a list row only
carries a price once a trip plan has costed it (`ListsView.row`, the "cheapest:" line). Either
accept the frame as it is, or run the recipe import, commit the ingredients with "Add N", and
plan the trip, which is what `SHOT_KEEP_LIST=1` in the capture test is for.

## An iPad layout defect the capture found

On iPad, `SearchView` splits the results into a flexible rows column and a fixed 340pt aside
column holding the best-price card, the weekly ads and the per-store chart. Both columns start at
the same y — and the two horizontal chip scrollers at the top of the rows column
(`StoreStatusStrip` and `FilterBar`) are `.scrollClipDisabled()`, so when they have more chips
than fit they **paint straight across the best-price card**. In the capture the words "BEST PRICE"
are covered by a row of store chips and the "$1.00 /lb" headline is crossed by a row of filter
chips. It is not a scroll artefact: the two columns are always level, so the collision is there
whenever there are enough chips, which for a dense ZIP is always.

Evidence: `evidence/ipad-search-results-CHIPS-OVER-HERO.png`.

Because of this there is **no iPad frame showing the best-price card**, and the iPad set has no
shot #1. Scrolling does not rescue it: the chart sits directly under the chips, so any offset
large enough to push the chips off the top also pushes the chart behind the floating search bar —
that was measured, not assumed (`02d-chart-and-rows` at a third of a screen already has the chart
gone). The iPad set therefore leads with `shot2-unit-price-rows.png`.

Fixing the clipping in `ios/App/UI/Search/SearchView.swift` — clipping the two chip scrollers to
the rows column, or giving the aside column its own scroll region — makes the hero frame available
on iPad immediately. That file is not owned by this work.

## Store names are legible in every frame

The brief asked for this specifically, because a colour dot alone does not identify a store. It
holds throughout, by construction rather than by luck: `StoreTag`, `BestPerStoreChart`,
`TripPlanSummary`'s option cards and `WatchCard`'s rows all draw the retailer's name as text
beside the dot. In the 6.9" set the longest names in the chart ("Trader Joe's", "Whole Foods",
"Cermak", "Food City") all render in full.

Worth knowing anyway: `AppState.colorSlot(for:)` is an index into `selectedChainIds`, so the dot
colours are per-device ordering rather than per-retailer, and every store past the eighth shares
one grey. **The colours therefore differ between the iPhone and the iPad set.** Nothing on screen
depends on them, but do not describe a store by its colour in any caption.

---

## For the website

`site/img/` currently holds four **drawn illustrations** of the app, and `site/index.html` now
says so in as many words ("The phone images are illustrations of the app in development, not
screenshots"). `site/img/README.md` lists the exact reasons real frames could not be used and ends
"Swap these out for real frames as soon as clean ones exist."

Of the three screens that page asks for:

- **Search results** (`iphone-max-search.png`) → replace with `iPhone-6.9in/shot1-search-results.png`
  or `shot2-unit-price-rows.png`. Both are clean. Note the illustration shows milk and uses
  stand-in store names "Store A"–"Store F"; the real frame is basmati rice and names real
  retailers, so the `alt` text and the caption both have to change, and the page must keep its
  "Example prices, September 2026. Varies by location." label.
- **Trip plan** (`iphone-max-trip.png`) → replace with `iPhone-6.9in/shot4-trip-plan.png`, subject
  to decision 1 above; the site's own rule 4 is the same rule.
- **Weekly-ad deal with its conditions** (`iphone-max-deal.png`) → **do not replace yet.** See
  "Shot #3". The illustration is currently the only version of that screen that obeys the site's
  own rule 1.

The site images are 1290 x 2322 and are produced by `site/tools/make-site-images.sh`; these frames
are 1320 x 2868 with a status bar. Whoever does the swap owns that resizing, and `site/` is not
owned by this folder.

---

## How to reproduce this

    xcodebuild build-for-testing -project ios/Cartworth.xcodeproj -scheme App \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath <dd>

    xcrun simctl boot <udid>
    # This Xcode ships no Simulator.app, and CoreSimulator shuts an idle device down again within
    # about ten seconds when no client is holding it. A log stream is a client:
    nohup xcrun simctl spawn <udid> log stream --style compact >/dev/null 2>&1 &

    xcrun simctl ui <udid> content_size large        # the iOS default — see the traps below
    xcrun simctl ui <udid> appearance light
    xcrun simctl status_bar <udid> override --time 9:41 --cellularBars 4 \
      --batteryState charged --batteryLevel 100

    TEST_RUNNER_SHOT_QUERY="basmati rice" TEST_RUNNER_SHOT_QUERY_2="milk" \
    TEST_RUNNER_SHOT_DEAL_QUERY="yogurt" TEST_RUNNER_QA_ZIP=60618 \
    xcodebuild test-without-building -xctestrun <dd>/Build/Products/App_*.xctestrun \
      -destination "platform=iOS Simulator,id=<udid>" \
      -only-testing:AppUITests/SubmissionSet/testPhase1Search

    # …then testPhase2Deals, testPhase3ListAndTrip, testPhase4Recipe, testPhase5Watch,
    # testPhase6Extras, testPhase7DealFromSearchCarousel. Frames accumulate in one container:
    xcrun simctl get_app_container <udid> app.cartworth.AppUITests.xctrunner data   # tmp/shots

### Traps that cost the two earlier attempts

- **Simulator text size.** The device had been left at `accessibility-extra-extra-extra-large` by
  earlier accessibility work. Frames shot that way are real but useless as marketing: the
  best-price card alone fills half the screen and every store name truncates to an ellipsis.
  Always set `content_size large` first, and *look at one frame* before trusting a run.
- **`simctl shutdown all`.** Other work on this machine runs it, and it kills a UI-test run
  outright, taking every frame after the last shutter with it. That is why `SubmissionSet` is cut
  into short phases writing into one container: a phase that dies is re-run alone and the frames
  already taken survive.
- **Predicates that match the explanation instead of the state.** Two waits in the first cut of
  this test fired early because the screen's own help text contained the words being waited for:
  `CONTAINS "Cherry-pick"` matched the footer "…and the cherry-pick total" before planning had
  started, and `CONTAINS "target "` matched "…when one hits your target or its lowest price yet"
  before any target existed. Both now wait on something that only exists in the finished state.
- **A label subscript is a query, not an element.** `app.tabBars.buttons["Search"]` resolves to
  *every* matching element, and tapping it throws "Multiple matching elements found" — which
  aborted a whole iPad run 13 seconds in, at the first `goTo("Search")`, because on iPad the tab
  bar's Search tab and the search field's own Search control share that label. Every lookup in
  the test is now `.firstMatch` over an explicit predicate. The symptom is misleading: the app
  appears on the Home screen and the run looks hung, when in fact the test has already failed and
  torn down.
- **`swipeUp()` on the results screen.** It starts at the element's centre, which can land inside
  the horizontal weekly-ad carousel, and the carousel eats the gesture — the scrolled "milk"
  frames in one pass came out identical to the unscrolled ones. The test now drags between
  explicit normalised points down the left edge.

---

## Test baselines at the time of capture

Nothing in `ios/App`, `src/`, `shared/` or `site/` was changed by this work. The only code added
is `ios/UITests/SubmissionSet.swift` (plus its four lines in `ios/Cartworth.xcodeproj`, which
XcodeGen regenerates from `ios/project.yml` anyway).

- `node --test 'test/*.test.js'` → **197 tests, 0 failures** at the end of this work (183 when it
  started; other work on this machine was adding tests throughout, and the brief was written when
  there were 181). Always run with `BASKET_DATA_DIR` pointed somewhere scratch — this used
  `/tmp/cartworth-r2-shots/data`, and `data/basket.db` in the repo was never opened (still dated
  2026-09-22 13:51).
- `xcodebuild test -only-testing:AppTests` → **149 tests, 0 failures**, before and after. The
  brief expected 146; three had been added before this started.

Third-party hosts were touched twice: by the app itself while the UI tests drove it, and by a
small read-only probe of the Flipp item-search endpoint used to build the weekly-ad table above.
That probe ran strictly serially with an 800 ms gap between requests and a hard stop on HTTP 429,
made 17 requests in total, and sent no invented headers.

## The older folders

`iPhone-18-Pro-Max-6.9in/`, `iPhone-SE-3rd-gen/` and `iPhone-Duo-folded/` are the 2026-09-22 QA
run, at the default text size but with a dirty status bar. They are kept because two of them are
the before-and-after evidence for the pricing and chart fixes:

- `iPhone-18-Pro-Max-6.9in/02-search-results-milk.png` — Costco at **$29.84/gal**, topping the
  per-store chart.
- `iPhone-18-Pro-Max-6.9in/07-tracking-watch.png` — the price-history chart as an empty grid with
  a **$0–$200** axis and a `0.00¢` bottom label, against real prices of $1.41–$2.49.

Compare them with the 2026-09-23 frames named in the tables above. **Do not upload anything from
these three folders.** `DUO.md` in this folder is a separate write-up of the iPhone Duo and is not
part of either submission set.
