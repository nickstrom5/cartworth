import XCTest
import SwiftUI
import StoreKit
import StoreKitTest
@testable import Cartworth

// Step 2 of ops/appstore-testing.md, "StoreKit with the local configuration", as tests.
//
// Each test runs the app's own `Entitlements`, `PaywallView` and `SettingsView` against an
// `SKTestSession` loaded from Products.storekit: real StoreKit 2 calls and real signed
// transactions, with the payment sheet switched off (`disableDialogs`) so a purchase completes
// without a tap. The screens are hosted and driven through their accessibility elements, the way
// VoiceOver presses a button, and read back the same way (see `HostedScreen`).
//
// What still needs a person: the payment sheet itself (its Cancel button, Face ID), Xcode's
// Expire Subscription button, a real delete and reinstall, and a sandbox Apple ID. The checklist
// lists them.

@MainActor
final class PurchaseTests: XCTestCase {
    private var session: SKTestSession!
    private var pro: Entitlements { .shared }

    /// Products.storekit, read where it lies in the source tree. It cannot be copied into the test
    /// bundle: a .storekit file in any build phase is how the Release app came to ship it
    /// (d8367eb), and test/qa-appstore.test.js fails on one. A simulator reads the Mac's disk.
    private static let configuration = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("App/Resources/Products.storekit")

    override func setUp() async throws {
        session = try SKTestSession(contentsOf: Self.configuration)
        session.resetToDefaultState()
        session.clearTransactions()
        session.disableDialogs = true
        forgetLocalState()
        await pro.load()
        // No products means the host app started outside Xcode's StoreKit test environment, and
        // the session's requests go to the real App Store: the scheme's Test action has lost its
        // StoreKit configuration (see postGenCommand in project.yml). Stop here rather than go on
        // to a restore, whose AppStore.sync() then waits for an Apple ID sign-in and never returns.
        guard pro.products.map(\.id) == Entitlements.allProductIds else {
            throw NotInStoreKitTesting(loaded: pro.products.map(\.id))
        }
        XCTAssertFalse(pro.isPro)
    }

    private struct NotInStoreKitTesting: Error, CustomStringConvertible {
        let loaded: [String]
        var description: String {
            "Products.storekit gave \(loaded.count) of 3 products: is it the scheme's Test action StoreKit configuration?"
        }
    }

    override func tearDown() async throws {
        pro.paymentSheet = { try await $0.purchase() }
        session.clearTransactions()
        forgetLocalState()
        // The other suites render the free app.
        await pro.load()
    }

    /// What a fresh install holds, which is also what deleting the app throws away: the
    /// entitlement state lives in memory only, and StoreKit is the record.
    private func forgetLocalState() {
        pro.isPro = false
        pro.activePlan = nil
        pro.products = []
        pro.loadError = nil
    }

    // MARK: - Buying: each plan unlocks Pro

    func testBuyingMonthlyUnlocksPro() async { await assertBuying(.monthly) }
    func testBuyingYearlyUnlocksPro() async { await assertBuying(.yearly) }
    func testBuyingLifetimeUnlocksPro() async { await assertBuying(.lifetime) }

    /// Pick the plan on the paywall and press Continue: Pro is on by the time the purchase
    /// returns, not on some later update.
    private func assertBuying(_ plan: Entitlements.Plan, file: StaticString = #filePath, line: UInt = #line) async {
        let paywall = HostedScreen(PaywallView().environment(pro))
        defer { paywall.tearDown() }
        XCTAssertTrue(paywall.activate { $0.hasPrefix(Self.title(plan)) }, "no \(plan) row: \(paywall.labels)", file: file, line: line)
        paywall.pump(0.1)
        await pressContinue(on: paywall, file: file, line: line)
        XCTAssertTrue(pro.isPro, "\(plan) did not unlock Pro", file: file, line: line)
        XCTAssertEqual(pro.activePlan, plan, file: file, line: line)
        XCTAssertEqual(session.allTransactions().map(\.productIdentifier), [plan.productId], file: file, line: line)
    }

    // MARK: - The review screenshot

    /// The screenshot App Store Connect requires on each in-app purchase (APP_STORE_LISTING.md §9):
    /// the one paywall that sells all three plans, priced. A UI test cannot take it, because the
    /// app it launches is outside Xcode's StoreKit test environment and every plan reads "—"; this
    /// suite is inside it. Skipped unless TEST_RUNNER_PAYWALL_SHOT=1. It puts the paywall on the
    /// device's screen, writes `tmp/paywall-on-screen` and holds for 20 s, so the simulator's own
    /// screenshot (status bar included) can be taken: `xcrun simctl io <udid> screenshot`.
    func testPaywallReviewScreenshot() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["PAYWALL_SHOT"] == "1", "opt-in: TEST_RUNNER_PAYWALL_SHOT=1")
        let paywall = HostedScreen(PaywallView().environment(pro), size: UIScreen.main.bounds.size)
        defer { paywall.tearDown() }
        // HostedScreen's window belongs to no scene, so nothing draws it; this one has to be seen.
        paywall.window.windowScene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        paywall.window.windowLevel = .alert + 1
        paywall.window.makeKeyAndVisible()
        paywall.pump(2)
        // setUp has already required all three products; the frame itself is the check on what
        // the rows show, since a scene window's labels do not read back the way HostedScreen's do.
        print("PAYWALL prices:", pro.products.map { "\($0.id)=\($0.displayPrice)" })
        let marker = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("paywall-on-screen")
        try Data().write(to: marker)
        defer { try? FileManager.default.removeItem(at: marker) }
        paywall.pump(20)
    }

    // MARK: - Cancel

    /// Cancelling at the payment sheet unlocks nothing, charges nothing and puts nothing on the
    /// paywall. `disableDialogs` leaves no sheet to cancel, and an SKTestSession cannot fake one
    /// (`setSimulatedError(.generic(.userCancelled), forAPI: .purchase)` reaches the app as
    /// `StoreKitError.unknown`), so the sheet's own answer stands in for it.
    func testCancelUnlocksNothingAndShowsNoError() async {
        pro.paymentSheet = { _ in .userCancelled }
        let paywall = HostedScreen(PaywallView().environment(pro))
        defer { paywall.tearDown() }
        let before = paywall.labels
        await pressContinue(on: paywall)
        XCTAssertFalse(pro.isPro)
        XCTAssertTrue(session.allTransactions().isEmpty)
        XCTAssertEqual(paywall.labels, before, "the paywall changed after a cancel: \(paywall.labels)")
    }

    /// The same cancel, reported the other way StoreKit has of reporting it: as a thrown error.
    func testCancelReportedAsAnErrorIsStillACancel() async {
        pro.paymentSheet = { _ in throw StoreKitError.userCancelled }
        let outcome = await pro.purchase(.monthly)
        XCTAssertEqual(outcome, .cancelled)
        XCTAssertFalse(pro.isPro)
    }

    // MARK: - Restore

    /// Delete and reinstall: the new install knows nothing, and StoreKit gives Pro back — at
    /// launch, and again from Restore purchases.
    func testRestoreAfterClearingLocalState() async {
        let bought = await pro.purchase(.yearly)
        XCTAssertEqual(bought, .success)

        forgetLocalState()
        await pro.load() // what launch does
        XCTAssertTrue(pro.isPro, "a reinstall comes back without Pro")
        XCTAssertEqual(pro.activePlan, .yearly)

        forgetLocalState()
        let message = await pro.restore()
        XCTAssertEqual(message, "Your Pro access is restored.")
        XCTAssertTrue(pro.isPro)
        XCTAssertEqual(pro.activePlan, .yearly)
    }

    func testRestoreFromThePaywall() async {
        _ = await pro.purchase(.lifetime)
        let paywall = HostedScreen(PaywallView().environment(pro))
        defer { paywall.tearDown() }
        forgetLocalState()
        paywall.pump(0.1)
        XCTAssertTrue(paywall.activate { $0 == "Restore purchases" }, "\(paywall.labels)")
        await eventually("the paywall never said so: \(paywall.labels)") {
            paywall.pump(0.05)
            return paywall.labels.contains("Your Pro access is restored.")
        }
        XCTAssertTrue(pro.isPro)
        XCTAssertEqual(pro.activePlan, .lifetime)
    }

    /// Settings answers beside its own button. It used to put the answer in the ZIP field's red
    /// error line at the top of Settings: a success styled as an error, and off screen once
    /// Settings is scrolled down to Cartworth Pro.
    func testRestoreFromSettings() async {
        _ = await pro.purchase(.monthly)
        forgetLocalState()
        // Tall enough that the form lays out every section down to Data.
        let settings = HostedScreen(SettingsView().environment(AppState.shared).environment(pro),
                                    size: CGSize(width: 402, height: 4000))
        defer { settings.tearDown() }
        XCTAssertTrue(settings.activate { $0 == "Restore purchases" }, "\(settings.labels)")
        await eventually("Settings never said so: \(settings.labels)") {
            settings.pump(0.05)
            return settings.labels.contains("Your Pro access is restored.")
        }
        XCTAssertTrue(pro.isPro)
        XCTAssertEqual(pro.activePlan, .monthly)
        // By position on screen: a form's cells join the accessibility tree in the order they
        // were made, not the order they sit in.
        let elements = settings.elements
        func frame(_ label: String) -> CGRect? { elements.first { $0.0 == label }?.1 }
        let button = frame("Restore purchases"), said = frame("Your Pro access is restored."), dataSection = frame("Products tracked")
        XCTAssertNotNil(button)
        XCTAssertNotNil(dataSection)
        if let button, let said, let dataSection {
            XCTAssertTrue(button.maxY <= said.minY && said.maxY <= dataSection.minY,
                          "the answer is not under Restore purchases: \(elements.map { "\($0.0) @\(Int($0.1.minY))" })")
        }
    }

    func testRestoreWithNothingBought() async {
        let message = await pro.restore()
        XCTAssertEqual(message, "No purchases found for this Apple ID.")
        XCTAssertFalse(pro.isPro)
    }

    // MARK: - Refund and expiry take Pro away, with the app running

    func testRefundTakesProAway() async throws {
        _ = await pro.purchase(.lifetime)
        XCTAssertTrue(pro.isPro)
        try session.refundTransaction(identifier: try XCTUnwrap(session.allTransactions().first).identifier)
        await eventually("Pro survived a refund") { !pro.isPro }
        XCTAssertNil(pro.activePlan)
    }

    func testRefundedSubscriptionTakesProAway() async throws {
        _ = await pro.purchase(.yearly)
        XCTAssertTrue(pro.isPro)
        try session.refundTransaction(identifier: try XCTUnwrap(session.allTransactions().first).identifier)
        await eventually("Pro survived a refund") { !pro.isPro }
    }

    /// A subscription with auto-renew turned off runs out at its expiry date, and Pro goes with
    /// it while the app is still open. StoreKit's test clock makes the month two seconds long.
    ///
    /// Not `SKTestSession.expireSubscription`: on the iOS 27 simulator that changes the session's
    /// own record and nothing else. `Transaction.currentEntitlements` goes on returning the
    /// original expiry a month out, and no transaction or status update is delivered, so no app
    /// could see it.
    func testExpiredSubscriptionTakesProAway() async throws {
        session.timeRate = .oneRenewalEveryTwoSeconds
        _ = await pro.purchase(.monthly)
        XCTAssertTrue(pro.isPro)
        let bought = try XCTUnwrap(session.allTransactions().first)
        try session.disableAutoRenewForTransaction(identifier: bought.identifier)
        await eventually("Pro survived the subscription expiring", timeout: 15) { !pro.isPro }
        XCTAssertNil(pro.activePlan)
        XCTAssertEqual(session.allTransactions().count, 1, "it renewed instead of expiring")
    }

    // MARK: - Ask to Buy

    /// A child's purchase waits for a parent: the paywall says so and nothing unlocks; the
    /// approval arrives later, with no purchase call in flight, and unlocks Pro.
    func testAskToBuyShowsPendingThenUnlocksOnApproval() async throws {
        session.askToBuyEnabled = true
        let paywall = HostedScreen(PaywallView().environment(pro))
        defer { paywall.tearDown() }
        XCTAssertTrue(paywall.activate { $0.hasPrefix("Monthly") }, "\(paywall.labels)")
        paywall.pump(0.1)
        await pressContinue(on: paywall)
        XCTAssertFalse(pro.isPro, "Ask to Buy unlocked before approval")
        XCTAssertTrue(paywall.labels.contains("That purchase is waiting for approval."), "\(paywall.labels)")

        let waiting = try XCTUnwrap(session.allTransactions().first { $0.pendingAskToBuyConfirmation })
        try session.approveAskToBuyTransaction(identifier: waiting.identifier)
        await eventually("approval did not unlock Pro") { pro.isPro }
        XCTAssertEqual(pro.activePlan, .monthly)
    }

    // MARK: - Prices come from StoreKit

    func testPaywallShowsStoreKitPrices() {
        let paywall = HostedScreen(PaywallView().environment(pro))
        defer { paywall.tearDown() }
        XCTAssertEqual(Entitlements.Plan.allCases.map { pro.product($0)?.displayPrice }, ["$3.99", "$19.99", "$29.99"])
        for plan in Entitlements.Plan.allCases {
            let price = pro.product(plan)?.displayPrice ?? "?"
            XCTAssertTrue(row(plan, on: paywall).contains(price), "\(plan) does not show \(price): \(paywall.labels)")
        }
        XCTAssertTrue(row(.yearly, on: paywall).contains("about $1.67 a month"), "\(paywall.labels)")
    }

    /// Change the prices in the configuration, as editing Products.storekit in Xcode does, and
    /// open the paywall again: it shows the new prices, not the ones it loaded at launch.
    func testPaywallFollowsAPriceChange() async throws {
        let first = HostedScreen(PaywallView().environment(pro))
        XCTAssertTrue(row(.monthly, on: first).contains("$3.99"), "\(first.labels)")
        first.tearDown()

        session = try SKTestSession(contentsOf: try Self.configuration(repricedAs: ["3.99": "4.99", "19.99": "24.99", "29.99": "39.99"]))
        session.disableDialogs = true

        let again = HostedScreen(PaywallView().environment(pro))
        defer { again.tearDown() }
        await eventually("the paywall kept the old prices: \(again.labels)") {
            again.pump(0.05)
            return row(.monthly, on: again).contains("$4.99")
        }
        XCTAssertTrue(row(.yearly, on: again).contains("$24.99"), "\(again.labels)")
        XCTAssertTrue(row(.yearly, on: again).contains("about $2.08 a month"), "\(again.labels)")
        XCTAssertTrue(row(.lifetime, on: again).contains("$39.99"), "\(again.labels)")
    }

    // MARK: - Helpers

    private static func title(_ plan: Entitlements.Plan) -> String { plan.rawValue.capitalized }

    /// The plan row's accessibility label: its title, its subtitle and its price.
    private func row(_ plan: Entitlements.Plan, on screen: HostedScreen<some View>) -> String {
        screen.labels.first { $0.hasPrefix(Self.title(plan)) } ?? ""
    }

    /// Press Continue and wait for the purchase it starts to come back. The start is caught by
    /// observing `purchasing` rather than by polling it: a cancel is over in a few milliseconds.
    private func pressContinue(on paywall: HostedScreen<some View>, file: StaticString = #filePath, line: UInt = #line) async {
        let started = Flag()
        withObservationTracking { _ = pro.purchasing } onChange: { started.value = true }
        XCTAssertTrue(paywall.activate { $0 == "Continue" }, "no Continue button: \(paywall.labels)", file: file, line: line)
        await eventually("Continue started no purchase", file: file, line: line) { started.value && !pro.purchasing }
        paywall.pump(0.1)
    }

    private final class Flag: @unchecked Sendable { var value = false }

    private func eventually(_ message: @autoclosure () -> String, timeout: TimeInterval = 10,
                            file: StaticString = #filePath, line: UInt = #line, _ condition: () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline { try? await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertTrue(condition(), message(), file: file, line: line)
    }

    /// A copy of Products.storekit with its display prices replaced.
    private static func configuration(repricedAs prices: [String: String]) throws -> URL {
        var text = try String(contentsOf: configuration, encoding: .utf8)
        for (old, new) in prices {
            let from = "\"displayPrice\" : \"\(old)\"", to = "\"displayPrice\" : \"\(new)\""
            XCTAssertTrue(text.contains(from), "Products.storekit has no \(old) price")
            text = text.replacingOccurrences(of: from, with: to)
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Products-repriced.storekit")
        try text.write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
