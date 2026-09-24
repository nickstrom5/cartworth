import Foundation

/// Whole Foods Market: nearest store by ZIP, store-level search (sale + Prime prices), weekly sales flyer.
actor WholeFoodsSource {
    static let shared = WholeFoodsSource()
    private let base = "https://www.wholefoodsmarket.com"
    private var csrf: String?
    private var csrfAt = Date.distantPast
    private let http = HTTP.shared

    struct Store: Codable, Hashable {
        var none = false
        var id = ""
        var name = ""
        var address: String?
        var latitude: Double?
        var longitude: Double?
        var distance: Double?
        var prime = false
    }

    private func token() async throws -> String {
        if let csrf, Date().timeIntervalSince(csrfAt) < 1800 { return csrf }
        let j = try await http.getJSON(URL(string: "\(base)/api/csrf")!, timeout: 15)
        guard let t = j["token"].string else { throw HTTPError(status: 0, message: "Whole Foods didn’t answer") }
        csrf = t
        csrfAt = Date()
        return t
    }

    func resolveStore(place: UserPlace, fresh: Bool = false) async throws -> Store {
        try await Cache.shared.value("wfm:store:\(place.zip)", ttl: 7 * TTL.day, fresh: fresh) {
            try await self.loadStore(place)
        }.value
    }

    private func loadStore(_ place: UserPlace) async throws -> Store {
        let t = try await token()
        let r = try await http.postJSON(URL(string: "\(base)/api/wwos/location/store/closest")!, body: ["zipCode": place.zip], headers: ["x-amzn-csrf": t], timeout: 15)
        if r.status == 403 {
            csrf = nil
            let t2 = try await token()
            let r2 = try await http.postJSON(URL(string: "\(base)/api/wwos/location/store/closest")!, body: ["zipCode": place.zip], headers: ["x-amzn-csrf": t2], timeout: 15)
            return try await store(from: r2, place: place)
        }
        return try await store(from: r, place: place)
    }

    private func store(from r: HTTPResponse, place: UserPlace) async throws -> Store {
        guard r.ok else { throw HTTPError(status: r.status, message: "Whole Foods store lookup failed (\(r.status))") }
        let d = try r.json()
        guard let id = d["pickupStoreCode"].string ?? d["storeCode"].string else { return Store(none: true) }
        let s = try await http.getJSON(URL(string: "\(base)/api/stores/\(id)/summary")!, timeout: 15)
        let a = s["primaryLocation"]["address"]
        let lat = s["primaryLocation"]["latitude"].double
        let lng = s["primaryLocation"]["longitude"].double
        let cityState = [a["CITY"].text, a["STATE"].text].compactMap { $0 }.joined(separator: ", ")
        return Store(
            none: false,
            id: s["storeId"].string ?? id,
            name: "Whole Foods \(s["displayName"].string ?? "")".trimmingCharacters(in: .whitespaces),
            address: [a["STREET_ADDRESS_LINE1"].text, cityState.isEmpty ? nil : cityState].compactMap { $0 }.joined(separator: ", "),
            latitude: lat, longitude: lng,
            distance: lat != nil && lng != nil ? Geo.miles((place.latitude, place.longitude), (lat!, lng!)) : nil,
            prime: s["storePrimeEligibility"].bool ?? false
        )
    }

    private static let nameSizeRx = Rx("^(.*),\\s*([\\d./]+\\s*[A-Za-z. ]{1,8})$", caseInsensitive: false)

    func search(query: String, retailerId: String, place: UserPlace, limit: Int = 36) async throws -> (items: [Product], location: StoreLocation?, message: String?) {
        let store = try await resolveStore(place: place)
        if store.none { return ([], nil, "No Whole Foods nearby") }
        let url = URL(string: "\(base)/api/search?text=\(query.urlQueryEncoded)&store=\(store.id)&limit=\(min(limit, 60))&offset=0")!
        let d = try await http.getJSON(url, timeout: 15)
        let results = d["results"].array
        let now = Date()
        var items: [Product] = []
        for (i, r) in results.enumerated() {
            let rawName = r["name"].string ?? ""
            var name = rawName
            var sizeText = ""
            if let m = Self.nameSizeRx.match(rawName) {
                name = m[1] ?? rawName
                sizeText = m[2] ?? ""
            }
            // Calendar days written as UTC: "2026-12-24T23:59:59Z" is all of Christmas Eve (SaleDates.wallClock).
            let saleStart = SaleDates.wallClock(r["saleStartDate"].string)
            let saleEnd = SaleDates.wallClock(r["saleEndDate"].string)
            let saleActive = r["salePrice"].double != nil && (saleEnd == nil || saleEnd! >= now) && (saleStart == nil || saleStart! <= now.addingTimeInterval(12 * 3600))
            let regular = r["regularPrice"].double
            let sale = saleActive ? r["salePrice"].double : nil
            let prime = saleActive ? r["incrementalSalePrice"].double : nil
            let uom = (r["uom"].string ?? "").lowercased()
            let byLb = uom.contains("lb") || (sizeText.isEmpty && rawName.lowercased().contains("per lb"))
            var promo: [String] = []
            if saleActive, let mult = r["saleMultiple"].int, mult > 1, let sp = sale { promo.append("\(mult) for \(Money.full(sp * Double(mult)))") }
            if let pm = r["primeMultiple"].int, pm > 1, let pp = prime { promo.append("Prime: \(pm) for \(Money.full(pp * Double(pm)))") }
            let brand = r["brand"].string.map { ProductFactory.titleCase($0) }
            var tags: [String] = []
            if r["isLocal"].bool == true { tags.append("local") }
            if rawName.lowercased().contains("organic") { tags.append("organic") }
            if (r["brand"].string ?? "").contains("365") { tags.append("storeBrand") }
            let slug = r["slug"].string ?? UUID().uuidString
            if let p = ProductFactory.make(ProductInput(
                storeId: retailerId, id: slug, name: name, brand: brand, sizeText: byLb ? "per lb" : sizeText,
                price: sale ?? regular, regularPrice: sale != nil ? regular : nil, memberPrice: prime, memberLabel: "Prime",
                soldBy: byLb ? .lb : .each, onSale: sale != nil, promo: promo.isEmpty ? nil : promo.joined(separator: " · "),
                saleEnds: saleActive ? saleEnd : nil, image: URL.from(r["imageThumbnail"].string), url: URL(string: "\(base)/product/\(slug)"),
                tags: tags, rank: i, total: results.count, priceBasis: .shelf
            )) {
                items.append(p)
            }
        }
        let loc = StoreLocation(retailerId: retailerId, name: store.name, address: store.address, latitude: store.latitude, longitude: store.longitude, distanceMiles: store.distance, priceNote: "Store shelf prices; Prime price shown separately", storeCode: store.id)
        return (items, loc, nil)
    }

    struct SaleItem: Codable, Hashable {
        var id: String
        var name: String
        var brand: String
        var description: String?
        var priceText: String
        var regularText: String
        var memberText: String
        var image: String?
        var validFrom: Date?
        var validTo: Date?
        var disclaimer: String?
    }

    /// Weekly sales flyer promotions (from the sales page's embedded data).
    func sales(place: UserPlace) async throws -> (storeId: String, storeName: String, items: [SaleItem])? {
        let store = try await resolveStore(place: place)
        if store.none { return nil }
        let items = try await Cache.shared.value("wfm:sales:v2:\(store.id)", ttl: 6 * TTL.hour) {
            let html = try await HTTP.shared.request(URL(string: "https://www.wholefoodsmarket.com/sales-flyer?store-id=\(store.id)")!, headers: ["Accept": "text/html"], timeout: 20).text
            guard let m = Rx("<script id=\"__NEXT_DATA__\"[^>]*>([\\s\\S]*?)</script>", caseInsensitive: false).match(html), let raw = m[1] else {
                throw HTTPError(status: 0, message: "Whole Foods sales page changed")
            }
            let j = try J.parse(Data(raw.utf8))
            return j["props"]["pageProps"]["promotions"].array.map { p in
                SaleItem(
                    id: "wfm-\(p["promotionId"].string ?? UUID().uuidString)",
                    name: [p["originBrandName"].text, p["productName"].text].compactMap { $0 }.joined(separator: " "),
                    brand: p["originBrandName"].string ?? "",
                    description: [p["packageSize"].text, p["headline"].text].compactMap { $0 }.joined(separator: " · ").nilIfEmpty,
                    priceText: p["salePrice"].string ?? "",
                    regularText: p["regularPrice"].string ?? "",
                    memberText: p["primePrice"].string ?? "",
                    image: p["productImage"].string,
                    validFrom: SaleDates.saleDay(p["startDate"].string, end: false),
                    validTo: SaleDates.saleDay(p["endDate"].string, end: true),
                    disclaimer: p["description"].string
                )
            }
        }.value
        return (store.id, store.name, items)
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
