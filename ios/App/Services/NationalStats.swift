import Foundation

/// Nationwide staple prices by state, produced weekly by the sampler (see scripts/sampler in the repo).
/// A copy ships in the app; a newer one is fetched from `StatsURL` in Info.plist when configured.
/// The shape written by scripts/sampler/aggregate.js. Keep this in sync with that file: the whole
/// decode is optional, so a type mismatch here silently means no facts ever appear rather than a
/// visible failure. CoreTests covers decoding the bundled copy for exactly that reason.
struct NationalStatsFile: Codable, Hashable {
    struct Fact: Codable, Hashable {
        var id: String
        var type: String?
        var item: String?
        var text: String
        var state: String?
        var value: Double?
        var unit: String?
        /// The date the underlying prices were collected. A fact must never outlive its data.
        var asOf: String?
        /// "low" | "medium" | "high" — how many states and stores stand behind the claim.
        var confidence: String?
        var stores: Int?
        var states: Int?
    }

    struct StateStat: Codable, Hashable {
        var median: Double?
        var min: Double?
        var max: Double?
        var minStore: String?
        var minCity: String?
        var minProduct: String?
        var onSale: Bool?
        var stores: Int?
        var basis: String?
        var shelfStores: Int?
        var shelfMin: Double?
        var shelfMedian: Double?
        var onlineMin: Double?
        var onlineMedian: Double?
        var baseline: Double?
    }

    /// Nationwide roll-up for one item. Mixed value types, so this cannot be a [String: Double].
    struct National: Codable, Hashable {
        var median: Double?
        var min: Double?
        var max: Double?
        var stores: Int?
        var states: Int?
        var minState: String?
        var minStore: String?
        var minCity: String?
        var minBasis: String?
        var maxState: String?
        var maxStore: String?
        var maxCity: String?
        var maxBasis: String?
        var shelfMedian: Double?
        var onlineMedian: Double?
        var shelfMin: Double?
        var shelfMinState: String?
        var shelfMinStore: String?
        var shelfMinCity: String?
    }

    struct Coverage: Codable, Hashable {
        var states: Int?
        var zips: Int?
        var chains: Int?
        var stores: Int?
        var samples: Int?
        var priced: Int?
        var shelfStores: Int?
    }

    struct Item: Codable, Hashable {
        var id: String
        var label: String
        var noun: String?
        var unit: String
        var unitText: String?
        var national: National?
        var states: [String: StateStat]?
        var confidence: String?
    }

    var version: Int
    var generatedAt: String?
    var weekOf: String?
    var coverage: Coverage?
    var items: [Item]
    var facts: [Fact]
}

@MainActor
@Observable
final class NationalStats {
    static let shared = NationalStats()

    var file: NationalStatsFile?

    private init() {
        if let url = Bundle.main.url(forResource: "stats", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let f = try? JSONDecoder().decode(NationalStatsFile.self, from: data) {
            file = f
        }
    }

    /// Refresh from the hosted copy at most once a day.
    func refresh() async {
        guard let s = Bundle.main.object(forInfoDictionaryKey: "StatsURL") as? String, let url = URL(string: s), !s.isEmpty else { return }
        if let r = try? await Cache.shared.value("stats:remote", ttl: TTL.day, fetch: {
            let resp = try await HTTP.shared.request(url, timeout: 15)
            guard resp.ok else { throw HTTPError(status: resp.status, message: "stats unavailable") }
            return try JSONDecoder().decode(NationalStatsFile.self, from: resp.data)
        }) {
            file = r.value
        }
    }

    var facts: [String] { file?.facts.map(\.text) ?? [] }

    /// Loading-screen line: a stats fact when available, otherwise a shopping tip.
    func randomLine() -> String {
        let f = facts
        if !f.isEmpty && Int.random(in: 0..<3) > 0 { return f.randomElement()! }
        return Self.tips.randomElement()!
    }

    static let tips = [
        "Compare by unit price — the bigger package isn’t always cheaper per ounce.",
        "Store brands are usually 20–30% cheaper than name brands for the same product.",
        "Weekly ads flip mid-week. Check next week’s ad before you shop.",
        "“2 for $5” usually doesn’t require buying two — each rings up at $2.50.",
        "Meat and produce on the front page of the ad are often sold below cost to get you in the door.",
        "Stock up on staples when they hit your target price, then skip them when they don’t.",
        "Holiday baking goods (flour, sugar, butter) hit their lowest prices in November and December.",
        "Prices marked “shelf” come straight from the store’s in-store listing; “online” prices can run a little higher.",
    ]
}
