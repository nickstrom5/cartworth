import Foundation

/// Known US grocery chains and where their prices/ads come from.
/// Used to match Apple Maps store names and Flipp merchants to price sources.
struct Chain: Hashable {
    var id: String
    var name: String
    var short: String
    /// Lowercased name fragments that identify the chain in map listings
    var aliases: [String]
    var source: SourceKind
    var flipp: [String]
    var note: String?
    /// Prices the same everywhere, so Instacart's canonical (national) storefront may price it,
    /// labelled 'national'. Only Walmart. For every other chain a canonical storefront is some
    /// other region's store — Hy-Vee answered Milwaukee from Lincoln, NE — and means "not here".
    /// Same rule as `chainWide` in shared/catalog.js.
    var chainWide: Bool = false

    var retailer: Retailer {
        Retailer(id: id, name: name, short: short, source: source, adMerchants: flipp, logoURL: nil, note: note)
    }
}

enum RetailerCatalog {
    private static func ic(_ slug: String) -> SourceKind { .instacart(base: "https://www.instacart.com", slug: slug, guest: .implicit) }

    // BEGIN GENERATED CHAINS — scripts/gen-ios-catalog.js from shared/catalog.js. Do not edit by hand.
    static let chains: [Chain] = [
        Chain(id: "aldi", name: "ALDI", short: "ALDI", aliases: ["aldi"], source: .instacart(base: "https://www.aldi.us", slug: "aldi", guest: .implicit), flipp: ["ALDI"], note: "In-store shelf prices."),
        Chain(id: "woodmans", name: "Woodman’s", short: "Woodman’s", aliases: ["woodman"], source: .instacart(base: "https://shopwoodmans.com", slug: "woodmans-food-markets", guest: .postal), flipp: ["Woodman's Food Market"], note: "In-store shelf prices."),
        Chain(id: "wholefoods", name: "Whole Foods Market", short: "Whole Foods", aliases: ["whole foods"], source: .wholeFoods, flipp: [], note: "Shelf prices, including sale and Prime member prices."),
        Chain(id: "traderjoes", name: "Trader Joe’s", short: "Trader Joe’s", aliases: ["trader joe"], source: .traderJoes, flipp: [], note: "Posted shelf prices. Trader Joe’s doesn’t run weekly sales."),
        Chain(id: "walmart", name: "Walmart", short: "Walmart", aliases: ["walmart"], source: ic("walmart"), flipp: ["Walmart"], note: "Walmart labels these “no markups”, so they track the shelf price.", chainWide: true),
        Chain(id: "target", name: "Target", short: "Target", aliases: ["target"], source: .adsOnly, flipp: ["Target"], note: "Weekly ad only — Target blocks automated price lookups."),
        Chain(id: "costco", name: "Costco", short: "Costco", aliases: ["costco"], source: ic("costco"), flipp: ["Costco"], note: "Same-day prices run above the warehouse shelf."),
        Chain(id: "samsclub", name: "Sam’s Club", short: "Sam’s Club", aliases: ["sam's club", "sams club"], source: ic("sams-club"), flipp: ["Sam's Club"]),
        Chain(id: "bjs", name: "BJ’s Wholesale", short: "BJ’s", aliases: ["bj's wholesale", "bjs wholesale"], source: ic("bjs"), flipp: ["BJ's Wholesale Club"]),
        Chain(id: "lidl", name: "Lidl", short: "Lidl", aliases: ["lidl"], source: .adsOnly, flipp: ["Lidl", "LIDL"], note: "Weekly ad only."),
        Chain(id: "dollargeneral", name: "Dollar General", short: "Dollar General", aliases: ["dollar general"], source: .adsOnly, flipp: ["Dollar General"], note: "Weekly ad only."),
        Chain(id: "dollartree", name: "Dollar Tree", short: "Dollar Tree", aliases: ["dollar tree"], source: .adsOnly, flipp: ["Dollar Tree"], note: "Weekly ad only."),
        Chain(id: "familydollar", name: "Family Dollar", short: "Family Dollar", aliases: ["family dollar"], source: .adsOnly, flipp: ["Family Dollar"], note: "Weekly ad only."),
        Chain(id: "kroger", name: "Kroger", short: "Kroger", aliases: ["kroger"], source: ic("kroger"), flipp: ["Kroger"]),
        Chain(id: "ralphs", name: "Ralphs", short: "Ralphs", aliases: ["ralphs"], source: ic("ralphs"), flipp: ["Ralphs"]),
        Chain(id: "fredmeyer", name: "Fred Meyer", short: "Fred Meyer", aliases: ["fred meyer"], source: ic("fred-meyer"), flipp: ["Fred Meyer"]),
        Chain(id: "kingsoopers", name: "King Soopers", short: "King Soopers", aliases: ["king soopers"], source: ic("king-soopers"), flipp: ["King Soopers"]),
        Chain(id: "frys", name: "Fry’s Food", short: "Fry’s", aliases: ["fry's food", "frys food", "fry's marketplace"], source: ic("frys"), flipp: ["Fry's Food Stores", "Fry's"]),
        Chain(id: "smiths", name: "Smith’s", short: "Smith’s", aliases: ["smith's food", "smiths food", "smith's marketplace"], source: ic("smiths"), flipp: ["Smith's Food and Drug", "Smith's"]),
        Chain(id: "qfc", name: "QFC", short: "QFC", aliases: ["qfc", "quality food centers"], source: ic("qfc"), flipp: ["QFC"]),
        Chain(id: "dillons", name: "Dillons", short: "Dillons", aliases: ["dillons"], source: ic("dillons"), flipp: ["Dillons"]),
        Chain(id: "harristeeter", name: "Harris Teeter", short: "Harris Teeter", aliases: ["harris teeter"], source: ic("harristeeter"), flipp: ["Harris Teeter"]),
        Chain(id: "marianos", name: "Mariano’s", short: "Mariano’s", aliases: ["mariano"], source: ic("marianos"), flipp: ["Mariano's"], note: "Add free Kroger API keys in Settings for exact shelf + card prices."),
        Chain(id: "picknsave", name: "Pick ’n Save", short: "Pick ’n Save", aliases: ["pick 'n save", "pick n save"], source: ic("pick-n-save"), flipp: ["Pick N Save"]),
        Chain(id: "metromarket", name: "Metro Market", short: "Metro Market", aliases: ["metro market"], source: ic("metro-market"), flipp: ["Metro Market"]),
        Chain(id: "food4less", name: "Food 4 Less", short: "Food 4 Less", aliases: ["food 4 less", "food4less"], source: ic("food4less"), flipp: ["Food 4 Less"]),
        Chain(id: "citymarket", name: "City Market", short: "City Market", aliases: ["city market"], source: .adsOnly, flipp: ["City Market"], note: "Weekly ad only."),
        Chain(id: "gerbes", name: "Gerbes", short: "Gerbes", aliases: ["gerbes"], source: ic("gerbes"), flipp: ["Gerbes"]),
        Chain(id: "bakersplus", name: "Baker’s", short: "Baker’s", aliases: ["baker's supermarket", "bakers supermarket"], source: .adsOnly, flipp: ["Baker's"], note: "Weekly ad only."),
        Chain(id: "jayc", name: "JayC Food Stores", short: "JayC", aliases: ["jay c food", "jayc"], source: ic("jayc"), flipp: ["JayC Food Stores"]),
        Chain(id: "albertsons", name: "Albertsons", short: "Albertsons", aliases: ["albertsons"], source: ic("albertsons"), flipp: ["Albertsons"]),
        Chain(id: "safeway", name: "Safeway", short: "Safeway", aliases: ["safeway"], source: ic("safeway"), flipp: ["Safeway"]),
        Chain(id: "vons", name: "Vons", short: "Vons", aliases: ["vons"], source: ic("vons"), flipp: ["Vons"]),
        Chain(id: "pavilions", name: "Pavilions", short: "Pavilions", aliases: ["pavilions"], source: ic("pavilions"), flipp: ["Pavilions"]),
        Chain(id: "jewel", name: "Jewel-Osco", short: "Jewel", aliases: ["jewel-osco", "jewel osco", "jewel"], source: ic("jewel-osco"), flipp: ["Jewel-Osco"], note: "Prices come from Jewel’s Instacart listing; “for U” digital deals come from the circular."),
        Chain(id: "acme", name: "ACME Markets", short: "ACME", aliases: ["acme markets", "acme market"], source: ic("acme-markets"), flipp: ["ACME Markets", "Acme"]),
        Chain(id: "shaws", name: "Shaw’s", short: "Shaw’s", aliases: ["shaw's", "shaws"], source: .adsOnly, flipp: ["Shaw's"], note: "Weekly ad only."),
        Chain(id: "starmarket", name: "Star Market", short: "Star Market", aliases: ["star market"], source: ic("star-markets"), flipp: ["Star Market"]),
        Chain(id: "tomthumb", name: "Tom Thumb", short: "Tom Thumb", aliases: ["tom thumb"], source: ic("tom-thumb"), flipp: ["Tom Thumb"]),
        Chain(id: "randalls", name: "Randalls", short: "Randalls", aliases: ["randalls"], source: ic("randalls"), flipp: ["Randalls"]),
        Chain(id: "haggen", name: "Haggen", short: "Haggen", aliases: ["haggen"], source: ic("haggen"), flipp: ["Haggen"]),
        Chain(id: "carrs", name: "Carrs", short: "Carrs", aliases: ["carrs", "carr’s"], source: ic("carrs-quality-center"), flipp: ["Carrs"]),
        Chain(id: "unitedsupermarkets", name: "United Supermarkets", short: "United", aliases: ["united supermarket"], source: ic("united-supermarkets"), flipp: ["United Supermarkets"]),
        Chain(id: "marketstreet", name: "Market Street", short: "Market Street", aliases: ["market street"], source: ic("market-street"), flipp: ["Market Street"]),
        Chain(id: "publix", name: "Publix", short: "Publix", aliases: ["publix"], source: ic("publix"), flipp: ["Publix"]),
        Chain(id: "heb", name: "H-E-B", short: "H-E-B", aliases: ["h-e-b", "h e b"], source: .adsOnly, flipp: ["H-E-B", "HEB"], note: "Weekly ad only — H-E-B blocks automated price lookups."),
        Chain(id: "meijer", name: "Meijer", short: "Meijer", aliases: ["meijer"], source: ic("meijer"), flipp: ["Meijer"]),
        Chain(id: "hyvee", name: "Hy-Vee", short: "Hy-Vee", aliases: ["hy-vee", "hyvee"], source: ic("hy-vee"), flipp: ["Hy-Vee"]),
        Chain(id: "wegmans", name: "Wegmans", short: "Wegmans", aliases: ["wegmans"], source: ic("wegmans"), flipp: ["Wegmans", "Wegman's"]),
        Chain(id: "foodlion", name: "Food Lion", short: "Food Lion", aliases: ["food lion"], source: ic("food-lion"), flipp: ["Food Lion"]),
        Chain(id: "giant", name: "Giant Food", short: "Giant", aliases: ["giant food"], source: ic("giant"), flipp: ["Giant", "Giant Food"]),
        Chain(id: "martins", name: "Martin’s", short: "Martin’s", aliases: ["martin's food", "martins food"], source: ic("martins"), flipp: ["Martin's"]),
        Chain(id: "gianteagle", name: "Giant Eagle", short: "Giant Eagle", aliases: ["giant eagle"], source: ic("giant-eagle"), flipp: ["Giant Eagle"]),
        Chain(id: "stopandshop", name: "Stop & Shop", short: "Stop & Shop", aliases: ["stop & shop", "stop and shop"], source: ic("stop-shop"), flipp: ["Stop & Shop"]),
        Chain(id: "hannaford", name: "Hannaford", short: "Hannaford", aliases: ["hannaford"], source: ic("hannaford"), flipp: ["Hannaford"]),
        Chain(id: "shoprite", name: "ShopRite", short: "ShopRite", aliases: ["shoprite", "shop rite"], source: ic("shoprite"), flipp: ["ShopRite"]),
        Chain(id: "pricerite", name: "Price Rite", short: "Price Rite", aliases: ["price rite", "pricerite"], source: ic("pricerite"), flipp: ["Price Rite Marketplace"]),
        Chain(id: "pricechopper", name: "Price Chopper", short: "Price Chopper", aliases: ["price chopper", "market 32"], source: ic("price-chopper"), flipp: ["Price Chopper"]),
        Chain(id: "weis", name: "Weis Markets", short: "Weis", aliases: ["weis markets", "weis market"], source: ic("weis-markets"), flipp: ["Weis Markets"]),
        Chain(id: "tops", name: "Tops Friendly Markets", short: "Tops", aliases: ["tops market", "tops friendly"], source: ic("tops-markets"), flipp: ["Tops Friendly Markets"]),
        Chain(id: "bigy", name: "Big Y", short: "Big Y", aliases: ["big y"], source: ic("big-y"), flipp: ["Big Y"]),
        Chain(id: "marketbasket", name: "Market Basket", short: "Market Basket", aliases: ["market basket"], source: .adsOnly, flipp: ["Market Basket"], note: "Weekly ad only."),
        Chain(id: "sprouts", name: "Sprouts Farmers Market", short: "Sprouts", aliases: ["sprouts"], source: ic("sprouts"), flipp: ["Sprouts Farmers Market", "Sprouts"]),
        Chain(id: "winndixie", name: "Winn-Dixie", short: "Winn-Dixie", aliases: ["winn-dixie", "winn dixie"], source: ic("winn-dixie"), flipp: ["Winn-Dixie"]),
        Chain(id: "harveys", name: "Harveys", short: "Harveys", aliases: ["harveys supermarket"], source: .adsOnly, flipp: ["Harveys"], note: "Weekly ad only."),
        Chain(id: "ingles", name: "Ingles Markets", short: "Ingles", aliases: ["ingles"], source: ic("ingles"), flipp: ["Ingles Markets", "Ingles"]),
        Chain(id: "schnucks", name: "Schnucks", short: "Schnucks", aliases: ["schnucks"], source: ic("schnucks"), flipp: ["Schnucks"]),
        Chain(id: "dierbergs", name: "Dierbergs", short: "Dierbergs", aliases: ["dierbergs"], source: ic("dierbergs-markets"), flipp: ["Dierbergs"]),
        Chain(id: "cub", name: "Cub", short: "Cub", aliases: ["cub foods"], source: ic("cub"), flipp: ["Cub", "Cub Foods"]),
        Chain(id: "coborns", name: "Coborn’s", short: "Coborn’s", aliases: ["coborn's", "coborns"], source: .adsOnly, flipp: ["Coborn's"], note: "Weekly ad only."),
        Chain(id: "fareway", name: "Fareway", short: "Fareway", aliases: ["fareway"], source: .adsOnly, flipp: ["Fareway"], note: "Weekly ad only."),
        Chain(id: "festivalfoods", name: "Festival Foods", short: "Festival", aliases: ["festival foods"], source: ic("festival-foods"), flipp: ["Festival Foods"]),
        Chain(id: "sendiks", name: "Sendik’s", short: "Sendik’s", aliases: ["sendik's", "sendiks"], source: .adsOnly, flipp: ["Sendik's Food Market"], note: "Weekly ad only."),
        Chain(id: "staterbros", name: "Stater Bros.", short: "Stater Bros.", aliases: ["stater bros"], source: ic("stater-bros"), flipp: ["Stater Bros. Markets", "Stater Bros"]),
        Chain(id: "smartfinal", name: "Smart & Final", short: "Smart & Final", aliases: ["smart & final", "smart and final"], source: ic("smart-final"), flipp: ["Smart & Final"]),
        Chain(id: "groceryoutlet", name: "Grocery Outlet", short: "Grocery Outlet", aliases: ["grocery outlet"], source: ic("grocery-outlet"), flipp: ["Grocery Outlet"]),
        Chain(id: "freshmarket", name: "The Fresh Market", short: "Fresh Market", aliases: ["the fresh market"], source: ic("the-fresh-market"), flipp: ["The Fresh Market"]),
        Chain(id: "freshthyme", name: "Fresh Thyme Market", short: "Fresh Thyme", aliases: ["fresh thyme"], source: ic("fresh-thyme-farmers-market"), flipp: ["Fresh Thyme Market"]),
        Chain(id: "saveolot", name: "Save A Lot", short: "Save A Lot", aliases: ["save a lot", "save-a-lot"], source: ic("savealot"), flipp: ["Save A Lot"]),
        Chain(id: "winco", name: "WinCo Foods", short: "WinCo", aliases: ["winco"], source: .adsOnly, flipp: ["WinCo Foods"], note: "Weekly ad only."),
        Chain(id: "raleys", name: "Raley’s", short: "Raley’s", aliases: ["raley's", "raleys"], source: ic("raleys"), flipp: ["Raley's"]),
        Chain(id: "savemart", name: "Save Mart", short: "Save Mart", aliases: ["save mart"], source: ic("savemart"), flipp: ["Save Mart"]),
        Chain(id: "foodmaxx", name: "FoodMaxx", short: "FoodMaxx", aliases: ["foodmaxx", "food maxx"], source: ic("foodmaxx"), flipp: ["FoodMaxx"]),
        Chain(id: "luckysupermarkets", name: "Lucky Supermarkets", short: "Lucky", aliases: ["lucky supermarket"], source: ic("lucky-supermarkets"), flipp: ["Lucky Supermarkets"]),
        Chain(id: "foodcity", name: "Food City", short: "Food City", aliases: ["food city"], source: ic("food-city"), flipp: ["Food City", "FoodCity"]),
        Chain(id: "lowesfoods", name: "Lowes Foods", short: "Lowes Foods", aliases: ["lowes foods"], source: .adsOnly, flipp: ["Lowes Foods"], note: "Weekly ad only."),
        Chain(id: "brookshires", name: "Brookshire’s", short: "Brookshire’s", aliases: ["brookshire's", "brookshires"], source: ic("brookshires"), flipp: ["Brookshire's"]),
        Chain(id: "rulerfoods", name: "Ruler Foods", short: "Ruler", aliases: ["ruler foods"], source: ic("ruler-foods"), flipp: ["Ruler Foods"]),
        Chain(id: "familyfare", name: "Family Fare", short: "Family Fare", aliases: ["family fare"], source: ic("family-fare-supermarkets"), flipp: ["Family Fare"]),
        Chain(id: "marcs", name: "Marc’s", short: "Marc’s", aliases: ["marc's", "marcs"], source: ic("marcs"), flipp: ["Marc's"]),
        Chain(id: "strackvantil", name: "Strack & Van Til", short: "Strack & Van Til", aliases: ["strack & van til", "strack and van til"], source: ic("strack-van-til"), flipp: ["Strack and Van Til", "Strack & Van Til"]),
        Chain(id: "ctown", name: "C-Town", short: "C-Town", aliases: ["c town", "c-town", "ctown"], source: ic("ctown-supermarkets"), flipp: ["C Town", "C-Town"]),
        Chain(id: "foodbazaar", name: "Food Bazaar", short: "Food Bazaar", aliases: ["food bazaar"], source: ic("food-bazaar"), flipp: ["Food Bazaar Supermarket", "Food Bazaar"]),
        Chain(id: "kings", name: "Kings Food Markets", short: "Kings", aliases: ["kings food markets", "kings food market"], source: ic("kings-food-markets"), flipp: ["Kings Food Markets"]),
        Chain(id: "bravo", name: "Bravo Supermarkets", short: "Bravo", aliases: ["bravo supermarket", "bravo supermarkets"], source: ic("bravo-supermarkets"), flipp: ["Bravo Supermarket", "Bravo Supermarkets"]),
        Chain(id: "decicco", name: "DeCicco & Sons", short: "DeCicco’s", aliases: ["decicco & sons", "decicco's", "deciccos", "decicco and sons"], source: ic("deciccos"), flipp: ["DeCicco & Sons"]),
        Chain(id: "piggly", name: "Piggly Wiggly", short: "Piggly Wiggly", aliases: ["piggly wiggly"], source: .instacart(base: "https://order.shopthepig.com", slug: "shopthepig", guest: .implicit), flipp: ["Piggly Wiggly"], note: "Wisconsin and northern Illinois stores are priced from Piggly Wiggly Midwest’s own store site; other Piggly Wigglys are independently owned — weekly ad only."),
        Chain(id: "bashas", name: "Bashas’", short: "Bashas’", aliases: ["bashas", "basha's"], source: ic("bashas"), flipp: ["Bashas'"]),
        Chain(id: "harmons", name: "Harmons", short: "Harmons", aliases: ["harmons"], source: ic("harmons"), flipp: ["Harmons"]),
        Chain(id: "rosauers", name: "Rosauers", short: "Rosauers", aliases: ["rosauers"], source: ic("rosauers-supermarkets"), flipp: ["Rosauers"]),
        Chain(id: "naturalgrocers", name: "Natural Grocers", short: "Natural Grocers", aliases: ["natural grocers", "vitamin cottage"], source: ic("natural-grocers"), flipp: ["Natural Grocers"]),
        Chain(id: "gelsons", name: "Gelson’s", short: "Gelson’s", aliases: ["gelson's", "gelsons"], source: ic("gelsons"), flipp: ["Gelson's"]),
        Chain(id: "erewhon", name: "Erewhon", short: "Erewhon", aliases: ["erewhon"], source: ic("erewhon"), flipp: []),
        Chain(id: "fairway", name: "Fairway Market", short: "Fairway", aliases: ["fairway market"], source: ic("fairway"), flipp: ["Fairway Market"]),
        Chain(id: "keyfood", name: "Key Food", short: "Key Food", aliases: ["key food"], source: ic("key-food"), flipp: ["Key Food"]),
        Chain(id: "foodtown", name: "Food Town", short: "Food Town", aliases: ["food town"], source: ic("food-town"), flipp: ["Food Town"]),
        Chain(id: "foodtownny", name: "Foodtown", short: "Foodtown", aliases: ["foodtown"], source: .adsOnly, flipp: ["Foodtown"], note: "Weekly ad only."),
        Chain(id: "stewleonards", name: "Stew Leonard’s", short: "Stew Leonard’s", aliases: ["stew leonard"], source: ic("stew-leonards"), flipp: ["Stew Leonard's"]),
        Chain(id: "redners", name: "Redner’s", short: "Redner’s", aliases: ["redner's", "redners"], source: ic("redners-markets"), flipp: ["Redner's Markets"]),
        Chain(id: "elsuper", name: "El Super", short: "El Super", aliases: ["el super"], source: ic("el-super"), flipp: ["El Super"]),
        Chain(id: "vallarta", name: "Vallarta Supermarkets", short: "Vallarta", aliases: ["vallarta"], source: ic("vallarta-supermarkets"), flipp: ["Vallarta Supermarkets"]),
        Chain(id: "cardenas", name: "Cardenas Markets", short: "Cardenas", aliases: ["cardenas"], source: .adsOnly, flipp: ["Cardenas Markets"], note: "Weekly ad only."),
        Chain(id: "northgate", name: "Northgate González", short: "Northgate", aliases: ["northgate gonzalez", "northgate market"], source: ic("northgate-market"), flipp: ["Northgate Gonzalez Markets"]),
        Chain(id: "superiorgrocers", name: "Superior Grocers", short: "Superior", aliases: ["superior grocers"], source: ic("superior-grocers"), flipp: ["Superior Grocers"]),
        Chain(id: "fiesta", name: "Fiesta Mart", short: "Fiesta", aliases: ["fiesta mart"], source: ic("fiesta-mart"), flipp: ["Fiesta Mart"]),
        Chain(id: "sedanos", name: "Sedano’s", short: "Sedano’s", aliases: ["sedano's", "sedanos"], source: .adsOnly, flipp: ["Sedano's Supermarkets"], note: "Weekly ad only."),
        Chain(id: "presidente", name: "Presidente Supermarket", short: "Presidente", aliases: ["presidente supermarket"], source: .adsOnly, flipp: ["Presidente Supermarkets"], note: "Weekly ad only."),
        Chain(id: "hmart", name: "H Mart", short: "H Mart", aliases: ["h mart", "hmart"], source: ic("hmart"), flipp: ["H Mart"]),
        Chain(id: "99ranch", name: "99 Ranch Market", short: "99 Ranch", aliases: ["99 ranch"], source: ic("99-ranch-market"), flipp: ["99 Ranch Market"]),
        Chain(id: "patel", name: "Patel Brothers", short: "Patel Bros", aliases: ["patel brothers"], source: .adsOnly, flipp: [], note: "Weekly ad only."),
        Chain(id: "seafoodcity", name: "Seafood City", short: "Seafood City", aliases: ["seafood city"], source: ic("seafood-city-supermarket"), flipp: ["Seafood City"]),
        Chain(id: "petes", name: "Pete’s Fresh Market", short: "Pete’s", aliases: ["pete's fresh", "petes fresh"], source: ic("petes-fresh-market"), flipp: ["Pete's Fresh Market"]),
        Chain(id: "tonys", name: "Tony’s Fresh Market", short: "Tony’s", aliases: ["tony's fresh", "tonys fresh"], source: ic("tonys-fresh-market"), flipp: ["Tony's Fresh Market"]),
        Chain(id: "caputos", name: "Angelo Caputo’s", short: "Caputo’s", aliases: ["caputo"], source: ic("caputos-fresh-markets"), flipp: ["Angelo Caputo's Fresh Market"]),
        Chain(id: "sunset", name: "Sunset Foods", short: "Sunset", aliases: ["sunset foods"], source: ic("sunset-foods"), flipp: ["Sunset Foods"]),
        Chain(id: "cermak", name: "Cermak Fresh Market", short: "Cermak", aliases: ["cermak"], source: ic("cermak-fresh-market"), flipp: ["Cermak Fresh Market"]),
        Chain(id: "standard", name: "Standard Market", short: "Standard", aliases: ["standard market"], source: .adsOnly, flipp: ["Standard Market"], note: "Weekly ad only."),
        Chain(id: "heinens", name: "Heinen’s", short: "Heinen’s", aliases: ["heinen"], source: .adsOnly, flipp: ["Heinen's Grocery Store"], note: "Weekly ad only."),
    ]
    // END GENERATED CHAINS

    static let byId: [String: Chain] = Dictionary(chains.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

    private static func norm(_ s: String) -> String {
        s.lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    /// Match a map listing / store name to a known chain.
    static func chain(forStoreName name: String) -> Chain? {
        let n = " " + norm(name) + " "
        var best: (Chain, Int)?
        for c in chains {
            for a in c.aliases {
                let alias = norm(a)
                // word-ish boundary match; prefer the longest alias ("giant eagle" over "giant")
                if n.contains(" " + alias) || n.contains(alias + " ") || n.hasPrefix(" " + alias) {
                    if best == nil || alias.count > best!.1 { best = (c, alias.count) }
                }
            }
        }
        return best?.0
    }

    /// Match a Flipp merchant name to a known chain.
    static func chain(forMerchant merchant: String) -> Chain? {
        let m = norm(merchant)
        for c in chains where c.flipp.contains(where: { norm($0) == m }) { return c }
        return chain(forStoreName: merchant)
    }

    /// Flipp merchants that are grocery-relevant even when not in the catalog.
    static let groceryFlyerCategories: Set<String> = ["Groceries"]
}
