import Foundation
import MapKit

/// How a nearby store can be priced.
enum PriceStatus: String, Codable, Hashable {
    /// Live prices from the store's own in-store / shelf data
    case shelf
    /// Live prices from an online listing (can differ from the shelf)
    case online
    /// A chain-wide listing that isn't tied to the shopper's local store
    case national
    /// Weekly ad only
    case adsOnly
    /// On the map, but no online prices or ad available
    case none
}

/// A chain present near the user.
struct NearbyChain: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var short: String
    var distance: Double?
    var address: String?
    var latitude: Double?
    var longitude: Double?
    var status: PriceStatus
    var hasAds: Bool
    var onMap: Bool
    var mapCount: Int
    var note: String?
}

/// An independent/unknown store found on the map (no price source).
struct MapStore: Identifiable, Codable, Hashable {
    var id: String { "\(name)|\(latitude)|\(longitude)" }
    var name: String
    var address: String?
    var latitude: Double
    var longitude: Double
    var distance: Double
    var phone: String?
    var url: URL?
}

struct Directory: Codable, Hashable {
    var place: UserPlace
    var radius: Double
    var chains: [NearbyChain]
    var others: [MapStore]
    var adMerchants: [String]
    var builtAt: Date
    /// Chains whose lookup failed (a timeout, a busy site): not an answer, so the counts may be low.
    /// Same rule as src/directory.js: such a build is kept for minutes, not days, and retried.
    var unresolved: [String]? = nil
}

actor StoreDirectory {
    static let shared = StoreDirectory()

    /// Chains always checked, because Apple Maps sometimes files them outside "grocery".
    private let alwaysCheck = ["aldi", "walmart", "costco", "wholefoods", "traderjoes", "target", "samsclub"]

    func directory(place: UserPlace, radius: Double, fresh: Bool = false, progress: (@Sendable (String) -> Void)? = nil) async throws -> Directory {
        let key = "dir:v2:\(place.zip):\(Int(radius))"
        let r = try await Cache.shared.value(key, ttl: 3 * TTL.day, fresh: fresh) {
            try await self.build(place: place, radius: radius, progress: progress)
        }
        // A lookup that failed was cached as "no store here" for three days: one timeout during
        // setup hid that chain until Thursday. Keep an incomplete build only until the retry.
        if !r.fromCache, !(r.value.unresolved ?? []).isEmpty { await Cache.shared.put(key, r.value, ttl: Self.unresolvedRetry) }
        return r.value
    }

    static let unresolvedRetry: TimeInterval = 10 * 60

    private func build(place: UserPlace, radius: Double, progress: (@Sendable (String) -> Void)?) async throws -> Directory {
        progress?("Looking up grocery stores on the map…")
        let mapStores = await Self.mapGroceryStores(place: place, radiusMiles: radius)
        progress?("Checking weekly ads near \(place.zip)…")
        let flyers = (try? await FlippSource.shared.flyers(postal: place.zip).flyers) ?? []
        let merchants = Array(Set(flyers.filter { $0.categories.contains("Groceries") || RetailerCatalog.chain(forMerchant: $0.merchant) != nil }.map(\.merchant))).sorted()

        // Group map stores by chain
        var byChain: [String: [MapStore]] = [:]
        var others: [MapStore] = []
        for s in mapStores {
            if let c = RetailerCatalog.chain(forStoreName: s.name) { byChain[c.id, default: []].append(s) } else { others.append(s) }
        }
        var candidateIds = Set(byChain.keys).union(alwaysCheck)
        for m in merchants { if let c = RetailerCatalog.chain(forMerchant: m) { candidateIds.insert(c.id) } }
        let adChainIds = Set(merchants.compactMap { RetailerCatalog.chain(forMerchant: $0)?.id })

        progress?("Finding prices at \(candidateIds.count) stores…")
        let candidates = candidateIds.compactMap { RetailerCatalog.byId[$0] }
        var results: [NearbyChain] = []
        var unresolved: [String] = []
        await withTaskGroup(of: (NearbyChain?, String?).self) { group in
            var running = 0
            var iterator = candidates.makeIterator()
            func addNext() {
                guard let c = iterator.next() else { return }
                running += 1
                let nearest = byChain[c.id]?.min(by: { $0.distance < $1.distance })
                group.addTask { await self.check(c, place: place, radius: radius, nearestOnMap: nearest, mapCount: byChain[c.id]?.count ?? 0, hasAds: adChainIds.contains(c.id)) }
            }
            for _ in 0..<4 { addNext() }
            while let (r, failed) = await group.next() {
                running -= 1
                if let r { results.append(r) }
                if let failed { unresolved.append(failed) }
                addNext()
            }
        }
        results.sort { ($0.distance ?? 999) < ($1.distance ?? 999) }
        others.sort { $0.distance < $1.distance }
        return Directory(place: place, radius: radius, chains: results, others: Array(others.prefix(40)), adMerchants: merchants, builtAt: Date(), unresolved: unresolved.isEmpty ? nil : unresolved.sorted())
    }

    /// Resolve a chain's price source near the user.
    /// Returns the chain (or nil when it has nothing here) and, when the lookup failed, its id.
    private func check(_ c: Chain, place: UserPlace, radius: Double, nearestOnMap: MapStore?, mapCount: Int, hasAds: Bool) async -> (NearbyChain?, String?) {
        var failed = false
        var out = NearbyChain(id: c.id, name: c.name, short: c.short, distance: nearestOnMap?.distance, address: nearestOnMap?.address,
                              latitude: nearestOnMap?.latitude, longitude: nearestOnMap?.longitude,
                              status: hasAds ? .adsOnly : .none, hasAds: hasAds, onMap: nearestOnMap != nil, mapCount: mapCount, note: c.note)
        let limit = max(radius * 1.6, radius + 8)
        switch c.source {
        case .instacart(let base, let slug, let guest):
            let shop: InstacartSource.Shop?
            do { shop = try await InstacartSource.shared.resolveShop(.init(base: base, slug: slug, guest: guest, chainWide: c.chainWide), place: place) } catch { shop = nil; failed = !(error is CancellationError) }
            if let shop, !shop.none {
                if shop.canonical {
                    // Instacart's national storefront: real prices for a chain-wide chain (Walmart),
                    // but no store of any other chain near this shopper — Hy-Vee's answer for
                    // Milwaukee was its Lincoln, NE store. Same rule as src/directory.js probe().
                    if c.chainWide { out.status = .national }
                    break
                }
                if let d = shop.distance, d > limit { break }
                out.status = shop.serviceType == "instore" || (shop.priceNote ?? "").lowercased().contains("no markup") ? .shelf : .online
                if out.distance == nil || shop.distance != nil { out.distance = shop.distance ?? out.distance }
                out.address = shop.address ?? out.address
                out.latitude = shop.latitude ?? out.latitude
                out.longitude = shop.longitude ?? out.longitude
            }
        case .wholeFoods:
            let found: WholeFoodsSource.Store?
            do { found = try await WholeFoodsSource.shared.resolveStore(place: place) } catch { found = nil; failed = !(error is CancellationError) }
            if let s = found, !s.none, (s.distance ?? 0) <= limit {
                out.status = .shelf
                out.distance = s.distance
                out.address = s.address
                out.latitude = s.latitude
                out.longitude = s.longitude
            }
        case .traderJoes:
            let found: TraderJoesSource.Store?
            do { found = try await TraderJoesSource.shared.resolveStore(place: place) } catch { found = nil; failed = !(error is CancellationError) }
            if let s = found, !s.none, (s.distance ?? 0) <= limit {
                out.status = .shelf
                out.distance = s.distance
                out.address = s.address
                out.latitude = s.latitude
                out.longitude = s.longitude
            }
        case .adsOnly:
            break
        }
        let failedId = failed ? c.id : nil
        // Drop chains with nothing to offer that aren't actually nearby
        if out.status == .none && !out.onMap { return (nil, failedId) }
        if let d = out.distance, d > limit && out.status != .adsOnly { return (nil, failedId) }
        if out.status == .adsOnly && !out.onMap && out.distance == nil {
            // Ads-only chains from the ZIP's circular list are still useful
            return (out, failedId)
        }
        return (out, failedId)
    }

    // MARK: Apple Maps

    static func mapGroceryStores(place: UserPlace, radiusMiles: Double) async -> [MapStore] {
        let center = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
        let meters = min(radiusMiles, 50) * 1609.344
        var items: [MKMapItem] = []

        let poi = MKLocalPointsOfInterestRequest(center: center, radius: meters)
        poi.pointOfInterestFilter = MKPointOfInterestFilter(including: [.foodMarket])
        if let r = try? await MKLocalSearch(request: poi).start() { items += r.mapItems }

        for q in ["grocery store", "supermarket", "grocery"] {
            let req = MKLocalSearch.Request()
            req.naturalLanguageQuery = q
            req.resultTypes = .pointOfInterest
            req.region = MKCoordinateRegion(center: center, latitudinalMeters: meters * 2, longitudinalMeters: meters * 2)
            if let r = try? await MKLocalSearch(request: req).start() { items += r.mapItems }
        }

        var seen = Set<String>()
        var out: [MapStore] = []
        for it in items {
            guard let name = it.name else { continue }
            let c = it.placemark.coordinate
            let key = "\(name.lowercased())|\((c.latitude * 1000).rounded())|\((c.longitude * 1000).rounded())"
            if seen.contains(key) { continue }
            seen.insert(key)
            let dist = Geo.miles((place.latitude, place.longitude), (c.latitude, c.longitude)) ?? 999
            guard dist <= radiusMiles * 1.2 else { continue }
            let p = it.placemark
            let addr = [p.subThoroughfare.map { "\($0) \(p.thoroughfare ?? "")" } ?? p.thoroughfare, p.locality].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: ", ")
            out.append(MapStore(name: name, address: addr.isEmpty ? nil : addr, latitude: c.latitude, longitude: c.longitude, distance: dist, phone: it.phoneNumber, url: it.url))
        }
        return out.sorted { $0.distance < $1.distance }
    }
}
