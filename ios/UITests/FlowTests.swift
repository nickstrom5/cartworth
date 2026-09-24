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
    func tabButton(_ name: String) -> XCUIElement {
        let candidates = [
            app.tabBars.buttons[name],
            app.segmentedControls.buttons[name],
            app.buttons[name],
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

    func testStoresScreen() {
        app.launch()
        waitForTabs()
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'stores'")).firstMatch.tap()
        sleep(3)
        shoot("09-stores")
    }
}
