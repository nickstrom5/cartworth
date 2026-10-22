import Foundation
import SwiftData

/// Re-prices watchlist items across the user's stores and keeps a trend.
@MainActor
enum WatchService {
    static func refresh(_ w: WatchItem, fresh: Bool = true, context ctxIn: ModelContext? = nil) async {
        let context = ctxIn ?? Persistence.container.mainContext
        let app = AppState.shared
        guard let place = app.place else { return }
        let chains = app.pricedChains
        let q = Compare.searchText(w.query)
        var byStore: [String: [Product]] = [:]
        var errors: [String: String] = [:]
        var saved: [String: Date] = [:]
        await withTaskGroup(of: StoreResult.self) { group in
            for c in chains { group.addTask { await PriceSearch.search(chain: c, query: q, place: place, limit: app.resultsPerStore, fresh: fresh) } }
            for await r in group {
                if case .error(let m) = r.status { errors[r.retailerId] = m }
                byStore[r.retailerId] = r.items
                if r.stale != nil { saved[r.retailerId] = r.savedAt ?? .distantPast }
                if !r.items.isEmpty { _ = await HistoryStore.shared.statsThenRecord(r.items, record: r.stale == nil) }
            }
        }
        let best = Compare.bestPerStore(query: w.query, results: byStore, dim: w.dim.flatMap(Dim.init(rawValue:)), include: w.include, exclude: w.exclude, prefs: app.prefs)
        let now = Date()
        var stores: [String: WatchResult.StoreBest] = [:]
        var overall: (String, Double)?
        for (storeId, b) in best.stores {
            let p = b.product
            stores[storeId] = .init(key: p.key, name: p.name, size: p.size, price: b.member ? (p.memberPrice ?? p.price) : p.price, regularPrice: p.regularPrice,
                                    onSale: p.onSale, promo: p.promo, unitPerBase: b.perBase, est: b.est, soldBy: p.soldBy, url: p.url, imageURL: p.imageURL, priceBasis: p.priceBasis,
                                    savedAt: saved[storeId])
            // A saved copy is not a new reading: a point dated now would put a days-old price on
            // today in the trend, and a drop it never saw could alert. Port of src/watch.js.
            if saved[storeId] == nil { context.insert(WatchPoint(watchId: w.id, storeId: storeId, name: p.name, price: stores[storeId]!.price, unitPerBase: b.perBase, onSale: p.onSale, at: now)) }
            if overall == nil || b.perBase < overall!.1 { overall = (storeId, b.perBase) }
        }
        if w.dim == nil { w.dim = best.dim?.rawValue }
        if w.displayUnit == nil, let d = best.dim {
            w.displayUnit = Compare.suggestUnit(d, items: byStore.values.flatMap { $0 }.filter { $0.dim == d }, query: w.query).rawValue
        }
        w.result = WatchResult(dim: best.dim?.rawValue, stores: stores, errors: errors, bestStoreId: overall?.0, checkedAt: now)
        w.lastChecked = now
        w.lastError = stores.isEmpty ? (errors.isEmpty ? "No matching products found" : "Stores didn’t answer") : nil
        try? context.save()
    }

    /// Best unit price in display units, and whether it hits the target.
    static func status(_ w: WatchItem, points: [WatchPoint]) -> (best: Double?, du: DisplayUnit?, atTarget: Bool, lowest: Bool) {
        guard let r = w.result, let bestId = r.bestStoreId, let b = r.stores[bestId] else { return (nil, nil, false, false) }
        let du = w.displayUnit.flatMap(DisplayUnit.init(rawValue:)) ?? DisplayUnit.units(for: r.dim.flatMap(Dim.init(rawValue:)) ?? .count).first!
        let value = b.unitPerBase * du.factor
        let atTarget = w.target.map { value <= $0 + 1e-9 } ?? false
        let low = points.map(\.unitPerBase).min()
        // A saved price (the store did not answer) is never "lowest seen": it is not a new reading.
        let lowest = b.savedAt == nil && points.count > 3 && low != nil && b.unitPerBase <= low! + 1e-9
        return (value, du, atTarget, lowest)
    }
}

/// Plans the cheapest trip for a shopping list.
enum TripPlanner {
    struct ItemCost: Hashable {
        var cost: Double
        var est: Bool
        var pinned: Bool
        var product: WatchResult.StoreBest?
        var pinnedProduct: PinnedProduct?
    }

    struct PricedItem: Identifiable, Hashable {
        var id: UUID
        var text: String
        var qty: Int
        var dim: Dim?
        var refBase: Double?
        var perStore: [String: ItemCost]
        var cheapest: String?
    }

    struct Plan: Hashable {
        var stores: [String]
        var total: Double
        var missing: Int
        var assign: [UUID: String]
    }

    struct Result {
        var items: [PricedItem]
        var single: [Plan]
        var pairs: [Plan]
        var triples: [Plan]
        var everything: Plan
        var stores: [String]
        var generatedAt: Date
    }

    @MainActor
    static func price(entries: [ListEntry], fresh: Bool = false) async -> Result {
        let app = AppState.shared
        let chains = app.pricedChains
        let storeIds = chains.map(\.id)
        var priced: [PricedItem] = []
        guard let place = app.place else { return Result(items: [], single: [], pairs: [], triples: [], everything: Plan(stores: [], total: 0, missing: 0, assign: [:]), stores: [], generatedAt: Date()) }
        let items = entries.filter { !$0.done && !$0.have }
        // Two list items at a time, every store in parallel within each
        var index = 0
        while index < items.count {
            let batch = Array(items[index..<min(index + 2, items.count)])
            await withTaskGroup(of: PricedItem.self) { group in
                for e in batch {
                    let text = e.text, qty = e.qty, id = e.id, pinned = e.pinned
                    group.addTask {
                        let q = Compare.searchText(text)
                        let (byStore, saved) = await withTaskGroup(of: StoreResult.self) { g2 in
                            for c in chains { g2.addTask { await PriceSearch.search(chain: c, query: q, place: place, limit: 36, fresh: fresh) } }
                            var found: [String: [Product]] = [:]
                            var savedAt: [String: Date] = [:]
                            for await r in g2 {
                                found[r.retailerId] = r.items
                                if r.stale != nil { savedAt[r.retailerId] = r.savedAt ?? .distantPast }
                            }
                            return (found, savedAt)
                        }
                        return await MainActor.run { priceOne(id: id, text: text, qty: qty, pinned: pinned, byStore: byStore, storeIds: storeIds, prefs: app.prefs, saved: saved) }
                    }
                }
                for await p in group { priced.append(p) }
            }
            index += batch.count
        }
        let order = items.map(\.id)
        priced.sort { (order.firstIndex(of: $0.id) ?? 0) < (order.firstIndex(of: $1.id) ?? 0) }
        return plan(priced, stores: storeIds)
    }

    static func priceOne(id: UUID, text: String, qty: Int, pinned: PinnedProduct?, byStore: [String: [Product]], storeIds: [String], prefs: PricePrefs, saved: [String: Date] = [:]) -> PricedItem {
        let best = Compare.bestPerStore(query: text, results: byStore, prefs: prefs)
        var perStore: [String: ItemCost] = [:]
        var refBase: Double?
        if let dim = best.dim {
            let relevant = Compare.score(query: text, byStore.values.flatMap { $0 }).filter { $0.score >= Match.relevant && $0.product.dim == dim }.map(\.product)
            let ref = Compare.referenceAmount(text: text, items: relevant, dim: dim)
            refBase = ref.base
            for (sid, b) in best.stores {
                let p = b.product
                perStore[sid] = ItemCost(cost: (b.perBase * ref.base * Double(qty) * 100).rounded() / 100, est: b.est, pinned: false,
                                         product: .init(key: p.key, name: p.name, size: p.size, price: b.member ? (p.memberPrice ?? p.price) : p.price, regularPrice: p.regularPrice, onSale: p.onSale, promo: p.promo, unitPerBase: b.perBase, est: b.est, soldBy: p.soldBy, url: p.url, imageURL: p.imageURL, priceBasis: p.priceBasis, savedAt: saved[sid]))
            }
        }
        if let pin = pinned, storeIds.contains(pin.storeId) {
            perStore = [pin.storeId: ItemCost(cost: (pin.price * Double(qty) * 100).rounded() / 100, est: false, pinned: true, product: nil, pinnedProduct: pin)]
        }
        let cheapest = perStore.min { $0.value.cost < $1.value.cost }?.key
        return PricedItem(id: id, text: text, qty: qty, dim: best.dim, refBase: refBase, perStore: perStore, cheapest: cheapest)
    }

    /// Half a cent: smaller than anything a price card can show, so two plans that differ by less
    /// than this read as the same total to the shopper and must not be offered as a choice.
    static let planEpsilon = 0.005

    // MARK: - "saves $X" between two plans

    /// The range a plan's total could really be in, and the price bases it adds up. Port of the
    /// `low` / `high` / `bases` that `evaluate` in src/list.js carries on every plan.
    ///
    /// A plan's total adds up whatever each line was bought at — a shelf price here, an Instacart
    /// listing there, a chain-wide listing for a store that may not be near you at all — and the
    /// option card used to print "saves $X" between two such totals as if every dollar were a
    /// shelf dollar. A dollar saving between two totals the app itself says are not comparable is a
    /// wrong number (the critic's blocker from round 1, "the trip planner must not sum shelf,
    /// online and national dollars into one saves-$Y figure").
    struct Range: Hashable {
        var low: Double
        var high: Double
        var bases: Set<PriceBasis>
    }

    static func range(of plan: Plan, items: [PricedItem]) -> Range {
        var low = 0.0, high = 0.0
        var bases = Set<PriceBasis>()
        for it in items {
            guard let s = plan.assign[it.id], let c = it.perStore[s] else { continue }
            // A pinned product is the shopper's own choice at its package price: treated as shelf,
            // as src/list.js does.
            let basis: PriceBasis = c.pinned ? .shelf : (c.product?.priceBasis ?? .shelf)
            let spread = Compare.basisSpread(basis)
            bases.insert(basis)
            low += c.cost * (1 - spread.below)
            high += c.cost * (1 + spread.above)
        }
        return Range(low: (low * 100).rounded() / 100, high: (high * 100).rounded() / 100, bases: bases)
    }

    /// What may be said about `plan` against a dearer `other`. Port of `planSavingsClaim` in
    /// shared/compare.js — the rules and the sentences are the reference's:
    ///   - an exact "saves $X" only when every line of both plans is a shelf price;
    ///   - otherwise "ahead" when `plan` is cheaper even at the far edge of each total's range,
    ///     and "close" (no saving claimed) when it is not;
    ///   - nil when `plan` is not cheaper at all.
    struct SavingsClaim: Hashable {
        enum Kind: String { case exact, ahead, close }
        var kind: Kind
        var amount: Double?
        var text: String
    }

    static func savingsClaim(_ plan: Plan, over other: Plan, items: [PricedItem]) -> SavingsClaim? {
        guard other.total > plan.total else { return nil }
        let a = range(of: plan, items: items), b = range(of: other, items: items)
        if a.bases.allSatisfy({ $0 == .shelf }) && b.bases.allSatisfy({ $0 == .shelf }) {
            let amount = ((other.total - plan.total) * 100).rounded() / 100
            return amount >= 0.01 ? SavingsClaim(kind: .exact, amount: amount, text: "saves {amount}") : nil
        }
        if a.high < b.low {
            return SavingsClaim(kind: .ahead, text: "cheaper, but some prices are online or chain-wide, so the exact saving is not known")
        }
        return SavingsClaim(kind: .close, text: "about the same once online and chain-wide prices are allowed for")
    }

    /// - Parameter unpriceable: items no store could price at all, which `plan` has already
    ///   removed from `items`. They are still part of the shopper's list, so they still count as
    ///   missing — see the note in `plan`.
    static func evaluate(_ items: [PricedItem], _ set: [String], unpriceable: Int = 0) -> Plan {
        var total = 0.0, missing = 0
        var assign: [UUID: String] = [:]
        for it in items {
            var best: (String, Double)?
            for s in set { if let c = it.perStore[s]?.cost, best == nil || c < best!.1 { best = (s, c) } }
            if let best { total += best.1; assign[it.id] = best.0 } else { missing += 1 }
        }
        // `set` is only what we asked about. A plan may name nothing but the stores it actually
        // buys something at — sending someone to a shop the plan buys nothing at is a wrong
        // instruction, and it is what made the two- and three-store options look different when
        // they were the same trip.
        return Plan(stores: Array(Set(assign.values)).sorted(), total: (total * 100).rounded() / 100, missing: missing + unpriceable, assign: assign)
    }

    /// Drops every stop that costs nothing to skip. Tied prices are common, and a tie must never
    /// buy the shopper an extra drive: if the same total and the same misses survive without a
    /// store, that store comes out of the plan.
    static func trimmed(_ items: [PricedItem], _ plan: Plan, unpriceable: Int = 0) -> Plan {
        var best = plan
        var changed = true
        while changed && best.stores.count > 1 {
            changed = false
            for s in best.stores {
                let trial = evaluate(items, best.stores.filter { $0 != s }, unpriceable: unpriceable)
                if trial.missing <= best.missing && trial.total <= best.total + 1e-9 {
                    best = trial
                    changed = true
                    break
                }
            }
        }
        return best
    }

    /// Strictly better for the shopper: fewer items they can't get, or a total that differs by
    /// something a price card can actually show.
    static func beats(_ a: Plan, _ b: Plan?) -> Bool {
        guard let b else { return true }
        return a.missing != b.missing ? a.missing < b.missing : a.total < b.total - planEpsilon
    }

    static func plan(_ priced: [PricedItem], stores: [String]) -> Result {
        let items = priced.filter { !$0.perStore.isEmpty }
        // An item that no store could price at all is dropped from the optimisation, because
        // there is nothing about it to optimise — but it must still be COUNTED, or the planner
        // quietly prices a basket it is not actually buying.
        //
        // Observed live on a four-item Thanksgiving list in Milwaukee where every lookup came
        // back empty: `items` was empty, `missing` was therefore 0, and the shopper was shown a
        // single "Cherry-pick" card reading **$0.00** with nothing to say the list had not been
        // priced. A total of $0.00 for four groceries is a confidently wrong price, which is the
        // one thing this app must never produce.
        let unpriceable = priced.count - items.count
        let rank: (Plan, Plan) -> Bool = { a, b in a.missing != b.missing ? a.missing < b.missing : a.total < b.total }
        let singles = stores.map { evaluate(items, [$0], unpriceable: unpriceable) }.sorted(by: rank)
        var pairs: [Plan] = []
        for i in 0..<stores.count { for j in (i + 1)..<max(stores.count, i + 1) where j < stores.count { pairs.append(evaluate(items, [stores[i], stores[j]], unpriceable: unpriceable)) } }
        pairs.sort(by: rank)
        var triples: [Plan] = []
        if stores.count <= 14 {
            for i in 0..<stores.count { for j in (i + 1)..<max(stores.count, i + 1) where j < stores.count { for k in (j + 1)..<max(stores.count, j + 1) where k < stores.count {
                triples.append(evaluate(items, [stores[i], stores[j], stores[k]], unpriceable: unpriceable))
            } } }
            triples.sort(by: rank)
        }
        var every = trimmed(items, evaluate(items, stores, unpriceable: unpriceable), unpriceable: unpriceable)
        // If a shorter trip matches the cherry-pick total, that shorter trip *is* the cherry-pick.
        // The card must never ask for an extra stop that buys nothing.
        for p in singles + pairs + triples
        where p.missing <= every.missing && p.total <= every.total + 1e-9 && p.stores.count < every.stores.count {
            every = p
        }
        // An option earns a card only if it really makes k stops, beats anything reachable in
        // fewer stops, and is not the cherry-pick plan wearing a smaller label. Otherwise the
        // list shows the same trip at the same price two or three times over, which tells the
        // shopper a third store is worth a stop when it is not.
        func keep(_ p: Plan, stops k: Int, over floor: Plan?) -> Bool {
            p.stores.count == k && beats(p, floor) && (p.stores.count < every.stores.count || beats(p, every))
        }
        let triFloor = [singles.first, pairs.first].compactMap { $0 }.min(by: rank)
        return Result(items: priced,
                      single: singles.filter { keep($0, stops: 1, over: nil) },
                      pairs: Array(pairs.filter { keep($0, stops: 2, over: singles.first) }.prefix(5)),
                      triples: Array(triples.filter { keep($0, stops: 3, over: triFloor) }.prefix(3)),
                      everything: every, stores: stores, generatedAt: Date())
    }
}
