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

    var retailer: Retailer {
        Retailer(id: id, name: name, short: short, source: source, adMerchants: flipp, logoURL: nil, note: note)
    }
}

enum RetailerCatalog {
    private static func ic(_ slug: String) -> SourceKind { .instacart(base: "https://www.instacart.com", slug: slug, guest: .implicit) }

    static let chains: [Chain] = [
        // Own storefronts with true in-store shelf prices
        Chain(id: "aldi", name: "ALDI", short: "ALDI", aliases: ["aldi"], source: .instacart(base: "https://www.aldi.us", slug: "aldi", guest: .implicit), flipp: ["ALDI"], note: "In-store shelf prices"),
        Chain(id: "woodmans", name: "Woodman’s", short: "Woodman’s", aliases: ["woodman"], source: .instacart(base: "https://shopwoodmans.com", slug: "woodmans-food-markets", guest: .postal), flipp: ["Woodman's Food Market"], note: "In-store shelf prices"),
        Chain(id: "wholefoods", name: "Whole Foods Market", short: "Whole Foods", aliases: ["whole foods"], source: .wholeFoods, flipp: [], note: "Shelf prices, sale and Prime prices"),
        Chain(id: "traderjoes", name: "Trader Joe’s", short: "Trader Joe’s", aliases: ["trader joe"], source: .traderJoes, flipp: [], note: "Posted prices"),
        // National
        Chain(id: "walmart", name: "Walmart", short: "Walmart", aliases: ["walmart"], source: ic("walmart"), flipp: ["Walmart"]),
        Chain(id: "target", name: "Target", short: "Target", aliases: ["target"], source: .adsOnly, flipp: ["Target"], note: "Weekly ad only"),
        Chain(id: "costco", name: "Costco", short: "Costco", aliases: ["costco"], source: ic("costco"), flipp: ["Costco"], note: "Same-day prices run above the warehouse"),
        Chain(id: "samsclub", name: "Sam’s Club", short: "Sam’s Club", aliases: ["sam's club", "sams club"], source: ic("sams-club"), flipp: ["Sam's Club"]),
        Chain(id: "bjs", name: "BJ’s Wholesale", short: "BJ’s", aliases: ["bj's wholesale", "bjs wholesale"], source: ic("bjs"), flipp: ["BJ's Wholesale Club"]),
        Chain(id: "lidl", name: "Lidl", short: "Lidl", aliases: ["lidl"], source: .adsOnly, flipp: ["Lidl", "LIDL"]),
        Chain(id: "dollargeneral", name: "Dollar General", short: "Dollar General", aliases: ["dollar general"], source: ic("dollar-general"), flipp: ["Dollar General"]),
        // Kroger family
        Chain(id: "kroger", name: "Kroger", short: "Kroger", aliases: ["kroger"], source: ic("kroger"), flipp: ["Kroger"]),
        Chain(id: "ralphs", name: "Ralphs", short: "Ralphs", aliases: ["ralphs"], source: ic("ralphs"), flipp: ["Ralphs"]),
        Chain(id: "fredmeyer", name: "Fred Meyer", short: "Fred Meyer", aliases: ["fred meyer"], source: ic("fred-meyer"), flipp: ["Fred Meyer"]),
        Chain(id: "kingsoopers", name: "King Soopers", short: "King Soopers", aliases: ["king soopers"], source: ic("king-soopers"), flipp: ["King Soopers"]),
        Chain(id: "frys", name: "Fry’s Food", short: "Fry’s", aliases: ["fry's food", "frys food", "fry's marketplace"], source: ic("frys-food-stores"), flipp: ["Fry's Food Stores", "Fry's"]),
        Chain(id: "smiths", name: "Smith’s", short: "Smith’s", aliases: ["smith's food", "smiths food", "smith's marketplace"], source: ic("smiths-food-and-drug"), flipp: ["Smith's Food and Drug", "Smith's"]),
        Chain(id: "qfc", name: "QFC", short: "QFC", aliases: ["qfc", "quality food centers"], source: ic("qfc"), flipp: ["QFC"]),
        Chain(id: "dillons", name: "Dillons", short: "Dillons", aliases: ["dillons"], source: ic("dillons"), flipp: ["Dillons"]),
        Chain(id: "harristeeter", name: "Harris Teeter", short: "Harris Teeter", aliases: ["harris teeter"], source: ic("harris-teeter"), flipp: ["Harris Teeter"]),
        Chain(id: "marianos", name: "Mariano’s", short: "Mariano’s", aliases: ["mariano"], source: ic("marianos"), flipp: ["Mariano's"]),
        Chain(id: "picknsave", name: "Pick ’n Save", short: "Pick ’n Save", aliases: ["pick 'n save", "pick n save", "pick'n save"], source: ic("pick-n-save"), flipp: ["Pick N Save"]),
        Chain(id: "metromarket", name: "Metro Market", short: "Metro Market", aliases: ["metro market"], source: ic("metro-market"), flipp: ["Metro Market"]),
        Chain(id: "food4less", name: "Food 4 Less", short: "Food 4 Less", aliases: ["food 4 less", "food4less"], source: ic("food-4-less"), flipp: ["Food 4 Less"]),
        Chain(id: "citymarket", name: "City Market", short: "City Market", aliases: ["city market"], source: ic("city-market"), flipp: ["City Market"]),
        // Albertsons family
        Chain(id: "albertsons", name: "Albertsons", short: "Albertsons", aliases: ["albertsons"], source: ic("albertsons"), flipp: ["Albertsons"]),
        Chain(id: "safeway", name: "Safeway", short: "Safeway", aliases: ["safeway"], source: ic("safeway"), flipp: ["Safeway"]),
        Chain(id: "vons", name: "Vons", short: "Vons", aliases: ["vons"], source: ic("vons"), flipp: ["Vons"]),
        Chain(id: "pavilions", name: "Pavilions", short: "Pavilions", aliases: ["pavilions"], source: ic("pavilions"), flipp: ["Pavilions"]),
        Chain(id: "jewel", name: "Jewel-Osco", short: "Jewel", aliases: ["jewel-osco", "jewel osco", "jewel"], source: ic("jewel-osco"), flipp: ["Jewel-Osco"]),
        Chain(id: "acme", name: "ACME Markets", short: "ACME", aliases: ["acme markets", "acme market"], source: ic("acme-markets"), flipp: ["ACME Markets", "Acme"]),
        Chain(id: "shaws", name: "Shaw’s", short: "Shaw’s", aliases: ["shaw's", "shaws"], source: ic("shaws"), flipp: ["Shaw's"]),
        Chain(id: "starmarket", name: "Star Market", short: "Star Market", aliases: ["star market"], source: ic("star-market"), flipp: ["Star Market"]),
        Chain(id: "tomthumb", name: "Tom Thumb", short: "Tom Thumb", aliases: ["tom thumb"], source: ic("tom-thumb"), flipp: ["Tom Thumb"]),
        Chain(id: "randalls", name: "Randalls", short: "Randalls", aliases: ["randalls"], source: ic("randalls"), flipp: ["Randalls"]),
        Chain(id: "haggen", name: "Haggen", short: "Haggen", aliases: ["haggen"], source: ic("haggen"), flipp: ["Haggen"]),
        // Regional
        Chain(id: "publix", name: "Publix", short: "Publix", aliases: ["publix"], source: ic("publix"), flipp: ["Publix"]),
        Chain(id: "heb", name: "H-E-B", short: "H-E-B", aliases: ["h-e-b", "heb"], source: .adsOnly, flipp: ["H-E-B", "HEB"]),
        Chain(id: "meijer", name: "Meijer", short: "Meijer", aliases: ["meijer"], source: ic("meijer"), flipp: ["Meijer"]),
        Chain(id: "hyvee", name: "Hy-Vee", short: "Hy-Vee", aliases: ["hy-vee", "hyvee"], source: ic("hy-vee"), flipp: ["Hy-Vee"]),
        Chain(id: "wegmans", name: "Wegmans", short: "Wegmans", aliases: ["wegmans"], source: ic("wegmans"), flipp: ["Wegmans"]),
        Chain(id: "foodlion", name: "Food Lion", short: "Food Lion", aliases: ["food lion"], source: ic("food-lion"), flipp: ["Food Lion"]),
        Chain(id: "giant", name: "Giant", short: "Giant", aliases: ["giant food", "giant"], source: ic("giant-food"), flipp: ["Giant", "Giant Food"]),
        Chain(id: "gianteagle", name: "Giant Eagle", short: "Giant Eagle", aliases: ["giant eagle"], source: ic("giant-eagle"), flipp: ["Giant Eagle"]),
        Chain(id: "stopandshop", name: "Stop & Shop", short: "Stop & Shop", aliases: ["stop & shop", "stop and shop"], source: ic("stop-shop"), flipp: ["Stop & Shop"]),
        Chain(id: "hannaford", name: "Hannaford", short: "Hannaford", aliases: ["hannaford"], source: ic("hannaford"), flipp: ["Hannaford"]),
        Chain(id: "shoprite", name: "ShopRite", short: "ShopRite", aliases: ["shoprite", "shop rite"], source: ic("shoprite"), flipp: ["ShopRite"]),
        Chain(id: "pricechopper", name: "Price Chopper", short: "Price Chopper", aliases: ["price chopper", "market 32"], source: ic("price-chopper"), flipp: ["Price Chopper"]),
        Chain(id: "weis", name: "Weis Markets", short: "Weis", aliases: ["weis markets", "weis market"], source: ic("weis-markets"), flipp: ["Weis Markets"]),
        Chain(id: "sprouts", name: "Sprouts", short: "Sprouts", aliases: ["sprouts"], source: ic("sprouts"), flipp: ["Sprouts Farmers Market", "Sprouts"]),
        Chain(id: "winndixie", name: "Winn-Dixie", short: "Winn-Dixie", aliases: ["winn-dixie", "winn dixie"], source: ic("winn-dixie"), flipp: ["Winn-Dixie"]),
        Chain(id: "ingles", name: "Ingles", short: "Ingles", aliases: ["ingles"], source: ic("ingles-markets"), flipp: ["Ingles Markets", "Ingles"]),
        Chain(id: "schnucks", name: "Schnucks", short: "Schnucks", aliases: ["schnucks"], source: ic("schnucks"), flipp: ["Schnucks"]),
        Chain(id: "dierbergs", name: "Dierbergs", short: "Dierbergs", aliases: ["dierbergs"], source: ic("dierbergs"), flipp: ["Dierbergs"]),
        Chain(id: "cub", name: "Cub", short: "Cub", aliases: ["cub foods", "cub"], source: ic("cub-foods"), flipp: ["Cub", "Cub Foods"]),
        Chain(id: "staterbros", name: "Stater Bros.", short: "Stater Bros.", aliases: ["stater bros"], source: ic("stater-bros"), flipp: ["Stater Bros. Markets", "Stater Bros"]),
        Chain(id: "smartfinal", name: "Smart & Final", short: "Smart & Final", aliases: ["smart & final", "smart and final"], source: ic("smart-final"), flipp: ["Smart & Final"]),
        Chain(id: "groceryoutlet", name: "Grocery Outlet", short: "Grocery Outlet", aliases: ["grocery outlet"], source: ic("grocery-outlet"), flipp: ["Grocery Outlet"]),
        Chain(id: "freshmarket", name: "The Fresh Market", short: "Fresh Market", aliases: ["the fresh market"], source: ic("the-fresh-market"), flipp: ["The Fresh Market"]),
        Chain(id: "freshthyme", name: "Fresh Thyme", short: "Fresh Thyme", aliases: ["fresh thyme"], source: .adsOnly, flipp: ["Fresh Thyme Market"]),
        Chain(id: "saveolot", name: "Save A Lot", short: "Save A Lot", aliases: ["save a lot", "save-a-lot"], source: ic("save-a-lot"), flipp: ["Save A Lot"]),
        Chain(id: "winco", name: "WinCo Foods", short: "WinCo", aliases: ["winco"], source: .adsOnly, flipp: ["WinCo Foods"]),
        Chain(id: "raleys", name: "Raley’s", short: "Raley’s", aliases: ["raley's", "raleys"], source: ic("raleys"), flipp: ["Raley's"]),
        Chain(id: "savemart", name: "Save Mart", short: "Save Mart", aliases: ["save mart"], source: ic("save-mart"), flipp: ["Save Mart"]),
        Chain(id: "foodcity", name: "Food City", short: "Food City", aliases: ["food city"], source: ic("food-city"), flipp: ["Food City"]),
        Chain(id: "lowesfoods", name: "Lowes Foods", short: "Lowes Foods", aliases: ["lowes foods"], source: ic("lowes-foods"), flipp: ["Lowes Foods"]),
        Chain(id: "brookshires", name: "Brookshire’s", short: "Brookshire’s", aliases: ["brookshire's", "brookshires"], source: ic("brookshires"), flipp: ["Brookshire's"]),
        // Chicagoland independents
        Chain(id: "petes", name: "Pete’s Fresh Market", short: "Pete’s", aliases: ["pete's fresh", "petes fresh"], source: ic("petes-fresh-market"), flipp: ["Pete's Fresh Market"]),
        Chain(id: "tonys", name: "Tony’s Fresh Market", short: "Tony’s", aliases: ["tony's fresh", "tonys fresh"], source: ic("tonys-fresh-market"), flipp: ["Tony's Fresh Market"]),
        Chain(id: "caputos", name: "Caputo’s", short: "Caputo’s", aliases: ["caputo"], source: ic("caputos-fresh-markets"), flipp: ["Angelo Caputo's Fresh Market"]),
        Chain(id: "sunset", name: "Sunset Foods", short: "Sunset", aliases: ["sunset foods"], source: ic("sunset-foods"), flipp: ["Sunset Foods"]),
        Chain(id: "heinens", name: "Heinen’s", short: "Heinen’s", aliases: ["heinen"], source: .adsOnly, flipp: ["Heinen's Grocery Store"]),
        Chain(id: "standard", name: "Standard Market", short: "Standard", aliases: ["standard market"], source: .adsOnly, flipp: ["Standard Market"]),
        Chain(id: "cermak", name: "Cermak Fresh Market", short: "Cermak", aliases: ["cermak"], source: ic("cermak-fresh-market"), flipp: ["Cermak Fresh Market"]),
        Chain(id: "hmart", name: "H Mart", short: "H Mart", aliases: ["h mart", "hmart"], source: .adsOnly, flipp: ["H Mart"]),
    ]

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
