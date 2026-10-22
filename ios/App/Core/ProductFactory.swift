import Foundation

/// Builds the normalized `Product` every source returns (port of the web version's makeProduct).
struct ProductInput {
    var storeId: String
    var id: String
    var name: String
    var brand: String? = nil
    var sizeText: String? = nil
    var price: Double?
    var regularPrice: Double? = nil
    var memberPrice: Double? = nil
    var memberLabel: String? = nil
    var soldBy: SoldBy = .each
    var estEach: Double? = nil
    var estPkg: Double? = nil
    var onSale: Bool = false
    var promo: String? = nil
    var saleEnds: Date? = nil
    var image: URL? = nil
    var url: URL? = nil
    var stock: String? = nil
    var available: Bool = true
    var category: String? = nil
    var tags: [String] = []
    var sponsored: Bool = false
    var rank: Int? = nil
    var total: Int? = nil
    var priceBasis: PriceBasis = .shelf
    /// Instacart's own unit line ("pricingUnitString"): "4 x 14.5 oz" when the price buys four of
    /// the stated size. See `ProductFactory.listingPack`. InstacartSource must pass it through.
    var packText: String? = nil
    /// Instacart's own unit price ("$0.50/oz") as (price, unit). See `ProductFactory.unitLineConflict`.
    var listedUnit: ListedUnit? = nil
}

struct ListedUnit: Hashable {
    var price: Double
    var unit: String
}

enum ProductFactory {
    static func money(_ s: String?) -> Double? {
        guard let s, !s.isEmpty else { return nil }
        let str = s.replacingOccurrences(of: ",", with: "")
        if let m = Rx("\\$\\s*(\\d+(?:\\.\\d+)?)").match(str), let v = Double(m[1] ?? "") { return v }
        if let m = Rx("(\\d+)\\s*¢").match(str), let v = Double(m[1] ?? "") { return v / 100 }
        if let m = Rx("(\\d+(?:\\.\\d+)?)").match(str), let v = Double(m[1] ?? "") { return v }
        return nil
    }

    private static func round2(_ n: Double?) -> Double? { n.map { ($0 * 100).rounded() / 100 } }

    /// Choose between the size a store states for the package and the size embedded in the name.
    /// Port of `pickSize` in src/normalize.js.
    ///
    /// Warehouse clubs state the size of ONE unit while charging for a case: Costco lists "Kirkland
    /// Ultra Filtered 2% Lactose Free Milk, Half Gallon, 3-count" with a sizeText of "64 fl oz" and
    /// a price of $14.92. Dividing the case price by one bottle gives $29.84 a gallon for milk that
    /// is really $9.95, which is wrong in the most damaging direction: it is the number the
    /// comparison shows, and one outlier also flattens the per-store chart so every honest price
    /// looks identical.
    ///
    /// So the name wins whenever it describes a multi-pack that the stated size does not, and
    /// whenever the stated size is just a unit count ("each") while the name carries a real
    /// measurement.
    static func pickSize(_ fromText: ParsedSize?, _ fromName: ParsedSize?, name: String = "", url: URL? = nil) -> ParsedSize? {
        guard let fromName else { return fromText }
        guard let fromText else { return fromName }
        if let settled = settleCountFirst(fromText, fromName) ?? settleByStatedCount(fromText, fromName, name: name, url: url) { return settled }
        let textPack = fromText.count > 1
        let namePack = fromName.count > 1
        if namePack && !textPack { return fromName }

        // A bare "each" carries no quantity at all, so anything the name states beats it, INCLUDING
        // another count. The earlier version only swapped when the name gave a different dimension,
        // which meant an egg carton listed as sizeText "1 ea" and named "..., 24 count" kept the
        // "1 ea": a $9.32 carton was priced at $9.32 per egg instead of $0.39 and looked 32 times
        // dearer than a store whose "12 ct" happened to parse. Eggs are a staple, so this was wrong
        // constantly. Mirrors src/normalize.js; the two must not diverge.
        let textIsBareEach = fromText.dim == .count && fromText.unit == "each" && fromText.base == 1 && !fromText.perWeight
        if textIsBareEach && (fromName.base ?? 0) > 1 { return fromName }

        // "each" / "1 ct" tells us nothing a measured size does not.
        if fromText.dim == .count && fromName.dim != .count && !fromText.perWeight { return fromName }
        return fromText
    }

    /// "N ct, M oz" does not say whether M is one unit or all of them; the stated size can settle
    /// it, but only arithmetically. stated == M or N x M: N units of M (Costco "Artesano ...,
    /// 2-count, 20 oz", stated 20 oz, is two loaves). stated x N == M: M is the package (Sam's
    /// "Hormel Chili with Beans 6-Pack, 5.63 LB", stated 15 oz — six cans ARE 5.63 lb). Anything
    /// else settles nothing. Port of `settleCountFirst` in src/normalize.js.
    static func settleCountFirst(_ fromText: ParsedSize, _ fromName: ParsedSize) -> ParsedSize? {
        guard let cf = fromName.countFirst, cf.n > 1, cf.unitBase > 0 else { return nil }
        guard !fromText.perWeight, fromText.count <= 1, fromText.dim == fromName.dim, let tb = fromText.base, tb > 0 else { return nil }
        func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= max(a, b) * 0.02 }
        let one = cf.unitBase
        if near(tb, one) || near(tb, Double(cf.n) * one) {
            var pack = fromName
            pack.base = (Double(cf.n) * one * 10000).rounded() / 10000
            pack.count = cf.n
            return pack
        }
        if near(tb * Double(cf.n), one) {
            var total = fromName
            total.base = (tb * Double(cf.n) * 10000).rounded() / 10000
            total.amount = fromText.amount
            total.unit = fromText.unit
            total.count = cf.n
            return total
        }
        return nil
    }

    /// Two single-unit sizes that differ by exactly a pack count the listing itself states
    /// ("Lunch Buddies 12pk ..., 3.2 oz Pouch" stated 38.4 oz; Costco udon "30.9 oz" stated 7.72 oz
    /// with a slug reading "...-4count-..."; Sam's Jif "96 Oz. Twin Pack" stated 48 oz). The larger
    /// is the package. Needs both witnesses — exact arithmetic AND the count spelled out — because
    /// it takes the LARGER size, the direction that can make a price too cheap. Port of
    /// `settleByStatedCount` in src/normalize.js.
    static func settleByStatedCount(_ fromText: ParsedSize, _ fromName: ParsedSize, name: String, url: URL?) -> ParsedSize? {
        guard !fromText.perWeight, !fromName.perWeight, fromText.count <= 1, fromName.count <= 1, fromText.dim == fromName.dim, fromText.dim != .count else { return nil }
        guard let tb = fromText.base, let nb = fromName.base, tb > 0, nb > 0 else { return nil }
        let (small, big) = tb < nb ? (fromText, fromName) : (fromName, fromText)
        let ratio = big.base! / small.base!
        let n = Int(ratio.rounded())
        guard n >= 2, abs(ratio - Double(n)) <= Double(n) * 0.02, statedCounts(name: name, url: url).contains(n) else { return nil }
        var out = small
        out.base = big.base
        out.count = n
        out.text = big.text
        return out
    }

    private static let countWordsRx = Rx("(?<![\\d.])(\\d{1,3})\\s*-?\\s*(?:ct|count|cnt|pk|pack|packs|packets?|pouch(?:es)?|cans?|bottles?|loaves|bars?|sticks|cups|pieces|pc|ea)\\b")
    private static let twinPackRx = Rx("\\btwin[\\s-]?pack\\b|\\btwo[\\s-]?pack\\b")

    /// Every pack count a listing states in its name or URL slug: "12pk", "4 ct", "Twin Pack", "-4count-".
    static func statedCounts(name: String, url: URL?) -> Set<Int> {
        let text = "\(name) \(slugOf(url))"
        var out = Set<Int>()
        for m in countWordsRx.matches(text) { if let n = Int(m[1] ?? "") { out.insert(n) } }
        if twinPackRx.test(text) { out.insert(2) }
        return out
    }

    private static func slugOf(_ url: URL?) -> String {
        guard let u = url?.absoluteString else { return "" }
        var s = u
        if let r = s.range(of: "/products/") ?? s.range(of: "/product/") { s = "/" + String(s[r.upperBound...]) }
        if let q = s.firstIndex(where: { $0 == "?" || $0 == "#" }) { s = String(s[..<q]) }
        return s
    }

    private static let slugUnits: [String: String] = [
        "lb": "lbs?|pounds?", "lbs": "lbs?|pounds?", "pound": "lbs?|pounds?", "pounds": "lbs?|pounds?",
        "oz": "oz|ounces?", "ounce": "oz|ounces?", "ounces": "oz|ounces?",
        "g": "g|grams?", "gram": "g|grams?", "grams": "g|grams?", "kg": "kg|kilograms?",
        "floz": "fl-oz|floz|fz|fluid-ounces?|oz", "gal": "gal|gallons?", "gallon": "gal|gallons?", "qt": "qt|quarts?", "pt": "pt|pints?",
        "l": "l|liters?|litres?", "ml": "ml",
    ]

    private static let slugPerLbRx = Rx("-per-(?:lb|lbs|pound)(?=$|[-/?#])")
    static func slugPerLbConflict(_ size: ParsedSize?, url: URL?, soldByLb: Bool) -> SizeConflict? {
        guard !soldByLb, let size, size.dim == .weight, !size.perWeight, let b = size.base, b > 0 else { return nil }
        guard slugPerLbRx.test(slugOf(url)), abs(b - 16) > 0.32 else { return nil }
        return SizeConflict(text: Units.format(size), name: "priced per lb")
    }

    /// True when the retailer's URL slug spells out this size (".../18848374-sweet-potatoes-10-lbs-10-lb"
    /// states 10 lb and never 5 lb). Port of `slugStates` in src/normalize.js.
    static func slugStates(_ url: URL?, _ size: ParsedSize?, beforeEnd: Bool = false) -> Bool {
        guard let size, let units = slugUnits[size.unit], let amount = size.amount, amount > 0, url != nil else { return false }
        // A whole amount may carry a zero decimal: Plugra's slug is "...-extra-creamy-8-0-oz".
        let whole = ((amount * 100).rounded() / 100).truncatingRemainder(dividingBy: 1) == 0
        let a = Units.trimNum(amount).replacingOccurrences(of: ".", with: "[-.]?") + (whole ? "(?:[-.]0{1,2})?" : "")
        var slug = slugOf(url)
        while slug.hasSuffix("/") { slug.removeLast() }
        let rx = Rx("(?<!\\d)(?<!\\d[-.])\(a)-?(?:\(units))(?=$|[-/])")
        if !beforeEnd { return rx.test(slug) }
        let ns = slug as NSString
        return rx.re.matches(in: slug, range: NSRange(location: 0, length: ns.length)).contains { $0.range.location + $0.range.length < ns.length }
    }

    /// Does the slug confirm this size independently of the stated size? Instacart appends the stated
    /// size to every slug, so a size found only at the very END is the stated size repeating itself:
    /// King Soopers' "2% Reduced Fat Milk Half Gallon", stated "2 gal", slug "...-reduced-fat-milk-2-gal",
    /// made Denver's best milk $1.50 a gallon. Port of `slugConfirms` in src/normalize.js.
    static func slugConfirms(_ url: URL?, _ size: ParsedSize?) -> Bool { slugStates(url, size, beforeEnd: true) }

    /// Butter sold by the stick, with the stick count as its only stated size. Jewel's cheapest
    /// butter in the owner's own store check, "Lucerne Salted Butter" at $4.99 stated "4 each", had
    /// no price per pound and silently dropped out of the butter comparison, so Jewel's "best" was a
    /// $7.99 pound of Land O Lakes. The weight is recovered only when two witnesses agree: the US
    /// stick is a quarter pound, and the retailer's slug states a weight — every weight it states —
    /// that fits N such sticks as the box (4N oz, "...-salted-16-oz") or as one stick (4 oz,
    /// "...-butter-sticks-4-oz"). A name that counts anything but sticks ("2-Pack", "Half Sticks",
    /// "Family Size") is refused. 12 of 26 captured count-sized butters recovered, 0 wrong; the
    /// other 14 stay uncompared and are named by `Compare.excludedCheaper`. Port of `butterSticks`
    /// in src/normalize.js.
    private static let butterCategoryRx = Rx("^(?:salted|unsalted) butter$")
    private static let notJustSticksRx = Rx("\\b(?:half|pack|packs|pk|twin|family|value|bulk|case|foil|block|roll|tub|bar|brick|whipped|spread|pats?|minis?|cups?)\\b|\\d\\s*-?\\s*(?:ct|count|pk|pack)\\b")
    static func butterSticks(_ size: ParsedSize?, name: String, category: String?, url: URL?) -> ParsedSize? {
        guard let size, size.dim == .count, !size.perWeight, butterCategoryRx.test((category ?? "").trimmingCharacters(in: .whitespaces)) else { return nil }
        guard let b = size.base, b == b.rounded(), b >= 2, b <= 8, !notJustSticksRx.test(name) else { return nil }
        let n = Int(b)
        let weights = slugWeightsOz(url)
        let box = Double(4 * n)
        guard !weights.isEmpty, weights.allSatisfy({ abs($0 - box) <= 0.02 * box || abs($0 - 4) <= 0.08 }) else { return nil }
        var out = ParsedSize(dim: .weight, base: Double(4 * n), amount: Double(4 * n), unit: "oz", count: 1, perWeight: false, range: false, text: "\(n) sticks")
        out.sticks = n
        return out
    }

    private static let slugWeightRx = Rx("(?<!\\d)(?<!\\d-)(\\d+)(?:-(\\d{1,2}))?-?(oz|ounces?|lbs?|pounds?|g|grams?|kg)(?=$|[-/])")
    private static let slugOz: [String: Double] = ["oz": 1, "ounce": 1, "ounces": 1, "lb": 16, "lbs": 16, "pound": 16, "pounds": 16, "g": 0.03527396, "gram": 0.03527396, "grams": 0.03527396, "kg": 35.27396]
    /// Every weight a retailer's URL slug states, in ounces ("...-8-0-oz" -> 8). Port of
    /// `slugWeightsOz` in src/normalize.js.
    static func slugWeightsOz(_ url: URL?) -> [Double] {
        slugWeightRx.matches(slugOf(url)).compactMap { m in
            guard let whole = m[1], let unit = m[3], let f = slugOz[unit.lowercased()], let v = Double(m[2].map { "\(whole).\($0)" } ?? whole) else { return nil }
            return v * f
        }
    }

    /// The name counts N pieces or packs ("Chomps ... Mini Sticks - 6 Count"), the stated size is
    /// one weight or volume ("0.5 oz"), and nothing says whether that size is one piece or all of
    /// them. Under 0.25 oz (2.5 fl oz) a piece it was a per-piece size in all 15 captured food
    /// cases and a whole-package size in none — but we still do not multiply, because a wrong
    /// multiplication is a price too cheap, and it wins. The disagreement is recorded, which
    /// withholds the unit price. Port of `countOnlyConflict` in src/normalize.js.
    /// A package price that is really a price PER POUND: a weight of 1.5 lb or more whose own
    /// Instacart line says the price buys one pound (+/-3%). Piggly Wiggly's "10 lb" of ground chuck at
    /// $7.99, line "$0.50/oz". Nothing wider: the line is often the regular price on a sale, one unit
    /// of a warehouse pack, or wrong the other way. Port of `unitLineConflict` in src/normalize.js,
    /// which records the two fresh measurements (5,834 and 3,782 listings) behind the shape.
    private static let listedWeight: [String: Double] = ["oz": 1, "lb": 16, "lbs": 16]
    private static let listedUnitRx = Rx("^\\s*\\$\\s*(\\d+(?:\\.\\d+)?)\\s*(?:/\\s*|\\s+)(fl\\.?\\s*oz|oz|lbs?|gal|qt|l|ct|each|ea)\\.?\\s*$")

    static func listedUnit(_ s: String?) -> ListedUnit? {
        guard let s, let m = listedUnitRx.match(s), let v = Double(m[1] ?? ""), let u = m[2] else { return nil }
        let unit = u.lowercased().replacingOccurrences(of: "fl. oz", with: "fl oz").replacingOccurrences(of: "  ", with: " ")
        return ListedUnit(price: v, unit: unit)
    }

    static func unitLineConflict(_ size: ParsedSize?, price: Double?, listed: ListedUnit?) -> SizeConflict? {
        guard let listed, let per = listedWeight[listed.unit], listed.price > 0, let price, price > 0,
              let size, !size.perWeight, size.dim == .weight, let b = size.base, b >= 24 else { return nil }
        let implied = (price / listed.price) * per
        guard abs(implied - 16) <= 16 * 0.03 else { return nil }
        return SizeConflict(text: Units.format(size), name: "1 lb (the listing's own $\(listed.price)/\(listed.unit))")
    }

    static func countOnlyConflict(_ size: ParsedSize?, chosen: ParsedSize?, textSize: ParsedSize?, nameSize: ParsedSize?) -> SizeConflict? {
        guard let size, let t = textSize, let chosen, chosen == t, let n = nameSize, n.dim == .count else { return nil }
        guard t.count <= 1, !t.perWeight, t.dim == .weight || t.dim == .volume, let pieces = n.base, pieces >= 2, let tb = t.base, tb > 0 else { return nil }
        let floor = size.dim == .volume ? 2.5 : 0.25
        return tb / pieces < floor ? SizeConflict(text: Units.format(t), name: Units.format(n)) : nil
    }

    /// A roll of foil, wrap or parchment states its length or area ("18\"W x 500'L", "75 sq ft");
    /// a per-EACH price then compares a 500 ft roll with a 25 sq ft one. Mirrors LENGTH_OR_AREA_RE.
    private static let lengthOrAreaRx = Rx("\\d+(?:\\.\\d+)?\\s*(?:sq\\.?\\s*ft\\.?|sqft|square\\s+f(?:ee|oo)t|ft\\.?|feet|foot|yds?\\.?|yards?)(?![a-z])|\\d+(?:\\.\\d+)?\\s*['\\u2019]\\s*L\\b")

    private static let rollGoodsRx = Rx("\\b(?:alumin(?:i)?um foil|foil|plastic wrap|cling wrap|wax(?:ed)? paper|parchment(?: paper)?|freezer paper|butcher paper)\\b")
    private static let notARollRx = Rx("\\b(?:pans?|trays?|roasters?|containers?|lids?|liners?|bags?|sheets?|cups?|plates?|tins?|dish(?:es)?|board|foilware|racks?|burners?|tape|ducts?)\\b")

    /// Instacart's unit line says the price buys N of the stated size ("4 x 14.5 oz" over "14.5 oz").
    /// Priced from one unit, Del Monte's "4 Can Value Pack" and Campbell's and Swanson's four-packs
    /// read four times too dear at every Instacart-priced chain. The line is not always right, and
    /// wrong it makes a price too CHEAP (a 14 oz bag of six mini cucumbers is "6 x 14 oz"), so N is
    /// used only when the name or slug names that many PACKAGES ("4 Can", "12 Pack", "4pk", "Twin
    /// Pack"); otherwise the listing contradicts itself, which is recorded as a size conflict and the
    /// unit price withheld. Port of `listingPack` in src/normalize.js.
    private static let packTextRx = Rx("^\\s*(\\d{1,3})\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(fl\\.?\\s*oz|oz|lbs?|g|kg|ml|l)\\s*$")
    private static let packageWordsRx = Rx("(?<![\\d.])(\\d{1,3})\\s*-?\\s*(?:pk|pks|pack|packs|cans?|bottles?|pouch(?:es)?|boxes|cartons?|jars|tubs|cups)\\b")

    static func statedPackages(name: String, url: URL?) -> Set<Int> {
        let text = "\(name) \(slugOf(url).replacingOccurrences(of: "/", with: "").replacingOccurrences(of: "-", with: " "))"
        var out = Set<Int>()
        for m in packageWordsRx.matches(text) { if let n = Int(m[1] ?? "") { out.insert(n) } }
        if twinPackRx.test(text) { out.insert(2) }
        return out
    }

    static func listingPack(_ size: ParsedSize?, packText: String?, name: String, url: URL?) -> (size: ParsedSize?, conflict: SizeConflict?)? {
        guard let t = packText, let m = packTextRx.match(t), let size, !size.perWeight, size.count <= 1, size.dim == .weight || size.dim == .volume, let b = size.base, b > 0 else { return nil }
        guard let n = Int(m[1] ?? ""), n >= 2, let unit = Units.parseSize("\(m[2] ?? "") \(m[3] ?? "")"), unit.dim == size.dim, let ub = unit.base, abs(ub - b) <= 0.02 * b else { return nil }
        if statedPackages(name: name, url: url).contains(n) {
            var pack = size
            pack.base = (Double(n) * b * 10000).rounded() / 10000
            pack.count = n
            pack.packFromListing = true
            return (pack, nil)
        }
        return (nil, SizeConflict(text: Units.format(size), name: "\(n) × \(Units.format(size))"))
    }

    /// Pack count stated only in the retailer's URL slug. Port of `packFromUrl` in src/normalize.js.
    private static let urlPackRx = Rx("-(\\d{1,2})-(?:pk|pack|ct|count|cnt)(?=$|[-?/#])")

    /// Multiply a one-unit size by a pack count found only in the URL.
    ///
    /// Sam's Club lists "Kerrygold Salted Irish Butter Sticks" with a sizeText of "4 oz" — one
    /// stick — at the case price of $14.60, so the app published $58.40/lb for butter that is
    /// really $9.73/lb. The 8x guard does not catch a 6x error. The URL says it plainly:
    /// .../76160768-kerrygold-salted-butter-sticks-4-oz-6-pk.
    ///
    /// Deliberately narrow, because getting this wrong inflates a SIZE, which is a wrong price with
    /// no outlier to catch it. A bare pack count in the slug is not enough: of 115 such listings in
    /// the four-ZIP sweep, most already stated the pack TOTAL as the size. We require the slug to
    /// spell out the measurement and the count together — "...-4-oz-6-pk" — which matched 4 of
    /// those 115 and was right on all four. Mirrors src/normalize.js; the two must not diverge.
    static func applyUrlPack(_ size: ParsedSize?, url: URL?) -> ParsedSize? {
        guard var s = size, s.count <= 1, !s.perWeight, s.dim == .weight || s.dim == .volume else { return size }
        guard let base = s.base, base > 0, let amount = s.amount else { return size }
        let slug = url?.absoluteString ?? ""
        guard let m = urlPackRx.match(slug), let pack = Int(m[1] ?? ""), pack > 1, pack <= 60 else { return size }
        let amt = Units.trimNum(amount).replacingOccurrences(of: ".", with: "[-.]")
        guard Rx("(?<![\\d.])\(amt)-(?:fl-)?(?:oz|lb|g|ml|l)-\(pack)-(?:pk|pack|ct|count|cnt)(?=$|[-?/#])").test(slug) else { return size }
        s.base = (base * Double(pack) * 10000).rounded() / 10000
        s.count = pack
        return s
    }

    static func make(_ f: ProductInput) -> Product? {
        guard let rawPrice = f.price, rawPrice.isFinite, rawPrice >= 0 else { return nil }
        let name = f.name.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        let textSize = Units.parseSize(f.sizeText)
        let nameSize = Units.sizeFromName(name)
        let chosen = pickSize(textSize, nameSize, name: name, url: f.url)
        var size = applyUrlPack(chosen, url: f.url)
        let packedFromUrl = (size?.count ?? 1) > (chosen?.count ?? 1)
        // Four sticks of butter are a pound only when the retailer's slug says so too.
        if let sticks = butterSticks(size, name: name, category: f.category, url: f.url) { size = sticks }
        // Instacart's own unit line may say the price buys several of this size.
        let listed = listingPack(size, packText: f.packText, name: name, url: f.url)
        if let packed = listed?.size { size = packed }
        size = Units.coerceLiquid(size, name: "\(name) \(f.category ?? "")")
        let soldByLb = f.soldBy == .lb || (size?.perWeight ?? false)

        // The product's own name and its stated size sometimes contradict each other outright:
        // Costco lists "Sweet Potatoes, 5 lbs" with a sizeText of "10 lb", and keeping the sizeText
        // is the reading that halves the unit price and hands the item the best-price badge. We
        // cannot tell which is stale without asking the retailer, so we record the disagreement.
        //
        // Only when pickSize kept the sizeText over a name that said something else in the SAME
        // dimension. Everywhere pickSize deliberately prefers the name — a bare "1 ea" against
        // "24-count" — it has already resolved the reading, and that is a decision, not a clash.
        //
        // A range in the name ("4-10 Pounds HoKa Turkey Breast") contradicts nothing, and a slug that
        // names the stated size and not the name's settles it (Costco's "...-10-lbs-10-lb"): the
        // same decision the web reaches after its Instacart adapter drops the stale clause, reached
        // here without that adapter step so the phone lands on the same price.
        var sizeConflict: SizeConflict?
        if let t = textSize, let n = nameSize, chosen == t,
           !n.perWeight, !n.range, !t.perWeight, t.dim == n.dim, !packedFromUrl,
           !(slugConfirms(f.url, t) && !slugStates(f.url, n)),
           let tb = t.base, let nb = n.base, tb > 0, nb > 0,
           max(tb, nb) / min(tb, nb) >= 1.5 {
            sizeConflict = SizeConflict(text: Units.format(t), name: Units.format(n))
        } else if !soldByLb {
            if let c = listed?.conflict { sizeConflict = c }
            else if size?.packFromListing != true { sizeConflict = unitLineConflict(size, price: f.price, listed: f.listedUnit) ?? countOnlyConflict(size, chosen: chosen, textSize: textSize, nameSize: nameSize) }
        }
        // The URL says "per-lb" but the stated size is a fixed weight: Smart & Final's "Table Carrots",
        // stated 25 lb at $2.19, slug "...-bulk-carrots-per-lb", was $0.09/lb. Port of slugPerLbConflict.
        if let c = slugPerLbConflict(size, url: f.url, soldByLb: soldByLb) { sizeConflict = c }
        // Where the size behind the unit price came from; see `Product.sizeSource`.
        let sizeSource: String? = {
            if soldByLb { return "perLb" }
            guard size != nil else { return nil }
            if packedFromUrl || size?.packFromListing == true || size?.sticks != nil || (chosen != textSize && chosen != nameSize) { return "derived" }
            return chosen == textSize ? "stated" : "name"
        }()
        let price = round2(rawPrice)!
        let regular: Double? = {
            guard let r = f.regularPrice, r > price + 0.004 else { return nil }
            return round2(r)
        }()
        let member: Double? = {
            guard let m = f.memberPrice, m < price - 0.004 else { return nil }
            return round2(m)
        }()

        var unit: [String: UnitPrice] = [:]
        if soldByLb {
            unit[Dim.weight.rawValue] = UnitPrice(perBase: price / 16, est: false)
            if let e = f.estEach, e > 0, !Units.pieceWeightVaries(name) { unit[Dim.count.rawValue] = UnitPrice(perBase: e, est: true) }
        } else if let s = size, let b = s.base, b > 0, price > 0 {
            unit[s.dim.rawValue] = UnitPrice(perBase: price / b, est: s.range)
        }
        // Produce sold "each" vs "per lb": estimated cross-unit price so they can be compared
        if let pieceLb = Units.produceWeightLb(name), price > 0 {
            if soldByLb && unit[Dim.count.rawValue] == nil {
                unit[Dim.count.rawValue] = UnitPrice(perBase: price * pieceLb, est: true)
            } else if !soldByLb, let s = size, s.dim == .count, let b = s.base, b > 0, unit[Dim.weight.rawValue] == nil {
                unit[Dim.weight.rawValue] = UnitPrice(perBase: price / b / (pieceLb * 16), est: true)
            }
        }
        // A stated length or area: no per-each price (see lengthOrAreaRx). A size conflict: no unit
        // price at all, in either reading — the package price stays. Mirrors src/normalize.js.
        if !soldByLb, unit[Dim.count.rawValue] != nil, size == nil || size?.dim == .count, lengthOrAreaRx.test("\(name) \(f.sizeText ?? "")") {
            unit[Dim.count.rawValue] = nil
        }
        // ...and so does a roll that does not say how long it is: two rolls of unknown, different
        // lengths compared per each are the 500 ft vs 75 ft comparison with the lengths hidden.
        // Pre-cut sheets, pans, trays and liners stay countable. Mirrors ROLL_GOODS_RE.
        if !soldByLb, unit[Dim.count.rawValue] != nil, size == nil || (size?.dim == .count && size?.base == 1), rollGoodsRx.test(name), !notARollRx.test(name) {
            unit[Dim.count.rawValue] = nil
        }
        if sizeConflict != nil && !soldByLb { unit = [:] }
        // NOTE: there is deliberately no "count from the product name" rule here. src/normalize.js
        // has no counterpart, so inventing a per-egg price made the two clients pick a different
        // dimension for the same result set and therefore a different "cheapest eggs".

        let memberUnit: Double? = {
            guard let m = member else { return nil }
            if soldByLb { return m / 16 }
            if sizeConflict != nil { return nil }
            if let b = size?.base, b > 0 { return m / b }
            return nil
        }()
        let onSale = regular != nil || f.onSale
        let pctOff: Int? = {
            guard let r = regular, price > 0 else { return nil }
            let v = Int(((1 - price / r) * 100).rounded())
            return v > 0 ? v : nil
        }()
        // src/normalize.js: `dim: size?.dim || (soldByLb ? 'weight' : null)` and nothing else.
        let dim: Dim? = size?.dim ?? (soldByLb ? .weight : nil)
        return Product(
            key: "\(f.storeId):\(f.id)",
            storeId: f.storeId,
            productId: f.id,
            name: name,
            brand: tidyBrand(f.brand ?? ""),
            // A recovered stick weight says where it came from: "4 sticks · 16 oz".
            size: soldByLb ? "per lb" : (size.map { s in s.sticks.map { "\($0) sticks · \(Units.format(s))" } ?? Units.format(s) } ?? (f.sizeText ?? "")),
            sizeText: f.sizeText ?? "",
            dim: dim,
            base: (size?.perWeight ?? true) ? nil : size?.base,
            soldBy: soldByLb ? .lb : .each,
            price: price,
            regularPrice: regular,
            memberPrice: member,
            memberLabel: member != nil ? (f.memberLabel ?? "Member") : nil,
            memberUnit: memberUnit,
            estPkg: soldByLb ? round2(f.estPkg) : nil,
            onSale: onSale,
            pctOff: pctOff,
            promo: f.promo?.isEmpty == false ? f.promo : nil,
            saleEnds: f.saleEnds,
            unit: unit,
            imageURL: f.image,
            url: f.url,
            stock: f.stock,
            available: f.available,
            category: f.category,
            tags: f.tags,
            sponsored: f.sponsored,
            rank: f.rank,
            total: f.total,
            priceBasis: f.priceBasis,
            implausible: nil,
            sizeConflict: sizeConflict,
            sizeSource: sizeSource
        )
    }

    /// Port of src/normalize.js tidyBrand.
    ///
    /// The web tidies each word-character RUN (`/\w[\w']*/g`), not each space-separated word, and
    /// keeps a run of at most TWO letters uppercase. Splitting on spaces with a threshold of three
    /// lower-cased hyphenated and ampersand brands ("H-E-B" -> "H-e-b", "A&W" -> "A&w") and left
    /// three-letter brands shouting ("IGA" stayed "IGA" instead of becoming "Iga").
    static func tidyBrand(_ b: String) -> String {
        let s = b.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return "" }
        guard s == s.lowercased() || s == s.uppercased() else { return s }
        let allUpper = s == s.uppercased()
        // JS \w is ASCII [A-Za-z0-9_]; a run starts on one and may continue through apostrophes.
        func isWordChar(_ c: Character) -> Bool { c.isASCII && (c.isLetter || c.isNumber || c == "_") }
        var out = ""
        var run = ""
        func flush() {
            guard !run.isEmpty else { return }
            if run.count <= 2, allUpper, run.allSatisfy({ $0.isASCII && $0.isLetter }) {
                out += run.uppercased()
            } else {
                out += run.prefix(1).uppercased() + run.dropFirst().lowercased()
            }
            run = ""
        }
        for c in s {
            if isWordChar(c) || (!run.isEmpty && c == "'") {
                run.append(c)
            } else {
                flush()
                out.append(c)
            }
        }
        flush()
        return out
    }

    static func titleCase(_ s: String) -> String {
        s.lowercased().split(separator: " ").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }
}
