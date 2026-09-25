import XCTest

/// App Store submission capture.
///
/// This is deliberately separate from `FlowTests`, which is a QA smoke test and is allowed to
/// shoot whatever a flow happens to land on. This file exists to produce frames that could be
/// uploaded, so it obeys the rules in `marketing/APP_STORE_LISTING.md` §11:
///
///   * No weekly-ad / deal artwork in any frame. Every deal card and every ad mini-card renders
///     the retailer's own flyer clipping, which carries third-party brand marks and in-ad price
///     typography. There is no way to curate that from outside the app, so the shot list here
///     simply never lands on a screen that draws one — and where a screen draws one above the
///     fold (search results), the capture scrolls past it and says so in the file name.
///   * Product thumbnails inside result rows are plain pack shots from the retailer's product
///     listing, at 54pt. The listing document allows those explicitly.
///   * One launch per device. Every frame comes from the same live data load, so the run makes
///     roughly one search's worth of third-party requests per screen rather than one per test.
///
/// Run it with `-only-testing:AppUITests/StoreShots/testSubmissionSet`. Frames land in the UI
/// test runner's `tmp/shots` directory.
final class StoreShots: XCTestCase {
    var app: XCUIApplication!

    /// Everything the run managed to capture, and everything it did not, printed at the end so
    /// the console transcript is a manifest rather than a guess.
    private var captured: [String] = []
    private var skipped: [String] = []

    override func setUp() {
        // A frame that cannot be captured must not stop the frames after it.
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = [
            "-qaZip", ProcessInfo.processInfo.environment["QA_ZIP"] ?? "60618",
            "-proUnlocked",
        ]
    }

    // MARK: - plumbing

    func shoot(_ name: String) {
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

    func skip(_ name: String, _ why: String) {
        skipped.append("\(name): \(why)")
        print("SKIP \(name) — \(why)")
    }

    /// The tab control is a bottom tab bar on iPhone and a top tab bar on iPad — different
    /// element types, so look for whichever exists rather than assuming the phone shape.
    ///
    /// Every candidate is `.firstMatch`: on iPad more than one button answers to each tab's label,
    /// and tapping a query that resolves to several throws "Multiple matching elements found".
    /// See `SubmissionSet.tabButton`.
    func tabButton(_ name: String) -> XCUIElement {
        let candidates = [
            app.tabBars.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
            app.segmentedControls.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
            app.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
        ]
        return candidates.first { $0.exists } ?? candidates[0]
    }

    func goTo(_ tab: String) {
        let b = tabButton(tab)
        if b.waitForExistence(timeout: 20) { b.tap() }
        settle(1.5)
    }

    func waitForTabs(timeout: TimeInterval = 180) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if tabButton("Search").exists { return }
            usleep(500_000)
        }
        XCTFail("Main tabs never appeared — store discovery may have failed")
    }

    /// Let animations and in-flight loads finish before the shutter.
    func settle(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settle")], timeout: seconds)
    }

    func button(containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    func staticText(containing text: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    /// Dismiss the keyboard so it never covers the bottom third of a frame.
    func hideKeyboard() {
        if app.keyboards.element.exists {
            // Return is enough for a single-line field; tapping the nav bar works everywhere else.
            let bar = app.navigationBars.firstMatch
            if bar.exists { bar.tap() }
        }
        settle(0.6)
    }

    // MARK: - the set

    func testSubmissionSet() {
        app.launch()
        waitForTabs()
        settle(3)

        searchFrames()
        listFrames()
        recipeFrame()
        trackingFrames()
        storesAndSettingsFrames()

        print("=== CAPTURED (\(captured.count)) ===")
        for c in captured { print("  \(c)") }
        print("=== NOT CAPTURED (\(skipped.count)) ===")
        for s in skipped { print("  \(s)") }
    }

    // MARK: search

    private func searchFrames() {
        shoot("01-search-idle")

        let field = app.searchFields.firstMatch
        guard field.waitForExistence(timeout: 20) else {
            skip("02/03", "search field never appeared")
            return
        }
        field.tap()
        field.typeText("milk\n")

        let best = app.staticTexts["BEST PRICE"]
        guard best.waitForExistence(timeout: 150) else {
            skip("02/03", "no results for milk within 150s")
            return
        }
        // Let the slower stores land so the per-store chart is complete rather than half-drawn.
        settle(25)
        hideKeyboard()

        // Top of the results. On a phone this frame contains the "In this week's ads" carousel,
        // whose mini-cards are flyer clippings, so the name says so and the README marks it
        // unusable. It is kept because it is the only frame with the BEST PRICE card in it.
        shoot("02a-search-results-top-HAS-AD-ARTWORK")

        // Scroll the ad carousel off the top. The per-store chart and the product rows carry the
        // same story without any flyer artwork, which is the frame that can actually be uploaded.
        let scroll = app.scrollViews.firstMatch
        if scroll.exists {
            scroll.swipeUp(velocity: .slow)
            settle(2)
            shoot("02-search-results-per-store")
            scroll.swipeUp(velocity: .slow)
            settle(2)
            shoot("02b-search-results-rows")
            // Back to the top for the hero tap.
            scroll.swipeDown(velocity: .fast)
            scroll.swipeDown(velocity: .fast)
            settle(2)
        } else {
            skip("02/02b", "no scroll view found on the results screen")
        }

        // Product detail: unit price in every unit of its dimension. Opened from the BEST PRICE
        // card because that is a stable target; a row index is not.
        let hero = button(containing: "BEST PRICE")
        if hero.waitForExistence(timeout: 10) {
            hero.tap()
            settle(4)
            shoot("03-product-detail-unit-price")
            let done = app.buttons["Done"]
            if done.exists { done.tap() }
            settle(1.5)
        } else {
            skip("03-product-detail-unit-price", "BEST PRICE card not tappable")
        }
    }

    // MARK: list + trip plan

    private func listFrames() {
        goTo("List")
        let add = app.textFields.firstMatch
        guard add.waitForExistence(timeout: 20) else {
            skip("04/05", "list text field never appeared")
            return
        }
        for item in ["milk 1 gal", "large eggs", "butter 1 lb", "bananas 2 lb"] {
            add.tap()
            add.typeText(item + "\n")
            settle(0.5)
        }
        hideKeyboard()
        shoot("04a-shopping-list")

        let plan = button(containing: "Plan the cheapest trip")
        guard plan.waitForExistence(timeout: 10) else {
            skip("04-trip-plan", "\"Plan the cheapest trip\" button not found")
            return
        }
        plan.tap()

        // Pricing four items at every followed store is the slowest thing the app does.
        let planned = staticText(containing: "Cherry-pick")
        if planned.waitForExistence(timeout: 300) {
            settle(4)
            // The plan lands mid-screen; bring it up so the four totals and the per-store
            // breakdown are both in frame.
            let list = app.tables.firstMatch.exists ? app.tables.firstMatch : app.collectionViews.firstMatch
            if list.exists {
                list.swipeUp(velocity: .slow)
                settle(2)
            }
            shoot("04-trip-plan")
        } else {
            skip("04-trip-plan", "trip plan did not finish within 300s")
        }
    }

    // MARK: recipe import

    private func recipeFrame() {
        goTo("List")
        let recipe = button(containing: "Add from a recipe")
        guard recipe.waitForExistence(timeout: 15) else {
            skip("05-recipe-import", "\"Add from a recipe\" button not found")
            return
        }
        recipe.tap()
        settle(2)

        let editor = app.textViews.firstMatch
        guard editor.waitForExistence(timeout: 10) else {
            skip("05-recipe-import", "the paste-the-ingredients text editor never appeared")
            if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
            return
        }
        editor.tap()
        // Typed rather than pasted: the pasteboard is not reliable in a UI test, and this is
        // ordinary recipe text, not a copy of anyone's copyrighted method.
        editor.typeText("""
        1 lb ground beef
        2 cups milk
        3 large eggs
        1 cup shredded cheddar cheese
        2 tbsp butter
        1 tsp salt
        1/2 tsp black pepper
        1 onion, diced
        """)
        settle(1)
        let use = button(containing: "Use this text")
        if use.exists {
            use.tap()
            settle(4)
            hideKeyboard()
            shoot("05-recipe-import")
        } else {
            skip("05-recipe-import", "\"Use this text\" button not found")
        }
        if app.buttons["Cancel"].exists { app.buttons["Cancel"].tap() }
        settle(1.5)
    }

    // MARK: tracking

    private func trackingFrames() {
        goTo("Tracking")
        let watchField = app.textFields.firstMatch
        guard watchField.waitForExistence(timeout: 20) else {
            skip("06-price-watch", "watch text field never appeared")
            return
        }
        watchField.tap()
        watchField.typeText("butter\n")
        hideKeyboard()

        // First check. One WatchPoint per store, so every series has a single sample.
        let priced = staticText(containing: "/lb")
        _ = priced.waitForExistence(timeout: 180)
        settle(20)
        shoot("06a-price-watch-one-check")

        // Second check, so each store's series has two samples and the trend chart can draw a
        // line rather than only dots. Both checks are minutes apart, not weeks — that is a real
        // limitation of capturing from a clean simulator and the README says so.
        let refresh = app.navigationBars.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'refresh' OR identifier CONTAINS 'arrow.clockwise'")).firstMatch
        if refresh.exists {
            refresh.tap()
            settle(90)
        } else if button(containing: "ellipsis").exists {
            button(containing: "ellipsis").tap()
            settle(1)
            if app.buttons["Check now"].exists { app.buttons["Check now"].tap() }
            settle(90)
        } else {
            skip("06-price-watch second check", "no refresh control found")
        }
        settle(10)
        shoot("06-price-watch")
    }

    // MARK: stores + settings

    private func storesAndSettingsFrames() {
        goTo("Search")
        let stores = button(containing: "stores")
        if stores.waitForExistence(timeout: 15) {
            stores.tap()
            settle(3)
            shoot("07-your-stores")
            if app.buttons["Done"].exists { app.buttons["Done"].tap() }
            settle(1.5)
        } else {
            skip("07-your-stores", "the stores toolbar button was not found")
        }

        goTo("Settings")
        settle(3)
        shoot("08-settings")
    }
}
