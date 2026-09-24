import XCTest
import SwiftUI
@testable import Cartworth

// "Never display an incorrect price", as far as layout decides it.
//
// Two kinds of test live here. `PriceLabelGeometryTests` pins the rules the on-screen guards
// (`DuoTests`, `IPadLandscapeTests`) run — the very file those guards compile, not a copy of it;
// see the header of UITests/PriceLabelGeometry.swift. `FlowRowLayoutTests` lays out the real
// `FlowRow` in a real window and measures where its children land. It replaces a suite that
// asserted against a private re-implementation of the clamp and passed with `FlowRow.measure`
// reverted to the pre-fix code — coverage in name only, on the app's highest-severity defect.

final class PriceLabelGeometryTests: XCTestCase {

    // MARK: - DEFECT 1/2/3/4: a price split across two lines

    /// The four prices from the sweep, at the sizes they were actually drawn at.
    ///
    /// Every one of these reads as a well-formed but *different* price on its top line — "$11.2"
    /// for $11.28, "$6.1" for $6.17, "$13" for $13.96, "10." for 10.6¢ — which is why a wrapped
    /// price is treated as blocker-severity rather than as cosmetic damage.
    func testDEFECT1WrappedPricesAreRecognisedByShape() {
        // width x height as a two-line break renders: roughly half the width, double the height.
        let broken: [(String, CGRect)] = [
            ("$11.28", CGRect(x: 0, y: 0, width: 62, height: 84)),   // "$11.2" / "8"
            ("$6.17",  CGRect(x: 0, y: 0, width: 48, height: 80)),   // "$6.1"  / "7"
            ("$13.96", CGRect(x: 0, y: 0, width: 58, height: 82)),   // "$13"   / ".96"
            ("16.5¢",  CGRect(x: 0, y: 0, width: 44, height: 78)),   // "16."   / "5¢"
        ]
        for (label, frame) in broken {
            XCTAssertTrue(PriceLabelGeometry.looksWrapped(label: label, frame: frame),
                          "\(label) at \(frame.width)x\(frame.height) is split across lines and must be caught")
        }
    }

    /// control: an ordinary single-line price must never trip the shape check. A false positive
    /// here would make the guard noise, and a noisy guard gets switched off.
    func testControlSingleLinePricesAreNotFlagged() {
        let fine: [(String, CGRect)] = [
            ("$11.28", CGRect(x: 0, y: 0, width: 118, height: 42)),
            ("$6.17",  CGRect(x: 0, y: 0, width: 96,  height: 42)),
            ("$13.96", CGRect(x: 0, y: 0, width: 120, height: 42)),
            ("16.5¢",  CGRect(x: 0, y: 0, width: 88,  height: 40)),
            ("$2.99",  CGRect(x: 0, y: 0, width: 40,  height: 17)),   // caption, default type size
            ("10.6¢",  CGRect(x: 0, y: 0, width: 38,  height: 17)),
        ]
        for (label, frame) in fine {
            XCTAssertFalse(PriceLabelGeometry.looksWrapped(label: label, frame: frame),
                           "\(label) at \(frame.width)x\(frame.height) is a normal one-line price")
        }
    }

    /// A three-glyph price like "99¢" is legitimately close to square, so it is exempt rather than
    /// reported. Documented so nobody "fixes" the exemption later without knowing why it is there.
    func testShortPricesAreExemptFromTheShapeCheck() {
        XCTAssertFalse(PriceLabelGeometry.looksWrapped(label: "99¢", frame: CGRect(x: 0, y: 0, width: 30, height: 28)))
    }

    // MARK: - DEFECT 18: the guard only looked at "$"

    /// `Money.unit` emits cent-formatted prices with no leading "$", and the old scan was gated on
    /// `hasPrefix("$")` — so every unit price in the app went unexamined while being visibly split
    /// on screen. Both forms are prices.
    func testDEFECT18CentFormattedPricesCountAsPrices() {
        for label in ["$2.99", "$11.28", "16.5¢", "10.6¢", "99¢", "$1.20"] {
            XCTAssertTrue(PriceLabelGeometry.isPriceLabel(label), "\(label) is a price the guard must examine")
        }
    }

    /// control: prose that merely mentions money is not a price label, and must not be measured
    /// as one — a sentence is legitimately taller than it is wide.
    func testControlProseIsNotMistakenForAPrice() {
        for label in ["Costs use each store’s cheapest matching product scaled to the same amount.",
                      "BEST PRICE", "Woodman’s", "per fl oz", ""] {
            XCTAssertFalse(PriceLabelGeometry.isPriceLabel(label), "\(label) is not a price")
        }
    }
}

// MARK: - FlowRow, laid out for real

/// `FlowRow` decides how much width each badge, chip and store tag gets, and therefore how much is
/// left for the price beside it. Its one hard rule: no subview is ever placed wider than the row.
///
/// Before the fix it measured every subview with `.unspecified` — "how wide would you like to be
/// with no limit at all?" — and then placed it at that width. A subview that answered with more
/// than the row had ran straight off the edge of the device, or over whatever sat beside it. In
/// `ProductRowView` that put the store name on top of the shelf price ("Woodman$5.79"), and
/// overdrawn digits are a wrong price.
///
/// These host the production `FlowRow` in a window and read each child's frame back off the
/// accessibility tree — the frame SwiftUI actually placed it at.
@MainActor
final class FlowRowLayoutTests: XCTestCase {

    /// Frames of the labelled children, relative to the row's own origin.
    private func frames(rowWidth: CGFloat, _ texts: [(String, CGFloat)]) -> [String: CGRect] {
        let row = FlowRow(spacing: 6) {
            ForEach(texts, id: \.0) { t in
                Text(t.0).font(.system(size: t.1))
            }
        }
        .frame(width: rowWidth, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        let screen = HostedScreen(VStack(alignment: .leading) { row; Spacer() }.frame(maxWidth: .infinity, alignment: .leading),
                                  size: CGSize(width: rowWidth, height: 1400))
        defer { screen.tearDown() }
        let origin = screen.host.view.convert(CGPoint.zero, to: nil)
        var out: [String: CGRect] = [:]
        for (label, frame) in screen.elements where texts.contains(where: { $0.0 == label }) {
            out[label] = frame.offsetBy(dx: -origin.x, dy: -origin.y)
        }
        return out
    }

    /// DEFECT 4/20: a subview wider than the row is brought back inside it.
    ///
    /// "disposable roasting pan" at 40pt is ~470pt wide on one line, against a 370pt row — the
    /// recent-search chip that ran off the right edge of a 402pt phone at AccessibilityXXXL.
    func testDEFECT4OverWideSubviewIsPlacedInsideTheRow() {
        let f = frames(rowWidth: 370, [("disposable roasting pan", 40)])
        guard let chip = f["disposable roasting pan"] else { return XCTFail("the chip was not laid out: \(f)") }
        XCTAssertLessThanOrEqual(chip.maxX, 370.5, "the chip runs \(Int(chip.maxX - 370))pt past the edge of the row: \(chip)")
        XCTAssertGreaterThan(chip.height, 60, "it fits by wrapping onto a second line inside the row, not by being cut: \(chip)")
    }

    /// DEFECT 1: the overdraw. A store tag too wide for the row must not be placed on top of the
    /// item that follows it — every child's frame is disjoint from every other's.
    func testDEFECT1NothingIsDrawnOnTopOfItsNeighbour() {
        let f = frames(rowWidth: 180, [("Woodman’s Food Markets", 34), ("$5.79", 17)])
        guard let tag = f["Woodman’s Food Markets"], let price = f["$5.79"] else { return XCTFail("not laid out: \(f)") }
        XCTAssertLessThanOrEqual(tag.maxX, 180.5, "\(tag)")
        XCTAssertFalse(tag.insetBy(dx: 1, dy: 1).intersects(price), "the price \(price) is drawn under the store name \(tag)")
    }

    /// control: subviews that fit are left exactly alone and share a line. The clamp must not
    /// shrink or wrap the badges and tags that were never the problem.
    func testControlFittingSubviewsShareOneLine() {
        let f = frames(rowWidth: 370, [("ALDI", 12), ("16 oz", 12), ("Best", 12)])
        guard let a = f["ALDI"], let b = f["16 oz"], let c = f["Best"] else { return XCTFail("not laid out: \(f)") }
        XCTAssertEqual(a.minY, b.minY, accuracy: 0.5)
        XCTAssertEqual(b.minY, c.minY, accuracy: 0.5)
        XCTAssertLessThan(a.maxX, b.minX)
        XCTAssertLessThan(b.maxX, c.minX)
    }
}

// MARK: - store names never break inside a word

/// DEFECT I4: "Mariano's" drawn as "Mar-" / "iano'" / "s" in the iPad ads column, and "Wal-" /
/// "mart" in the trip plan. A `Text` with a line limit breaks mid-word whenever one word is wider
/// than its space; `StoreName` shrinks the word instead. Hosted at AccessibilityXXXL in the width
/// the ads column gave it, the tag must come out one line tall.
@MainActor
final class StoreNameLayoutTests: XCTestCase {

    private func frame(of label: String, in view: some View, width: CGFloat) -> CGRect? {
        let screen = HostedScreen(view.frame(width: width, alignment: .leading).environment(\.dynamicTypeSize, .accessibility5),
                                  size: CGSize(width: max(width, 200), height: 600))
        defer { screen.tearDown() }
        return screen.elements.first { $0.0 == label }?.1
    }

    /// One line of AccessibilityXXXL caption text, for comparison.
    private func oneLine() -> CGFloat {
        frame(of: "M", in: Text("M").font(.caption).fontWeight(.semibold), width: 200)?.height ?? 0
    }

    func testDEFECTI4AOneWordNameShrinksRatherThanBreaks() {
        let line = oneLine()
        XCTAssertGreaterThan(line, 20, "reference line height")
        // 120pt is less than "Mariano’s" needs at this size (~190pt), as in the 148pt ads column
        // once the coupon badge took its share.
        guard let tag = frame(of: "Mariano’s", in: StoreTag(storeId: "marianos"), width: 120) else {
            return XCTFail("the store tag did not render")
        }
        XCTAssertLessThan(tag.height, line * 1.5, "“Mariano’s” is \(Int(tag.height))pt tall against a \(Int(line))pt line: it has been broken across lines")
        XCTAssertLessThanOrEqual(tag.width, 120.5)
    }

    /// Multi-word names still wrap — between words. "Pick ’n Save" in a column too narrow for all
    /// three words takes more than one line, and that is fine: no word is cut.
    func testControlMultiWordNameWrapsBetweenWords() {
        let line = oneLine()
        guard let tag = frame(of: "Pick ’n Save", in: StoreTag(storeId: "picknsave"), width: 150) else {
            return XCTFail("the store tag did not render")
        }
        XCTAssertGreaterThan(tag.height, line * 1.5, "three words that do not fit on one line wrap onto several")
    }

    /// VoiceOver still hears one name, not three words.
    func testStoreNameIsOneAccessibleElement() {
        XCTAssertNotNil(frame(of: "Whole Foods Market", in: StoreTag(storeId: "wholefoods", full: true), width: 140))
    }
}

// MARK: - store identity in charts

/// DEFECT 23/33: a charted series was identified by hue alone.
///
/// `StorePalette.color(slot:)` *clamps*, so every store past the eighth is drawn in the same grey
/// — in the shipped watch chart Walmart ($1.62) and Food City ($2.19) were two separate lines in
/// one identical colour. The palette's own comment says colour is never the only cue; these are
/// the second and third cues that make that true.
final class StoreSeriesCueTests: XCTestCase {

    /// Colour clamps past the end of the palette — that is the behaviour that made two stores
    /// identical, and it is asserted here so the rest of the test has a reason to exist.
    func testColourAloneCollapsesPastTheEighthStore() {
        let ninth = StorePalette.color(slot: 12, dark: false)
        let last = StorePalette.color(slot: 8, dark: false)
        XCTAssertEqual(ninth, last, "colour is expected to clamp; symbol and dash are what separate these")
    }

    /// Symbol and dash *cycle* rather than clamp, so the ninth store differs from the eighth even
    /// though they may share a colour. (`BasicChartSymbolShape` is not `Equatable`, so the shapes
    /// are compared by description — which is what distinguishes them on screen anyway.)
    func testDEFECT23SymbolAndDashKeepGoingWhereColourStops() {
        XCTAssertNotEqual(String(describing: StorePalette.symbol(slot: 8)),
                          String(describing: StorePalette.symbol(slot: 7)))
        XCTAssertNotEqual(StorePalette.dash(slot: 8), StorePalette.dash(slot: 7))
    }

    /// Ten stores on one chart — the case from the shipped screenshot — must not produce two
    /// series with the same colour *and* the same marker.
    func testTenStoresAreAllDistinguishable() {
        var seen = Set<String>()
        for slot in 0..<10 {
            let key = "\(StorePalette.color(slot: slot, dark: false))|\(StorePalette.symbol(slot: slot))|\(StorePalette.dash(slot: slot))"
            XCTAssertTrue(seen.insert(key).inserted, "slot \(slot) repeats an earlier series' full appearance")
        }
    }

    /// A negative or out-of-range slot must not trap. `colorSlot(for:)` returns an index into a
    /// live array of selected stores, which can go stale between a refresh and a redraw.
    func testOutOfRangeSlotsAreSafe() {
        XCTAssertNotNil(StorePalette.symbol(slot: 0))
        XCTAssertNotNil(StorePalette.symbol(slot: 99))
        XCTAssertNotNil(StorePalette.dash(slot: 99))
        XCTAssertNotNil(StorePalette.color(slot: -3, dark: true))
    }
}

// MARK: - trip plan totals

/// DEFECT: a trip plan priced a basket it was not buying.
///
/// `TripPlanner.plan` drops items that no store could price — correctly, since there is nothing to
/// optimise about them — but it used to drop them from the `missing` count as well. With every
/// lookup empty the arithmetic came out as "0 items, $0.00, nothing missing", and the card told
/// the shopper their four-item Thanksgiving list cost nothing. Found on a live run in Milwaukee.
final class TripPlanMissingItemTests: XCTestCase {

    private func item(_ name: String, costs: [String: Double]) -> TripPlanner.PricedItem {
        TripPlanner.PricedItem(
            id: UUID(), text: name, qty: 1, dim: nil, refBase: nil,
            perStore: costs.mapValues { TripPlanner.ItemCost(cost: $0, est: false, pinned: false, product: nil, pinnedProduct: nil) },
            cheapest: costs.min(by: { $0.value < $1.value })?.key)
    }

    /// Nothing could be priced: the plan must report four missing items, not a free basket.
    func testDEFECTUnpriceableBasketIsNotReportedAsFree() {
        let priced = ["milk 1 gal", "cranberry sauce 14 oz", "butter 1 lb", "pumpkin puree 15 oz"]
            .map { item($0, costs: [:]) }
        let result = TripPlanner.plan(priced, stores: ["aldi", "woodmans"])

        XCTAssertEqual(result.everything.missing, 4, "every item is missing and must be counted as such")
        XCTAssertTrue(result.everything.stores.isEmpty, "a plan that buys nothing names no stores")
        // The total is still zero — there is nothing to add up — but `missing` is now what stops
        // the UI printing it as a price. See the card in ListsView.
        XCTAssertEqual(result.everything.total, 0, accuracy: 1e-9)
    }

    /// A partially priceable list counts only the items that really could not be found.
    func testPartiallyPriceableListCountsOnlyTheMissingOnes() {
        let priced = [
            item("milk 1 gal", costs: ["aldi": 2.99, "woodmans": 3.29]),
            item("butter 1 lb", costs: ["woodmans": 2.45]),
            item("disposable roasting pan", costs: [:]),
        ]
        let result = TripPlanner.plan(priced, stores: ["aldi", "woodmans"])

        XCTAssertEqual(result.everything.missing, 1, "only the roasting pan is missing")
        XCTAssertEqual(result.everything.total, 2.99 + 2.45, accuracy: 1e-9)
        XCTAssertEqual(result.everything.stores, ["aldi", "woodmans"])
    }

    /// control: a fully priceable list is unaffected by the missing-item accounting.
    func testControlFullyPriceableListHasNothingMissing() {
        let priced = [
            item("milk 1 gal", costs: ["aldi": 2.99, "woodmans": 3.29]),
            item("butter 1 lb", costs: ["aldi": 2.89, "woodmans": 2.45]),
        ]
        let result = TripPlanner.plan(priced, stores: ["aldi", "woodmans"])

        XCTAssertEqual(result.everything.missing, 0)
        XCTAssertEqual(result.everything.total, 2.99 + 2.45, accuracy: 1e-9)
        // And the single-store option is still offered, at that store's own total.
        XCTAssertEqual(result.single.first?.missing, 0)
    }

    /// The existing rule that a plan never names a store it buys nothing at still holds once the
    /// missing count is carried — this is the guard DUO.md records as already having shipped once
    /// as a phantom "Three stores" card.
    func testControlPlanNeverNamesAStoreItBuysNothingAt() {
        let priced = [
            item("milk 1 gal", costs: ["aldi": 2.99, "woodmans": 3.29, "jewel": 4.19]),
            item("butter 1 lb", costs: ["aldi": 2.89, "woodmans": 2.45, "jewel": 3.99]),
        ]
        let result = TripPlanner.plan(priced, stores: ["aldi", "woodmans", "jewel"])
        for plan in [result.everything] + result.single + result.pairs + result.triples {
            XCTAssertEqual(Set(plan.stores), Set(plan.assign.values),
                           "plan names \(plan.stores) but only buys at \(Set(plan.assign.values))")
        }
    }
}
