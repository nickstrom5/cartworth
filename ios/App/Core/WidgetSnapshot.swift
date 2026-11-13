import Foundation

/// What the home-screen widget shows: one entry per watched product, already worded.
///
/// The widget runs in its own process and cannot open the app's SwiftData store, so the app
/// writes this small JSON file into the shared App Group after every price check, add, edit or
/// removal (`WidgetBridge`), and the widget reads it. The widget never asks a store for a price
/// itself: it shows what the app last found, with when that was.
///
/// Foundation only, so the rules below are tested on Linux with the rest of Core.
struct WidgetSnapshot: Codable, Equatable {
    struct Watch: Codable, Equatable, Identifiable {
        var id: UUID
        var label: String
        /// "$3.29" / "89¢": the best price in the watch's own unit, as the Tracking card prints it.
        var price: String?
        /// "gal", "lb", "dozen" ...
        var unit: String?
        var storeId: String?
        var storeName: String?
        /// Where the headline price came from, when it is not a shelf price: "Instacart",
        /// "national", "est.", or "saved" when the store did not answer (the owner's rule: the
        /// widget must not show an online, chain-wide or estimated price as the shelf price).
        var qualifiers: [String]
        var onSale: Bool
        var atTarget: Bool
        var lowest: Bool
        /// "target $3.00", when one is set and not yet reached.
        var target: String?
        /// Best unit price at each check, oldest first, in display units. Empty until the checks
        /// span `minTrendSpan`: a burst of refreshes seconds apart is not a trend (see WatchCard).
        var trend: [Double]
        /// Best price now minus at the previous check, in display units (negative: cheaper).
        var change: Double?
        var checkedAt: Date?
        var error: String?
        /// "Ad 58¢/lb at Mariano's · with card": a weekly-ad price below the listed best, still live.
        var ad: String? = nil
    }

    var watches: [Watch]
    var generatedAt: Date

    static let empty = WidgetSnapshot(watches: [], generatedAt: .distantPast)

    /// The same gate as the Tracking card's chart.
    static let minTrendSpan: TimeInterval = 6 * 3600
    /// The widget draws at most this many checks.
    static let maxTrendPoints = 30

    /// One check: when, and the best unit price (per base unit) any store had then.
    struct Reading: Equatable {
        var at: Date
        var perBase: Double
    }

    /// The best price at each check, oldest first, from every store's points. One refresh dates
    /// all its points the same instant, so a check is a timestamp; the best store wins it.
    static func checks(_ points: [(at: Date, perBase: Double)]) -> [Reading] {
        var best: [Date: Double] = [:]
        for p in points where p.perBase.isFinite && p.perBase > 0 { best[p.at] = min(best[p.at] ?? .infinity, p.perBase) }
        return best.map { Reading(at: $0.key, perBase: $0.value) }.sorted { $0.at < $1.at }
    }

    /// The trend line and the change since the previous check, in display units.
    static func trend(_ readings: [Reading], factor: Double) -> (line: [Double], change: Double?) {
        let change: Double? = readings.count >= 2
            ? ((readings[readings.count - 1].perBase - readings[readings.count - 2].perBase) * factor * 100).rounded() / 100
            : nil
        guard readings.count >= 2, let first = readings.first?.at, let last = readings.last?.at,
              last.timeIntervalSince(first) >= minTrendSpan else { return ([], change) }
        return (readings.suffix(maxTrendPoints).map { $0.perBase * factor }, change)
    }

    /// The order the widget offers watches in when none is chosen: one at its target first, then
    /// a lowest-seen price, then the most recently checked.
    static func ordered(_ watches: [Watch]) -> [Watch] {
        watches.sorted { a, b in
            if a.atTarget != b.atTarget { return a.atTarget }
            if a.lowest != b.lowest { return a.lowest }
            return (a.checkedAt ?? .distantPast) > (b.checkedAt ?? .distantPast)
        }
    }

    func watch(_ id: UUID?) -> Watch? {
        if let id, let w = watches.first(where: { $0.id == id }) { return w }
        return Self.ordered(watches).first
    }
}
