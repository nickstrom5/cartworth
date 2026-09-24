import XCTest
import SwiftUI
@testable import Cartworth

/// "saves $X" on a trip-plan card, across price bases.
///
/// A plan's total adds up each line's price at whatever basis the store publishes. The card printed
/// an exact "saves $0.50" between a one-store plan built on Walmart's chain-wide Instacart listing
/// and a two-store plan that mixes it with ALDI's shelf — a dollar figure between two totals the
/// app itself says are not comparable. End to end: ProductFactory.make -> TripPlanner.priceOne ->
/// TripPlanner.plan -> the real TripPlanSummary, read back off the screen.
@MainActor
final class TripPlanSavingsTests: XCTestCase {

    private func item(_ store: String, _ name: String, _ size: String, _ price: Double, _ basis: PriceBasis) -> Product {
        ProductFactory.make(ProductInput(storeId: store, id: "\(store)-\(name)", name: name, sizeText: size, price: price, priceBasis: basis))!
    }

    /// Two items, two stores. Store B is cheaper for milk, A for butter, so the two-store plan beats
    /// the best single store by $0.50.
    private func planned(bBasis: PriceBasis) -> TripPlanner.Result {
        let byStoreMilk: [String: [Product]] = [
            "aldi": [item("aldi", "Friendly Farms Whole Milk", "1 gal", 3.49, .shelf)],
            "walmart": [item("walmart", "Great Value Whole Milk", "1 gal", 2.98, bBasis)],
        ]
        let byStoreButter: [String: [Product]] = [
            "aldi": [item("aldi", "Countryside Creamery Salted Butter", "16 oz", 3.49, .shelf)],
            "walmart": [item("walmart", "Great Value Salted Butter", "16 oz", 3.99, bBasis)],
        ]
        let stores = ["aldi", "walmart"]
        let milk = TripPlanner.priceOne(id: UUID(), text: "milk", qty: 1, pinned: nil, byStore: byStoreMilk, storeIds: stores, prefs: PricePrefs())
        let butter = TripPlanner.priceOne(id: UUID(), text: "butter", qty: 1, pinned: nil, byStore: byStoreButter, storeIds: stores, prefs: PricePrefs())
        return TripPlanner.plan([milk, butter], stores: stores)
    }

    private func labels(_ plan: TripPlanner.Result) -> [String] {
        let s = HostedScreen(TripPlanSummary(plan: plan, onRefresh: {}, planning: false))
        defer { s.tearDown() }
        return s.labels.flatMap { $0.components(separatedBy: ", ") }
    }

    /// DEFECT (critic blocker): no dollar saving between a plan that leans on a chain-wide listing
    /// and one that does not.
    func testDEFECTNoDollarSavingAcrossPriceBases() throws {
        let plan = planned(bBasis: .national)
        XCTAssertEqual(plan.single.first?.total ?? 0, 6.97, accuracy: 0.001, "fixture: Walmart alone is the cheapest single store")
        XCTAssertEqual(plan.everything.total, 6.47, accuracy: 0.001, "fixture: milk at Walmart, butter at ALDI")
        let l = labels(plan)
        XCTAssertFalse(l.contains { $0.hasPrefix("saves $") }, "an exact saving between chain-wide and shelf totals: \(l)")
        XCTAssertTrue(l.contains { $0.hasPrefix("about the same once online and chain-wide prices are allowed for") }, "\(l)")
    }

    /// DEFECT: at an accessibility size the option cards sat side by side in a scroller, one card
    /// wide on a phone, so the next card's total was cut by the edge of the screen — a clipped
    /// price. Every card, total included, is now inside the window.
    func testDEFECTNoOptionCardIsCutByTheScreenEdgeAtAccessibilitySizes() {
        let view = TripPlanSummary(plan: planned(bBasis: .shelf), onRefresh: {}, planning: false)
            .padding(16)
            .environment(\.dynamicTypeSize, .accessibility5)
        let s = HostedScreen(view, size: CGSize(width: 402, height: 3000))
        defer { s.tearDown() }
        let cards = s.elements.filter { $0.0.hasPrefix("One store") || $0.0.hasPrefix("Cherry-pick") }
        XCTAssertEqual(cards.count, 2, "\(s.labels)")
        for (label, frame) in cards {
            XCTAssertLessThanOrEqual(frame.maxX, 402.5, "“\(label)” runs to x=\(Int(frame.maxX)) on a 402pt screen")
        }
    }

    /// control: when every line of both plans is a shelf price the exact figure stays.
    func testControlAllShelfPlansKeepTheExactSaving() {
        let l = labels(planned(bBasis: .shelf))
        XCTAssertTrue(l.contains("saves $0.50"), "\(l)")
    }
}
