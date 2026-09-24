import XCTest
import SwiftUI
@testable import Cartworth

// "On the screen test I see Jewel listing butter for $7.99. I can see it for less on my app."
//                                                            — the owner, 23 Sep, iPad QA run
//
// Two things were wrong, and only one of them is a screen's to fix.
//
// 1. The words. Jewel is priced from its Instacart listing, and the app called that "online": an
//    "online" badge on the row, "Jewel's online listing" on the product sheet, and a How Prices
//    Work page saying every price is "the same prices you'd see browsing that site". Jewel's own
//    app IS an online listing, and it shows different numbers. These tests render the real views
//    and read what they say (see `PriceProvenance`).
//
// 2. The number. Jewel's cheapest butter on Instacart that day was Lucerne, 1 lb for $4.99, listed
//    with a size of "4 ea" (four quarter-pound sticks). A count cannot be compared per ounce, so
//    it dropped out of the butter comparison and Jewel's bar became Land O Lakes at $7.99/lb. That
//    is a size-normalisation defect in ProductFactory / src/normalize.js — not a file this suite's
//    owner may change — and is pinned below as a known defect for the pricing handoff.

private func product(_ store: String, _ name: String, size: String, price: Double, regular: Double? = nil,
                     url: String? = nil, basis: PriceBasis) -> Product {
    ProductFactory.make(ProductInput(storeId: store, id: "\(store)-\(name)-\(size)", name: name, sizeText: size, price: price,
                                     regularPrice: regular, onSale: regular != nil, url: url.flatMap(URL.init(string:)),
                                     priceBasis: basis))!
}

private let jewelLandOLakes = product("jewel", "Land O Lakes Butter, Salted", size: "1 lb", price: 7.99,
                                      url: "https://www.instacart.com/products/2721623-land-o-lakes-butter-salted-4-ea?retailerSlug=jewel-osco",
                                      basis: .online)

@MainActor
final class InstacartProvenanceTests: XCTestCase {

    private func labels<V: View>(_ view: V) -> [String] {
        let screen = HostedScreen(view)
        defer { screen.tearDown() }
        return screen.labels
    }

    /// A result row is one button, so VoiceOver (and the tree) reads its parts as one
    /// comma-joined label: "Land O Lakes Butter, Salted, Jewel, 1 lb, Instacart, 49.9¢, /oz, $7.99".
    private func rowParts<V: View>(_ view: V) -> [String] {
        labels(view).flatMap { $0.components(separatedBy: ", ") }
    }

    private func row(_ p: Product) -> some View {
        ProductRowView(row: ComparedRow(product: p, score: 1, perBase: p.unitPrice(.weight)?.perBase, est: false, member: false, hist: nil),
                       unit: .oz)
    }

    /// DEFECT (owner, Jewel butter): the row names where its price came from. On a phone the row
    /// is all a shopper sees, so it has to say Instacart — not "online", which Jewel's own app
    /// also is.
    func testDEFECTAnInstacartPriceSaysInstacartOnItsRow() {
        let l = rowParts(row(jewelLandOLakes))
        XCTAssertTrue(l.contains("Instacart"), "the Jewel row does not say where $7.99 came from: \(l)")
        XCTAssertFalse(l.contains("online"), "a bare “online” reads as Jewel’s own online price: \(l)")
    }

    /// DEFECT (owner, Jewel butter): the product sheet said "This price comes from Jewel's online
    /// listing". It is Jewel's listing on Instacart, and the sheet must say so — and say that the
    /// store's own app can differ, since that is exactly the comparison a shopper will make.
    func testDEFECTTheProductSheetNamesInstacartNotTheStoresOwnListing() {
        let l = labels(ProductDetailView(product: jewelLandOLakes, unit: .oz, prefs: PricePrefs()).environment(Entitlements.shared))
        XCTAssertFalse(l.contains { $0.contains("online listing") }, "the sheet calls an Instacart price the store’s own listing: \(l)")
        XCTAssertTrue(l.contains { $0.hasPrefix("Jewel’s price on Instacart") && $0.contains("Jewel’s own app") }, "\(l)")
        XCTAssertTrue(l.contains("online (Instacart) price"), "the badge beside the price: \(l)")
    }

    /// DEFECT (owner, Jewel butter): How Prices Work claimed every price is "the same prices you'd
    /// see browsing that site". For most chains it is not.
    func testDEFECTHowPricesWorkDoesNotClaimEveryPriceIsTheStoresOwn() {
        let l = labels(NavigationStack { AboutPricesView() })
        XCTAssertFalse(l.contains { $0.contains("same prices you'd see browsing that site") }, "\(l)")
        XCTAssertTrue(l.contains { $0.contains("listing on Instacart") }, "\(l)")
    }

    /// control: a shelf price carries no provenance badge and no caveat — the qualifier is for
    /// prices that need one.
    func testControlAShelfPriceIsNotQualified() {
        let aldi = product("aldi", "Countryside Creamery Salted Butter", size: "16 oz", price: 2.89, basis: .shelf)
        let r = rowParts(row(aldi))
        XCTAssertFalse(r.contains("Instacart") || r.contains("online") || r.contains("national"), "\(r)")
        let sheet = labels(ProductDetailView(product: aldi, unit: .oz, prefs: PricePrefs()).environment(Entitlements.shared))
        XCTAssertFalse(sheet.contains { $0.contains("on Instacart") }, "\(sheet)")
    }

    /// control: a chain-wide listing keeps its own, different words.
    func testControlANationalPriceSaysNational() {
        let walmart = product("walmart", "Great Value Salted Butter", size: "16 oz", price: 4.12, basis: .national)
        XCTAssertTrue(rowParts(row(walmart)).contains("national"), "\(rowParts(row(walmart)))")
        let sheet = labels(ProductDetailView(product: walmart, unit: .oz, prefs: PricePrefs()).environment(Entitlements.shared))
        XCTAssertTrue(sheet.contains { $0.hasPrefix("Instacart’s chain-wide price for Walmart") }, "\(sheet)")
    }

    // MARK: - the number (pricing's, pinned here for the handoff)

    /// KNOWN DEFECT — handed off to the pricing owner (ProductFactory.swift + src/normalize.js).
    ///
    /// Jewel-Osco's butter as Instacart listed it at location 21943 (captured 23 Sep 13:57 in a
    /// QA database; every size, price and URL below is verbatim). Lucerne Salted Butter is a 16 oz
    /// package — its URL slug says "…-sweet-cream-salted-16-oz" — but its stated size is "4 ea",
    /// so it is costed per stick-count and cannot enter a per-ounce comparison. Jewel's bar is then
    /// Land O Lakes at $7.99/lb (49.9¢/oz) instead of Lucerne at $4.99/lb (31.2¢/oz): the $7.99 the
    /// owner saw, against the lower price in Jewel's own app.
    ///
    /// `strict: true`: the day the size is read from the slug this starts failing as an
    /// unexpected pass — delete the `XCTExpectFailure` line then, and it becomes the regression
    /// test.
    func testKNOWNDEFECTJewelsOneWeighedButterIsLeftOutOfThePerOunceComparison() {
        let jewel: [Product] = [
            jewelLandOLakes,
            product("jewel", "Lucerne Salted Butter", size: "4 ea", price: 4.99, regular: 6.99,
                    url: "https://www.instacart.com/products/3142199-lucerne-butter-sweet-cream-salted-16-oz?retailerSlug=jewel-osco", basis: .online),
            product("jewel", "Challenge Butter, Salted", size: "16 oz", price: 7.99,
                    url: "https://www.instacart.com/products/89591-challenge-salted-butter-16-oz?retailerSlug=jewel-osco", basis: .online),
            product("jewel", "Land O Lakes Butter, Salted, Half Sticks", size: "1 lb", price: 7.99,
                    url: "https://www.instacart.com/products/89590-land-o-lakes-butter-salted-half-sticks-1-lb?retailerSlug=jewel-osco", basis: .online),
            product("jewel", "O Organics Butter, Sweet Cream, Salted", size: "16 oz", price: 9.99,
                    url: "https://www.instacart.com/products/16776015-o-organics-butter-organic-sweet-cream-salted-4-ea?retailerSlug=jewel-osco", basis: .online),
        ]
        let aldi = [product("aldi", "Countryside Creamery Sweet Cream Butter - 4 Sticks", size: "16 oz", price: 2.89, basis: .shelf)]
        let out = Comparer.compute(query: "butter", results: ["jewel": StoreResult(retailerId: "jewel", status: .ok, items: jewel),
                                                             "aldi": StoreResult(retailerId: "aldi", status: .ok, items: aldi)],
                                   history: [:], options: CompareOptions(), prefs: PricePrefs(), storeOrder: ["aldi", "jewel"])
        let bar = out.bestPerStore.first { $0.product.storeId == "jewel" }
        XCTExpectFailure("Pricing handoff: a count-sized listing whose URL slug states a weight is sized from the slug. Until then Jewel's bar is $7.99/lb.", strict: true)
        XCTAssertEqual(bar?.product.name, "Lucerne Salted Butter",
                       "Jewel's bar is \(bar?.product.name ?? "-") at \(Money.full(bar?.product.price ?? 0)) — Jewel sells 1 lb of butter for $4.99")
    }
}
