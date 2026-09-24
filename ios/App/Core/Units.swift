import Foundation

/// Package-size parsing and unit-price math.
/// Every size is normalized to one dimension with a base unit:
///   weight -> ounces, volume -> fluid ounces, count -> each.
enum Dim: String, Codable, CaseIterable, Hashable {
    case weight, volume, count

    var label: String {
        switch self {
        case .weight: return "weight"
        case .volume: return "volume"
        case .count: return "count"
        }
    }
}

struct ParsedSize: Codable, Hashable {
    var dim: Dim
    /// Size in base units (oz / fl oz / each). nil when sold by weight with no fixed size.
    var base: Double?
    var amount: Double?
    var unit: String
    var count: Int
    var perWeight: Bool
    var range: Bool
    var text: String
    var liquidCoerced: Bool = false
    /// "N ct, M oz": the name stated a count before the size, and whether M is each unit or all of
    /// them is not decidable from the words alone. See `Units.countWordFirstRx`.
    var countFirst: CountFirst? = nil
    /// "M oz, N ct": a piece count after a weight. See `Units.containerInNameRx`.
    var countAfter: CountFirst? = nil
    /// Set when the weight was recovered from a butter stick count (see
    /// `ProductFactory.butterSticks`): the number of quarter-pound sticks the retailer stated.
    var sticks: Int? = nil
    /// Set when the pack count came from Instacart's own unit line (`ProductFactory.listingPack`).
    var packFromListing: Bool = false
}

struct CountFirst: Codable, Hashable {
    var n: Int
    /// M in base units.
    var unitBase: Double
}

enum DisplayUnit: String, CaseIterable, Codable, Hashable, Identifiable {
    case oz, lb, kg, floz, qt, gal, l, ct, dozen

    var id: String { rawValue }

    var dim: Dim {
        switch self {
        case .oz, .lb, .kg: return .weight
        case .floz, .qt, .gal, .l: return .volume
        case .ct, .dozen: return .count
        }
    }

    /// Base units per display unit.
    var factor: Double {
        switch self {
        case .oz: return 1
        case .lb: return 16
        case .kg: return 35.27396
        case .floz: return 1
        case .qt: return 32
        case .gal: return 128
        case .l: return 33.8140227
        case .ct: return 1
        case .dozen: return 12
        }
    }

    var label: String {
        switch self {
        case .oz: return "oz"
        case .lb: return "lb"
        case .kg: return "kg"
        case .floz: return "fl oz"
        case .qt: return "qt"
        case .gal: return "gal"
        case .l: return "L"
        case .ct: return "ea"
        case .dozen: return "dozen"
        }
    }

    static func units(for dim: Dim) -> [DisplayUnit] { allCases.filter { $0.dim == dim } }
}

struct UnitPrice: Codable, Hashable {
    /// Price per base unit (per oz / fl oz / each)
    var perBase: Double
    /// Estimated (range size, typical piece weight…)
    var est: Bool
}

enum Units {
    private static let aliases: [String: (Dim, Double)] = {
        var m: [String: (Dim, Double)] = [:]
        let w: [(String, Double)] = [
            ("oz", 1), ("ounce", 1), ("ounces", 1), ("onz", 1), ("wt", 1),
            ("lb", 16), ("lbs", 16), ("pound", 16), ("pounds", 16),
            ("g", 0.03527396), ("gr", 0.03527396), ("gm", 0.03527396), ("gram", 0.03527396), ("grams", 0.03527396),
            ("kg", 35.27396), ("kgs", 35.27396), ("kilo", 35.27396), ("kilogram", 35.27396), ("kilograms", 35.27396),
            ("mg", 0.00003527396),
        ]
        for (k, f) in w { m[k] = (.weight, f) }
        let v: [(String, Double)] = [
            ("floz", 1), ("fz", 1), ("fo", 1),
            ("gal", 128), ("gals", 128), ("gallon", 128), ("gallons", 128), ("gl", 128),
            ("qt", 32), ("qts", 32), ("quart", 32), ("quarts", 32),
            ("pt", 16), ("pts", 16), ("pint", 16), ("pints", 16),
            ("cup", 8), ("cups", 8),
            ("l", 33.8140227), ("lt", 33.8140227), ("ltr", 33.8140227), ("liter", 33.8140227), ("liters", 33.8140227), ("litre", 33.8140227), ("litres", 33.8140227),
            ("ml", 0.0338140227), ("mls", 0.0338140227), ("milliliter", 0.0338140227), ("milliliters", 0.0338140227),
            ("cl", 0.338140227),
        ]
        for (k, f) in v { m[k] = (.volume, f) }
        let c: [(String, Double)] = [
            ("ct", 1), ("cnt", 1), ("count", 1), ("each", 1), ("ea", 1),
            ("pc", 1), ("pcs", 1), ("piece", 1), ("pieces", 1),
            ("pk", 1), ("pack", 1), ("packs", 1), ("pkg", 1),
            ("dozen", 12), ("dz", 12), ("doz", 12),
            ("roll", 1), ("rolls", 1), ("sheet", 1), ("sheets", 1),
            ("bunch", 1), ("head", 1), ("bag", 1), ("can", 1), ("cans", 1),
            ("bottle", 1), ("bottles", 1), ("bar", 1), ("bars", 1),
            ("pouch", 1), ("pouches", 1), ("stick", 1), ("sticks", 1),
            ("capsule", 1), ("capsules", 1), ("pod", 1), ("pods", 1), ("k-cup", 1), ("k-cups", 1),
            ("tablet", 1), ("tablets", 1), ("load", 1), ("loads", 1), ("wipes", 1),
            ("egg", 1), ("eggs", 1), ("unit", 1), ("units", 1),
        ]
        for (k, f) in c { m[k] = (.count, f) }
        return m
    }()

    private static let unitPattern: String = {
        let singles = aliases.keys.filter { !$0.contains(" ") && !$0.contains("-") }.sorted { $0.count > $1.count }
        return (["fl\\.?\\s*oz\\.?", "fluid\\s+ounces?", "k-cups?"] + singles).joined(separator: "|")
    }()

    // Longest alternatives first: "1 1/2" must match as a mixed number, not as "1" followed by "1/2".
    private static let num = "(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?|\\.\\d+)"
    private static let sizeRx = Rx("\(num)\\s*(?:-|to)?\\s*(?:\(num)\\s*)?(\(unitPattern))\\b\\.?")
    // "12 x 12 fl oz", "12 pk / 12 fl oz", "6 ct, 16.9 fl oz", "24 - 16.9 fl oz", "12pk 12oz".
    //
    // (?<![\d.]) stops the count being digits pulled out of a decimal: without it "1.5-2 lb" parsed
    // as five 2-lb packs and priced a chicken breast at 7 cents a pound. NSRegularExpression (ICU)
    // supports the same fixed-width lookbehind as JavaScript and was verified to behave identically
    // at the start of the string and inside a decimal, so the pattern is a literal port.
    //
    // A bare "/" separator is excluded because "3/4 lb" is a fraction, not three 4-lb packs; a
    // slash-separated multipack ("12 pk / 12 fl oz") still matches via the pack-word branch.
    private static let multiRx = Rx("(?<![\\d.])(\\d+)\\s*-?\\s*(?:x|×|pk\\.?|pack|ct\\.?|count|cans?|bottles?)\\s*(?:/|,|x|×|-|of)?\\s*\(num)\\s*(\(unitPattern))\\b")
    private static let multiRx1B = Rx("(?<![\\d.])(\\d+)\\s*(?:,|x|×|-|of)\\s*\(num)\\s*(\(unitPattern))\\b")
    private static let multiRx2 = Rx("(?<![\\d.])(\\d+)\\s*(?:pk\\.?|pack|ct\\.?|count)\\s+\(num)\\s*(\(unitPattern))\\b")
    /// A COUNT WORD before the size ("12 ct, 15 oz", "6-Pack, 5.63 LB", "24 Count, 6.75 FL OZ") says
    /// how many of something there are, but not whether the size that follows is each one or all
    /// of them. An explicit multiplication sign ("4 x 14.4 oz") does say, and is not covered here.
    ///
    /// Read as a multipack, "Sara Lee Hawaiian Rolls, 12 ct, 15 oz" became 12 x 15 oz = 180 oz:
    /// 23.9c/lb for rolls that are $2.87/lb, the BEST PRICE headline at 53211 with "46% less" on
    /// top, on the phone as on the web. The bag holds twelve rolls and weighs 15 oz in all.
    ///
    /// Measured on every captured listing (7,939 distinct name/size pairs): VOLUME, 5 of 5 are packs
    /// of containers (drinks are labelled per container); WEIGHT, 3 of 4 state the whole package
    /// (the rolls, Sam's "16 count, 30 oz" buns, Sam's "Hormel Chili with Beans 6-Pack, 5.63 LB" —
    /// the US NET WT convention), and the fourth, Costco's "2-count, 20 oz" bread, is settled by
    /// its stated size in `ProductFactory.settleCountFirst`. When the words cannot tell, the parse
    /// takes the reading that cannot make a price too cheap. Mirrors COUNT_WORD_FIRST_RE in
    /// shared/units.js; the two must not diverge.
    ///
    /// Only words that count PIECES qualify (ct, count, cnt, "pack" spelled out). "pk" and a
    /// container noun count PACKAGES: 15 of the 16 captured products named "Npk" are packs of units,
    /// and the sixteenth states no weight. Round 2's first cut included "pk" and read "12pk 12oz" as
    /// one 12 oz package, twelve times too dear (testUnambiguousMultipackForm caught it).
    private static let countWordFirstRx = Rx("^\\s*\\d+\\s*-?\\s*(?:pack|packs|ct\\.?|count|cnt)\\b")
    /// ...unless a PLURAL container noun follows the size ("12-count 5.3 oz cups", "8 Pack, 6.75 fl
    /// oz Juice Boxes"): each of those holds that much. Singular does not ("15 oz Bag" is the bag).
    private static let containersAfterRx = Rx("^\\s*\\.?\\s*(?:[a-z]+\\s+)?(?:cups|cans|bottles|pouches|packets|jars|tubs|cartons|containers|boxes)\\b")
    /// A gram figure followed by a nutrient is a nutrition claim, not the package: Meijer's "Froot
    /// Loops ... 12g Whole Grains Family Size 16.2 oz" "said" 12 g and set off the size-conflict
    /// guard. Mirrors NUTRIENT_AFTER_RE / NUTRITION_CLAIM_RE in shared/units.js.
    private static let nutrientAfter = "\\s*(?:of\\s+)?(?:whole\\s+grains?|protein|fib(?:er|re)|(?:added\\s+|total\\s+)?sugars?|(?:net\\s+)?carbs?|carbohydrates?|(?:sat(?:urated)?\\s+|trans\\s+)?fat|sodium|caffeine|collagen)\\b"
    private static let nutrientAfterRx = Rx("^" + nutrientAfter)
    private static let nutritionClaimRx = Rx("(?<![\\d.])\\d+(?:\\.\\d+)?\\s*(?:g|gr|gm|grams?|mg)\\b(?=" + nutrientAfter + ")")
    /// A capacity is not a net quantity: "Reynolds Turkey Size Oven Bags, Holds Up to 24 Pounds, 2
    /// Count" parsed as 768 oz of oven bag at 5c/lb and led a whole-turkey search at five stores.
    /// Mirrors CAPACITY_RE in shared/units.js.
    private static let capacityRx = Rx("\\b(?:(?:holds?|fits?|accommodates?|for)\\s+)?up\\s+to\\s+\\d+(?:\\.\\d+)?\\s*-?\\s*(?:lbs?|pounds?|oz|ounces?|kg|qts?|quarts?|gal(?:lons?)?|cups?|servings?)\\b|\\b(?:holds?|fits?)\\s+\\d+(?:\\.\\d+)?\\s*-?\\s*(?:lbs?|pounds?|oz|ounces?|kg|qts?|quarts?|gal(?:lons?)?)\\b")
    private static let fractionRx = Rx("^(\\d+)/(\\d+)$")

    /// "4/4 oz" (four 4 oz sticks) and "24/16 Oz" (a 24-count case of the 16 oz unit) are pack
    /// notation, not fractions; read as fractions they said 1 oz and 1.5 oz and set off the size-
    /// conflict guard against correct rows. Which side is the count is not knowable, so such a
    /// figure is not a size at all. Mirrors packNotation in shared/units.js.
    private static func packNotation(_ numText: String?) -> Bool {
        guard let t = numText?.trimmingCharacters(in: .whitespaces), let f = fractionRx.match(t), let a = Int(f[1] ?? ""), let b = Int(f[2] ?? ""), b > 0 else { return false }
        func gcd(_ x: Int, _ y: Int) -> Int { y == 0 ? x : gcd(y, x % y) }
        return a >= b || gcd(a, b) > 1
    }

    /// First size in `s` that is not a nutrition claim or pack notation (see matchSize in
    /// shared/units.js). Capture groups as `Rx.match`.
    private static func matchSize(_ s: String) -> [String?]? {
        let ns = s as NSString
        for m in sizeRx.re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            let groups: [String?] = (0..<m.numberOfRanges).map { i in
                let r = m.range(at: i)
                return r.location == NSNotFound ? nil : ns.substring(with: r)
            }
            let after = ns.substring(from: m.range.location + m.range.length)
            if let u = lookup(groups[3]), u.dim == .weight, ["g", "gr", "gm", "gram", "grams", "mg"].contains(u.key), nutrientAfterRx.test(after) { continue }
            if packNotation(groups[1]) || packNotation(groups[2]) { continue }
            return groups
        }
        return nil
    }
    /// The count can also come AFTER the size: "12 fl oz, 12 Pack Cans", "5.3 oz, 12 Count".
    ///
    /// The hyphen in "12-pack" is not optional in the wild: Costco lists nearly every case that way
    /// ("16.9 fl oz, 12-pack"). Without it the size resolved to a bare count of 12 and the volume was
    /// thrown away, which prices a case of shakes per bottle.
    private static let multiRxTrailing = Rx("\(num)\\s*(\(unitPattern))\\b[\\s,.]*-?[\\s,.]*(?<![\\d.])(\\d+)(\\s*-?\\s*)(pk\\.?|pack|ct\\.?|count)\\b")
    /// "Yogurt Cups, 5.3 oz, 12 Count": a plural container word means the count after a weight is
    /// N containers of M. Without one ("Cheese Slices, 8oz, 9ct") the weight is the package. Port of
    /// CONTAINER_IN_NAME_RE in shared/units.js, which records the measurement behind it.
    private static let containerInNameRx = Rx("\\b(?:cups|pouches|portions|packets|cans|bottles|jars|tubs|cartons|containers|boxes|bars|pods|sticks|packs|bags|cartridges|k-cups)\\b", caseInsensitive: true)
    private static let nameSizeRx = Rx("(\\d+\\s*(?:x|pk|pack|ct)?\\s*(?:/|x|-)?\\s*)?\(num)\\s*(\(unitPattern))\\b")
    private static let adjectiveRx = Rx("(\\d)\\s+(?:double|triple|mega|huge|giant|super|jumbo|family(?:\\s+size)?|big|regular|large|xl)\\s+(?=[a-z])")
    private static let perWeightRx = Rx("^(?:priced\\s+)?per\\s+(lb|pound|kg)\\b")
    private static let slashLbRx = Rx("^(?:avg\\.?\\s*)?/\\s*lb$")
    private static let eachRx = Rx("^(?:1\\s+)?each$|^ea\\.?$|^1\\s*ea\\.?$")
    /// Any dash-joined (or "to"-joined) pair of plain numbers followed by a unit is a range,
    /// regardless of which side is larger: "10-15 oz" and "1.5-2 lb" are both one package.
    private static let dashRangeRx = Rx("^\\s*\\d+(?:\\.\\d+)?\\s*(?:-|to)\\s*\\d")

    // Spelled-out fractions, which appear on milk and butter listings with no digits at all.
    // The order mirrors shared/units.js: "three-quarter" must be rewritten BEFORE "quarter", or
    // the quarter rule fires first (there is a word boundary after the hyphen) and turns it into
    // "three-0.25 pound", which then parses as 4 oz instead of 12.
    private static let halfUnitRx = Rx("\\bhalf\\s+(gallon|gal|pint|pt|dozen|lb|pound|liter|litre)\\b")
    private static let threeQuarterRx = Rx("\\bthree[- ]quarters?\\s+(pound|lb|gallon|gal)\\b")
    private static let quarterRx = Rx("\\bquarter\\s+(pound|lb|gallon|gal)\\b")
    private static let aDozenRx = Rx("\\b(?:a|one)\\s+dozen\\b")
    private static let halfDozenRx = Rx("\\bhalf[- ]dozen\\b")

    static func parseNumber(_ raw: String?) -> Double? {
        guard let raw else { return nil }
        let s = raw.trimmingCharacters(in: .whitespaces)
        if let m = Rx("^(\\d+)\\s+(\\d+)/(\\d+)$").match(s), let a = Double(m[1] ?? ""), let b = Double(m[2] ?? ""), let c = Double(m[3] ?? ""), c > 0 {
            return a + b / c
        }
        if let m = Rx("^(\\d+)/(\\d+)$").match(s), let a = Double(m[1] ?? ""), let b = Double(m[2] ?? ""), b > 0 {
            return a / b
        }
        return Double(s)
    }

    private static func lookup(_ raw: String?) -> (key: String, dim: Dim, factor: Double)? {
        guard let raw else { return nil }
        var u = raw.lowercased().replacingOccurrences(of: ".", with: "")
        u = u.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        if u == "fl oz" || u == "floz" || u.hasPrefix("fluid ounce") { u = "floz" }
        guard let a = aliases[u] else { return nil }
        return (u, a.0, a.1)
    }

    private static func round4(_ n: Double) -> Double {
        guard n.isFinite else { return n }
        // Keep enough significant figures that a very small size never collapses to zero and takes
        // the item out of the comparison without anyone noticing.
        if n != 0 && abs(n) < 0.001 { return n }
        return (n * 10000).rounded() / 10000
    }

    /// True when a parsed weight is a dosage rather than the size of the package.
    /// A milligram figure on a label is a dose ("Vitamin D3, 25 mg"); treating it as the package
    /// gives a number that is arithmetically true and useless — roughly $370,000 per pound.
    /// These items fall through to per-each pricing, which is how they are actually sold.
    private static func isDoseNotPackage(_ u: (key: String, dim: Dim, factor: Double), _ amount: Double) -> Bool {
        guard u.dim == .weight else { return false }
        if u.key == "mg" { return true }
        // Loose spices and yeast packets start around 5 g; anything below that is a dose.
        if ["g", "gram", "grams"].contains(u.key) && amount < 3 { return true }
        return false
    }

    /// Bound what the size regexes see: long digit runs backtrack badly (mirrors boundSizeText in
    /// shared/units.js).
    static func boundSizeText(_ v: String) -> String {
        Rx("\\d{10,}").replace(String(v.prefix(200)), with: "999999999")
    }

    static func parseSize(_ input: String?) -> ParsedSize? {
        guard let input else { return nil }
        var s = boundSizeText(input).replacingOccurrences(of: "\u{00AE}", with: " ")
            .replacingOccurrences(of: "\u{2122}", with: " ")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        let lower = s.lowercased()
        if perWeightRx.test(lower) || slashLbRx.test(lower) || lower == "lb" || lower == "per lb" {
            return ParsedSize(dim: .weight, base: nil, amount: nil, unit: "lb", count: 1, perWeight: true, range: false, text: s)
        }
        if eachRx.test(lower) {
            return ParsedSize(dim: .count, base: 1, amount: 1, unit: "each", count: 1, perWeight: false, range: false, text: s)
        }
        // "12 Double Rolls", "8 Family Size Bars"
        s = adjectiveRx.replace(s, with: "$1 ")

        // Spelled-out fractions: "half gallon" -> "0.5 gallon", "a dozen" -> "12 ct".
        s = halfUnitRx.replace(s, with: "0.5 $1")
        s = threeQuarterRx.replace(s, with: "0.75 $1")
        s = quarterRx.replace(s, with: "0.25 $1")
        s = aDozenRx.replace(s, with: "12 ct")
        s = halfDozenRx.replace(s, with: "6 ct")

        // Count-before-size, then count-after-size ("12 fl oz, 12 Pack").
        var m = multiRx.match(s) ?? multiRx2.match(s) ?? multiRx1B.match(s)
        var n = m.flatMap { Int($0[1] ?? "") }
        var each = m.flatMap { parseNumber($0[2]) }
        var u = m.flatMap { lookup($0[3]) }
        if let mm = m, let uu = u, let whole = mm[0], let nn = n, let ee = each, countWordFirstRx.test(whole), !dashRangeRx.test(whole),
           nn > 1, nn <= 200, ee > 0, uu.dim != .count, !isDoseNotPackage(uu, ee) {
            // "N ct, M oz": volume keeps the pack reading (drinks are labelled per container);
            // weight is read as the package's net weight unless a plural container follows the
            // size. Both carry `countFirst` so ProductFactory.pickSize can overrule the reading when
            // the retailer's own stated size settles it arithmetically.
            let cf = CountFirst(n: nn, unitBase: round4(ee * uu.factor))
            let after: String = {
                guard let r = s.range(of: whole) else { return "" }
                return String(s[r.upperBound...])
            }()
            if uu.dim == .weight && !containersAfterRx.test(after) {
                return ParsedSize(dim: uu.dim, base: round4(ee * uu.factor), amount: ee, unit: uu.key, count: 1, perWeight: false, range: false, text: s, countFirst: cf)
            }
            return ParsedSize(dim: uu.dim, base: round4(Double(nn) * ee * uu.factor), amount: ee, unit: uu.key, count: nn, perWeight: false, range: false, text: s, countFirst: cf)
        }
        if m == nil, let t = multiRxTrailing.match(s) {
            each = parseNumber(t[1])
            u = lookup(t[2])
            n = Int(t[3] ?? "")
            m = t
            // "8oz, 9ct": a weight followed by an unhyphenated piece count is the package; the count
            // is kept for sizeFromName (see containerInNameRx).
            let word = (t[5] ?? "").lowercased()
            let pieceWord = (word.hasPrefix("ct") || word.hasPrefix("count")) && !(t[4] ?? "").contains("-")
            if pieceWord, let uu = u, uu.dim == .weight, let nn = n, nn > 1, nn <= 200, let ee = each, ee > 0, !isDoseNotPackage(uu, ee) {
                let one = round4(ee * uu.factor)
                return ParsedSize(dim: uu.dim, base: one, amount: ee, unit: uu.key, count: 1, perWeight: false, range: false, text: s, countAfter: CountFirst(n: nn, unitBase: one))
            }
        }
        if let m, let u {
            // "10-15 oz" is a range, not ten 15-oz packs. Any dash-joined pair of plain numbers
            // followed by a unit is a range, regardless of which side is larger.
            let dashRange = dashRangeRx.test(m[0] ?? "")
            let each = each ?? .nan
            let n = n ?? 0
            // The dose guard applies here too: "2 x 500 mg" is two doses, not a 0.0353 oz package.
            if isDoseNotPackage(u, each) { return nil }
            if !dashRange && n > 1 && n <= 200 && each > 0 && u.dim != .count {
                return ParsedSize(dim: u.dim, base: round4(Double(n) * each * u.factor), amount: each, unit: u.key, count: n, perWeight: false, range: false, text: s)
            }
        }

        if let m = matchSize(s) {
            let a = parseNumber(m[1])
            let b = parseNumber(m[2])
            let u = lookup(m[3])
            // A milligram figure on a label is a dose, not a package size. Fall through to "each".
            if let u, let a, isDoseNotPackage(u, a) { return nil }
            if let u, let a, a > 0 {
                // "12.2-14.4 oz" style ranges: keep the low end but flag it.
                let range = (b ?? -.infinity) > a
                return ParsedSize(dim: u.dim, base: round4(a * u.factor), amount: a, unit: u.key, count: 1, perWeight: false, range: range, text: s)
            }
        }
        // "12" alone with no unit — too ambiguous
        return nil
    }

    /// "Yogurt Cups, 5.3 oz, 12 Count": the name counts containers, so the count-after reading is N of M.
    private static func packIfContainers(_ p: ParsedSize, _ name: String) -> ParsedSize {
        guard let ca = p.countAfter, containerInNameRx.test(name) else { return p }
        var pack = p
        pack.base = round4(Double(ca.n) * ca.unitBase)
        pack.count = ca.n
        pack.countAfter = nil
        return pack
    }

    /// Size embedded in a name: "Organic Whole Milk, 64 FZ", "Eggs Large 12ct".
    static func sizeFromName(_ rawName: String) -> ParsedSize? {
        guard !rawName.isEmpty else { return nil }
        // Nutrition claims ("12g Whole Grains") and capacities ("Holds Up to 24 Pounds") are not sizes.
        let name = capacityRx.replace(nutritionClaimRx.replace(boundSizeText(rawName), with: " "), with: " ")
        // JS splits on /,\s*/: the comma and the whitespace AFTER it go, whitespace before it stays.
        let parts: [String] = name.components(separatedBy: ",").enumerated().map { i, raw in
            i == 0 ? raw : String(raw.drop(while: { $0.isWhitespace }))
        }
        // Try progressively longer tails before single segments: a pack size is often split across
        // two of them ("Coca-Cola, 12 fl oz, 12 Pack Cans"), and parsing only the last segment
        // would keep the count and silently throw away the 12 fl oz.
        if parts.count > 1 {
            for i in max(0, parts.count - 3)..<(parts.count - 1) {
                let tail = parts[i...].joined(separator: ", ")
                // A count-first weight ("12 ct, 15 oz") parses with count 1 but must still be
                // returned from here WITH its stated count, so pickSize can recognise Costco's two
                // 20 oz loaves.
                if let p = parseSize(tail), !p.perWeight, p.count > 1 || p.countFirst != nil || p.countAfter != nil, p.dim != .count { return packIfContainers(p, name) }
            }
        }
        for p in parts.reversed() {
            if let s = parseSize(p), !s.perWeight { return packIfContainers(s, name) }
        }
        if let m = nameSizeRx.match(name), let whole = m[0] { return parseSize(whole) }
        // A container word with no number ("Alta Dena Whole Milk, Paper Quart") is one of it, for
        // liquids only. Mirrors sizeFromName in shared/units.js.
        if looksLiquid(name), let m = Rx("\\b(gallon|quart|pint)\\b").match(name), let w = m[1] { return parseSize("1 \(w)") }
        return nil
    }

    // MARK: liquids

    // Words that mean the package really holds a liquid. Deliberately excludes "can" and "bottle"
    // on their own: canned corn and canned pumpkin are sold by net weight, and "pop" alone matched
    // Pop-Tarts. A container word only counts when something else on the label is also a drink.
    // 'soup' is deliberately absent: a can or pouch of soup is labelled NET WT (condensed cream of
    // mushroom is 10.5 oz of food, not 10.5 fluid ounces), and treating it as a liquid published
    // "$8.90/gal" for a can of ALDI condensed soup. Broth and stock stay, because those really are
    // sold in fluid ounces. Mirrors shared/units.js; the two must not diverge.
    /// Pourable cream is a liquid too: a store's "16 oz" carton of heavy cream is 16 fl oz, and read
    /// as a weight it dropped out of a heavy-cream search compared by volume (Costco's Maola quart,
    /// the cheapest in Chicago, among 14 captured listings). Not whipped cream or table cream,
    /// which are sold by NET WT. Mirrors LIQUID_RE in shared/units.js.
    private static let liquidRx = Rx("\\b(beer|ale|lager|ipa|seltzer|soda|cola|sparkling water|water|juice|lemonade|drink|beverage|milk|kefir|creamer|tea|kombucha|cider|wine|vodka|whiskey|rum|tequila|gin|spirits?|broth|stock|smoothie|shake|coffee drink|cold brew|energy drink|sports drink|gatorade|oil|vinegar|syrup|sauce|dressing|soda pop|heavy (?:whip(?:ping)? )?cream|whipping cream|half (?:&|and|n) half|half-and-half|egg ?nog|buttermilk)\\b")
    // "Cut Sweet Potatoes in Syrup", "Tuna in Water": what follows "in" is the packing medium, not
    // the product, and the can is still sold by NET WEIGHT. Without this, two 40 oz cans of the
    // same cut sweet potato at the same $4.99 on one Mariano's shelf landed in different
    // dimensions, one at $2.00/lb and the other quoted at $15.97 per gallon and dropped from the
    // comparison, purely because one label said "in Syrup".
    //
    // The medium is usually qualified, and a fixed list of qualifiers missed the commonest canned-
    // fruit label of all: "Peach Slices in 100% Juice", "Pineapple Chunks in Pineapple Juice",
    // "Diced Tomatoes In Tomato Juice" were still quoted per gallon. Up to two words may sit
    // between "in" and the medium, and "with Coconut Water" after it is part of the medium too.
    // Mirrors PACKING_MEDIUM_RE in shared/units.js.
    private static let packingMediumRx = Rx("\\b(?:packed\\s+)?in\\s+(?:[a-z0-9%'-]+\\s+){0,2}(?:syrup|juices?|water|brine|oil|sauce|gravy)(?:\\s+(?:with|and)\\s+(?:[a-z'-]+\\s+){0,2}(?:water|juices?|syrup))?\\b")
    /// Containers that only imply a liquid alongside a real liquid word.
    private static let containerRx = Rx("\\b(cans?|bottles?|jugs?|cartons?)\\b")
    private static let drinkWithContainerRx = Rx("\\b(soda|cola|beer|seltzer|juice|water|drink|energy)\\b")
    // Things sold by net weight even though a liquid word appears on the label. Flavour words like
    // "chocolate" and "strawberry" are NOT here: chocolate milk is still milk, and vetoing it put
    // the flavoured version in a different dimension from the plain one, so they stopped comparing.
    // 'cranberr(y|ies)' and 'jellied' were added because a 14 oz can of jellied cranberry sauce is
    // NET WT 14 oz of gel — about 10.5 fluid ounces — so "$14.54/gal" understated it by a third;
    // 'yam'/'sweet potato' because the same cut sweet potato compared in two different dimensions
    // depending on whether its label mentioned syrup.
    // Dry and concentrated forms of a liquid are sold by net weight too: Whole Foods' Bare Bones
    // "Chicken Broth Pantry Pack" (instant broth sticks, NET WT 2.12 oz) read $422/gal in a broth
    // search whose real broths sat near $10/gal. 'butter' does not fire on "Butter Chicken", a
    // curry: Kettle & Fire's Butter Chicken and Classic Chicken bone broths, both 16.9 OZ at the
    // same price, landed in different dimensions because of it. Mirrors SOLID_RE in shared/units.js.
    private static let solidRx = Rx("\\b(gelatin|jell-?o|bites?|bars?|cookies?|candy|chips?|cheese|crackers?|cereal|powder|mix|bread|cake|pastr(?:y|ies)|snacks?|nuts?|jerky|butter(?!\\s+chicken)|beans?|noodles?|pasta|rice|flakes|granola|pretzels?|popcorn|gummies|grounds?|whole bean|k-cups?|pods?|tea bags?|frozen|yogurt|yoghurt|skyr|cottage|ricotta|curds?|oats?|oatmeal|flour|sugar|cocoa|corn|pumpkin|tuna|salmon|soups?|soup mix|condensed|kernel|cranberr(?:y|ies)|jellied|yams?|sweet potato(?:es)?|pie filling|muffins?|donuts?|doughnuts?|instant|(?<!non-)sticks?|stick packs?|packets?|(?<!from\\s)concentrate|cubes?|bouillon|granules?|pantry pack|dry milk)\\b")

    static func looksLiquid(_ name: String) -> Bool {
        let n = packingMediumRx.replace(name, with: " ")
        if liquidRx.test(n) { return true }
        // "12 pk cans" is only a liquid if the label names a drink somewhere too.
        return containerRx.test(n) && drinkWithContainerRx.test(n)
    }

    /// Stores often write "12 oz" for canned/bottled drinks when they mean fluid ounces.
    static func coerceLiquid(_ size: ParsedSize?, name: String) -> ParsedSize? {
        guard var s = size, s.dim == .weight, !s.perWeight else { return size }
        guard ["oz", "ounce", "ounces", "onz"].contains(s.unit) else { return size }
        guard looksLiquid(name), !solidRx.test(name) else { return size }
        s.dim = .volume
        s.unit = "floz"
        s.liquidCoerced = true
        return s
    }

    // MARK: display

    private static let unitLabels: [String: String] = [
        "floz": "fl oz", "fz": "fl oz", "fo": "fl oz", "gl": "gal", "gals": "gal", "gallon": "gal", "gallons": "gal",
        "lbs": "lb", "pound": "lb", "pounds": "lb", "ounce": "oz", "ounces": "oz", "onz": "oz", "wt": "oz",
        "l": "L", "lt": "L", "ltr": "L", "liter": "L", "liters": "L", "litre": "L", "litres": "L",
        "mls": "ml", "milliliter": "ml", "milliliters": "ml", "qts": "qt", "quart": "qt", "quarts": "qt",
        "pint": "pt", "pints": "pt", "pts": "pt", "cnt": "ct", "count": "ct", "each": "ea", "dz": "dozen", "doz": "dozen",
        "gr": "g", "gm": "g", "gram": "g", "grams": "g", "kgs": "kg",
    ]

    static func unitLabel(_ unit: String) -> String { unitLabels[unit] ?? unit }

    static func format(_ size: ParsedSize?) -> String {
        guard let size else { return "" }
        if size.perWeight { return "per lb" }
        let u = unitLabel(size.unit)
        let amt = size.amount.map(trimNum) ?? ""
        if size.count > 1 { return "\(size.count) × \(amt) \(u)" }
        return "\(amt) \(u)".trimmingCharacters(in: .whitespaces)
    }

    static func trimNum(_ n: Double) -> String {
        let r = (n * 100).rounded() / 100
        return r == r.rounded() ? String(Int(r)) : String(r)
    }

    /// A sensible default display unit given observed package sizes.
    static func defaultDisplayUnit(_ dim: Dim, sizes: [Double], query: String) -> DisplayUnit {
        let q = query.lowercased()
        if dim == .count { return Rx("\\beggs?\\b").test(q) ? .dozen : .ct }
        let sorted = sizes.filter { $0 > 0 }.sorted()
        let med = sorted.isEmpty ? 0 : sorted[sorted.count / 2]
        if dim == .weight { return med >= 12 || sorted.isEmpty ? .lb : .oz }
        if Rx("\\b(milk|juice|water|tea|lemonade|cider|oj)\\b").test(q) && med >= 32 { return .gal }
        return med >= 96 ? .gal : .floz
    }

    // MARK: produce

    /// Typical weight of one piece (lb), for comparing "each" vs "per lb" produce. Estimates only.
    private static let produce: [(Rx, Double)] = [
        (Rx("\\bbaby bananas?\\b"), 0.15), (Rx("\\bplantains?\\b"), 0.6), (Rx("\\bbananas?\\b"), 0.33), (Rx("\\bavocados?\\b"), 0.4),
        (Rx("\\blemons?\\b"), 0.25), (Rx("\\blimes?\\b"), 0.15),
        (Rx("\\b(honeycrisp|gala|fuji|granny smith|pink lady|braeburn|red delicious|golden delicious|envy|jazz|cosmic crisp|ambrosia)\\b|\\bapples?\\b"), 0.4),
        (Rx("\\bnavel oranges?\\b|\\boranges?\\b"), 0.45), (Rx("\\bgrapefruits?\\b"), 1.0), (Rx("\\bmangos?\\b|\\bmangoes\\b"), 0.75),
        (Rx("\\bpears?\\b"), 0.45), (Rx("\\bpeach(es)?\\b"), 0.35), (Rx("\\bnectarines?\\b"), 0.33), (Rx("\\bplums?\\b"), 0.2),
        (Rx("\\bkiwis?\\b"), 0.2), (Rx("\\bpomegranates?\\b"), 0.6), (Rx("\\b(bell )?peppers?\\b"), 0.4), (Rx("\\bcucumbers?\\b"), 0.6),
        (Rx("\\bzucchini\\b"), 0.5), (Rx("\\byellow squash\\b"), 0.5), (Rx("\\beggplants?\\b"), 1.0), (Rx("\\broma tomato(es)?\\b"), 0.15),
        (Rx("\\btomato(es)?\\b"), 0.33), (Rx("\\bsweet potato(es)?\\b|\\byams?\\b"), 0.6), (Rx("\\bpotato(es)?\\b"), 0.55),
        (Rx("\\bonions?\\b"), 0.5), (Rx("\\bgarlic\\b"), 0.12), (Rx("\\bjalapenos?\\b"), 0.05), (Rx("\\bartichokes?\\b"), 0.5), (Rx("\\bcorn\\b"), 0.6),
    ]
    /// Words that mean the produce word in the name is not one loose piece of produce.
    ///
    /// The estimate is multiplied by a price to publish a per-pound figure, so a wrong match
    /// invents a number out of nothing. Live results gave us a 69c packet of "Mama Bean Vermicelli
    /// Tom Yam" quoted at $1.15/lb as Woodman's cheapest yam, and a 6-count box of "Sweety Mochi,
    /// Ube Purple Yam" — 7.5 oz of ice cream in total — quoted at $1.66/lb when the honest figure
    /// is $12.78/lb. A container word is just as disqualifying: a "Yellow Onion Bag" is not one
    /// 0.5 lb onion, and pricing it as one published $25.98/lb against a real median of $1.75.
    private static let notProduceRx = Rx("\\b(juice|bread|chips?|sauce|dried|frozen|canned|jar|salsa|guacamole|oil|mix|pie|cake|smoothie|yogurt|candy|bar|powder|seasoning|soup|salad kit|noodles?|vermicelli|ramen|pasta|mochi|ice cream|dessert|cookies?|crackers?|syrup|bag|case|box|carton|crate|tray|pack|instant|cut|sliced|diced|wedges?|fries|tots|puree|filling)\\b")

    static func produceWeightLb(_ name: String) -> Double? {
        let n = name.lowercased()
        if notProduceRx.test(n) { return nil }
        for (rx, lb) in produce where rx.test(n) { return lb }
        return nil
    }
}
