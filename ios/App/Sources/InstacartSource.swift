import Foundation

/// Instacart-powered storefronts (aldi.us, shopwoodmans.com, …) and the instacart.com marketplace.
///
/// Flow: guest session cookie → ShopCollectionScoped (nearest shop for a ZIP) →
/// SearchResultsPlacements (ordered item ids) → Items (prices).
/// Queries are persisted GraphQL operations identified by sha256 hashes. Current hashes are read from
/// the site's own "operation-hashes" manifest so the app keeps working after site deploys; known
/// hashes are the fallback.
actor InstacartSource {
    static let shared = InstacartSource()

    struct Config: Hashable {
        var base: String
        var slug: String
        var guest: GuestMode
        var prefer: [String] = ["instore", "pickup", "delivery"]
    }

    struct Shop: Codable, Hashable {
        var none: Bool = false
        var shopId: String = ""
        var serviceType: String = ""
        var serviceTypes: [String] = []
        var retailerId: String = ""
        var locationId: String = ""
        var name: String = ""
        var label: String?
        var address: String?
        var latitude: Double?
        var longitude: Double?
        var distance: Double?
        var priceNote: String?
        var logo: String?
        /// True when Instacart had no store serving this ZIP and handed back its national
        /// storefront instead. Those prices belong to some other store, not the shopper's.
        var canonical: Bool = false
    }

    static let fallbackHashes: [String: String] = [
        "SearchResultsPlacements": "c127efb3fa85276388954593f2c1a27eb0775dd7b0964e39c949e7fd89c7ef19",
        "Items": "396b053077ec2644bac71a1876c3bbdc86d72833f1dbb3f4da56c9a280864372",
        "ShopCollectionScoped": "f20693c3c551f0e0fbdcac9b2ca7aa6db50f9224a39967ba5ac767bb2b598f85",
        "GetRetailerLocationAddress": "b80a5ef08c6fe88df0b9a2e78a099dd6141345b213df0f9f517803674b6eee94",
        "GetLastUserLocation": "6c76952dbbaf5fe8b79d2ae6dc96af8ccca133285868e7efb9a81ffe624e37e1",
        "StoreInfoModalContentQuery": "d22b42d094a216695f0fb045c4eb3ad6eb6d4dac16e632b98276163f34546ebf",
        "HomepagePbiCreateGuestUserWithPostalCodeMutation": "60933aab54d6b3f2add1fec396506dae6ef9b6a1891effbdaf39db129e787446",
    ]

    private struct Session {
        var hashes: [String: String]
        var zone: String?
        var created: Date
    }

    private var sessions: [String: Session] = [:]
    private var pending: [String: Task<Session, Error>] = [:]
    private let http = HTTP.shared

    enum Failure: LocalizedError {
        case noSession
        case auth
        case staleHashes(String)
        case rateLimited
        case message(String)

        var errorDescription: String? {
            switch self {
            case .noSession: return "The store site didn’t start a guest session"
            case .auth: return "The store site ended our session"
            case .staleHashes: return "The store site changed; retrying"
            case .rateLimited: return "The store site is busy — try again in a minute"
            case .message(let m): return m
            }
        }
    }

    // MARK: sessions

    private func session(_ cfg: Config, zip: String, reset: Bool = false) async throws -> Session {
        if !reset, let s = sessions[cfg.base], Date().timeIntervalSince(s.created) < 12 * TTL.hour { return s }
        if !reset, let p = pending[cfg.base] { return try await p.value }
        let task = Task { try await self.createSession(cfg, zip: zip, reset: reset) }
        pending[cfg.base] = task
        defer { pending[cfg.base] = nil }
        let s = try await task.value
        sessions[cfg.base] = s
        return s
    }

    private func createSession(_ cfg: Config, zip: String, reset: Bool) async throws -> Session {
        guard let baseURL = URL(string: cfg.base), let storefront = URL(string: "\(cfg.base)/store/\(cfg.slug)/storefront") else { throw Failure.noSession }
        if reset { http.clearCookies(for: baseURL.host ?? "") }
        let hashKey = "ic:hashes:\(cfg.base)"
        var cachedHashes = await Cache.shared.peek(hashKey, as: [String: String].self)
        let hashesFresh = await Cache.shared.isFresh(hashKey)

        if http.hasCookie("__Host-instacart_sid", for: baseURL), let h = cachedHashes, hashesFresh {
            let zone = await Cache.shared.peek("ic:zone:\(cfg.base)", as: String.self)
            return Session(hashes: Self.fallbackHashes.merging(h) { _, new in new }, zone: zone, created: Date())
        }

        var html = try await http.request(storefront, headers: ["Accept": "text/html"], timeout: 25).text
        if !http.hasCookie("__Host-instacart_sid", for: baseURL) {
            guard cfg.guest == .postal else { throw Failure.noSession }
            // Landing page wants a ZIP before shopping (e.g. ShopWoodman's)
            let landing = (try? await discoverHashes(html: html)) ?? [:]
            let op = "HomepagePbiCreateGuestUserWithPostalCodeMutation"
            let hash = landing[op] ?? Self.fallbackHashes[op]!
            let body: [String: Any] = ["operationName": op, "variables": ["postalCode": zip], "extensions": ["persistedQuery": ["version": 1, "sha256Hash": hash]]]
            _ = try await http.postJSON(URL(string: "\(cfg.base)/graphql?operationName=\(op)")!, body: body, timeout: 20)
            guard http.hasCookie("__Host-instacart_sid", for: baseURL) else { throw Failure.noSession }
            html = try await http.request(storefront, headers: ["Accept": "text/html"], timeout: 25).text
        }
        if let discovered = try? await discoverHashes(html: html), !discovered.isEmpty {
            cachedHashes = discovered
            await Cache.shared.put(hashKey, discovered, ttl: 12 * TTL.hour)
        }
        var s = Session(hashes: Self.fallbackHashes.merging(cachedHashes ?? [:]) { _, new in new }, zone: nil, created: Date())
        if let loc = try? await gqlRaw(cfg, s, "GetLastUserLocation", [:]), let zone = loc["data"]["lastUserLocation"]["zoneId"].string {
            s.zone = zone
            await Cache.shared.put("ic:zone:\(cfg.base)", zone, ttl: 30 * TTL.day)
        }
        return s
    }

    private static let runtimeRx = Rx("https://[a-z0-9.-]+/assets/rspack/runtime\\.webpack_bundle-[0-9a-f]+-v3\\.js", caseInsensitive: false)

    /// Reads the site's persisted-query manifest: runtime bundle → "operation-hashes" chunk → JSON map.
    private func discoverHashes(html: String) async throws -> [String: String] {
        guard let rtString = Self.runtimeRx.match(html)?[0], let rt = URL(string: rtString) else { return [:] }
        let r = try await Cache.shared.value("ic:manifest:\(rtString)", ttl: 12 * TTL.hour) {
            let runtime = try await HTTP.shared.request(rt, timeout: 20).text
            guard let idm = Rx("(\\d+):\"operation-hashes\"", caseInsensitive: false).match(runtime), let id = idm[1],
                  let hm = Rx("[,{]\(id):\"([0-9a-f]{8,32})\"", caseInsensitive: false).match(runtime), let chunkHash = hm[1] else {
                throw Failure.message("manifest not found")
            }
            let base = rtString[..<(rtString.lastIndex(of: "/")!)]
            let chunkURL = URL(string: "\(base)/operation-hashes-\(chunkHash)-v3.webpack_chunk.js")!
            let js = try await HTTP.shared.request(chunkURL, timeout: 20).text
            guard let jm = Rx("JSON\\.parse\\('([\\s\\S]*)'\\)", caseInsensitive: false).match(js), let raw = jm[1] else { throw Failure.message("manifest unreadable") }
            let json = raw.replacingOccurrences(of: "\\'", with: "'")
            guard let obj = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: String], obj["Items"] != nil else {
                throw Failure.message("manifest incomplete")
            }
            return obj
        }
        return r.value
    }

    // MARK: GraphQL

    private func gqlRaw(_ cfg: Config, _ s: Session, _ op: String, _ variables: [String: Any]) async throws -> J {
        guard let hash = s.hashes[op] else { throw Failure.message("Unknown operation \(op)") }
        let vars = String(decoding: try JSONSerialization.data(withJSONObject: variables), as: UTF8.self)
        let ext = "{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"\(hash)\"}}"
        guard let url = URL(string: "\(cfg.base)/graphql?operationName=\(op)&variables=\(vars.urlQueryEncoded)&extensions=\(ext.urlQueryEncoded)") else {
            throw Failure.message("Bad request")
        }
        let r = try await http.request(url, headers: ["Accept": "application/json"], timeout: 20)
        if r.status == 401 || r.status == 403 { throw Failure.auth }
        if r.status == 429 { throw Failure.rateLimited }
        let body = try r.json()
        let errors = body["errors"].array
        if !errors.isEmpty && body["data"].isNull {
            let msg = errors.compactMap { $0["message"].string }.joined(separator: "; ")
            let blob = msg + String(describing: errors.map { $0["extensions"]["code"].string ?? "" })
            if blob.localizedCaseInsensitiveContains("PersistedQueryNotFound") || blob.contains("PERSISTED_QUERY") { throw Failure.staleHashes(msg) }
            throw Failure.message(msg.isEmpty ? "Store search failed" : msg)
        }
        return body["data"]
    }

    private func gql(_ cfg: Config, zip: String, _ op: String, _ variables: [String: Any]) async throws -> J {
        var s = try await session(cfg, zip: zip)
        do {
            return try await gqlRaw(cfg, s, op, variables)
        } catch Failure.auth {
            s = try await session(cfg, zip: zip, reset: true)
            return try await gqlRaw(cfg, s, op, variables)
        } catch Failure.staleHashes {
            await Cache.shared.remove(prefix: "ic:hashes:\(cfg.base)")
            await Cache.shared.remove(prefix: "ic:manifest:")
            sessions[cfg.base] = nil
            s = try await session(cfg, zip: zip, reset: false)
            return try await gqlRaw(cfg, s, op, variables)
        }
    }

    // MARK: store location

    func resolveShop(_ cfg: Config, place: UserPlace, fresh: Bool = false) async throws -> Shop {
        let key = "ic:shop:\(cfg.base):\(cfg.slug):\(place.zip)"
        let r = try await Cache.shared.value(key, ttl: 3 * TTL.day, fresh: fresh) {
            try await self.loadShop(cfg, place: place)
        }
        return r.value
    }

    private func loadShop(_ cfg: Config, place: UserPlace) async throws -> Shop {
        let coords: [String: Any] = ["latitude": place.latitude, "longitude": place.longitude]
        func ask(_ allowCanonicalFallback: Bool) async throws -> [J] {
            let d = try await gql(cfg, zip: place.zip, "ShopCollectionScoped", [
                "retailerSlug": cfg.slug, "postalCode": place.zip, "coordinates": coords,
                "addressId": NSNull(), "allowCanonicalFallback": allowCanonicalFallback,
            ])
            return d["shopCollection"]["shops"].array
        }
        // Ask for a store that actually serves this ZIP first. Instacart's canonical fallback
        // answers with one national storefront (Walmart always returns the same store in
        // Antioch, CA) whose prices are not this shopper's prices, so only accept it as a last
        // resort and mark it.
        var canonical = false
        var shops = try await ask(false)
        if shops.isEmpty {
            shops = try await ask(true)
            canonical = !shops.isEmpty
        }
        guard !shops.isEmpty else { return Shop(none: true) }
        var chosen: J?
        for st in cfg.prefer {
            if let s = shops.first(where: { $0["serviceType"].string == st }) { chosen = s; break }
        }
        let shop = chosen ?? shops[0]
        var out = Shop()
        out.canonical = canonical
        out.shopId = shop["id"].string ?? ""
        out.serviceType = shop["serviceType"].string ?? ""
        out.serviceTypes = Array(Set(shops.compactMap { $0["serviceType"].string }))
        out.retailerId = shop["retailerId"].string ?? ""
        out.locationId = shop["retailerLocationId"].string ?? ""
        out.name = shop["retailer"]["name"].string ?? cfg.slug
        out.logo = shop["retailer"]["viewSection"]["logoImage"]["url"].string
        if let loc = try? await gql(cfg, zip: place.zip, "GetRetailerLocationAddress", ["id": out.locationId]) {
            let rl = loc["retailerLocation"]
            out.latitude = rl["coordinates"]["latitude"].double
            out.longitude = rl["coordinates"]["longitude"].double
            let a = rl["viewSection"]["address"]
            let parts = [a["lineOneString"].text, a["lineTwoString"].text].compactMap { $0 }
            out.address = parts.isEmpty ? nil : parts.joined(separator: ", ")
            out.label = rl["viewSection"]["locationDisplayNameString"].text
            if let la = out.latitude, let lo = out.longitude {
                out.distance = Geo.miles((place.latitude, place.longitude), (la, lo))
            }
        }
        if let info = try? await gql(cfg, zip: place.zip, "StoreInfoModalContentQuery", [
            "shopId": out.shopId, "addressId": "0", "postalCode": place.zip, "coordinates": coords,
            "retailerId": out.retailerId, "fetchReturnPolicy": false, "skipFeeDisclosure": true,
        ]) {
            out.priceNote = info.first("priceTransparencyTextString")?.string
        }
        return out
    }

    // MARK: search

    func search(_ cfg: Config, retailerId: String, query: String, place: UserPlace, limit: Int = 36) async throws -> (items: [Product], location: StoreLocation?, message: String?) {
        let shop = try await resolveShop(cfg, place: place)
        if shop.none { return ([], nil, "No store nearby") }
        let s = try await session(cfg, zip: place.zip)
        let zone = s.zone ?? "974"
        let vars: [String: Any] = [
            "action": NSNull(), "query": query, "pageViewId": UUID().uuidString.lowercased(), "elevatedProductId": NSNull(),
            "searchSource": "search", "filters": [Any](), "disableReformulation": false, "disableLlm": true, "forceInspiration": false,
            "orderBy": "bestMatch", "clusterId": NSNull(), "includeDebugInfo": false, "clusteringStrategy": NSNull(),
            "contentManagementSearchParams": ["itemGridColumnCount": 4], "shopId": shop.shopId, "postalCode": place.zip,
            "zoneId": zone, "first": min(limit, 60),
        ]
        let d = try await gql(cfg, zip: place.zip, "SearchResultsPlacements", vars)
        var order: [String] = []
        var seen = Set<String>()
        var byId: [String: J] = [:]
        var sponsored = Set<String>()
        for p in d["searchResultsPlacements"]["placements"].array {
            let c = p["content"]
            guard (c["__typename"].string ?? "").hasSuffix("ItemGrid") else { continue }
            for idj in c["itemIds"].array {
                if let id = idj.string, !seen.contains(id) { seen.insert(id); order.append(id) }
            }
            for it in c["items"].array where !it["price"].isNull {
                if let id = it["id"].string { byId[id] = it }
            }
            for f in c["featuredProducts"].array {
                if let pid = f["productId"].string { sponsored.insert(pid) }
            }
        }
        let ids = Array(order.prefix(limit))
        let missing = ids.filter { byId[$0] == nil }
        var start = 0
        while start < missing.count {
            let chunk = Array(missing[start..<min(start + 40, missing.count)])
            let r = try await gql(cfg, zip: place.zip, "Items", ["ids": chunk, "shopId": shop.shopId, "zoneId": zone, "postalCode": place.zip])
            for it in r["items"].array { if let id = it["id"].string { byId[id] = it } }
            start += 40
        }
        let basis: PriceBasis = shop.canonical
            ? .national
            : (shop.serviceType == "instore" || (shop.priceNote ?? "").lowercased().contains("no markup") ? .shelf : .online)
        var items: [Product] = []
        for (i, id) in ids.enumerated() {
            guard let x = byId[id] else { continue }
            if let p = parseItem(x, cfg: cfg, retailerId: retailerId, rank: i, total: ids.count, sponsored: sponsored.contains(x["productId"].string ?? "-"), basis: basis) {
                items.append(p)
            }
        }
        let location = StoreLocation(
            retailerId: retailerId, name: shop.label ?? shop.name, address: shop.address, latitude: shop.latitude, longitude: shop.longitude,
            distanceMiles: shop.distance, shopId: shop.shopId, serviceType: shop.serviceType,
            priceNote: shop.serviceType == "instore" ? "In-store shelf prices" : shop.priceNote, storeCode: nil, retailerNumericId: shop.retailerId, locationId: shop.locationId
        )
        return (items, location, nil)
    }

    private static let perUnitRx = Rx("\\$\\s*(\\d+(?:\\.\\d+)?)\\s*/\\s*([a-z ]+)")

    private func sectionsText(_ f: J) -> String? {
        let t = f["sections"].array.compactMap { $0["content"].string ?? $0["text"].string }.joined()
        return t.isEmpty ? nil : t
    }

    private func parseItem(_ x: J, cfg: Config, retailerId: String, rank: Int, total: Int, sponsored: Bool, basis: PriceBasis) -> Product? {
        let pv = x["price"]["viewSection"]
        let card = pv["itemCard"]
        let badge = pv["badge"]
        let priceStr = card["priceString"].string ?? ""
        let suffix = card["priceSuffixString"].string ?? ""
        let isEst = (priceStr + " " + suffix).lowercased().contains("est")
        var price = ProductFactory.money(priceStr)
        var soldBy: SoldBy = .each
        var estEach: Double?
        var estPkg: Double?
        let perText = card["pricingUnitString"].string ?? card["pricePerUnitString"].string ?? ""
        var perLb: Double?
        if let m = Self.perUnitRx.match(perText), let v = Double(m[1] ?? ""), let u = m[2]?.trimmingCharacters(in: .whitespaces).lowercased(), ["lb", "lbs", "pound"].contains(u) {
            soldBy = .lb
            perLb = v
            if isEst && (priceStr + suffix).lowercased().contains("each") { estEach = price } else if isEst { estPkg = price }
            price = v
        }
        var regular = ProductFactory.money(card["plainFullPriceString"].string ?? card["fullPriceString"].string)
        if soldBy == .lb, let r = regular {
            if let pkg = estPkg ?? estEach, pkg > 0, let pl = perLb { regular = (r * (pl / pkg) * 100).rounded() / 100 } else { regular = nil }
        }
        var memberPrice: Double?
        var memberLabel: String?
        if let loyalty = ProductFactory.money(sectionsText(card["loyaltyPriceStringFormatted"])),
           let nonLoyalty = ProductFactory.money(sectionsText(card["nonLoyaltyPriceStringFormatted"])), loyalty < nonLoyalty {
            memberPrice = loyalty
            memberLabel = card["loyaltyProgramSmallLabelString"].text ?? card["loyaltyProgramLabelString"].text ?? "Card price"
            price = nonLoyalty
        }
        let tp = x["viewSection"]["trackingProperties"]
        let saleInd = tp["on_sale_ind"]
        var promos: [String] = []
        if let o = badge["offerLabelString"].text, !Rx("^\\d+% off$").test(o) { promos.append(o) }
        for ip in pv["itemPromotions"].array { if let o = ip["offerLabelString"].text { promos.append(o) } }
        if saleInd["buy_one_get_one"].bool == true && !promos.contains(where: { $0.lowercased().contains("buy 1") || $0.lowercased().contains("bogo") }) {
            promos.append("Buy 1, get 1 free")
        }
        var seenPromo = Set<String>()
        promos = promos.filter { seenPromo.insert($0).inserted }
        let img = x["viewSection"]["itemImage"]
        let image = img["templateUrl"].string.map { $0.replacingOccurrences(of: "{width=}x{height=}", with: "300x300") } ?? img["url"].string
        let slug = x["evergreenUrl"].string
        let url: String = {
            guard let slug, let enc = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
                return "\(cfg.base)/store/\(cfg.slug)/s?k=\((x["name"].string ?? "").urlQueryEncoded)"
            }
            return cfg.base.contains("www.instacart.com") ? "https://www.instacart.com/products/\(enc)?retailerSlug=\(cfg.slug)" : "\(cfg.base)/store/\(cfg.slug)/products/\(enc)"
        }()
        var tags = x["tags"].array.compactMap { $0.string }
        if tp["element_details"]["item_tags"].array.contains(where: { $0.string == "store_brand" }) && !tags.contains("storeBrand") { tags.append("storeBrand") }
        let name = x["name"].string ?? ""
        if name.lowercased().contains("organic") { tags.append("organic") }
        return ProductFactory.make(ProductInput(
            storeId: retailerId,
            id: x["productId"].string ?? x["id"].string ?? UUID().uuidString,
            name: name,
            brand: x["brandName"].string,
            sizeText: x["size"].string,
            price: price,
            regularPrice: regular,
            memberPrice: memberPrice,
            memberLabel: memberLabel,
            soldBy: soldBy,
            estEach: estEach,
            estPkg: estPkg,
            onSale: saleInd["on_sale"].bool == true || regular != nil,
            promo: promos.isEmpty ? nil : promos.joined(separator: " · "),
            image: URL.from(image),
            url: URL(string: url),
            stock: x["availability"]["stockLevel"].string,
            available: x["availability"]["available"].bool != false,
            category: tp["product_category_name"].string,
            tags: tags,
            sponsored: sponsored,
            rank: rank,
            total: total,
            priceBasis: basis
        ))
    }
}
