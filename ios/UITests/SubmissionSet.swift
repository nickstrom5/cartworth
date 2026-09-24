import XCTest

/// App Store submission capture, second pass.
///
/// `StoreShots.swift` was the first attempt at this and is kept for reference; this file
/// replaces it as the thing you actually run. The differences that matter:
///
///  1. **The weekly-ad carousel is designed out of the search frames, not scrolled past.**
///     `SearchView` draws `resultsAside` (best-price card → "In this week's ads" → per-store
///     chart) above the product rows on a phone, so the carousel sits *between* the hero card
///     and everything else: there is no scroll offset that keeps the hero card and drops the
///     flyer tiles. The only way to get a clean hero frame is a query that returns no weekly-ad
///     matches at all, so the search term is a parameter (`SHOT_QUERY`) and defaults to one
///     that has none for the capture ZIP. The test *asserts nothing* about this — it prints
///     `ADS_PRESENT=yes|no` so the capture log is evidence either way.
///  2. **Deal detail is reached deterministically** by filtering the Deals tab's own search
///     field down to one term and tapping a card by label, instead of indexing into
///     `scrollViews.otherElements.buttons` (which is what landed the previous run on the sort
///     menu). The frame is shot scrolled past `DealDetailView`'s flyer image, so the fine print
///     is the subject and the artwork is out of frame.
///  3. **The trip plan and the recipe import are actually driven.**
///  4. **The price watch gets a target and a second check**, so `WatchTrendChart` has more than
///     one sample per store and draws lines rather than lone dots.
///
/// Every frame is captured on a best-effort basis and nothing aborts the run: a step that
/// cannot complete is recorded and the next frame is still attempted. The console transcript
/// ends with a manifest of what was and was not captured, which is what the README is written
/// from.
///
/// Run it against an already-booted device whose status bar you have already overridden:
///
///     xcrun simctl status_bar <udid> override --time 9:41 --cellularBars 4 \
///       --batteryState charged --batteryLevel 100
///     xcodebuild test-without-building -xctestrun <...>.xctestrun \
///       -destination "platform=iOS Simulator,id=<udid>" \
///       -only-testing:AppUITests/SubmissionSet/testSubmissionSet
///
/// Frames land in the UI-test runner's `tmp/shots`; pull them out with
/// `xcrun simctl get_app_container <udid> app.cartworth.AppUITests.xctrunner data`.
final class SubmissionSet: XCTestCase {
    var app: XCUIApplication!

    private var captured: [String] = []
    private var skipped: [String] = []
    private var notes: [String] = []

    /// Search term for frames 01–03. Must be one with no weekly-ad matches for the ZIP, or the
    /// "In this week's ads" carousel — retailer flyer clippings, third-party brand marks — lands
    /// between the best-price card and the chart.
    private var query: String { env("SHOT_QUERY") ?? "basmati rice" }
    /// Filter for the Deals tab, so the deal that opens is chosen rather than whatever is first.
    private var dealQuery: String { env("SHOT_DEAL_QUERY") ?? "yogurt" }
    /// Item for the price watch. Deliberately not "butter": bare "butter" matches peanut butter.
    private var watchQuery: String { env("SHOT_WATCH") ?? "large eggs" }
    private var watchTarget: String { env("SHOT_TARGET") ?? "3.50" }
    /// Items for the trip plan.
    ///
    /// They have to be items that actually price at a store, and that is not a formality:
    /// `TripPlanner.plan` drops any item with an empty `perStore` map *before* it evaluates a
    /// plan, so an item nothing could price is not counted in the option card's "N not found"
    /// either — it simply disappears, and the totals then describe fewer items than the list
    /// above them shows. A submission frame must not contain a total that silently covers only
    /// part of the list, so the default here is items known to price for the capture ZIP.
    private var listItems: [String] {
        (env("SHOT_LIST") ?? "milk 1 gal,large eggs,basmati rice,orange juice")
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private func env(_ k: String) -> String? {
        guard let v = ProcessInfo.processInfo.environment[k], !v.isEmpty else { return nil }
        return v
    }

    override func setUp() {
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = ["-qaZip", env("QA_ZIP") ?? "60618", "-proUnlocked"]
        // Website and App Store frames (scripts/capture-site-shots.sh sets MARKETING=1): no paid
        // placements and no other companies' packaging photos in a marketing image. See QAShot.
        if env("MARKETING") == "1" { app.launchArguments += ["-qaHideSponsored", "-qaHideRemoteImages"] }
    }

    // MARK: - plumbing

    private func shoot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: shot)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("shots", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent("\(name).png"))
        captured.append(name)
        print("SHOT \(name)")
    }

    private func skip(_ name: String, _ why: String) {
        skipped.append("\(name): \(why)")
        print("SKIP \(name) — \(why)")
    }

    private func note(_ line: String) {
        notes.append(line)
        print("NOTE \(line)")
    }

    private func settle(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settle")], timeout: seconds)
    }

    private func button(containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    private func staticText(containing text: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    /// The tab control is a bottom bar on iPhone and a top bar on iPad — different element types.
    ///
    /// Every candidate is `.firstMatch`. Subscripting a query by label gives a query, not an
    /// element, and tapping one that resolves to more than one element throws "Multiple matching
    /// elements found" — which is what killed a whole iPad run at the first `goTo("Search")`,
    /// because on iPad the tab bar's Search tab and the search field's own Search control both
    /// answer to that label.
    private func tabButton(_ name: String) -> XCUIElement {
        let candidates = [
            app.tabBars.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
            app.segmentedControls.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
            app.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
        ]
        return candidates.first { $0.exists } ?? candidates[0]
    }

    private func goTo(_ tab: String) {
        let b = tabButton(tab)
        if b.waitForExistence(timeout: 25) { b.tap() } else { note("tab \(tab) not found") }
        settle(1.5)
    }

    /// Dismiss the keyboard so it never eats the bottom third of a frame. Tapping the navigation
    /// bar works on every screen here; `searchable` fields also leave a Cancel button behind.
    private func hideKeyboard() {
        if app.keyboards.element.exists {
            let bar = app.navigationBars.firstMatch
            if bar.exists { bar.tap() }
        }
        settle(0.8)
    }

    /// Scroll a scroll view by roughly half a screen.
    ///
    /// `swipeUp()` starts at the element's centre, and on the results screen that centre can land
    /// inside the horizontal weekly-ad carousel, which swallows the gesture — the "milk" frames in
    /// the first pass came out identical to the unscrolled ones for exactly that reason. Dragging
    /// between explicit normalised points down the left edge misses every nested horizontal
    /// scroller.
    private func scrollBy(_ element: XCUIElement, fraction: CGFloat = 0.45, up: Bool = true) {
        guard element.exists else { return }
        let x: CGFloat = 0.08
        let from = element.coordinate(withNormalizedOffset: CGVector(dx: x, dy: up ? 0.80 : 0.25))
        let to = element.coordinate(withNormalizedOffset: CGVector(dx: x, dy: up ? 0.80 - fraction : 0.25 + fraction))
        from.press(forDuration: 0.05, thenDragTo: to)
        settle(1.5)
    }

    private func waitForTabs(timeout: TimeInterval = 240) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if tabButton("Search").exists { return }
            usleep(500_000)
        }
        note("main tabs never appeared within \(Int(timeout))s — store discovery may have failed")
    }

    /// Whether anything on screen is currently admitting a price it does not believe. The guard
    /// is `Compare.flagImplausible`; the badge it drives is "price looks wrong". A submission
    /// frame must not contain one, so every capture step records the answer.
    private func implausibleOnScreen() -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'price looks wrong'")).count > 0
            || app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'off scale'")).count > 0
    }

    private func recordPriceSanity(_ frame: String) {
        note("\(frame) implausible_or_offscale=\(implausibleOnScreen() ? "YES" : "no")")
    }

    // MARK: - the run

    func testSubmissionSet() {
        app.launch()
        waitForTabs()
        settle(4)

        searchFrames()
        dealDetailFrame()
        listAndTripFrames()
        recipeFrame()
        watchFrames()
        storesAndSettingsFrames()
        manifest()
    }

    // MARK: - resumable phases
    //
    // The whole set in one method is ~20 minutes of wall clock against live stores, and on a
    // shared machine that is long enough for something else to run `simctl shutdown all` out
    // from under it — which kills the run and loses every frame after the last shutter. These
    // five methods are the same capture cut into pieces that each fit in a couple of minutes.
    // They write into the same runner container, so the frames accumulate across invocations
    // and a phase that dies can be re-run on its own.

    func testPhase1Search() {
        app.launch(); waitForTabs(); settle(4)
        searchFrames()
        manifest()
    }

    func testPhase2Deals() {
        app.launch(); waitForTabs(); settle(4)
        dealDetailFrame()
        manifest()
    }

    func testPhase3ListAndTrip() {
        app.launch(); waitForTabs(); settle(4)
        listAndTripFrames()
        manifest()
    }

    func testPhase4Recipe() {
        app.launch(); waitForTabs(); settle(4)
        recipeFrame()
        manifest()
    }

    func testPhase5Watch() {
        app.launch(); waitForTabs(); settle(4)
        watchFrames()
        manifest()
    }

    func testPhase6Extras() {
        app.launch(); waitForTabs(); settle(4)
        storesAndSettingsFrames()
        manifest()
    }

    private func manifest() {
        print("=== CAPTURED (\(captured.count)) ===")
        for c in captured { print("  \(c)") }
        print("=== NOT CAPTURED (\(skipped.count)) ===")
        for s in skipped { print("  \(s)") }
        print("=== NOTES (\(notes.count)) ===")
        for n in notes { print("  \(n)") }
    }

    /// Just the price watch. The trend chart needs more than one sample per store before it can
    /// draw a line at all, and the samples are only as far apart as the runs that made them —
    /// so run this again, later, to deepen the series without re-shooting everything else.
    func testWatchOnly() {
        testPhase5Watch()
    }

    // MARK: 01–03 search

    private func searchFrames() {
        goTo("Search")
        hideKeyboard()
        shoot("01-search-idle")
        searchFrames(for: query, prefix: "02", detailPrefix: "03")
        // An optional second term, captured in the same launch. Two candidate hero frames for
        // the price of one data load: the one with the wider real spread between stores is the
        // better shot #1, and which term that is cannot be known before the prices land.
        if let alt = env("SHOT_QUERY_2") {
            goTo("Search")
            searchFrames(for: alt, prefix: "ALT-02", detailPrefix: "ALT-03")
        }
    }

    private func searchFrames(for query: String, prefix: String, detailPrefix: String) {
        let field = app.searchFields.firstMatch
        guard field.waitForExistence(timeout: 25) else {
            skip("\(prefix)/\(detailPrefix)", "search field never appeared")
            return
        }
        field.tap()
        // A second search has to replace the first term, not append to it. The clear control
        // lives inside the search field on some versions and beside it on others, so try both
        // and fall back to selecting the text and typing over it.
        if let current = field.value as? String, !current.isEmpty, current != "Search any food item" {
            if field.buttons["Clear text"].exists {
                field.buttons["Clear text"].tap()
            } else if app.buttons["Clear text"].exists {
                app.buttons["Clear text"].tap()
            } else {
                field.press(forDuration: 1.2)
                settle(1)
                if app.menuItems["Select All"].exists { app.menuItems["Select All"].tap() }
                settle(0.5)
            }
            settle(1)
        }
        field.typeText(query + "\n")

        let best = app.staticTexts["BEST PRICE"]
        guard best.waitForExistence(timeout: 180) else {
            skip("\(prefix)/\(detailPrefix)", "no results for \"\(query)\" within 180s")
            return
        }
        // Let the slower stores land so the per-store chart is complete rather than half-drawn.
        settle(30)
        hideKeyboard()
        settle(1)

        let adsHeader = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'in this week'")).firstMatch
        note("ADS_PRESENT=\(adsHeader.exists ? "yes" : "no") for query \"\(query)\"")
        note("CHART_PRESENT=\(staticText(containing: "Cheapest match per store").exists ? "yes" : "no")")
        recordPriceSanity("\(prefix)-search-results")
        shoot("\(prefix)-search-results")

        let scroll = app.scrollViews.firstMatch
        if scroll.exists {
            // A short scroll first. In the regular-width (iPad) layout the product rows and the
            // aside column start at the same y, and the two horizontal chip scrollers at the top
            // of the rows column are `.scrollClipDisabled()`, so they paint straight across the
            // best-price card. Moving down by about a third of a screen puts the chips above the
            // frame and leaves the per-store chart beside the rows, which is the same story
            // without the collision.
            scrollBy(scroll, fraction: 0.30)
            shoot("\(prefix)d-chart-and-rows")
            scrollBy(scroll)
            shoot("\(prefix)b-search-rows")
            scrollBy(scroll)
            shoot("\(prefix)c-search-rows-lower")
            for _ in 0..<4 { scrollBy(scroll, fraction: 0.6, up: false) }
            settle(2)
        } else {
            skip("\(prefix)b/\(prefix)c", "no scroll view on the results screen")
        }

        // Product detail, opened from the best-price card: a stable target, unlike a row index.
        let hero = button(containing: "BEST PRICE")
        if hero.waitForExistence(timeout: 12) {
            hero.tap()
            settle(5)
            recordPriceSanity("\(detailPrefix)-product-detail")
            shoot("\(detailPrefix)-product-detail")
            let sheet = app.scrollViews.firstMatch
            if sheet.exists {
                scrollBy(sheet)
                shoot("\(detailPrefix)b-product-detail-lower")
            }
            if app.buttons["Done"].exists { app.buttons["Done"].tap() }
            settle(2)
        } else {
            skip("\(detailPrefix)-product-detail", "best-price card was not tappable")
        }
    }

    // MARK: 06 deal detail (shot #3 in the listing's numbering)

    private func dealDetailFrame() {
        goTo("Deals")
        // The grid itself is wall-to-wall flyer clippings; captured only as evidence.
        // "1,370 deals" — grouped, so the digits alone will not match it.
        let anyDeal = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9][0-9,.]* deals$")).firstMatch
        if !anyDeal.waitForExistence(timeout: 240) { note("deals grid did not finish loading in 240s") }
        settle(8)
        shoot("EVIDENCE-deals-grid-HAS-FLYER-ART")

        let search = app.searchFields.firstMatch
        guard search.waitForExistence(timeout: 20) else {
            skip("06-deal-detail", "deals search field never appeared")
            return
        }
        search.tap()
        search.typeText(dealQuery + "\n")
        settle(3)
        hideKeyboard()
        settle(1)

        // Tap a card by its own text rather than by position.
        let card = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", dealQuery)).firstMatch
        guard card.waitForExistence(timeout: 20) else {
            skip("06-deal-detail", "no deal card matching \"\(dealQuery)\"")
            return
        }
        card.tap()
        settle(4)

        // Confirm this is DealDetailView and not a menu: the detail screen is the only place
        // with a "Compare at every store" button.
        if !button(containing: "Compare at every store").waitForExistence(timeout: 12) {
            skip("06-deal-detail", "tapping the card did not land on DealDetailView")
            if app.navigationBars.buttons.element(boundBy: 0).exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
            return
        }
        shoot("06a-deal-detail-top-HAS-FLYER-ART")
        // Scroll the flyer clipping off the top; the price, the conditions and the disclaimer
        // are all below it and they are what the frame is for.
        let detail = app.scrollViews.firstMatch
        if detail.exists {
            // DealDetailView draws the flyer clipping up to 220pt tall at the very top. One slow
            // swipe clears it; the second frame is insurance in case a short page barely moves.
            scrollBy(detail, fraction: 0.35)
            shoot("06-deal-detail-fineprint")
            scrollBy(detail, fraction: 0.35)
            shoot("06b-deal-detail-lower")
        } else {
            skip("06-deal-detail-fineprint", "no scroll view on the deal detail screen")
        }
        if app.navigationBars.buttons.element(boundBy: 0).exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        settle(2)
    }

    /// The same deal screen, reached from the Search tab's weekly-ad carousel instead of the
    /// Deals grid — because the two routes feed `DealDetailView` **different images**.
    ///
    /// `FlippSource` builds a flyer-item deal with `cutout_image_url` (the Deals tab) and a
    /// search-item deal with `clean_image_url ?? clipping_image_url` (the ads carousel). For the
    /// merchants near this ZIP the "cutout" is very often the raw ad scrap, complete with the
    /// retailer's loyalty mark in a circle and the ad's own price typography — which is exactly
    /// what `APP_STORE_LISTING.md` §11 forbids. `clean_image_url` is Flipp's product cutout on
    /// white, which the same rule explicitly allows. This phase captures the other route so the
    /// two can be compared and the better one chosen.
    func testPhase7DealFromSearchCarousel() {
        app.launch(); waitForTabs(); settle(4)
        goTo("Search")
        let field = app.searchFields.firstMatch
        guard field.waitForExistence(timeout: 25) else {
            skip("06c-deal-detail-from-carousel", "search field never appeared")
            manifest(); return
        }
        field.tap()
        if let current = field.value as? String, !current.isEmpty, current != "Search any food item" {
            if field.buttons["Clear text"].exists { field.buttons["Clear text"].tap() }
            else if app.buttons["Clear text"].exists { app.buttons["Clear text"].tap() }
            settle(1)
        }
        field.typeText(dealQuery + "\n")

        let ads = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'in this week'")).firstMatch
        guard ads.waitForExistence(timeout: 180) else {
            skip("06c-deal-detail-from-carousel", "no weekly-ad carousel for \"\(dealQuery)\"")
            manifest(); return
        }
        settle(12)
        hideKeyboard()

        // Matching a button by the query word finds the product rows and the best-price card too,
        // and `firstMatch` picked one of those. The mini-cards have no identifier of their own, so
        // aim at the carousel geometrically instead: it is drawn directly under its own header,
        // and a normalised offset is measured in multiples of the header's own frame.
        let card = ads.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 3.4))
        card.tap()
        settle(4)
        if !button(containing: "Compare at every store").waitForExistence(timeout: 12) {
            // Fall back to a button match, excluding the best-price card.
            let tile = app.buttons.matching(NSPredicate(
                format: "label CONTAINS[c] %@ AND NOT (label CONTAINS 'BEST PRICE')", dealQuery)).firstMatch
            if tile.exists {
                tile.tap()
                settle(4)
            }
        }
        guard button(containing: "Compare at every store").waitForExistence(timeout: 12) else {
            skip("06c-deal-detail-from-carousel", "neither the carousel tap nor the label match opened DealDetailView")
            manifest(); return
        }
        shoot("06c-deal-detail-from-carousel")
        let detail = app.scrollViews.firstMatch
        if detail.exists {
            scrollBy(detail, fraction: 0.3)
            shoot("06d-deal-detail-from-carousel-lower")
        }
        if app.navigationBars.buttons.element(boundBy: 0).exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        settle(2)
        manifest()
    }

    // MARK: 04 list + trip plan

    private func listAndTripFrames() {
        goTo("List")
        // SHOT_KEEP_LIST=1 keeps whatever is already on the list — used to price the ingredients
        // that the recipe phase just added, which is what makes shot #5 a *priced* list.
        if env("SHOT_KEEP_LIST") == nil { clearList() } else { note("keeping the existing list") }

        let add = app.textFields.firstMatch
        guard add.waitForExistence(timeout: 25) else {
            skip("04/05", "list text field never appeared")
            return
        }
        if env("SHOT_KEEP_LIST") == nil {
            for item in listItems {
                add.tap()
                add.typeText(item + "\n")
                settle(0.6)
            }
            hideKeyboard()
            settle(1)
        }
        shoot("04a-shopping-list")

        let plan = button(containing: "Plan the cheapest trip")
        guard plan.waitForExistence(timeout: 12) else {
            skip("04-trip-plan", "\"Plan the cheapest trip\" button not found")
            return
        }
        plan.tap()

        // Pricing every item at every followed store is the slowest thing the app does, and
        // finding a signal for "it finished" took two tries.
        //
        //  * NOT the static text "Cherry-pick": the section's own explanatory footer already
        //    reads "…and the cherry-pick total", so that predicate is true before planning has
        //    even started and the shutter fires on a spinner.
        //  * NOT the button label flipping to "Re-plan with fresh prices": the button sits below
        //    the whole plan section in a `List`, so the moment the plan renders it is pushed out
        //    of the viewport, and a lazily-built row that is not near the viewport is not in the
        //    accessibility tree at all.
        //
        // The option *cards* are the first thing the plan draws, they stay on screen, and
        // "Cherry-pick" is a label only they carry.
        let planned = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Cherry-pick'")).firstMatch
        guard planned.waitForExistence(timeout: 600) else {
            skip("04-trip-plan", "the trip plan did not finish within 600s")
            return
        }
        settle(6)
        recordPriceSanity("04-trip-plan")
        // Every list row that the plan managed to cost gains a "cheapest: <store> <price>" line.
        // If that count is short of the number of items, the totals on screen describe fewer
        // items than the list above them — do not ship the frame.
        let costed = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'cheapest:'")).count
        note("TRIP_PLAN_COVERAGE=\(costed)/\(listItems.count) items costed")
        // The plan lands mid-screen. Bring it up so the four totals and at least one store's
        // breakdown are in the same frame.
        let list = app.tables.firstMatch.exists ? app.tables.firstMatch : app.collectionViews.firstMatch
        if list.exists {
            scrollBy(list, fraction: 0.35)
            shoot("04-trip-plan")
            scrollBy(list, fraction: 0.35)
            shoot("04b-trip-plan-lower")
            // Back to the top: once a plan exists every list row carries a "cheapest: <store>
            // <price>" line, which is the priced-rows frame shot #5 asks for.
            for _ in 0..<4 { scrollBy(list, fraction: 0.6, up: false) }
            shoot("04c-list-rows-priced")
        } else {
            shoot("04-trip-plan")
        }
    }

    /// The app container survives between runs, so the list has to be emptied or items double up.
    private func clearList() {
        let menu = app.navigationBars.buttons.matching(NSPredicate(format: "identifier CONTAINS 'ellipsis' OR label CONTAINS[c] 'more'")).firstMatch
        guard menu.exists else { return }
        menu.tap()
        settle(1)
        let clear = button(containing: "Clear everything")
        if clear.waitForExistence(timeout: 5) {
            clear.tap()
            settle(1.5)
        } else if app.buttons["Cancel"].exists {
            app.buttons["Cancel"].tap()
        }
        settle(1)
    }

    // MARK: 05 recipe import

    private func recipeFrame() {
        goTo("List")
        let recipe = button(containing: "Add from a recipe")
        guard recipe.waitForExistence(timeout: 20) else {
            skip("05-recipe-import", "\"Add from a recipe\" button not found")
            return
        }
        recipe.tap()
        settle(2.5)

        let editor = app.textViews.firstMatch
        guard editor.waitForExistence(timeout: 12) else {
            skip("05-recipe-import", "the paste-the-ingredients editor never appeared")
            if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
            return
        }
        editor.tap()
        // Typed, not pasted: the pasteboard is unreliable in a UI test. Ordinary ingredient
        // lines, written here — not a copy of anyone's recipe.
        editor.typeText("""
        1 lb ground beef
        2 cups milk
        3 large eggs
        1 cup shredded cheddar cheese
        2 tbsp butter
        1 tsp salt
        1 onion, diced
        """)
        settle(1)
        let use = button(containing: "Use this text")
        guard use.exists else {
            skip("05-recipe-import", "\"Use this text\" button not found")
            if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
            return
        }
        use.tap()
        // Parsing is on-device and fast; pricing the parsed rows is not.
        settle(30)
        hideKeyboard()
        settle(1)
        recordPriceSanity("05-recipe-import")
        shoot("05-recipe-import")

        // `RecipeImportView` shows the parsed ingredients and marks pantry staples, but it
        // attaches no prices — `APP_STORE_LISTING.md` §11 asks shot #5 for "list rows … with
        // prices attached", and in this app a list row only carries a price once a trip plan has
        // costed it (`ListsView.row`, the `cheapest:` line). So commit the ingredients to the
        // list here; `testPhase3ListAndTrip` run afterwards with SHOT_KEEP_LIST=1 prices them.
        let add = app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^Add [0-9]+$")).firstMatch
        if add.exists {
            add.tap()
            settle(3)
            shoot("05b-recipe-added-to-list")
            note("recipe ingredients committed to the shopping list")
        } else {
            note("no \"Add N\" button on the recipe review screen — nothing committed to the list")
            if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
        }
        settle(2)
    }

    // MARK: 07 price watch

    private func watchFrames() {
        goTo("Tracking")
        settle(2)

        // Re-running must not pile up duplicate watches — and a second run is exactly how the
        // trend chart gets a second sample per store.
        let existing = staticText(containing: watchQuery)
        if !existing.exists {
            let watchField = app.textFields.firstMatch
            guard watchField.waitForExistence(timeout: 25) else {
                skip("07-price-watch", "watch text field never appeared")
                return
            }
            watchField.tap()
            watchField.typeText(watchQuery + "\n")
            hideKeyboard()
            note("created a new watch for \"\(watchQuery)\"")
        } else {
            note("reusing the existing watch for \"\(watchQuery)\"")
        }

        removeExtraWatches()

        // Wait for the first check to land. "checked <time> ago" only appears once
        // `WatchItem.lastChecked` is set; the un-checked state reads "not checked yet", so
        // BEGINSWITH is what distinguishes them.
        let checked = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH[c] 'checked '")).firstMatch
        if !checked.waitForExistence(timeout: 300) { note("first watch check did not land within 300s") }
        settle(25)

        setWatchTargetIfNeeded()

        // Second check in this run, so each store's series has at least two samples and
        // WatchTrendChart draws a line rather than a lone dot.
        let refresh = app.navigationBars.buttons.matching(NSPredicate(format: "identifier CONTAINS 'arrow.clockwise' OR label CONTAINS[c] 'refresh'")).firstMatch
        if refresh.exists {
            refresh.tap()
            settle(150)
        } else {
            if tapWatchMenu(titled: watchQuery), app.buttons["Check now"].exists {
                app.buttons["Check now"].tap()
                settle(150)
            } else {
                if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
                note("no second check — the chart will have one sample per store")
            }
        }
        settle(15)
        recordPriceSanity("07-price-watch")
        note("TREND_CAPTION_PRESENT=\(staticText(containing: "Lines appear once a store has been checked twice").exists ? "yes" : "no")")
        shoot("07-price-watch")

        let list = app.tables.firstMatch.exists ? app.tables.firstMatch : app.collectionViews.firstMatch
        if list.exists {
            scrollBy(list, fraction: 0.35)
            shoot("07b-price-watch-lower")
            scrollBy(list, fraction: 0.5, up: false)
        }
    }



    /// Tap the "…" menu on the watch card whose title contains `title`.
    ///
    /// The menu is `Menu { } label: { Image(systemName: "ellipsis.circle") }`, and it does not
    /// come back from `app.buttons` under any identifier or label this test could find — on the
    /// first run the lookup simply reported "not found" and no target was ever set. So find the
    /// card by its title, which is ordinary text, and tap at the same height on the card's right
    /// edge. `WatchCard` sits inside `TrackingView`'s `.readableWidth(780)`, so on a phone the
    /// card is the full window and on an iPad it is a centred 780pt column.
    @discardableResult
    private func tapWatchMenu(titled title: String) -> Bool {
        let window = app.windows.firstMatch
        guard window.exists else { return false }
        let titleText = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", title)).firstMatch
        guard titleText.exists else { return false }
        let w = window.frame.width
        let cardRight = (w + Swift.min(w, 780)) / 2
        let point = window.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: cardRight - 34, dy: titleText.frame.midY + 10))
        point.tap()
        settle(1.2)
        return app.buttons["Check now"].exists || app.buttons["Edit"].exists || app.buttons["Remove"].exists
    }

    /// Leave exactly one watch on the Tracking screen.
    ///
    /// The app container survives between runs, so an earlier capture's watch is still there and
    /// intrudes at the bottom of the frame — in this project's case a "butter" watch that matched
    /// *peanut* butter, which is a known matching defect and the last thing a submission frame
    /// should be advertising. Watches are sorted newest-first, so index 0 is the one this run
    /// just made and everything after it is old.
    /// Remove watch cards left behind by earlier captures.
    ///
    /// The app container survives between runs, so an older capture's watch is still on the
    /// screen and intrudes at the bottom of the frame. `SHOT_STALE_WATCHES` names them (comma
    /// separated); the default clears the "butter" watch the 2026-09-22 run created, which is
    /// the one that matched *peanut* butter — a known matching defect and the last thing a
    /// submission frame should be advertising.
    private func removeExtraWatches() {
        let stale = (env("SHOT_STALE_WATCHES") ?? "butter")
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        for name in stale where !name.isEmpty && name != watchQuery {
            guard app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", name)).count > 0 else { continue }
            guard tapWatchMenu(titled: name) else {
                note("could not open the menu on the \"\(name)\" watch card")
                continue
            }
            let remove = app.buttons["Remove"]
            if remove.waitForExistence(timeout: 5) {
                remove.tap()
                settle(1.5)
                note("removed the older watch card \"\(name)\"")
            } else if app.buttons["Cancel"].exists {
                app.buttons["Cancel"].tap()
            }
        }
    }

    private func setWatchTargetIfNeeded() {
        // "target " alone also matches the section footer ("…when one hits your target or its
        // lowest price yet"), which would make this think a target is already set. The badge is
        // "target $3.50", so match the dollar sign too.
        if staticText(containing: "target $").exists || staticText(containing: "at your target").exists {
            note("watch already has a target")
            return
        }
        guard tapWatchMenu(titled: watchQuery) else {
            note("could not open the watch menu — no target set")
            return
        }
        let edit = button(containing: "Edit")
        guard edit.waitForExistence(timeout: 6) else {
            if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
            note("\"Edit\" not in the watch menu — no target set")
            return
        }
        edit.tap()
        settle(2)
        let targetField = app.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS '2.50'")).firstMatch
        if targetField.waitForExistence(timeout: 8) {
            targetField.tap()
            targetField.typeText(watchTarget)
            note("set watch target to \(watchTarget)")
        } else {
            note("target field not found in the edit sheet")
        }
        if app.buttons["Save"].exists { app.buttons["Save"].tap() }
        else if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
        settle(3)
    }

    // MARK: 08–09 stores + settings

    private func storesAndSettingsFrames() {
        goTo("Search")
        let stores = button(containing: "stores")
        if stores.waitForExistence(timeout: 20) {
            stores.tap()
            settle(3.5)
            shoot("08-your-stores")
            if app.buttons["Done"].exists { app.buttons["Done"].tap() }
            settle(2)
        } else {
            skip("08-your-stores", "the stores toolbar button was not found")
        }

        goTo("Settings")
        settle(3)
        shoot("09-settings")
    }
}
