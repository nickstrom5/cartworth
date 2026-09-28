import XCTest

/// Cartworth on the iPhone Duo.
///
/// ## What the simulator actually gives you
///
/// `xcrun simctl list devices` shows two Duos on this machine, `iPhone Duo` and `Duo Open`, and
/// the names suggest a folded/unfolded pair. They are not. Both are the same device type,
/// `com.apple.CoreSimulator.SimDeviceType.iPhone-Duo`, and both boot into the same geometry — the
/// 466x678pt cover panel. `Duo Open` is a rename, nothing more. See `marketing/screenshots/DUO.md`
/// for the evidence.
///
/// The device type does declare two integrated displays: screen 1 at 1398x2034px (466x678pt, the
/// cover) and screen 3 at 2007x2853px (669x951pt, the inner panel). Screen 3 is enumerated and has
/// a framebuffer, but SpringBoard never attaches a scene to it — it captures pure black, byte for
/// byte identical, on both devices and in every state we could put them in. There is no fold verb
/// in `simctl`, no fold control in Simulator.app, and no fold symbol in CoreSimulator.
///
/// So these tests are written to run against **whatever geometry they are handed** and to record
/// what they found. Nothing here asserts "this is the folded state"; the assertions are
/// geometry-relative and the transcript prints the size that was measured. If a future Xcode ever
/// does unfold one of these devices, the same file keeps working and starts reporting 669x951.
///
/// One consequence worth knowing: `xcrun simctl io <udid> screenshot` with no `--display` captures
/// screen 3, the black one. Every capture below goes through `XCUIScreen.main`, and any manual
/// capture needs `--display 1`.
///
/// ## What is checked mechanically
///
///   * the five tabs are reachable and each renders something,
///   * nothing the app draws escapes the window,
///   * tap targets clear 44pt,
///   * **no price is ever clipped** — see `testNoPriceIsEverTruncated`, the test that matters most,
///   * a store is identified by name and not by a colour dot alone,
///   * state survives a live change of scene geometry.
///
/// Run both devices, both type sizes:
///   xcodebuild test -scheme App -only-testing:AppUITests/DuoTests \
///     -destination 'platform=iOS Simulator,name=iPhone Duo'
///   QA_CONTENT_SIZE=ax xcodebuild test -scheme App -only-testing:AppUITests/DuoTests \
///     -destination 'platform=iOS Simulator,name=Duo Open'
final class DuoTests: XCTestCase {
    var app: XCUIApplication!

    /// Recorded once per test so a failure transcript says which panel it was looking at.
    private var window: CGRect = .zero

    private var isAccessibilitySize: Bool {
        ProcessInfo.processInfo.environment["QA_CONTENT_SIZE"] == "ax"
    }

    override func setUp() {
        continueAfterFailure = true
        app = XCUIApplication()
        // `-qaPolite`: one request at a time per host, 700 ms apart, and nothing more to a host
        // that answers 429. Every test here runs a live search against real store sites; a QA run
        // must not be the app's normal four-at-once client.
        app.launchArguments = [
            "-qaZip", ProcessInfo.processInfo.environment["QA_ZIP"] ?? "60618",
            "-proUnlocked",
            "-qaPolite",
        ]
        if isAccessibilitySize {
            app.launchArguments += [
                "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ]
        }
    }

    // MARK: - plumbing

    /// The tab control is a bottom bar on a normal iPhone and a vertical floating bar on the Duo's
    /// cover panel. Which element type wraps the items is not stable, so try each.
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

    func waitForTabs(timeout: TimeInterval = 180) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if tabButton("Search").exists { return }
            usleep(500_000)
        }
        XCTFail("Main tabs never appeared — store discovery may have failed")
    }

    func settle(_ seconds: TimeInterval) {
        _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settle")], timeout: seconds)
    }

    func goTo(_ tab: String) {
        let b = tabButton(tab)
        if b.waitForExistence(timeout: 30) { b.tap() }
        settle(1.5)
    }

    /// Frames are attached to the result bundle and also written to tmp/duo for eyeballing.
    func shoot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: shot)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("duo", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent("\(name).png"))
        print("DUO SHOT \(name)")
    }

    /// Measure the app window and say so in the transcript, so a run is self-documenting about
    /// which panel it exercised.
    @discardableResult
    func recordGeometry(_ label: String) -> CGRect {
        let w = app.windows.firstMatch
        XCTAssertTrue(w.waitForExistence(timeout: 30), "No app window")
        window = w.frame
        let category = isAccessibilitySize ? "AX XXXL" : "default"
        print("DUO GEOMETRY \(label): \(Int(window.width))x\(Int(window.height))pt, type size \(category)")
        return window
    }

    private var tag: String { "\(Int(window.width))x\(Int(window.height))\(isAccessibilitySize ? "-ax" : "")" }

    // MARK: - assertions

    /// Nothing the app draws may sit outside the window **horizontally**.
    ///
    /// Only horizontally, deliberately. This used to require `bounds.contains(f)` on every
    /// hittable element, which no card in a scroll view can satisfy: a deal card that simply
    /// starts at y=554 on a 678pt panel and is 260pt tall extends past the fold, and that is what
    /// scrolling is for. The assertion failed the suite on ordinary content and said nothing about
    /// a real defect.
    ///
    /// The horizontal edges are the ones that carry meaning. There is no sideways scroll on these
    /// screens, so anything past the leading or trailing edge is unreachable — which is exactly
    /// the class of bug this was written for (a chip running off the right of the screen with no
    /// ellipsis and no scroller, taking the rest of the search term with it).
    func assertInsideWindow(_ elements: [XCUIElement], _ what: String) {
        guard window != .zero else { return XCTFail("recordGeometry() first") }
        // A little slack: SwiftUI rounds frames, and a shadow may legitimately bleed a point.
        let bounds = window.insetBy(dx: -1, dy: -1)
        let rows = horizontalScrollerRows()
        for e in elements where e.exists && e.isHittable {
            let f = e.frame
            guard f.width > 0, f.height > 0 else { continue }
            // A horizontal scroller's own content is allowed past the edge — that is what it is
            // for — so only judge elements that are not inside one. Without this the Deals tab's
            // store chips failed or passed on the day's deal counts: the row bleeds to the screen
            // edge, and a chip straddling it is judged only when its centre is on screen.
            if rows.contains(where: { f.minY >= $0.minY - 1 && f.maxY <= $0.maxY + 1 }) { continue }
            XCTAssertTrue(f.minX >= bounds.minX && f.maxX <= bounds.maxX,
                          "\(what): “\(e.label)” at \(f) runs outside the \(Int(window.width))pt-wide panel")
        }
    }

    /// The frames of the sideways scrollers on screen: a scroll view no taller than a row and far
    /// wider than it is tall. XCUITest does not say which way a scroll view scrolls; the page's own
    /// scroller is hundreds of points tall, and a row this short only scrolls sideways.
    private func horizontalScrollerRows() -> [CGRect] {
        app.scrollViews.allElementsBoundByIndex.compactMap { sv in
            let f = sv.frame
            return f.height > 0 && f.height <= 120 && f.width >= f.height * 3 ? f : nil
        }
    }

    /// Anything you can tap has to be big enough to tap. 44pt is the platform floor.
    func assertTapTargets(_ elements: [XCUIElement], _ what: String, minimum: CGFloat = 44) {
        for e in elements where e.exists && e.isHittable {
            let f = e.frame
            guard f.width > 0, f.height > 0 else { continue }
            XCTAssertTrue(f.height >= minimum - 0.5,
                          "\(what): “\(e.label)” is \(Int(f.height))pt tall, under the \(Int(minimum))pt floor")
        }
    }

    /// The floor for a tab item. On iPad the tab control is the system's floating tab bar, whose
    /// items iPadOS draws 36pt tall; the app uses a stock `TabView` and cannot make them taller.
    /// Held to that height, so an item that shrinks below the system's own still fails.
    private var tabItemFloor: CGFloat {
        UIDevice.current.userInterfaceIdiom == .pad ? 36 : 44
    }

    private func visibleButtons(limit: Int = 40) -> [XCUIElement] {
        Array(app.buttons.allElementsBoundByIndex.prefix(limit))
    }

    // MARK: - the tabs

    /// Walk all five tabs, capture each, and check that what they draw stays on the panel.
    func testEveryTabOnThisPanel() {
        app.launch()
        waitForTabs()
        settle(3)
        recordGeometry("tabs")

        for tab in ["Search", "Deals", "List", "Tracking", "Settings"] {
            goTo(tab)
            settle(tab == "Deals" ? 8 : 2)
            shoot("\(tag)-tab-\(tab.lowercased())")

            XCTAssertTrue(app.staticTexts.count > 0, "\(tab) rendered nothing")
            assertInsideWindow(visibleButtons(), tab)
            assertTapTargets([tabButton(tab)], "\(tab) tab item", minimum: tabItemFloor)
        }
    }

    /// The tab bar itself: five items, all reachable, none clipped by the panel edge. On the cover
    /// panel the bar is a vertical strip on the trailing edge rather than a bottom bar, which is
    /// the arrangement most likely to push an item off the end.
    func testTabBarFitsThePanel() {
        app.launch()
        waitForTabs()
        settle(2)
        recordGeometry("tab bar")

        let names = ["Search", "Deals", "List", "Tracking", "Settings"]
        let items = names.map { tabButton($0) }
        for (name, item) in zip(names, items) {
            XCTAssertTrue(item.exists, "Tab “\(name)” is missing on this panel")
        }
        assertInsideWindow(items, "tab bar")
        assertTapTargets(items, "tab bar", minimum: tabItemFloor)
        shoot("\(tag)-tabbar")
    }

    // MARK: - the numbers

    /// The one that matters.
    ///
    /// Every price the app draws is a promise about a real number. A clipped price is not a
    /// cosmetic problem — "$11.38" cut to "$1…" reads as a different and much cheaper price, which
    /// is worse than showing nothing at all. This is exactly what the per-store chart did on this
    /// panel at the accessibility type sizes before the layout was changed: the store column was a
    /// flat 92pt and the price slot a flat 96pt, neither of which grew with the type size.
    ///
    /// Three signals, because the ellipsis alone had two blind spots and missed real defects that
    /// were visible on this very panel at this very type size:
    ///
    ///  1. **Ellipsis.** A real signal because these labels come from `Money`, which never itself
    ///     emits "…". Catches truncation ("$1…" for $11.38).
    ///  2. **Cent-formatted prices.** `Money.unit` emits "10.6¢" and "16.5¢" with no leading "$",
    ///     so a scan gated on `hasPrefix("$")` never examined them at all — and they were being
    ///     split as "10." / "6¢".
    ///  3. **Shape.** A price that *wraps* keeps a perfectly intact accessibility label — a
    ///     `Text` broken across two lines still reports "$6.17" — so no string check can ever see
    ///     it. The geometry can: a price of four or more characters laid out on one line is far
    ///     wider than it is tall, and one broken across two lines is not. See `looksWrapped`.
    ///
    /// Signal 3 is the one that matters most, because a wrapped price is the failure that reads as
    /// a *plausible* number rather than as damage: "$6.17" drawn as "$6.1" over "7" is silently
    /// wrong, where "$1…" at least looks broken.
    func testNoPriceIsEverTruncated() {
        app.launch()
        waitForTabs()
        settle(2)
        recordGeometry("prices")

        runSearch("milk")
        guard app.staticTexts["BEST PRICE"].waitForExistence(timeout: 150) else {
            shoot("\(tag)-prices-no-results")
            return note("No stores answered in time — nothing to measure")
        }
        settle(10)

        // Walk the whole result screen, not just the first viewport. Capture once up front and
        // once more only if something is wrong: the screenshot service is the slowest and least
        // reliable part of a UI test, and a frame per pass makes this test time out on a loaded
        // machine without telling us anything extra when it passes.
        shoot("\(tag)-prices")

        var checked = 0
        var clipped: [String] = []
        var wrapped: [String] = []
        for _ in 0..<6 {
            for e in app.staticTexts.allElementsBoundByIndex.prefix(80) {
                let label = e.label
                guard Self.isPriceLabel(label) else { continue }
                checked += 1
                if label.contains("…") || label.hasSuffix("...") { clipped.append(label) }
                if Self.looksWrapped(label: label, frame: e.frame) {
                    wrapped.append("\(label) at \(Self.describe(e.frame))")
                }
            }
            app.swipeUp()
            settle(1)
        }
        print("DUO PRICES checked \(checked) price labels at \(tag)")

        if !clipped.isEmpty {
            shoot("\(tag)-prices-CLIPPED")
            XCTFail("Prices are being clipped on the \(Int(window.width))x\(Int(window.height))pt panel: \(Set(clipped).sorted().joined(separator: ", "))")
        }
        if !wrapped.isEmpty {
            shoot("\(tag)-prices-WRAPPED")
            XCTFail("Prices are being split across lines on the \(Int(window.width))x\(Int(window.height))pt panel — the top line reads as a different, smaller price: \(Set(wrapped).sorted().joined(separator: "; "))")
        }
    }

    // MARK: - price geometry
    //
    // There used to be a hand-kept mirror of the price rules here, because a UI-test target cannot
    // import the app module. Nothing pinned it: its 1.2 threshold and four-glyph exemption could be
    // edited without failing any test. The rules now live once, in PriceLabelGeometry.swift, which
    // project.yml compiles into this target *and* into AppTests, where PriceLabelGeometryTests pins
    // them. These two names forward to it so the call sites above read as they always have.

    static func isPriceLabel(_ label: String) -> Bool { PriceLabelGeometry.isPriceLabel(label) }

    static func looksWrapped(label: String, frame: CGRect) -> Bool {
        PriceLabelGeometry.looksWrapped(label: label, frame: frame)
    }

    static func describe(_ f: CGRect) -> String {
        "(\(Int(f.minX)), \(Int(f.minY)), \(Int(f.width))x\(Int(f.height)))"
    }

    /// A store is identified by its name. The colour dot beside it is decorative — colour is never
    /// the only cue in this app — so a name clipped to "Maria…" or "M…" leaves the shopper unable
    /// to tell whose price they are looking at. Assert the chart's store labels survive intact.
    func testStoreNamesAreNotClippedToInitials() {
        app.launch()
        waitForTabs()
        settle(2)
        recordGeometry("store names")

        runSearch("milk")
        guard app.staticTexts["Cheapest match per store"].waitForExistence(timeout: 150) else {
            shoot("\(tag)-names-no-results")
            return note("No per-store chart this run — nothing to measure")
        }
        settle(8)

        // The chart rows expose the store's full name as their accessibility label; the visible
        // label is the short form. Neither may end in an ellipsis.
        shoot("\(tag)-names")

        var flagged: [String] = []
        for _ in 0..<5 {
            for label in app.staticTexts.allElementsBoundByIndex.prefix(80).map({ $0.label }) {
                guard label.contains("…"), !label.hasPrefix("$") else { continue }
                // Product names are deliberately allowed to truncate; store names are not. Store
                // short names are all under 16 characters, so a clipped one is short.
                if label.count <= 16 { flagged.append(label) }
            }
            app.swipeUp()
            settle(1)
        }
        print("DUO NAMES flagged \(flagged.count) clipped labels at \(tag)")

        if !flagged.isEmpty {
            shoot("\(tag)-names-CLIPPED")
            XCTFail("Store names look clipped to initials at \(tag): \(Set(flagged).sorted().joined(separator: ", "))")
        }
    }

    // MARK: - continuity

    /// The fold changes the scene's geometry underneath a running app. The simulator cannot fold,
    /// so this uses the one live geometry change it *can* perform — a rotation — to exercise the
    /// same code path: the scene stays, the size changes, and anything rebuilt from scratch at that
    /// moment shows up as lost state.
    ///
    /// This is a proxy and is labelled as one. It catches `@State` being recreated and the scene
    /// `.task` re-running, which are the two failure modes a fold would share. It would not catch
    /// anything specific to a display handoff.
    func testTypedTextSurvivesAGeometryChange() {
        app.launch()
        waitForTabs()
        settle(2)
        recordGeometry("continuity")

        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 20), "No search field")
        field.tap()
        field.typeText("cheddar")
        settle(1)
        shoot("\(tag)-continuity-01-typed")

        XCUIDevice.shared.orientation = .landscapeLeft
        settle(3)
        shoot("\(tag)-continuity-02-rotated")

        let after = app.searchFields.firstMatch
        XCTAssertTrue(after.waitForExistence(timeout: 20), "Search field gone after the geometry change")
        XCTAssertEqual(after.value as? String, "cheddar",
                       "Text typed but not submitted was lost when the scene geometry changed")

        XCUIDevice.shared.orientation = .portrait
        settle(3)
        shoot("\(tag)-continuity-03-restored")
        XCTAssertEqual(app.searchFields.firstMatch.value as? String, "cheddar",
                       "Text was lost on the way back")
    }

    /// The selected tab and scroll position have to survive the same change.
    func testTabAndScrollSurviveAGeometryChange() {
        app.launch()
        waitForTabs()
        settle(2)
        recordGeometry("continuity/tab")

        goTo("Settings")
        settle(1)
        app.swipeUp()
        settle(1)
        shoot("\(tag)-continuity-tab-01-settings")

        XCUIDevice.shared.orientation = .landscapeLeft
        settle(3)
        shoot("\(tag)-continuity-tab-02-rotated")

        XCTAssertTrue(app.navigationBars["Settings"].exists || app.staticTexts["Settings"].exists,
                      "The selected tab was lost when the scene geometry changed")

        XCUIDevice.shared.orientation = .portrait
        settle(2)
    }

    /// A sheet open across a geometry change must stay open.
    func testOpenSheetSurvivesAGeometryChange() {
        app.launch()
        waitForTabs()
        settle(2)
        recordGeometry("continuity/sheet")

        let stores = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'stores'")).firstMatch
        guard stores.waitForExistence(timeout: 20) else {
            return note("Store button not present — nothing to open")
        }
        stores.tap()
        settle(2)
        let done = app.buttons["Done"]
        guard done.waitForExistence(timeout: 10) else {
            return note("Store picker did not open — nothing to measure")
        }
        shoot("\(tag)-continuity-sheet-01-open")

        XCUIDevice.shared.orientation = .landscapeLeft
        settle(3)
        shoot("\(tag)-continuity-sheet-02-rotated")
        XCTAssertTrue(app.buttons["Done"].exists, "The open sheet was dismissed by the geometry change")

        XCUIDevice.shared.orientation = .portrait
        settle(2)
        if app.buttons["Done"].exists { app.buttons["Done"].tap() }
    }

    // MARK: - helpers

    /// Kick off one live search. The app fans out to several retailers, one request each.
    private func runSearch(_ term: String) {
        let field = app.searchFields.firstMatch
        guard field.waitForExistence(timeout: 20) else { return XCTFail("No search field") }
        field.tap()
        field.typeText("\(term)\n")
    }

    /// These tests are deliberately non-throwing so a skipped capture does not stop the captures
    /// after it. Record the reason in the transcript and carry on.
    private func note(_ reason: String) {
        print("DUO NOTE — \(reason)")
    }
}
