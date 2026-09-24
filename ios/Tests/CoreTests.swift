import XCTest
@testable import Cartworth

final class UnitsTests: XCTestCase {
    func size(_ s: String) -> ParsedSize? { Units.parseSize(s) }

    func testSimpleSizes() {
        XCTAssertEqual(size("1 gal")?.base, 128)
        XCTAssertEqual(size("0.5 gal")?.base, 64)
        XCTAssertEqual(size("1/2 gal")?.base, 64)
        XCTAssertEqual(size("64 fl oz")?.dim, .volume)
        XCTAssertEqual(size("59 FZ")?.base, 59)
        XCTAssertEqual(size("1 GL")?.base, 128)
        XCTAssertEqual(size("16 oz")?.dim, .weight)
        XCTAssertEqual(size("2.25 lb")?.base, 36)
        XCTAssertEqual(size("500 g")?.base ?? 0, 17.637, accuracy: 0.01)
        XCTAssertEqual(size("12 ct")?.dim, .count)
        XCTAssertEqual(size("1 dozen")?.base, 12)
        XCTAssertEqual(size("1 Each")?.base, 1)
        XCTAssertEqual(size("750 ml")?.base ?? 0, 25.36, accuracy: 0.01)
    }

    func testPerWeightAndMultipacks() {
        XCTAssertEqual(size("per lb")?.perWeight, true)
        XCTAssertEqual(size("per pound")?.perWeight, true)
        let m = size("12 x 12 fl oz")
        XCTAssertEqual(m?.base, 144)
        XCTAssertEqual(m?.count, 12)
        XCTAssertEqual(size("12 pk / 12 fl oz")?.base, 144)
        // UPDATED with the units.js fixes: a dash-joined pair of numbers followed by a unit is now
        // always a range, so shared/units.js reads "24 - 16.9 fl oz" as a single 24 fl oz package,
        // not 24 × 16.9. Verified by running the JS. This test used to assert 405.6, which is no
        // longer what the website computes.
        XCTAssertEqual(size("24 - 16.9 fl oz")?.base ?? 0, 24, accuracy: 0.01)
        XCTAssertEqual(size("24 - 16.9 fl oz")?.count, 1)
    }

    func testRangesAreNotMultipacks() {
        let r = size("10-15 oz.")
        XCTAssertEqual(r?.base, 10)
        XCTAssertEqual(r?.range, true)
        XCTAssertEqual(size("12 Double Rolls")?.base, 12)
    }

    func testLiquidCoercion() {
        let beer = Units.coerceLiquid(size("12 pk., 12 oz. Bottles or Cans"), name: "Beer 12 pk., 12 oz. Bottles or Cans")
        XCTAssertEqual(beer?.dim, .volume)
        let yogurt = Units.coerceLiquid(size("5.3 Oz"), name: "Plain Whole Milk Greek Yogurt")
        XCTAssertEqual(yogurt?.dim, .weight)
        let beef = Units.coerceLiquid(size("16 oz"), name: "Ground Beef")
        XCTAssertEqual(beef?.dim, .weight)
        // The Christmas run: a 64 oz carton of eggnog was compared per pound, not per gallon.
        XCTAssertEqual(Units.coerceLiquid(size("64 oz"), name: "Southern Comfort Traditional Eggnog")?.dim, .volume)
        XCTAssertEqual(Units.coerceLiquid(size("32 oz"), name: "Borden Egg Nog")?.dim, .volume)
        XCTAssertEqual(Units.coerceLiquid(size("32 oz"), name: "Dean's Cultured Lowfat Buttermilk")?.dim, .volume)
        XCTAssertEqual(Units.coerceLiquid(size("7 oz"), name: "Eggnog Cookies")?.dim, .weight)
    }

    func testSizeFromName() {
        XCTAssertEqual(Units.sizeFromName("Milk 2 %, 64 FZ")?.base, 64)
        XCTAssertEqual(Units.sizeFromName("Organic Lowfat 1% Milk, 1 GL")?.base, 128)
        XCTAssertNil(Units.sizeFromName("Friendly Farms Whole Milk"))
    }

    func testMoneyFormatting() {
        XCTAssertEqual(Money.unit(2.49 / 128, .gal), "$2.49")
        XCTAssertEqual(Money.short(0.23), "23¢")
        XCTAssertEqual(Money.full(3), "$3.00")
    }
}

final class MatchTests: XCTestCase {
    func r(_ q: String, _ name: String) -> Double { Match.relevance(query: q, name: name) }

    func testMilk() {
        XCTAssertGreaterThan(r("milk", "Friendly Farms Whole Milk"), Match.relevant)
        XCTAssertGreaterThan(r("milk", "Lactose Free 2% Reduced Fat Milk"), Match.relevant)
        XCTAssertLessThan(r("milk", "Milk Chocolate Bar"), Match.relevant)
        XCTAssertLessThan(r("milk", "Almond Milk Unsweetened"), Match.relevant)
        XCTAssertLessThan(r("milk", "Chocolate Milk, 64 FZ"), Match.relevant)
        XCTAssertLessThan(r("milk", "Whole Milk Ricotta Cheese"), Match.relevant)
        XCTAssertLessThan(r("whole milk", "Greek Yogurt Honey Made with Whole Milk"), Match.relevant)
    }

    func testEggsBananasChicken() {
        XCTAssertGreaterThan(r("eggs", "Eggland's Best Classic Large White Eggs, 12 count"), Match.relevant)
        XCTAssertLessThan(r("eggs", "Egg Noodles"), Match.relevant)
        XCTAssertGreaterThan(r("bananas", "Organic Bananas"), Match.relevant)
        XCTAssertLessThan(r("bananas", "Banana Bread Mix"), Match.relevant)
        XCTAssertGreaterThan(r("chicken breast", "Perdue Fresh Boneless Skinless Chicken Breasts"), Match.relevant)
        XCTAssertLessThan(r("chicken breast", "Chicken Broth"), Match.relevant)
        XCTAssertGreaterThan(r("ground beef", "Ibp Trusted Excellence GROUND CHUCK 80%"), Match.relevant)
        XCTAssertGreaterThan(r("tuna", "StarKist Chunk Light Tuna in Water"), Match.relevant)
    }

    func testIncludeExclude() {
        XCTAssertEqual(Match.relevance(query: "milk", name: "Friendly Farms 2% Milk", include: ["whole"]), 0)
        XCTAssertEqual(Match.relevance(query: "milk", name: "Organic Whole Milk", exclude: ["organic"]), 0)
    }

    func testRefineChips() {
        let names: [(name: String, brand: String?)] = [
            ("Kemps Whole Milk", "Kemps"), ("Prairie Farms Whole Milk", "Prairie Farms"), ("Lactose Free Whole Milk", nil),
            ("2% Reduced Fat Milk", nil), ("Lactose Free 2% Milk", nil),
        ]
        let chips = Match.refineChips(query: "milk", names: names).map(\.chip)
        XCTAssertTrue(chips.contains("whole"))
        XCTAssertTrue(chips.contains("lactose free"))
        XCTAssertFalse(chips.contains("kemps"))
    }
}

final class DealTests: XCTestCase {
    func testParse() {
        XCTAssertEqual(DealParser.parse("2/$5")?.kind, .multi)
        XCTAssertEqual(DealParser.parse("2/$5")?.each, 2.5)
        XCTAssertEqual(DealParser.parse("Buy 5 for $5")?.each, 1)
        XCTAssertEqual(DealParser.parse("BUY 1 GET 1 FREE")?.kind, .bogo)
        XCTAssertEqual(DealParser.parse("Buy 2, get 1 free")?.kind, .bxgy)
        XCTAssertEqual(DealParser.parse("25% off")?.pct, 25)
        XCTAssertEqual(DealParser.parse("for U")?.needsCoupon, true)
        XCTAssertEqual(DealParser.parse("LIMIT 2 MUST BUY 2")?.mustBuy, 2)
        XCTAssertNil(DealParser.parse("Fresh and tasty"))
    }

    func testCategories() {
        XCTAssertEqual(GroceryCategory.classify(name: "Honeycrisp Apples"), .produce)
        XCTAssertEqual(GroceryCategory.classify(name: "Boneless Skinless Chicken Breast"), .meat)
        XCTAssertEqual(GroceryCategory.classify(name: "Leinenkugel's 12 pk"), .alcohol)
        XCTAssertEqual(GroceryCategory.classify(name: "Tide Pods"), .household)
    }

    func testFlippCouponIsNotAPrice() {
        let item = FlippSource.FlyerItem(id: 1, flyerId: 2, name: "(1) Snicker's, Milky Way, Twix", brand: "", price: "0.75", discount: 50, image: nil, validFrom: nil, validTo: nil)
        let det = FlippSource.Detail(description: nil, pre: nil, priceText: nil, post: nil, story: "75¢ OFF (1)", original: nil, current: 0.75, disclaimer: nil, dollarsOff: 0.75, percentOff: 50, externalCategory: nil)
        let d = FlippSource.deal(item: item, detail: det, retailerId: "woodmans", merchant: "Woodman's")
        XCTAssertNil(d.price)
        XCTAssertTrue(d.coupon)
        XCTAssertEqual(d.priceText, "75¢ off")
        XCTAssertEqual(d.name, "Snicker's, Milky Way, Twix")
    }

    func testFlippMultiBuy() {
        let item = FlippSource.FlyerItem(id: 1, flyerId: 2, name: "Dutch Farms Stuffed Chicken Breasts", brand: "", price: "3.0", discount: nil, image: nil, validFrom: nil, validTo: nil)
        let det = FlippSource.Detail(description: "5 oz., Frozen", pre: "2/", priceText: nil, post: nil, story: nil, original: nil, current: 3, disclaimer: nil, dollarsOff: nil, percentOff: nil, externalCategory: nil)
        let d = FlippSource.deal(item: item, detail: det, retailerId: "jewel", merchant: "Jewel-Osco")
        XCTAssertEqual(d.priceText, "2 for $3.00")
        XCTAssertEqual(d.each, 1.5)
    }
}

final class ProductTests: XCTestCase {
    func testUnitPricesAndProduce() {
        let banana = ProductFactory.make(ProductInput(storeId: "tj", id: "1", name: "Bananas", sizeText: "1 Each", price: 0.23))!
        XCTAssertEqual(banana.unitPrice(.count)?.perBase ?? 0, 0.23, accuracy: 0.0001)
        XCTAssertEqual(banana.unitPrice(.weight)?.est, true)
        let perLb = ProductFactory.make(ProductInput(storeId: "wfm", id: "2", name: "Banana", sizeText: "per lb", price: 0.69, soldBy: .lb))!
        XCTAssertEqual((perLb.unitPrice(.weight)?.perBase ?? 0) * 16, 0.69, accuracy: 0.0001)
    }

    /// An egg carton listed by weight is priced by weight, exactly as src/normalize.js does it.
    /// This test used to demand a per-egg price read out of the product NAME, which the web never
    /// computes; that made the app compare "cheapest eggs" in a different dimension from the site.
    func testEggCartonIsPricedTheWayTheWebPricesIt() {
        let eggs = ProductFactory.make(ProductInput(storeId: "aldi", id: "3", name: "Goldhen Free Range Large Grade A Brown Eggs - 12 Count", sizeText: "24 oz", price: 3.49))!
        XCTAssertEqual(eggs.dim, .weight)
        XCTAssertEqual(eggs.unitPrice(.weight)?.perBase ?? 0, 3.49 / 24, accuracy: 1e-9)
        XCTAssertNil(eggs.unitPrice(.count))
        let dutch = ProductFactory.make(ProductInput(storeId: "wood", id: "4", name: "Dutch Farms 18 Grade A Large Eggs", sizeText: "36 oz", price: 1.99))!
        XCTAssertEqual(dutch.dim, .weight)
        XCTAssertEqual(dutch.unitPrice(.weight)?.perBase ?? 0, 1.99 / 36, accuracy: 1e-9)
        XCTAssertNil(dutch.unitPrice(.count))
        // A carton that really does say its size in count still gets a count price, from the SIZE.
        let bySize = ProductFactory.make(ProductInput(storeId: "a", id: "5", name: "Large Grade A Eggs", sizeText: "12 ct", price: 3.49))!
        XCTAssertEqual(bySize.dim, .count)
        XCTAssertEqual(bySize.unitPrice(.count)?.perBase ?? 0, 3.49 / 12, accuracy: 1e-9)
    }

    func testSaleAndMember() {
        let p = ProductFactory.make(ProductInput(storeId: "wfm", id: "5", name: "Yogurt, 24 OZ", sizeText: "24 OZ", price: 5.32, regularPrice: 6.79, memberPrice: 4.79, memberLabel: "Prime"))!
        XCTAssertTrue(p.onSale)
        XCTAssertEqual(p.pctOff, 22)
        XCTAssertEqual(Compare.effectivePrice(p, PricePrefs(prime: true)), 4.79)
        XCTAssertEqual(Compare.effectivePrice(p, PricePrefs(prime: false)), 5.32)
    }

    func testSearchText() {
        XCTAssertEqual(Compare.searchText("milk 1 gal"), "milk")
        XCTAssertEqual(Compare.searchText("chicken breast 3 lb"), "chicken breast")
    }
}

// MARK: - Bundled nationwide stats
//
// The stats file is decoded with `try?`, so a model/data mismatch shows up as "no facts ever
// appear on the loading screen" rather than a crash or a build error. These tests make that
// failure loud. If one breaks, the sampler's output shape changed: fix NationalStatsFile to match
// scripts/sampler/aggregate.js rather than deleting the test.
final class NationalStatsTests: XCTestCase {
    private func loadFile() throws -> NationalStatsFile {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "stats", withExtension: "json")
            ?? Bundle.main.url(forResource: "stats", withExtension: "json"),
            "stats.json is not in the app bundle — check project.yml resources")
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(NationalStatsFile.self, from: data)
    }

    func testBundledStatsDecode() throws {
        let file = try loadFile()
        XCTAssertFalse(file.items.isEmpty, "stats.json decoded but carries no items")
        XCTAssertFalse(file.facts.isEmpty, "stats.json decoded but carries no facts, so loading screens show only generic tips")
    }

    func testEveryFactIsTraceable() throws {
        let file = try loadFile()
        for fact in file.facts {
            XCTAssertFalse(fact.text.trimmingCharacters(in: .whitespaces).isEmpty, "fact \(fact.id) has no text")
            // A price claim with no as-of date can outlive its data and become a false statement.
            XCTAssertNotNil(fact.asOf, "fact \(fact.id) has no asOf date")
        }
    }

    func testPriceInvariantsHold() throws {
        let file = try loadFile()
        for item in file.items {
            if let n = item.national, let lo = n.min, let mid = n.median, let hi = n.max {
                XCTAssertLessThanOrEqual(lo, mid, "\(item.id): national min above median")
                XCTAssertLessThanOrEqual(mid, hi, "\(item.id): national median above max")
            }
            for (state, s) in item.states ?? [:] {
                guard let lo = s.min, let mid = s.median, let hi = s.max else { continue }
                XCTAssertLessThanOrEqual(lo, mid, "\(item.id)/\(state): min above median — a 'cheapest' higher than the typical price is indefensible")
                XCTAssertLessThanOrEqual(mid, hi, "\(item.id)/\(state): median above max")
            }
        }
    }

    func testFactsAreNotShownAsMoreCertainThanTheyAre() throws {
        let file = try loadFile()
        for fact in file.facts where fact.confidence == "low" {
            // A low-confidence figure must not be phrased as a nationwide superlative.
            let t = fact.text.lowercased()
            let claimsNationwide = t.contains("in the country") || t.contains("nationwide") || t.contains("in america")
            XCTAssertFalse(claimsNationwide, "low-confidence fact \(fact.id) claims nationwide truth: \(fact.text)")
        }
    }
}

// ============================================================================
// Web-parity suite (added by QA).
//
// The product's claim is that the number is trustworthy, so the same query must
// give the same answer on cartworth.com and in the app. These tests assert the
// WEB behaviour, taken from /shared/units.js, match.js, deals.js and
// /src/normalize.js by RUNNING that JS — not by reading it.
//
// Every failure here is a live divergence between the two implementations.
// They go green when the Swift port is brought back in line with the web.
//
// REFERENCE IMPLEMENTATION: basket/shared/units.js, basket/shared/match.js,
// basket/shared/deals.js, plus basket/src/normalize.js and
// basket/src/adapters/flipp.js. When the two sides disagree, the JS wins and
// the Swift is changed to match. The only exception is a JS behaviour that is
// plainly a bug: then fix BOTH sides in the same change and keep
// `BASKET_DATA_DIR=/tmp/cw-port node --test 'test/*.test.js'` green. Never
// change one side alone to make a test pass.
// ============================================================================

final class WebParityTests: XCTestCase {

    // MARK: Match.normalize — apostrophes

    /// web normalize() maps `'` to a SPACE (it is simply not in the `[^a-z0-9%.\s-]` keep-set).
    /// Match.normalize deletes it instead, welding the halves into one token, which then gets
    /// mangled further by singular() ("joes" -> "jo", because it ends in "oes").
    func testApostropheNormalizationMatchesWeb() {
        XCTAssertEqual(Match.normalize("Trader Joe's Whole Milk"), "trader joe s whole milk")
        XCTAssertEqual(Match.tokens("Trader Joe's Whole Milk"), ["trader", "joe", "s", "whole", "milk"])
        XCTAssertEqual(Match.tokens("Land O'Lakes Salted Butter"), ["land", "o", "lake", "salted", "butter"])
        XCTAssertEqual(Match.normalize("Land O\u{2019}Lakes"), "land o lakes")
    }

    /// The token damage moves real products from "relevant" to "filtered out". Only products
    /// scoring >= Match.relevant feed the "cheapest per store" summary, so on the web these two
    /// win the comparison and in the app they are dropped from it entirely.
    func testApostropheBrandsStayRelevantLikeWeb() {
        let tj = Match.relevance(query: "trader joe milk", name: "Trader Joe's Whole Milk")
        XCTAssertEqual(tj, 0.8, accuracy: 0.0005, "web scores 0.80; app scores \(tj)")

        let lol = Match.relevance(query: "land o lakes butter", name: "Land O'Lakes Salted Butter")
        XCTAssertEqual(lol, 0.8, accuracy: 0.0005, "web scores 0.80; app scores \(lol)")
    }

    // MARK: ProductFactory — invented egg count

    /// ProductFactory.explicitCount has no counterpart anywhere in the web code (grep across
    /// src/ and shared/ finds nothing). It invents a per-egg unit price the website never
    /// computes, so "cheapest eggs" is decided on a different dimension in each client.
    func testEggCartonUnitPricesMatchWeb() {
        let eggs = ProductFactory.make(ProductInput(
            storeId: "aldi", id: "3",
            name: "Goldhen Free Range Large Grade A Brown Eggs - 12 Count",
            sizeText: "24 oz", price: 3.49))!
        // web: { dim: 'weight', unit: { weight: { perBase: 0.1454166…, est: false } } }
        XCTAssertEqual(eggs.dim, .weight)
        XCTAssertEqual(eggs.unitPrice(.weight)?.perBase ?? 0, 3.49 / 24, accuracy: 1e-9)
        XCTAssertNil(eggs.unitPrice(.count), "web computes no count unit price for this product")
    }

    /// With no sizeText the web produces a product with NO unit prices and dim == null.
    /// The app produces a count unit price and dim == .count, so the two clients disagree about
    /// which dimension the whole result set is compared in.
    func testEggCartonWithoutSizeTextMatchesWeb() {
        let dutch = ProductFactory.make(ProductInput(
            storeId: "wood", id: "4",
            name: "Dutch Farms 18 Grade A Large Eggs", price: 1.99))!
        // web: { dim: null, unit: {}, base: null }
        XCTAssertNil(dutch.dim, "web leaves dim null here")
        XCTAssertTrue(dutch.unit.isEmpty, "web produces no unit prices here; app has \(dutch.unit)")
    }

    // MARK: DealParser — branch order

    /// web tests /save \$N/ BEFORE /buy N,? save \$M/, so "Buy 3, Save $5" is a plain per-unit
    /// saving with no qty — which also makes `each` fall out as max(0, base - save).
    /// The app tests buy-save first, gets qty = 3, and leaves `each` nil.
    func testBuyNSaveMatchesWebBranchOrder() {
        let d = DealParser.parse("Buy 3, Save $5", basePrice: 4)!
        // web, after the "never claim an item is free" fix: { kind:'save', save:5 } with NO each,
        // because 4 - 5 is not a positive price. This assertion used to demand each == 0.
        XCTAssertEqual(d.kind, .save)
        XCTAssertNil(d.qty, "web leaves qty undefined here; app has \(String(describing: d.qty))")
        XCTAssertNil(d.each, "web publishes no sale price when the save exceeds the price")
        XCTAssertEqual(d.label, "Save $5")
    }

    /// web's multi-buy branch is an `else if` whose BODY is guarded by 1 < qty <= 20, so a match
    /// with an out-of-range qty consumes the if/else chain and the result is null. The app folds
    /// the range check into the pattern guard, so it falls through to the % and save branches and
    /// reports a discount the website does not.
    func testMultiBuyOutOfRangeMatchesWeb() {
        XCTAssertNil(DealParser.parse("1 for $3, 25% off"),
                     "web returns null; app returns \(String(describing: DealParser.parse("1 for $3, 25% off")?.kind))")
        XCTAssertNil(DealParser.parse("50 for $100 - 30% off"),
                     "web returns null; app returns \(String(describing: DealParser.parse("50 for $100 - 30% off")?.kind))")
    }

    /// web's dealLabel interpolates d.pct verbatim; DealTerms.label rounds it to an Int.
    func testFractionalPercentLabelMatchesWeb() {
        let d = DealParser.parse("12.5% off")!
        XCTAssertEqual(d.pct, 12.5)
        XCTAssertEqual(d.label, "12.5% off", "app renders \(d.label)")
    }

    // MARK: category keywords dropped in the port

    func testCategoryRulesMatchWeb() {
        // web RULES['Deli & Prepared'] contains `soup bar|hot bar`; the Swift port dropped it,
        // so this falls through to Pantry's `soup`.
        XCTAssertEqual(GroceryCategory.classify(name: "Hot Soup Bar"), .deli)
        // web RULES['Household'] contains `kingsford lighter`; the Swift port dropped it.
        XCTAssertEqual(GroceryCategory.classify(name: "Kingsford Lighter Fluid"), .household)
        // web RULES['Snacks & Candy'] contains `pirate's booty`; the Swift port dropped it.
        XCTAssertEqual(GroceryCategory.classify(name: "Pirate's Booty"), .snacks)
    }

    // MARK: tidyBrand

    /// web tidies brand per word-character run (/\w[\w']*/g) and keeps runs of <= 2 letters
    /// uppercase. The Swift port splits on spaces only and uses <= 3, so hyphenated and
    /// ampersand brands are lower-cased and three-letter brands are not.
    func testTidyBrandMatchesWeb() {
        XCTAssertEqual(ProductFactory.tidyBrand("H-E-B"), "H-E-B")
        XCTAssertEqual(ProductFactory.tidyBrand("IGA"), "Iga")
        XCTAssertEqual(ProductFactory.tidyBrand("A&W"), "A&W")
        // These two already agree, and pin the threshold that differs.
        XCTAssertEqual(ProductFactory.tidyBrand("ALDI"), "Aldi")
        XCTAssertEqual(ProductFactory.tidyBrand("TJ"), "TJ")
    }

    // MARK: refineChips numeric filter

    /// web skips a chip only when it matches /^\d+(\.\d+)?$/. The Swift port uses
    /// `Double(w) != nil`, which also swallows "nan", "inf", "infinity" and "1e3".
    /// NAN is a real infant-formula brand, so the app silently drops that refinement chip.
    func testRefineChipsNumericFilterMatchesWeb() {
        let names: [(name: String, brand: String?)] = [
            ("Nan Supreme Pro Infant Formula", nil),
            ("Nan Supreme Pro Powder Formula", nil),
            ("Enfamil Neuropro Formula", nil),
        ]
        let chips = Match.refineChips(query: "formula", names: names).map(\.chip)
        XCTAssertTrue(chips.contains("nan"), "web offers a \"nan\" chip; app chips are \(chips)")
        XCTAssertTrue(chips.contains("supreme"))
        // The mechanism, pinned so the cause is unambiguous:
        XCTAssertEqual(Double("nan")?.isNaN, true)
        XCTAssertNotNil(Double("infinity"))
    }
}

/// Free-tier metering.
final class UsageMeterTests: XCTestCase {
    private let dayKey = "usage.day"
    private let countKey = "usage.searches"
    private var savedDay: String?
    private var savedCount = 0

    override func setUp() {
        savedDay = UserDefaults.standard.string(forKey: dayKey)
        savedCount = UserDefaults.standard.integer(forKey: countKey)
    }

    override func tearDown() {
        if let savedDay { UserDefaults.standard.set(savedDay, forKey: dayKey) }
        else { UserDefaults.standard.removeObject(forKey: dayKey) }
        UserDefaults.standard.set(savedCount, forKey: countKey)
    }

    private var todayKey: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    /// rollover() used to zero the counter whenever the stored day string merely DIFFERED from
    /// today's, so moving the device clock in EITHER direction handed out a fresh allowance.
    ///
    /// The original version of this test could not tell the two directions apart: it simulated a
    /// clock change by writing a PAST day into the store, which is also exactly what a genuine
    /// midnight rollover looks like, so it demanded "no refill" for a case that must refill. Both
    /// directions are now asserted separately.
    @MainActor
    func testFreeSearchQuotaSurvivesDeviceDateChange() {
        let m = UsageMeter.shared
        UserDefaults.standard.set(todayKey, forKey: dayKey)
        UserDefaults.standard.set(UsageMeter.freeSearchesPerDay, forKey: countKey)
        XCTAssertEqual(m.remainingFreeSearches, 0, "precondition: today's quota is spent")
        XCTAssertFalse(m.canSearch())

        // Clock moved BACKWARDS (or the device crossed a date line westward): the stored day is
        // now in the future relative to "today". No refill, or the free tier is bypassable.
        UserDefaults.standard.set("2999-01-01", forKey: dayKey)
        XCTAssertEqual(m.remainingFreeSearches, 0,
                       "quota refilled after a backwards clock change — the free tier is bypassable")
        XCTAssertFalse(m.canSearch())
        XCTAssertEqual(UserDefaults.standard.string(forKey: dayKey), "2999-01-01",
                       "a future stored day must be left alone; rewriting it restores the bypass")
    }

    /// The other half: a real midnight must still refill, or a paying-nothing user is locked out
    /// permanently after their first three searches.
    @MainActor
    func testQuotaRefillsOnARealNewDay() {
        let m = UsageMeter.shared
        UserDefaults.standard.set("1999-01-01", forKey: dayKey)
        UserDefaults.standard.set(UsageMeter.freeSearchesPerDay, forKey: countKey)
        XCTAssertEqual(m.remainingFreeSearches, UsageMeter.freeSearchesPerDay,
                       "yesterday's spent quota was never refilled")
        XCTAssertTrue(m.canSearch())
        XCTAssertEqual(UserDefaults.standard.string(forKey: dayKey), todayKey)
        XCTAssertEqual(UserDefaults.standard.integer(forKey: countKey), 0)
    }

    /// Same day, same allowance: rollover must not reset a partially used day.
    @MainActor
    func testSameDayIsNotReset() {
        let m = UsageMeter.shared
        UserDefaults.standard.set(todayKey, forKey: dayKey)
        UserDefaults.standard.set(1, forKey: countKey)
        XCTAssertEqual(m.remainingFreeSearches, UsageMeter.freeSearchesPerDay - 1)
        XCTAssertEqual(UserDefaults.standard.integer(forKey: countKey), 1)
    }
}

/// Multipack / fraction parsing. The web fixed these in shared/units.js (MULTI_RE now requires a
/// pack word, has a `(?<![\d.])` lookbehind, and excludes a bare "/" separator). The Swift port
/// still carries the pre-fix regexes, so it reads digits out of the middle of a decimal and
/// reads fractions as multipacks — both of which divide the unit price by an order of magnitude.
final class MultipackParityTests: XCTestCase {

    /// The exact case shared/units.js calls out in a comment: "without it '1.5-2 lb' parsed as
    /// five 2-lb packs and priced a chicken breast at 7 cents a pound."
    func testWeightRangeIsNotAMultipack() {
        let s = Units.parseSize("1.5-2 lb")
        // web: base 24 (1.5 lb), count 1
        XCTAssertEqual(s?.base, 24, "app read this as \(s?.count ?? 0) × \(s?.amount ?? 0) lb = \(s?.base ?? 0) oz")
        XCTAssertEqual(s?.count, 1)

        // A $10.49 package of chicken breast:
        let p = ProductFactory.make(ProductInput(storeId: "s", id: "1", name: "Boneless Skinless Chicken Breast", sizeText: "1.5-2 lb", price: 10.49))!
        let perLb = (p.unitPrice(.weight)?.perBase ?? 0) * 16
        XCTAssertEqual(perLb, 10.49 / 1.5, accuracy: 0.01, "app prices it at $\(perLb)/lb")
    }

    /// "3/4 lb" is a fraction, not three 4-lb packs.
    func testFractionIsNotAMultipack() {
        let s = Units.parseSize("3/4 lb")
        // web: base 12 (0.75 lb), count 1
        XCTAssertEqual(s?.base, 12, "app read this as \(s?.count ?? 0) × \(s?.amount ?? 0) lb = \(s?.base ?? 0) oz")
        XCTAssertEqual(s?.count, 1)
    }

    /// Mixed numbers.
    func testMixedNumberSize() {
        // web: base 24 (1.5 lb)
        XCTAssertEqual(Units.parseSize("1 1/2 lb")?.base, 24)
    }

    /// The count can follow the size: "12 fl oz, 12 Pack Cans".
    func testTrailingPackCount() {
        let s = Units.parseSize("12 fl oz, 12 Pack Cans")
        // web: base 144, count 12
        XCTAssertEqual(s?.base, 144, "app got \(s?.base ?? 0)")
        XCTAssertEqual(s?.count, 12)
    }
}

/// shared/deals.js now refuses to ever emit a computed price of $0 ("showing $0.00 would win every
/// comparison it appeared in"). DealParser still emits zero, and a zero unit price sorts first in
/// every "cheapest" view in the app.
final class ZeroPriceParityTests: XCTestCase {

    /// "Save $5" on a $4 item: web leaves `each` undefined, app computes max(0, 4 - 5) = $0.00.
    func testSaveBiggerThanPriceDoesNotBecomeFree() {
        let d = DealParser.parse("Save $5", basePrice: 4)!
        XCTAssertEqual(d.kind, .save)
        XCTAssertNil(d.each, "app computed each = \(String(describing: d.each)) — a free item")
    }

    /// "100% off" — web guards with `out.pct < 100`; the app multiplies straight through to $0.
    func testHundredPercentOffDoesNotBecomeFree() {
        let d = DealParser.parse("100% off", basePrice: 3.99)!
        XCTAssertNil(d.each, "app computed each = \(String(describing: d.each))")
    }

    /// "2/$0" — web nulls the whole multi deal when total isn't > 0.
    func testZeroTotalMultiBuyIsRejected() {
        let d = DealParser.parse("2/$0")
        XCTAssertNil(d, "app returned kind=\(String(describing: d?.kind)) each=\(String(describing: d?.each))")
    }

    /// shared/deals.js also reads "when you buy N" and "buy N or more" as a required quantity.
    /// Missing them means quoting a price the shopper cannot actually get.
    func testMustBuyAlternativePhrasings() {
        XCTAssertEqual(DealParser.parse("$2.99 when you buy 4")?.mustBuy, 4)
        XCTAssertEqual(DealParser.parse("$1.99 ea. buy 3 or more")?.mustBuy, 3)
    }
}

// ============================================================================
// Ported pricing-logic fixes (units, relevance, deal parsing, Flipp coupons).
//
// These mirror the JavaScript QA suites, case for case:
//   basket/test/qa-units-pricing.test.js     -> PortedUnitsTests
//   basket/test/qa-match-relevance.test.js   -> PortedMatchTests
//   basket/test/qa-deals-parsing.test.js     -> PortedDealsTests / PortedFlippCouponTests
//   basket/test/qa-compare-best-price.test.js-> PortedBestPriceTests
//
// REFERENCE IMPLEMENTATION: basket/shared/units.js, basket/shared/match.js,
// basket/shared/deals.js, plus basket/src/normalize.js and
// basket/src/adapters/flipp.js. The website runs those; the app runs the Swift
// ports in App/Core and App/Sources. The product's whole claim is that the
// price it shows is trustworthy, so the SAME product must give the SAME answer
// in both.
//
// When the two sides disagree the JS wins: change the Swift to match. The only
// exception is a JS behaviour that is plainly a bug, and then both sides change
// in the same commit and the JS suite
// (`BASKET_DATA_DIR=/tmp/cw-port node --test 'test/*.test.js'`) stays green.
// Never change one side alone to make a test pass.
//
// The "control" cases are as important as the defect cases. They are what prove
// a fix did not over-correct; the match controls in particular assert that real
// products are still accepted.
// ============================================================================

final class PortedUnitsTests: XCTestCase {
    private func size(_ s: String?) -> ParsedSize? { Units.parseSize(s) }
    private func perLb(_ p: Product) -> Double? { p.unitPrice(.weight).map { $0.perBase * 16 } }

    // MARK: FIX 1 + FIX 2 + FIX 4 — a weight RANGE is not a multi-pack

    /// FIX 2: the multi-pack count may not be digits lifted out of a decimal. Without the
    /// `(?<![\d.])` lookbehind "1.5-2 lb" parsed as five 2-lb packs.
    func testWeightRangeWithDecimalIsOnePackage() {
        let s = size("1.5-2 lb")
        XCTAssertEqual(s?.count, 1, "parsed as \(s?.count ?? 0) packs")
        XCTAssertEqual(s?.base, 24)
        XCTAssertLessThanOrEqual(s?.base ?? .infinity, 32, "2 lb is 32 oz; anything above is a blow-up")
    }

    func testDescendingLikeRangeIsNotNinetyThreePounds() {
        let s = Units.parseSize("0.75-1.25 lb")
        XCTAssertEqual(s?.base, 12)
        XCTAssertLessThanOrEqual(s?.base ?? .infinity, 20, "absurd for a 0.75-1.25 lb tray")
    }

    /// The user-visible damage: a 7-cents-a-pound chicken breast.
    func testRangeBlowupDoesNotFakeACheapChickenBreast() {
        let p = ProductFactory.make(ProductInput(
            storeId: "mariano", id: "m1",
            name: "Perdue Boneless Skinless Chicken Breast", sizeText: "0.75-1.25 lb", price: 6.49))!
        XCTAssertGreaterThan(perLb(p) ?? 0, 3, "chicken breast priced at $\(perLb(p) ?? 0)/lb, size shown as \"\(p.size)\"")
    }

    /// FIX 4: a dash-joined pair of numbers followed by a unit is ALWAYS a range, whichever side
    /// is larger. (control in the JS suite)
    func testRangesWithoutADecimalPoint() {
        for (text, maxOz) in [("12.2-14.4 oz", 14.4), ("10-15 oz", 15.0), ("1-2 lb", 32.0), ("2 to 3 lb", 48.0)] {
            let s = Units.parseSize(text)
            XCTAssertEqual(s?.count, 1, "\(text) -> count \(s?.count ?? -1)")
            XCTAssertLessThanOrEqual(s?.base ?? .infinity, maxOz, "\(text) -> \(s?.base ?? -1) oz")
            XCTAssertEqual(s?.range, true, "\(text) should be flagged as a range")
        }
    }

    // MARK: FIX 3 — a bare "/" is a fraction, not a multi-pack separator

    func testFractionIsNotAMultipack() {
        XCTAssertEqual(Units.parseSize("3/4 lb")?.base, 12)
        XCTAssertEqual(Units.parseSize("3/4 lb")?.count, 1)
    }

    func testFractionsWithNumeratorOneStillParse() {
        XCTAssertEqual(Units.parseSize("1/2 gal")?.base, 64)
        XCTAssertEqual(Units.parseSize("1/4 lb")?.base, 4)
    }

    /// Slash-separated multipacks still work through the pack-word branch.
    func testSlashSeparatedMultipackStillWorks() {
        XCTAssertEqual(Units.parseSize("12 pk / 12 fl oz")?.base, 144)
        XCTAssertEqual(Units.parseSize("12 pk / 12 fl oz")?.count, 12)
    }

    // MARK: FIX 1 (mixed numbers)

    func testMixedFractionIsNotTruncated() {
        XCTAssertEqual(Units.parseNumber("1 1/2"), 1.5, "parseNumber itself is correct")
        XCTAssertEqual(Units.parseSize("1 1/2 lb")?.base, 24, "a third of the package would be lost")
    }

    // MARK: FIX 5 — spelled-out fractions

    func testSpelledOutHalfGallon() {
        let s = Units.parseSize("half gallon")
        XCTAssertNotNil(s, "\"half gallon\" did not parse, so the item drops out of every comparison")
        XCTAssertEqual(s?.base, 64)
    }

    func testSpelledOutSizeInAProductName() {
        let p = ProductFactory.make(ProductInput(
            storeId: "a", id: "1", name: "Organic Valley Whole Milk, half gallon", price: 4.99))!
        XCTAssertNotNil(p.unitPrice(.volume), "no volume unit price; dim=\(String(describing: p.dim)) base=\(String(describing: p.base))")
    }

    func testOtherSpelledOutFractions() {
        XCTAssertEqual(Units.parseSize("quarter pound")?.base, 4)
        XCTAssertEqual(Units.parseSize("a dozen")?.base, 12)
        XCTAssertEqual(Units.parseSize("half-dozen")?.base, 6)
        XCTAssertEqual(Units.parseSize("half dozen")?.base, 6)
        // The three-quarter rule runs BEFORE the quarter rule, so the quarter rule cannot fire
        // inside "three-quarter" and turn it into "three-0.25 pound".
        XCTAssertEqual(Units.parseSize("three-quarter pound")?.base, 12)
        XCTAssertEqual(Units.parseSize("three quarter pound")?.base, 12)
        XCTAssertEqual(Units.parseSize("three-quarters pound")?.base, 12)
    }

    // MARK: FIX 6 + FIX 7 — the pack count may come AFTER the size, across comma segments

    func testTrailingPackCountKeepsTheVolume() {
        let s = Units.sizeFromName("Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans")
        XCTAssertEqual(s?.dim, .volume, "the 12 fl oz was discarded")
        XCTAssertEqual(s?.base, 144)
    }

    func testTrailingCountKeepsTheWeight() {
        let s = Units.sizeFromName("Chobani Greek Yogurt Cups, 5.3 oz, 12 Count")
        XCTAssertEqual(s?.dim, .weight)
        XCTAssertEqual(s?.base, 63.6)
    }

    /// Round-3 price check: nine Tillamook slices in an 8 oz pack took Chicago's cheddar headline
    /// read as nine packs. Mirrors DEFECT P21 in test/qa-pricing-round2.test.js.
    func testPieceCountAfterAWeightIsThePackage() {
        XCTAssertEqual(Units.sizeFromName("Tillamook Farmstyle Medium Cheddar Cheese Slices, 8oz, 9ct")?.base, 8)
        XCTAssertEqual(Units.sizeFromName("Ferrero Rocher, Milk Chocolate Hazelnut Candy, 21.2 oz, 48 Count")?.base, 21.2)
        XCTAssertEqual(Units.sizeFromName("Tillamook Medium Cheddar Cheese Snack Portions, 0.75oz, 10ct")?.base, 7.5)
        XCTAssertEqual(Units.sizeFromName("Kerrygold Pure Irish Butter, Salted, 8 oz, 4-count")?.base, 32)
    }

    /// The hyphenated leading form: "12-count 5.3 oz cups".
    func testHyphenatedLeadingCount() {
        let s = Units.parseSize("12-count 5.3 oz cups")
        XCTAssertEqual(s?.dim, .weight, "the 5.3 oz was discarded")
        XCTAssertEqual(s?.base, 63.6)
    }

    /// Two stores listing the same 12-pack two different ways must land in the same dimension,
    /// otherwise one of them is silently dropped from the comparison.
    func testIdenticalTwelvePacksShareADimension() {
        let a = ProductFactory.make(ProductInput(storeId: "a", id: "1", name: "Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans", price: 8.99))!
        let b = ProductFactory.make(ProductInput(storeId: "b", id: "2", name: "Coca-Cola Cans", sizeText: "12 pk, 12 fl oz", price: 8.49))!
        XCTAssertEqual(a.dim, b.dim, "store A dim=\(String(describing: a.dim)) vs store B dim=\(String(describing: b.dim)) — not comparable")
    }

    /// control: the unambiguous form was always right and must stay right.
    func testUnambiguousMultipackForm() {
        XCTAssertEqual(Units.parseSize("12 x 5.3 oz")?.base, 63.6)
        XCTAssertEqual(Units.parseSize("12 x 12 fl oz")?.base, 144)
        XCTAssertEqual(Units.parseSize("6 ct, 16.9 fl oz")?.base, 101.4)
        XCTAssertEqual(Units.parseSize("12pk 12oz")?.base, 144)
    }

    // MARK: FIX 10 — liquid coercion

    func testChocolateMilkCoercesLikePlainMilk() {
        let plain = Units.coerceLiquid(Units.parseSize("64 oz"), name: "Prairie Farms Whole Milk")
        let choc = Units.coerceLiquid(Units.parseSize("64 oz"), name: "TruMoo Chocolate Milk")
        XCTAssertEqual(plain?.dim, .volume, "sanity: plain milk coerces")
        XCTAssertEqual(choc?.dim, .volume, "chocolate milk stayed in \(String(describing: choc?.dim)) — flavour words must not veto")
    }

    func testPopTartsAreNotALiquid() {
        let s = Units.coerceLiquid(Units.parseSize("13.5 oz"), name: "Pop-Tarts Frosted Strawberry Toaster Pastries")
        XCTAssertEqual(s?.dim, .weight, "toaster pastries priced per fl oz")
    }

    func testCannedSolidsAreNetWeight() {
        for name in ["Del Monte Whole Kernel Corn Can", "Libby's 100% Pure Pumpkin Can"] {
            let s = Units.coerceLiquid(Units.parseSize("15 oz"), name: name)
            XCTAssertEqual(s?.dim, .weight, "\(name) — \"can\" alone must not trigger the liquid rule")
        }
        // Fish is sold by net weight even when the label says "in water".
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("5 oz"), name: "StarKist Chunk Light Tuna in Water")?.dim, .weight)
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("14.75 oz"), name: "Wild Alaskan Pink Salmon in Water Can")?.dim, .weight)
    }

    /// A container word only counts when a real drink word appears too.
    func testContainerWordAloneIsNotALiquid() {
        XCTAssertFalse(Units.looksLiquid("Sprite Cans"), "\"cans\" alone must not imply a liquid")
        XCTAssertTrue(Units.looksLiquid("Coca-Cola 12 pk Cans"))
        XCTAssertTrue(Units.looksLiquid("Prairie Farms Whole Milk"))
        XCTAssertFalse(Units.looksLiquid("Pop-Tarts Frosted Strawberry Toaster Pastries"))
    }

    /// control: beer in "12 oz cans" really is fluid ounces, and yogurt/beef are not.
    func testLiquidCoercionControls() {
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("12 pk., 12 oz. Bottles or Cans"), name: "Beer 12 pk., 12 oz. Bottles or Cans")?.dim, .volume)
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("5.3 Oz"), name: "Plain Whole Milk Greek Yogurt")?.dim, .weight)
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("16 oz"), name: "Ground Beef")?.dim, .weight)
    }

    // MARK: FIX 8 — a milligram figure is a dose, not a package

    func testMilligramDoseIsNotAPackageSize() {
        XCTAssertNil(Units.parseSize("1 mg"), "\"1 mg\" must not be read as a package size at all")
        XCTAssertNil(Units.parseSize("25 mg"))
        let p = ProductFactory.make(ProductInput(storeId: "x", id: "1", name: "Nature Made Vitamin D3", sizeText: "25 mg", price: 12.99))!
        XCTAssertNil(perLb(p), "priced per lb from a dose: $\(perLb(p) ?? 0)/lb")
        XCTAssertEqual(p.price, 12.99, "the item lost its price entirely")
        // The guard covers the multi-pack branch too: "2 x 500 mg" is two doses, not a package.
        XCTAssertNil(Units.parseSize("2 x 500 mg"))
        XCTAssertNil(Units.parseSize("2 pk 500 mg"))
        // and it must not swallow a real multi-pack of a real package
        XCTAssertEqual(Units.parseSize("12 x 5.3 oz")?.base, 63.6)
        XCTAssertEqual(Units.parseSize("2 x 5 g")?.base ?? 0, 0.3527, accuracy: 1e-6)
    }

    /// Real small packages must still parse: spice jars, yeast packets, loose saffron.
    func testSmallRealPackagesStillParse() {
        XCTAssertEqual(Units.parseSize("0.5 oz")?.base, 0.5)
        XCTAssertGreaterThan(Units.parseSize("7 g")?.base ?? 0, 0, "a 7 g yeast packet is a real package")
        XCTAssertGreaterThan(Units.parseSize("500 g")?.base ?? 0, 0)
        XCTAssertEqual(Units.parseSize("3 g")?.base ?? 0, 0.1058, accuracy: 1e-6, "3 g is the cut-off and must parse")
        XCTAssertNil(Units.parseSize("2.9 g"), "below 3 g is a dose")
    }

    // MARK: FIX 9 — rounding never collapses a small value to zero

    func testTinyValuesSurviveRounding() {
        let s = Units.parseSize("0.01 ml")
        XCTAssertEqual(s?.base ?? 0, 0.000338140227, accuracy: 1e-12, "rounding to 4 dp would make this 0 and drop the item")
        XCTAssertGreaterThan(s?.base ?? 0, 0)
    }

    // MARK: controls — numeric edge cases

    func testZeroAndJunkSizesNeverDivideByZero() {
        for bad in ["0 oz", "0.0 oz", "", "   ", "12", "family size", "sold by weight"] {
            XCTAssertNil(Units.parseSize(bad), "\"\(bad)\" should not parse")
        }
        XCTAssertNil(Units.parseSize(nil))
        let p = ProductFactory.make(ProductInput(storeId: "a", id: "1", name: "Mystery Item", sizeText: "0 oz", price: 4.99))!
        XCTAssertTrue(p.unit.isEmpty, "no unit prices for a zero size, got \(p.unit)")
    }

    func testUnitPricesAreNeverInfiniteOrNegative() {
        let inputs: [ProductInput] = [
            ProductInput(storeId: "a", id: "1", name: "Thing", sizeText: "16 oz", price: 0),
            ProductInput(storeId: "a", id: "2", name: "Thing", sizeText: nil, price: 4.99),
            ProductInput(storeId: "a", id: "3", name: "Thing", sizeText: "0 oz", price: 4.99),
            ProductInput(storeId: "a", id: "4", name: "Thing", sizeText: "1000000 oz", price: 4.99),
            ProductInput(storeId: "a", id: "5", name: "Thing", sizeText: "per lb", price: 4.99),
            ProductInput(storeId: "a", id: "6", name: "Thing", sizeText: "25 mg", price: 4.99),
        ]
        for input in inputs {
            guard let p = ProductFactory.make(input) else { continue }
            for (dim, u) in p.unit {
                XCTAssertTrue(u.perBase.isFinite, "\(dim).perBase = \(u.perBase) for \(input.sizeText ?? "nil")")
                XCTAssertGreaterThanOrEqual(u.perBase, 0, "\(dim).perBase negative")
            }
        }
    }

    func testOrangeJuiceAllComparesInFluidOunces() {
        for (name, sizeText, price, expected) in [
            ("Simply Orange Juice Pulp Free", "64 oz", 5.49, 0.0858),
            ("Tropicana Pure Premium Orange Juice", "59 fl oz", 4.99, 0.0846),
            ("Great Value Orange Juice", "1 gal", 7.98, 0.0623),
        ] {
            let p = ProductFactory.make(ProductInput(storeId: "a", id: name, name: name, sizeText: sizeText, price: price))!
            XCTAssertEqual(p.dim, .volume, "\(name) -> \(String(describing: p.dim))")
            XCTAssertEqual(p.unitPrice(.volume)?.perBase ?? 0, expected, accuracy: 0.001, name)
        }
    }

    func testMetricSizesConvert() {
        XCTAssertEqual(Units.parseSize("750 mL")?.base ?? 0, 25.36, accuracy: 0.01)
        XCTAssertEqual(Units.parseSize("1 L")?.base ?? 0, 33.814, accuracy: 0.001)
        XCTAssertEqual(Units.parseSize("500 g")?.base ?? 0, 17.637, accuracy: 0.001)
        XCTAssertEqual(Units.parseSize("1 kg")?.base ?? 0, 35.274, accuracy: 0.001)
    }

    func testEggsDozenAndCount() {
        XCTAssertEqual(Units.parseSize("1 dozen")?.base, 12)
        XCTAssertEqual(Units.parseSize("2 dozen")?.base, 24)
        XCTAssertEqual(Units.parseSize("18 ct")?.base, 18)
        XCTAssertEqual(Units.sizeFromName("Eggs Large 12ct")?.base, 12)
    }

    func testPerPoundAndEachAreDistinguished() {
        XCTAssertEqual(Units.parseSize("per lb")?.perWeight, true)
        XCTAssertEqual(Units.parseSize("/lb")?.perWeight, true)
        XCTAssertEqual(Units.parseSize("each")?.base, 1)
        XCTAssertEqual(Units.parseSize("each")?.dim, .count)
    }

    // MARK: warehouse-club case pricing — mirrors the "live:" cases in test/qa-units-pricing.test.js
    //
    // Warehouse clubs state the size of ONE unit and charge for a CASE. Costco lists
    // "…, Half Gallon, 3-count" with sizeText "64 fl oz" at $14.92. Taking the stated size at face
    // value priced that milk at $29.84/gal instead of $9.95, and a single outlier that large also
    // flattens the per-store bar chart so every honest price renders as an identical stub.
    // Found in live Costco results, not by inspection.

    func testCasePriceIsDividedByTheCaseNotByOneUnit() {
        let p = ProductFactory.make(ProductInput(
            storeId: "costco", id: "c1",
            name: "Kirkland Signature Ultra Filtered 2% Lactose Free Milk, Half Gallon, 3-count",
            sizeText: "64 fl oz", price: 14.92))!
        let perGal = (p.unitPrice(.volume)?.perBase ?? 0) * 128
        XCTAssertGreaterThan(perGal, 9, "$\(perGal)/gal — the case price was divided by one bottle")
        XCTAssertLessThan(perGal, 11, "$\(perGal)/gal — the case price was divided by one bottle")
        XCTAssertEqual(p.size, "3 × 0.5 gal")
    }

    func testSizeTextOfEachMustNotBeatARealSizeInTheName() {
        let p = ProductFactory.make(ProductInput(
            storeId: "costco", id: "c2", name: "Kirkland Signature Whole Milk, 1 gal",
            sizeText: "each", price: 2.97))!
        XCTAssertNotNil(p.unitPrice(.volume), "no unit price at all, so it never enters the comparison")
        XCTAssertEqual((p.unitPrice(.volume)?.perBase ?? 0) * 128, 2.97, accuracy: 0.01)
    }

    /// control: a stated size still wins when the name adds nothing.
    func testStatedSizeStillWinsWhenTheNameAddsNothing() {
        let p = ProductFactory.make(ProductInput(
            storeId: "aldi", id: "a1", name: "Friendly Farms Whole Milk",
            sizeText: "1 gal", price: 2.42))!
        XCTAssertEqual((p.unitPrice(.volume)?.perBase ?? 0) * 128, 2.42, accuracy: 0.01)
        // And a hyphenated pack count in the name is read as a pack, not a bare count.
        let q = ProductFactory.make(ProductInput(
            storeId: "costco", id: "c3", name: "Kirkland Water, 16.9 fl oz, 40-count",
            sizeText: "each", price: 4.99))!
        XCTAssertLessThan((q.unitPrice(.volume)?.perBase ?? 0) * 676, 5.01)
    }
}

final class PortedMatchTests: XCTestCase {
    private func score(_ q: String, _ name: String, _ brand: String = "") -> Double {
        Match.relevance(query: q, name: name, brand: brand)
    }

    private func rejects(_ q: String, _ name: String, _ brand: String = "", file: StaticString = #filePath, line: UInt = #line) {
        let s = score(q, name, brand)
        XCTAssertLessThan(s, Match.relevant, "\"\(q)\" vs \"\(brand) \(name)\" scored \(s) — trap accepted", file: file, line: line)
    }

    private func matches(_ q: String, _ name: String, _ brand: String = "", file: StaticString = #filePath, line: UInt = #line) {
        let s = score(q, name, brand)
        XCTAssertGreaterThanOrEqual(s, Match.relevant, "\"\(q)\" vs \"\(brand) \(name)\" scored \(s) — real match rejected", file: file, line: line)
    }

    // MARK: FIX 11 + FIX 12 — trap nouns are counted on BOTH sides of the head noun

    func testPeanutButterDoesNotMatchButter() {
        rejects("butter", "Jif Creamy Peanut Butter", "Jif")
    }

    func testButterLettuceDoesNotMatchButter() {
        rejects("butter", "Organic Butter Lettuce", "Earthbound")
    }

    func testCreamCheeseDoesNotMatchCheese() {
        rejects("cheese", "Philadelphia Original Cream Cheese", "Philadelphia")
    }

    func testMorePreHeadTraps() {
        rejects("cheese", "Kraft Macaroni & Cheese Dinner", "Kraft")
        rejects("beef", "Better Than Bouillon Beef Base", "Better Than Bouillon")
        rejects("beef", "Hormel Beef Chili with Beans", "Hormel")
    }

    // MARK: FIX 13 — ALT_BASE and MILD penalties are position-independent

    func testWordOrderDoesNotChangeTheScore() {
        let after = score("orange juice", "Orange Juice Concentrate Frozen", "Minute Maid")
        let before = score("orange juice", "Frozen Orange Juice Concentrate", "Minute Maid")
        XCTAssertEqual(after, before, accuracy: 0.05,
                       "word order changes the score: \"...Concentrate Frozen\"=\(after) vs \"Frozen Orange Juice...\"=\(before)")
        XCTAssertLessThan(after, Match.relevant, "concentrate is not comparable per fl oz with ready-to-drink juice")
    }

    // MARK: controls — traps that were already rejected must stay rejected

    func testKnownTrapsStillRejected() {
        rejects("milk", "Hershey's Milk Chocolate Bar", "Hershey's")
        rejects("milk", "TruMoo Chocolate Milk", "TruMoo")
        rejects("milk", "Chobani Greek Yogurt made with Whole Milk", "Chobani")
        rejects("milk", "Milk-Bone Original Dog Treats", "Milk-Bone")
        rejects("milk", "Thai Kitchen Coconut Milk", "Thai Kitchen")
        rejects("chicken", "Swanson Chicken Broth", "Swanson")
        rejects("beef", "Jack Link's Beef Jerky Original", "Jack Link's")
    }

    func testNewTrapsCorrectlyRejected() {
        rejects("milk", "Silk Almond Milk Unsweetened", "Silk")
        rejects("milk", "Nesquik Strawberry Milk", "Nesquik")
        rejects("milk", "Carnation Evaporated Milk", "Carnation")
        rejects("milk", "Eagle Brand Sweetened Condensed Milk", "Eagle Brand")
        rejects("butter", "Butterball Turkey Breast", "Butterball")
        rejects("butter", "Kodiak Buttermilk Power Cakes Flapjack Mix", "Kodiak")
        rejects("butter", "Butter Flavored Cooking Spray", "Pam")
        rejects("cheese", "Cheez-It Baked Snack Crackers", "Cheez-It")
        rejects("cheese", "Cheetos Crunchy Cheese Flavored Snacks", "Cheetos")
        rejects("chicken", "Tyson Chicken Nuggets Frozen", "Tyson")
        rejects("chicken", "Banquet Chicken Pot Pie", "Banquet")
        rejects("eggs", "Eggo Homestyle Waffles", "Eggo")
        rejects("eggs", "Barilla Egg Noodles", "Barilla")
        rejects("eggs", "Cadbury Creme Eggs Candy", "Cadbury")
        rejects("bread", "Progresso Italian Style Bread Crumbs", "Progresso")
        rejects("bread", "Pepperidge Farm Banana Bread")
        rejects("rice", "Rice Krispies Cereal", "Kellogg's")
        rejects("water", "Gatorade Thirst Quencher", "Gatorade")
        rejects("coffee", "Coffee mate French Vanilla Creamer", "Coffee mate")
        rejects("tomatoes", "Hunt's Tomato Sauce", "Hunt's")
        rejects("potatoes", "Lay's Classic Potato Chips", "Lay's")
        rejects("apples", "Mott's Apple Sauce Cups", "Mott's")
        rejects("onions", "Funyuns Onion Flavored Rings", "Funyuns")
        rejects("salmon", "Purina Fancy Feast Salmon Cat Food", "Purina")
        rejects("bacon", "Bacon Bits Salad Topping", "Hormel")
        rejects("sugar", "Sugar Free Red Bull Energy Drink", "Red Bull")
        rejects("flour", "Bob's Red Mill Almond Flour", "Bob's Red Mill")
        rejects("yogurt", "Yoplait Original Strawberry Yogurt", "Yoplait")
    }

    /// The controls that matter most: every one of these is a real product a shopper searched for.
    /// A trap fix that also rejects these has made the app worse, not better.
    func testRealMatchesAreStillAccepted() {
        matches("milk", "Whole Milk", "Prairie Farms")
        matches("milk", "Organic Valley Whole Milk, Half Gallon", "Organic Valley")
        matches("milk", "Fairlife 2% Reduced Fat Ultra-Filtered Milk", "Fairlife")
        matches("milk", "Lactaid Lactose Free Whole Milk", "Lactaid")
        matches("butter", "Land O Lakes Salted Butter Sticks", "Land O Lakes")
        matches("butter", "Kerrygold Pure Irish Butter", "Kerrygold")
        matches("cheese", "Tillamook Medium Cheddar Cheese Block", "Tillamook")
        matches("cheese", "Kraft Shredded Mozzarella Cheese", "Kraft")
        matches("chicken", "Boneless Skinless Chicken Breast", "Perdue")
        matches("chicken breast", "Boneless Skinless Chicken Breasts Value Pack", "Tyson")
        matches("beef", "Ground Beef 80/20", "Open Nature")
        matches("ground beef", "Ground Beef Chuck 80% Lean")
        matches("eggs", "Large Grade A Eggs, 12 ct", "Lucerne")
        matches("eggs", "Eggland's Best Cage Free Large White Eggs", "Eggland's Best")
        matches("orange juice", "Tropicana Pure Premium Orange Juice No Pulp", "Tropicana")
        matches("bananas", "Bananas")
        matches("greek yogurt", "Chobani Non-Fat Greek Yogurt Plain", "Chobani")
        matches("rice", "Uncle Ben's Ready Rice Original", "Uncle Ben's")
        matches("water", "Poland Spring Natural Spring Water", "Poland Spring")
        matches("coffee", "Starbucks Pike Place Roast Ground Coffee", "Starbucks")
        matches("tomatoes", "Roma Tomatoes")
        matches("potatoes", "Russet Potatoes 5 lb Bag")
        matches("apples", "Honeycrisp Apples")
        matches("onions", "Yellow Onions 3 lb")
        matches("salmon", "Salmon Fillet Atlantic Fresh")
        matches("bacon", "Oscar Mayer Center Cut Bacon", "Oscar Mayer")
        matches("sugar", "Domino Granulated Sugar", "Domino")
        matches("flour", "Gold Medal All Purpose Flour", "Gold Medal")
        matches("yogurt", "Stonyfield Organic Whole Milk Plain Yogurt", "Stonyfield")
        matches("half and half", "Land O Lakes Half & Half", "Land O Lakes")
        matches("heavy cream", "Heavy Whipping Cream", "Horizon")
        matches("sour cream", "Daisy Pure & Natural Sour Cream", "Daisy")
        // Every new trap word is guarded by "not in the query", so these still work:
        matches("cream cheese", "Philadelphia Original Cream Cheese", "Philadelphia")
        matches("peanut butter", "Jif Creamy Peanut Butter", "Jif")
        matches("toilet paper", "Charmin Ultra Soft Toilet Paper", "Charmin")
        matches("paper towels", "Bounty Select-A-Size Paper Towels", "Bounty")
    }

    // Shellfish traps, mirroring test/qa-match-relevance.test.js.
    func testShellfishDishesDoNotAnswerTheirSauce() {
        rejects("butter", "Garlic Butter Mussels", "Kirkland Signature")
        rejects("butter", "Butter Garlic Clams", "Trader Joe\u{2019}s")
        rejects("butter", "Lemon Butter Squid Rings")
        rejects("garlic", "Garlic Octopus Salad")
        rejects("crackers", "Oyster Crackers", "Nabisco")
    }

    func testOysterMushroomsAndShellfishStillMatchThemselves() {
        matches("mushrooms", "King Oyster Mushrooms")
        matches("mushrooms", "Organic Oyster Mushrooms", "Wegmans")
        matches("clams", "Chopped Clams", "Bumble Bee")
        matches("oysters", "Fancy Whole Oysters", "Crown Prince")
        matches("mussels", "Fresh Mussels")
    }

    // Wine named after a food, mirroring test/qa-match-relevance.test.js. PriceSearch.ads keeps a
    // flyer item at relevance >= 0.4, so the wine must fall under that.
    func testWineNamedAfterAFoodIsNotAnAdMatch() {
        XCTAssertLessThan(score("butter", "Butter Chardonnay", ""), 0.4)
        XCTAssertLessThan(score("noir", "Meiomi Pinot Noir", ""), 0.4)
        matches("chardonnay", "Kendall-Jackson Vintner\u{2019}s Reserve Chardonnay")
        matches("pinot noir", "Meiomi Pinot Noir")
        matches("butter", "Truly Grass Fed Butter")
    }
}

final class PortedDealsTests: XCTestCase {

    // MARK: FIX 14 — a deal carrying only a must-buy requirement is not discarded

    func testMustBuyOnlyDealSurvives() {
        let d = DealParser.parse("must buy 2 or pay $3.49 ea", basePrice: 2.99)
        XCTAssertNotNil(d, "the must-buy requirement is silently lost")
        XCTAssertEqual(d?.mustBuy, 2)
    }

    func testBareMustBuySurvives() {
        let d = DealParser.parse("MUST BUY 4", basePrice: 3.99)
        XCTAssertNotNil(d)
        XCTAssertEqual(d?.mustBuy, 4)
    }

    // MARK: FIX 15 — the other two must-buy phrasings

    func testWhenYouBuyIsRecognised() {
        let d = DealParser.parse("$3.99 ea when you buy 4", basePrice: 3.99)
        XCTAssertNotNil(d, "\"when you buy 4\" is unparsed")
        XCTAssertEqual(d?.mustBuy ?? d?.qty, 4)
    }

    func testBuyNOrMoreIsRecognised() {
        XCTAssertEqual(DealParser.parse("$1.99 ea. buy 3 or more")?.mustBuy, 3)
    }

    // MARK: FIX 16 — "$1.00 off 2"

    func testDollarOffWithRequiredCount() {
        let d = DealParser.parse("$1.00 off 2", basePrice: 3.49)
        XCTAssertNotNil(d)
        XCTAssertEqual(d?.kind, .save)
        XCTAssertEqual(d?.save, 1)
        XCTAssertEqual(d?.mustBuy, 2)
        XCTAssertEqual(d?.each, 2.49)
    }

    // MARK: FIX 17 — circular coupon form "$2 OFF (2)" / "75¢ OFF (1)"

    func testParenthesisedBuyCountIsNotPartOfTheDiscount() {
        for (text, save, mustBuy) in [("$2 OFF (2)", 2.0, 2), ("75¢ OFF (1)", 0.75, 0),
                                      ("50¢ OFF (2)", 0.5, 2), ("$1 OFF (3)", 1.0, 3),
                                      ("$3 OFF (4)", 3.0, 4), ("$1.00 OFF (2)", 1.0, 2),
                                      ("$1.50 OFF (1)", 1.5, 0)] {
            let d = DealParser.parse(text)
            XCTAssertEqual(d?.kind, .save, text)
            XCTAssertEqual(d?.save ?? -1, save, accuracy: 0.005, "\(text) -> save \(String(describing: d?.save))")
            XCTAssertEqual(d?.mustBuy ?? 0, mustBuy, "\(text) -> mustBuy \(String(describing: d?.mustBuy))")
            XCTAssertEqual(d?.needsCoupon, true, "\(text) is a coupon")
        }
    }

    // MARK: FIX 18 — never claim an item is free

    /// `each` is either a real positive price or nil, and never 0 or negative.
    private func assertEachIsSane(_ d: DealTerms?, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertNotNil(d, "\(label): no deal parsed", file: file, line: line)
        guard let each = d?.each else { return }
        XCTAssertGreaterThan(each, 0, "\(label): each = \(each) claims the item is free", file: file, line: line)
    }

    func testSaveLargerThanPriceIsNotFree() {
        assertEachIsSane(DealParser.parse("Save $2.00", basePrice: 1.99), "\"Save $2.00\" on $1.99")
        assertEachIsSane(DealParser.parse("Save $5.00", basePrice: 1.99), "\"Save $5.00\" on $1.99")
        assertEachIsSane(DealParser.parse("save $3.49", basePrice: 3.49), "\"save $3.49\" on $3.49")
        // A save that genuinely fits still produces a price.
        XCTAssertEqual(DealParser.parse("Save $1.00", basePrice: 3.49)?.each, 2.49)
    }

    func testHundredPercentOffIsNotFree() {
        assertEachIsSane(DealParser.parse("100% off", basePrice: 3.49), "100% off")
        XCTAssertEqual(DealParser.parse("25% off", basePrice: 4.00)?.each, 3)
    }

    func testMultiBuyForZeroIsNotFree() {
        let d = DealParser.parse("2 for $0")
        XCTAssertTrue(d == nil || (d?.each ?? 1) > 0, "each = \(String(describing: d?.each))")
        XCTAssertEqual(DealParser.parse("2 for $5")?.each, 2.5)
    }

    // MARK: controls

    func testMultiBuyForms() {
        for text in ["2 for $5", "2/$5"] {
            let d = DealParser.parse(text, basePrice: 3.49)
            XCTAssertEqual(d?.kind, .multi, text)
            XCTAssertEqual(d?.qty, 2, text)
            XCTAssertEqual(d?.total, 5, text)
            XCTAssertEqual(d?.each, 2.5, text)
        }
        let ten = DealParser.parse("10/$10")
        XCTAssertEqual(ten?.qty, 10)
        XCTAssertEqual(ten?.each, 1)
        XCTAssertEqual(DealParser.parse("3 for $12")?.label, "3 for $12")
    }

    func testBogoAndBuyXGetY() {
        XCTAssertEqual(DealParser.parse("BOGO", basePrice: 4.99)?.kind, .bogo)
        XCTAssertEqual(DealParser.parse("Buy One Get One Free", basePrice: 4.99)?.each, 2.5)
        XCTAssertEqual(DealParser.parse("B1G1", basePrice: 4.99)?.pct, 50)
        let b2g1 = DealParser.parse("Buy 2 Get 1 Free", basePrice: 4.99)
        XCTAssertEqual(b2g1?.kind, .bxgy)
        XCTAssertEqual(b2g1?.qty, 3)
        XCTAssertEqual(DealParser.parse("Buy 2, Get 2 Free", basePrice: 4.99)?.pct, 50)
        XCTAssertEqual(DealParser.parse("buy 2 get 1 50% off", basePrice: 4.99)?.qty, 3)
    }

    func testLimitsCouponsAndCardPrices() {
        XCTAssertEqual(DealParser.parse("limit 2", basePrice: 3.49)?.limit, 2)
        XCTAssertEqual(DealParser.parse("2 for $5, limit 2", basePrice: 3.49)?.limit, 2)
        XCTAssertEqual(DealParser.parse("with digital coupon", basePrice: 3.49)?.needsCoupon, true)
        XCTAssertEqual(DealParser.parse("for U", basePrice: 3.49)?.needsCoupon, true)
        XCTAssertEqual(DealParser.parse("with card", basePrice: 3.49)?.needsCard, true)
        let combo = DealParser.parse("3 for $12 with digital coupon, limit 1", basePrice: 4.99)
        XCTAssertEqual(combo?.qty, 3)
        XCTAssertEqual(combo?.needsCoupon, true)
        XCTAssertEqual(combo?.limit, 1)
    }

    func testSaveAndPercentArithmetic() {
        XCTAssertEqual(DealParser.parse("Save $1.00", basePrice: 3.49)?.each, 2.49)
        XCTAssertEqual(DealParser.parse("Save $1.00 lb.", basePrice: 4.99)?.perLb, true)
        XCTAssertEqual(DealParser.parse("25% off", basePrice: 4.0)?.each, 3.0)
        XCTAssertEqual(DealParser.parse("20 % off", basePrice: 4.0)?.each, 3.2)
    }

    func testJunkTextNeverProducesABogusKind() {
        for t in ["", "   ", "Fresh Produce", "1/$5", "0/$5", "$5 for 2"] {
            let d = DealParser.parse(t, basePrice: 3.49)
            XCTAssertNotEqual(d?.kind, .multi, "\"\(t)\" -> \(String(describing: d))")
        }
        XCTAssertNil(DealParser.parse(nil, basePrice: 3.49))
    }

    func testNoParsedDealEverProducesNaNOrInfinity() {
        let texts = ["2 for $5", "BOGO", "Buy 2 Get 1 Free", "25% off", "Save $1.00", "2 for $0", "100% off", "Save $5.00", "$2 OFF (2)", "MUST BUY 2"]
        for t in texts {
            for base in [nil, 0, 1.99, 4.99, Double.nan] as [Double?] {
                guard let d = DealParser.parse(t, basePrice: base) else { continue }
                for (k, v) in [("each", d.each), ("total", d.total), ("save", d.save), ("pct", d.pct)] {
                    guard let v else { continue }
                    XCTAssertTrue(v.isFinite, "parse(\"\(t)\", \(String(describing: base))).\(k) = \(v)")
                }
            }
        }
    }
}

final class PortedFlippCouponTests: XCTestCase {
    /// An item shaped exactly as Flipp's item search returns it: the detail carries a sale story
    /// but NO dollarsOff, which is what selects the fallback that used to be wrong.
    private func searchItem(_ name: String, _ story: String, _ current: Double) -> (FlippSource.FlyerItem, FlippSource.Detail) {
        (FlippSource.FlyerItem(id: 1, flyerId: 1, name: name, brand: "", price: String(current), discount: nil, image: nil, validFrom: nil, validTo: nil),
         FlippSource.Detail(description: nil, pre: nil, priceText: nil, post: nil, story: story, original: nil, current: current,
                            disclaimer: nil, dollarsOff: nil, percentOff: nil, externalCategory: "Dairy"))
    }

    // MARK: FIX 19 — read the discount from the captured group

    func testCouponDiscountDoesNotSwallowTheBuyCount() {
        for (story, want) in [("75¢ OFF (1)", 0.75), ("50¢ OFF (2)", 0.5), ("$2 OFF (2)", 2.0),
                              ("$1 OFF (3)", 1.0), ("$3 OFF (4)", 3.0), ("$1.00 OFF (2)", 1.0), ("$1.50 OFF (1)", 1.5)] {
            let (item, det) = searchItem("Oscar Mayer Bacon", story, want)
            let d = FlippSource.deal(item: item, detail: det, retailerId: "jewel", merchant: "Jewel-Osco")
            XCTAssertEqual(d.terms?.save ?? -1, want, accuracy: 0.005,
                           "\"\(story)\" -> save \(String(describing: d.terms?.save)), shown as \"\(d.priceText)\"")
        }
    }

    func testCouponCardTextIsNotInflated() {
        let (item, det) = searchItem("Kraft Shredded Cheese", "$2 OFF (2)", 2)
        let d = FlippSource.deal(item: item, detail: det, retailerId: "jewel", merchant: "Jewel-Osco")
        XCTAssertEqual(d.priceText, "$2 off when you buy 2", "deal card reads \"\(d.priceText)\"")
        XCTAssertEqual(d.mustBuy, 2)
        XCTAssertTrue(d.coupon)
        XCTAssertNil(d.price, "a coupon amount is not a price")
    }

    // MARK: FIX 14 + 15 reaching the deal card

    func testMustBuyReachesTheDealCard() {
        for (story, want) in [("MUST BUY 2", 2), ("must buy 2 or pay $3.49 ea", 2), ("WHEN YOU BUY 4", 4), ("$3.99 EA WHEN YOU BUY 4", 4)] {
            let (item, det) = searchItem("Pepsi 12 Pack", story, 5.99)
            let d = FlippSource.deal(item: item, detail: det, retailerId: "jewel", merchant: "Jewel-Osco")
            XCTAssertEqual(d.mustBuy, want, "\"\(story)\" -> mustBuy \(String(describing: d.mustBuy)), price shown as \"\(d.priceText)\" with no qualifier")
        }
    }

    func testLimitStillSurvives() {
        let (item, det) = searchItem("Pepsi 12 Pack", "LIMIT 2", 5.99)
        let d = FlippSource.deal(item: item, detail: det, retailerId: "jewel", merchant: "Jewel-Osco")
        XCTAssertEqual(d.limit, 2)
    }
}

/// End-to-end: what the shopper actually sees. These mirror
/// basket/test/qa-compare-best-price.test.js and show the user-visible damage the unit and
/// relevance defects caused.
final class PortedBestPriceTests: XCTestCase {
    private func p(_ storeId: String, _ id: String, _ name: String, _ sizeText: String?, _ price: Double) -> Product {
        ProductFactory.make(ProductInput(storeId: storeId, id: id, name: name, sizeText: sizeText, price: price))!
    }

    func testCheapestButterIsNotPeanutButter() {
        let r = Compare.bestPerStore(query: "butter", results: [
            "jewel": [p("jewel", "j1", "Land O Lakes Salted Butter Sticks", "16 oz", 4.99)],
            "mariano": [p("mariano", "m1", "Jif Creamy Peanut Butter", "40 oz", 7.99),
                        p("mariano", "m2", "Challenge Unsalted Butter", "16 oz", 5.49)],
        ])
        let pick = r.stores["mariano"]?.product.name ?? ""
        XCTAssertFalse(pick.lowercased().contains("peanut"), "best \"butter\" at mariano = \"\(pick)\"")
    }

    func testCheapestCheeseIsNotCreamCheese() {
        let r = Compare.bestPerStore(query: "cheese", results: [
            "jewel": [p("jewel", "j1", "Tillamook Medium Cheddar Cheese Block", "8 oz", 3.99)],
            "mariano": [p("mariano", "m1", "Philadelphia Original Cream Cheese", "8 oz", 2.49),
                        p("mariano", "m2", "Kraft Sharp Cheddar Cheese Block", "8 oz", 4.29)],
        ])
        let pick = r.stores["mariano"]?.product.name ?? ""
        XCTAssertFalse(pick.lowercased().contains("cream cheese"), "best \"cheese\" at mariano = \"\(pick)\"")
    }

    func testWeightRangeDoesNotMakeAStoreLookSeventyFiveTimesCheaper() {
        let r = Compare.bestPerStore(query: "chicken breast", results: [
            "jewel": [p("jewel", "j1", "Tyson Boneless Skinless Chicken Breast", "2.5 lb", 12.99)],
            "mariano": [p("mariano", "m1", "Perdue Boneless Skinless Chicken Breast", "0.75-1.25 lb", 6.49)],
        ])
        let m = (r.stores["mariano"]?.perBase ?? 0) * 16
        let j = (r.stores["jewel"]?.perBase ?? 0) * 16
        XCTAssertGreaterThan(m, j / 3, "mariano $\(m)/lb vs jewel $\(j)/lb — the app would claim mariano is much cheaper")
    }

    func testNoStoreVanishesOverListingStyle() {
        let byStore: [String: [Product]] = [
            "jewel": [p("jewel", "j1", "Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans", nil, 8.99)],
            "mariano": [p("mariano", "m1", "Coca-Cola Cans", "12 pk, 12 fl oz", 8.49)],
            "aldi": [p("aldi", "a1", "Coca-Cola Classic Soda", "2 L", 2.79)],
        ]
        let r = Compare.bestPerStore(query: "coca cola", results: byStore)
        let dropped = byStore.keys.filter { r.stores[$0] == nil }.sorted()
        XCTAssertEqual(dropped, [], "dim=\(String(describing: r.dim)); dropped \(dropped.joined(separator: ", "))")
    }

    // MARK: controls

    func testBestPerStorePicksTheGenuinelyLowestUnitPrice() {
        let r = Compare.bestPerStore(query: "orange juice", results: [
            "jewel": [p("jewel", "j1", "Tropicana Pure Premium Orange Juice", "59 fl oz", 4.99),
                      p("jewel", "j2", "Great Value Orange Juice", "1 gal", 7.98)],
            "mariano": [p("mariano", "m1", "Florida's Natural Orange Juice", "52 fl oz", 4.49)],
        ])
        XCTAssertEqual(r.dim, .volume)
        XCTAssertEqual(r.stores["jewel"]?.product.productId, "j2", "the gallon is cheapest per fl oz")
        XCTAssertLessThan(r.stores["jewel"]?.perBase ?? .infinity, r.stores["mariano"]?.perBase ?? 0)
    }

    func testNoZeroNegativeOrInfiniteUnitPrice() {
        let r = Compare.bestPerStore(query: "milk", results: [
            "a": [p("a", "1", "Prairie Farms Whole Milk", "1 gal", 3.49),
                  p("a", "2", "Broken Listing Whole Milk", "0 oz", 2.99),
                  p("a", "3", "Free Whole Milk", "1 gal", 0)],
            "b": [p("b", "1", "Kemps Whole Milk", "half gallon", 2.49)],
        ])
        XCTAssertEqual(r.stores.count, 2, "a store dropped out; \"half gallon\" must parse")
        for (store, best) in r.stores {
            XCTAssertTrue(best.perBase.isFinite, "\(store): perBase=\(best.perBase)")
            XCTAssertGreaterThan(best.perBase, 0, "\(store): perBase=\(best.perBase) for \"\(best.product.name)\"")
        }
    }
}

// MARK: - Live outlier traps (mirrors basket/test/qa-match-relevance.test.js)
//
// Each of these scored a full 0.920 for "butter" in live Sam's Club and Costco results and then
// produced an absurd per-pound price. The cause was a conflated list: popcorn, danish and shrimp
// were in the fluid-vs-weight list in Units but never in Match's traps. The JS is the reference
// implementation; if one of these fails, fix BOTH sides in one change.
final class LiveOutlierTrapTests: XCTestCase {
    private func score(_ q: String, _ name: String) -> Double {
        Match.relevance(query: q, name: name, brand: "", category: nil)
    }

    func testSearchedWordAsModifierOfADifferentFoodIsRejected() {
        for (q, n) in [
            ("butter", "Banneton Bakery All Butter Danish Twist"),
            ("butter", "Kirkland Signature Garlic Butter Shrimp, 2 lbs"),
            ("butter", "ACT II Butter Lovers Microwave Popcorn"),
            ("milk", "Milk Chocolate Almonds"),
        ] {
            XCTAssertLessThan(score(q, n), Match.relevant, "\(q) -> \(n) was accepted")
        }
    }

    func testSearchingForThoseFoodsStillFindsThem() {
        // Every trap is guarded by "not in the query", so adding real product nouns must not make
        // those products unfindable.
        for (q, n) in [
            ("popcorn", "Skinny Pop Popcorn"),
            ("shrimp", "Kirkland Raw Shrimp"),
            ("bacon", "Oscar Mayer Center Cut Bacon"),
            ("salmon", "Atlantic Salmon Fillet"),
            ("chicken breast", "Perdue Boneless Skinless Chicken Breast"),
        ] {
            XCTAssertGreaterThanOrEqual(score(q, n), Match.relevant, "\(q) -> \(n) was rejected")
        }
    }

    func testRealButterIsUntouched() {
        for n in ["Land O Lakes Salted Butter", "Butter Quarters, Salted", "Kerrygold Salted Irish Butter Sticks"] {
            XCTAssertGreaterThanOrEqual(score("butter", n), Match.relevant, "\(n) was rejected")
        }
    }
}

// MARK: - Wrong prices (mirrors basket/test/qa-implausible-prices.test.js)
//
// A wrong price is worse than no price: this product is sold on the number being trustworthy, so a
// confidently-wrong figure is the most damaging defect available. The JS is the reference
// implementation; if one of these fails, fix BOTH sides in one change.
final class ImplausiblePriceTests: XCTestCase {
    private func item(_ storeId: String, _ name: String, _ sizeText: String, _ price: Double) -> Product {
        ProductFactory.make(ProductInput(storeId: storeId, id: "\(storeId)-\(name)", name: name, sizeText: sizeText, price: price))!
    }

    private var butter: [String: [Product]] {
        [
            "aldi": [item("aldi", "Countryside Creamery Salted Butter", "16 oz", 3.15)],
            "jewel": [item("jewel", "Land O Lakes Salted Butter", "16 oz", 4.99)],
            "marianos": [item("marianos", "Kroger Salted Butter", "16 oz", 4.49)],
            "traderjoes": [item("traderjoes", "Butter Quarters, Salted", "16 oz", 2.99)],
            "woodmans": [item("woodmans", "Salted Butter Quarters", "16 oz", 2.99)],
            "wholefoods": [item("wholefoods", "365 Salted Butter", "16 oz", 4.29)],
            // Sam's Club states one 4 oz stick's size but charges for the multi-pack: $58/lb.
            "samsclub": [item("samsclub", "Kerrygold Salted Irish Butter Sticks", "4 oz", 14.60)],
        ]
    }

    func testACasePricedOutlierNeverWinsBestPrice() {
        let (dim, stores) = Compare.bestPerStore(query: "butter", results: butter)
        XCTAssertEqual(dim, .weight)
        XCTAssertNil(stores["samsclub"], "a price we cannot believe became a store's headline number")
        for s in ["aldi", "jewel", "marianos", "traderjoes", "woodmans", "wholefoods"] {
            XCTAssertNotNil(stores[s], "\(s) lost its best price")
            XCTAssertNil(stores[s]?.product.implausible)
        }
    }

    func testAnImplausiblyCheapPriceIsFlaggedToo() {
        // Too cheap is the dangerous direction: it wins the comparison and becomes the headline.
        var withCheap = butter
        withCheap["cheap"] = [item("cheap", "Salted Butter", "16 oz", 0.12)]
        let (_, stores) = Compare.bestPerStore(query: "butter", results: withCheap)
        XCTAssertNil(stores["cheap"], "an unbelievable price won the comparison")
    }

    func testGenuineVariationIsLeftAlone() {
        // Organic against store brand is a real spread and must not be touched.
        let spread: [String: [Product]] = [
            "a": [item("a", "Store Brand Salted Butter", "16 oz", 2.99)],
            "b": [item("b", "Organic Grass-Fed Salted Butter", "16 oz", 8.99)],
            "c": [item("c", "Salted Butter", "16 oz", 4.49)],
            "d": [item("d", "Irish Salted Butter", "8 oz", 4.99)],
            "e": [item("e", "Salted Butter Quarters", "16 oz", 3.49)],
        ]
        let (_, stores) = Compare.bestPerStore(query: "butter", results: spread)
        XCTAssertEqual(stores.count, 5, "a 3x spread is normal and every store should still report")
    }

    func testTooFewResultsToJudgeMeansNothingIsFlagged() {
        var three = [item("a", "Salted Butter", "16 oz", 3.49), item("b", "Salted Butter", "16 oz", 3.99), item("c", "Salted Butter", "4 oz", 14.60)]
        Compare.flagImplausible(&three, dim: .weight)
        for p in three { XCTAssertNil(p.implausible, "flagged an outlier from too small a sample") }
    }

    // The egg carton bug: sizeText "1 ea" with the real count only in the name.
    func testABareEachNeverBeatsACountInTheName() {
        let p = item("costco", "Kirkland Signature Organic Eggs, Large, 24 count", "1 ea", 9.32)
        let per = p.unitPrice(.count)?.perBase
        XCTAssertNotNil(per)
        XCTAssertEqual(per!, 9.32 / 24, accuracy: 0.001, "a 24-count carton was priced per carton, not per egg")
    }

    func testARealEachIsStillAnEach() {
        // Bananas genuinely are sold each; the name adds no quantity, so nothing should change.
        let p = item("aldi", "Fresh Bananas", "each", 0.29)
        XCTAssertEqual(p.unitPrice(.count)?.perBase ?? -1, 0.29, accuracy: 0.001)
    }
}


// MARK: - Single-serve forms (mirrors basket/test/qa-match-relevance.test.js)
//
// A K-Cup box cannot be compared per pound with ground coffee, and a wellness shot is not a carton
// of juice. Found live at 16x to 59x the median unit price. The JS is the reference implementation.
final class SingleServeTrapTests: XCTestCase {
    private func score(_ q: String, _ name: String) -> Double {
        Match.relevance(query: q, name: name, brand: "", category: nil)
    }

    func testSingleServeFormsDoNotMatchThePlainQuery() {
        for (q, n) in [
            ("coffee", "Dunkin Original Blend Medium Roast Coffee, Keurig K-Cup Pods"),
            ("coffee", "Single Origin Kilimanjaro Instant Coffee"),
            ("coffee", "Starbucks Coffee Capsules"),
            ("orange juice", "Orange Juice Shot"),
        ] {
            XCTAssertLessThan(score(q, n), Match.relevant, "\(q) -> \(n) was accepted")
        }
    }

    func testAskingForThoseFormsOnPurposeStillFindsThem() {
        XCTAssertGreaterThanOrEqual(score("coffee pods", "Starbucks Coffee Pods"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("instant coffee", "Nescafe Instant Coffee"), Match.relevant)
        for n in ["Folgers Classic Roast Ground Coffee", "Maxwell House Original Ground Coffee"] {
            XCTAssertGreaterThanOrEqual(score("coffee", n), Match.relevant, "\(n) was rejected")
        }
        XCTAssertGreaterThanOrEqual(score("butter", "Kerrygold Salted Irish Butter Sticks"), Match.relevant)
    }
}


// MARK: - Non-food traps (mirrors basket/test/qa-match-relevance.test.js)
//
// Found in a live Austin sweep: "Body Butter" skincare matched a butter search at $119/lb.
// The controls matter as much as the traps: "pan" and "skillet" are deliberately NOT traps.
final class NonFoodTrapTests: XCTestCase {
    private func score(_ q: String, _ name: String) -> Double {
        Match.relevance(query: q, name: name, brand: "", category: nil)
    }

    func testSkincareDoesNotMatchAFoodQuery() {
        for (q, n) in [
            ("butter", "Moo Elixir The Body Butter Tallow-Based Skincare"),
            ("butter", "Barker Wellness Co Body Butter"),
            ("eggs", "Meadowgreek Cage-free Hard-boiled Eggs"),
        ] {
            XCTAssertLessThan(score(q, n), Match.relevant, "\(q) -> \(n) was accepted")
        }
    }

    func testPanAndSkilletAreNotTraps() {
        XCTAssertGreaterThanOrEqual(score("pizza", "DiGiorno Rising Crust Pan Pizza"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("pizza", "Red Baron Classic Crust Pepperoni Pizza"), Match.relevant)
    }

    func testTheFoodItselfIsUntouched() {
        for (q, n) in [
            ("butter", "Land O Lakes Salted Butter"),
            ("eggs", "Eggland's Best Large White Eggs"),
            ("milk", "Prairie Farms Whole Milk"),
        ] {
            XCTAssertGreaterThanOrEqual(score(q, n), Match.relevant, "\(q) -> \(n) was rejected")
        }
        XCTAssertGreaterThanOrEqual(score("body wash", "Dove Body Wash"), Match.relevant)
    }
}

/// The Christmas run (mirrors test/qa-christmas-dates.test.js): sale and weekly-ad dates are calendar
/// days, read in the shopper's time zone. "DEFECT" cases failed before the fix.
final class ChristmasDatesTests: XCTestCase {
    private var chicago: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Chicago")!
        return c
    }()
    private func at(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int = 0) -> Date {
        chicago.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi))!
    }
    private func ends(_ to: Date?, _ now: Date) -> String { SaleDates.endsText(to!, now: now, calendar: chicago) }

    func testDefectWholeFoodsSaleStillOnDuringItsLastDay() {
        let to = SaleDates.saleDay("2026-12-29T06:00:00Z", end: true, calendar: chicago)
        XCTAssertEqual(ends(to, at(2026, 12, 29, 10)), "Ends today")
        XCTAssertEqual(ends(to, at(2026, 12, 28, 10)), "Ends tomorrow")
        XCTAssertEqual(ends(to, at(2026, 12, 30, 0, 30)), "Ended")
        // September's page sends 05:00Z for the same wall-clock midnight: same last day.
        XCTAssertEqual(SaleDates.saleDay("2026-09-29T05:00:00Z", end: true, calendar: chicago), chicago.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 23, minute: 59, second: 59)))
    }

    func testDefectFlippAdIsItsPrintedDays() {
        let from = SaleDates.wallClock("2026-12-30T00:00:00-05:00", calendar: chicago)!
        XCTAssertEqual(chicago.component(.day, from: from), 30, "an Eastern-time start is not the day before in Chicago")
        let xmasEve = SaleDates.wallClock("2026-12-24T23:59:59-05:00", calendar: chicago)
        XCTAssertEqual(ends(xmasEve, at(2026, 12, 24, 23, 15)), "Ends today")
        XCTAssertEqual(ends(xmasEve, at(2026, 12, 23, 23, 30)), "Ends tomorrow")
        XCTAssertEqual(ends(xmasEve, at(2026, 12, 25, 0, 1)), "Ended")
    }

    func testControlNewYear() {
        let to = SaleDates.wallClock("2027-01-05T23:59:59-05:00", calendar: chicago)
        XCTAssertEqual(ends(to, at(2026, 12, 20, 12)), "Thru Jan 5")
        XCTAssertEqual(SaleDates.calendarDaysUntil(at(2027, 1, 1, 10), now: at(2026, 12, 31, 22), calendar: chicago), 1)
        XCTAssertNil(SaleDates.wallClock("Dec 24"))
        XCTAssertNil(SaleDates.saleDay(nil, end: true))
    }
}

/// The Christmas basket (mirrors test/qa-christmas-pricing.test.js).
final class ChristmasPricingTests: XCTestCase {
    private func score(_ q: String, _ name: String) -> Double { Match.relevance(query: q, name: name) }

    func testDefectDecorIsNotGroceries() {
        XCTAssertLessThan(score("candy canes", "Holiday Time Indoor/Outdoor LED Light-Up Christmas Candy Cane Lawn Stakes - Red & White"), Match.relevant)
        XCTAssertLessThan(score("gingerbread", "Gingerbread Man Scented Candle, 14 oz"), Match.relevant)
    }

    func testDefectRealCandyCanesMatch() {
        XCTAssertGreaterThanOrEqual(score("candy canes", "Brach's Peppermint Candy Canes, 12 ct"), Match.relevant)
        XCTAssertLessThan(score("candy canes", "Cherry Candy Canes"), Match.relevant)
        XCTAssertLessThan(score("milk", "Peppermint Milk"), Match.relevant)
    }

    func testDefectSprinklesMix() {
        XCTAssertGreaterThanOrEqual(score("sprinkles", "Wilton Christmas Sprinkles Mix"), Match.relevant)
        XCTAssertLessThan(score("sprinkles", "Betty Crocker Cake Mix Sprinkles"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("christmas tree cakes", "Little Debbie Christmas Tree Cakes, 10 ct"), Match.relevant)
    }
}

extension ChristmasPricingTests {
    func testDefectFlavouredWaterAndOceanSpray() {
        XCTAssertLessThan(score("sparkling cider", "Spiced Cider Sparkling Water 12pk"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("sparkling cider", "Martinelli's Sparkling Cider, 25.4 fl oz"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("crackers", "Carr's Table Water Crackers"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("cranberry sauce", "Ocean Spray Jellied Cranberry Sauce"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("cranberry juice", "Ocean Spray Cranberry Juice Cocktail"), Match.relevant)
        XCTAssertLessThan(score("cranberry juice", "Cranberry Vodka Cocktail"), Match.relevant)
        XCTAssertLessThan(score("sparkling cider", "Samuel Smith Organic Perry Sparkling Pear Cider"), Match.relevant)
    }
}

extension ChristmasPricingTests {
    func testDefectGelatinAndScrub() {
        XCTAssertLessThan(score("eggnog", "D'Gari Gelatin Dessert, Eggnog"), Match.relevant)
        XCTAssertLessThan(score("candy canes", "Tree Hut TH Candy Cane Scrub"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("gelatin", "Knox Unflavored Gelatin"), Match.relevant)
    }
}

/// The St. Patrick's run (mirrors test/qa-stpatricks.test.js) and the holiday cards.
final class StPatricksTests: XCTestCase {
    private func score(_ q: String, _ name: String) -> Double { Match.relevance(query: q, name: name) }

    func testDefectCornedBeefHashIsNotCornedBeef() {
        XCTAssertLessThan(score("corned beef", "Food Club Corned Beef Hash"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("corned beef", "Mosey's Corned Beef Brisket Point Cut with Spice Packet"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("corned beef hash", "Hormel Corned Beef Hash, 15 oz"), Match.relevant)
    }

    func testDefectBabyVegetablesAreVegetables() {
        XCTAssertGreaterThanOrEqual(score("carrots", "Baby Carrots 1 lb"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("spinach", "Baby Spinach 5 oz"), Match.relevant)
        XCTAssertLessThan(score("carrots", "Gerber Baby Food Carrots Puree"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("formula", "Similac Baby Formula"), Match.relevant)
    }

    func testDefectDollAndFries() {
        XCTAssertLessThan(score("cabbage", "Cabbage Patch Kids Doll"), Match.relevant)
        XCTAssertLessThan(score("russet potatoes", "Ore-Ida Russet Potato Fries"), Match.relevant)
        XCTAssertGreaterThanOrEqual(score("french fries", "Ore-Ida Golden Crinkles French Fries"), Match.relevant)
    }

    private func day(_ y: Int, _ m: Int, _ d: Int) -> Date { Calendar.current.date(from: DateComponents(year: y, month: m, day: d, hour: 9))! }

    func testDefectBothHolidaysAreFeatured() {
        // Hanukkah 2027 begins Dec 24: the one-card version showed it instead of Christmas all December.
        let dec = Seasonal.featured(from: day(2027, 12, 10)).map(\.name)
        XCTAssertTrue(dec.contains("Christmas"), "\(dec)")
        XCTAssertTrue(dec.contains("Hanukkah"), "\(dec)")
        let mar = Seasonal.featured(from: day(2027, 3, 1)).map(\.name)
        XCTAssertTrue(mar.contains("St. Patrick’s Day"), "\(mar)")
        XCTAssertLessThanOrEqual(mar.count, 2)
    }
}

extension StPatricksTests {
    func testDefectTieGoesToTheShelfPrice() {
        XCTAssertEqual(Compare.tieBreak(.shelf, false, .online, false), true)
        XCTAssertEqual(Compare.tieBreak(.online, false, .shelf, false), false)
        XCTAssertEqual(Compare.tieBreak(.shelf, true, .shelf, false), false)
        XCTAssertNil(Compare.tieBreak(.shelf, false, .shelf, false))
    }
}

/// Apple-device review (mirrors test/qa-deal-terms.test.js): a buy-some-get-some badge is the offer.
final class DealBadgeTests: XCTestCase {
    func testDefectMultiBuyBadgeIsTheOffer() {
        XCTAssertEqual(DealParser.parse("Buy 1 Get 1 Free")?.offerBadge, "Buy 1 get 1 free")
        XCTAssertEqual(DealParser.parse("Buy 2, Get 1 Free")?.offerBadge, "Buy 2 get 1 free")
        XCTAssertNil(DealParser.parse("30% off")?.offerBadge)
    }
}

final class UnitPriceFormatTests: XCTestCase {
    /// A $1.99 two-pound bag is 99.5¢/lb; the 0.995 cut printed it "$0.99" (mirrors qa-chart-scale).
    func testDefectNinetyNineAndAHalfCents() {
        XCTAssertEqual(Money.unit(1.99 / 32, .lb), "99.5¢")
        XCTAssertEqual(Money.unit(0.99 / 16, .lb), "99¢")
        XCTAssertEqual(Money.unit(1.0 / 16, .lb), "$1.00")
    }
}

extension UnitPriceFormatTests {
    /// The per-store chart's "≈ same" follows `standings`: an Instacart price a few cents over a shelf
    /// price is not beaten; a clearly dearer one is.
    func testChartCloseFollowsStandings() {
        XCTAssertTrue(Compare.isClose(winner: 0.25, .shelf, false, to: 0.27, .online, false))
        XCTAssertFalse(Compare.isClose(winner: 0.25, .shelf, false, to: 0.40, .online, false))
        XCTAssertFalse(Compare.isClose(winner: 0.25, .shelf, false, to: 0.30, .shelf, false))
    }
}

extension UnitPriceFormatTests {
    func testDefectPromoNeverCutThroughAPrice() {
        XCTAssertEqual(Money.shortPromo("Mix & match 5 for $12.50 with card"), "Mix & match 5 for $12.50 with card")
        XCTAssertEqual(Money.shortPromo("Select varieties while supplies last"), "Select varieties…")
    }

    func testDefectOneDayAway() {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date())!
        let o = Occasion(id: "t", name: "Christmas", date: tomorrow, symbol: "gift", blurb: "", keywords: [], list: [])
        XCTAssertEqual(o.whenText, "is tomorrow")
    }
}

/// The nationwide staples audit (mirrors test/qa-nationwide.test.js).
final class NationwideAuditTests: XCTestCase {
    func testDefectBareQuartOnALiquid() {
        XCTAssertEqual(Units.sizeFromName("Alta Dena Whole Milk, Paper Quart")?.base, 32)
        XCTAssertNil(Units.sizeFromName("Ziploc Quart Freezer Bags"))
        XCTAssertLessThan(Match.relevance(query: "eggs", name: "Surprise Crystal Egg"), Match.relevant)
    }

    /// Denver: a slug that only ends in the stated size does not settle a name that says otherwise.
    func testDefectHalfGallonStatedTwoGallonsIsAConflict() {
        let milk = ProductFactory.make(ProductInput(
            storeId: "kingsoopers", id: "ks-1", name: "King Soopers® City Market® 2% Reduced Fat Milk Half Gallon", sizeText: "2 gal",
            price: 2.99, soldBy: .each, url: URL(string: "https://www.instacart.com/products/19280305-king-soopers-2-reduced-fat-milk-2-gal?retailerSlug=king-soopers"), category: nil, priceBasis: .online
        ))!
        XCTAssertNotNil(milk.sizeConflict)
        XCTAssertNil(milk.unitPrice(.volume))
        // Control: Costco's slug says 10 lbs in the name part too, so that one is settled.
        let potatoes = ProductFactory.make(ProductInput(
            storeId: "costco", id: "c-1", name: "Sweet Potatoes, 5 lbs", sizeText: "10 lb",
            price: 8.07, soldBy: .each, url: URL(string: "https://www.instacart.com/products/18848374-sweet-potatoes-10-lbs-10-lb?retailerSlug=costco"), category: nil, priceBasis: .shelf
        ))!
        XCTAssertNil(potatoes.sizeConflict)
    }

    /// Minneapolis/Dallas: juice-flavoured drinks are not juice; "from concentrate" juice is.
    func testDefectCitrusPunchIsNotOrangeJuice() {
        XCTAssertLessThan(Match.relevance(query: "orange juice", name: "Sunny D Citrus Punch, Tangy Original, 11.3 fl oz, 30-Count", category: "Orange Juice"), Match.relevant)
        XCTAssertLessThan(Match.relevance(query: "orange juice", name: "Sunnyd Tangy Original Orange Juice"), Match.relevant)
        XCTAssertGreaterThanOrEqual(Match.relevance(query: "orange juice", name: "Minute Maid Orange Juice From Concentrate"), Match.relevant)
        XCTAssertLessThan(Match.relevance(query: "orange juice", name: "Minute Maid Frozen Orange Juice Concentrate"), Match.relevant)
        XCTAssertGreaterThanOrEqual(Match.relevance(query: "cranberry juice", name: "Ocean Spray Cranberry Juice Cocktail"), Match.relevant)
        XCTAssertGreaterThanOrEqual(Match.relevance(query: "fruit punch", name: "Hawaiian Punch Fruit Juicy Red"), Match.relevant)
    }
}
