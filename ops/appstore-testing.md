# Testing the iPhone app for the App Store

What has already been tested without a Mac, and what only a Mac and real devices can do. The
account and paperwork side (enrolment, agreements, App Store Connect records, icons, screenshots)
is `marketing/APP_STORE_CHECKLIST.md`; the listing text, App Privacy answers and App Review notes
are `marketing/APP_STORE_LISTING.md`.

## Already covered, on every change (no Mac needed)

- **The pricing core compiles and its XCTests pass on Linux:** `ios/linux/run-core-tests.sh` builds
  `Core/`, `Sources/`, the HTTP layer and cache, the catalog and the seasonal calendar with Swift
  6.1+, and runs `CoreTests`, `PricingRound2Tests` and `ThanksgivingPricingTests` (306 tests,
  including all 95 generated holiday-matrix tests). `npm test` runs it when `SWIFT=` points at a
  toolchain.
- **The same fixtures drive both platforms:** the holiday matrix (`test/fixtures/holiday-matrix.json`)
  generates the Swift tests (`scripts/gen-ios-holiday-tests.js --check`), and the iOS catalog is
  generated from the web's (`scripts/gen-ios-catalog.js --check`).
- **What App Review reads from the code** (`test/qa-appstore.test.js`): permission usage strings,
  the privacy manifest's required-reason APIs, the paywall's 3.1.2 elements, no price in IAP text,
  Settings' privacy/terms/support links, debug unlocks only in DEBUG builds, no web-only wording,
  the export-compliance answer.

## On the Mac, in this order

### 1. Build and the full test suite (30 min)
- [ ] Pull `fix-round-3`. `project.yml` is unchanged this round; if you change it, run `xcodegen`.
- [ ] Cmd+U on an iPhone 16 Pro simulator, then an iPad Pro 13" simulator. The UI-hosted suites
      (`HostedScreenTests`, `PriceLayoutTests`, `SearchScreenGuardTests`, `ReadablePageTests`,
      `TripPlanSavingsTests`, `ChartTests`, `InstacartProvenanceTests`) and `AppUITests` only run
      here. Every one must pass.
- [ ] Product > Archive with the Release configuration succeeds with no warnings about missing
      usage strings or privacy manifest entries.

### 2. StoreKit with the local configuration (30 min)
Scheme > Run > Options > StoreKit Configuration: `Products.storekit`.
- [ ] Buy monthly, yearly and lifetime; each unlocks Pro immediately.
- [ ] Cancel at the payment sheet: nothing unlocks, no error.
- [ ] Restore purchases (paywall and Settings) after deleting and reinstalling.
- [ ] Debug > StoreKit > Manage Transactions: refund a purchase (Pro goes away), expire a
      subscription, turn on Ask to Buy (the app shows "pending", then unlocks on approval).
- [ ] The paywall shows StoreKit's own prices; change a price in the configuration and it follows.

### 3. On a real iPhone (1-2 h)
- [ ] First launch: Allow location (while using), then again with Don't Allow and with Precise
      off. The ZIP path must work in every case.
- [ ] Search "milk" in a real ZIP: every price labelled shelf / online / chain-wide, the best card
      says where its price came from.
- [ ] Airplane mode mid-search, and Network Link Conditioner at "3G" and "Very Bad Network": no
      spinner that never ends, a clear message, saved prices when there are some.
- [ ] Recipe scan with the camera (VisionKit) and from Photos.
- [ ] Price watch + notification: add a watch, Debug > Simulate Background Fetch, check the alert.
- [ ] Accessibility: VoiceOver across every tab; Dynamic Type at the largest accessibility size
      (nothing clipped, prices never truncated); Reduce Motion; dark mode; Increase Contrast.
- [ ] iPad: every orientation, Split View and Stage Manager window sizes.
- [ ] Memory: Instruments > Leaks over ten searches and a trip plan; no growth that does not settle.

### 4. Sandbox purchases on the device (30 min)
- [ ] Settings > App Store > Sandbox Account with a sandbox tester; buy, restore, and let a monthly
      subscription renew (sandbox months are minutes).

### 5. TestFlight
- [ ] Upload the Release archive. Internal testing first (no review).
- [ ] External testing: it goes through Beta App Review, a lighter pass of the same rules. It is the
      cheapest place to learn how Apple reads guideline 5.2.2 (third-party content), the one
      open risk in `marketing/APP_STORE_CHECKLIST.md` item 13.

### 6. Submission
- [ ] App Privacy, Content Rights (answer Yes), export compliance (No: HTTPS only) and the App
      Review notes exactly as in `marketing/APP_STORE_LISTING.md`.
- [ ] Screenshots from a Release build with the `-qaHideSponsored` and `-qaHideRemoteImages`
      launch arguments (Debug only; they keep other companies' ads and images out of marketing art).
