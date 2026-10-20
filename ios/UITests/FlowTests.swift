import XCTest

/// Drives the real app against live store data: search, deals, list, tracking, settings.
/// Screenshots are written into the simulator's tmp directory so QA can pull them out.
final class FlowTests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-qaZip", ProcessInfo.processInfo.environment["QA_ZIP"] ?? "60010", "-proUnlocked"]
        if ProcessInfo.processInfo.environment["QA_RESET"] == "1" { app.launchArguments.append("-qaReset") }
    }

    /// The tab control is a bottom tab bar on iPhone but a top tab bar on iPad, which is a
    /// different element type. Look for whichever exists rather than assuming the phone shape.
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

    func waitForTabs(timeout: TimeInterval = 120) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if tabButton("Search").exists { return }
            usleep(500_000)
        }
        XCTFail("Main tabs never appeared — store discovery may have failed")
    }

    func shoot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: shot)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("shots", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent("\(name).png"))
    }

    // MARK: flows

    func testSearchFlow() {
        app.launch()
        waitForTabs()
        shoot("01-search-idle")

        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("milk\n")

        // Results: the best-price card shows up once at least one store answers
        let best = app.staticTexts["BEST PRICE"]
        XCTAssertTrue(best.waitForExistence(timeout: 90), "No results for milk")
        sleep(12) // let the slower stores finish
        shoot("02-search-results")

        // Per-store bars and rows exist
        XCTAssertTrue(app.staticTexts["Cheapest match per store"].exists || app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'per '")).count > 0)

        // Open the first product
        let firstRow = app.scrollViews.otherElements.buttons.element(boundBy: 3)
        if firstRow.exists {
            firstRow.tap()
            sleep(3)
            shoot("03-product-detail")
            let done = app.buttons["Done"]
            if done.exists { done.tap() }
        }
    }

    func testDealsFlow() {
        app.launch()
        waitForTabs()
        tabButton("Deals").tap()
        let loaded = app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'deals'")).firstMatch
        _ = loaded.waitForExistence(timeout: 120)
        sleep(6)
        shoot("04-deals")
        // Open the first deal card
        let card = app.scrollViews.otherElements.buttons.element(boundBy: 2)
        if card.exists {
            card.tap()
            sleep(2)
            shoot("05-deal-detail")
            if app.navigationBars.buttons.element(boundBy: 0).exists { app.navigationBars.buttons.element(boundBy: 0).tap() }
        }
    }

    func testListAndTracking() {
        app.launch()
        waitForTabs()
        tabButton("List").tap()
        let add = app.textFields.firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: 10))
        add.tap()
        add.typeText("milk 1 gal\n")
        add.tap()
        add.typeText("eggs\n")
        sleep(1)
        shoot("06-list")

        tabButton("Tracking").tap()
        let watchField = app.textFields.firstMatch
        XCTAssertTrue(watchField.waitForExistence(timeout: 10))
        watchField.tap()
        watchField.typeText("butter\n")
        sleep(25)
        shoot("07-tracking")

        tabButton("Settings").tap()
        sleep(2)
        shoot("08-settings")
    }

    /// iPad: a presented search hid the top tab bar, with no Cancel button, for as long as the
    /// field held text. A shopper who had searched could not reach Deals, List, Tracking or
    /// Settings without clearing the query first. Found by `SubmissionSet` on 2026-10-20 (iPad
    /// Pro 13", iOS 27.0), whose every later `goTo` logged "tab … not found". See `DrawerSearch`.
    ///
    /// Both ways a field loses focus: hiding the keyboard on the Search tab (no search is sent),
    /// and submitting a filter on the Deals tab. Live network: the Deals tab loads this week's ads.
    func testTabsStayReachableAfterSearchingOnIPad() throws {
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "The phone's tab bar is at the bottom and search keeps its Cancel button")
        app.launch()
        waitForTabs()

        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("yogurt")
        let hide = app.keyboards.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'hide keyboard' OR label CONTAINS[c] 'dismiss'")).firstMatch
        if hide.waitForExistence(timeout: 3) {
            hide.tap()
            XCTAssertTrue(tabButton("Deals").waitForExistence(timeout: 5), "tabs are hidden while the search field holds text")
            let kept = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == 'yogurt'"), object: app.searchFields.firstMatch)
            XCTAssertEqual(XCTWaiter.wait(for: [kept], timeout: 5), .completed, "the query was cleared to bring the tabs back")
        }

        tabButton("Deals").tap()
        let deals = app.searchFields.firstMatch
        XCTAssertTrue(deals.waitForExistence(timeout: 20))
        deals.tap()
        deals.typeText("yogurt\n")
        sleep(2)
        shoot("10-ipad-tabs-after-deals-search")
        XCTAssertTrue(tabButton("List").waitForExistence(timeout: 5), "tabs are hidden after a deals search")
        XCTAssertEqual(app.searchFields.firstMatch.value as? String, "yogurt", "the deals filter was cleared")
        tabButton("List").tap()
        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 10), "the List tab did not open")
    }

    func testStoresScreen() {
        app.launch()
        waitForTabs()
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'stores'")).firstMatch.tap()
        sleep(3)
        shoot("09-stores")
    }
}
