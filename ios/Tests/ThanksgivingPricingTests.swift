import XCTest
@testable import Cartworth

/// The Thanksgiving basket sweep across Chicago (60618), Lombard (60148), Milwaukee (53211) and
/// Kenosha (53142). Every defect here put a wrong number in front of a shopper, and several were
/// cases where the phone and the website disagreed — the failure the owner cares most about.
///
/// The numbering matches the sweep's finding numbers.
final class ThanksgivingMatcherParityTests: XCTestCase {
    private func score(_ q: String, _ name: String, brand: String? = nil, category: String? = nil) -> Double {
        Match.relevance(query: q, name: name, brand: brand, category: category)
    }
    private func rejects(_ q: String, _ name: String, brand: String? = nil, category: String? = nil, _ msg: String = "", file: StaticString = #filePath, line: UInt = #line) {
        let s = score(q, name, brand: brand, category: category)
        XCTAssertLessThan(s, Match.relevant, "\"\(q)\" vs \"\(name)\" scored \(s) — wrong product accepted. \(msg)", file: file, line: line)
    }
    private func matches(_ q: String, _ name: String, brand: String? = nil, category: String? = nil, _ msg: String = "", file: StaticString = #filePath, line: UInt = #line) {
        let s = score(q, name, brand: brand, category: category)
        XCTAssertGreaterThanOrEqual(s, Match.relevant, "\"\(q)\" vs \"\(name)\" scored \(s) — real match rejected. \(msg)", file: file, line: line)
    }

    // DEFECT 11: the iOS matcher had no counterpart to the web's imitation rule, so a search for
    // "butter" crowned margarine. "Best Choice Tastes Like Butter" scored 0.920 here against 0.276
    // on the web and took the BEST PRICE card at Tony's, beating real butter at four other stores.
    func testMargarineDoesNotWinAButterSearch() {
        rejects("butter", "Best Choice Tastes Like Butter", "margarine sold as 'Tastes Like Butter'")
        rejects("butter", "Imitation Butter Spread")
        rejects("cheese", "Cheese-Style Shreds")
    }

    func testAskingForTheImitationOnPurposeStillFindsIt() {
        // The 0.3 imitation multiplier is waived when the query names the imitation category, so
        // "Tastes Like" stops being a penalty. The ordinary trap rules still apply on top: a name
        // that also says "Butter" is only forgiven when the shopper asked for butter too, which is
        // why the first case names both words. Both figures match shared/match.js exactly.
        matches("margarine", "Tastes Like Margarine Sticks")
        matches("butter margarine", "Best Choice Tastes Like Butter Margarine")
        matches("plant based spread", "Tastes Like Dairy Plant Based Spread")
    }

    // DEFECT 12: a can of dog food headlined "whole turkey" at $2.78/lb. The web rejects it at
    // 0.320 because 'potato'/'potatoes' are traps there; the iOS trap set was missing both, along
    // with buttery, gratin, imitation, margarine, mashed and pilaf.
    //
    // Round 1's version passed with the gap put back: the brand rule already sank "Whole Paws" to
    // 0.275, so the missing 'potato' trap was never the thing deciding it. This name carries every
    // query word itself and nothing else that is a trap ('gravy' follows "in", which is forgiven),
    // so only the 'potato' trap stands between it and the whole-turkey headline.
    func testDogFoodDoesNotWinAWholeTurkeySearch() {
        rejects("whole turkey", "Whole Turkey & Sweet Potatoes Recipe in Gravy", "only the 'potato' trap can reject this")
        matches("whole turkey", "Whole Turkey Recipe in Gravy", "control: the same name without the potato must match")
    }

    // Round 1's three names each carried two or three traps at once ("Buttery Mashed Potatoes",
    // "Potato Gratin Dinner Kit"), so deleting any one missing word from the Swift set changed
    // nothing. Each pair below differs by ONE word, the trap it pins, and the control half proves
    // that word is the only thing rejecting it. ('imitation' is also caught by the imitation rule,
    // pinned by testMargarineDoesNotWinAButterSearch, and 'potatoes' stems to 'potato'.)
    func testTheTrapWordsTheWebHasArePresentHereToo() {
        for (q, trapped, plain) in [
            ("crackers", "Buttery Crackers", "Crackers"),
            ("potatoes", "Potatoes Gratin", "Potatoes"),
            ("sticks", "Margarine Sticks", "Sticks"),
            ("potatoes", "Mashed Potatoes", "Potatoes"),
            ("rice", "Rice Pilaf", "Rice"),
            ("chips", "Potato Chips", "Chips"),
        ] {
            rejects(q, trapped, "the trap word is missing from Match.swift")
            matches(q, plain)
        }
    }

    // DEFECT 2: "Sweet Cream Butter" is the standard US label for plain butter.
    func testSweetCreamButterIsButter() {
        matches("butter", "Countryside Creamery Sweet Cream Butter - 4 Sticks")
        matches("butter", "Kirkland Signature Salted Sweet Cream Butter, 16 oz, 4-count")
        matches("butter", "Land O Lakes Salted Sweet Cream Butter")
    }

    func testCreamCheeseIsStillNotCheese() {
        rejects("cheese", "Philadelphia Cream Cheese")
        rejects("butter", "Sweet Cream Ice Cream")
    }

    // DEFECT 4: the retailer's trading name fed the relevance score, so every Whole Foods product
    // matched any "whole X" query.
    func testARetailerTradingNameDoesNotSupplyQueryWords() {
        rejects("whole turkey", "Dark Ground Turkey", brand: "365 By Whole Foods Market")
        XCTAssertEqual(
            score("whole turkey", "Dark Ground Turkey", brand: "365 By Whole Foods Market"),
            score("whole turkey", "Dark Ground Turkey", brand: "365"),
            accuracy: 0.0005,
            "the brand still changed the score"
        )
    }

    func testABrandThatIdentifiesTheProductStillCounts() {
        matches("kerrygold butter", "Salted Irish Butter Sticks", brand: "Kerrygold")
        matches("whole milk", "Organic Whole Milk", brand: "365 By Whole Foods Market")
    }

    // DEFECT 5 / 8: a product filed under exactly the searched phrase could not reach the cut, and
    // the MILD word 'frozen' cost another 42%, so every frozen and category-only whole bird landed
    // in the 0.30-0.52 band and Woodman's $1.69/lb birds were hidden.
    func testACategoryThatIsTheSearchPhraseIsAMatch() {
        matches("whole turkey", "Jennie-O Less Than 14 Pounds Turkey", category: "Whole Turkey")
        matches("whole turkey", "Fresh Turkeys", category: "Whole Turkey")
        matches("whole turkey", "Jennie-O Whole Frozen Turkey", category: "Frozen Whole Turkey")
        matches("whole turkey", "Honeysuckle White Whole Frozen Young Turkey", category: "Whole Turkey")
    }

    func testAnExactCategoryDoesNotForgiveADifferentCommodity() {
        rejects("fresh cranberries", "Best Choice Dried Cranberries", category: "Dried Cranberries")
        rejects("milk", "Almond Breeze Almond Milk", category: "Milk")
        rejects("butter", "Organic Apricot Preserves", category: "Nut Butters & Fruit Spreads")
        rejects("turkey", "Organic Free Range Boneless Skinless Thighs", category: "Chicken & Turkey")
    }

    // DEFECT 9: singular("cookies") returned "cooky", so cookie products escaped the trap list.
    func testIePluralsStemToTheIeForm() {
        XCTAssertEqual(Match.singular("cookies"), "cookie")
        XCTAssertEqual(Match.singular("brownies"), "brownie")
        XCTAssertEqual(Match.singular("smoothies"), "smoothie")
        // ...and -y nouns are unchanged.
        XCTAssertEqual(Match.singular("berries"), "berry")
        XCTAssertEqual(Match.singular("anchovies"), "anchovy")
        XCTAssertEqual(Match.singular("pastries"), "pastry")
    }

    func testABoxOfCookiesIsNotTheCheapestPecans() {
        rejects("pecans", "Benton's Pecan Shortbread Cookies", category: "Packaged Cookies")
        rejects("fresh cranberries", "Bake Shop Oatmeal Cranberry Cookies - 10 Count")
        matches("pecans", "Southern Grove Chopped Pecans")
    }

    // DEFECT 15 / 21: 'bean' was not a trap, so baked beans became the cheapest brown sugar.
    func testBakedBeansAreNotBrownSugar() {
        rejects("brown sugar", "Dakota's Pride Brown Sugar & Hickory Baked Beans")
        rejects("brown sugar", "Meijer Brown Sugar Hickory Baked Beans")
        matches("brown sugar", "Simply Nature Organic Light Brown Sugar Pouch")
        // A trap is skipped whenever the shopper typed it.
        matches("green beans", "Del Monte Blue Lake Cut Green Beans")
        matches("baked beans", "Bush's Best Original Baked Beans")
    }

    // DEFECT 26: alcohol, cosmetics and books answered grocery searches.
    func testNonGroceriesDoNotAnswerAGrocerySearch() {
        rejects("apple cider", "Right Bee Cider Hard Apple Cider, Clementine")
        rejects("heavy cream", "Redken All Soft Heavy Cream Treatment")
        rejects("turkey", "Turkey in Disguise (Hardcover) - Adam Wallace")
        rejects("marshmallows", "Owala Shy Marshmallow 24 Oz Slider Stainless Steel Bottle with Handle")
        rejects("pumpkin pie", "McCormick Pumpkin Pie Spice")
        matches("apple cider", "Riveridge Cider 100% Apple Cider Blend")
        matches("hard cider", "Right Bee Cider Hard Apple Cider")
        matches("pumpkin pie spice", "McCormick Pumpkin Pie Spice")
    }
}

final class ThanksgivingPriceGuardTests: XCTestCase {
    private func item(_ storeId: String, _ name: String, _ sizeText: String, _ price: Double, soldBy: SoldBy = .each, category: String? = nil, url: String? = nil) -> Product {
        ProductFactory.make(ProductInput(
            storeId: storeId, id: "\(storeId)-\(name)", name: name, sizeText: sizeText,
            price: price, soldBy: soldBy, url: url.flatMap(URL.init(string:)), category: category
        ))!
    }

    // DEFECT 1: Sam's Club states one stick's size and charges for the six-pack; the count exists
    // only in the URL, so $9.73/lb butter was published at $58.40/lb.
    func testAPackCountStatedOnlyInTheUrlIsNotThrownAway() {
        let p = item("samsclub", "Kerrygold Salted Irish Butter Sticks", "4 oz", 14.60,
                     url: "https://www.instacart.com/products/76160768-kerrygold-salted-butter-sticks-4-oz-6-pk?retailerSlug=sams-club")
        XCTAssertEqual(p.base ?? 0, 24, accuracy: 0.001, "6 x 4 oz is 24 oz")
        XCTAssertEqual((p.unitPrice(.weight)?.perBase ?? 0) * 16, 9.73, accuracy: 0.01)
        XCTAssertEqual(p.size, "6 × 4 oz", "the shopper must be able to see the pack that was applied")
    }

    func testABareSlugPackCountIsNotEnoughToMultiplyASize() {
        // Of 115 listings with a bare "-N-ct" in the slug, most already stated the pack TOTAL.
        let rolls = item("picknsave", "Private Selection Hawaiian Dinner Rolls", "16 oz", 3.79,
                         url: "https://www.instacart.com/products/12345-private-selection-hawaiian-dinner-rolls-12-ct?retailerSlug=pick-n-save")
        XCTAssertEqual(rolls.base ?? 0, 16, accuracy: 0.001, "a 16 oz bag of rolls became 12 lb of bread")
    }

    // DEFECT 19 / 28: Costco lists "Sweet Potatoes, 5 lbs" with a stated size of 10 lb, and the app
    // silently kept the reading that halves the unit price and wins the best-price badge.
    func testAContradictoryRowIsRecordedAndCannotWinBestPrice() {
        let p = item("costco", "Sweet Potatoes, 5 lbs", "10 lb", 8.07)
        XCTAssertEqual(p.sizeConflict, SizeConflict(text: "10 lb", name: "5 lb"))

        let results: [String: [Product]] = [
            "costco": [p],
            "woodmans": [item("woodmans", "Sweet Potato (Yam)", "per lb", 0.99, soldBy: .lb)],
            "aldi": [item("aldi", "Sweet Potatoes", "3 lb", 3.49)],
            "jewel": [item("jewel", "Sweet Potatoes", "per lb", 1.29, soldBy: .lb)],
        ]
        let (_, stores) = Compare.bestPerStore(query: "sweet potatoes", results: results)
        XCTAssertNil(stores["costco"], "a row contradicting itself by 2x took the best-price badge")
    }

    func testASizePickSizeResolvesIsNotAConflict() {
        let milk = item("costco", "Kirkland Ultra Filtered 2% Lactose Free Milk, Half Gallon, 3-count", "64 fl oz", 14.92)
        XCTAssertNil(milk.sizeConflict)
        let eggs = item("costco", "Kirkland Signature Eggs, Large, 24-count", "1 ea", 4.71)
        XCTAssertNil(eggs.sizeConflict)
    }

    // DEFECT 10: the 8x guard suppressed genuine loss-leaders. A "turkey" search is dominated by
    // deli and ground turkey, so the live median sat near $10/lb and the old floor landed at
    // $1.11-$1.29/lb — inside the range a supermarket really sells a Thanksgiving bird for.
    private func turkeyMarket() -> [String: [Product]] {
        [
            "a": [item("a", "Deli Turkey Breast", "per lb", 9.49, soldBy: .lb)],
            "b": [item("b", "Oven Roasted Turkey Breast", "per lb", 9.99, soldBy: .lb)],
            "c": [item("c", "Ground Turkey", "per lb", 5.99, soldBy: .lb)],
            "d": [item("d", "Turkey Breast Tenderloin", "per lb", 8.99, soldBy: .lb)],
            "e": [item("e", "Organic Turkey Breast", "per lb", 11.99, soldBy: .lb)],
            "f": [item("f", "Turkey Pastrami", "per lb", 12.99, soldBy: .lb)],
        ]
    }

    func testARealHolidayLossLeaderSurvives() {
        for price in [0.37, 0.49, 0.99] {
            var results = turkeyMarket()
            results["doorbuster"] = [item("doorbuster", "Honeysuckle White Frozen Whole Turkey", "per lb", price, soldBy: .lb, category: "Whole Turkey")]
            let (_, stores) = Compare.bestPerStore(query: "turkey", results: results)
            XCTAssertNotNil(stores["doorbuster"], "a genuine $\(price)/lb bird was suppressed as 'price looks wrong'")
        }
    }

    func testAPriceNoGroceryCanBeIsStillRefused() {
        var results = turkeyMarket()
        results["broken"] = [item("broken", "Whole Turkey", "per lb", 0.02, soldBy: .lb, category: "Whole Turkey")]
        let (_, stores) = Compare.bestPerStore(query: "turkey", results: results)
        XCTAssertNil(stores["broken"], "an impossible price became the headline")
    }

    // DEFECT 17: warehouse-club case prices sat at 5.7x to 6.7x the median and slipped under 8x.
    // Round 1's fixture sat at 8.37x, which the OLD cut already caught; these sit where the fix is.
    func testACasePriceQuotedAsOneUnitIsCaught() {
        for samsPrice in [9.06, 9.86, 10.6] {
            let results: [String: [Product]] = [
                "aldi": [item("aldi", "Baker's Corner Evaporated Milk", "12 fl oz", 0.99)],
                "jewel": [item("jewel", "Carnation Evaporated Milk", "12 fl oz", 1.79)],
                "tonys": [item("tonys", "Carnation Evaporated Milk", "12 fl oz", 1.59)],
                "meijer": [item("meijer", "Meijer Evaporated Milk", "12 fl oz", 1.29)],
                "samsclub": [item("samsclub", "Carnation Evaporated Milk", "12 fl oz", samsPrice)],
            ]
            let ratio = (results["samsclub"]![0].unitPrice(.volume)!.perBase) / (results["tonys"]![0].unitPrice(.volume)!.perBase)
            XCTAssert(ratio > 5.6 && ratio < 6.8, "fixture drifted to \(ratio)x")
            let (_, stores) = Compare.bestPerStore(query: "evaporated milk", results: results)
            XCTAssertNil(stores["samsclub"], "$\(samsPrice) for one 12 fl oz can (\(ratio)x) was presented as a real price")
        }
    }

    // DEFECT 18: the count dimension counts PACKAGES, so a 50-sheet box sits far from a median made
    // of single rolls. Correct per-sheet foil prices were being badged "price looks wrong".
    func testACorrectPerSheetPriceIsNotCalledWrong() {
        var foil = [
            item("woodmans", "Simply Done Foil Sheets, Aluminum, Pre-Cut", "50 ct", 2.69),
            item("picknsave", "Kroger Aluminum Pre-Cut Foil Sheets", "50 ct", 3.99),
            item("meijer", "Meijer Aluminum Foil", "1 ct", 5.99),
            item("aldi", "Boulder Aluminum Foil", "1 ct", 3.95),
            item("samsclub", "Members Mark Heavy Duty Foil 2pk", "1 ct", 13.83),
            item("costco", "Kirkland Signature Aluminum Foil", "1 ct", 55.97),
        ]
        Compare.flagImplausible(&foil, dim: .count)
        for p in foil {
            XCTAssertNil(p.implausible, "\"\(p.name)\" was told its correct price looks wrong")
        }
    }

    // DEFECT 23 / 24: invented per-pound estimates, and identical cans landing in different
    // dimensions depending on whether the label said "in Syrup".
    func testNoPerPoundEstimateIsInventedForThingsThatAreNotOnePiece() {
        XCTAssertNil(Units.produceWeightLb("Mama Bean Vermicelli Tom Yam"))
        XCTAssertNil(Units.produceWeightLb("Sweety Mochi, Ube Purple Yam"))
        XCTAssertNil(Units.produceWeightLb("Yellow Onion Bag"))
        // Loose produce still gets its estimate.
        XCTAssertEqual(Units.produceWeightLb("Bananas") ?? 0, 0.33, accuracy: 0.001)
        XCTAssertEqual(Units.produceWeightLb("Sweet Potato") ?? 0, 0.6, accuracy: 0.001)
    }

    func testAPackingMediumDoesNotMakeACanALiquid() {
        // None of these names carries a solid word, so only the packing-medium rule decides them
        // (round 1's names were all decided by 'yams' / 'sweet potato' before it was consulted).
        for (size, name) in [("15.25 oz", "Del Monte Sliced Peaches in Light Syrup"), ("15 oz", "Sweet Harvest Peach Slices in 100% Juice"),
                             ("20 oz", "Sweet Harvest Pineapple Chunks in Pineapple Juice"), ("15 oz", "Meijer Red Tart Pitted Cherries In Water")] {
            XCTAssertEqual(Units.coerceLiquid(Units.parseSize(size), name: name)?.dim, .weight, name)
        }
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("14 oz"), name: "Baker's Corner Jellied Cranberry Sauce")?.dim, .weight)
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("10.5 oz"), name: "Chef's Cupboard Condensed Cream of Mushroom Soup")?.dim, .weight)
        // Things really sold in fluid ounces stay in volume.
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("32 oz"), name: "Chef's Cupboard Chicken Broth")?.dim, .volume)
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("12 oz"), name: "Coca-Cola Cans")?.dim, .volume)
        XCTAssertEqual(Units.coerceLiquid(Units.parseSize("5 oz"), name: "StarKist Chunk Light Tuna in Water")?.dim, .weight)
    }
}
