import Foundation

/// How a price is described to the shopper: where it came from, in words they can check.
///
/// Every non-shelf price in this app comes from Instacart. `InstacartSource` is the only source
/// that ever assigns `.online` or `.national` (Whole Foods and Trader Joe's are read from their own
/// sites and are always `.shelf`): `.online` is a chain's Instacart listing for the location
/// nearest the shopper, `.national` is Instacart's chain-wide storefront for a chain with no
/// location near them.
///
/// The app used to call the first of those "online" — the row badge said "online", the product
/// sheet said the price came from "Jewel's online listing", and How Prices Work said Cartworth
/// reads "the prices each store publishes on its own website … the same prices you'd see browsing
/// that site". None of that was true of an Instacart price, and the owner found out the way a
/// shopper would: Jewel-Osco butter at $7.99 on screen, and less in Jewel's own app. A shopper
/// who is told a number is the store's own online price, and then finds a different number in
/// the store's own app, has been shown a wrong price. Naming Instacart is what makes the two
/// numbers reconcilable.
///
/// The words are a port of the website's (`BASIS_LABEL`, `BASIS_BADGE`, `provenanceNote` and
/// `STORE_BASIS` in public/js/format.js), so the phone and the website describe one price the
/// same way. Keep them together: if one changes, change the other.
enum PriceProvenance {

    /// The short badge on a result row, where space is tightest. Nil for a shelf price, which
    /// needs no qualifier. The row badge used to read "online", which says what the price is
    /// not (the shelf) without saying what it is.
    static func badge(_ b: PriceBasis) -> String? {
        switch b {
        case .shelf: return nil
        case .online: return "Instacart"
        case .national: return "national"
        }
    }

    /// The fuller label, for the best-price card and the product sheet.
    static func label(_ b: PriceBasis) -> String {
        switch b {
        case .shelf: return "shelf price"
        case .online: return "online (Instacart) price"
        case .national: return "national price"
        }
    }

    /// The provenance as a sentence, for the product sheet — the one place with room to say it in
    /// full, and where a shopper lands when a number looks off. Nil for a shelf price.
    ///
    /// The website also quotes Instacart's own disclosure for the storefront ("Prices vary from
    /// in-store"); the phone's `Product` does not carry that note, so it is left out here rather
    /// than paraphrased.
    static func note(_ b: PriceBasis, storeName: String) -> String? {
        switch b {
        case .shelf:
            return nil
        case .online:
            return "\(storeName)’s price on Instacart, for its location nearest you. Instacart prices can run higher than the shelf price in the store or in \(storeName)’s own app."
        case .national:
            return "Instacart’s chain-wide price for \(storeName): there is no \(storeName) near you on Instacart, so this is another location’s listing. Your local shelf price may differ either way."
        }
    }

    /// The footnote under the per-store chart when any bar is not a shelf price.
    static func chartFootnote(hasOnline: Bool, hasNational: Bool) -> String? {
        switch (hasOnline, hasNational) {
        case (_, true):
            return "Some stores show online (Instacart) prices, which can run higher than the shelf. “National” means Instacart’s chain-wide listing rather than a store near you."
        case (true, false):
            return "Some stores show online (Instacart) prices, which can run higher than the shelf."
        case (false, false):
            return nil
        }
    }

    /// How a whole store's prices reach the shopper, for the store picker.
    static func storeLabel(_ s: PriceStatus) -> String {
        switch s {
        case .shelf: return "Shelf prices"
        case .online: return "Online (Instacart) prices"
        case .national: return "National prices"
        case .adsOnly: return "Weekly ad only"
        case .none: return "No prices"
        }
    }
}
