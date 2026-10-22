import Foundation
import BackgroundTasks
import UserNotifications
import SwiftData

/// Re-checks watched prices and favorite-brand sales in the background (Pro), and sends local alerts.
enum BackgroundRefresh {
    static var taskId: String { "\(Bundle.main.bundleIdentifier ?? "app.cartworth.ios").refresh" }

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            schedule()
            let work = Task { @MainActor in
                await runChecks(limit: 6)
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    static func schedule() {
        let req = BGAppRefreshTaskRequest(identifier: taskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    /// Checks the oldest watches and favorites; posts notifications for targets hit and new favorite deals.
    @MainActor
    static func runChecks(limit: Int = 6) async {
        guard Entitlements.shared.isPro, AppState.shared.alertsEnabled, AppState.shared.place != nil else { return }
        let ctx = Persistence.container.mainContext
        let watches = (try? ctx.fetch(FetchDescriptor<WatchItem>())) ?? []
        let due = watches.filter { ($0.lastChecked ?? .distantPast) < Date().addingTimeInterval(-10 * 3600) }
            .sorted { ($0.lastChecked ?? .distantPast) < ($1.lastChecked ?? .distantPast) }
            .prefix(limit)
        for w in due {
            await WatchService.refresh(w, fresh: true, context: ctx)
            let wid = w.id
            let pts = (try? ctx.fetch(FetchDescriptor<WatchPoint>(predicate: #Predicate { $0.watchId == wid }))) ?? []
            let st = WatchService.status(w, points: pts)
            let recentlyAlerted = (w.lastAlertAt ?? .distantPast) > Date().addingTimeInterval(-20 * 3600)
            // Never notify from a saved price: the store did not answer, so nothing new was seen.
            let fromSaved = w.result.flatMap { r in r.bestStoreId.flatMap { r.stores[$0]?.savedAt } } != nil
            if (st.atTarget || st.lowest), !fromSaved, !recentlyAlerted, let best = st.best, let du = st.du, let storeId = w.result?.bestStoreId {
                let store = RetailerCatalog.byId[storeId]?.short ?? "a store near you"
                let title = st.atTarget ? "\(w.label) hit your target" : "\(w.label): lowest price yet"
                // Say where the price came from, as every screen does: "at Jewel" alone reads as the shelf.
                let basis = w.result?.stores[storeId].map { $0.priceBasis == .shelf ? "" : " (\(PriceProvenance.label($0.priceBasis)))" } ?? ""
                await notify(id: "watch-\(w.id)", title: title, body: "\(Money.unit(best / du.factor, du))/\(du.label) at \(store)\(basis).")
                w.lastAlertAt = Date()
            }
        }
        try? ctx.save()

        // Favorites on sale in this week's ads
        let favorites = (try? ctx.fetch(FetchDescriptor<Favorite>())) ?? []
        guard !favorites.isEmpty else { return }
        await DealsModel.shared.load(.current)
        let matches = DealsModel.shared.matches(terms: favorites.map(\.term))
        for f in favorites {
            // Not before the terms are known: "$7.00" in a notification may be the price of two.
            let fresh = (matches[f.term] ?? []).filter { !f.seenDealIds.contains($0.id) && !$0.termsPending }
            guard let top = fresh.first else { continue }
            let store = RetailerCatalog.byId[top.retailerId]?.short ?? top.merchant
            let more = fresh.count > 1 ? " +\(fresh.count - 1) more" : ""
            await notify(id: "fav-\(f.id)-\(top.id)", title: "\(f.term.capitalized) is on sale", body: "\(top.name) — \(top.priceText) at \(store)\(more).")
            f.seenDealIds = Array((f.seenDealIds + fresh.map(\.id)).suffix(300))
        }
        try? ctx.save()
    }

    static func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional { return true }
        return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func notify(id: String, title: String, body: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let req = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(req)
    }
}
