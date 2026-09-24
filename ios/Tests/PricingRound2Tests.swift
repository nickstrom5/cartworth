import XCTest
@testable import Cartworth

/// Round 2: the numbers, on the phone. Each test mirrors one in test/qa-pricing-round2.test.js with
/// the same captured records, and drives the production types — ProductFactory.make ->
/// Compare.bestPerStore -> Compare.savingsClaim — never a private copy of their logic.
final class PricingRound2Tests: XCTestCase {
    private func item(_ storeId: String, _ name: String, _ sizeText: String, _ price: Double, soldBy: SoldBy = .each, category: String? = nil, url: String? = nil, basis: PriceBasis = .shelf) -> Product {
        ProductFactory.make(ProductInput(
            storeId: storeId, id: "\(storeId)-\(name)-\(sizeText)", name: name, sizeText: sizeText,
            price: price, soldBy: soldBy, url: url.flatMap(URL.init(string:)), category: category, priceBasis: basis
        ))!
    }
    private func perLb(_ p: Product) -> Double? { p.unitPrice(.weight).map { $0.perBase * 16 } }
    private func perGal(_ p: Product) -> Double? { p.unitPrice(.volume).map { $0.perBase * 128 } }
    private func ranked(_ stores: [String: Compare.Best]) -> [(String, Compare.Best)] {
        stores.sorted { $0.value.perBase < $1.value.perBase }.map { ($0.key, $0.value) }
    }

    // MARK: P1 — "12 ct, 15 oz" is twelve rolls in a 15 oz bag

    private func rolls53211() -> [String: [Product]] {
        [
            "woodmans": [item("woodmans", "Sara Lee Hawaiian Rolls, 12 ct, 15 oz", "12 ct", 2.69, category: "Dinner Rolls"),
                         item("woodmans", "Aunt Millie's Big & Fluffy Hawaiian Dinner Rolls", "17 oz", 3.79, category: "Dinner Rolls")],
            "metromarket": [item("metromarket", "Sara Lee Hawaiian Rolls, 12 ct, 15 oz", "12 ct", 4.99, category: "Dinner Rolls", basis: .online)],
            "meijer": [item("meijer", "Aunt Millie's Big & Fluffy Hawaiian Dinner Rolls", "17 oz", 3.99, category: "Dinner Rolls", basis: .online)],
            "aldi": [item("aldi", "Specially Selected Brioche Rolls - 12 Pack", "16.9 oz", 4.19, category: "Dinner Rolls")],
            "traderjoes": [item("traderjoes", "Dinner Rolls", "12 oz", 2.99, category: "Loaves, Rolls, Buns")],
            "wholefoods": [item("wholefoods", "Brioche Dinner Rolls", "16.9 oz", 6.99)],
        ]
    }

    func testTwelveCountFifteenOunceRollsAreOneFifteenOunceBag() {
        let p = rolls53211()["woodmans"]![0]
        XCTAssertEqual(p.base ?? 0, 15, accuracy: 0.001, "sized \(p.size)")
        XCTAssertEqual(perLb(p) ?? 0, 2.87, accuracy: 0.01)
    }

    func testTheRollsNoLongerTakeTheDinnerRollsHeadline() {
        let r = Compare.bestPerStore(query: "dinner rolls", results: rolls53211(), dim: .weight)
        let top = ranked(r.stores)[0]
        XCTAssertGreaterThan(top.1.perBase * 16, 1, "headline \(top.0) at \(top.1.perBase * 16)/lb")
        XCTAssertEqual((r.stores["metromarket"]?.perBase ?? 0) * 16, 5.32, accuracy: 0.01)
    }

    func testACountBeforeAVolumeIsStillAPackAndCostcosTwoLoavesAreTwo() {
        XCTAssertEqual(item("samsclub", "SunnyD Tangy Original Orange Juice Drink, 24 Count, 6.75 FL OZ Bottles", "6.75 fl oz", 9.32).base ?? 0, 162, accuracy: 0.001)
        let bread = item("costco", "Artesano the Original Bakery Bread, 2-count, 20 oz", "20 oz", 7.08)
        XCTAssertEqual(bread.base ?? 0, 40, accuracy: 0.001)
        XCTAssertNil(bread.sizeConflict)
        let chili = item("samsclub", "Hormel Chili with Beans 6-Pack, 5.63 LB", "15 oz", 13.44)
        XCTAssertEqual(perLb(chili) ?? 0, 2.39, accuracy: 0.01, chili.size)
        XCTAssertEqual(Units.parseSize("12-count 5.3 oz cups")?.base ?? 0, 63.6, accuracy: 0.001)
    }

    // MARK: P2 — a far-too-cheap price built on a size we inferred cannot win

    func testAFarTooCheapInferredPriceCannotTakeTheHeadline() {
        var results = rolls53211()
        results["woodmans"] = [item("woodmans", "Hawaiian Dinner Rolls, 12 x 15 oz", "12 ct", 2.69, category: "Dinner Rolls")]
        let r = Compare.bestPerStore(query: "dinner rolls", results: results, dim: .weight)
        XCTAssertEqual(results["woodmans"]![0].sizeSource, "name")
        XCTAssertNil(r.stores["woodmans"], "a 12x-too-cheap price took the store's best")
    }

    func testACheapPriceTheRetailerStatedSurvives() {
        let results: [String: [Product]] = [
            "tonys": [item("tonys", "Tony's Fresh Market Turkey Drumsticks", "3.43 lb", 3.99)],
            "a": [item("a", "Deli Turkey Breast", "per lb", 9.49, soldBy: .lb)],
            "b": [item("b", "Oven Roasted Turkey Breast", "per lb", 9.99, soldBy: .lb)],
            "c": [item("c", "Turkey Breast Tenderloin", "per lb", 10.49, soldBy: .lb)],
            "d": [item("d", "Organic Turkey Breast", "per lb", 11.99, soldBy: .lb)],
        ]
        let r = Compare.bestPerStore(query: "turkey", results: results)
        XCTAssertEqual(ranked(r.stores).first?.0, "tonys")
    }

    // MARK: P3 / P4 — the savings line

    private func evap53142() -> [String: [Product]] {
        [
            "aldi": [item("aldi", "Baker's Corner Evaporated Milk", "12 fl oz", 0.99)],
            "walmart": [item("walmart", "Great Value Evaporated Milk", "12 fl oz", 1.0, basis: .national)],
            "picknsave": [item("picknsave", "Carnation Evaporated Milk", "12 fl oz", 1.79, basis: .online)],
            "woodmans": [item("woodmans", "Food Club Evaporated Milk", "12 fl oz", 1.09)],
        ]
    }

    private func claim(_ stores: [String: Compare.Best]) -> Compare.SavingsClaim? {
        let r = ranked(stores)
        return Compare.savingsClaim(best: r[0].1.product, perBase: r[0].1.perBase, est: r[0].1.est, runnerUp: r[1].1.product, perBase: r[1].1.perBase, est: r[1].1.est)
    }

    func testNoPercentageBetweenAShelfPriceAndAChainWideOne() {
        let r = Compare.bestPerStore(query: "evaporated milk", results: evap53142())
        XCTAssertEqual(ranked(r.stores)[1].0, "walmart")
        let c = claim(r.stores)
        XCTAssertEqual(c?.kind, "close")
        XCTAssertEqual(c?.text, "About the same as {store} (chain-wide price), so no saving is claimed")
    }

    func testTwoShelfPricesGetTheSameExactSentenceAsTheWeb() {
        let all = evap53142()
        let r = Compare.bestPerStore(query: "evaporated milk", results: ["aldi": all["aldi"]!, "woodmans": all["woodmans"]!])
        let c = claim(r.stores)
        XCTAssertEqual(c?.kind, "exact")
        XCTAssertEqual(c?.pct, 9)
        XCTAssertEqual(c?.text, "{amount}/{unit} (9%) less than the next-best store, {store}")
        let o = Compare.bestPerStore(query: "evaporated milk", results: ["aldi": all["aldi"]!, "picknsave": all["picknsave"]!])
        XCTAssertEqual(claim(o.stores)?.text, "Less than the next-best store, {store} (online price)")
    }

    func testNoSavingAgainstAFlaggedPrice() {
        let winner = item("woodmans", "Butterball Whole Turkey", "per lb", 1.69, soldBy: .lb)
        var deli = item("festivalfoods", "Kretschmar Sundried Tomato Turkey", "per lb", 14.49, soldBy: .lb)
        deli.implausible = ImplausiblePrice(ratio: 5.2, median: 2.79, direction: "high")
        XCTAssertNil(Compare.savingsClaim(best: winner, perBase: 1.69 / 16, est: false, runnerUp: deli, perBase: 14.49 / 16, est: false))
    }

    // MARK: P5 – P8, P10, P11 — sizes

    func testASizeThatCannotBeNPiecesWithholdsTheUnitPrice() {
        let aldi = item("aldi", "Chomps Original Turkey Chomplings Mini Sticks - 6 Count", "0.5 oz", 6.99)
        XCTAssertNotNil(aldi.sizeConflict)
        XCTAssertNil(perLb(aldi), "still published at \(perLb(aldi) ?? 0)/lb")
        let costco = item("costco", "Chomps Chomplings Original Turkey Mini Sticks, 0.5 oz, 24-count", "each", 23.5)
        XCTAssertEqual(perLb(costco) ?? 0, 31.33, accuracy: 0.01)
        XCTAssertEqual(perLb(item("aldi", "Countryside Creamery Sweet Cream Butter - 4 Sticks", "16 oz", 2.89)) ?? 0, 2.89, accuracy: 0.01)
    }

    func testACapacityIsNotAWeight() {
        let bags = item("woodmans", "Reynolds Turkey Size Oven Bags, Holds Up to 24 Pounds, 2 Count", "2 ct", 2.49, category: "Oven Cooking Bags")
        XCTAssertNil(perLb(bags))
    }

    func testDryBrothIsNotPricedPerGallonAndButterChickenBrothIsBroth() {
        for (name, size) in [("Chicken Broth Pantry Pack", "2.12 OZ"), ("Bare Bones Instant Chicken Bone Broth Sticks", "0.53 oz"), ("Chicken Broth Concentrate", "4.06 Oz")] {
            XCTAssertNil(perGal(item("x", name, size, 6.99)), name)
        }
        XCTAssertEqual(item("x", "Apple Juice From Concentrate", "64 oz", 2.99).dim, .volume)
        XCTAssertEqual(item("wholefoods", "Organic Butter Chicken Bone Broth", "16.9 OZ", 8.79).dim, .volume)
        XCTAssertEqual(item("wholefoods", "Organic Classic Chicken Bone Broth", "16.9 OZ", 8.79).dim, .volume)
    }

    func testCannedFruitIn100PercentJuiceIsANetWeightCan() {
        XCTAssertEqual(item("aldi", "Sweet Harvest Peach Slices in 100% Juice", "15 oz", 1.55).dim, .weight)
        XCTAssertEqual(item("aldi", "Sweet Harvest Pineapple Chunks in Pineapple Juice", "20 oz", 1.65).dim, .weight)
        XCTAssertEqual(item("aldi", "Nature's Nectar Pineapple Juice", "46 oz", 2.49).dim, .volume)
    }

    func testANutritionClaimIsNotAPackageSize() {
        let loops = item("meijer", "Kellogg's Froot Loops With Marshmallows Breakfast Cereal 12g Whole Grains Family Size 16.2 oz", "16.2 oz", 3.99)
        XCTAssertNil(loops.sizeConflict)
        XCTAssertEqual(perLb(loops) ?? 0, 3.94, accuracy: 0.01)
    }

    // MARK: P9 — sizeConflict fires again, and only a third witness settles it

    func testANameSizeDisagreementNothingSettlesIsRecordedAndWithheld() {
        let p = item("costco", "Sweet Potatoes, 5 lbs", "10 lb", 8.07, url: "https://www.instacart.com/products/1-sweet-potatoes?retailerSlug=costco")
        XCTAssertEqual(p.sizeConflict, SizeConflict(text: "10 lb", name: "5 lb"))
        XCTAssertNil(perLb(p))
    }

    func testTheCostcoSlugSettlesTheSweetPotatoes() {
        // The phone's Instacart source does not drop the stale "5 lbs" from the name; the factory
        // reaches the web's verdict and price on its own.
        let p = item("costco", "Sweet Potatoes, 5 lbs", "10 lb", 8.07, url: "https://www.instacart.com/products/18848374-sweet-potatoes-10-lbs-10-lb?retailerSlug=costco")
        XCTAssertNil(p.sizeConflict)
        XCTAssertEqual(perLb(p) ?? 0, 0.807, accuracy: 0.001)
    }

    func testSizesThatDifferByAStatedCountAreOneUnitAndThePack() {
        let udon = item("costco", "Pulmuone Teriyaki Stir-fry Udon, 30.9 oz", "7.72 oz", 10.81, url: "https://www.instacart.com/products/123231150-pulmuone-teriyaki-stirfry-udon-772-oz-4count-772-oz?retailerSlug=costco")
        XCTAssertEqual(perLb(udon) ?? 0, 5.6, accuracy: 0.01)
        let jif = item("samsclub", "Jif Creamy Peanut Butter, 7g Protein (7% DV), 96 Oz. Twin Pack", "48 oz", 15.21)
        XCTAssertEqual(perLb(jif) ?? 0, 2.535, accuracy: 0.01)
        XCTAssertNotNil(item("woodmans", "BELVITA Breakfast Biscuits, Pumpkin Spice 8.8 oz", "1.76 oz", 3.99).sizeConflict)
        let butter = item("picknsave", "Kroger 4/4 oz Elgin Stick of USDA Grade AA Salted Butter 1 lb", "1 lb", 3.99)
        XCTAssertNil(butter.sizeConflict)
        XCTAssertNil(item("petes", "4-10 Pounds HoKa Turkey Breast", "1 lb", 7.69).sizeConflict)
    }

    // MARK: P12 / P13 — trip-planner amounts

    func testThirtyTwoOuncesOfBrothIsAQuartNotTheCase() {
        let byStore: [String: [Product]] = [
            "costco": [item("costco", "Swanson Chicken Broth, 32 oz, 6-count", "each", 12.43)],
            "aldi": [item("aldi", "Chef's Cupboard Chicken Broth", "32 fl oz", 1.25)],
            "woodmans": [item("woodmans", "Food Club Chicken Broth", "32 oz", 1.79)],
            "meijer": [item("meijer", "Meijer Chicken Broth", "48 oz", 2.49)],
        ]
        for text in ["chicken broth 32 oz", "chicken broth 32 fl oz", "chicken broth 1 qt"] {
            let best = Compare.bestPerStore(query: Compare.searchText(text), results: byStore)
            XCTAssertEqual(best.dim, .volume, text)
            XCTAssertEqual(best.stores.count, 4, text)
            let ref = Compare.referenceAmountDetail(text: text, items: byStore.values.flatMap { $0 }, dim: .volume)
            XCTAssertEqual(ref.base, 32, text)
            XCTAssertTrue(ref.fromText, text)
            XCTAssertEqual((best.stores["costco"]!.perBase * ref.base * 100).rounded() / 100, 2.07, accuracy: 0.01)
        }
        XCTAssertEqual(Compare.referenceAmountDetail(text: "eggs 2 lb", items: [item("a", "Large Eggs", "12 ct", 2.99)], dim: .count).unused, "2 lb")
    }

    /// P13, decided: the costed amount stays a package some store sells (a fixed ladder was measured
    /// and rejected), and the UI prints it. Mirrors the control in test/qa-pricing-round2.test.js.
    func testWithNoSizeTypedTheCostedAmountIsAPackageTheResultsContain() {
        let oj = { (sizes: [Double]) in sizes.enumerated().map { self.item("s\($0.offset)", "Orange Juice", "\($0.element) fl oz", 3.99) } }
        for sizes in [[32, 46, 52, 59, 128], [32, 50, 52, 64, 128], [14.5, 14.5, 15, 28]] as [[Double]] {
            let ref = Compare.referenceAmount(text: "orange juice", items: oj(sizes), dim: .volume)
            XCTAssertTrue(sizes.contains(ref.base), "costed \(ref.base) fl oz, which none of \(sizes) is")
        }
    }

    // MARK: P14 / P15

    func testARollWithAStatedLengthIsNotComparedPerEach() {
        let results: [String: [Product]] = [
            "costco": [item("costco", "Kirkland Signature Aluminum Foil, 18\"W x 500'L", "each", 55.97)],
            "cermak": [item("cermak", "Essential Everyday 25 Sq Ft Aluminum Foil", "1 each", 3.99)],
            "meijer": [item("meijer", "Reynolds Everyday 200 Sq Ft Aluminum Foil", "1 each", 18.99)],
        ]
        let r = Compare.bestPerStore(query: "aluminum foil", results: results, dim: .count)
        XCTAssertTrue(r.stores.isEmpty, "compared per each: \(r.stores.keys.sorted())")
    }

    func testThePlausibilityPoolDoesNotMoveWithTheShowControl() {
        let matches = [item("a", "Apple Cider", "64 fl oz", 4.69), item("b", "Apple Cider", "128 fl oz", 7.45), item("c", "Honeycrisp Apple Cider", "64 fl oz", 5.99),
                       item("d", "Apple Cider", "64 fl oz", 4.99), item("e", "Organic Apple Cider", "12 fl oz", 12.99)]
        let weak = ["Apple Cider Vinegar", "Organic Apple Cider Vinegar", "Apple Cider Vinaigrette", "Hard Apple Cider", "Apple Cider Cocktail"].enumerated().map { item("w\($0.offset)", $0.element, "16 fl oz", 5.99) }
        func verdicts(_ list: [Product]) -> [String: Bool] {
            let judged = Compare.judgePlausibility(Compare.score(query: "apple cider", list), dim: .volume)
            return Dictionary(uniqueKeysWithValues: judged.filter { $0.score >= Match.relevant }.map { ($0.product.key, $0.product.implausible != nil) })
        }
        XCTAssertEqual(verdicts(matches + weak), verdicts(matches))
        XCTAssertEqual(verdicts(matches)[matches[4].key], true)
    }

    // MARK: P1 follow-up — "pk" counts packages

    func testPkCountsPackagesSoATwelvePackIsStillTwelve() {
        // Round 2's first cut read "12pk 12oz" as one 12 oz package (12x too dear).
        XCTAssertEqual(Units.parseSize("12pk 12oz")?.base ?? 0, 144, accuracy: 0.001)
        XCTAssertEqual(item("x", "Cola 12pk 12oz", "", 6.99).base ?? 0, 144, accuracy: 0.001)
        XCTAssertEqual(item("x", "Store Brand Diced Tomatoes, 6 cans, 14.5 oz", "", 5.99).base ?? 0, 87, accuracy: 0.001)
    }

    // MARK: P17a — the owner's Jewel butter: a four-stick pound silently left out

    private func jewelButter() -> [Product] {
        let u = { (slug: String) in "https://www.instacart.com/products/\(slug)?retailerSlug=jewel-osco" }
        return [
            item("jewel", "Lucerne Salted Butter", "4 each", 4.99, category: "Salted Butter", url: u("3142199-lucerne-butter-sweet-cream-salted-16-oz"), basis: .online),
            item("jewel", "Lucerne Unsalted Butter", "4 ct", 4.99, category: "Unsalted Butter", url: u("18301981-lucerne-butter-sweet-cream-unsalted-4-ea"), basis: .online),
            item("jewel", "Land O Lakes Butter, Salted", "1 lb", 7.99, category: "Salted Butter", url: u("2721623-land-o-lakes-butter-salted-4-ea"), basis: .online),
            item("jewel", "Challenge Butter, Salted", "16 oz", 7.99, category: "Salted Butter", url: u("30711-challenge-butter-salted-16-oz"), basis: .online),
            item("jewel", "Kerrygold Butter, Pure Irish", "8 oz", 7.99, category: "Salted Butter", url: u("45102-kerrygold-pure-irish-butter-8-oz"), basis: .online),
        ]
    }

    func testJewelsFourStickPoundOfLucerneIsPricedPerPoundAndIsJewelsBest() {
        let products = jewelButter()
        XCTAssertEqual(products[0].base ?? 0, 16, accuracy: 0.001, products[0].size)
        XCTAssertEqual(products[0].size, "4 sticks · 16 oz")
        XCTAssertEqual(products[0].sizeSource, "derived")
        let r = Compare.bestPerStore(query: "butter", results: ["jewel": products])
        XCTAssertEqual(r.stores["jewel"]?.product.name, "Lucerne Salted Butter")
        XCTAssertEqual((r.stores["jewel"]?.perBase ?? 0) * 16, 4.99, accuracy: 0.001)
    }

    func testACheaperItemTheComparisonCannotIncludeIsNamedNotHidden() {
        let products = Array(jewelButter().dropFirst())
        let r = Compare.bestPerStore(query: "butter", results: ["jewel": products])
        XCTAssertEqual(r.stores["jewel"]?.product.price, 7.99)
        let ex = Compare.excludedCheaper(query: "butter", results: ["jewel": products], dim: r.dim, stores: r.stores)
        XCTAssertEqual(ex["jewel"]?.product.name, "Lucerne Unsalted Butter")
        XCTAssertEqual(ex["jewel"]?.reason, "count")
        XCTAssertEqual(ex["jewel"]?.hasBest, true)
        // A store with nothing comparable names its cheapest match too.
        let sams = ["aldi": [item("aldi", "Countryside Creamery Butter", "16 oz", 3.49)],
                    "samsclub": [item("samsclub", "Member’s Mark Unsalted Sweet Cream Butter", "4 ct", 12.21, category: "Unsalted Butter")]]
        let r2 = Compare.bestPerStore(query: "butter", results: sams)
        XCTAssertEqual(Compare.excludedCheaper(query: "butter", results: sams, dim: r2.dim, stores: r2.stores)["samsclub"]?.hasBest, false)
    }

    func testAStickCountSettlesNothingWithoutAWeightThatFitsQuarterPoundSticks() {
        let b = { (name: String, size: String, slug: String) in self.item("x", name, size, 9.99, category: "Salted Butter", url: "https://www.instacart.com/products/1-\(slug)") }
        XCTAssertEqual(b("Land O Lakes Butter, Salted, 2-Pack", "4 ct", "land-o-lakes-salted-butter-1-lb").dim, .count)
        XCTAssertEqual(b("Member’s Mark Unsalted Sweet Cream Butter", "4 ct", "member-s-mark-unsalted-sweet-cream-butter-4-ct").dim, .count)
        XCTAssertEqual(b("Land O Lakes Butter, Salted, Half Sticks", "8 ct", "land-o-lakes-butter-salted-half-sticks-1-lb").dim, .count)
        XCTAssertEqual(b("Kerrygold Unsalted Pure Irish Butter", "4 ct", "kerrygold-unsalted-irish-butter-sticks-4-oz").base ?? 0, 16, accuracy: 0.001)
        XCTAssertEqual(b("Plugra Premium European Style Salted Butter", "2 each", "plugra-butter-salted-extra-creamy-8-0-oz").base ?? 0, 8, accuracy: 0.001)
        XCTAssertEqual(b("Store Brand Unsalted Butter", "4 ct", "store-brand-unsalted-butter-4-x-4-oz-1-lb").base ?? 0, 16, accuracy: 0.001)
        XCTAssertEqual(b("Store Brand Salted Butter", "4 ct", "store-brand-salted-butter-16-oz-2-lb").dim, .count)
        XCTAssertEqual(item("x", "I Can't Believe It's Not Butter Extra Creamy Sticks", "4 each", 6.79, category: "Non-Butter Oil Spreads", url: "https://www.instacart.com/products/1-sticks-16-oz").dim, .count)
    }

    func testAPackagePriceIsNeverCalledCheaperThanAPricePerPound() {
        let results = ["festivalfoods": [
            item("festivalfoods", "Honeysuckle White Fresh Whole Turkey", "per lb", 3.49, soldBy: .lb, category: "Whole Turkey"),
            item("festivalfoods", "Butterball Frozen Turkey", "1 each", 2.89, category: "Frozen Whole Turkey"),
        ]]
        let r = Compare.bestPerStore(query: "whole turkey", results: results, dim: .weight)
        XCTAssertEqual(r.stores["festivalfoods"]?.product.soldBy, .lb)
        XCTAssertNil(Compare.excludedCheaper(query: "whole turkey", results: results, dim: r.dim, stores: r.stores)["festivalfoods"])
    }

    // MARK: P17c — a "16 oz" carton of heavy cream is 16 fl oz

    func testHeavyCreamStatedInOuncesComparesByVolume() {
        let results: [String: [Product]] = [
            "costco": [item("costco", "Maola 40% Heavy Whipping Cream, 32 oz", "32 oz", 4.84, category: "Heavy Whipping Cream")],
            "wholefoods": [item("wholefoods", "Organic Heavy Cream", "16 OZ", 4.09), item("wholefoods", "Organic Grassfed Heavy Whipping Cream", "1 PT", 6.79)],
            "jewel": [item("jewel", "Lucerne Whipping Cream, Heavy", "32 fl oz", 7.99, category: "Heavy Whipping Cream", basis: .online)],
            "tonys": [item("tonys", "Best Choice Heavy Whipping Cream 16 oz", "16 oz", 3.29, category: "Heavy Whipping Cream")],
        ]
        let r = Compare.bestPerStore(query: "heavy cream", results: results)
        XCTAssertEqual(r.dim, .volume)
        XCTAssertEqual((r.stores["costco"]?.perBase ?? 0) * 128, 19.36, accuracy: 0.01)
        XCTAssertEqual(r.stores["wholefoods"]?.product.name, "Organic Heavy Cream")
        XCTAssertEqual(ranked(r.stores).first?.0, "costco")
        XCTAssertEqual(item("x", "Reddi-wip Whipped Light Cream, Original", "7 oz", 3.49, category: "Whipped Cream").dim, .weight)
        XCTAssertEqual(item("x", "Nestle Table Cream, Media Crema", "7.6 oz", 2.29, category: "Other Creams").dim, .weight)
    }

    // MARK: parity — a tie in the dominant dimension resolves the same way on both platforms

    func testATieBetweenDimensionsGoesWeightThenVolumeThenCount() {
        // One item per dimension: equal votes. shared/compare.js resolves the tie to weight; the phone
        // used Dictionary.max, whose order among equal values is hash order, seeded per launch.
        let items = [item("a", "Countryside Creamery Butter", "16 oz", 3.49),
                     item("b", "Whole Milk", "1 gal", 3.99),
                     item("c", "Large Eggs", "12 ct", 2.99)]
        XCTAssertEqual(Compare.dominantDim(items), .weight)
        XCTAssertEqual(Compare.dominantDim(Array(items.dropFirst())), .volume)
    }

    // MARK: P17b — an Instacart price inside Instacart's measured markup is "about the same"

    func testAStoreInsideInstacartsMeasuredMarkupIsAboutTheSameNotBeaten() {
        // Same week: Primo Taglio turkey breast $11.99/lb on Jewel's Instacart, $9.99 on Jewel's shelf.
        let results: [String: [Product]] = [
            "woodmans": [item("woodmans", "Primo Taglio Turkey Breast", "per lb", 10.09, soldBy: .lb)],
            "jewel": [item("jewel", "Primo Taglio Oven Roasted Turkey Breast", "per lb", 11.99, soldBy: .lb, basis: .online)],
        ]
        let r = Compare.bestPerStore(query: "turkey breast", results: results)
        XCTAssertEqual(Compare.standings(r.stores).map { "\($0.storeId):\($0.verdict)" }, ["woodmans:best", "jewel:close"])
        let c = claim(r.stores)
        XCTAssertEqual(c?.kind, "close")
        XCTAssertEqual(c?.text, "About the same as {store} (online price), so no saving is claimed")
    }

    func testTwoOnlineListingsCompareExactlyAsListings() {
        let a = item("jewel", "Lucerne Salted Butter", "16 oz", 4.99, basis: .online)
        let b = item("marianos", "Kroger Salted Butter", "16 oz", 5.49, basis: .online)
        let c = Compare.savingsClaim(best: a, perBase: 4.99 / 16, est: false, runnerUp: b, perBase: 5.49 / 16, est: false)
        XCTAssertEqual(c?.kind, "exact")
        XCTAssertEqual(c?.text, "{amount}/{unit} (9%) less than the next-best store, {store} (both online prices)")
    }

    // MARK: P17d — Instacart's own pack line

    private func packItem(_ name: String, _ size: String, _ slug: String, _ price: Double, _ pu: String) -> Product {
        ProductFactory.make(ProductInput(storeId: "meijer", id: slug, name: name, sizeText: size, price: price,
                                         url: URL(string: "https://www.instacart.com/products/\(slug)"), priceBasis: .online, packText: pu))!
    }

    func testAFourCanValuePackIsPricedAsFourCans() {
        let p = packItem("Del Monte Green Beans, Cut, 4 Can, Value Pack", "14.5 oz", "22363049-del-monte-green-beans-no-salt-added-cut-value-pack-14-5-oz", 6.99, "4 x 14.5 oz")
        XCTAssertEqual(p.base ?? 0, 58, accuracy: 0.001, p.size)
        XCTAssertEqual(perLb(p) ?? 0, 1.93, accuracy: 0.01)
        XCTAssertNil(p.sizeConflict)
    }

    func testAPackTheListingNeverNamesIsNeitherMultipliedNorPricedFromOneCan() {
        let soup = packItem("Campbell's Cream of Mushroom Soup", "10.5 oz", "17315355-campbell-s-cream-of-mushroom-soup-10-5-oz", 7.99, "4 x 10.5 oz")
        XCTAssertNil(perLb(soup), "still published at \(perLb(soup) ?? 0)/lb")
        XCTAssertNotNil(soup.sizeConflict)
        let cukes = packItem("Farmer's Market Mini Cucumbers", "14 oz", "26061852-farmer-s-market-mini-cucumber-6-ct", 3.99, "6 x 14 oz")
        XCTAssertNotEqual(cukes.base, 84)
        XCTAssertNil(perLb(cukes))
    }

    // MARK: P14 — rolls of unknown length are not compared per each

    func testHardwareThatSaysAluminumFoilIsNotAFoilMatch() {
        let results: [String: [Product]] = [
            "woodmans": [item("woodmans", "Simply Done Foil Sheets, Aluminum, Pre-Cut", "50 ct", 2.69)],
            "meijer": [item("meijer", "Waxman softtouch 4\" x 8' Flexible Aluminum Foil Duct", "1 each", 11.99, basis: .online),
                       item("meijer", "Duck 1.88\" HVAC Metal Repair Silver Aluminum Foil Tape", "1 each", 9.99, basis: .online)],
        ]
        XCTAssertEqual(Compare.bestPerStore(query: "aluminum foil", results: results, dim: .count).stores.keys.sorted(), ["woodmans"])
    }

    func testTwoRollsWhoseLengthsNobodyStatesAreNotComparedPerEach() {
        let results: [String: [Product]] = [
            "marianos": [item("marianos", "Kroger® Aluminum Pre-cut Foil Sheets", "50 ct", 4.99, basis: .online)],
            "jewel": [item("jewel", "Signature SELECT Aluminum Foil", "1 each", 2.99, basis: .online)],
            "aldi": [item("aldi", "Boulder Heavy Duty Aluminum Foil", "1 each", 3.95)],
        ]
        let r = Compare.bestPerStore(query: "aluminum foil", results: results, dim: .count)
        XCTAssertEqual(r.stores.keys.sorted(), ["marianos"])
        XCTAssertNotNil(item("x", "Handi-foil Foilware", "1 each", 1.69).unitPrice(.count))
    }

    // DEFECT P22 (round-3 price check): Piggly Wiggly's "10 lb" of ground chuck at $7.99 whose own
    // unit line reads "$0.50/oz". Mirrors test/qa-pricing-round2.test.js.
    private func listed(_ name: String, _ size: String, _ price: Double, _ line: String) -> Product {
        ProductFactory.make(ProductInput(storeId: "piggly", id: name, name: name, sizeText: size, price: price,
                                         listedUnit: ProductFactory.listedUnit(line)))!
    }

    func testP22UnitLineContradictingTheSizeIsAConflict() {
        let beef = listed("Certified Angus Beef 80% Ground Chuck Beef", "10 lb", 7.99, "$0.50/oz")
        XCTAssertNotNil(beef.sizeConflict)
        XCTAssertNil(beef.unitPrice(.weight))
        XCTAssertNotNil(listed("Cady Creek Farms Sharp Cheddar Cheese", "5 lb", 8.99, "$0.56/oz").sizeConflict)
    }

    func testP22AgreeingOrRoundedUnitLineChangesNothing() {
        XCTAssertNil(listed("Certified Angus Beef 80% Lean Ground Beef Chuck", "3 lb", 5.99, "$0.12/oz").sizeConflict)
        XCTAssertNil(listed("Store Brand Salt", "26 oz", 0.89, "$0.03/oz").sizeConflict)
        XCTAssertNil(listed("Don Simon Orange Juice, 33.81 fl oz, 4-count", "33.81 fl oz", 3.69, "$0.92 each").sizeConflict)
        XCTAssertNil(listed("Sargento Natural 4 State Cheddar Shredded Cheese", "7.5 oz", 4.49, "$0.07/oz").sizeConflict)
        XCTAssertNil(listed("Uncle Matt's Organic Orange Juice, 52 oz, 2-count", "52 fl oz", 15.91, "$0.31/fl oz").sizeConflict)
        // As Mariano's sent them: sale prices, no regular price, lines computed from the regular price.
        XCTAssertNil(listed("Land O Lakes Butter, Salted", "1 lb", 3.99, "$0.50/oz").sizeConflict)
        XCTAssertNil(listed("Butternut Large White Bread", "20 oz", 2.99, "$0.25/oz").sizeConflict)
        XCTAssertNotNil(listed("80% Ground Beef", "3 lb", 4.99, "$0.31/oz").sizeConflict, "Piggly Wiggly's per-pound meat")
    }
}
