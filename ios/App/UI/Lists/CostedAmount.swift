import Foundation

/// The quantity a trip-plan cost is *for*, in words a shopper can check against the shelf.
///
/// A trip plan does not price packages. `TripPlanner.priceOne` takes each store's cheapest match,
/// converts it to a unit price, and multiplies by one shared *reference amount* — the size the
/// shopper typed ("milk 1 gal"), or, for a bare "orange juice", the median package size among the
/// results (`Compare.referenceAmount`). That is what makes stores with different package sizes
/// comparable, and it is also why a cost can look impossible beside the product it cites:
///
///     orange juice   $2.51
///     Dutch Farms 100% Orange Juice · 1 gal · $6.99
///
/// $2.51 is 46 fl oz of a $6.99 gallon. Nothing on the screen said 46 fl oz, and because the
/// median moves with whatever the search returned, the two shipped screenshot sets costed the same
/// juice at the same store at $2.51 on the iPhone and $2.73 on the iPad (50 fl oz) — a 9%
/// disagreement on one number in one submission, with no way for a reader to reconcile either.
/// A cent-precise figure whose basis is invisible and non-deterministic implies a precision the
/// source does not support, which is the governing rule's own definition of a wrong price.
///
/// So the amount is printed beside every cost. The formatting is a port of `refText` in
/// public/js/views/list.js, which already prints the same amount under each row of the web trip
/// table — keep the two identical, or the phone and the website will describe one plan in two ways.
enum CostedAmount {
    /// "46 fl oz", "0.75 gal", "1.5 lb", "12 oz", "1 dozen", "6 ct". Mirrors `refText` in
    /// public/js/views/list.js, including its thresholds and its rounding (`+x.toFixed(n)`: fixed
    /// places, trailing zeros dropped).
    ///
    /// Gallons and pounds only for an amount that is a whole number of quarter-gallons (32 fl oz)
    /// or quarter-pounds (4 oz), and only from half a gallon (64 fl oz) or one pound (16 oz) up.
    /// Anything else stays in the base unit. The amount is what the cost beside
    /// it was computed for, so it has to be stated exactly: "100 fl oz" rounded to "0.78 gal" is
    /// 99.84 fl oz — a figure the cost was never computed for — and an 18 oz median printed as
    /// "1.13 lb" is 18.08 oz. That rule was added to the web formatter first; this port had kept
    /// the older "any amount over the threshold becomes gallons" rule, so the phone printed
    /// "0.78 gal" where the website printed "100 fl oz" for the same plan.
    static func text(dim: Dim, base: Double) -> String {
        switch dim {
        case .volume:
            return base >= 64 && isWhole(base / 32) ? "\(fixed(base / 128, 2)) gal" : "\(fixed(base, 1)) fl oz"
        case .weight:
            return base >= 16 && isWhole(base / 4) ? "\(fixed(base / 16, 2)) lb" : "\(fixed(base, 1)) oz"
        case .count:
            return base == 12 ? "1 dozen" : "\(fixed(base, 0)) ct"
        }
    }

    /// JavaScript's `Number.isInteger`, which is exact: 96/32 is whole, 100/32 is not.
    private static func isWhole(_ x: Double) -> Bool { x.isFinite && x == x.rounded() }

    /// The line printed under an item: what quantity the cost beside it buys.
    ///
    /// - A scaled cost says the amount: "for 46 fl oz", or "for 2 × 46 fl oz" when the list asks
    ///   for two.
    /// - A pinned product is costed as its whole package (`TripPlanner.priceOne` uses the pinned
    ///   price as-is), so it says that instead of an amount it was never scaled to.
    /// - nil when the item has no cost at this store, or no amount was worked out.
    static func line(for item: TripPlanner.PricedItem, storeId: String) -> String? {
        guard let cost = item.perStore[storeId] else { return nil }
        let times = item.qty > 1 ? "\(item.qty) × " : ""
        if cost.pinned {
            let size = cost.pinnedProduct?.size ?? ""
            return "for \(times)the pinned package\(size.isEmpty ? "" : " (\(size))")"
        }
        guard let dim = item.dim, let base = item.refBase, base > 0 else { return nil }
        return "for \(times)\(text(dim: dim, base: base))"
    }

    /// JavaScript's `+x.toFixed(digits)` as a string: round half away from zero at `digits`
    /// places, then drop trailing zeros and a bare decimal point ("1.50" -> "1.5", "2.00" -> "2").
    static func fixed(_ x: Double, _ digits: Int) -> String {
        let scale = pow(10.0, Double(digits))
        let r = (x * scale).rounded(.toNearestOrAwayFromZero) / scale
        var s = String(format: "%.\(digits)f", r)
        if s.contains(".") {
            while s.hasSuffix("0") { s.removeLast() }
            if s.hasSuffix(".") { s.removeLast() }
        }
        return s == "-0" ? "0" : s
    }
}
