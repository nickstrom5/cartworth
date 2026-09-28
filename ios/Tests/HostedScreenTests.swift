import XCTest
import SwiftUI
@testable import Cartworth

// Tests that render the real SwiftUI screens and read back what they actually say.
//
// Round 1's regression tests for these screens asserted against helpers — and a helper test
// passes happily while the view has stopped calling the helper. These host the production view in
// a real window, let SwiftUI lay it out, and read the words off the accessibility tree: the same
// strings VoiceOver speaks and XCUITest sees. If the view stops printing it, the test fails.

/// SwiftUI only builds its accessibility tree for a process that an assistive client has asked
/// about. XCUITest gets that for free; a unit test has to switch it on, which is what the
/// system's own automation does — libAccessibility's application-accessibility flag.
enum HostedAccessibility {
    private static var done = false
    static func enable() {
        guard !done else { return }
        done = true
        typealias SetEnabled = @convention(c) (Bool) -> Void
        // Without this every hosted screen reads back as zero labels and every assertion below
        // fails for the wrong reason — which is how this was found.
        guard let lib = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW),
              let sym = dlsym(lib, "_AXSApplicationAccessibilitySetEnabled") else { return }
        unsafeBitCast(sym, to: SetEnabled.self)(true)
    }
}

/// Hosts a SwiftUI view in a real window and reads back its accessibility labels.
@MainActor
final class HostedScreen<V: View> {
    let host: UIHostingController<V>
    let window: UIWindow

    init(_ view: V, size: CGSize = CGSize(width: 402, height: 1800)) {
        HostedAccessibility.enable()
        host = UIHostingController(rootView: view)
        window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        pump()
    }

    /// Let SwiftUI run its layout and its `.task`s.
    func pump(_ seconds: TimeInterval = 0.4) {
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(seconds))
        host.view.layoutIfNeeded()
    }

    /// Every accessibility label on screen, in tree order.
    var labels: [String] { elements.map(\.0) }

    /// Every accessibility element on screen with the frame SwiftUI placed it at (screen space).
    var elements: [(String, CGRect)] { nodes.map { ($0.accessibilityLabel ?? "", $0.accessibilityFrame) } }

    /// Activate the first element whose label passes `match`, as a VoiceOver double-tap does: a
    /// SwiftUI button runs its action. False when there is no such element.
    @discardableResult
    func activate(_ match: (String) -> Bool) -> Bool {
        nodes.first { match($0.accessibilityLabel ?? "") }?.accessibilityActivate() ?? false
    }

    /// Every labelled accessibility element on screen, in tree order.
    private var nodes: [NSObject] {
        var out: [NSObject] = []
        var seen = Set<ObjectIdentifier>()
        func walk(_ obj: NSObject, depth: Int) {
            guard depth < 60, seen.insert(ObjectIdentifier(obj)).inserted else { return }
            if obj.isAccessibilityElement, let l = obj.accessibilityLabel, !l.isEmpty { out.append(obj) }
            if let els = obj.accessibilityElements as? [NSObject] {
                for e in els { walk(e, depth: depth + 1) }
            }
            let n = obj.accessibilityElementCount()
            if n != NSNotFound, n > 0 {
                for i in 0..<n { if let e = obj.accessibilityElement(at: i) as? NSObject { walk(e, depth: depth + 1) } }
            }
            if let v = obj as? UIView { for s in v.subviews { walk(s, depth: depth + 1) } }
        }
        walk(host.view, depth: 0)
        return out
    }

    func tearDown() {
        window.isHidden = true
        window.rootViewController = nil
    }
}

private func product(_ store: String, _ name: String, size: String, price: Double, url: String?, basis: PriceBasis = .shelf) -> Product {
    ProductFactory.make(ProductInput(storeId: store, id: "\(store)-\(name)-\(size)", name: name, sizeText: size, price: price,
                                     url: url.flatMap(URL.init(string:)), priceBasis: basis))!
}

// MARK: - I1: the outbound button is named by where it goes

/// DEFECT I1: "Open at Walmart" opened instacart.com.
///
/// Every chain priced through the Instacart marketplace builds its product URL on
/// https://www.instacart.com (`InstacartSource.parseItem`), so the product sheet sent shoppers to
/// Instacart under a retailer's name. These render the real `ProductDetailView`.
@MainActor
final class ProductSheetOutboundLinkTests: XCTestCase {

    private func sheetLabels(_ p: Product) -> [String] {
        let screen = HostedScreen(ProductDetailView(product: p, unit: nil, prefs: PricePrefs()).environment(Entitlements.shared))
        defer { screen.tearDown() }
        return screen.labels
    }

    /// DEFECT I1: a Walmart listing lives on instacart.com, and the button must say so.
    func testDEFECTI1InstacartListingIsNotLabelledAsTheRetailer() {
        let walmart = product("walmart", "Great Value Unsalted Butter", size: "16 oz", price: 4.12,
                              url: "https://www.instacart.com/products/12345-great-value-unsalted-butter?retailerSlug=walmart",
                              basis: .national)
        let labels = sheetLabels(walmart)
        XCTAssertFalse(labels.contains { $0.contains("Open at Walmart") },
                       "the button opens instacart.com but is labelled with the retailer: \(labels)")
        XCTAssertTrue(labels.contains("View on Instacart"), "the button must name its destination: \(labels)")
        XCTAssertTrue(labels.contains { $0.contains("instacart.com") }, "the destination host is printed under the button: \(labels)")
    }

    /// control: a retailer's own storefront keeps the retailer's name. ALDI's catalogue base is
    /// aldi.us — Instacart-powered, but ALDI's own site — and that is where its links go.
    func testControlOwnStorefrontKeepsTheRetailerName() {
        let aldi = product("aldi", "Countryside Creamery Unsalted Butter", size: "16 oz", price: 3.49,
                           url: "https://www.aldi.us/store/aldi/products/123-countryside-creamery-unsalted-butter")
        let labels = sheetLabels(aldi)
        XCTAssertTrue(labels.contains("Open at ALDI"), "\(labels)")
        XCTAssertFalse(labels.contains("View on Instacart"))
    }

    /// Whole Foods and Trader Joe's are read from their own sites; `OutboundLink.ownHost` states
    /// those hosts, and this pins them to the catalogue so a renamed domain cannot silently turn
    /// "Open at Whole Foods" into "Open wholefoodsmarket.com".
    func testOwnHostsMatchTheCatalogue() {
        let wf = RetailerCatalog.byId["wholefoods"]!, tj = RetailerCatalog.byId["traderjoes"]!
        XCTAssertEqual(OutboundLink.destination(for: URL(string: "https://www.wholefoodsmarket.com/product/x")!, chain: wf).title, "Open at Whole Foods")
        XCTAssertEqual(OutboundLink.destination(for: URL(string: "https://www.traderjoes.com/home/products/pdp/1")!, chain: tj).title, "Open at Trader Joe’s")
        // Every marketplace chain resolves to the marketplace, never to its own name.
        for c in RetailerCatalog.chains {
            guard case .instacart(let base, _, _) = c.source, base.contains("www.instacart.com") else { continue }
            let d = OutboundLink.destination(for: URL(string: "https://www.instacart.com/products/1?retailerSlug=x")!, chain: c)
            XCTAssertEqual(d.title, "View on Instacart", "\(c.id)")
        }
    }

    /// An unknown host is named by its host rather than guessed at.
    func testUnknownHostIsNamedByItsHost() {
        let d = OutboundLink.destination(for: URL(string: "https://shop.example.com/p/1")!, chain: RetailerCatalog.byId["jewel"])
        XCTAssertEqual(d.title, "Open shop.example.com")
    }
}

// MARK: - I6: the trip plan prints the quantity it costed

/// DEFECT I6 (sweep #13): two shipped screenshots costed one gallon of orange juice at the same
/// store at $2.51 and $2.73. Both were "correct" — one for 46 fl oz, one for 50 — and neither
/// frame said which, so the reader saw "$2.51" beside "1 gal · $6.99" and could not reconcile it.
///
/// End to end: real products through `ProductFactory.make`, priced by `TripPlanner.priceOne` (the
/// reference amount comes from `Compare.referenceAmount`, the median package size), planned by
/// `TripPlanner.plan`, rendered by the real `TripPlanSummary`, and read back off the screen.
@MainActor
final class TripPlanCostedAmountTests: XCTestCase {

    private let juice: [String: [Product]] = [
        "tonys": [product("tonys", "Dutch Farms 100% Orange Juice", size: "1 gal", price: 6.99, url: nil)],
        "aldi": [product("aldi", "Nature's Nectar Orange Juice", size: "52 fl oz", price: 3.99, url: nil)],
        "jewel": [product("jewel", "Tropicana Pure Premium Orange Juice", size: "46 fl oz", price: 4.49, url: nil)],
        "woodmans": [product("woodmans", "Simply Orange Juice", size: "46 fl oz", price: 3.99, url: nil)],
        "marianos": [product("marianos", "Kroger Orange Juice", size: "46 fl oz", price: 3.49, url: nil)],
    ]

    private func planned(qty: Int = 1) -> TripPlanner.Result {
        let stores = Array(juice.keys).sorted()
        let item = TripPlanner.priceOne(id: UUID(), text: "orange juice", qty: qty, pinned: nil, byStore: juice, storeIds: stores, prefs: PricePrefs())
        return TripPlanner.plan([item], stores: stores)
    }

    private func screen(_ plan: TripPlanner.Result) -> [String] {
        let s = HostedScreen(TripPlanSummary(plan: plan, onRefresh: {}, planning: false))
        defer { s.tearDown() }
        return s.labels
    }

    /// DEFECT I6: the amount is on screen, and it is the amount that makes the printed cost add up.
    func testDEFECTI6TheCostedAmountIsPrintedAndReconcilesTheCost() throws {
        let plan = planned()
        let item = try XCTUnwrap(plan.items.first)
        let tonys = try XCTUnwrap(item.perStore["tonys"], "Tony's gallon is the cheapest per fl oz and must be costed")
        let labels = screen(plan)

        let amountLine = try XCTUnwrap(labels.first { $0.hasPrefix("for ") && $0.hasSuffix("fl oz") },
                                       "no costed amount on the trip plan: \(labels)")
        // Read the number back off the screen and check it against the cited package: $6.99 per
        // 128 fl oz, times the printed amount, is the printed cost.
        let flOz = try XCTUnwrap(Double(amountLine.dropFirst(4).dropLast(6)), amountLine)
        XCTAssertEqual(6.99 / 128 * flOz, tonys.cost, accuracy: 0.005,
                       "“\(amountLine)” does not reconcile \(Money.full(tonys.cost)) with $6.99 a gallon")
        XCTAssertTrue(labels.contains(Money.full(tonys.cost)), "the cost itself is on screen: \(labels)")
    }

    /// Two of an item: the amount says so, rather than printing one unit's amount beside a cost
    /// for two.
    func testQuantityIsPartOfTheAmount() throws {
        let labels = screen(planned(qty: 2))
        XCTAssertNotNil(labels.first { $0.hasPrefix("for 2 × ") }, "\(labels)")
    }

    /// control: the web prints the same amount in the same words (`refText`,
    /// public/js/views/list.js). These are its thresholds and its rounding.
    func testControlAmountTextMatchesTheWebFormatter() {
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 46), "46 fl oz")
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 50), "50 fl oz")
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 128), "1 gal")
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 96), "0.75 gal")
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 59.17), "59.2 fl oz")
        XCTAssertEqual(CostedAmount.text(dim: .weight, base: 24), "1.5 lb")
        XCTAssertEqual(CostedAmount.text(dim: .weight, base: 12), "12 oz")
        XCTAssertEqual(CostedAmount.text(dim: .count, base: 12), "1 dozen")
        XCTAssertEqual(CostedAmount.text(dim: .count, base: 18), "18 ct")
    }

    /// DEFECT I6b: the amount is stated exactly, as the web states it. An amount that is not a
    /// whole number of quarter-gallons or quarter-pounds stays in the base unit — "0.78 gal" is
    /// 99.84 fl oz, not the 100 fl oz the cost beside it was computed for. The phone printed the
    /// rounded form while public/js/views/list.js `refText` printed "100 fl oz" for the same plan.
    func testDEFECTI6bAnAmountIsNeverRoundedIntoALargerUnit() {
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 100), "100 fl oz")
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 70), "70 fl oz")
        XCTAssertEqual(CostedAmount.text(dim: .weight, base: 18), "18 oz")
        XCTAssertEqual(CostedAmount.text(dim: .weight, base: 20), "1.25 lb", "20 oz is exactly five quarter-pounds")
        XCTAssertEqual(CostedAmount.text(dim: .volume, base: 160), "1.25 gal", "160 fl oz is exactly five quarter-gallons")
    }

    /// A pinned product is costed as its whole package, so that is what it says.
    func testPinnedItemSaysItIsThePinnedPackage() {
        let pin = PinnedProduct(storeId: "tonys", key: "k", name: "Dutch Farms 100% Orange Juice", size: "1 gal", price: 6.99, soldBy: .each)
        let item = TripPlanner.priceOne(id: UUID(), text: "orange juice", qty: 1, pinned: pin, byStore: juice, storeIds: ["tonys", "aldi"], prefs: PricePrefs())
        XCTAssertEqual(CostedAmount.line(for: item, storeId: "tonys"), "for the pinned package (1 gal)")
    }
}
