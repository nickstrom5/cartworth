import Foundation
import SwiftData

/// One observed price for a product at a store (recorded when it changes, or at most every 12h).
@Model
final class PricePoint {
    var key: String
    var storeId: String
    var name: String
    var price: Double
    var regular: Double?
    var unitPerBase: Double?
    var dim: String?
    var onSale: Bool
    var at: Date

    init(key: String, storeId: String, name: String, price: Double, regular: Double?, unitPerBase: Double?, dim: String?, onSale: Bool, at: Date = Date()) {
        self.key = key
        self.storeId = storeId
        self.name = name
        self.price = price
        self.regular = regular
        self.unitPerBase = unitPerBase
        self.dim = dim
        self.onSale = onSale
        self.at = at
    }
}

/// Price-book entry: an item you buy often, tracked across your stores.
@Model
final class WatchItem {
    var id: UUID
    var query: String
    var label: String
    var include: [String]
    var exclude: [String]
    var dim: String?
    var displayUnit: String?
    var target: Double?
    var createdAt: Date
    var lastChecked: Date?
    var resultData: Data?
    var lastError: String?
    var lastAlertAt: Date?

    init(query: String, label: String? = nil, include: [String] = [], exclude: [String] = [], dim: String? = nil, displayUnit: String? = nil, target: Double? = nil) {
        id = UUID()
        self.query = query
        self.label = label ?? query
        self.include = include
        self.exclude = exclude
        self.dim = dim
        self.displayUnit = displayUnit
        self.target = target
        createdAt = Date()
    }

    var result: WatchResult? {
        get { resultData.flatMap { try? JSONDecoder().decode(WatchResult.self, from: $0) } }
        set { resultData = try? JSONEncoder().encode(newValue) }
    }
}

struct WatchResult: Codable, Hashable {
    struct StoreBest: Codable, Hashable {
        var key: String
        var name: String
        var size: String
        var price: Double
        var regularPrice: Double?
        var onSale: Bool
        var promo: String?
        var unitPerBase: Double
        var est: Bool
        var soldBy: SoldBy
        var url: URL?
        var imageURL: URL?
        var priceBasis: PriceBasis
        /// Set when the store did not answer and its saved copy was used: when it was fetched.
        var savedAt: Date? = nil
    }
    var dim: String?
    var stores: [String: StoreBest]
    var errors: [String: String]
    var bestStoreId: String?
    var checkedAt: Date
}

/// Unit price of the best store at each check (for trend lines).
@Model
final class WatchPoint {
    var watchId: UUID
    var storeId: String
    var name: String
    var price: Double
    var unitPerBase: Double
    var onSale: Bool
    var at: Date

    init(watchId: UUID, storeId: String, name: String, price: Double, unitPerBase: Double, onSale: Bool, at: Date) {
        self.watchId = watchId
        self.storeId = storeId
        self.name = name
        self.price = price
        self.unitPerBase = unitPerBase
        self.onSale = onSale
        self.at = at
    }
}

/// Shopping list line.
@Model
final class ListEntry {
    var id: UUID
    var text: String
    var qty: Int
    var done: Bool
    var addedAt: Date
    var sort: Int
    /// Optional exact product (only costed at its store)
    var pinnedData: Data?
    /// Recipe it came from, if any
    var recipe: String?
    /// Marked "already have it" (pantry)
    var have: Bool

    init(text: String, qty: Int = 1, sort: Int = 0, pinned: PinnedProduct? = nil, recipe: String? = nil) {
        id = UUID()
        self.text = text
        self.qty = qty
        done = false
        addedAt = Date()
        self.sort = sort
        pinnedData = pinned.flatMap { try? JSONEncoder().encode($0) }
        self.recipe = recipe
        have = false
    }

    var pinned: PinnedProduct? {
        get { pinnedData.flatMap { try? JSONDecoder().decode(PinnedProduct.self, from: $0) } }
        set { pinnedData = newValue.flatMap { try? JSONEncoder().encode($0) } }
    }
}

struct PinnedProduct: Codable, Hashable {
    var storeId: String
    var key: String
    var name: String
    var size: String
    var price: Double
    var soldBy: SoldBy
    var url: URL?
    var imageURL: URL?
}

/// Favorite brand or ingredient whose sales you want to hear about.
@Model
final class Favorite {
    var id: UUID
    var term: String
    var createdAt: Date
    /// Deal ids already announced (so alerts don't repeat)
    var seenDealIds: [String]

    init(term: String) {
        id = UUID()
        self.term = term
        createdAt = Date()
        seenDealIds = []
    }
}

@Model
final class RecentSearch {
    @Attribute(.unique) var q: String
    var count: Int
    var lastAt: Date

    init(q: String) {
        self.q = q
        count = 1
        lastAt = Date()
    }
}

enum Persistence {
    static let schema = Schema([PricePoint.self, WatchItem.self, WatchPoint.self, ListEntry.self, Favorite.self, RecentSearch.self])

    static let container: ModelContainer = {
        do {
            return try ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema))
        } catch {
            // A corrupted store shouldn't brick the app: fall back to memory and keep going.
            return try! ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true))
        }
    }()
}
