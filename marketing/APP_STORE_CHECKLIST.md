# Cartworth: what the owner has to do

Everything on this list needs a human with account credentials, a legal opinion, a design decision or a signature. None of it can be done from the codebase.

The order is the dependency order. Doing item 6 before item 1 is impossible; doing item 11 before item 4 wastes a week.

**Legend**

- 🔴 **BLOCKER** means you cannot submit, or cannot test the thing that matters, until it is done.
- 🟡 means it can follow the first submission without breaking anything.

Where a rule has been changing at Apple's end, it is marked **verify** rather than stated as fact. Apple revises these requirements regularly and a confidently wrong instruction here costs you a rejection cycle.

---

## 1. 🔴 Apple Developer Program enrollment

- [x] Confirm the membership on Team ID **4C8TU6U7MQ** is active and not within 30 days of expiry (developer.apple.com/account, Membership Details)
- [x] Confirm your role on that team is **Account Holder** or **Admin**, not Developer
- [x] Decide and confirm the enrollment type: **Individual** or **Organization**

**Why it matters.** `DEVELOPMENT_TEAM: "4C8TU6U7MQ"` is already hardcoded in `ios/project.yml`, which means an account exists. What matters now is that it is paid, current, and that you personally have the rights to create identifiers, certificates and app records. A Developer-role account can build and run on a device but cannot create the App Store Connect record.

**What breaks if skipped.** An expired membership silently invalidates your signing certificates. Archives stop being uploadable and TestFlight builds already in the field stop installing.

**The decision hiding in here.** Individual enrollment publishes your personal legal name as the seller on every product page, worldwide, permanently visible. Organization enrollment publishes the entity name but requires a legal entity and a D-U-N-S number, and Apple's verification of a new entity can take one to several weeks. If you want the App Store to say "Cartworth LLC" rather than your name, **start this now**, because it gates everything else and it is the one item with an unpredictable external wait. Switching from Individual to Organization after launch is possible but is a support-ticket process, not a settings toggle.

## 2. 🔴 Paid Applications Agreement, banking, and tax forms

**Done (checked 2 Oct 2026):** Paid Apps Agreement active Sep 21, 2026 to Sep 20, 2027; bank account and W-9 active. The enrollment is Individual, so the seller and the copyright line are Nicholas Soderstrom.

- [x] App Store Connect > Business (older UI: Agreements, Tax, and Banking) > **Paid Applications** agreement shows **Active**
- [x] A bank account is attached to the agreement and has passed validation
- [x] Tax forms are complete and show a valid status: the US form (W-9 for a US person or entity), plus any additional forms App Store Connect asks for based on where you sell
- [ ] The legal entity on the agreement matches the entity you will name in the copyright line

**Why this is at the top of the list, above every technical step.**

Until the Paid Applications agreement is **Active**, the App Store does not know your app is allowed to sell anything, and:

- `Product.products(for:)` in `ios/App/Services/Entitlements.swift` returns an **empty array**. The paywall then sets `loadError` and shows "Subscriptions aren't available right now." No amount of debugging the StoreKit code will fix it.
- Sandbox purchases fail. You cannot test the buy flow, the restore flow, the upgrade path or the lifetime unlock against the real sandbox.
- You cannot submit the three in-app purchases for review at all.

Tax forms and bank validation are the slow part. Bank validation in particular depends on your bank and can take business days. **This is the single most common reason a first paid app slips by a week or two, and it is invisible until you try to test.**

**The one thing that does work without it.** The project already wires `App/Resources/Products.storekit` into the `App` scheme (`ios/project.yml`, `scheme.storeKitConfiguration`). That is a *local simulated* StoreKit store, so you can exercise the paywall UI, purchase flow and restore logic in the simulator today. It proves your code works. It proves nothing about your App Store Connect setup, and it will not catch a missing agreement, a wrong product ID, a product stuck in "Missing Metadata" or a broken subscription group.

## 3. 🔴 Trademark clearance on the name "Cartworth"

- [ ] Search the USPTO for "Cartworth" and near neighbours
- [ ] Search specifically in **Class 9**, **Class 35** and **Class 42**
- [ ] Search common-law use: Google, the App Store itself, Google Play, state trademark registers, and the .com/.app domains
- [ ] Look specifically at retail-savings marks that are phonetically or conceptually close, including Target's **Cartwheel**, which sits in the same consumer-savings space
- [ ] Decide whether to get a real clearance opinion from a trademark attorney before you spend money on an icon, brand assets or paid acquisition
- [ ] Decide whether to file an intent-to-use application

**Which tool to use.** **TESS was retired in November 2023.** The current system is the USPTO **Trademark Search** at `tmsearch.uspto.gov`. Anything telling you to use TESS is out of date.

**Which classes and why.**

| Class | Covers | Why it applies |
|---|---|---|
| **9** | Downloadable mobile application software | The iPhone app itself. This is the primary class. |
| **42** | SaaS, non-downloadable software, hosting | The cartworth.app website as a hosted service. |
| **35** | Advertising, business services, retail and consumer information services | Price comparison services for consumers frequently register here. This is the class people forget, and it is where a conflict with a retail-savings brand would most likely live. |

**Why it matters.** Apple does not check trademarks for you, and Apple will not defend you. A trademark owner can file a complaint through Apple's dispute process and get your app removed, after launch, after you have paid for acquisition, and the App Store name is not transferable in a way that makes a rename painless. Rebranding after launch costs you the domain, the icon, the screenshots, the reviews, the ranking and the press.

**This is explicitly your call, not mine.** A search is not a clearance opinion. I can tell you which database to search and which classes to search in; I cannot tell you whether a given result creates a likelihood-of-confusion problem, and neither can any automated tool. If Cartworth is a business rather than a weekend project, pay a trademark attorney for a knockout search before item 8 (the icon), because that is where the money starts going.

**Do this before the icon and the screenshots, not after.** That is the only reason it sits at number 3.

## 4. 🔴 The cartworth.app domain and three live pages

- [x] Register and control **cartworth.app**
- [x] Serve it over **HTTPS with a valid certificate**
- [x] `https://cartworth.app/privacy` returns a real page, publicly, with no login and no JavaScript gate
- [x] `https://cartworth.app/terms` returns a real page
- [x] `https://cartworth.app/support` returns a real page
- [ ] Each page renders correctly in Safari on an iPhone
- [ ] Merge `fix-round-3` into `main` (pull request 1) before submitting: the site deploys from
      `main`, and the live `/privacy` does not yet have the corrected disclosures from c0c1a6f

**Why the HTTPS line is not boilerplate.** `.app` is one of the TLDs on the HSTS preload list. Browsers refuse plain HTTP for `.app` domains entirely. There is no "we will add TLS later" option; without a certificate the pages simply do not load.

**Why it matters.** The app links to all three from inside the binary:

- `ios/App/UI/Settings/SettingsView.swift` links to all three
- `ios/App/UI/Paywall/PaywallView.swift` links to Terms and Privacy directly beside the purchase button

A link to a 404 next to a purchase button is a guideline 3.1.2 rejection, and a Privacy Policy URL is a required field on the App Store Connect version page that Apple actually checks. **This is the item most likely to be treated as a formality and then to cause the rejection.**

**The website's current state (checked 27 Sep 2026).** cartworth.app is live on Cloudflare (the `cartworth` Worker, built from `main`), branded Cartworth, over HTTPS with HSTS. `/privacy`, `/terms` and `/support` each return 200 without `.html`.

### What `/privacy` must actually say

Do not use a generic template. The whole point of this app's privacy story is that it is unusual, and a boilerplate policy claiming you collect analytics will directly contradict your App Privacy answers.

It must cover:

- Who publishes the app, and a working contact route
- **That no account is required and none can be created**
- That searches, shopping lists, price watches, favorites and price history are stored only on the device, and that there is no Cartworth server and no cloud sync
- **The honest disclosure:** that when the user searches, their device sends their ZIP code or approximate coordinates and their search term directly to retailers' own websites and to the weekly-circular service, that those requests are governed by those companies' own privacy policies, and that Cartworth neither receives nor stores any of it
- How location is used: when-in-use only, at approximately one-kilometer accuracy, solely to find nearby stores
- How camera and photo access are used: recipe text recognition runs on the device with Apple's Vision framework and images are never uploaded
- That there is no analytics, no advertising, no tracking, no data broker relationship, and that no data is sold or shared
- How to delete data: Settings has "Clear cached prices" and "Delete price history"; deleting the app removes everything else
- That the app is not directed to children under 13
- A California/CPRA section, and a GDPR/UK section if you will sell outside the United States
- An effective date and a changes clause

### What `/terms` must actually say

This doubles as your EULA for the subscriptions. It must include Apple's minimum EULA terms if you are replacing Apple's standard one, and it must include:

- The auto-renewal disclosure: what renews, at what price, that it renews until cancelled, that cancellation is through Apple ID settings, and that the lifetime unlock is a one-time non-renewing purchase
- **A no-warranty clause on price accuracy.** This is the clause that matters most for this product. The app already tells users "Cartworth is a guide, not a guarantee" and that stores change prices without notice; the terms must say the same thing in enforceable language
- **An explicit non-affiliation statement:** Cartworth is not affiliated with, endorsed by, or sponsored by any retailer, and all retailer names and marks belong to their respective owners
- Limitation of liability, acceptable use, governing law, and a changes clause

### What `/support` must actually say

- A way to reach a human that you will actually monitor, and a stated response expectation
- If you publish an email address, **it must exist and be monitored before you submit**. Do not invent one for the listing
- Basic self-service: how prices work, why a store shows "online" instead of "shelf", how to restore a purchase, how to cancel

## 5. 🔴 Identifiers, certificates and provisioning

- [ ] Register an **explicit** App ID for `app.cartworth.ios` at developer.apple.com/account > Identifiers
- [ ] Confirm **In-App Purchase** is enabled on that App ID
- [ ] Confirm you have a valid **Apple Distribution** certificate on the team (Xcode can create it: Settings > Accounts > Manage Certificates)
- [ ] Let Xcode manage the App Store provisioning profile (signing is already `Automatic`)
- [ ] Do **not** enable Push Notifications

**Why it matters.** In-App Purchase requires an explicit App ID; a wildcard ID will not carry it. Without it the products never attach to your app and `Product.products(for:)` returns empty for a second, entirely different reason than item 2, which makes it maddening to diagnose.

**Why no push.** `ios/App/Services/BackgroundRefresh.swift` posts **local** notifications via `UNUserNotificationCenter` from a `BGAppRefreshTask`. There is no remote push anywhere in the app. Enabling the Push Notifications capability you do not use adds an entitlement Apple may ask you to justify, and a push certificate you then have to maintain.

**Already handled in the project, no action needed:** `CODE_SIGN_STYLE: Automatic` and `DEVELOPMENT_TEAM` are set in `ios/project.yml`, and `BGTaskSchedulerPermittedIdentifiers` in `Info.plist` derives from the bundle id, so it needs no separate registration.

## 6. 🔴 Create the App Store Connect record

**Created:** "Cartworth", Apple ID 6816954374, bundle ID `app.cartworth.ios`, SKU `cartworth-ios`.

**Set 2 Oct 2026:** name `Cartworth: Grocery Prices` (accepted, so available), subtitle, Shopping / Food & Drink, Content Rights Yes, age rating 13+ (see `APP_STORE_LISTING.md` section 7), United States only, price Free. On the 1.0.0 version page: copyright `2026 Nicholas Soderstrom`, support and marketing URLs; the Privacy Policy URL is on the App Privacy page. The version record was renamed 1.0 → 1.0.0 to match the build's `MARKETING_VERSION`.

- [x] Check that your chosen app name is **available** (App Store names are globally unique per platform)
- [x] Create the app: Platform iOS, the name, Primary Language English (U.S.), Bundle ID `app.cartworth.ios`, and an SKU of your choosing
- [x] Set Primary Category **Shopping**, Secondary **Food & Drink**
- [x] Decide and set **availability territories**

**Why the name check comes first.** If "Cartworth: Grocery Prices" is taken, you find out here, and you would rather find out before you have icons, screenshots and a domain built around it. Creating the record reserves the name for a period, so create it early even if you are months from submitting. **Verify the current reservation period in App Store Connect; Apple has changed how long an unused reservation holds.**

**The territory decision is a real one.** Shipping to the European Union brings obligations that do not apply to a US-only release, including the Digital Services Act trader declaration in App Store Connect and a GDPR-compliant privacy policy. The app is US-only in substance anyway: `Geo.isValidZip` requires a 5-digit US ZIP, and `RetailerCatalog` is entirely US chains (`FlippSource.locale` has a Canadian postal-code branch, but no Canadian retailers are configured). **The straightforward v1 answer is United States only.** Expanding territories later is a settings change; retrofitting EU compliance is not. **Verify the current EU trader requirements in App Store Connect when you set territories.**

**Two App Store Connect questions people answer wrong:**

- **Content Rights: "Does your app contain, show, or access third-party content?" Answer Yes.** The app displays retailer prices, product images and weekly-ad content. Answering No here would be false, and it is the same underlying issue as the 5.2.2 risk in item 13. Answer honestly and be ready to explain, which the App Review notes in `APP_STORE_LISTING.md` already do.
- **Advertising Identifier (IDFA): No.** The app does not use it. There is no `AppTrackingTransparency` import and no `NSUserTrackingUsageDescription` key.
- **Account deletion requirement: not applicable.** That requirement applies to apps that support account creation. Cartworth has no accounts at all.

## 7. 🔴 Create the three in-app purchase products

- [x] Create the subscription group `Cartworth Pro`
- [x] Create `app.cartworth.ios.pro.monthly`, auto-renewable, 1 month, $3.99
- [x] Create `app.cartworth.ios.pro.yearly`, auto-renewable, 1 year, $19.99
- [x] Create `app.cartworth.ios.pro.lifetime`, **Non-Consumable**, $29.99
- [x] Add a localization (display name and description) to every product
- [x] Upload the review screenshot to every product
- [x] Enable Family Sharing on all three
- [x] Set the subscription levels: yearly above monthly
- [ ] Add the Privacy Policy URL and Terms of Use (EULA) link to the subscription group metadata. (2 Oct 2026: the group page in App Store Connect has no such fields any more. The Privacy Policy URL is on App Privacy; the Terms link has to go in the App Store description, e.g. a last line `Terms of Use: https://cartworth.app/terms`, or into App Information > License Agreement. Neither is done yet.)
- [ ] Attach all three products to version 1.0 when you submit

Field-by-field values are in `APP_STORE_LISTING.md` section 9. Use them verbatim.

**Done 2 Oct 2026:** group `Cartworth Pro` (ID 22434371, display name `Cartworth Pro`), Pro Yearly (Apple ID 6818549580, level 1), Pro Monthly (6818551820, level 2), Pro Lifetime (6818552644). Each is US-only at its price, with Family Sharing on (the owner confirmed it is permanent), the section 9 display name and description, the paywall screenshot from d267d52 and the section 9 review notes. All three are Prepare for Submission and none has been submitted.

**Why the product IDs must be exact.** `Entitlements.productPrefix` returns `Bundle.main.bundleIdentifier`, and `Plan.productId` builds `"\(prefix).pro.\(rawValue)"`. A typo in App Store Connect does not produce an error; it produces a paywall with no prices and the message "Subscriptions aren't available right now."

**Why the review screenshot is not optional.** A subscription without a localization and a review screenshot sits in **Missing Metadata** forever and cannot be submitted. This silently blocks the whole version.

**Why they must be attached to version 1.0.** If you submit the app without attaching the IAPs, the app gets reviewed and the purchases do not, and you ship a paywall that cannot complete a purchase. In App Store Connect, add them in the In-App Purchases section of the 1.0 version page before you submit.

**Why lifetime is outside the group.** Subscription groups hold only auto-renewable subscriptions. A permanent unlock has to be a Non-Consumable. The code already handles both shapes in `Entitlements.refresh()`.

**Family Sharing is one-way.** All three products have `familyShareable: true` in `Products.storekit`, so enable it in App Store Connect to match. Be deliberate: once Family Sharing is enabled on a product it **cannot be turned off**.

**Verify in App Store Connect:** the exact wording and placement of the subscription level / ranking controls, which Apple has renamed more than once.

## 8. 🔴 A real app icon

- [x] Design an actual icon
- [x] Export the light 1024x1024 PNG
- [x] Export the dark variant
- [x] Export the tinted variant as **grayscale**
- [x] Replace the three files in `ios/App/Resources/Assets.xcassets/AppIcon.appiconset/`
- [ ] Confirm on a real device in light mode, dark mode and tinted mode

**Current state (checked 27 Sep 2026): a real icon.** A white basket holding three bars, the last one yellow, on green; the dark variant is the same mark in green and yellow on near-black; the tinted variant is in grays. All three are 1024x1024 RGB PNGs with no alpha channel, and `Contents.json` names them for the light, dark and tinted appearances. What is left is looking at it on a device.

**What breaks if skipped.** A solid color square will pass technical validation, so nothing will stop you shipping it. What it will do is cost you every install where the icon is the only thing a browsing user sees, and it invites a rejection for a generic or incomplete app under guideline 4.0 or 2.3.8. It is also the single strongest signal to a reviewer that the app is unfinished.

**Requirements that catch people out.**

- No alpha channel and no transparency (already correct in the current files)
- Square with no rounded corners; the system masks it
- No drop shadow baked in
- sRGB or Display P3
- The **tinted** variant should be a grayscale image; the system applies the user's tint. Shipping a colored file as the tinted variant renders wrong

**Verify:** icon authoring on current Xcode has moved toward layered icons via Icon Composer, with new appearance modes introduced in the latest OS. Check what Xcode 27 expects for the asset catalog before you finalize the export pipeline rather than assuming the three-PNG set is still the whole story.

## 9. 🔴 Sandbox testing of the real purchase flow

Depends on item 2 being **Active**, item 5, item 6 and item 7.

- [ ] Create a sandbox tester: App Store Connect > Users and Access > Sandbox > Test Accounts, using an email address not already tied to any Apple ID
- [ ] On a real device, sign into the sandbox account under Settings > Developer
- [ ] **Turn off the StoreKit configuration file in the scheme** for these runs, or you will test the simulator's fake store again
- [ ] Buy monthly. Confirm Pro unlocks and the search limit disappears
- [ ] Buy yearly from a monthly subscription. Confirm the upgrade behaves the way item 7's levels say it should
- [ ] Buy lifetime. Confirm `activePlan` shows Lifetime and that Settings **hides** the "Manage subscription" link
- [ ] Delete and reinstall the app, then tap **Restore Purchases**. Confirm Pro returns
- [ ] Let a monthly subscription lapse. Confirm Pro switches off and the free limits come back

**Why it matters.** Local StoreKit testing in the simulator validates your code path. Sandbox is the only thing that validates your App Store Connect configuration: real product IDs, real group structure, real level behavior, real restore. Restore in particular has to work, because Apple's reviewer will try it and 3.1.1 requires it on any app that sells a non-consumable.

**The lapse test matters more than it looks.** `Entitlements.refresh()` skips entitlements whose `expirationDate` is in the past. If that logic were wrong, subscribers would keep Pro forever and you would never find out from a happy-path test.

**Verify in App Store Connect:** sandbox subscription renewal timing. Apple accelerates renewals in sandbox and has made the rate configurable; check the current setting rather than assuming a fixed ratio.

## 10. 🔴 Screenshots

- [ ] Capture the iPhone 6.9" set, portrait
- [ ] Capture the iPad 13" set (or drop iPad, see below)
- [ ] Design the caption frames
- [ ] Check every frame for retailer logos and flyer artwork before uploading

The six shots, their captions and the content rules are specified in `APP_STORE_LISTING.md` section 11. The mechanical capture is already automated: `ios/UITests/FlowTests.swift` launches with `-qaZip <ZIP>` and `-proUnlocked`, drives the real flows against live data, and writes PNGs to the simulator's `tmp/shots`. Run it on an iPhone 16 Pro Max simulator and an iPad Pro 13" simulator.

**The iPad decision.** `TARGETED_DEVICE_FAMILY` is `"1,2"` in `ios/project.yml`, so this is a universal app and iPad screenshots are mandatory. If you have not actually tested the iPad layout, the better move is to set it to `"1"` before archiving and ship iPhone-only. Shipping an untested iPad build is a routine 2.1 rejection, and adding iPad later is easy.

**Verify in App Store Connect:** the required size matrix. Apple has consolidated the iPhone requirements onto the 6.9" set, and has changed the rules more than once; confirm what the upload page demands on the day.

## 11. 🔴 Export compliance

- [x] Confirm `ITSAppUsesNonExemptEncryption` is `false` in `ios/App/Resources/Info.plist` (it already is; build 1 went through TestFlight without the question being asked)
- [ ] If App Store Connect asks anyway, answer: the app uses encryption, and it is **exempt**

**What to answer and why it is correct.** The app's only cryptography is TLS, provided by the operating system through `URLSession`, plus a single `SHA256.hash` call in `ios/App/Networking/Cache.swift` used to turn a cache key into a filename. A hash is not encryption, and OS-provided HTTPS falls squarely within the exemption for standard encryption supplied by the platform. There is no custom crypto, no bundled crypto library, and no encryption of user data at rest beyond what iOS does itself.

Because the key is already `false` in `Info.plist`, App Store Connect should stop asking the question on every build, which also means you will not be prompted to re-answer and get it wrong under time pressure.

**What breaks if you get it wrong.** Declaring no encryption when you use non-exempt encryption is a US export control violation, not merely an App Store problem. Declaring it wrongly in the other direction just means you file paperwork you did not need.

**Verify:** France has historically required a separate encryption declaration for apps distributed there. If you expand beyond US-only availability, check whether App Store Connect asks you anything additional for those territories.

## 12. Build, archive and upload

Depends on items 1, 5, 6 and 8.

- [x] Decide the final `MARKETING_VERSION` (currently `1.0.0`) and `CURRENT_PROJECT_VERSION` (currently `1`)
- [x] Regenerate the project (not needed for build 1: `project.yml` was unchanged, so the committed project was used)
- [x] Archive
- [x] Upload
- [x] Confirm the build appears in App Store Connect and finishes processing

**Read this first: the Xcode project is generated.** `ios/Cartworth.xcodeproj` is produced by XcodeGen from `ios/project.yml`. Any change you make in Xcode's project settings is destroyed the next time anyone runs `xcodegen generate`. Version numbers, the team, the bundle id and the device family all live in `project.yml` and must be edited there.

**Done 2 Oct 2026:** 1.0.0 (1) archived with `xcodebuild archive -allowProvisioningUpdates` and uploaded with `xcodebuild -exportArchive` (`method` `app-store-connect`, `destination` `upload`). Xcode's signed-in account used cloud-managed distribution signing, so no Apple Distribution certificate had to be created on this Mac. The next upload must be build 2.

### The Xcode Organizer path (recommended for a first submission)

```
cd /Users/nicksoderstrom/Developer/claudecode/basket/ios
xcodegen generate
open Cartworth.xcodeproj
```

Then in Xcode:

1. Select the **App** scheme
2. Set the run destination to **Any iOS Device (arm64)**
3. **Product > Scheme > Edit Scheme > Run > Options** and confirm the StoreKit Configuration is not forced on for Release
4. **Product > Archive**
5. When Organizer opens: **Distribute App > App Store Connect > Upload**
6. Accept the defaults for symbol upload and let Xcode manage signing

Use this path the first time. It surfaces signing and validation problems in a readable dialog instead of a wall of `xcodebuild` output.

### The command-line path

```
cd /Users/nicksoderstrom/Developer/claudecode/basket/ios
xcodegen generate

xcodebuild -project Cartworth.xcodeproj \
           -scheme App \
           -configuration Release \
           -destination 'generic/platform=iOS' \
           -archivePath build/Cartworth.xcarchive \
           clean archive

xcodebuild -exportArchive \
           -archivePath build/Cartworth.xcarchive \
           -exportOptionsPlist ExportOptions.plist \
           -exportPath build/export
```

You have to create `ios/ExportOptions.plist` yourself; it does not exist in the repo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>4C8TU6U7MQ</string>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
```

Setting `destination` to `upload` instead of `export` makes `-exportArchive` upload directly, which avoids needing a separate upload tool. If you would rather export an `.ipa` and upload separately, the options are Apple's **Transporter** app from the Mac App Store, or `xcrun altool --upload-app` with an App Store Connect API key. **Verify before relying on altool:** Apple has been steadily moving functionality off it, and the `method` key value has changed between Xcode versions (`app-store` in older Xcode, `app-store-connect` in current ones). If `xcodebuild` rejects one value, try the other.

**If you use an API key** for uploads, generate it at App Store Connect > Users and Access > Integrations, download the `.p8` **once** (it cannot be re-downloaded), and place it in `~/.appstoreconnect/private_keys/`. This is a human step with a credential you cannot recover if you lose it.

**Build numbers must be unique.** Every upload for a given `MARKETING_VERSION` needs a higher `CURRENT_PROJECT_VERSION`. Bump it in `project.yml` before each re-upload or the upload is rejected.

**Already verified, no action needed.** The QA hooks are safe: `QABootstrap` in `CartworthApp.swift` and the `-proUnlocked` override in `Entitlements` are both inside `#if DEBUG`, so they cannot ship in a Release archive.

**One thing to decide before you archive:** the deployment target is **iOS 17.0** (`ios/project.yml`). The Apple Intelligence recipe parsing path is gated behind `@available(iOS 26.0, *)` and only runs when the on-device model is available, falling back to the app's own parser everywhere else. That is a sensible arrangement, but confirm you have actually tested the app on an iOS 17 device or simulator, because that is the floor you are advertising.

## 13. 🔴 Decide how you are answering the third-party data question

- [ ] Read guideline 5.2.2 and decide whether you accept the risk
- [ ] Decide whether this needs a lawyer before launch, not after

**What the owner's other app taught (checked 2 Oct 2026).** "Wisconsin Eats: Restaurants" 1.0.0
was not rejected under 5.2.2. It came back on 28 Sep 2026 as **2.1 Information Needed**, because
the account has little App Review history: Apple wants a screen recording from a physical device,
purpose and audience, setup steps, the external services used, regional differences and, sixth,
documentation of authorization for protected third-party material. Cartworth comes from the same
account and will get the same request, and its sixth point is this item in different words. The
App Review notes (`APP_STORE_LISTING.md` section 10) now answer all six. They say plainly that
there is no written agreement with any retailer or with Flipp. The owner still has to record the
video and attach it.

**What the app actually does, stated plainly.** Cartworth reads prices from retailers' public websites from the user's device. Some of that reading goes through interfaces that are not published, documented developer APIs:

- `ios/App/Sources/InstacartSource.swift` calls Instacart's persisted GraphQL operations, identifying them by sha256 hashes that the app **reads out of the site's own operation-hashes manifest at runtime**, with hardcoded hashes as a fallback, so it keeps working after site deploys
- `ios/App/Sources/FlippSource.swift` calls `backflipp.wishabi.com`, an internal endpoint of the circular service, not a public API
- `WholeFoodsSource` and `TraderJoesSource` read those retailers' own site endpoints

**The honest position, which is what the App Review notes say:** these are publicly posted prices, read as any visitor's browser would read them, with no login, no paywall circumvention, no account creation, no logos and no claimed affiliation. That is a genuine and defensible description.

**The honest risk, which you should hear from me and not from a rejection email:** guideline **5.2.2** says that if your app uses or displays content from a third-party service, you must be permitted to do so under that service's terms, and **Apple may require you to provide that authorization on request.** You do not have written authorization from Instacart, Flipp/Wishabi, Whole Foods or Trader Joe's. Separately from Apple, those companies' own terms of service may prohibit automated access regardless of what Apple does.

I am not going to tell you this is fine, because I do not know that it is. What I can tell you:

- It is a real and reasonably likely rejection path, more likely than any other item on this list
- It is also a post-launch takedown path, which is worse, because it arrives after you have spent money
- The mitigations already in the app genuinely help: no logos, no claimed affiliation, explicit labeling of where each price came from, rate limiting to four concurrent requests per host, 20-minute caching, and no login or authentication bypass anywhere
- **Whether to accept this risk is a business and legal decision that belongs to you.** It is the one item on this list where the right move might be to talk to a lawyer before submitting rather than after being rejected

## 14. 🟡 TestFlight

- [x] Add internal testers (your own team members, no review required). Group `Owner` (automatic distribution on) with the owner's account; build 1 is in it, and the owner is Invited (2 Oct 2026)
- [ ] Install on at least one real iPhone and run the full flow on real data
- [ ] If you want external testers: fill in the Beta App Description, a feedback email, and submit for Beta App Review

**Why it matters even though it is not a blocker.** The simulator does not exercise real network conditions, real Core Location behavior, real background task scheduling, or the real App Store purchase sheet. `BGAppRefreshTask` in particular only behaves realistically on a device over time, and the app schedules it with `earliestBeginDate` six hours out.

**Internal versus external.** Internal testers are limited to people on your team and get builds within minutes with no review. External testing is up to 10,000 people but requires a Beta App Review pass first, which is a lighter version of the real review. Running an external beta is a good way to hit the 5.2.2 question in item 13 at lower stakes.

## 15. 🟡 After the first submission

- [ ] Set up a real support inbox routine and answer it
- [ ] Watch App Analytics for which keywords actually produce impressions before changing them
- [ ] Decide whether to keep `stats.json` empty or to ship the nationwide price statistics

**On that last one.** `ios/App/Resources/stats.json` currently contains `{"version":1,"generatedAt":null,"weekOf":null,"items":[],"facts":[]}`. The `NationalStats` service loads it, and its only consumer is the rotating line on the loading screen, which falls back to the hardcoded shopping tips when the file is empty. The remote refresh looks for a `StatsURL` key in `Info.plist` that does not exist, so it never runs. **This is why nationwide price statistics are deliberately absent from the App Store description**: advertising a feature the binary does not deliver is a guideline 2.3.1 problem. If you want that feature in the listing, ship the data first.

---

## The short version

If you only read one thing: **item 2 blocks everything that matters and is the slowest to clear, and item 13 is the one that could take the app down after it ships.** Items 4 and 8 are done apart from checks on a real iPhone, and merging `fix-round-3` so the live privacy page is current (27 Sep 2026).

Hard blockers in order of how long they take to clear, not how important they are:

1. Paid Applications agreement, banking and tax (item 2): days to weeks, external dependencies
2. Organization enrollment, if you want an entity name as the seller (item 1): weeks
3. Trademark clearance (item 3): days to weeks if you use an attorney
4. The domain and three live pages (item 4): done; merge `fix-round-3` and check the pages in Safari on an iPhone
5. A real app icon (item 8): done; check it on a real device
6. Sandbox purchase testing (item 9): hours, but gated behind item 2
7. Screenshots (item 10): hours, mostly automated already
8. Everything else: hours
