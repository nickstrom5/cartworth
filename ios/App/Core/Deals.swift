import Foundation

/// Structured reading of promo text: "2/$5", "Buy 5 for $5", "BOGO", "Save $1.00 lb.", "for U".
struct DealTerms: Codable, Hashable {
    enum Kind: String, Codable { case multi, bogo, bxgy, pct, save }
    var kind: Kind?
    var text: String
    var qty: Int?
    var total: Double?
    var each: Double?
    var pct: Double?
    var save: Double?
    var perLb: Bool = false
    var needsCoupon: Bool = false
    var needsCard: Bool = false
    var limit: Int?
    var mustBuy: Int?

    var label: String {
        switch kind {
        case .multi: return "\(qty ?? 2) for \(Money.plain(total ?? 0))"
        case .bogo: return "Buy 1, get 1 free"
        case .bxgy: return text
        // shared/deals.js interpolates d.pct verbatim, so "12.5% off" stays "12.5% off".
        // Rounding it to an Int here printed "13% off" for the same deal.
        case .pct: return "\(DealTerms.number(pct ?? 0))% off"
        case .save:
            if let qty, qty > 1 { return "Buy \(qty), save \(Money.plain(save ?? 0))" }
            return "Save \(Money.plain(save ?? 0))\(perLb ? "/lb" : "")"
        case .none: return text
        }
    }

    /// JavaScript number-to-string: a whole number loses its ".0", a fraction keeps its digits.
    static func number(_ n: Double) -> String {
        n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
    }
}

enum DealParser {
    private static let couponRx = Rx("\\bdigital\\b|\\bcoupon\\b|\\bclip\\b|for u\\b|\\bj4u\\b")
    private static let cardRx = Rx("with (?:your )?card|card price|member price|with prime")
    private static let limitRx = Rx("limit\\s+(\\d+)")
    // "must buy 2", "when you buy 4", "buy 3 or more" all mean the shelf price only applies at
    // that quantity. Missing any of them means quoting a price the shopper cannot actually get.
    private static let mustRx = Rx("must buy\\s+(\\d+)")
    private static let whenYouBuyRx = Rx("when you buy\\s+(\\d+)")
    private static let buyOrMoreRx = Rx("buy\\s+(\\d+)\\s+or more")
    private static let bxgyFreeRx = Rx("buy\\s*(\\d+)\\s*,?\\s*get\\s*(\\d+)\\s*(?:free|at no cost)")
    private static let bogoRx = Rx("\\bbogo\\b|buy one,? get one free|b1g1")
    private static let bxgyPctRx = Rx("buy\\s*(\\d+)\\s*,?\\s*get\\s*(\\d+)\\s*(\\d+)%\\s*off")
    private static let multiRx = Rx("(?:buy\\s*)?(\\d+)\\s*(?:/|for)\\s*\\$\\s*(\\d+(?:\\.\\d+)?)")
    private static let pctRx = Rx("(\\d+(?:\\.\\d+)?)\\s*%\\s*off")
    /// Circular coupon form: "$2 OFF (2)", "75¢ OFF (1)". The parenthesised number is how many you
    /// must buy, never part of the discount.
    private static let offParenRx = Rx("^\\s*(?:\\$\\s*(\\d+(?:\\.\\d+)?)|(\\d+)\\s*¢)\\s*off\\s*\\((\\d+)\\)")
    /// "$1.00 off 2" is a dollar-off coupon that requires buying two, not a $1-off-each deal.
    private static let offCountRx = Rx("\\$\\s*(\\d+(?:\\.\\d+)?)\\s*off\\s+(\\d+)\\b")
    private static let saveRx = Rx("save\\s*\\$\\s*(\\d+(?:\\.\\d+)?)")
    private static let savePerRx = Rx("save\\s*\\$\\s*\\d+(?:\\.\\d+)?\\s*(?:/|per\\s*)?(lb|each|ea)")
    private static let buySaveRx = Rx("buy\\s*(\\d+)\\s*,?\\s*save\\s*\\$\\s*(\\d+(?:\\.\\d+)?)")

    static func parse(_ raw: String?, basePrice: Double? = nil) -> DealTerms? {
        guard let raw else { return nil }
        let t = raw.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return nil }
        let lower = t.lowercased()
        var d = DealTerms(kind: nil, text: t)
        d.needsCoupon = couponRx.test(lower)
        d.needsCard = cardRx.test(lower)
        if let m = limitRx.match(lower), let n = Int(m[1] ?? "") { d.limit = n }
        if let m = mustRx.match(lower) ?? whenYouBuyRx.match(lower) ?? buyOrMoreRx.match(lower),
           let n = Int(m[1] ?? "") { d.mustBuy = n }

        // The branch order and the `else if` chaining mirror shared/deals.js exactly: a branch whose
        // PATTERN matches consumes the chain even when its body guard (e.g. 1 < qty <= 20) rejects it.
        if let m = bxgyFreeRx.match(lower), let buy = Int(m[1] ?? ""), let get = Int(m[2] ?? "") {
            if buy == 1 && get == 1 {
                d.kind = .bogo; d.qty = 2; d.pct = 50
            } else {
                d.kind = .bxgy; d.qty = buy + get; d.pct = (Double(get) / Double(buy + get) * 100).rounded()
            }
        } else if bogoRx.test(lower) {
            d.kind = .bogo; d.qty = 2; d.pct = 50
        } else if let m = bxgyPctRx.match(lower), let a = Double(m[1] ?? ""), let b = Double(m[2] ?? ""), let p = Double(m[3] ?? "") {
            d.kind = .bxgy; d.qty = Int(a + b); d.pct = ((b * p / 100) / (a + b) * 100).rounded()
        } else if let m = multiRx.match(lower) {
            if let q = Int(m[1] ?? ""), let total = Double(m[2] ?? ""), q > 1, q <= 20 {
                d.kind = .multi; d.qty = q; d.total = total; d.each = (total / Double(q) * 100).rounded() / 100
            }
        } else if let m = pctRx.match(lower), let p = Double(m[1] ?? "") {
            d.kind = .pct; d.pct = p
        } else if let m = offParenRx.match(lower) {
            // "$2 OFF (2)" / "75¢ OFF (1)": the parenthesised number is the buy-count.
            d.kind = .save
            if let dollars = m[1], let v = Double(dollars) { d.save = v }
            else if let cents = m[2], let v = Double(cents) { d.save = v / 100 }
            let need = Int(m[3] ?? "") ?? 1
            d.mustBuy = need > 1 ? need : nil
            d.needsCoupon = true
        } else if let m = offCountRx.match(lower), let s = Double(m[1] ?? ""), let need = Int(m[2] ?? "") {
            d.kind = .save; d.save = s; d.mustBuy = need
        } else if let m = saveRx.match(lower), let s = Double(m[1] ?? "") {
            d.kind = .save; d.save = s
            if let pm = savePerRx.match(lower) { d.perLb = pm[1] == "lb" }
        } else if let m = buySaveRx.match(lower), let q = Int(m[1] ?? ""), let s = Double(m[2] ?? "") {
            d.kind = .save; d.qty = q; d.save = s
        }

        // Never claim an item is free. A computed price of $0 always means the ad text and the
        // listed price describe different things (a different size, or a coupon already applied),
        // and showing $0.00 would win every comparison it appeared in. `each` is therefore either
        // a real positive price or nil, and never 0 or negative.
        func priceOrNil(_ v: Double) -> Double? {
            guard v.isFinite, v > 0 else { return nil }
            return (v * 100).rounded() / 100
        }
        // JS `basePrice &&` is falsy for 0 and NaN as well as null.
        if let base = basePrice, base.isFinite, base != 0 {
            switch d.kind {
            case .pct?, .bogo?, .bxgy?:
                if let p = d.pct, p < 100 { d.each = priceOrNil(base * (1 - p / 100)) }
            case .save?:
                if d.qty == nil, let s = d.save { d.each = priceOrNil(base - s) }
            default: break
            }
        }
        if d.kind == .multi && !((d.total ?? 0) > 0) {
            d.each = nil
            d.kind = nil
        }
        // A deal carrying only a must-buy requirement is still a deal: dropping it showed the
        // shopper a single-unit price with no qualifier.
        return d.kind != nil || d.needsCoupon || d.needsCard || d.limit != nil || d.mustBuy != nil ? d : nil
    }
}

// MARK: - Categories

enum GroceryCategory: String, CaseIterable, Codable, Identifiable {
    case produce = "Produce"
    case meat = "Meat & Seafood"
    case dairy = "Dairy & Eggs"
    case bakery = "Bakery & Bread"
    case deli = "Deli & Prepared"
    case frozen = "Frozen"
    case pantry = "Pantry"
    case snacks = "Snacks & Candy"
    case beverages = "Beverages"
    case alcohol = "Beer, Wine & Spirits"
    case household = "Household"
    case personal = "Personal Care & Health"
    case baby = "Baby"
    case pet = "Pet"
    case other = "Other"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .produce: return "carrot"
        case .meat: return "fish"
        case .dairy: return "cup.and.saucer"
        case .bakery: return "birthday.cake"
        case .deli: return "takeoutbag.and.cup.and.straw"
        case .frozen: return "snowflake"
        case .pantry: return "cabinet"
        case .snacks: return "popcorn"
        case .beverages: return "waterbottle"
        case .alcohol: return "wineglass"
        case .household: return "house"
        case .personal: return "heart.text.square"
        case .baby: return "stroller"
        case .pet: return "pawprint"
        case .other: return "square.grid.2x2"
        }
    }

    var isFood: Bool {
        switch self {
        case .produce, .meat, .dairy, .bakery, .deli, .frozen, .pantry, .snacks, .beverages: return true
        default: return false
        }
    }

    private static let rules: [(GroceryCategory, Rx)] = [
        (.alcohol, Rx("\\b(beer|ale|lager|ipa|stout|seltzer(?! water)|hard cider|wine|merlot|cabernet|chardonnay|pinot|sauvignon|riesling|moscato|prosecco|champagne|vodka|whiskey|whisky|bourbon|rum|tequila|gin|brandy|cognac|liqueur|schnapps|spirits|leinenkugel|miller|coors|budweiser|bud light|michelob|corona|modelo|heineken|stella|blue moon|white claw|truly|high noon|twisted tea|angry orchard|sutter|barefoot|josh cellars|kendall|smirnoff|tito|jack daniel|jim beam|bacardi|captain morgan|fireball|crown royal|oktoberfest|brewing)\\b")),
        (.pet, Rx("\\b(dog|cat|puppy|kitten|pet|kibble|litter|purina|pedigree|iams|friskies|meow mix|fancy feast|blue buffalo|milk-bone|greenies|nylabone|bullibone|rawhide|temptations)\\b")),
        (.baby, Rx("\\b(diaper|diapers|wipes|baby|infant|toddler|formula|similac|enfamil|pampers|huggies|luvs|gerber)\\b")),
        (.household, Rx("\\b(paper towel|toilet paper|bath tissue|tissue|napkin|trash bag|garbage bag|foil|plastic wrap|zip ?lock|ziploc|glad|hefty|detergent|laundry|fabric softener|dryer sheet|bleach|cleaner|disinfect|lysol|clorox|dish soap|dishwasher|cascade|dawn|tide|gain|downy|sponge|batteries|light bulb|charcoal|kingsford lighter|air freshener|febreze|candle|bounty|charmin|scott|cottonelle|kleenex|puffs|reynolds|swiffer|mop|broom)\\b")),
        (.personal, Rx("\\b(shampoo|conditioner|body wash|soap bar|deodorant|antiperspirant|toothpaste|toothbrush|mouthwash|floss|razor|shave|lotion|sunscreen|cosmetic|makeup|vitamin|supplement|pain reliever|allergy|cold medicine|pedialyte|advil|tylenol|aleve|motrin|claritin|zyrtec|crest|colgate|scope|listerine|dove|olay|gillette|schick|degree|secret|old spice|axe|nivea|aveeno|cetaphil|neutrogena|tampons|pads|always|kotex|playtex|first aid|bandage|band-aid)\\b")),
        (.meat, Rx("\\b(beef|steak|ribeye|sirloin|chuck|brisket|ground (?:beef|turkey|chicken|pork)|pork|chop|tenderloin|ribs?|bacon|ham|sausage|brat|bratwurst|hot dog|wiener|franks?|chicken|turkey|drumstick|thigh|wing|breast|lamb|veal|meatball|salmon|shrimp|tilapia|cod|tuna steak|fish|crab|lobster|scallop|seafood|fillet|filet|roast|jerky|kielbasa|pepperoni|salami|chorizo)\\b")),
        (.dairy, Rx("\\b(milk|cheese|cheddar|mozzarella|parmesan|swiss|provolone|colby|jack|feta|ricotta|cottage|cream cheese|yogurt|yoghurt|greek|butter|margarine|sour cream|half & half|half and half|creamer|whipping cream|heavy cream|egg|eggs|kefir|curds|dairy)\\b")),
        (.produce, Rx("\\b(apple|apples|banana|bananas|orange|oranges|grape|grapes|berry|berries|strawberr|blueberr|raspberr|blackberr|cherry|cherries|peach|peaches|pear|pears|plum|mango|pineapple|melon|watermelon|cantaloupe|kiwi|lemon|lime|avocado|tomato|tomatoes|potato|potatoes|onion|onions|garlic|pepper|peppers|lettuce|spinach|kale|salad mix|cabbage|broccoli|cauliflower|carrot|carrots|celery|cucumber|zucchini|squash|pumpkin|corn on the cob|sweet corn|mushroom|asparagus|green beans|herbs|cilantro|parsley|clementine|mandarin|cuties|honeycrisp|gala|fuji|produce|fruit|veggie|vegetable)\\b")),
        (.bakery, Rx("\\b(bread|bagel|bun|buns|roll|rolls|muffin|croissant|donut|doughnut|cake|pie|tortilla|pita|naan|english muffin|baguette|brioche|danish|cookies? (?:bakery)|bakery)\\b")),
        (.frozen, Rx("\\b(frozen|ice cream|gelato|popsicle|frozen pizza|pizza|waffles|lean cuisine|stouffer|totino|digiorno|red baron|tombstone|birds eye|green giant steam|hot pocket|eggo|talenti|ben & jerry|breyers|haagen|tater tots|fries|french fries|ore-ida)\\b")),
        (.beverages, Rx("\\b(water|sparkling|soda|pop|cola|coke|pepsi|sprite|dr pepper|mountain dew|7up|ginger ale|juice|lemonade|tea|coffee|k-cup|keurig|energy drink|red bull|monster|celsius|alani|gatorade|powerade|bodyarmor|kombucha|coconut water|la croix|bubly|polar|drink|beverage|smoothie|protein shake|core power|fairlife core)\\b")),
        (.snacks, Rx("\\b(chips|crisps|pretzel|popcorn|cracker|crackers|cookie|cookies|oreo|candy|chocolate|gum|mints|snack|snacks|nuts|almonds|cashews|peanuts|trail mix|granola bar|protein bar|bars|doritos|lays|lay's|cheetos|tostitos|pringles|ruffles|fritos|goldfish|cheez-it|ritz|triscuit|wheat thins|m&m|snickers|reese|kitkat|kit kat|skittles|starburst|hershey|twix|milky way|gummy|gummies|jerky|pirate's booty|dip|salsa)\\b")),
        (.deli, Rx("\\b(deli|rotisserie|sliced turkey|sliced ham|boar's head|prepared|sushi|sandwich|wrap|salad kit|hummus|dip|meal kit|ready to eat|dinner|soup bar|hot bar)\\b")),
        (.pantry, Rx("\\b(pasta|spaghetti|macaroni|noodle|rice|beans|lentil|flour|sugar|oil|olive oil|vinegar|sauce|salsa|ketchup|mustard|mayo|mayonnaise|dressing|cereal|oatmeal|oats|granola|peanut butter|jelly|jam|honey|syrup|spice|seasoning|salt|broth|stock|soup|canned|tuna|chili|baking|cake mix|brownie mix|pancake mix|condiment|pickles|olives|nut butter|coffee creamer|tortilla chips)\\b")),
    ]

    private static let external: [(Rx, GroceryCategory)] = [
        (Rx("beer|wine|spirit|liquor|alcohol"), .alcohol), (Rx("pet"), .pet), (Rx("baby"), .baby),
        (Rx("household|cleaning|laundry|paper goods|kitchen supplies"), .household),
        (Rx("personal care|health|beauty|pharmacy|medicine|vitamin"), .personal),
        (Rx("meat|seafood|poultry|beef|pork|chicken|fish"), .meat), (Rx("dairy|egg|cheese|milk|yogurt"), .dairy),
        (Rx("produce|fruit|vegetable"), .produce), (Rx("bakery|bread"), .bakery), (Rx("frozen|ice cream"), .frozen),
        (Rx("deli|prepared"), .deli), (Rx("beverage|drink|coffee|tea|juice|water|soda"), .beverages),
        (Rx("snack|candy|chip|cookie|cracker"), .snacks), (Rx("pantry|canned|pasta|baking|condiment|breakfast|cereal|grains|sauces"), .pantry),
    ]

    static func classify(name: String, description: String? = nil, external ext: String? = nil) -> GroceryCategory {
        if let ext, !ext.isEmpty {
            for (rx, cat) in external where rx.test(ext) { return cat }
        }
        let text = "\(name) \(description ?? "")"
        for (cat, rx) in rules where rx.test(text) { return cat }
        return .other
    }
}
