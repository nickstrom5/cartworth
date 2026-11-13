import Foundation
import SwiftData
import WidgetKit

/// Keeps the home-screen widget's copy of the watchlist current (see `WidgetSnapshot`).
@MainActor
enum WidgetBridge {
    /// Rebuild the snapshot from the watchlist and, if it changed, have WidgetKit redraw.
    static func publish(context ctxIn: ModelContext? = nil) {
        let context = ctxIn ?? Persistence.container.mainContext
        let watches = (try? context.fetch(FetchDescriptor<WatchItem>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)]))) ?? []
        let points = (try? context.fetch(FetchDescriptor<WatchPoint>())) ?? []
        let byWatch = Dictionary(grouping: points, by: \.watchId)
        let snapshot = WidgetSnapshot(watches: watches.map { entry($0, points: byWatch[$0.id] ?? []) }, generatedAt: Date())
        if WidgetStore.write(snapshot) { WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.widgetKind) }
    }

    static func entry(_ w: WatchItem, points: [WatchPoint]) -> WidgetSnapshot.Watch {
        let status = WatchService.status(w, points: points)
        let bestId = w.result?.bestStoreId
        let best = bestId.flatMap { w.result?.stores[$0] }
        var qualifiers: [String] = []
        if let best {
            if let tag = PriceProvenance.badge(best.priceBasis) { qualifiers.append(tag) }
            if best.est { qualifiers.append("est.") }
            if best.savedAt != nil { qualifiers.append("saved") }
        }
        let factor = status.du?.factor ?? 1
        let trend = WidgetSnapshot.trend(WidgetSnapshot.checks(points.map { ($0.at, $0.unitPerBase) }), factor: factor)
        return WidgetSnapshot.Watch(
            id: w.id, label: w.label,
            price: status.best.flatMap { b in status.du.map { Money.unit(b / $0.factor, $0) } },
            unit: status.du?.label,
            storeId: bestId, storeName: bestId.flatMap { RetailerCatalog.byId[$0]?.short ?? RetailerCatalog.byId[$0]?.name },
            qualifiers: qualifiers, onSale: best?.onSale ?? false,
            atTarget: status.atTarget, lowest: status.lowest,
            target: status.atTarget ? nil : w.target.map { "target \(Money.full($0))" },
            trend: trend.line, change: trend.change,
            checkedAt: w.lastChecked, error: best == nil ? w.lastError : nil,
            ad: adLine(w.result?.ad, du: status.du))
    }

    /// The widget's ad line, while the ad is live: "Ad 58¢/lb at Mariano's · with card".
    static func adLine(_ a: WatchResult.AdNote?, du: DisplayUnit?, now: Date = Date()) -> String? {
        guard let a, let du, a.validTo.map({ $0 > now }) ?? true else { return nil }
        let store = RetailerCatalog.byId[a.storeId]?.short ?? a.storeId
        return (["Ad \(Money.unit(a.unitPerBase, du))/\(du.label) at \(store)"] + a.terms.prefix(1)).joined(separator: " · ")
    }
}
