import Foundation
import SwiftUI
import SwiftData

/// Drives a multi-store price search: every store runs concurrently and results appear as they arrive.
@MainActor
@Observable
final class SearchModel {
    var query = ""
    var results: [String: StoreResult] = [:]
    var order: [String] = []
    var ads: [Deal] = []
    var history: [String: HistStats] = [:]
    var isRunning = false
    var startedAt: Date?
    var finishedAt: Date?
    var error: String?

    private var task: Task<Void, Never>?

    var anyResults: Bool { results.values.contains { !$0.items.isEmpty } }
    var loadingCount: Int { results.values.filter { $0.status == .loading }.count }

    func run(_ raw: String, fresh: Bool = false, only: [String]? = nil) {
        let q = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        guard !q.isEmpty else { return }
        let app = AppState.shared
        guard let place = app.place else {
            error = "Set your location first"
            return
        }
        let chains = app.selectedChains.filter { only == nil || only!.contains($0.id) }
        guard !chains.isEmpty else {
            error = "Choose at least one store in Settings"
            return
        }
        let partial = only != nil && q.lowercased() == query.lowercased()
        if !partial {
            task?.cancel()
            query = q
            results = [:]
            ads = []
            history = [:]
            order = chains.map(\.id)
            startedAt = Date()
            recordRecent(q)
        }
        error = nil
        finishedAt = nil
        isRunning = true
        for c in chains { results[c.id] = StoreResult(retailerId: c.id, status: c.source.hasPrices ? .loading : .adsOnly, items: [], location: nil) }
        let limit = app.resultsPerStore
        let chainIds = Set(app.selectedChainIds)
        let t = Task { [weak self] in
            await withTaskGroup(of: Void.self) { group in
                for chain in chains where chain.source.hasPrices {
                    group.addTask {
                        let r = await PriceSearch.search(chain: chain, query: q, place: place, limit: limit, fresh: fresh)
                        let stats = r.items.isEmpty ? [:] : await HistoryStore.shared.statsThenRecord(r.items, record: r.stale == nil)
                        await MainActor.run {
                            guard let self, self.query == q else { return }
                            self.results[chain.id] = r
                            self.history.merge(stats) { _, new in new }
                        }
                    }
                }
                if !partial {
                    group.addTask {
                        let deals = await PriceSearch.ads(query: q, place: place, chainIds: chainIds)
                        await MainActor.run {
                            guard let self, self.query == q else { return }
                            self.ads = deals
                        }
                    }
                }
            }
            await MainActor.run {
                guard let self, self.query == q else { return }
                self.isRunning = false
                self.finishedAt = Date()
                UsageMeter.shared.recordSearch()
            }
        }
        if !partial { task = t }
    }

    func cancel() {
        task?.cancel()
        isRunning = false
    }

    private func recordRecent(_ q: String) {
        let ctx = Persistence.container.mainContext
        let key = Match.normalize(q)
        guard !key.isEmpty else { return }
        let descriptor = FetchDescriptor<RecentSearch>(predicate: #Predicate { $0.q == key })
        if let existing = try? ctx.fetch(descriptor).first {
            existing.count += 1
            existing.lastAt = Date()
        } else {
            ctx.insert(RecentSearch(q: key))
        }
        try? ctx.save()
    }
}

/// Filters and sorting applied to search results (all computed locally so changes are instant).
struct CompareOptions: Equatable {
    enum Strictness: String, CaseIterable { case close, matches, everything
        var threshold: Double { self == .close ? 0.75 : self == .matches ? Match.relevant : 0 }
        var label: String { self == .close ? "Close" : self == .matches ? "Matches" : "Everything" }
    }
    enum Sort: String, CaseIterable { case unit, price, discount, relevance, store
        var label: String {
            switch self {
            case .unit: return "Unit price"
            case .price: return "Package price"
            case .discount: return "Biggest discount"
            case .relevance: return "Best match"
            case .store: return "Store"
            }
        }
    }
    var strictness: Strictness = .matches
    var sort: Sort = .unit
    var dim: Dim?
    var unit: DisplayUnit?
    var include: [String] = []
    var exclude: [String] = []
    var saleOnly = false
    var organic = false
    var storeBrand = false
    var inStock = false
    var hidden: Set<String> = []
}

struct ComparedRow: Identifiable, Hashable {
    var product: Product
    var score: Double
    var perBase: Double?
    var est: Bool
    var member: Bool
    var hist: HistStats?
    var id: String { product.key }
}

struct CompareOutput {
    var rows: [ComparedRow] = []
    var dim: Dim?
    var dims: [Dim] = []
    var unit: DisplayUnit?
    var bestPerStore: [ComparedRow] = []
    var chips: [Match.RefineChip] = []
    var total = 0
    var hiddenWeak = 0
    var counts = (sale: 0, organic: 0, storeBrand: 0)
}

/// The search screen's model: the list, the per-store answers and the headline, from one search.
///
/// This is the path the Search tab actually runs — it does not go through `Compare.bestPerStore`
/// (the watch and trip-plan path) — so every guard that decides what may be *the answer* has to
/// be applied here as well, through the same `Compare` functions, or the phone's first screen
/// quietly ignores them. It did: until round 2 this built its own cheapest-per-store with no
/// plausibility pass and no eligibility test, so a price the app flags as wrong could be BEST
/// PRICE, the "price looks wrong" badge could never appear on a search row, and with Show set to
/// Everything a cabbage could headline a search for sweet potatoes. See SearchScreenGuardTests.
/// Mirrors the model in public/js/views/compare.js.
enum Comparer {
    static func compute(query: String, results: [String: StoreResult], history: [String: HistStats], options o: CompareOptions, prefs: PricePrefs, storeOrder: [String]) -> CompareOutput {
        var out = CompareOutput()
        let all = results.values.flatMap(\.items)
        out.total = all.count
        let raw = Compare.score(query: query, all, include: o.include, exclude: o.exclude)
        let listFloor = max(o.strictness.threshold, o.strictness == .everything ? 0 : 0.01)
        // The Show control widens the LIST, never the answer. Rows below `Match.relevant` may be
        // listed when the shopper asks for Everything, but they never become a store's bar or the
        // headline — or to the shopper's own threshold when they have asked for something
        // stricter. Onboarding promises that only real matches count toward the best price.
        let answerFloor = max(o.strictness.threshold, Match.relevant)
        let matched = raw.filter { $0.score >= answerFloor }.map(\.product)
        let listed = raw.filter { $0.score >= listFloor }.map(\.product)
        let dim = o.dim ?? Compare.dominantDim(!matched.isEmpty ? matched : !listed.isEmpty ? listed : raw.map(\.product))
        // Mark the prices that cannot be right given the other real matches. The population is
        // fixed by `judgePlausibility` (every real match, whatever Show says), so one price is not
        // "wrong" in one view and fine in another. The flag never hides a row; it puts the "price
        // looks wrong" badge on it and bars it from being the answer.
        let scored = Compare.judgePlausibility(raw, dim: dim, prefs: prefs)
        let relevant = scored.filter { $0.score >= listFloor }
        out.hiddenWeak = scored.count - relevant.count
        let relevantProducts = relevant.map(\.product)
        out.dim = dim
        out.dims = Dim.allCases.filter { d in relevantProducts.contains { $0.unitPrice(d) != nil } }
        if let dim {
            out.unit = o.unit?.dim == dim ? o.unit : Compare.suggestUnit(dim, items: (matched.isEmpty ? relevantProducts : matched).filter { $0.dim == dim }, query: query)
        }
        func pass(_ p: Product) -> Bool {
            (!o.saleOnly || p.onSale || p.promo != nil) && (!o.organic || p.isOrganic) && (!o.storeBrand || p.isStoreBrand) &&
                (!o.inStock || !p.isOutOfStock) && !o.hidden.contains(p.storeId)
        }
        var rows: [ComparedRow] = relevant.filter { pass($0.product) }.map { s in
            let u = dim.flatMap { Compare.unitFor(s.product, dim: $0, prefs: prefs) }
            return ComparedRow(product: s.product, score: s.score, perBase: u?.perBase, est: u?.est ?? false, member: u?.member ?? false, hist: history[s.product.key])
        }
        var best: [String: ComparedRow] = [:]
        // A store's answer is the cheapest row that is allowed to be one: a real match (see
        // `answerFloor`), not flagged implausible, and not a row whose own two sizes disagree —
        // `Compare.headlineEligible`, the same test the watch and trip-plan paths apply.
        for r in rows where r.perBase != nil && Compare.headlineEligible(r.product, score: r.score, answerFloor: answerFloor) {
            if best[r.product.storeId] == nil || r.perBase! < best[r.product.storeId]!.perBase! { best[r.product.storeId] = r }
        }
        out.bestPerStore = best.values.sorted {
            $0.perBase! != $1.perBase! ? $0.perBase! < $1.perBase!
                : Compare.tieBreak($0.product.priceBasis, $0.est, $1.product.priceBasis, $1.est) ?? ($0.product.storeId < $1.product.storeId)
        }
        switch o.sort {
        case .unit: rows.sort { ($0.perBase ?? .infinity, -$0.score) < ($1.perBase ?? .infinity, -$1.score) }
        case .price: rows.sort { Compare.effectivePrice($0.product, prefs) < Compare.effectivePrice($1.product, prefs) }
        case .discount: rows.sort { ($0.product.pctOff ?? 0, -($0.perBase ?? .infinity)) > ($1.product.pctOff ?? 0, -($1.perBase ?? .infinity)) }
        case .relevance: rows.sort { $0.score > $1.score }
        case .store:
            rows.sort { (storeOrder.firstIndex(of: $0.product.storeId) ?? 99, $0.perBase ?? .infinity) < (storeOrder.firstIndex(of: $1.product.storeId) ?? 99, $1.perBase ?? .infinity) }
        }
        out.rows = rows
        out.chips = Match.refineChips(query: query, names: relevantProducts.map { ($0.name, Optional($0.brand)) }, max: 12)
        out.counts = (relevantProducts.filter { $0.onSale || $0.promo != nil }.count, relevantProducts.filter(\.isOrganic).count, relevantProducts.filter(\.isStoreBrand).count)
        return out
    }
}
