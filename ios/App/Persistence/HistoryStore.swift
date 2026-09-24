import Foundation
import SwiftData

struct HistStats: Codable, Hashable {
    var n: Int
    var low: Double
    var high: Double
    var avg: Double
    var lowAt: Date?
    /// Previous distinct price (when it just changed)
    var prev: Double?
}

/// Price history, written off the main thread.
@ModelActor
actor HistoryStore {
    static let shared = HistoryStore(modelContainer: Persistence.container)

    private let repeatInterval: TimeInterval = 12 * 3600

    /// Stats for products (computed before recording the new prices so "prev" reflects the last visit).
    func statsThenRecord(_ products: [Product]) -> [String: HistStats] {
        let keys = Array(Set(products.map(\.key)))
        guard !keys.isEmpty else { return [:] }
        let descriptor = FetchDescriptor<PricePoint>(predicate: #Predicate { keys.contains($0.key) }, sortBy: [SortDescriptor(\.at)])
        let points = (try? modelContext.fetch(descriptor)) ?? []
        var byKey: [String: [PricePoint]] = [:]
        for p in points { byKey[p.key, default: []].append(p) }

        var stats: [String: HistStats] = [:]
        let now = Date()
        for p in products {
            let series = byKey[p.key] ?? []
            if !series.isEmpty {
                let prices = series.map(\.price)
                let low = prices.min() ?? p.price
                let last = series.last!
                stats[p.key] = HistStats(
                    n: series.count, low: low, high: prices.max() ?? p.price,
                    avg: prices.reduce(0, +) / Double(prices.count),
                    lowAt: series.last(where: { abs($0.price - low) < 0.005 })?.at,
                    prev: abs(last.price - p.price) > 0.004 ? last.price : nil
                )
            }
            // Record when new, changed, or stale
            let last = series.last
            let changed = last == nil || abs(last!.price - p.price) > 0.004 || (last!.regular ?? -1) != (p.regularPrice ?? -1) || last!.onSale != p.onSale
            if changed || now.timeIntervalSince(last!.at) > repeatInterval {
                let dim = p.dim ?? p.dims.first
                modelContext.insert(PricePoint(key: p.key, storeId: p.storeId, name: p.name, price: p.price, regular: p.regularPrice,
                                               unitPerBase: dim.flatMap { p.unitPrice($0)?.perBase }, dim: dim?.rawValue, onSale: p.onSale, at: now))
            }
        }
        try? modelContext.save()
        return stats
    }

    func series(key: String) -> [HistoryPointDTO] {
        let descriptor = FetchDescriptor<PricePoint>(predicate: #Predicate { $0.key == key }, sortBy: [SortDescriptor(\.at)])
        return ((try? modelContext.fetch(descriptor)) ?? []).map { HistoryPointDTO(at: $0.at, price: $0.price, regular: $0.regular, onSale: $0.onSale) }
    }

    func counts() -> (products: Int, points: Int) {
        let points = (try? modelContext.fetchCount(FetchDescriptor<PricePoint>())) ?? 0
        let all = (try? modelContext.fetch(FetchDescriptor<PricePoint>())) ?? []
        return (Set(all.map(\.key)).count, points)
    }

    func clearAll() {
        try? modelContext.delete(model: PricePoint.self)
        try? modelContext.save()
    }
}

struct HistoryPointDTO: Hashable, Identifiable {
    var at: Date
    var price: Double
    var regular: Double?
    var onSale: Bool
    var id: Date { at }
}
