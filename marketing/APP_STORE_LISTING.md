# Cartworth: App Store Connect listing

Everything here is meant to be copied into App Store Connect as-is. Character counts were measured on the exact strings below.

Facts in this document were read from the shipping source at `/Users/nicksoderstrom/Developer/claudecode/basket/ios`. Three corrections to the brief this was written from, because each one changes what you may claim on the product page:

1. **The deployment target is iOS 17.0**, not iOS 26 (`ios/project.yml`, `deploymentTarget.iOS: "17.0"`). Apple Intelligence recipe parsing via FoundationModels is gated behind `@available(iOS 26.0, *)` and only runs when `SystemLanguageModel.default.isAvailable`; on everything else the app falls back to its own on-device parser. So "on-device" is true everywhere, "Apple Intelligence" is not. The listing below says "on your device" and never names Apple Intelligence.
2. **There is no Kroger API integration.** Kroger and the whole Kroger family (Ralphs, Fred Meyer, King Soopers, Fry's, Smith's, QFC, Dillons, Harris Teeter, Mariano's, Pick 'n Save, Metro Market, Food 4 Less, City Market) resolve through Instacart-powered storefronts in `ios/App/Sources/RetailerCatalog.swift`. Do not tell App Review you use an official Kroger API.
3. **Nationwide price stats are not a shipping feature.** `ios/App/Resources/stats.json` is `{"version":1,...,"items":[],"facts":[]}` and `NationalStats` only feeds rotating loading-screen lines. No `StatsURL` key exists in `Info.plist`, so the remote refresh is a no-op. It is deliberately absent from the description below. Claiming it would be metadata that does not match the binary (guideline 2.3.1).

---

## 1. App name (30 character limit)

| Pick | String | Count |
|---|---|---|
| **Primary** | `Cartworth: Grocery Prices` | **25** |
| Alternate 1 | `Cartworth: Price Compare` | 24 |
| Alternate 2 | `Cartworth Grocery Prices` | 24 |

Primary is the pick: "Grocery" and "Prices" are the two highest-volume words the app can honestly own, and the colon form reads as a brand plus a descriptor rather than as keyword stuffing.

Note: `PRODUCT_NAME` in `ios/project.yml` is `Cartworth`, so the home-screen name is "Cartworth" regardless of which of these you choose. That is correct and intended.

## 2. Subtitle (30 character limit)

| Pick | String | Count |
|---|---|---|
| **Primary** | `Compare grocery prices nearby` | **29** |
| Alternate 1 | `Unit prices from every store` | 28 |
| Alternate 2 | `One search, every store nearby` | 30 |

Primary adds "compare" and "nearby" to the indexed set without repeating the name. Alternate 1 is the better pick if you decide the unit-price idea is the wedge and want the subtitle to carry it.

## 3. Promotional text (170 character limit)

Editable without a new build, so treat it as the seasonal slot.

```
Nobody needs to guess which store is cheaper. Search once, see every grocery store near you in the same unit, plus this week's ad deals and their fine print.
```

157 characters.

Swap candidates for later (no review needed):
- Thanksgiving/holiday: `Turkey, butter, flour: see what each one costs at every store near you before you shop, and which weekly ads actually have the deal.` (131)
- Post-launch: `New: plan a trip across two or three stores and see exactly what each version of the trip costs.` (96)

## 4. Description (4000 character limit)

Paste from the line below the rule to the line above the closing rule. Measured length: **3,288 characters**, which leaves 712 characters of headroom under the 4,000 limit if you want to add a section later.

---

Groceries cost what they cost. The part you can control is knowing which store near you is cheapest for the thing you are actually buying today.

Cartworth checks the grocery stores around you at the same time, converts every price to the same unit, and shows you where an item is cheapest right now.

EVERY STORE AT ONCE
Type "milk" or "chicken thighs" and Cartworth searches the stores near you together. You get the best price first, then every store's closest match, ranked, with the distance to each store.

COMPARED HONESTLY
A 12 oz box and an 18 oz bag do not line up. Cartworth converts everything to per pound, per gallon, per dozen or per count, so the cheaper tag is actually the cheaper buy. Only real matches count: "milk chocolate" never wins a search for milk.

THE WEEKLY AD, INCLUDING THE FINE PRINT
Browse the circulars for the stores near you. "2 for $5", BOGO, digital coupon prices and loyalty card prices all show their conditions: limits, must-buy quantities, and what the item costs without the coupon. Holiday and seasonal suggestions point you at what is on sale when it matters.

A LIST THAT KNOWS WHAT IT COSTS
Add items with a size, like "milk 1 gal", and Cartworth prices that exact amount at every store you follow. Then it plans the trip: the cheapest single store, the best two-store and three-store split, and the cherry-pick total if you were willing to drive everywhere.

SNAP A RECIPE
Photograph a cookbook page, scan a recipe card, or paste a recipe link. Cartworth pulls out the ingredients, skips the pantry staples you already have, adds the rest to your list and prices them. The text recognition and the ingredient parsing both run on your device.

WATCH THE PRICES YOU CARE ABOUT
Track the items you buy often. Cartworth remembers what they cost over time, shows you whether today's "sale" is really a sale, and tells you when something hits your target price or its lowest price yet. Name the brands you like and hear when they turn up in a weekly ad.

HOW PRICES WORK
Cartworth reads the prices each retailer publishes on its own public website for the store nearest you. Nothing is crowdsourced and nothing is guessed. Where a store publishes its in-store shelf prices, prices are labeled "shelf". Where a store only publishes an online or delivery listing, which that retailer will tell you can run higher than the shelf, prices are labeled "online". Weekly ad prices come from the store's own circular. Stores change prices without notice and listings can be wrong, so check the shelf tag when you get there. Cartworth is a guide, not a guarantee.

PRIVACY
No account. No sign-up. No analytics, no tracking, no ad SDKs. Your searches, lists, watches and price history stay on your iPhone. Your location is used only to find the stores near you.

FREE AND PRO
Free: three searches a day, one price watch, this week's ads, store discovery and your shopping list.
Cartworth Pro: unlimited searches, unlimited price watches, price and sale alerts, favorite brand alerts, recipe to shopping list, trip planning, price history, and next week's ads as soon as stores post them.
$3.99 per month, $19.99 per year, or $29.99 once for lifetime access.

Prefer a browser? cartworth.app is free and does the comparison and the weekly ads on any device.

---

Why it is built this way: the first two lines carry the whole pitch for the 3 percent who never tap "more"; every section below is a scannable all-caps header plus two or three sentences; the honesty section sits above the pricing section so a skeptical reader hits it before the ask; there is no keyword list, no feature soup and no exclamation point.

## 5. Keywords field (100 character limit, comma separated, no spaces)

```
unit price,weekly ad,circular,coupon,supermarket,shopping list,save money,budget,food cost,stock up
```

99 characters.

How these were picked:
- **Excluded on purpose:** "cartworth", "grocery", "price", "compare", "nearby". Apple already indexes the app name, the subtitle and your category, and repeating those terms burns characters for nothing.
- **Excluded on purpose:** every retailer and competitor name. No Instacart, Flipp, Basket, Ibotta, Fetch, Walmart, Kroger, Aldi, Trader Joe's, Whole Foods. Those are other companies' trademarks and using them in keywords is a straightforward 5.2.1 rejection.
- `unit price` is the differentiator and almost nothing else in the category claims it.
- `weekly ad` and `circular` are the two phrases American shoppers actually type for the deals feature; they are different search behaviors, so both earn their place.
- `coupon` is singular because Apple stems; the plural would cost a character for nothing.
- `supermarket` covers the people who do not say "grocery store".
- `shopping list`, `save money`, `budget`, `food cost`, `stock up` are the intent phrases, and `stock up` in particular maps directly to the price-watch feature.

If you want to test alternates in a later version, swap `food cost` for `cheapest` (98 characters) and compare impressions in App Analytics. Change one thing at a time.

## 6. What's New in This Version (version 1.0)

```
First release.

Search every grocery store near you at once and compare in one unit. Browse the weekly ads with their real conditions. Plan the cheapest trip across one, two or three stores. Turn a recipe photo into a priced shopping list. Watch the items you buy often and get told when one hits your price.

Something missing or wrong? cartworth.app/support
```

Apple sometimes shows nothing for a 1.0 because there is no previous version to diff against. Fill it in anyway; it appears in some contexts and in your own version history.

## 7. Category, rating and URLs

| Field | Value | Note |
|---|---|---|
| Primary category | **Shopping** | Where price comparison lives and where the intent is. |
| Secondary category | **Food & Drink** | Weaker competition, and the recipe and weekly-ad features justify it honestly. |
| Copyright | `2026 Cartworth` | App Store Connect wants year plus the legal owner. If you incorporate before submitting, use the entity name exactly as registered, for example `2026 Cartworth LLC`. Do not put a © symbol in the field; Apple adds it. |
| Support URL | `https://cartworth.app/support` | Must be live before you submit. Linked from Settings in the app (`SettingsView.swift`). |
| Marketing URL | `https://cartworth.app` | Optional field, but you have a real site, so use it. |
| Privacy Policy URL | `https://cartworth.app/privacy` | Mandatory. Linked from both Settings and the paywall. |
| Terms of Use (EULA) | `https://cartworth.app/terms` | Not a separate App Store Connect field unless you supply a custom EULA, but it is linked from `PaywallView.swift`, so the page must exist. |

### Age rating: 4+

Answer the questionnaire with **None** for every content category: no violence of any kind, no profanity, no sexual content, no nudity, no horror, no alcohol/tobacco/drug references, no simulated gambling, no real gambling, no contests, no medical or treatment information, no mature themes.

The three non-obvious questions:

| Question | Answer | Why |
|---|---|---|
| Unrestricted Web Access | **No** | The app has no embedded browser. There is no `WKWebView` and no `SFSafariViewController` anywhere in the source. Recipe import accepts a URL, but it fetches the HTML and parses the ingredient list; it never renders the page. Outbound links (`Link(destination:)` in Settings, the paywall and product detail) hand off to Safari, which does not count as in-app web access. |
| User Generated Content | **No** | Lists, watches and favorites are private to the device. There is no sharing, no feed, no upload, no comments and no server. |
| In-App Purchases | **Yes** | Three products, section 9. Apple sets the "In-App Purchases" badge on the product page from this. |

If Apple has added a question since this was written that you cannot map to the source, do not guess. Answer conservatively and note it; a rating that is too strict costs you nothing, a rating that is too loose is a rejection.

## 8. App Privacy answers

### The headline answer

On the App Privacy page, select **"No, we do not collect data from this app."**

That is the defensible answer, and here is the evidence, all of which you should be able to repeat if a reviewer asks:

- `ios/App/Resources/PrivacyInfo.xcprivacy` declares `NSPrivacyTracking: false`, an empty `NSPrivacyTrackingDomains`, and an empty `NSPrivacyCollectedDataTypes`. The only declared API reasons are `CA92.1` (UserDefaults for app settings) and `C617.1` (file timestamps).
- There are no third-party SDKs at all. `ios/project.yml` declares no Swift packages; the only `dependencies:` entries are the test targets depending on the app target. A grep of the whole source for Firebase, Amplitude, Mixpanel, Sentry, AppsFlyer, Adjust, Facebook, Google, IDFA, `ASIdentifier` and `AppTrackingTransparency` returns nothing.
- You operate no backend. Every outbound request goes to a retailer site or a circular service. The full set of hosts in the binary is `www.instacart.com`, `www.aldi.us`, `shopwoodmans.com`, `www.wholefoodsmarket.com`, `www.traderjoes.com`, `alphaapi.brandify.com` (Trader Joe's store locator), `backflipp.wishabi.com` (weekly circulars), plus `cartworth.app` and `apps.apple.com` as tapped links.
- Everything the user creates is local. The SwiftData container in `StoredModels.swift` is a plain `ModelConfiguration` with no CloudKit, and the HTTP cache writes to the app's Caches directory.

### Per data type

| Data type | Select | Justification |
|---|---|---|
| **Precise Location** | **Not collected** | `LocationFetcher` in `Geo.swift` uses `kCLLocationAccuracyKilometer` and only `NSLocationWhenInUseUsageDescription`; there is no Always authorization and no background location. Coordinates are reverse-geocoded to a ZIP on device and used to find stores. Nothing goes to you, because you have no server. |
| **Coarse Location** | **Not collected** | Same reasoning. |
| **Purchases** | **Not collected** | StoreKit 2 only. `Entitlements.swift` reads `Transaction.currentEntitlements` on device to flip `isPro`. You receive Apple's aggregate sales and subscription reports, which are Apple's own reporting and are not data collected through the app. |
| Contact Info (name, email, phone, address, other) | Not collected | No account, no sign-up, no contact form in the app. |
| Health & Fitness | Not collected | Not touched. |
| Financial Info (payment, credit, other) | Not collected | Payment is handled entirely by the App Store. The app never sees a payment instrument. |
| Contacts | Not collected | No Contacts access and no usage-description key for it. |
| User Content (photos, audio, customer support, other) | Not collected | Recipe photos are processed by Vision on device and are never uploaded. |
| Search History | Not collected | Recent searches are a local `RecentSearch` SwiftData model. Query strings do reach retailer search endpoints as part of servicing the search, which is the transaction the user asked for, not collection by you. |
| Browsing History | Not collected | The app has no browser. |
| Identifiers (User ID, Device ID) | Not collected | No IDFA, no IDFV use, no account ids, no device fingerprinting. |
| Usage Data (product interaction, advertising data, other) | Not collected | No analytics of any kind. |
| Diagnostics (crash, performance, other) | Not collected | **Decide this one deliberately.** If you leave Apple's own crash reporting on, that is Apple collecting it under the user's device-level opt-in and it does not belong in your declaration. If you later add a crash SDK, you must come back and declare Crash Data. |
| Sensitive Info | Not collected | None. |
| Other Data | Not collected | None. |

### The one judgment call, stated plainly

Apple's questionnaire asks about data collected by you **or by third parties operating on your behalf**. The retailer sites the app queries are not operating on your behalf; they are sites the user's device visits to answer the user's own search, the way a browser would. That is why "no collection" is correct. What those retailers log about the request is their own privacy practice, governed by their policies, not yours.

A reviewer could still push back, because the device does send a ZIP or coordinates to a third-party host. Two things protect you:

1. Say it out loud in the App Review notes (section 10) rather than letting them discover it.
2. Say it out loud in the privacy policy at `cartworth.app/privacy`. The policy must disclose, in plain words, that searching sends your area (ZIP or approximate coordinates) and your search term directly from your phone to the retailer's own website, and name the categories of destination.

If you would rather be maximally conservative, the alternative is to declare **Precise Location, linked to the user: No, used for tracking: No, purpose: App Functionality**. Choose Precise rather than Coarse if you go this route: Apple defines Precise Location as anything at latitude/longitude resolution of three or more decimal places, and `CLLocation` carries full-resolution coordinates even when the requested accuracy is one kilometer. I recommend the "no collection" answer, but this is your call and both are arguable. **Verify the current wording of the questionnaire in App Store Connect when you fill it in; Apple revises these definitions.**

### Tracking

**No** to "Do you or your third-party partners use data for tracking?" Nothing is shared with a data broker or ad network, there is no cross-app or cross-site measurement, and `NSPrivacyTracking` is `false`. Consequently the app must not, and does not, present an App Tracking Transparency prompt; there is no `NSUserTrackingUsageDescription` key.

## 9. In-app purchase metadata

All three product IDs derive from the bundle id at runtime (`Entitlements.productPrefix` returns `Bundle.main.bundleIdentifier`), so the IDs below must match `app.cartworth.ios` exactly or the paywall will show "Subscriptions aren't available right now."

### Subscription group

| Setting | Value |
|---|---|
| Reference name (internal) | `Cartworth Pro` |
| App Name for the group (customer-facing, shown in Manage Subscriptions) | `Cartworth Pro` |
| Contains | `app.cartworth.ios.pro.monthly`, `app.cartworth.ios.pro.yearly` |
| Does **not** contain | the lifetime unlock (see below) |

**Levels.** `ios/App/Resources/Products.storekit` already encodes yearly at `groupNumber: 1` and monthly at `groupNumber: 2`. Level 1 is the highest service level in a group, so as configured:

- Monthly to yearly is an **upgrade**: it takes effect immediately and Apple refunds the unused portion of the month.
- Yearly to monthly is a **downgrade**: it takes effect at the next renewal date.

Set the same ranking in App Store Connect (yearly above monthly) so the StoreKit configuration file you test against behaves like production. Apple's documentation also permits putting two plans with identical features at the same level, which makes switching a crossgrade that takes effect at renewal in both directions. Either is legitimate; the deciding question is whether you would rather a monthly subscriber get yearly instantly, or never issue a prorated refund. The current file says instantly, and that is the friendlier behavior. **Verify the exact upgrade/downgrade wording in App Store Connect before you finalize; Apple has renamed these controls more than once.**

**Why lifetime sits outside the group.** A subscription group can only contain auto-renewable subscriptions. A permanent one-time unlock is a **Non-Consumable** product, which has no group, no renewal and no expiration. The code already reflects this: `Entitlements.refresh()` treats any of the three product IDs in `Transaction.currentEntitlements` as Pro, skipping anything with an `expirationDate` in the past, and pins `activePlan` to `.lifetime` when present. That is also why `SettingsView` hides the "Manage subscription" link for lifetime holders: there is nothing to manage.

**Family Sharing.** All three products have `familyShareable: true` in the StoreKit file. Turn Family Sharing on for all three in App Store Connect so testing matches shipping. Note that Family Sharing cannot be turned off again once enabled for a product.

The Display Name and Description limits below (30 and 45 characters) are what App Store Connect has enforced for in-app purchase localizations. All six strings are comfortably inside them, but **verify the live limits in the form** rather than trusting this table if you rewrite them.

### Product 1: Monthly

| Field | Value |
|---|---|
| Product ID | `app.cartworth.ios.pro.monthly` |
| Reference name (internal) | `Pro Monthly` |
| Duration | 1 month |
| Price | $3.99 USD |
| Display Name (30 char limit) | `Cartworth Pro Monthly` (21) |
| Description (45 char limit) | `Unlimited searches, alerts and trip plans` (41) |
| Family Sharing | On |
| Level | 2 (below yearly) |

### Product 2: Yearly

| Field | Value |
|---|---|
| Product ID | `app.cartworth.ios.pro.yearly` |
| Reference name (internal) | `Pro Yearly` |
| Duration | 1 year |
| Price | $19.99 USD |
| Display Name (30 char limit) | `Cartworth Pro Yearly` (20) |
| Description (45 char limit) | `A year of Pro. Our best-value plan.` (35). No price in the text: it would be wrong after any price change and in any other currency; StoreKit shows the real price. |
| Family Sharing | On |
| Level | 1 (above monthly) |

### Product 3: Lifetime

| Field | Value |
|---|---|
| Product ID | `app.cartworth.ios.pro.lifetime` |
| Reference name (internal) | `Pro Lifetime` |
| Type | **Non-Consumable** |
| Price | $29.99 USD |
| Display Name (30 char limit) | `Cartworth Pro Lifetime` (22) |
| Description (45 char limit) | `All Pro features, forever. One payment.` (39) |
| Family Sharing | On |

The three descriptions above are deliberately different from the strings in `Products.storekit`, which currently say "Unlimited stores, recipe lists, price alerts and more." That string is wrong: nothing in the app limits how many stores a free user can compare. The free limits are three searches per day (`UsageMeter.freeSearchesPerDay`) and one price watch (`UsageMeter.freeWatchItems`). Fix the local StoreKit file to match, or at minimum do not carry "unlimited stores" into App Store Connect, where it would be an inaccurate IAP description.

### Review screenshot note (required for each IAP)

Apple requires a screenshot per in-app purchase showing where the purchase is offered. Use the same shot for all three, since one paywall sells all three plans:

> Screenshot: the Cartworth Pro paywall, reached from Settings > Cartworth Pro > Get Pro, or by exceeding three free searches in a day. All three plans are on this one sheet: Monthly $3.99, Yearly $19.99, Lifetime $29.99. The selected plan is highlighted and "Continue" starts the purchase. Restore Purchases, Terms and Privacy links are directly below.

Capture it with the app running against the StoreKit configuration file or a sandbox account so real prices render rather than the fallback placeholders in `PaywallView.placeholderPrice`.

### Review notes for the IAPs

> Cartworth Pro is a single entitlement sold three ways. Monthly and yearly are auto-renewable subscriptions in one group; lifetime is a non-consumable, because a permanent unlock cannot be a subscription. Any of the three unlocks exactly the same features. No content is sold, unlocked or delivered outside the App Store, and the app contains no external purchase links. Restore Purchases is on the paywall and in Settings, and calls `AppStore.sync()`.

## 10. App Review notes

Paste this whole block into the App Review Information notes field.

```
NO ACCOUNT IS REQUIRED. There is no sign-in of any kind, so no demo credentials are
needed. Please do not reject for missing demo account information; the app has no
accounts at all.

WALKTHROUGH (about three minutes, no login)

1. Launch. Onboarding asks for a location. Tap "or enter ZIP code" and enter 60601
   (Chicago) or 60010 (Barrington, IL), then Continue. You can instead tap "Use my
   location" and grant when-in-use access. Either path works; the ZIP path avoids
   needing a simulated location.
2. The app finds grocery stores within the radius and shows which of them publish
   prices. Select three or four, then tap "Start comparing".
3. Search tab: type "milk" and hit search. Live prices are fetched from several
   retailer sites at once, so allow 20 to 60 seconds on a first run. You will see a
   best-price card, then each store's closest match, all normalized to a common unit
   (per gallon here). Each store is badged "shelf" or "online".
4. Tap any result to see the product detail and its unit price breakdown.
5. Deals tab: this week's weekly-ad circulars for those stores, with multi-buy, BOGO
   and coupon conditions spelled out. Tap any deal for the full fine print.
6. List tab: add "milk 1 gal", then "Plan the cheapest trip" to see what the list
   costs at one store versus a two- or three-store split. This is a Pro feature and
   will show the paywall.
7. Settings > "How prices work" explains the price sourcing in the app's own words.

SANDBOX / IAP: the paywall appears after three searches in a day, or from Settings >
Cartworth Pro > Get Pro, or from any Pro-gated feature. All three products are sold
from that one sheet. Restore Purchases is on the paywall and in Settings.

WHERE THE PRICES COME FROM

The iPhone app has no server and no price database. (A separate free web version at
cartworth.app runs on our server; the app does not use it.) Every price is read live,
from the user's own device, from the public website of the retailer whose store is nearest the
user:

 - Retailers whose own storefronts are Instacart-powered (aldi.us, shopwoodmans.com
   and the instacart.com storefronts most national and regional chains use)
 - wholefoodsmarket.com
 - traderjoes.com, whose store locator is served by alphaapi.brandify.com
 - Weekly circulars via backflipp.wishabi.com, the circular service the chains
   themselves distribute their weekly ads through

These are the same publicly posted prices any shopper sees by visiting those sites in
a browser. Nothing is behind a login, nothing is behind a paywall, no account is
created, no authentication is bypassed, and no personal data is transmitted: the
request carries a ZIP or approximate coordinates and a search term, which is what the
site needs to answer the query. Results are cached on the device for 20 minutes and
the app asks each site politely: one request at a time per site, at least 0.7 seconds
apart, and a site that answers "too many requests" is not asked again for a while.

The app displays no retailer logos and no retailer branding. Stores are shown by name
with a neutral color dot. Cartworth does not claim or imply any partnership,
affiliation or endorsement by any retailer, and says so in its terms.

Cartworth labels every price by provenance, because the distinction matters to
shoppers: "shelf" where the retailer publishes in-store prices, "online" where the
retailer only publishes a delivery listing that it itself says can run higher than the
shelf. Weekly-ad prices are labeled as coming from that store's circular. The app
tells the user in plain language that stores change prices without notice and to check
the shelf tag.

PRIVACY

No accounts, no analytics, no advertising SDKs, no third-party SDKs at all, no
tracking. Searches, shopping lists, price watches and price history are stored only in
SwiftData on the device, with no CloudKit and no sync. Location is when-in-use only,
requested at one-kilometer accuracy, and used solely to find nearby stores.
PrivacyInfo.xcprivacy declares no collected data types.

WHY THERE IS A FREE WEBSITE

cartworth.app is a free browser version of the comparison and weekly-ad features. The
iPhone app is the paid personal layer: price watches with alerts, favorite-brand
alerts, recipe-to-list, trip planning, price history and next week's ads. Nothing is
purchased on the website, nothing purchased elsewhere is unlocked in the app, and the
app contains no link or reference to any external purchase mechanism. All paid access
inside the app is sold exclusively through In-App Purchase.

BACKGROUND REFRESH

The app registers one BGAppRefreshTask (app.cartworth.ios.refresh) that re-checks
watched items and favorite brands and posts local notifications when a target price is
hit or a favorite appears in an ad. It runs only for Pro subscribers who have turned
alerts on in Settings. No remote push, no push certificate, no notification server.
```

### Preemptive answers to the objections most likely to come back

| Likely objection | Guideline | Answer to give |
|---|---|---|
| "Provide a demo account." | 2.1 | There is no account system. Say so in one line and point at the walkthrough. This is the single most common false-start on account-free apps. |
| "Your app uses content from a third-party service. Provide documentation that you are permitted to do so." | **5.2.2** | This is the real risk and you should expect it. The honest answer is the one in the notes: the prices are publicly published by the retailers on their own sites, read from the user's device as an ordinary visitor, with no login, no paywall bypass, no logos and no claimed affiliation. **This is not a settled question and I am not telling you it is.** See the trademark and third-party data item in `APP_STORE_CHECKLIST.md`; whether to accept this risk is your call, not a technical detail. |
| "Screenshots show third-party branding." | 5.2.1 / 2.3.3 | Follow the screenshot rules in section 11: no retailer logos, no circular artwork, no retailer product photography in a hero position. |
| "Your app's metadata mentions other apps or platforms." | 2.3.10 | The description mentions cartworth.app, which is your own site, and that is fine. Do not add "works with Instacart" or any retailer name to the metadata. |
| "Minimum functionality." | 4.2 | Unlikely for this app, but the answer is that it performs live multi-source retrieval, unit normalization, relevance matching, on-device OCR and a multi-store optimization, none of which is a repackaged website. |
| "Subscription terms are not disclosed." | 3.1.2 | The paywall already shows duration, price per plan, "Subscriptions renew automatically until cancelled. Manage or cancel any time in your Apple ID settings. The lifetime option is a one-time purchase.", plus Terms and Privacy links. Those two links must resolve to live pages before you submit or this becomes a rejection. |
| "Why is the app paid when the website is free?" | n/a | Not a guideline issue. Apple does not require price parity across platforms. The one rule you must not break is 3.1.1: never link to or mention an external way to buy. You do not. |
| "Location purpose string." | 5.1.1 | Already precise in `Info.plist`: "Your location is used only to find the grocery stores near you." Camera and photo strings are equally specific. |

## 11. Screenshot plan

### Sizes to upload

| Set | Resolution | Required? |
|---|---|---|
| iPhone 6.9" | 1290 x 2796 (16 Plus / 16 Pro Max class) or 1320 x 2868 | **Required.** Apple down-scales this set for smaller iPhones, so this is the only iPhone set you must produce. |
| iPad 13" | 2064 x 2752 or 2048 x 2732 | **Required, because this is a universal app.** `TARGETED_DEVICE_FAMILY` is `"1,2"` in `ios/project.yml`, so the App Store shows an iPad tab and demands iPad screenshots. |

Two things to settle before you shoot:

- **Orientation.** `Info.plist` restricts iPhone to portrait only, so iPhone screenshots must be portrait. iPad allows all four orientations, so either works; portrait is less work and reads better in the gallery.
- **Whether you actually want iPad.** If you do not intend to support and test iPad properly, set `TARGETED_DEVICE_FAMILY` to `"1"` before archiving and the iPad requirement disappears. Shipping an untested iPad build is a common 2.1 rejection. This is a real decision, not a formality.

**Verify the current required sizes in App Store Connect when you upload.** Apple has changed the required screenshot matrix repeatedly, most recently by consolidating iPhone sizes onto 6.9"; treat the table above as what was true when written, not as a permanent rule.

### The six screenshots

Captions sit above the device frame in the standard uploaded-artwork style. Keep every caption to one line at the width you design for.

| # | Screen | What must be visible | Caption |
|---|---|---|---|
| 1 | Search results for "milk" | The best-price card at the top, then three or four store rows with their unit prices in the same unit, each badged "shelf" or "online", with distances | **Every store near you. One search.** |
| 2 | The same results with the unit-price detail showing | Two products of visibly different package sizes whose per-unit prices invert the apparent ranking, so the point makes itself | **The bigger jug isn't always cheaper.** |
| 3 | Deal detail from a weekly ad | The multi-buy or coupon price with its conditions spelled out: the limit, the must-buy quantity, the price without the coupon | **"2 for $5" with the fine print attached.** |
| 4 | Shopping list with a completed trip plan | The single-store total, the two-store split and the cherry-pick total side by side, with the difference between them legible | **One store or two? See what each trip costs.** |
| 5 | Recipe import result | The captured recipe's ingredients parsed into list rows, pantry staples greyed out, with prices attached | **Snap a recipe. Get a priced list.** |
| 6 | A price watch with its history chart | The chart, the current price, the target price and the "lowest price yet" state | **Know your price. Get told when it hits.** |

Ordering logic: 1 states what the app is, 2 delivers the insight that makes someone care, 3 is the most shareable single moment the product has, and 4 through 6 are the Pro features that justify the price. If you only ever get two of these right, make it 1 and 2, because the gallery preview shows the first two or three.

### Rules for the shots

- **No retailer logos and no circular artwork.** The app itself never renders a retailer logo (`Chain.retailer` sets `logoURL: nil` and stores are drawn as neutral colored dots), so this is only a risk in screenshots 3 and 5, where `AsyncImage` renders product and flyer images pulled from the source. Pick items whose imagery is a plain product photo, or crop so the artwork is incidental rather than the subject. Retailer names as plain text next to a neutral dot are nominative use and are fine; their logos are not.
- **Every price on screen is real, dated and example-only.** Do not mock up prices. If a caption or overlay implies a specific saving, it becomes a claim you have to defend.
- **Never state a dollar amount of savings** anywhere in screenshots or metadata. "Save up to $40 a week" is unprovable and invites both an App Review problem and an FTC-style substantiation problem.
- **Do not show the free-tier counter** ("You have 2 free searches today") in any screenshot. It reads as a limitation, not a feature.
- Use a device with a clean status bar: full signal, full battery, no carrier oddities.

### How to capture them

The UI test target already drives these flows and writes PNGs. `UITests/FlowTests.swift` launches with `-qaZip <ZIP>` and `-proUnlocked`, waits for live data, and calls `shoot(name:)`, which attaches each screenshot to the test result and also writes it to the simulator's `tmp/shots` directory. Run that target on an iPhone 16 Pro Max simulator and an iPad Pro 13" simulator and you have raw frames at the right resolutions without tapping anything by hand. The `-proUnlocked` argument is `#if DEBUG` only, so it cannot leak into a release build.
