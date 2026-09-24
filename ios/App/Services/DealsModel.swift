import Foundation
import SwiftUI

/// Weekly-ad deals for the user's stores (Flipp circulars + Whole Foods' sales page).
@MainActor
@Observable
final class DealsModel {
    static let shared = DealsModel()

    var deals: [AdWeek: [Deal]] = [:]
    var flyers: [AdWeek: [Flyer]] = [:]
    var loading: Set<AdWeek> = []
    var errors: [AdWeek: String] = [:]
    var stale: [AdWeek: Bool] = [:]
    var loadedAt: [AdWeek: Date] = [:]
    var enrichment: (done: Int, total: Int, running: Bool)?

    private var raw: [AdWeek: [(item: FlippSource.FlyerItem, chainId: String, merchant: String)]] = [:]
    private var wfm: [Deal] = []
    private var poller: Task<Void, Never>?

    func load(_ week: AdWeek, fresh: Bool = false) async {
        guard let place = AppState.shared.place else { return }
        loading.insert(week)
        errors[week] = nil
        defer { loading.remove(week) }
        let selected = Set(AppState.shared.selectedChainIds)
        do {
            let (all, isStale) = try await FlippSource.shared.flyers(postal: place.zip, fresh: fresh)
            stale[week] = isStale
            let now = Date()
            var picked: [(Flyer, String)] = []
            for f in all {
                guard let chain = RetailerCatalog.chain(forMerchant: f.merchant), selected.contains(chain.id) else { continue }
                if let to = f.validTo, to < now { continue }
                let starts = f.validFrom ?? .distantPast
                if (week == .next) != (starts > now) { continue }
                picked.append((f, chain.id))
            }
            flyers[week] = picked.map { var f = $0.0; f.retailerId = $0.1; return f }
            var items: [(FlippSource.FlyerItem, String, String)] = []
            await withTaskGroup(of: [(FlippSource.FlyerItem, String, String)].self) { group in
                for (f, chainId) in picked {
                    group.addTask {
                        let list = (try? await FlippSource.shared.flyerItems(f.id, fresh: fresh)) ?? []
                        return list.map { ($0, chainId, f.merchant) }
                    }
                }
                for await chunk in group { items += chunk }
            }
            raw[week] = items.map { (item: $0.0, chainId: $0.1, merchant: $0.2) }
            if week == .current && selected.contains("wholefoods") {
                wfm = await wholeFoodsDeals(place: place)
            }
            await rebuild(week)
            loadedAt[week] = Date()
            startEnrichment(week, picked.map { $0.0.id })
        } catch {
            errors[week] = (error as? LocalizedError)?.errorDescription ?? "Weekly ads are unavailable right now."
        }
    }

    /// Re-create deals from stored item details (no network).
    private func rebuild(_ week: AdWeek) async {
        let items = raw[week] ?? []
        var detailsByFlyer: [Int: [Int: FlippSource.Detail]] = [:]
        for fid in Set(items.map(\.item.flyerId)) { detailsByFlyer[fid] = await FlippSource.shared.storedDetails(fid) }
        let now = Date()
        var out: [Deal] = items.map { FlippSource.deal(item: $0.item, detail: detailsByFlyer[$0.item.flyerId]?[$0.item.id], retailerId: $0.chainId, merchant: $0.merchant, now: now) }
        if week == .current { out += wfm }
        var seen = [String: Int]()
        var deduped: [Deal] = []
        for d in out where !(d.priceText.isEmpty && d.story == nil) {
            let k = "\(d.retailerId)|\(Match.normalize(d.name))|\(d.priceText)"
            if let i = seen[k] {
                if !deduped[i].enriched && d.enriched { deduped[i] = d }
                continue
            }
            seen[k] = deduped.count
            deduped.append(d)
        }
        deals[week] = deduped
    }

    private func startEnrichment(_ week: AdWeek, _ flyerIds: [Int]) {
        let items = raw[week] ?? []
        Task.detached(priority: .utility) {
            for fid in flyerIds {
                let its = items.filter { $0.item.flyerId == fid }.map(\.item)
                await FlippSource.shared.enrich(fid, items: its)
            }
        }
        poller?.cancel()
        poller = Task { [weak self] in
            var lastDone = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                let p = await FlippSource.shared.enrichmentProgress(flyerIds)
                await MainActor.run { self?.enrichment = p.total > 0 ? p : nil }
                if !p.running || p.done - lastDone >= 120 {
                    lastDone = p.done
                    await self?.rebuild(week)
                }
                if !p.running {
                    await MainActor.run { self?.enrichment = nil }
                    break
                }
            }
        }
    }

    private func wholeFoodsDeals(place: UserPlace) async -> [Deal] {
        guard let s = try? await WholeFoodsSource.shared.sales(place: place) else { return [] }
        let now = Date()
        return s.items.map { p in
            let sale = p.priceText.contains("$") ? ProductFactory.money(p.priceText) : nil
            let reg = p.regularText.contains("$") && !p.regularText.lowercased().contains("to") ? ProductFactory.money(p.regularText) : nil
            let pct = Rx("(\\d+)\\s*%").match(p.priceText)?[1].flatMap { Int($0 ?? "") }
            let pctOff = pct ?? ((sale != nil && reg != nil && reg! > sale!) ? Int(((1 - sale! / reg!) * 100).rounded()) : nil)
            return Deal(
                id: p.id, source: "wholefoods", flippId: nil, flyerId: nil, retailerId: "wholefoods", merchant: "Whole Foods Market",
                name: p.name, brand: p.brand, description: p.description, imageURL: URL.from(p.image), price: sale, qty: 1, each: sale,
                perLb: p.priceText.lowercased().contains("/lb"), priceText: p.priceText, regular: reg, regularText: p.regularText.nilIfEmpty,
                memberText: p.memberText.isEmpty ? nil : "Prime: \(p.memberText)", pctOff: pctOff, story: nil,
                terms: DealParser.parse(p.priceText, basePrice: reg), needsCoupon: false, needsCard: false, limit: nil, mustBuy: nil,
                disclaimer: p.disclaimer, validFrom: p.validFrom, validTo: p.validTo, week: .current,
                category: GroceryCategory.classify(name: p.name, description: p.description), enriched: true, coupon: false,
                url: URL(string: "https://www.wholefoodsmarket.com/sales-flyer?store-id=\(s.storeId)")
            )
        }.filter { ($0.validTo ?? .distantFuture) >= now }
    }

    // MARK: matching

    /// Deals matching any of the terms (brand or ingredient), e.g. favorites or a holiday's shopping list.
    func matches(terms: [String], week: AdWeek = .current) -> [String: [Deal]] {
        let list = deals[week] ?? []
        var out: [String: [Deal]] = [:]
        for term in terms {
            let tt = Match.tokens(term)
            guard !tt.isEmpty else { continue }
            let hits = list.filter { d in
                let words = Set(Match.tokens("\(d.brand) \(d.name) \(d.description ?? "")"))
                return tt.allSatisfy { t in words.contains(t) || words.contains { $0.hasPrefix(t) && t.count >= 4 } }
            }
            if !hits.isEmpty { out[term] = hits.sorted { $0.score > $1.score } }
        }
        return out
    }

    /// Deals matching any of the terms, each deal once, best first. `matches(terms:)` is keyed by
    /// term, so "Butter Cookies" came back under both "butter" and "cookies": the Christmas card
    /// counted it twice, and OccasionView's ForEach got two rows with one id.
    func matchingDeals(terms: [String], week: AdWeek = .current) -> [Deal] {
        var seen = Set<String>()
        return matches(terms: terms, week: week).values.joined()
            .filter { seen.insert($0.id).inserted }
            .sorted { $0.score != $1.score ? $0.score > $1.score : $0.id < $1.id }
    }
}
