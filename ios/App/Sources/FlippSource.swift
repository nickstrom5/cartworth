import Foundation

/// Flipp: weekly circulars for every merchant near a ZIP/postal code, item search, and item details.
/// Flyer item lists lack price qualifiers ("2/", "/lb", "BOGO", "for U"), so details are fetched once per
/// item (they never change for a given flyer item) and kept on disk.
actor FlippSource {
    static let shared = FlippSource()
    private let api = "https://backflipp.wishabi.com/flipp"
    private let http = HTTP.shared

    struct FlyerItem: Codable, Hashable {
        var id: Int
        var flyerId: Int
        var name: String
        var brand: String
        var price: String?
        var discount: Double?
        var image: String?
        var validFrom: Date?
        var validTo: Date?
    }

    struct Detail: Codable, Hashable {
        var description: String?
        var pre: String?
        var priceText: String?
        var post: String?
        var story: String?
        var original: Double?
        var current: Double?
        var disclaimer: String?
        var dollarsOff: Double?
        var percentOff: Double?
        var externalCategory: String?
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static func date(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s)
    }

    private static func https(_ s: String?) -> String? {
        s.map { $0.hasPrefix("http://") ? "https://" + $0.dropFirst(7) : $0 }
    }

    static func locale(for postal: String) -> String {
        postal.range(of: "^[A-Za-z]\\d[A-Za-z]", options: .regularExpression) != nil ? "en-ca" : "en-us"
    }

    func flyers(postal: String, fresh: Bool = false) async throws -> (flyers: [Flyer], stale: Bool) {
        let code = postal.replacingOccurrences(of: " ", with: "").uppercased()
        let r = try await Cache.shared.value("flipp:flyers:\(code)", ttl: 3 * TTL.hour, fresh: fresh) {
            let url = URL(string: "https://backflipp.wishabi.com/flipp/flyers?locale=\(FlippSource.locale(for: code))&postal_code=\(code)")!
            let d = try await HTTP.shared.getJSON(url, timeout: 16)
            return d["flyers"].array.map { f in
                Flyer(
                    id: f["id"].int ?? 0,
                    merchant: (f["merchant"].string ?? "").trimmingCharacters(in: .whitespaces),
                    retailerId: nil,
                    name: f["name"].string ?? "",
                    validFrom: Self.date(f["valid_from"].string),
                    validTo: Self.date(f["valid_to"].string),
                    thumbnail: URL.from(Self.https(f["thumbnail_url"].string)),
                    categories: f["categories"].array.compactMap { $0.string }
                )
            }
        }
        return (r.value, r.staleError != nil)
    }

    func flyerItems(_ flyerId: Int, fresh: Bool = false) async throws -> [FlyerItem] {
        try await Cache.shared.value("flipp:flyer:\(flyerId)", ttl: 6 * TTL.hour, fresh: fresh, maxStale: 10 * TTL.day) {
            let d = try await HTTP.shared.getJSON(URL(string: "https://backflipp.wishabi.com/flipp/flyers/\(flyerId)?locale=en-us")!, timeout: 20)
            return d["items"].array.compactMap { i -> FlyerItem? in
                guard let name = i["name"].text, name.count > 1, let id = i["id"].int else { return nil }
                return FlyerItem(id: id, flyerId: i["flyer_id"].int ?? flyerId, name: name, brand: i["brand"].string ?? "", price: i["price"].string,
                                 discount: i["discount"].double, image: Self.https(i["cutout_image_url"].string),
                                 validFrom: Self.date(i["valid_from"].string), validTo: Self.date(i["valid_to"].string))
            }
        }.value
    }

    // MARK: details (persistent)

    private var details: [Int: [Int: Detail]] = [:] // flyerId -> itemId -> detail
    private var enrichState: [Int: (done: Int, total: Int, running: Bool)] = [:]

    private func loadDetails(_ flyerId: Int) async -> [Int: Detail] {
        if let d = details[flyerId] { return d }
        let d = await Cache.shared.peek("flipp:details:\(flyerId)", as: [Int: Detail].self) ?? [:]
        details[flyerId] = d
        return d
    }

    private func saveDetails(_ flyerId: Int) async {
        if let d = details[flyerId] { await Cache.shared.put("flipp:details:\(flyerId)", d, ttl: 30 * TTL.day) }
    }

    func detail(itemId: Int, flyerId: Int) async throws -> Detail {
        if let d = await loadDetails(flyerId)[itemId] { return d }
        let j = try await http.getJSON(URL(string: "\(api)/items/\(itemId)?locale=en-us")!, timeout: 15)
        let it = j["item"]
        let d = Detail(
            description: it["description"].text, pre: it["pre_price_text"].text, priceText: it["price_text"].text,
            post: it["post_price_text"].text, story: it["sale_story"].text, original: it["original_price"].double,
            current: it["current_price"].double, disclaimer: it["disclaimer_text"].text,
            dollarsOff: it["dollars_off"].double, percentOff: it["percent_off"].double, externalCategory: it["category"].text
        )
        details[flyerId, default: [:]][itemId] = d
        return d
    }

    func enrichmentProgress(_ flyerIds: [Int]) -> (done: Int, total: Int, running: Bool) {
        var done = 0, total = 0, running = false
        for id in flyerIds {
            if let s = enrichState[id] { done += s.done; total += s.total; running = running || s.running }
        }
        return (done, total, running)
    }

    /// Fetch missing details for a flyer in the background (6 at a time).
    func enrich(_ flyerId: Int, items: [FlyerItem]) async {
        if enrichState[flyerId]?.running == true { return }
        let have = await loadDetails(flyerId)
        let todo = items.filter { have[$0.id] == nil }
        enrichState[flyerId] = (items.count - todo.count, items.count, !todo.isEmpty)
        guard !todo.isEmpty else { return }
        var index = 0
        while index < todo.count {
            let batch = Array(todo[index..<min(index + 6, todo.count)])
            await withTaskGroup(of: Void.self) { group in
                for item in batch {
                    group.addTask { _ = try? await self.detail(itemId: item.id, flyerId: flyerId) }
                }
            }
            index += batch.count
            let s = enrichState[flyerId] ?? (0, items.count, true)
            enrichState[flyerId] = (min(items.count, s.done + batch.count), items.count, true)
            if index % 60 == 0 { await saveDetails(flyerId) }
        }
        await saveDetails(flyerId)
        enrichState[flyerId] = (items.count, items.count, false)
    }

    func storedDetails(_ flyerId: Int) async -> [Int: Detail] { await loadDetails(flyerId) }

    // MARK: search

    struct SearchHit: Codable, Hashable {
        var item: FlyerItem
        var merchant: String
        var detail: Detail
    }

    func search(_ query: String, postal: String) async throws -> [SearchHit] {
        let code = postal.replacingOccurrences(of: " ", with: "").uppercased()
        return try await Cache.shared.value("flipp:search:\(code):\(query.lowercased())", ttl: TTL.hour) {
            let url = URL(string: "https://backflipp.wishabi.com/flipp/items/search?locale=\(FlippSource.locale(for: code))&postal_code=\(code)&q=\(query.urlQueryEncoded)")!
            let d = try await HTTP.shared.getJSON(url, timeout: 15)
            return d["items"].array.compactMap { i -> SearchHit? in
                guard let name = i["name"].text, let merchant = i["merchant_name"].text else { return nil }
                let item = FlyerItem(id: i["flyer_item_id"].int ?? i["id"].int ?? 0, flyerId: i["flyer_id"].int ?? 0, name: name, brand: "",
                                     price: i["current_price"].string, discount: nil, image: Self.https(i["clean_image_url"].string ?? i["clipping_image_url"].string),
                                     validFrom: Self.date(i["valid_from"].string), validTo: Self.date(i["valid_to"].string))
                let detail = Detail(description: nil, pre: i["pre_price_text"].text, priceText: nil, post: i["post_price_text"].text,
                                    story: i["sale_story"].text, original: i["original_price"].double, current: i["current_price"].double,
                                    disclaimer: nil, dollarsOff: nil, percentOff: nil,
                                    externalCategory: [i["_L1"].text, i["_L2"].text].compactMap { $0 }.joined(separator: " / ").nilIfEmpty)
                return SearchHit(item: item, merchant: merchant.trimmingCharacters(in: .whitespaces), detail: detail)
            }
        }.value
    }

    // MARK: normalization

    private static let couponPrefixRx = Rx("^\\((\\d)\\)\\s*", caseInsensitive: false)
    /// Two capture groups, exactly as src/adapters/flipp.js has them: (1) whole dollars, (2) cents.
    private static let offStoryRx = Rx("^\\s*(?:\\$\\s*(\\d+(?:\\.\\d+)?)|(\\d+)\\s*¢)\\s*off\\b")
    private static let withoutCouponRx = Rx("(?:without coupon|reg(?:ular)?\\.?(?: price)?)\\s*\\$?\\s*(\\d+(?:\\.\\d{2})?)")
    private static let multiPreRx = Rx("^(\\d+)\\s*/?\\s*(?:for)?\\s*$|^(\\d+)\\s*(?:/|for)")

    static func deal(item raw: FlyerItem, detail det: Detail?, retailerId: String, merchant: String, now: Date = Date()) -> Deal {
        var price = det?.current ?? raw.price.flatMap { Double($0) }
        let pre = det?.pre ?? ""
        let post = det?.post ?? ""
        let story = det?.story ?? ""
        let disclaimer = det?.disclaimer ?? ""
        let from = raw.validFrom
        let to = raw.validTo
        let week: AdWeek = (from ?? .distantPast) > now ? .next : .current
        let category = GroceryCategory.classify(name: raw.name, description: det?.description, external: det?.externalCategory)

        // "$X OFF (n)" coupon sections: the number is the discount, not a price
        let couponPrefix = couponPrefixRx.match(raw.name)
        let offMatch = offStoryRx.match(story)
        let offStory = offMatch != nil
        let isCouponOff = offStory || (det?.dollarsOff != nil && det?.current != nil && abs((det?.dollarsOff ?? 0) - (det?.current ?? -1)) < 0.001)
        if isCouponOff || (couponPrefix != nil && det == nil) {
            var off = det?.dollarsOff
            if off == nil, let om = offMatch {
                // Read the amount from the captured group only. Stripping non-digits from the whole
                // sale story concatenated the trailing buy-count onto the discount: "$1 OFF (3)"
                // became $13 off, and "75¢ OFF (1)" became $7.51 off.
                if let dollars = om[1], let v = Double(dollars) { off = v }
                else if let cents = om[2], let v = Double(cents) { off = v / 100 }
            }
            let need = Int(couponPrefix?[1] ?? "") ?? Int(Rx("\\((\\d)\\)").match(story)?[1] ?? "") ?? 1
            let offText: String = {
                guard let off else { return "Digital coupon" }
                return off < 1 ? "\(Int((off * 100).rounded()))¢ off" : "\(Money.plain(off)) off"
            }()
            return Deal(
                id: "flipp-\(raw.id)", source: "flipp", flippId: raw.id, flyerId: raw.flyerId, retailerId: retailerId, merchant: merchant,
                name: couponPrefixRx.replace(raw.name, with: ""), brand: raw.brand, description: det?.description,
                imageURL: URL.from(raw.image), price: nil, qty: need, each: nil, perLb: false,
                priceText: off == nil ? "Digital coupon" : (need > 1 ? "\(offText) when you buy \(need)" : offText),
                regular: nil, regularText: nil, memberText: nil, pctOff: det?.percentOff.map { Int($0.rounded()) }, story: nil,
                terms: off.map { DealTerms(kind: .save, text: story, qty: need > 1 ? need : nil, save: $0) },
                needsCoupon: true, needsCard: false, limit: nil, mustBuy: need > 1 ? need : nil, disclaimer: disclaimer.nilIfEmpty,
                validFrom: from, validTo: to, week: week, category: category, enriched: det != nil, coupon: true, url: nil
            )
        }

        let perLb = post.lowercased().contains("lb") || post.lowercased().contains("pound") || (det?.priceText ?? "").lowercased().contains("lb")
        var qty = 1
        if let m = multiPreRx.match(pre), let n = Int(m[1] ?? m[2] ?? ""), n > 1 { qty = n }
        let all = "\(pre) \(post) \(story) \(disclaimer)".lowercased()
        let needsCoupon = all.contains("for u") || all.contains("digital") || all.contains("coupon") || all.contains("clip")
        let needsCard = "\(pre) \(post) \(story)".lowercased().contains("card")
        if price == 0 { price = nil }
        let each = price.map { ($0 / Double(qty) * 100).rounded() / 100 }
        var regular = det?.original
        if regular == nil, let m = withoutCouponRx.match(disclaimer), let v = Double(m[1] ?? "") { regular = v }
        var pctOff: Int?
        if let r = regular, let e = each, r > e { pctOff = Int(((1 - e / r) * 100).rounded()) }
        else if let p = det?.percentOff { pctOff = Int(p.rounded()) }
        else if let d = raw.discount, d > 0, d < 95 { pctOff = Int(d.rounded()) }
        let terms = DealParser.parse("\(pre) \(story) \(disclaimer)", basePrice: each)
        if pctOff == nil, let t = terms, t.kind == .bogo || t.kind == .bxgy, let p = t.pct { pctOff = Int(p) }
        var priceText = ""
        if let price {
            let m = String(format: "$%.2f", price)
            priceText = qty > 1 ? "\(qty) for \(m)" : m
            if perLb { priceText += "/lb" } else if post.lowercased().contains("ea") && qty == 1 { priceText += " ea" }
        } else if !story.isEmpty {
            priceText = story.count > 3 && story == story.uppercased() ? story.prefix(1) + story.dropFirst().lowercased() : story
        }
        return Deal(
            id: "flipp-\(raw.id)", source: "flipp", flippId: raw.id, flyerId: raw.flyerId, retailerId: retailerId, merchant: merchant,
            name: raw.name, brand: raw.brand, description: det?.description, imageURL: URL.from(raw.image), price: price, qty: qty,
            each: each, perLb: perLb, priceText: priceText, regular: regular, regularText: nil, memberText: nil,
            pctOff: (pctOff ?? 0) > 0 && (pctOff ?? 0) < 100 ? pctOff : nil, story: story.nilIfEmpty, terms: terms,
            needsCoupon: needsCoupon, needsCard: needsCard, limit: terms?.limit, mustBuy: terms?.mustBuy,
            disclaimer: disclaimer.nilIfEmpty, validFrom: from, validTo: to, week: week, category: category,
            enriched: det != nil, coupon: false, url: nil
        )
    }
}
