import XCTest
@testable import Cartworth

// Covers the two pure pieces the price charts depend on: the y-domain calculation
// (`ChartScale`) and the axis label format (`PriceAxisFormat`). Both used to be implicit — the
// domain came from Swift Charts' automatic scale and the labels from `Money.unit` — and both
// degenerated in ways that only showed up as a rendering defect in a screenshot.
//
// The reference behaviour is `LineChart` in public/js/charts.js, which is this same chart on the
// web and has always fitted its own domain.

final class ChartDomainTests: XCTestCase {

    private func assertRange(_ r: ClosedRange<Double>, _ lo: Double, _ hi: Double,
                             accuracy: Double = 1e-9, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(r.lowerBound, lo, accuracy: accuracy, "lowerBound", file: file, line: line)
        XCTAssertEqual(r.upperBound, hi, accuracy: accuracy, "upperBound", file: file, line: line)
    }

    // MARK: the shipped defect

    /// D2. The tracking chart drew an empty grid with a $0–$200 axis while the real prices were
    /// $1.41–$2.49: the automatic scale anchors at zero and rounds the top out, so the entire
    /// series sat on the bottom gridline. A fitted domain has to stay close to the data.
    func testRealPricesDoNotGetAZeroToTwoHundredAxis() {
        let prices = [1.41, 1.79, 1.99, 2.19, 2.49]
        let d = ChartScale.priceDomain(prices)
        XCTAssertGreaterThan(d.lowerBound, 1.0, "axis must not be anchored at zero")
        XCTAssertLessThan(d.upperBound, 3.0, "axis must not run far past the data")
        // 0.15 padding either side, as in public/js/charts.js.
        assertRange(d, 1.41 - 0.162, 2.49 + 0.162, accuracy: 1e-9)
        // And every point is inside it — a price axis must never clip a sample.
        for p in prices { XCTAssertTrue(d.contains(p), "\(p) fell outside \(d)") }
    }

    /// The exact series the live app produced for a "butter" watch. The automatic scale gave
    /// 0–$10 for data that lives in 2.44–9.49.
    func testButterWatchSeriesIsFitted() {
        let perLb = [3.146666666666667, 5.89037037037037, 6.79, 2.99, 9.49, 3.06, 4.69, 4.99, 6.19, 2.4426666666666668]
        let d = ChartScale.priceDomain(perLb)
        XCTAssertGreaterThan(d.lowerBound, 1.0)
        XCTAssertLessThan(d.upperBound, 11.5)
        for p in perLb { XCTAssertTrue(d.contains(p), "\(p) fell outside \(d)") }
    }

    // MARK: degenerate inputs

    func testEmptySeriesGivesAValidNonEmptyDomain() {
        let d = ChartScale.priceDomain([])
        XCTAssertLessThan(d.lowerBound, d.upperBound, "a zero-width domain renders nothing")
        assertRange(d, 0, 1)
    }

    func testSinglePointIsCentredNotCollapsed() {
        let d = ChartScale.priceDomain([3.00])
        XCTAssertLessThan(d.lowerBound, d.upperBound)
        XCTAssertTrue(d.contains(3.00))
        assertRange(d, 2.7, 3.3, accuracy: 1e-9)
    }

    func testAllEqualValuesGetABandAroundTheValue() {
        let d = ChartScale.priceDomain([2.50, 2.50, 2.50, 2.50])
        XCTAssertLessThan(d.lowerBound, d.upperBound)
        XCTAssertTrue(d.contains(2.50))
        assertRange(d, 2.25, 2.75, accuracy: 1e-9)
    }

    /// All-zero is the case where a percentage pad is also zero. Must still be a unit band.
    func testAllZeroValuesStillGiveAUsableDomain() {
        let d = ChartScale.priceDomain([0, 0, 0])
        XCTAssertLessThan(d.lowerBound, d.upperBound)
        assertRange(d, 0, 1)
    }

    func testDomainNeverGoesNegative() {
        // Padding would push the floor below zero; money has no negative half.
        let d = ChartScale.priceDomain([0.10, 5.00])
        XCTAssertEqual(d.lowerBound, 0, accuracy: 1e-9)
        XCTAssertTrue(d.contains(0.10))
        XCTAssertTrue(d.contains(5.00))
    }

    func testNonFiniteValuesAreIgnored() {
        let d = ChartScale.priceDomain([2.00, .nan, 3.00, .infinity, -.infinity])
        XCTAssertTrue(d.lowerBound.isFinite)
        XCTAssertTrue(d.upperBound.isFinite)
        XCTAssertTrue(d.contains(2.00))
        XCTAssertTrue(d.contains(3.00))
        XCTAssertLessThan(d.upperBound, 4.0)
    }

    func testAllNonFiniteBehavesLikeEmpty() {
        assertRange(ChartScale.priceDomain([.nan, .infinity]), 0, 1)
    }

    // MARK: outliers and the target rule

    /// An outlier must stay on the line chart. Clipping a line looks exactly like a real
    /// plateau, so the domain widens to contain it rather than hiding it.
    func testOutlierIsNotClippedOffTheLineChart() {
        let withOutlier = [2.41, 2.79, 2.99, 3.29, 3.49, 3.79, 3.99, 29.84]
        let d = ChartScale.priceDomain(withOutlier)
        for v in withOutlier { XCTAssertTrue(d.contains(v), "\(v) fell outside \(d)") }
        XCTAssertGreaterThanOrEqual(d.upperBound, 29.84)
    }

    func testTargetIsKeptOnScreen() {
        // A target below everything observed still has to be visible, or the rule is off-canvas.
        let d = ChartScale.priceDomain([4.00, 4.50, 5.00], including: 2.00)
        XCTAssertTrue(d.contains(2.00), "target fell outside \(d)")
        XCTAssertTrue(d.contains(5.00))

        // And one above everything observed.
        let d2 = ChartScale.priceDomain([4.00, 4.50, 5.00], including: 9.00)
        XCTAssertTrue(d2.contains(9.00), "target fell outside \(d2)")
    }

    func testNonFiniteTargetIsIgnored() {
        let d = ChartScale.priceDomain([4.00, 5.00], including: .nan)
        XCTAssertTrue(d.lowerBound.isFinite && d.upperBound.isFinite)
        XCTAssertTrue(d.contains(4.00))
    }
}

final class ChartBarCapTests: XCTestCase {

    /// D1. Costco's mis-parsed $29.84/gal set the bar scale, so ALDI $2.41 through Jewel $3.99
    /// all rendered as near-identical stubs. The cap has to come from the bulk of the data.
    func testOneOutlierDoesNotSetTheBarScale() {
        let milk = [2.41, 2.79, 2.99, 3.29, 3.49, 3.79, 3.99, 29.84]
        let cap = ChartScale.barCap(milk)
        XCTAssertLessThan(cap, 5.0, "cap must exclude the outlier, got \(cap)")
        XCTAssertGreaterThanOrEqual(cap, 3.99, "cap must still contain every non-outlier bar")

        // The point of the cap: the cheapest and the dearest ordinary store are now visibly
        // different lengths instead of two stubs.
        let cheapest = 2.41 / cap
        let dearestOrdinary = 3.99 / cap
        XCTAssertGreaterThan(dearestOrdinary - cheapest, 0.30,
                             "ordinary bars must span a usable fraction of the track")
        // Before: 2.41/29.84 = 8% and 3.99/29.84 = 13%, a 5-point spread.
        XCTAssertLessThan((3.99 / 29.84) - (2.41 / 29.84), 0.06)
    }

    /// The other half of "don't misrepresent": a break marker that fires on an honest spread
    /// stops meaning anything. These are the ten stores a live "milk" search returned — Whole
    /// Foods at $9.49 and Trader Joe's at $11.38 really are that much dearer than ALDI at $2.41,
    /// and none of it is a parsing error, so none of it should be flagged.
    func testGenuinelyExpensiveStoresAreNotFlagged() {
        let milk = [2.41, 2.97, 3.23, 3.49, 3.59, 3.99, 5.09, 5.69, 9.49, 11.38]
        let cap = ChartScale.barCap(milk)
        XCTAssertEqual(cap, 11.38, accuracy: 1e-9, "a 4.7x honest spread must render at true scale")
        XCTAssertFalse(milk.contains { $0 > cap })
    }

    func testCleanDataIsNotCapped() {
        let clean = [2.40, 2.60, 2.80, 3.00, 3.20]
        XCTAssertEqual(ChartScale.barCap(clean), 3.20, accuracy: 1e-9,
                       "nothing here is an outlier; the scale is just the max")
    }

    /// Below four bars there is not enough data to call anything an outlier, and capping would
    /// misrepresent a small honest spread.
    func testTooFewBarsToJudge() {
        XCTAssertEqual(ChartScale.barCap([2.00, 3.00, 40.00]), 40.00, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.barCap([2.00]), 2.00, accuracy: 1e-9)
    }

    func testEmptyAndNonPositiveInput() {
        XCTAssertEqual(ChartScale.barCap([]), 1, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.barCap([0, -1, .nan]), 1, accuracy: 1e-9)
        // Zero and negative prices are dropped, the real ones still set the cap.
        XCTAssertEqual(ChartScale.barCap([0, 2.00]), 2.00, accuracy: 1e-9)
    }

    func testAllEqualBarsAreNotTreatedAsOutliers() {
        let cap = ChartScale.barCap([3.00, 3.00, 3.00, 3.00, 3.00])
        XCTAssertEqual(cap, 3.00, accuracy: 1e-9)
        XCTAssertFalse(3.00 > cap, "an all-equal set must not flag every bar as off scale")
    }

    /// Two outliers, not one — the fence is a quantile, so it should survive more than one.
    func testTwoOutliers() {
        let v = [2.40, 2.50, 2.60, 2.70, 2.80, 2.90, 3.00, 48.00, 52.00]
        let cap = ChartScale.barCap(v)
        XCTAssertLessThan(cap, 5.0)
        XCTAssertGreaterThanOrEqual(cap, 3.00)
    }

    func testQuantile() {
        let v = [1.0, 2.0, 3.0, 4.0, 5.0]
        XCTAssertEqual(ChartScale.quantile(v, 0), 1.0, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile(v, 0.25), 2.0, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile(v, 0.5), 3.0, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile(v, 0.75), 4.0, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile(v, 1), 5.0, accuracy: 1e-9)
        // Interpolated between samples.
        XCTAssertEqual(ChartScale.quantile([1.0, 2.0], 0.5), 1.5, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile([], 0.5), 0, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile([7.0], 0.9), 7.0, accuracy: 1e-9)
        // Out-of-range p is clamped rather than crashing on an index.
        XCTAssertEqual(ChartScale.quantile(v, 1.5), 5.0, accuracy: 1e-9)
        XCTAssertEqual(ChartScale.quantile(v, -1), 1.0, accuracy: 1e-9)
    }
}

final class PriceAxisFormatTests: XCTestCase {

    /// D2's other half. `Money.unit` switches format per value, so one axis read
    /// "$200", "$150", "$100", "$50.00", "0.00¢" — and the zero tick claimed the price was
    /// zero cents. A tick label of "0.00¢" must not be reachable.
    func testZeroNeverRendersAsZeroPointZeroZeroCents() {
        // The formatter the old axis used, pinned here so the regression stays on the record.
        // `Money.unit` is a port of `unitPrice` in public/js/format.js and is right for a single
        // figure in a row — it is only wrong as an axis formatter. If it ever changes, it changes
        // on both sides at once and this expectation moves with it.
        XCTAssertEqual(Money.unit(0, .lb), "0.00¢")

        for format: PriceAxisFormat in [.cents, .dollarsCents, .dollars] {
            XCTAssertNotEqual(format.label(0), "0.00¢")
        }
        XCTAssertEqual(PriceAxisFormat.dollarsCents.label(0), "$0.00")
        XCTAssertEqual(PriceAxisFormat.dollars.label(0), "$0")
        XCTAssertEqual(PriceAxisFormat.cents.label(0), "0¢")
    }

    /// The whole point of choosing the format from the domain: every tick on one axis reads
    /// the same way. The shipped axis mixed three notations.
    func testOneAxisUsesOneNotation() {
        let d = ChartScale.priceDomain([1.41, 2.49])
        let f = PriceAxisFormat.forDomain(d)
        let labels = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map { f.label($0) }
        XCTAssertEqual(labels, ["$0.00", "$0.50", "$1.00", "$1.50", "$2.00", "$2.50", "$3.00"])
        XCTAssertTrue(labels.allSatisfy { $0.hasPrefix("$") }, "mixed notations: \(labels)")
        XCTAssertFalse(labels.contains { $0.contains("¢") })

        // The old per-value formatter on the same ticks.
        let old = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map { Money.unit($0 / DisplayUnit.lb.factor, .lb) }
        XCTAssertEqual(old, ["0.00¢", "50¢", "$1.00", "$1.50", "$2.00", "$2.50", "$3.00"])
    }

    func testFormatTierIsChosenFromTheDomain() {
        XCTAssertEqual(PriceAxisFormat.forDomain(0...0.80), .cents)
        XCTAssertEqual(PriceAxisFormat.forDomain(1.28...2.65), .dollarsCents)
        XCTAssertEqual(PriceAxisFormat.forDomain(0...99.9), .dollarsCents)
        XCTAssertEqual(PriceAxisFormat.forDomain(0...200), .dollars)
        XCTAssertEqual(PriceAxisFormat.forDomain(0...1), .dollarsCents)
    }

    func testSubDollarAxisUsesCents() {
        // Per-ounce prices live well under a dollar; "$0.03" for every tick is unreadable.
        let d = ChartScale.priceDomain([0.031, 0.089])
        XCTAssertEqual(PriceAxisFormat.forDomain(d), .cents)
        XCTAssertEqual(PriceAxisFormat.cents.label(0.03), "3¢")
        XCTAssertEqual(PriceAxisFormat.cents.label(0.09), "9¢")
    }

    func testLargeAxisDropsCents() {
        XCTAssertEqual(PriceAxisFormat.dollars.label(200), "$200")
        XCTAssertEqual(PriceAxisFormat.dollars.label(150), "$150")
        XCTAssertEqual(PriceAxisFormat.dollars.label(29.84), "$30")
    }

    func testNonFiniteLabelIsEmptyNotNaN() {
        XCTAssertEqual(PriceAxisFormat.dollarsCents.label(.nan), "")
        XCTAssertEqual(PriceAxisFormat.dollars.label(.infinity), "")
        XCTAssertEqual(PriceAxisFormat.cents.label(.nan), "")
    }
}
