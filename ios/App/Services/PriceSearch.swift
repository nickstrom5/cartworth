import Foundation

/// Runs one product search against one store (cached 20 min, stale copies served if the store is down).
enum PriceSearch {
    // 4: "M oz, N ct" read as the package; a listing whose own unit line contradicts its size is a
    // size conflict; Instacart pack lines are now passed through. Each changes a price.
    // 5: Whole Foods sale dates are calendar days (SaleDates.wallClock); a sale was dropped at 7 pm
    // Central on its last day. Eggnog and buttermilk are liquids (Units.liquidRx),
    // and the Christmas-run matcher fixes change which listing wins.
    // 6: a size only at the END of an Instacart slug no longer settles a name that says otherwise
    // (ProductFactory.slugConfirms); a half gallon stated "2 gal" was $1.50 a gallon.
    // 7: juice-flavoured drinks are not juice; "from concentrate" juice is (Match.juiceImpostorRx).
    // 8: "<thing> a la <style>" is a prepared dish (Chicken a la King is not chicken).
    // 9: a processed-form category (Dried/Frozen Bananas) does not cover the plain query; -ade is not juice.
    // 10: supplements named after a food (apple pectin tablets) are not the food.
    // 11: a dose on a grocery (Vitamin D 400 IU) is not a supplement; "a la carte" is not a dish.
    // 12: ketchup and canned tomatoes are not "tomatoes"; spaghetti squash is not "spaghetti".
    // 13: the holiday matrix (Match.queryAllows, compounds, canned vegetables and meats).
    static let cacheVersion = 13

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
            // 35 s without an answer from the store's site, not 35 s in all: at one request per
            // host, a store at the back of a trip plan's queue waits its turn. See withStallTimeout.
            let r = try await withStallTimeout(seconds: 35, hosts: hosts(chain.source)) {
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
            let r = try await InstacartSource.shared.search(.init(base: base, slug: slug, guest: guest, chainWide: chain.chainWide), retailerId: chain.id, query: query, place: place, limit: limit)
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

    /// The hosts a price source talks to. Mirrors `sourceHosts` in src/directory.js.
    static func hosts(_ source: SourceKind) -> [String] {
        switch source {
        case .instacart(let base, _, _): return [URL(string: base)?.host].compactMap { $0 }
        case .wholeFoods: return ["www.wholefoodsmarket.com"]
        case .traderJoes: return ["www.traderjoes.com", "alphaapi.brandify.com"]
        case .adsOnly: return []
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
            // Next week's circular is not "in this week's ads" (and is a Pro feature on its own tab).
            if let from = d.validFrom, from > now { continue }
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

/// A timeout that fires when `hosts` stop answering, not when the work has taken a while. Port of
/// `withStallTimeout` in src/http.js: at one request in flight per host, 700 ms apart, a caller can
/// wait a long time for its turn, and that wait is not the store being slow. The clock restarts
/// whenever any of `hosts` answers; `maxSeconds` is a hard ceiling for the whole call.
func withStallTimeout<T>(seconds: Double, hosts: [String], maxSeconds: Double = 300, _ op: @escaping @Sendable () async throws -> T) async throws -> T {
    let start = Date()
    return try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await op() }
        group.addTask {
            while true {
                try await Task.sleep(nanoseconds: 500_000_000)
                let now = Date()
                if now.timeIntervalSince(start) > maxSeconds { throw TimeoutError() }
                let last = max(start, await HTTP.shared.lastAnswer(hosts) ?? start)
                if now.timeIntervalSince(last) > seconds { throw TimeoutError() }
            }
        }
        let r = try await group.next()!
        group.cancelAll()
        return r
    }
}
