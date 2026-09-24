import SwiftUI
import SwiftData

@main
struct CartworthApp: App {
    @State private var app = AppState.shared
    @State private var entitlements = Entitlements.shared

    init() {
        BackgroundRefresh.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .environment(entitlements)
                .modelContainer(Persistence.container)
                .task {
                    #if DEBUG
                    await QABootstrap.applyLaunchArguments()
                    #endif
                    await Entitlements.shared.load()
                    await NationalStats.shared.refresh()
                    BackgroundRefresh.schedule()
                    await Cache.shared.purge()
                }
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        if app.place == nil || !app.onboarded {
            OnboardingView()
        } else {
            MainTabs()
        }
    }
}

struct MainTabs: View {
    @Environment(AppState.self) private var app
    @State private var search = SearchModel()
    @State private var router = Router()

    var body: some View {
        TabView(selection: Binding(get: { router.tab }, set: { router.tab = $0 })) {
            SearchView(model: search)
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(0)
            DealsView()
                .tabItem { Label("Deals", systemImage: "tag") }
                .tag(1)
            ListsView()
                .tabItem { Label("List", systemImage: "list.bullet") }
                .tag(2)
            TrackingView()
                .tabItem { Label("Tracking", systemImage: "star") }
                .tag(3)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(4)
        }
        .environment(search)
        .environment(router)
        .onChange(of: router.pendingQuery) { _, q in
            guard let q else { return }
            router.pendingQuery = nil
            search.run(q)
        }
        .onOpenURL { url in
            // cartworth://search?q=milk
            guard url.scheme == "cartworth" else { return }
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            switch url.host {
            case "search":
                if let q = items.first(where: { $0.name == "q" })?.value { router.compare(q) }
            case "tab":
                let names = ["search": 0, "deals": 1, "list": 2, "tracking": 3, "settings": 4]
                if let n = items.first(where: { $0.name == "name" })?.value, let i = names[n] { router.go(i) }
            default:
                break
            }
        }
    }
}


/// Screenshot-capture switches.
///
/// **Nothing here changes the shipping app.** Every flag is `false` in a release build — the
/// whole thing compiles down to four `let … = false` constants, so the branches that read them
/// are dead code the optimiser removes — and even in a debug build each one stays off unless its
/// launch argument is passed. In particular the "Ad" badge on a sponsored row
/// (`Components.swift`, `ProductRowView`) is untouched: `-qaHideSponsored` removes the sponsored
/// *rows* from a capture, it does not remove the disclosure from the product.
///
/// They exist because an App Store screenshot has to obey rules the app itself does not:
///
///  * `-qaHideSponsored` — a marketing image must not carry another company's paid placement.
///  * `-qaHideRemoteImages` — a marketing image must not carry another company's packaging
///    photography. Retailer and brand *names* stay: the app's function is naming stores.
///  * `-qaPolite` — one request at a time per host with a gap between them, so a capture run is
///    gentler on store sites than the app's normal four-at-once.
///  * `-qaSeedWatchHistory` — back-fills a watch's trend with generated samples so the chart can
///    be photographed with a time axis on it. See `QABootstrap.seedWatchHistory`; the frames that
///    use it must say so.
enum QAShot {
    #if DEBUG
    private static let args = Set(ProcessInfo.processInfo.arguments)
    static let hideSponsored = args.contains("-qaHideSponsored")
    static let hideRemoteImages = args.contains("-qaHideRemoteImages")
    static let politeNetworking = args.contains("-qaPolite")
    static let seedWatchHistory = args.contains("-qaSeedWatchHistory")
    #else
    static let hideSponsored = false
    static let hideRemoteImages = false
    static let politeNetworking = false
    static let seedWatchHistory = false
    #endif
}

#if DEBUG
/// Debug-only helpers so QA can jump straight to a state (never used in release builds).
enum QABootstrap {
    @MainActor
    static func applyLaunchArguments() async {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-qaReset") {
            for key in ["place", "selectedChainIds", "onboarded", "radiusMiles"] { UserDefaults.standard.removeObject(forKey: key) }
        }
        if let i = args.firstIndex(of: "-qaZip"), i + 1 < args.count {
            let zip = args[i + 1]
            if AppState.shared.place?.zip != zip {
                if let place = try? await Geo.place(forZip: zip) {
                    await AppState.shared.setPlace(place)
                }
            } else if AppState.shared.directory == nil {
                await AppState.shared.loadDirectory()
            }
            AppState.shared.onboarded = true
        }
        if QAShot.seedWatchHistory { Task { await seedWatchHistory() } }
    }

    // MARK: - seeded watch history

    /// How far back the generated trend runs, and how often it samples.
    private static let sampleCount = 12
    private static let sampleInterval: TimeInterval = 5 * 24 * 3600

    /// Week-by-week multipliers on *today's* real price, one shape per store.
    ///
    /// Every value is > 1, so every generated sample sits above the price the store is actually
    /// charging today. Two things follow, and both are the point:
    ///
    ///  * the chart has somewhere to go — a real decline with real week-to-week upticks in it,
    ///    rather than the flat line a clean simulator produces;
    ///  * "lowest seen" on the card is *true of the data in the database*. `WatchService.status`
    ///    reads it as `current <= min(every recorded point)`, and the minimum of a set that is
    ///    entirely above today's price is today's price.
    ///
    /// The shapes are hand-written rather than random so a capture is reproducible, and each is
    /// assigned to a store by a stable hash of the store id rather than by `hashValue`, which is
    /// salted per process.
    private static let shapes: [[Double]] = [
        [1.48, 1.45, 1.46, 1.39, 1.40, 1.33, 1.28, 1.29, 1.22, 1.16, 1.11, 1.05],
        [1.41, 1.43, 1.36, 1.37, 1.30, 1.31, 1.24, 1.19, 1.21, 1.14, 1.09, 1.06],
        [1.55, 1.52, 1.44, 1.46, 1.38, 1.34, 1.35, 1.27, 1.20, 1.16, 1.12, 1.08],
        [1.34, 1.36, 1.31, 1.32, 1.26, 1.27, 1.21, 1.22, 1.15, 1.11, 1.07, 1.04],
        [1.60, 1.56, 1.49, 1.51, 1.43, 1.38, 1.39, 1.31, 1.25, 1.19, 1.14, 1.09],
        [1.43, 1.38, 1.40, 1.33, 1.34, 1.27, 1.22, 1.23, 1.17, 1.12, 1.10, 1.03],
    ]

    private static func stableSlot(_ s: String) -> Int {
        var h: UInt64 = 5381
        for b in s.utf8 { h = (h &* 33) &+ UInt64(b) }
        return Int(h % UInt64(shapes.count))
    }

    /// Back-fill each watched store's trend from the price that store is charging right now.
    ///
    /// Runs on a poll because the watch this is meant for does not exist at launch — the capture
    /// test types it in, and the first live check lands a minute or two later. A watch is seeded
    /// once: a back-dated point for it is the marker.
    @MainActor
    static func seedWatchHistory() async {
        let ctx = Persistence.container.mainContext
        let deadline = Date().addingTimeInterval(20 * 60)
        var seeded = Set<UUID>()
        while Date() < deadline {
            let watches = (try? ctx.fetch(FetchDescriptor<WatchItem>())) ?? []
            let points = (try? ctx.fetch(FetchDescriptor<WatchPoint>())) ?? []
            let cutoff = Date().addingTimeInterval(-2 * 24 * 3600)
            for w in watches where !seeded.contains(w.id) {
                guard let result = w.result, !result.stores.isEmpty else { continue }
                if points.contains(where: { $0.watchId == w.id && $0.at < cutoff }) {
                    seeded.insert(w.id)
                    continue
                }
                seed(watch: w, result: result, into: ctx)
                seeded.insert(w.id)
                print("QA seeded \(sampleCount) back-dated samples for \(result.stores.count) stores on watch “\(w.query)”")
            }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
        }
    }

    @MainActor
    private static func seed(watch: WatchItem, result: WatchResult, into ctx: ModelContext) {
        let now = Date()
        for (storeId, best) in result.stores {
            // How many base units the pack holds, so a generated pack price converts back to a
            // unit price exactly the way a real observation would.
            guard best.unitPerBase > 0, best.price > 0 else { continue }
            let baseUnitsPerPack = best.price / best.unitPerBase
            let shape = shapes[stableSlot(storeId)]
            for i in 0..<sampleCount {
                let at = now.addingTimeInterval(-sampleInterval * Double(sampleCount - i))
                // Round to whole cents first: a shelf price is a whole number of cents, and the
                // unit price is whatever that divides out to — not the other way round.
                let price = (best.price * shape[i] * 100).rounded() / 100
                ctx.insert(WatchPoint(watchId: watch.id, storeId: storeId, name: best.name,
                                      price: price, unitPerBase: price / baseUnitsPerPack,
                                      onSale: false, at: at))
            }
        }
        try? ctx.save()
    }
}
#endif
