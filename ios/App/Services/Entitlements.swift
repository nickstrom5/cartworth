import Foundation
import StoreKit

/// Pro subscription state (StoreKit 2): monthly, yearly, or lifetime unlock.
@MainActor
@Observable
final class Entitlements {
    static let shared = Entitlements()

    enum Plan: String, CaseIterable {
        case monthly, yearly, lifetime
        var productId: String { "\(Entitlements.productPrefix).pro.\(rawValue)" }
    }

    /// Product ids derive from the bundle id so renaming the app only needs App Store Connect updates.
    nonisolated static var productPrefix: String { Bundle.main.bundleIdentifier ?? "app.cartworth.ios" }
    nonisolated static var allProductIds: [String] { Plan.allCases.map(\.productId) }

    var isPro = false
    var activePlan: Plan?
    var products: [StoreKit.Product] = []
    var loadError: String?
    var purchasing = false

    /// How `purchase` asks for a payment: StoreKit's sheet. Tests put the sheet's answers here
    /// when a shopper backs out of it, which an SKTestSession cannot produce: its simulated
    /// `userCancelled` arrives as `StoreKitError.unknown`.
    @ObservationIgnored var paymentSheet: (StoreKit.Product) async throws -> StoreKit.Product.PurchaseResult = { try await $0.purchase() }

    private var updates: Task<Void, Never>?
    private var expiryCheck: Task<Void, Never>?

    private init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-proUnlocked") { isPro = true }
        #endif
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish() }
                await self?.refresh()
            }
        }
    }

    func product(_ plan: Plan) -> StoreKit.Product? { products.first { $0.id == plan.productId } }

    /// The paywall calls this every time it opens, so its prices are the App Store's current ones
    /// rather than whatever launch loaded. A failed reload keeps the products already on screen:
    /// they are StoreKit's own last answer, and a purchase re-checks the price anyway.
    func load() async {
        do {
            let p = try await StoreKit.Product.products(for: Self.allProductIds)
            products = p.sorted { a, b in (Plan.allCases.firstIndex { $0.productId == a.id } ?? 0) < (Plan.allCases.firstIndex { $0.productId == b.id } ?? 0) }
            loadError = p.isEmpty ? "Subscriptions aren’t available right now." : nil
        } catch {
            if products.isEmpty { loadError = "Couldn’t reach the App Store. Check your connection and try again." }
        }
        await refresh()
    }

    func refresh() async {
        var pro = false
        var plan: Plan?
        var expires: Date?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, t.revocationDate == nil else { continue }
            if let p = Plan.allCases.first(where: { $0.productId == t.productID }) {
                if let exp = t.expirationDate, exp < Date() { continue }
                pro = true
                if plan != .lifetime { plan = p }
                if let exp = t.expirationDate { expires = max(expires ?? exp, exp) }
            }
        }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-proUnlocked") { pro = true }
        #endif
        isPro = pro
        activePlan = plan
        checkAgain(at: plan == .lifetime ? nil : expires)
    }

    /// A subscription that runs out — auto-renew turned off, or billing that never recovered —
    /// makes no transaction, so nothing arrives on `Transaction.updates` to say so. Without a
    /// check at the expiry date the app kept Pro for as long as it stayed running, which for an
    /// iPhone app left suspended can be days. A renewal does arrive there, and its refresh moves
    /// this check to the new date. The continuous clock keeps counting while the device sleeps.
    private func checkAgain(at date: Date?) {
        expiryCheck?.cancel()
        expiryCheck = date.map { date in
            Task { [weak self] in
                try? await Task.sleep(until: .now + .seconds(date.timeIntervalSinceNow + 1), clock: .continuous)
                guard !Task.isCancelled else { return }
                await self?.refresh()
            }
        }
    }

    enum PurchaseOutcome: Equatable { case success, pending, cancelled, failed(String) }

    func purchase(_ plan: Plan) async -> PurchaseOutcome {
        guard let product = product(plan) else { return .failed(loadError ?? "That plan isn’t available right now.") }
        purchasing = true
        defer { purchasing = false }
        do {
            switch try await paymentSheet(product) {
            case .success(let verification):
                guard case .verified(let t) = verification else { return .failed("The App Store couldn’t verify that purchase.") }
                await t.finish()
                await refresh()
                return .success
            case .pending:
                return .pending
            case .userCancelled:
                return .cancelled
            @unknown default:
                return .cancelled
            }
        } catch StoreKitError.userCancelled {
            // StoreKit can report a cancel as this error (backing out of the Apple ID sign-in, for
            // one) rather than as `.userCancelled`. It is still the shopper's choice, and the
            // paywall used to print it as a failure.
            return .cancelled
        } catch {
            return .failed(error.localizedDescription)
        }
    }

    func restore() async -> String {
        do {
            try await AppStore.sync()
            await refresh()
            return isPro ? "Your Pro access is restored." : "No purchases found for this Apple ID."
        } catch {
            return "Couldn’t restore purchases: \(error.localizedDescription)"
        }
    }
}

/// Free preview: a few searches per day before the paywall.
@MainActor
@Observable
final class UsageMeter {
    static let shared = UsageMeter()
    static let freeSearchesPerDay = 3
    static let freeWatchItems = 1

    private(set) var searchesToday = 0
    private let defaults = UserDefaults.standard

    private init() { rollover() }

    /// Fixed format, POSIX locale and an explicit Gregorian calendar, so the stored key always
    /// sorts chronologically. A device-locale formatter can switch calendar (Buddhist, Japanese)
    /// and change the year out from under a stored key.
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var todayKey: String { Self.dayFormatter.string(from: Date()) }

    private func rollover() {
        let today = todayKey
        let stored = defaults.string(forKey: "usage.day")
        // Only a day genuinely EARLIER than today refills the allowance. Testing for inequality
        // handed a fresh quota to anyone who moved the device clock in EITHER direction, which
        // made the 3-searches-a-day free tier unlimited in practice.
        //
        // A stored day in the future means the clock moved backwards (or the device crossed a
        // date line westward). That neither refills nor rewrites the stored day: rewriting it
        // would restore the bypass, because the user could then move the clock forward again and
        // be handed a new day. The cost is that the current count is held until real time passes
        // the stored day, which for a genuine timezone change is under 24 hours.
        if stored == nil || stored! < today {
            defaults.set(today, forKey: "usage.day")
            defaults.set(0, forKey: "usage.searches")
        }
        searchesToday = defaults.integer(forKey: "usage.searches")
    }

    var remainingFreeSearches: Int {
        rollover()
        return max(0, Self.freeSearchesPerDay - searchesToday)
    }

    func canSearch() -> Bool { Entitlements.shared.isPro || remainingFreeSearches > 0 }

    func recordSearch() {
        guard !Entitlements.shared.isPro else { return }
        rollover()
        searchesToday += 1
        defaults.set(searchesToday, forKey: "usage.searches")
    }
}
