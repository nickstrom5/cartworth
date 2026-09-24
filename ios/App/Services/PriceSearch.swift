import Foundation

/// Runs one product search against one store (cached 20 min, stale copies served if the store is down).
enum PriceSearch {
    static let cacheVersion = 3

    struct Payload: Codable {
        var items: [Product]
        var location: StoreLocation?
        var message: String?
    }

    static func search(chain: Chain, query: String, place: UserPlace, limit: Int = 36, fresh: Bool = false) async -> StoreResult {
        let started = Date()
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = "search:v\(cacheVersion):\(chain.id):\(place.zip):\(Match.normalize(q))"
        guard chain.source.hasPrices else {
            return StoreResult(retailerId: chain.id, status: .adsOnly, items: [], location: nil, message: chain.note ?? "Weekly ad only")
        }
        let wasFresh = await Cache.shared.isFresh(key)
        do {
            let r = try await withTimeout(seconds: 35) {
                try await Cache.shared.value(key, ttl: 20 * TTL.minute, fresh: fresh, maxStale: 3 * TTL.day) {
                    try await run(chain: chain, query: q, place: place, limit: limit)
                }
            }
            let ms = Int(Date().timeIntervalSince(started) * 1000)
            // Screenshot capture only, and off in every shipping build: a marketing frame must
            // not carry a third party's paid placement. The "Ad" badge itself is untouched — see
            // `QAShot`. Filtering here rather than in a view keeps search, the trip planner and
            // the watch list consistent with one another during a capture.
            let items = QAShot.hideSponsored ? r.value.items.filter { !$0.sponsored } : r.value.items
            return StoreResult(retailerId: chain.id, status: items.isEmpty ? .empty : .ok, items: items, location: r.value.location,
                               message: r.value.message, cached: wasFresh && !fresh, stale: r.staleError.map { friendly($0) }, ms: ms)
        } catch {
            return StoreResult(retailerId: chain.id, status: .error(friendly(error)), items: [], location: nil, message: nil, ms: Int(Date().timeIntervalSince(started) * 1000))
        }
    }

    private static func run(chain: Chain, query: String, place: UserPlace, limit: Int) async throws -> Payload {
        switch chain.source {
        case .instacart(let base, let slug, let guest):
            let r = try await InstacartSource.shared.search(.init(base: base, slug: slug, guest: guest), retailerId: chain.id, query: query, place: place, limit: limit)
            return Payload(items: r.items, location: r.location, message: r.message)
        case .wholeFoods:
            let r = try await WholeFoodsSource.shared.search(query: query, retailerId: chain.id, place: place, limit: limit)
            return Payload(items: r.items, location: r.location, message: r.message)
        case .traderJoes:
            let r = try await TraderJoesSource.shared.search(query: query, retailerId: chain.id, place: place, limit: limit)
            return Payload(items: r.items, location: r.location, message: r.message)
        case .adsOnly:
            return Payload(items: [], location: nil, message: "Weekly ad only")
        }
    }

    static func friendly(_ error: Error) -> String {
        if error is TimeoutError { return "Took too long — the store site may be busy" }
        let m = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        return m.count > 140 ? String(m.prefix(137)) + "…" : m
    }

    /// Weekly-ad items matching a query at the user's stores.
    static func ads(query: String, place: UserPlace, chainIds: Set<String>) async -> [Deal] {
        guard let hits = try? await FlippSource.shared.search(query, postal: place.zip) else { return [] }
        let now = Date()
        var out: [(Deal, Double)] = []
        for h in hits {
            guard let chain = RetailerCatalog.chain(forMerchant: h.merchant), chainIds.contains(chain.id) else { continue }
            let d = FlippSource.deal(item: h.item, detail: h.detail, retailerId: chain.id, merchant: h.merchant, now: now)
            if let to = d.validTo, to < now { continue }
            let score = Match.relevance(query: query, name: "\(d.name) \(d.description ?? "")")
            if score >= 0.4 { out.append((d, score)) }
        }
        return out.sorted { $0.1 > $1.1 }.map(\.0)
    }
}

struct TimeoutError: Error {}

func withTimeout<T>(seconds: Double, _ op: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await op() }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TimeoutError()
        }
        let r = try await group.next()!
        group.cancelAll()
        return r
    }
}
