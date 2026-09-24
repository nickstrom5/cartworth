import Foundation

/// Trader Joe's: nearest store (the Brandify locator traderjoes.com uses) + product search (GraphQL).
actor TraderJoesSource {
    static let shared = TraderJoesSource()
    private let base = "https://www.traderjoes.com"
    private let http = HTTP.shared

    struct Store: Codable, Hashable {
        var none = false
        var id = ""
        var name = ""
        var address: String?
        var latitude: Double?
        var longitude: Double?
        var distance: Double?
    }

    func resolveStore(place: UserPlace, fresh: Bool = false) async throws -> Store {
        try await Cache.shared.value("tj:store:\(place.zip)", ttl: 7 * TTL.day, fresh: fresh) {
            let body: [String: Any] = [
                "request": [
                    "appkey": "8BC3433A-60FC-11E3-991D-B2EE0C70A832",
                    "formdata": [
                        "geoip": false, "dataview": "store_default", "limit": 5,
                        "geolocs": ["geoloc": [["addressline": place.zip, "country": "US", "latitude": "", "longitude": ""]]],
                        "searchradius": "100", "where": ["warehouse": ["distinctfrom": "1"]],
                    ] as [String: Any],
                ] as [String: Any],
            ]
            let r = try await HTTP.shared.postJSON(URL(string: "https://alphaapi.brandify.com/rest/locatorsearch")!, body: body, timeout: 15)
            guard r.ok else { throw HTTPError(status: r.status, message: "Trader Joe’s store lookup failed") }
            let list = try r.json()["response"]["collection"].array
            let stores: [Store] = list.map { c in
                let lat = c["latitude"].double
                let lng = c["longitude"].double
                return Store(
                    none: false,
                    id: c["clientkey"].string ?? "",
                    name: "Trader Joe’s " + (c["name"].string ?? "").replacingOccurrences(of: "\\s*\\(\\d+\\)\\s*$", with: "", options: .regularExpression),
                    address: [c["address1"].text, c["city"].text, c["state"].text].compactMap { $0 }.joined(separator: ", "),
                    latitude: lat, longitude: lng,
                    distance: lat != nil && lng != nil ? Geo.miles((place.latitude, place.longitude), (lat!, lng!)) : nil
                )
            }.sorted { ($0.distance ?? 999) < ($1.distance ?? 999) }
            return stores.first ?? Store(none: true)
        }.value
    }

    private static let query = """
    query SearchProducts($search: String, $pageSize: Int, $currentPage: Int, $storeCode: String = "701", $availability: String = "1", $published: String = "1") {
      products(search: $search, filter: {store_code: {eq: $storeCode}, published: {eq: $published}, availability: {match: $availability}}, pageSize: $pageSize, currentPage: $currentPage) {
        items { category_hierarchy { id name } primary_image sku url_key name item_title sales_size sales_uom_description availability new_product promotion price_range { minimum_price { final_price { currency value } } } retail_price }
        total_count
      }
    }
    """

    private static let glueRx = Rx("([a-z]{3,})([A-Z][a-z]{2,})", caseInsensitive: false)

    func search(query: String, retailerId: String, place: UserPlace, limit: Int = 36) async throws -> (items: [Product], location: StoreLocation?, message: String?) {
        let store = try await resolveStore(place: place)
        if store.none { return ([], nil, "No Trader Joe’s nearby") }
        let body: [String: Any] = [
            "operationName": "SearchProducts",
            "variables": ["storeCode": store.id, "availability": "1", "published": "1", "search": query, "currentPage": 1, "pageSize": min(limit, 60)],
            "query": Self.query,
        ]
        let r = try await http.postJSON(URL(string: "\(base)/api/graphql")!, body: body, timeout: 15)
        guard r.ok else { throw HTTPError(status: r.status, message: "Trader Joe’s search failed (\(r.status))") }
        let d = try r.json()
        let list = d["data"]["products"]["items"].array
        var items: [Product] = []
        for (i, x) in list.enumerated() {
            // TJ's titles sometimes glue two lines together ("Greek YogurtHoney Made with Whole Milk")
            let title = Self.glueRx.replace(x["item_title"].string ?? x["name"].string ?? "", with: "$1 $2")
            let uom = (x["sales_uom_description"].string ?? "").trimmingCharacters(in: .whitespaces)
            let sizeNum = x["sales_size"].double
            let isPerLb = uom.lowercased() == "lb" && sizeNum == 1
            let sizeText = sizeNum.map { "\(Units.trimNum($0)) \(uom)" } ?? ""
            let price = x["price_range"]["minimum_price"]["final_price"]["value"].double ?? x["retail_price"].double
            let cats = x["category_hierarchy"].array.compactMap { $0["name"].string }.filter { $0 != "Products" }
            let urlKey = x["url_key"].string
            if let p = ProductFactory.make(ProductInput(
                storeId: retailerId, id: x["sku"].string ?? UUID().uuidString, name: title, brand: "Trader Joe’s",
                sizeText: isPerLb ? "per lb" : sizeText, price: price, soldBy: isPerLb ? .lb : .each,
                promo: x["new_product"].string == "1" ? "New" : nil,
                image: URL.from(x["primary_image"].string.map { "\(base)\($0)" }),
                url: URL(string: urlKey.map { "\(base)/home/products/pdp/\($0)" } ?? "\(base)/home/search?q=\(query.urlQueryEncoded)&section=products"),
                category: cats.last, tags: ["storeBrand"] + (title.lowercased().contains("organic") ? ["organic"] : []),
                rank: i, total: list.count, priceBasis: .shelf
            )) {
                items.append(p)
            }
        }
        let loc = StoreLocation(retailerId: retailerId, name: store.name, address: store.address, latitude: store.latitude, longitude: store.longitude, distanceMiles: store.distance, priceNote: "Posted prices (may vary slightly by store)", storeCode: store.id)
        return (items, loc, nil)
    }
}
