import XCTest
import SwiftUI
@testable import Cartworth

// The search screen's answer, through the path the screen actually runs.
//
// The search tab does not call `Compare.bestPerStore`. It calls `Comparer.compute`
// (Services/SearchModel.swift), which built its own "cheapest per store" — and so none of the
// guards the pricing work added to `Compare` reached the screen a shopper reads first:
// `judgePlausibility` never ran, so no search row could ever carry the "price looks wrong" badge;
// `headlineEligible` never ran, so a flagged or weak-match row could be a store's bar and the
// BEST PRICE headline; and `HeroBestCard` printed its own "N% less than" over any two prices,
// never asking `Compare.savingsClaim` whether the two were comparable. Every test in
// PricingRound2Tests was green while the phone's headline ignored all of it — the round-1 lesson
// ("helper tests pass while the helper is unwired") again.
//
// These drive ProductFactory.make -> Comparer.compute -> HeroBestCard, and read the card back off
// the screen.

private func item(_ storeId: String, _ name: String, _ sizeText: String, _ price: Double, soldBy: SoldBy = .each,
                  category: String? = nil, basis: PriceBasis = .shelf) -> Product {
    ProductFactory.make(ProductInput(storeId: storeId, id: "\(storeId)-\(name)-\(sizeText)", name: name, sizeText: sizeText,
                                     price: price, soldBy: soldBy, category: category, priceBasis: basis))!
}

private func results(_ byStore: [String: [Product]]) -> [String: StoreResult] {
    byStore.mapValues { StoreResult(retailerId: $0.first?.storeId ?? "", status: .ok, items: $0) }
}

private func compute(_ query: String, _ byStore: [String: [Product]], options: CompareOptions = CompareOptions()) -> CompareOutput {
    Comparer.compute(query: query, results: results(byStore), history: [:], options: options, prefs: PricePrefs(),
                     storeOrder: byStore.keys.sorted())
}

@MainActor
final class SearchScreenGuardTests: XCTestCase {

    // MARK: - a price the app does not believe never becomes the answer

    /// The 53211 dinner-rolls capture with Woodman's "12 x 15 oz" read as one 15 oz bag's worth of
    /// twelve: 12x too cheap, built on a size read out of the name. `Compare.bestPerStore` refuses
    /// it; the search screen crowned it.
    private func rolls() -> [String: [Product]] {
        [
            "woodmans": [item("woodmans", "Hawaiian Dinner Rolls, 12 x 15 oz", "12 ct", 2.69, category: "Dinner Rolls")],
            "metromarket": [item("metromarket", "Sara Lee Hawaiian Rolls, 12 ct, 15 oz", "12 ct", 4.99, category: "Dinner Rolls", basis: .online)],
            "meijer": [item("meijer", "Aunt Millie's Big & Fluffy Hawaiian Dinner Rolls", "17 oz", 3.99, category: "Dinner Rolls", basis: .online)],
            "aldi": [item("aldi", "Specially Selected Brioche Rolls - 12 Pack", "16.9 oz", 4.19, category: "Dinner Rolls")],
            "traderjoes": [item("traderjoes", "Dinner Rolls", "12 oz", 2.99, category: "Loaves, Rolls, Buns")],
            "wholefoods": [item("wholefoods", "Brioche Dinner Rolls", "16.9 oz", 6.99)],
        ]
    }

    func testDEFECTSearchHeroNeverCrownsAPriceTheAppFlagged() throws {
        var opts = CompareOptions()
        opts.dim = .weight
        let out = compute("dinner rolls", rolls(), options: opts)
        let bad = try XCTUnwrap(out.rows.first { $0.product.storeId == "woodmans" }, "the row itself stays in the list")
        XCTAssertFalse(Compare.headlineEligible(bad.product, score: bad.score),
                       "fixture: Core must refuse this row — flags: implausible \(String(describing: bad.product.implausible)), sizeConflict \(String(describing: bad.product.sizeConflict))")
        XCTAssertNotEqual(out.bestPerStore.first?.product.key, bad.product.key,
                          "BEST PRICE is \(bad.product.name) at \(Money.full(bad.product.price)) — a price the app itself refuses to believe")
        XCTAssertFalse(out.bestPerStore.contains { $0.product.key == bad.product.key }, "and it is not Woodman's bar in the chart either")
    }

    /// The "price looks wrong" badge in `ProductRowView` reads `product.implausible`, which only
    /// `Compare.flagImplausible` sets. The search screen never ran it, so the badge could not
    /// appear on the one screen built around it.
    func testDEFECTSearchRowsCarryThePlausibilityFlag() {
        // Eight honest butters around $4-5/lb and one "Butter" priced as if a 36-pack were one.
        var byStore: [String: [Product]] = [:]
        let honest: [(String, Double)] = [("aldi", 3.49), ("jewel", 4.99), ("marianos", 4.49), ("woodmans", 3.99),
                                          ("tonys", 4.29), ("petes", 4.79), ("traderjoes", 4.49), ("wholefoods", 5.29)]
        for (s, p) in honest { byStore[s] = [item(s, "Salted Butter", "16 oz", p)] }
        byStore["costco"] = [item("costco", "Kirkland Signature Salted Butter", "1 lb", 69.99)]
        let out = compute("butter", byStore)
        let costco = out.rows.first { $0.product.storeId == "costco" }
        XCTAssertNotNil(costco?.product.implausible, "a price ~16x the median is on screen with no “price looks wrong” badge")
        XCTAssertNotEqual(out.bestPerStore.last?.product.storeId, "costco", "and it is not Costco's bar")
    }

    // MARK: - the Show control widens the list, never the answer

    /// Onboarding promises only real matches count toward the best price. With Show set to
    /// "Everything" the screen rebuilt the headline from whatever the widened list held — on the
    /// website this headlined "sweet potatoes" with Tony's green cabbage.
    func testDEFECTShowEverythingDoesNotChangeTheAnswer() {
        let byStore: [String: [Product]] = [
            "tonys": [item("tonys", "Green Cabbage", "per lb", 0.50, soldBy: .lb)],
            "jewel": [item("jewel", "Sweet Potatoes", "per lb", 1.29, soldBy: .lb)],
            "aldi": [item("aldi", "Sweet Potatoes, 3 lb", "3 lb", 2.99)],
        ]
        var everything = CompareOptions()
        everything.strictness = .everything
        let wide = compute("sweet potatoes", byStore, options: everything)
        XCTAssertTrue(wide.rows.contains { $0.product.name == "Green Cabbage" }, "fixture: the list does widen")
        XCTAssertNotEqual(wide.bestPerStore.first?.product.name, "Green Cabbage", "BEST PRICE for sweet potatoes is a cabbage")
        XCTAssertEqual(wide.bestPerStore.first?.product.key, compute("sweet potatoes", byStore).bestPerStore.first?.product.key,
                       "the answer moved when only the list filter changed")
    }

    // MARK: - the savings line under the headline

    private func evap() -> [String: [Product]] {
        [
            "aldi": [item("aldi", "Baker's Corner Evaporated Milk", "12 fl oz", 0.99)],
            "walmart": [item("walmart", "Great Value Evaporated Milk", "12 fl oz", 1.0, basis: .national)],
            "picknsave": [item("picknsave", "Carnation Evaporated Milk", "12 fl oz", 1.79, basis: .online)],
            "woodmans": [item("woodmans", "Food Club Evaporated Milk", "12 fl oz", 1.09)],
        ]
    }

    private func heroLabels(_ out: CompareOutput) throws -> [String] {
        let best = try XCTUnwrap(out.bestPerStore.first)
        let unit = try XCTUnwrap(out.unit)
        let screen = HostedScreen(HeroBestCard(row: best, unit: unit, runnerUp: out.bestPerStore.dropFirst().first, prefs: PricePrefs()) {})
        defer { screen.tearDown() }
        return screen.labels
    }

    /// DEFECT (critic blocker, 53142): "1% less than the next-best store, Walmart" — a Kenosha
    /// shelf price against Instacart's chain-wide listing, which the app itself labels as not a
    /// store near you. A percentage between two prices the app says are not comparable is a wrong
    /// number. Same sentence `Compare.savingsClaim` (and shared/compare.js) gives: no figure.
    func testDEFECTNoPercentageAcrossPriceBasesUnderTheHeadline() throws {
        let labels = try heroLabels(compute("evaporated milk", evap()))
        XCTAssertFalse(labels.contains { $0.contains("%") && $0.contains("less than") },
                       "a percentage saving across price bases: \(labels)")
        XCTAssertTrue(labels.contains { $0.contains("About the same as Walmart (chain-wide price), so no saving is claimed") }, "\(labels)")
    }

    /// control: two shelf prices keep the exact figure, in the web's words.
    func testControlTwoShelfPricesKeepTheExactSaving() throws {
        let all = evap()
        let labels = try heroLabels(compute("evaporated milk", ["aldi": all["aldi"]!, "woodmans": all["woodmans"]!]))
        XCTAssertTrue(labels.contains { $0.contains("(9%) less than the next-best store, Woodman’s") }, "\(labels)")
    }
}
