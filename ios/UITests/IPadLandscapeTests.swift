import XCTest

/// Cartworth on iPad, in landscape.
///
/// Info.plist declares all four orientations for iPad (the phone is portrait-only), and App Review
/// rotates an iPad as a matter of course. Until this file existed nobody had ever looked at the app
/// sideways: the simulator control tool has no rotate action, so every iPad observation in the
/// first QA pass was 1032x1376 portrait. XCUITest *can* rotate — `XCUIDevice.shared.orientation`
/// — and that is all this suite is: rotate before launch, then walk every tab and the screens a
/// shopper actually reads (search results and the product sheet), measuring as it goes.
///
/// What it enforces, on every screen, at the default type size and at AccessibilityXXXL:
///
///   * **the app really is in landscape** — the window is wider than it is tall. If a future
///     change narrows the supported orientations, this fails loudly instead of quietly re-testing
///     portrait;
///   * **no price is broken** — clipped, wrapped or pushed off the panel, judged by the same
///     `PriceLabelGeometry` rules `DuoTests` uses (one shared file, pinned by AppTests);
///   * **nothing sits under the tab bar** — on iPadOS the tab bar floats over the top of the
///     content, so a screen that lays itself out without respecting it puts its own title or
///     controls beneath the bar. Checked at rest, before scrolling: content passing under a
///     translucent bar *while* scrolling is the design, not a defect.
///
/// Every screen is photographed. Frames are attached to the result bundle and, when
/// `QA_SHOT_DIR` is set in the runner's environment (pass `TEST_RUNNER_QA_SHOT_DIR` to
/// xcodebuild), written there as PNGs too.
///
///     TEST_RUNNER_QA_SHOT_DIR=<dir> xcodebuild test -scheme App \
///       -only-testing:AppUITests/IPadLandscapeTests \
///       -destination 'platform=iOS Simulator,id=<iPad udid>'
///
/// Live network: the search step sends one real query to every store the ZIP resolves, so the app
/// is launched with `-qaPolite` (one request at a time per host, 700 ms apart, stop on 429). Run
/// one device at a time — two simulators searching at once would be two parallel clients.
final class IPadLandscapeTests: XCTestCase {
    private var app: XCUIApplication!
    private var window: CGRect = .zero
    private var ax = false
    private var problems: [String] = []

    private let tabs = ["Search", "Deals", "List", "Tracking", "Settings"]
    private var query: String { env("QA_QUERY") ?? "butter" }

    private func env(_ k: String) -> String? {
        guard let v = ProcessInfo.processInfo.environment[k], !v.isEmpty else { return nil }
        return v
    }

    override func setUpWithError() throws {
        continueAfterFailure = true
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "Landscape is an iPad-only orientation here; the phone is portrait-only in Info.plist")
    }

    override func tearDown() {
        XCUIDevice.shared.orientation = .portrait
        super.tearDown()
    }

    func testEveryTabInLandscapeAtDefaultSize() { walk(accessibilitySize: false) }

    func testEveryTabInLandscapeAtAccessibilityXXXL() { walk(accessibilitySize: true) }

    // MARK: - the walk

    private func walk(accessibilitySize: Bool) {
        ax = accessibilitySize
        problems = []
        app = XCUIApplication()
        app.launchArguments = ["-qaZip", env("QA_ZIP") ?? "60148", "-proUnlocked", "-qaPolite"]
        if ax {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }

        XCUIDevice.shared.orientation = .landscapeLeft
        app.launch()
        waitForTabs()
        settle(3)
        // Rotating after launch as well: a launch can land in the orientation SpringBoard was in.
        XCUIDevice.shared.orientation = .landscapeLeft
        settle(2)

        let w = app.windows.firstMatch
        XCTAssertTrue(w.waitForExistence(timeout: 30), "No app window")
        window = w.frame
        print("LANDSCAPE GEOMETRY \(tag): window \(Int(window.width))x\(Int(window.height))pt")
        XCTAssertGreaterThan(window.width, window.height,
                             "The app did not rotate: its window is \(Int(window.width))x\(Int(window.height))pt. Either landscape stopped being a supported iPad orientation or the rotation never reached the app.")

        for t in tabs {
            goTo(t)
            settle(t == "Deals" ? 10 : 2.5)
            screen(t.lowercased())
        }

        // The screen a shopper reads most: results, the best-price card, the per-store chart and
        // the weekly-ad column beside them.
        goTo("Search")
        runSearch(query)
        if app.staticTexts["BEST PRICE"].waitForExistence(timeout: 240) {
            settle(10)
            screen("results")

            // And the product sheet behind the best-price card.
            let hero = app.staticTexts["BEST PRICE"]
            if hero.isHittable {
                hero.tap()
                settle(3)
                if app.buttons["Done"].waitForExistence(timeout: 10) {
                    screen("product-sheet", scrollPasses: 2)
                    app.buttons["Done"].firstMatch.tap()
                    settle(1.5)
                } else {
                    note("the best-price card did not open a product sheet")
                }
            }
        } else {
            shoot("results-none")
            note("no store answered “\(query)” in time — results screen not measured")
        }

        let summary = "LANDSCAPE \(tag): \(problems.count) problem(s)"
        print(summary)
        if !problems.isEmpty {
            XCTFail("\(summary)\n" + problems.joined(separator: "\n"))
        }
    }

    /// Photograph one screen and hold it to the three rules: at rest for the tab bar, then page by
    /// page for the prices.
    private func screen(_ name: String, scrollPasses: Int = 5) {
        shoot("\(tag)-\(name)")
        auditAtRest(name)
        for pass in 0..<scrollPasses {
            scrollDown()
            auditPrices(name, pass: pass + 1)
        }
        // Back to the top so the next visit starts where a shopper would.
        for _ in 0..<scrollPasses { scrollUp() }
    }

    // MARK: - measuring

    private struct Node {
        var type: XCUIElement.ElementType
        var label: String
        var frame: CGRect
    }

    /// Every element on screen with its frame, from one snapshot — a snapshot is a single round
    /// trip, where asking each element for its frame is one each. Returns the tab bar's frame
    /// separately and leaves the bar's own contents out of the content list.
    private func capture() -> (bar: CGRect, content: [Node]) {
        guard let root = try? app.snapshot() else { return (.zero, []) }
        var bar = CGRect.null
        var content: [Node] = []
        var tabItems = CGRect.null

        func visit(_ s: XCUIElementSnapshot, insideBar: Bool) {
            let inBar = insideBar || s.elementType == .tabBar
            if s.elementType == .tabBar { bar = bar.union(s.frame) }
            if !inBar, s.elementType == .button, tabs.contains(s.label),
               s.frame.midY < window.minY + window.height * 0.15 {
                // iPadOS draws the tab bar as a floating capsule whose items are exposed as plain
                // buttons at the top of the window rather than inside a `.tabBar` element.
                tabItems = tabItems.union(s.frame)
            } else if !inBar {
                switch s.elementType {
                case .staticText, .button, .textField, .searchField, .image, .link, .cell, .switch, .slider:
                    content.append(Node(type: s.elementType, label: s.label, frame: s.frame))
                default:
                    break
                }
            }
            for c in s.children { visit(c, insideBar: inBar) }
        }
        visit(root, insideBar: false)
        if bar.isNull { bar = tabItems }
        // Drop what is inside the bar's own area and carries a tab's name: those are the bar's
        // labels, exposed a second time as static text.
        content.removeAll { tabs.contains($0.label) && !bar.isNull && bar.insetBy(dx: -2, dy: -2).contains($0.frame) }
        return (bar.isNull ? .zero : bar, content)
    }

    private func auditAtRest(_ name: String) {
        let (bar, content) = capture()
        if bar == .zero {
            note("\(name): could not find the tab bar to measure against")
        } else {
            for n in content where PriceLabelGeometry.isUnder(bar: bar, frame: n.frame) {
                problems.append("[\(tag) \(name)] “\(n.label)” (\(n.type.rawValue)) at \(describe(n.frame)) sits under the tab bar at \(describe(bar))")
            }
        }
        audit(prices: content, name, pass: 0)
    }

    private func auditPrices(_ name: String, pass: Int) {
        audit(prices: capture().content, name, pass: pass)
    }

    private func audit(prices nodes: [Node], _ name: String, pass: Int) {
        var checked = 0
        for n in nodes where n.type == .staticText && PriceLabelGeometry.isPriceLabel(n.label) {
            // Off-screen vertically is just "further down the page"; only what is on screen now
            // has been laid out where a shopper can see it.
            guard n.frame.maxY > window.minY, n.frame.minY < window.maxY else { continue }
            checked += 1
            let d = PriceLabelGeometry.defects(label: n.label, frame: n.frame, window: window)
            if !d.isEmpty {
                problems.append("[\(tag) \(name) pass \(pass)] price “\(n.label)” at \(describe(n.frame)): \(d.joined(separator: ", "))")
            }
        }
        if pass == 0 { print("LANDSCAPE PRICES \(tag) \(name): \(checked) on the first screen") }
    }

    // MARK: - plumbing

    private var tag: String {
        "\(Int(window.width))x\(Int(window.height))\(ax ? "-ax" : "")"
    }

    private func describe(_ f: CGRect) -> String {
        "(\(Int(f.minX)), \(Int(f.minY)), \(Int(f.width))x\(Int(f.height)))"
    }

    private func settle(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settle")], timeout: seconds)
    }

    private func note(_ line: String) { print("LANDSCAPE NOTE \(line)") }

    /// On iPad the tab bar's "Search" item and the search field's own control both answer to
    /// "Search", so every lookup is `.firstMatch` on an exact label — see `SubmissionSet.tabButton`.
    private func tabButton(_ name: String) -> XCUIElement {
        let candidates = [
            app.tabBars.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
            app.segmentedControls.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
            app.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch,
        ]
        return candidates.first { $0.exists } ?? candidates[0]
    }

    private func waitForTabs(timeout: TimeInterval = 240) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if tabButton("Deals").exists { return }
            usleep(500_000)
        }
        XCTFail("Main tabs never appeared — store discovery may have failed")
    }

    private func goTo(_ tab: String) {
        let b = tabButton(tab)
        if b.waitForExistence(timeout: 30) { b.tap() } else { problems.append("[\(tag)] tab “\(tab)” not reachable") }
        settle(1.5)
    }

    private func runSearch(_ term: String) {
        let field = app.searchFields.firstMatch
        guard field.waitForExistence(timeout: 20) else { return XCTFail("No search field") }
        field.tap()
        if let current = field.value as? String, !current.isEmpty, current != field.placeholderValue {
            let clear = field.buttons.firstMatch
            if clear.exists { clear.tap() }
        }
        field.typeText("\(term)\n")
    }

    /// Drag down the leading edge, which misses every nested horizontal scroller (a swipe from the
    /// middle of the results lands in a chip row and scrolls that instead).
    private func scrollDown() { drag(from: 0.82, to: 0.30) }
    private func scrollUp() { drag(from: 0.30, to: 0.95) }

    private func drag(from: CGFloat, to: CGFloat) {
        // The page's own scroller, not the window: a List capped to a readable column does not
        // extend to the window edge, and a drag outside it scrolls nothing.
        let target = [app.collectionViews.firstMatch, app.scrollViews.firstMatch, app.tables.firstMatch]
            .first { $0.exists && $0.frame.height > window.height * 0.4 } ?? app.windows.firstMatch
        let a = target.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: from))
        let b = target.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: to))
        a.press(forDuration: 0.05, thenDragTo: b)
        settle(1.2)
    }

    private func shoot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: shot)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
        if let dir = env("QA_SHOT_DIR") {
            let url = URL(fileURLWithPath: dir, isDirectory: true)
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try? shot.pngRepresentation.write(to: url.appendingPathComponent("\(name).png"))
        }
        print("LANDSCAPE SHOT \(name)")
    }
}
