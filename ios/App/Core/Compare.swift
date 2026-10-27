import Foundation

/// Membership / loyalty preferences that change which price counts.
struct PricePrefs: Hashable {
    var prime: Bool = false
    var cardPrices: Bool = true
}

enum Compare {
    static func usesMember(_ p: Product, _ prefs: PricePrefs) -> Bool {
        guard p.memberPrice != nil else { return false }
        if (p.memberLabel ?? "").lowercased().contains("prime") { return prefs.prime }
        return prefs.cardPrices
    }

    static func effectivePrice(_ p: Product, _ prefs: PricePrefs) -> Double {
        usesMember(p, prefs) ? (p.memberPrice ?? p.price) : p.price
    }

    /// Per-base-unit price in `dim`, honoring membership preferences.
    static func unitFor(_ p: Product, dim: Dim, prefs: PricePrefs) -> (perBase: Double, est: Bool, member: Bool)? {
        guard let u = p.unitPrice(dim) else { return nil }
        if usesMember(p, prefs), let mu = p.memberUnit, dim == p.dim {
            return (mu, u.est, true)
        }
        return (u.perBase, u.est, false)
    }

    /// Dimension most relevant items can be compared in.
    static func dominantDim(_ items: [Product]) -> Dim? {
        var counts: [Dim: Int] = [:]
        for p in items {
            if let d = p.dim, let u = p.unitPrice(d), !u.est { counts[d, default: 0] += 2 }
            for d in p.dims { counts[d, default: 0] += 1 }
        }
        // Ties go weight, then volume, then count — the order shared/compare.js's stable sort
        // resolves them in. `Dictionary.max` picks among equal values in hash order, which Swift
        // seeds per process: a two-item butter search (a 16 oz pack and a "4 ct" box) came out by
        // weight on some launches and by count on others, and a different dimension is a different
        // answer.
        var best: (Dim, Int)? = nil
        for d in [Dim.weight, .volume, .count] {
            let c = counts[d, default: 0]
            if c > 0 && (best == nil || c > best!.1) { best = (d, c) }
        }
        return best?.0
    }

    static func suggestUnit(_ dim: Dim, items: [Product], query: String) -> DisplayUnit {
        if dim == .weight && items.contains(where: { $0.soldBy == .lb }) { return .lb }
        let sizes = items.filter { $0.dim == dim }.compactMap { $0.base }
        return Units.defaultDisplayUnit(dim, sizes: sizes, query: query)
    }

    struct Scored: Identifiable, Hashable {
        var product: Product
        var score: Double
        var id: String { product.key }
    }

    static func score(query: String, _ items: [Product], include: [String] = [], exclude: [String] = []) -> [Scored] {
        items.map { p in
            Scored(product: p, score: Match.relevance(query: query, name: p.name, brand: p.brand, category: p.category, rank: p.rank, total: p.total, include: include, exclude: exclude, dim: p.dim, base: p.base, soldBy: p.soldBy))
        }
    }

    struct Best: Hashable {
        var product: Product
        var perBase: Double
        var est: Bool
        var member: Bool
        var score: Double
    }

    /// How far a unit price may sit from its peers before we refuse to treat it as comparable.
    ///
    /// High side: a case priced as one unit lands 5.7x-6.7x above its peers, so 5x. Low side, the
    /// one that WINS, has two signals (mirrors flagImplausible in shared/compare.js; the two must
    /// not diverge):
    ///   1. below 1/30 of the median: flagged whatever its provenance. It must sit that far out
    ///      because a real 37c/lb doorbuster in a "turkey" search with a $9.98/lb median is at 1/27.
    ///   2. below 1/8: flagged unless the retailer stated the basis of the price itself (sizeSource
    ///      "perLb" or "stated") or a DIFFERENT product with a stated basis sits within 1.5x of it.
    ///      Every far-too-cheap price seen came from a size we inferred; on the repaired four-ZIP
    ///      pool the cheapest correct item sits at 0.116 of its median (Tony's drumsticks, stated
    ///      3.43 lb), and the "12 ct, 15 oz" rolls at 0.054 and 0.101 are caught by this even with
    ///      the parse bug put back. Round 1's 1/30-only floor let them take the headline.
    static let implausibleHigh = 5.0
    static let implausibleLow = 30.0
    static let unconfirmedLow = 8.0
    static let corroborates = 1.5

    private static func medianOf(_ values: [Double]) -> Double? {
        let v = values.filter { $0.isFinite && $0 > 0 }.sorted()
        guard !v.isEmpty else { return nil }
        return v.count % 2 == 1 ? v[(v.count - 1) / 2] : (v[v.count / 2 - 1] + v[v.count / 2]) / 2
    }

    private static func statedUnit(_ p: Product) -> Bool { p.sizeSource == "perLb" || p.sizeSource == "stated" }

    private static func plainName(_ s: String) -> String {
        s.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    /// Mark results whose unit price cannot be right given the others for the same query.
    ///
    /// Flags rather than hides: the item still appears, carrying the flag, so the UI can say the
    /// price looks wrong. Needs at least four comparable results, because with three you cannot
    /// tell an outlier from a genuinely cheap store.
    /// A case size on a single piece ("Avocado", 40 ct, $1.09; applesauce stated 288 oz at $2.76): at
    /// least `sizeOutlier` times the typical size AND at least `sizeOutlierCheap` times cheaper per
    /// unit. A real bulk buy is big but only 2-5x cheaper. Runs in every dimension. Port of
    /// flagSizeOutliers in shared/compare.js.
    static let sizeOutlier = 4.0
    static let sizeOutlierCheap = 6.0
    static func flagSizeOutliers(_ items: inout [Product], priced: [(Int, Double)], dim: Dim) {
        let sized = priced.filter { items[$0.0].dim == dim && (items[$0.0].base ?? 0) > 0 }
        guard sized.count >= 4, let medSize = medianOf(sized.map { items[$0.0].base! }), medSize > 0,
              let medPrice = medianOf(priced.map(\.1)), medPrice > 0 else { return }
        for (idx, perBase) in sized where items[idx].implausible == nil {
            if items[idx].base! >= sizeOutlier * medSize && perBase * sizeOutlierCheap <= medPrice {
                items[idx].implausible = ImplausiblePrice(ratio: (perBase / medPrice * 10).rounded() / 10, median: medPrice, direction: "low", sizeOutlier: true)
            }
        }
    }

    @discardableResult
    static func flagImplausible(_ items: inout [Product], dim: Dim, prefs: PricePrefs = PricePrefs()) -> [Product] {
        // The count dimension counts PACKAGES, so its median mixes a 50-sheet box of foil with a
        // single roll and a 2-pack of heavy duty. Distance from that median says nothing about
        // whether a price is right: it flagged six correct per-sheet foil prices as "price looks
        // wrong". Telling a shopper a correct price looks wrong is the mirror image of showing a
        // wrong one.
        let priced = items.enumerated().compactMap { idx, p -> (Int, Double)? in
            guard let u = unitFor(p, dim: dim, prefs: prefs), u.perBase.isFinite, u.perBase > 0 else { return nil }
            return (idx, u.perBase)
        }
        if dim == .count {
            flagSizeOutliers(&items, priced: priced, dim: dim)
            return items
        }
        guard priced.count >= 4, let med = medianOf(priced.map(\.1)), med > 0 else { return items }
        let snapshot = items
        for (idx, perBase) in priced {
            let ratio = perBase / med
            func flag(unconfirmed: Bool) {
                items[idx].implausible = ImplausiblePrice(
                    ratio: (ratio * 10).rounded() / 10,
                    median: med,
                    direction: ratio > 1 ? "high" : "low",
                    unconfirmed: unconfirmed ? true : nil,
                )
            }
            if ratio >= implausibleHigh || ratio <= 1 / implausibleLow {
                flag(unconfirmed: false)
            } else if ratio <= 1 / unconfirmedLow && !statedUnit(snapshot[idx]) {
                let me = snapshot[idx]
                let vouched = priced.contains { oi, ob in
                    oi != idx && statedUnit(snapshot[oi]) && plainName(snapshot[oi].name) != plainName(me.name) && ob <= perBase * corroborates
                }
                if !vouched { flag(unconfirmed: true) }
            }
        }
        flagSizeOutliers(&items, priced: priced, dim: dim)
        return items
    }

    /// The one population plausibility is judged against, on every screen and both platforms:
    /// the items that score as real matches (`Match.relevant`), whatever the Show control says.
    /// The Show control widens or narrows the LIST; it must not move the median, or the same
    /// price is "wrong" in one view and fine in another. Returns the products with flags set, in
    /// the order given. Mirrors judgePlausibility in shared/compare.js.
    static func judgePlausibility(_ scored: [Scored], dim: Dim?, prefs: PricePrefs = PricePrefs()) -> [Scored] {
        guard let dim else { return scored }
        let idx = scored.indices.filter { scored[$0].score >= Match.relevant }
        var pool = idx.map { scored[$0].product }
        flagImplausible(&pool, dim: dim, prefs: prefs)
        var out = scored
        for (k, i) in idx.enumerated() { out[i].product.implausible = pool[k].implausible }
        return out
    }

    /// May this row be a store's answer (its bar, the headline, the trip planner's pick)?
    static func headlineEligible(_ p: Product, score: Double?, answerFloor: Double = Match.relevant) -> Bool {
        if p.implausible != nil || p.sizeConflict != nil { return false }
        if let score, score < answerFloor { return false }
        return true
    }

    /// Cheapest relevant product per store in `dim` (or the dominant dimension).
    static func bestPerStore(query: String, results: [String: [Product]], dim: Dim? = nil, include: [String] = [], exclude: [String] = [], prefs: PricePrefs = PricePrefs(), minScore: Double = Match.relevant, inStockOnly: Bool = false) -> (dim: Dim?, stores: [String: Best]) {
        var scored: [String: [Scored]] = [:]
        var all: [Product] = []
        var pool: [Product] = []
        for (storeId, items) in results {
            let every = score(query: query, items, include: include, exclude: exclude)
            // The plausibility pool is every real match, NOT the caller's minScore: a stricter
            // answer threshold must not move the median the flags are judged by.
            pool += every.filter { $0.score >= Match.relevant }.map(\.product)
            let s = every.filter { $0.score >= minScore && (!inStockOnly || !$0.product.isOutOfStock) }
            scored[storeId] = s
            all += s.map(\.product)
        }
        guard let d = dim ?? dominantDim(all) else { return (nil, [:]) }
        flagImplausible(&pool, dim: d, prefs: prefs)
        let flagged = Dictionary(pool.compactMap { p in p.implausible.map { (p.key, $0) } }, uniquingKeysWith: { a, _ in a })
        for (storeId, items) in scored {
            scored[storeId] = items.map { s in
                var s = s
                if let f = flagged[s.product.key] { s.product.implausible = f }
                return s
            }
        }
        var out: [String: Best] = [:]
        for (storeId, items) in scored {
            var best: Best?
            for s in items {
                // A price we cannot believe must not become a store's headline number, and neither
                // may a row whose own two numbers disagree about how much is in the package.
                guard headlineEligible(s.product, score: s.score, answerFloor: minScore) else { continue }
                guard let u = unitFor(s.product, dim: d, prefs: prefs) else { continue }
                if best == nil || u.perBase < best!.perBase - 1e-9 || (abs(u.perBase - best!.perBase) < 1e-9 && s.score > best!.score) {
                    best = Best(product: s.product, perBase: u.perBase, est: u.est, member: u.member, score: s.score)
                }
            }
            if let best { out[storeId] = best }
        }
        return (d, out)
    }

    /// Real matches sold by the pound that the headline's dimension cannot rank, one per store,
    /// cheapest pound first: Bashas' pumpkin at 44c/lb and El Super's at 33c/lb lost the per-each
    /// headline to a $2.19 small pumpkin (the third Halloween run). A per-lb pumpkin has no honest
    /// per-pumpkin price, so the card names these instead of inventing one. Port of `perLbAside` in
    /// shared/compare.js.
    struct PerLbAside: Hashable {
        var storeId: String
        var product: Product
        var perLb: Double
    }

    /// The card's line: "Sold by the lb, so not ranked per each: El Super $0.33/lb, Bashas' $0.44/lb.
    /// Listed below." Same words as perLbLine in public/js/views/compare.js.
    static func perLbLine(_ perLb: [PerLbAside], unitLabel: String, storeName: (String) -> String) -> String {
        let named = perLb.prefix(3).map { "\(storeName($0.storeId)) \(String(format: "$%.2f", $0.perLb))/lb" }.joined(separator: ", ")
        let more = perLb.count > 3 ? " and \(perLb.count - 3) more" : ""
        return "Sold by the lb, so not ranked per \(unitLabel): \(named)\(more). Listed below."
    }

    static func perLbAside(_ rows: [(product: Product, score: Double)], dim: Dim?, prefs: PricePrefs = PricePrefs(), answerFloor: Double = Match.relevant) -> [PerLbAside] {
        guard let d = dim, d != .weight else { return [] }
        var best: [String: PerLbAside] = [:]
        for (p, score) in rows {
            if p.soldBy != .lb || p.unitPrice(d) != nil || p.implausible != nil || !(score >= answerFloor) { continue }
            let perLb = effectivePrice(p, prefs)
            if !(perLb > 0) { continue }
            if best[p.storeId] == nil || perLb < best[p.storeId]!.perLb { best[p.storeId] = PerLbAside(storeId: p.storeId, product: p, perLb: perLb) }
        }
        return best.values.sorted { $0.perLb != $1.perLb ? $0.perLb < $1.perLb : $0.storeId < $1.storeId }
    }

    /// A store's cheapest item that the unit comparison had to leave out, when it is cheaper at the
    /// register than the item shown as that store's best, or when the store has no comparable item
    /// at all (`hasBest` false). Jewel's pound of Lucerne, stated "4 each" at $4.99, was dropped
    /// without a word and Jewel's "best" butter was $7.99; where a weight cannot be established the
    /// item must still be named ("Cheaper item not comparable per lb: ..."), never hidden. Judged on
    /// the package price only, and never against a price per pound. Port of `excludedCheaper` in
    /// shared/compare.js — the two must agree on which item and which reason.
    struct Excluded: Hashable {
        var product: Product
        /// "count", "sizeConflict", "noSize" or "otherDim".
        var reason: String
        var hasBest: Bool
    }

    static func excludedCheaper(query: String, results: [String: [Product]], dim: Dim?, stores: [String: Best], include: [String] = [], exclude: [String] = [], prefs: PricePrefs = PricePrefs(), minScore: Double = Match.relevant, inStockOnly: Bool = false) -> [String: Excluded] {
        guard let d = dim else { return [:] }
        var out: [String: Excluded] = [:]
        for (storeId, items) in results {
            var cheapest: Product?
            for s in score(query: query, items, include: include, exclude: exclude) {
                let p = s.product
                if s.score < minScore || (inStockOnly && p.isOutOfStock) || p.soldBy == .lb || p.implausible != nil { continue }
                if unitFor(p, dim: d, prefs: prefs) != nil { continue }
                let price = effectivePrice(p, prefs)
                guard price > 0 else { continue }
                if cheapest == nil || price < effectivePrice(cheapest!, prefs) - 1e-9 { cheapest = p }
            }
            guard let c = cheapest else { continue }
            let shown = stores[storeId]?.product
            if let shown {
                let register = shown.soldBy == .lb ? (shown.estPkg ?? 0) : effectivePrice(shown, prefs)
                guard register > 0, effectivePrice(c, prefs) < register - 0.004 else { continue }
            }
            let reason = c.sizeConflict != nil ? "sizeConflict" : c.dim == .count ? "count" : c.dim == nil ? "noSize" : "otherDim"
            out[storeId] = Excluded(product: c, reason: reason, hasBest: shown != nil)
        }
        return out
    }

    // MARK: price bases and the savings line

    /// How far a listed price can sit from the shelf price at the shopper's own store, by basis.
    /// 'online' measured in round 2 against the same chains' printed weekly ads, same week: Instacart
    /// ran 0-20% above the shelf (median 13%), so up to 25% above is allowed (below 0.20); round 1's
    /// 0.15 covered 21 of 24 pairs. Mirrors BASIS_SPREAD in shared/compare.js.
    static func basisSpread(_ b: PriceBasis) -> (below: Double, above: Double) {
        switch b {
        case .shelf: return (0, 0)
        case .online: return (0.2, 0)
        case .national: return (0.25, 0.25)
        }
    }
    static let estSpread = 0.3

    private static func basisWord(_ b: PriceBasis) -> String {
        switch b {
        case .shelf: return "shelf price"
        case .online: return "online price"
        case .national: return "chain-wide price"
        }
    }

    /// The line under the best price. Port of `savingsClaim` in shared/compare.js — the rules, and
    /// the sentence, must be identical on both platforms:
    ///   - never against a flagged price (implausible or sizeConflict), on either side -> nil;
    ///   - an exact saving only between two prices of the SAME basis, neither estimated, >= 1%;
    ///   - across bases (or with an estimate) no number: "ahead" if the winner is cheaper even
    ///     at the far edge of each basis's spread, otherwise "close" and no saving claimed.
    /// `text` carries three placeholders the UI fills: {amount} (diffPerBase in the display unit,
    /// via `Money.unit`), {unit} (the display unit's label), {store} (the runner-up's short name).
    struct SavingsClaim: Hashable {
        var kind: String
        var storeId: String
        var basis: PriceBasis
        var pct: Int?
        var diffPerBase: Double?
        var text: String
    }

    private static func spread(_ b: PriceBasis, est: Bool) -> (below: Double, above: Double) {
        let s = basisSpread(b)
        return (max(s.below, est ? estSpread : 0), max(s.above, est ? estSpread : 0))
    }

    /// How the dearer of two prices relates to the cheaper: "exact", "ahead", "close", or nil when
    /// `b` is not dearer. One rule for the savings line and for `standings`. Port of `relation` in
    /// shared/compare.js.
    private static func relation(_ a: Double, _ aBasis: PriceBasis, _ aEst: Bool, _ b: Double, _ bBasis: PriceBasis, _ bEst: Bool) -> String? {
        guard a > 0, b > a else { return nil }
        if aBasis == bBasis && !aEst && !bEst { return Int(((1 - a / b) * 100).rounded()) >= 1 ? "exact" : nil }
        return a * (1 + spread(aBasis, est: aEst).above) < b * (1 - spread(bBasis, est: bEst).below) ? "ahead" : "close"
    }

    private static func bothWord(_ b: PriceBasis) -> String? {
        switch b {
        case .shelf: return nil
        case .online: return "both online prices"
        case .national: return "both chain-wide prices"
        }
    }

    static func savingsClaim(best: Product, perBase a: Double, est aEst: Bool, runnerUp: Product, perBase b: Double, est bEst: Bool) -> SavingsClaim? {
        if best.implausible != nil || best.sizeConflict != nil || runnerUp.implausible != nil || runnerUp.sizeConflict != nil { return nil }
        guard let rel = relation(a, best.priceBasis, aEst, b, runnerUp.priceBasis, bEst) else { return nil }
        let qualifier = bEst ? "estimated price" : basisWord(runnerUp.priceBasis)
        if rel == "exact" {
            let pct = Int(((1 - a / b) * 100).rounded())
            // Two online (or chain-wide) listings compare exactly as listings, and the sentence says so.
            let asListed = bothWord(runnerUp.priceBasis).map { " (\($0))" } ?? ""
            return SavingsClaim(kind: "exact", storeId: runnerUp.storeId, basis: runnerUp.priceBasis, pct: pct, diffPerBase: b - a, text: "{amount}/{unit} (\(pct)%) less than the next-best store, {store}\(asListed)")
        }
        if rel == "ahead" {
            return SavingsClaim(kind: "ahead", storeId: runnerUp.storeId, basis: runnerUp.priceBasis, text: "Less than the next-best store, {store} (\(qualifier))")
        }
        return SavingsClaim(kind: "close", storeId: runnerUp.storeId, basis: runnerUp.priceBasis, text: "About the same as {store} (\(qualifier)), so no saving is claimed")
    }

    /// Where every store stands against the listed winner once each price is allowed its basis's
    /// spread. An Instacart price within the Instacart markup of a shelf price is 'close', never
    /// 'dearer': the chart must not present such a store as beaten. Same rule as the savings line.
    /// Port of `standings` in shared/compare.js; cheapest listed first.
    struct Standing: Hashable {
        var storeId: String
        var perBase: Double
        var basis: PriceBasis
        var est: Bool
        var low: Double
        var high: Double
        /// "best", "close" or "dearer".
        var verdict: String
    }

    /// Equal unit prices: shelf before online before chain-wide, exact before estimated. Mirrors
    /// `tieBreak` in shared/compare.js (Mariano's Instacart carrots were named over the identical
    /// price on Woodman's shelf because "marianos" < "woodmans").
    static func basisRank(_ b: PriceBasis) -> Int { b == .shelf ? 0 : b == .online ? 1 : 2 }
    static func tieBreak(_ a: PriceBasis, _ aEst: Bool, _ b: PriceBasis, _ bEst: Bool) -> Bool? {
        if basisRank(a) != basisRank(b) { return basisRank(a) < basisRank(b) }
        if aEst != bEst { return !aEst }
        return nil
    }

    /// True when a store's price is within the price-basis margin of the winner's: the savings line
    /// could not call it dearer, so no chart may draw it as beaten. `standings`' rule, for callers
    /// that hold rows rather than `Best` entries.
    static func isClose(winner a: Double, _ aBasis: PriceBasis, _ aEst: Bool, to b: Double, _ bBasis: PriceBasis, _ bEst: Bool) -> Bool {
        let rel = relation(a, aBasis, aEst, b, bBasis, bEst)
        return !(rel == "exact" || rel == "ahead")
    }

    static func standings(_ stores: [String: Best]) -> [Standing] {
        var rows: [Standing] = stores.compactMap { id, b in
            guard b.perBase > 0 else { return nil }
            let sp = spread(b.product.priceBasis, est: b.est)
            return Standing(storeId: id, perBase: b.perBase, basis: b.product.priceBasis, est: b.est, low: b.perBase * (1 - sp.below), high: b.perBase * (1 + sp.above), verdict: "dearer")
        }
        rows.sort { $0.perBase != $1.perBase ? $0.perBase < $1.perBase : tieBreak($0.basis, $0.est, $1.basis, $1.est) ?? ($0.storeId < $1.storeId) }
        guard let w = rows.first else { return rows }
        rows[0].verdict = "best"
        for i in rows.indices.dropFirst() {
            let rel = relation(w.perBase, w.basis, w.est, rows[i].perBase, rows[i].basis, rows[i].est)
            rows[i].verdict = rel == "exact" || rel == "ahead" ? "dearer" : "close"
        }
        return rows
    }

    // MARK: trip planner amounts

    /// Amount (in base units) to cost a list item. Port of `referenceAmount` in shared/compare.js:
    /// the shopper's own size when it states one — a plain "oz" against liquid matches is fluid
    /// ounces ("chicken broth 32 oz" is a quart, not Costco's 192 fl oz case) — otherwise the
    /// matches' median package, a size some store actually sells (a fixed ladder of amounts was
    /// measured and rejected: it moved 83 of 226 costed amounts to sizes no store sells). The UI
    /// prints the amount beside every cost (`CostedAmount`). `unused` is a size the shopper wrote
    /// that cannot be used in this dimension, so the UI can say so instead of pricing another amount.
    static func referenceAmount(text: String, items: [Product], dim: Dim) -> (base: Double, fromText: Bool) {
        let r = referenceAmountDetail(text: text, items: items, dim: dim)
        return (r.base, r.fromText)
    }

    static func referenceAmountDetail(text: String, items: [Product], dim: Dim) -> (base: Double, fromText: Bool, unused: String?) {
        let s = Units.parseSize(text)
        if let s, let b = s.base, !s.perWeight {
            if s.dim == dim { return (b, true, nil) }
            if dim == .volume && s.dim == .weight && ["oz", "ounce", "ounces", "onz"].contains(s.unit) { return (b, true, nil) }
        }
        let unused: String? = {
            guard let s, s.base != nil, !s.perWeight else { return nil }
            return Units.format(s)
        }()
        let fixed = items.filter { $0.dim == dim }.compactMap { $0.base }.sorted()
        if dim == .weight && items.contains(where: { $0.dim == .weight && $0.soldBy == .lb }) {
            return (fixed.isEmpty ? 16 : fixed[fixed.count / 2], false, unused)
        }
        if fixed.isEmpty { return (dim == .count ? 1 : 16, false, unused) }
        return (fixed[fixed.count / 2], false, unused)
    }

    private static let sizeWordsRx = Rx("\\b\\d+(?:\\.\\d+)?\\s*(?:x\\s*\\d+(?:\\.\\d+)?\\s*)?(?:fl\\.?\\s*oz|oz|lbs?|pounds?|gal(?:lons?)?|qt|quarts?|ct|count|pk|pack|dozen|doz|l|ml|g|kg)\\b\\.?")

    /// "milk 1 gal" -> "milk"
    static func searchText(_ text: String) -> String {
        let cleaned = sizeWordsRx.replace(text, with: " ").replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? text : cleaned
    }
}

// MARK: - Money & unit formatting

enum Money {
    /// A promo badge's text, shortened only where that cannot change a price: one that names a price
    /// is never cut ("Mix & match 5 for $1…"), any other at a word boundary. Mirrors shortPromo in
    /// public/js/format.js.
    static func shortPromo(_ text: String, max: Int = 22) -> String {
        let t = text.trimmingCharacters(in: .whitespaces)
        if t.count <= max || t.contains("$") || t.contains("¢") || t.range(of: "\\d\\s*(for|/)", options: [.regularExpression, .caseInsensitive]) != nil { return t }
        let cut = String(t.prefix(max - 1))
        let body = cut.lastIndex(of: " ").map { i in cut.distance(from: cut.startIndex, to: i) > max / 2 ? String(cut[..<i]) : cut } ?? cut
        return body.trimmingCharacters(in: CharacterSet(charactersIn: " ,;:&–-")) + "…"
    }

    /// "$2.49", or "89¢" under a dollar
    static func short(_ n: Double?) -> String {
        guard let n, n.isFinite else { return "—" }
        if n > 0 && n < 1 { return "\(Int((n * 100).rounded()))¢" }
        return String(format: "$%.2f", n)
    }

    /// Always dollars and cents
    static func full(_ n: Double?) -> String {
        guard let n, n.isFinite else { return "—" }
        return String(format: "$%.2f", n)
    }

    /// "$5" or "$2.50"
    static func plain(_ n: Double) -> String {
        n == n.rounded() ? "$\(Int(n))" : String(format: "$%.2f", n)
    }

    /// Unit price text in a display unit: "$2.49", "3.1¢"
    static func unit(_ perBase: Double?, _ du: DisplayUnit) -> String {
        guard let perBase, perBase.isFinite else { return "—" }
        let v = perBase * du.factor
        if v >= 100 { return String(format: "$%.0f", v) }
        // Dollars from $1.00 only: at 0.995, 99.5¢ printed "$0.99" (mirrors public/js/format.js).
        if v >= 0.9995 { return String(format: "$%.2f", v) }
        if v >= 0.1 {
            let c = (v * 1000).rounded() / 10
            return c == c.rounded() ? "\(Int(c))¢" : String(format: "%.1f¢", c)
        }
        return String(format: "%.2f¢", v * 100)
    }
}
