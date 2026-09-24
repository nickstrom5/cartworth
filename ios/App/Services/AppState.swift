import Foundation
import SwiftUI

/// App-wide settings and location, persisted in UserDefaults.
@MainActor
@Observable
final class AppState {
    static let shared = AppState()

    var place: UserPlace? { didSet { save() } }
    var radiusMiles: Double = 15 { didSet { save() } }
    /// Chains the user compares (ids from RetailerCatalog)
    var selectedChainIds: [String] = [] { didSet { save() } }
    var directory: Directory?
    var prefs = PricePrefs() { didSet { save() } }
    var onboarded = false { didSet { save() } }
    var alertsEnabled = true { didSet { save() } }
    var resultsPerStore = 36 { didSet { save() } }
    var lastDirectoryError: String?
    var isLoadingDirectory = false
    var directoryProgress: String?

    private let defaults = UserDefaults.standard
    private var loading = false

    private init() {
        loading = true
        if let data = defaults.data(forKey: "place"), let p = try? JSONDecoder().decode(UserPlace.self, from: data) { place = p }
        let r = defaults.double(forKey: "radiusMiles")
        radiusMiles = r > 0 ? r : 15
        selectedChainIds = defaults.stringArray(forKey: "selectedChainIds") ?? []
        prefs = PricePrefs(prime: defaults.bool(forKey: "prefs.prime"), cardPrices: defaults.object(forKey: "prefs.card") as? Bool ?? true)
        onboarded = defaults.bool(forKey: "onboarded")
        alertsEnabled = defaults.object(forKey: "alertsEnabled") as? Bool ?? true
        let n = defaults.integer(forKey: "resultsPerStore")
        resultsPerStore = n > 0 ? n : 36
        loading = false
    }

    private func save() {
        guard !loading else { return }
        if let place, let data = try? JSONEncoder().encode(place) { defaults.set(data, forKey: "place") }
        defaults.set(radiusMiles, forKey: "radiusMiles")
        defaults.set(selectedChainIds, forKey: "selectedChainIds")
        defaults.set(prefs.prime, forKey: "prefs.prime")
        defaults.set(prefs.cardPrices, forKey: "prefs.card")
        defaults.set(onboarded, forKey: "onboarded")
        defaults.set(alertsEnabled, forKey: "alertsEnabled")
        defaults.set(resultsPerStore, forKey: "resultsPerStore")
    }

    /// Chains selected for comparison, in the directory's distance order.
    var selectedChains: [Chain] {
        let order = directory?.chains.map(\.id) ?? []
        let ids = selectedChainIds.sorted { (order.firstIndex(of: $0) ?? 999) < (order.firstIndex(of: $1) ?? 999) }
        return ids.compactMap { RetailerCatalog.byId[$0] }
    }

    var pricedChains: [Chain] { selectedChains.filter { $0.source.hasPrices } }

    func nearby(_ id: String) -> NearbyChain? { directory?.chains.first { $0.id == id } }

    /// Stable color slot per selected chain (validated palette order, never reassigned by rank).
    func colorSlot(for chainId: String) -> Int {
        guard let i = selectedChainIds.firstIndex(of: chainId) else { return 0 }
        return i < 8 ? i + 1 : 0
    }

    func loadDirectory(fresh: Bool = false) async {
        guard let place else { return }
        isLoadingDirectory = true
        lastDirectoryError = nil
        defer { isLoadingDirectory = false; directoryProgress = nil }
        do {
            let dir = try await StoreDirectory.shared.directory(place: place, radius: radiusMiles, fresh: fresh) { msg in
                Task { @MainActor in AppState.shared.directoryProgress = msg }
            }
            directory = dir
            if selectedChainIds.isEmpty || !onboarded {
                // Default: every priced chain nearby (closest first), plus up to 3 ad-only chains
                let priced = dir.chains.filter { $0.status == .shelf || $0.status == .online || $0.status == .national }.map(\.id)
                let ads = dir.chains.filter { $0.status == .adsOnly }.prefix(3).map(\.id)
                selectedChainIds = Array(priced.prefix(10)) + ads
            } else {
                // Keep choices that still exist here
                let valid = Set(dir.chains.map(\.id))
                let kept = selectedChainIds.filter { valid.contains($0) }
                if !kept.isEmpty { selectedChainIds = kept }
            }
        } catch {
            lastDirectoryError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func setPlace(_ p: UserPlace) async {
        let changed = p.zip != place?.zip
        place = p
        if changed { selectedChainIds = [] }
        await loadDirectory(fresh: false)
    }
}

/// Cross-tab navigation ("compare this deal" jumps to the Search tab and runs it).
@MainActor
@Observable
final class Router {
    var tab = 0
    var pendingQuery: String?

    func compare(_ query: String) {
        pendingQuery = query
        tab = 0
    }

    func go(_ tab: Int) { self.tab = tab }
}
