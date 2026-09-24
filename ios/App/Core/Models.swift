import Foundation

enum SoldBy: String, Codable, Hashable { case each, lb }

/// "shelf" = the in-store price; "online" = an online listing (Instacart) that the store says can differ.
/// Where a price came from, so the UI never implies more precision than we have.
/// shelf = the price in the store nearest you; online = that store's delivery listing, which can
/// run higher; national = a chain-wide listing not tied to your store.
/// Why a unit price is not believable, and by how much.
/// The product's name and its stated package size disagree, and we cannot tell which is stale
/// without asking the retailer. Recorded rather than silently resolved.
struct SizeConflict: Codable, Hashable {
    /// Size as the store stated it for the package ("10 lb").
    var text: String
    /// Size embedded in the product's own name ("5 lb").
    var name: String
}

struct ImplausiblePrice: Codable, Hashable {
    /// How many times the median unit price for the same search this one is.
    var ratio: Double
    var median: Double
    /// "high" or "low". Too cheap is the dangerous direction: it wins the comparison.
    var direction: String
    /// True when the price is below 1/8 of the median and nothing vouches for it (see
    /// `Compare.flagImplausible`), rather than past the hard 1/30 floor. Optional so products
    /// persisted before it existed still decode.
    var unconfirmed: Bool? = nil
}

enum PriceBasis: String, Codable, Hashable {
    case shelf, online, national

    var label: String {
        switch self {
        case .shelf: return "shelf price"
        case .online: return "online price"
        case .national: return "national price"
        }
    }
}

/// A product at one store, normalized so every store compares the same way.
struct Product: Identifiable, Codable, Hashable {
    var key: String
    var storeId: String
    var productId: String
    var name: String
    var brand: String
    var size: String
    var sizeText: String
    var dim: Dim?
    var base: Double?
    var soldBy: SoldBy
    /// Current price of the package (or per lb when soldBy == .lb)
    var price: Double
    var regularPrice: Double?
    var memberPrice: Double?
    var memberLabel: String?
    /// Member price per base unit (when a membership price exists)
    var memberUnit: Double?
    /// Estimated package price for weighed items ("~$4.03/pkg")
    var estPkg: Double?
    var onSale: Bool
    var pctOff: Int?
    var promo: String?
    var saleEnds: Date?
    /// Unit prices keyed by Dim.rawValue
    var unit: [String: UnitPrice]
    var imageURL: URL?
    var url: URL?
    var stock: String?
    var available: Bool
    var category: String?
    var tags: [String]
    var sponsored: Bool
    var rank: Int?
    var total: Int?
    var priceBasis: PriceBasis
    /// Set when this unit price cannot be right given the other results for the same query.
    /// See `Compare.flagImplausible`. Never hides the item; only stops it being the answer.
    var implausible: ImplausiblePrice?
    /// Set when the product's own name and its stated size disagree about how much is in the
    /// package ("Sweet Potatoes, 5 lbs" with a sizeText of "10 lb"). Like `implausible`, it never
    /// hides the item; it only stops it being presented as a store's best price.
    var sizeConflict: SizeConflict?
    /// Where the size the unit price was computed from came from: "perLb" (the retailer's own price
    /// per pound), "stated" (the retailer's structured size, as given), "name" (read out of the
    /// product name) or "derived" (a pack multiplication we worked out). The plausibility guard
    /// trusts a very cheap price only when the retailer stated its basis. Mirrors `sizeSource` in
    /// src/normalize.js.
    var sizeSource: String? = nil

    var id: String { key }

    func unitPrice(_ d: Dim) -> UnitPrice? { unit[d.rawValue] }
    var dims: [Dim] { Dim.allCases.filter { unit[$0.rawValue] != nil } }
    var isOutOfStock: Bool { !available || (stock ?? "").lowercased().contains("out") }
    var isLowStock: Bool { (stock ?? "").lowercased().contains("low") }
    var isStoreBrand: Bool { tags.contains("storeBrand") }
    var isOrganic: Bool { tags.contains("organic") || name.lowercased().contains("organic") }
}

// MARK: - Stores

enum GuestMode: String, Codable, Hashable { case implicit, postal }

enum SourceKind: Codable, Hashable {
    /// Instacart-powered site: the instacart.com marketplace or a retailer's own storefront
    case instacart(base: String, slug: String, guest: GuestMode)
    case wholeFoods
    case traderJoes
    /// Weekly ad only (no price lookups)
    case adsOnly

    var hasPrices: Bool {
        if case .adsOnly = self { return false }
        return true
    }
}

/// A grocery chain the user can compare.
struct Retailer: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var short: String
    var source: SourceKind
    /// Flipp merchant names for weekly-ad matching
    var adMerchants: [String]
    var logoURL: URL?
    var note: String?

    var hasPrices: Bool { source.hasPrices }
}

/// The specific store location we price for a retailer.
struct StoreLocation: Codable, Hashable {
    var retailerId: String
    var name: String
    var address: String?
    var latitude: Double?
    var longitude: Double?
    var distanceMiles: Double?
    var shopId: String?
    var serviceType: String?
    var priceNote: String?
    var storeCode: String?
    var retailerNumericId: String?
    var locationId: String?

    var isShelfPricing: Bool { serviceType == "instore" || (priceNote ?? "").lowercased().contains("no markup") }
}

struct UserPlace: Codable, Hashable {
    var zip: String
    var latitude: Double
    var longitude: Double
    var city: String?
    var state: String?

    var label: String { [city, state].compactMap { $0 }.joined(separator: ", ").isEmpty ? zip : "\([city, state].compactMap { $0 }.joined(separator: ", ")) \(zip)" }
}

// MARK: - Deals

enum AdWeek: String, Codable, Hashable, CaseIterable { case current, next }

struct Deal: Identifiable, Codable, Hashable {
    var id: String
    var source: String
    var flippId: Int?
    var flyerId: Int?
    var retailerId: String
    var merchant: String
    var name: String
    var brand: String
    var description: String?
    var imageURL: URL?
    var price: Double?
    var qty: Int
    var each: Double?
    var perLb: Bool
    var priceText: String
    var regular: Double?
    var regularText: String?
    var memberText: String?
    var pctOff: Int?
    var story: String?
    var terms: DealTerms?
    var needsCoupon: Bool
    var needsCard: Bool
    var limit: Int?
    var mustBuy: Int?
    var disclaimer: String?
    var validFrom: Date?
    var validTo: Date?
    var week: AdWeek
    var category: GroceryCategory
    var enriched: Bool
    var coupon: Bool
    var url: URL?

    /// Ranking score for "best deals first"
    var score: Double {
        var s = Double(pctOff ?? Int(terms?.pct ?? (qty > 1 ? 18 : (story != nil ? 12 : 0))))
        if category.isFood { s += 4 }
        if needsCoupon { s -= 1 }
        if price == nil && story == nil && priceText.isEmpty { s -= 30 }
        return s
    }
}

struct Flyer: Identifiable, Codable, Hashable {
    var id: Int
    var merchant: String
    var retailerId: String?
    var name: String
    var validFrom: Date?
    var validTo: Date?
    var thumbnail: URL?
    var categories: [String]
}

// MARK: - Search results

enum StoreStatus: Equatable {
    case loading
    case ok
    case empty
    case error(String)
    case adsOnly
}

struct StoreResult: Identifiable {
    var retailerId: String
    var status: StoreStatus
    var items: [Product]
    var location: StoreLocation?
    var message: String?
    var cached: Bool = false
    var stale: String?
    var ms: Int = 0
    var id: String { retailerId }
}
