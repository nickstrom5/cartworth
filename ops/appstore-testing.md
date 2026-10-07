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
- [x] Pull `fix-round-3`. `project.yml` gained a `postGenCommand` this round, which gives the
      scheme's Test action the StoreKit configuration; the committed project already has it. If
      you change `project.yml`, run `xcodegen`.
- [x] Cmd+U on an iPhone 16 Pro simulator, then an iPad Pro 13" simulator. The UI-hosted suites
      (`HostedScreenTests`, `PriceLayoutTests`, `SearchScreenGuardTests`, `ReadablePageTests`,
      `TripPlanSavingsTests`, `ChartTests`, `InstacartProvenanceTests`, `PurchaseTests`) and
      `AppUITests` only run here. Every one must pass. Pick iOS 27 simulators by id
      (`xcrun simctl list devices`): the iOS 26.5 iPad Pro 13" on the build Mac never rotates
      under XCUITest, status bar and keyboard included, so both `IPadLandscapeTests` fail there;
      on the iOS 27.0 iPad Pro 13" both pass.
      Done 27 Sep 2026 with `xcodebuild test` on the iOS 27.0 iPhone 18 Pro and iPad Pro 13":
      `AppTests` 396 of 396 on each; `DuoTests`, `FlowTests` and `IPadLandscapeTests` pass on each
      (the landscape pair skip on the phone by design). `SubmissionSet` and `StoreShots` are the
      screenshot captures for the listing, run when the screenshots are taken, not as checks.
- [x] Product > Archive with the Release configuration succeeds with no warnings about missing
      usage strings or privacy manifest entries. Done 27 Sep 2026: no warnings; the app holds
      `PrivacyInfo.xcprivacy` and no `.storekit` file; version 1.0.0 (1).

### 2. StoreKit with the local configuration (10 min by hand)
`PurchaseTests` runs this step in the Cmd+U above: an `SKTestSession` on `Products.storekit`,
StoreKit 2's own calls and signed transactions, the paywall and Settings hosted and pressed
through their accessibility elements. The payment sheet is switched off (`disableDialogs`). It
passes on the iOS 27.0 iPhone 18 Pro and iPad Pro 13" simulators. The scheme's Test action must
name `Products.storekit` (see `postGenCommand` in `project.yml`): without it every case fails
with "no products".
- [x] Buy monthly, yearly and lifetime; each unlocks Pro immediately.
- [x] Cancel at the payment sheet: nothing unlocks, no error. StoreKit's cancel answer is handed
      to the app in place of the sheet, both ways StoreKit gives it (a `.userCancelled` result
      and a thrown `StoreKitError.userCancelled`).
- [x] Restore purchases (paywall and Settings) after clearing the app's state, which is all a
      reinstall clears: the app keeps no purchase state of its own. Pro also comes back at launch.
- [x] Refund a purchase, lifetime or subscription: Pro goes away with the app running.
- [x] A subscription with auto-renew off expires: Pro goes away with the app running.
- [x] Ask to Buy: the paywall says the purchase is waiting for approval; approval unlocks Pro.
- [x] The paywall shows StoreKit's own prices; change a price in the configuration and it follows.

Still by hand, with Scheme > Run > Options > StoreKit Configuration: `Products.storekit`:
- [ ] The payment sheet itself: it shows the plan and price, Cancel on it unlocks nothing and
      shows no error, confirming unlocks. An `SKTestSession` cannot cancel a purchase: its
      simulated `userCancelled` reaches the app as `StoreKitError.unknown`.
- [ ] Debug > StoreKit > Manage Transactions > Expire Subscription with the app open. On the
      iOS 27 simulator `SKTestSession.expireSubscription` never reaches the app (its entitlements
      keep the old expiry date and no update arrives), so the tests let a subscription lapse
      instead. If Xcode's button behaves the same way and Pro stays, that is the simulator, not
      the app; step 4's sandbox subscription is the real check.
- [ ] A real delete and reinstall, then Restore purchases from Settings.

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
- [x] Upload the Release archive. Internal testing first (no review). Done 2 Oct 2026: 1.0.0 (1)
      is in the internal group `Owner`; install it from the TestFlight app on the owner's iPhone.
- [ ] External testing: it goes through Beta App Review, a lighter pass of the same rules. It is the
      cheapest place to learn how Apple reads guideline 5.2.2 (third-party content), the one
      open risk in `marketing/APP_STORE_CHECKLIST.md` item 13.

### 6. Submission
- [ ] App Privacy, Content Rights (answer Yes), export compliance (No: HTTPS only) and the App
      Review notes exactly as in `marketing/APP_STORE_LISTING.md`.
- [ ] Screenshots from a Release build with the `-qaHideSponsored` and `-qaHideRemoteImages`
      launch arguments (Debug only; they keep other companies' ads and images out of marketing art).
