import Foundation

/// Names an outbound link by where it actually goes.
///
/// The product sheet's one outbound button used to read "Open at \(chain.short)" — "Open at
/// Walmart" — whatever the link's destination was. For every chain priced through the Instacart
/// marketplace (`RetailerCatalog.ic(...)`, all but four of the priced chains) that destination is a
/// page on instacart.com, so a shopper tapped a button carrying a retailer's name and landed on a
/// different company's site. That is a misattribution the shopper can see, and it undercuts the
/// one claim the app makes about every number it shows: that it says where the number came from.
///
/// So the label is derived from the URL, never from the chain:
///
///   * a page on instacart.com is "View on Instacart" — which is also where the price on the sheet
///     was read, so that is the honest place to send someone who wants to check it;
///   * a page on the chain's *own* storefront (ALDI's aldi.us and Woodman's shopwoodmans.com are
///     Instacart-powered but are the retailer's own sites; Whole Foods and Trader Joe's are read
///     directly) keeps "Open at <chain>";
///   * anything else is named by its host, because a label that guesses is the defect this fixes.
///
/// The host is always carried alongside the title so the sheet can print it under the button.
enum OutboundLink {
    struct Destination: Equatable {
        /// The button's title.
        var title: String
        /// The registrable host the link opens, without "www." — printed under the button.
        var host: String
        /// True when the page is a marketplace listing rather than the retailer's own site.
        var viaMarketplace: Bool
    }

    static func destination(for url: URL, chain: Chain?) -> Destination {
        let host = normalizedHost(url.host) ?? url.absoluteString
        if isInstacart(host) {
            return Destination(title: "View on Instacart", host: host, viaMarketplace: true)
        }
        if let chain, let own = ownHost(of: chain), own == host {
            return Destination(title: "Open at \(chain.short)", host: host, viaMarketplace: false)
        }
        return Destination(title: "Open \(host)", host: host, viaMarketplace: false)
    }

    /// The caption printed under the button, so the destination is visible before the tap.
    static func caption(for d: Destination, chain: Chain?) -> String {
        if d.viaMarketplace {
            let whose = chain.map { "\($0.short)’s listing on " } ?? "The listing on "
            return "\(whose)\(d.host), where this price was read."
        }
        return "Opens \(d.host)"
    }

    // MARK: - hosts

    private static func isInstacart(_ host: String) -> Bool {
        host == "instacart.com" || host.hasSuffix(".instacart.com")
    }

    static func normalizedHost(_ host: String?) -> String? {
        guard var h = host?.lowercased(), !h.isEmpty else { return nil }
        if h.hasPrefix("www.") { h.removeFirst(4) }
        return h
    }

    /// The retailer's own storefront, when it has one we read from.
    ///
    /// For an Instacart-powered chain this comes straight from the catalogue's `base` — which is
    /// the host the product URL is built on in `InstacartSource.parseItem` — and is nil when that
    /// base is the instacart.com marketplace itself. Whole Foods and Trader Joe's are read from
    /// their own sites (`WholeFoodsSource.base`, `TraderJoesSource.base`, both private), so their
    /// hosts are stated here; `OutboundLinkTests` pins both against the catalogue.
    static func ownHost(of chain: Chain) -> String? {
        switch chain.source {
        case .instacart(let base, _, _):
            guard let h = normalizedHost(URL(string: base)?.host), !isInstacart(h) else { return nil }
            return h
        case .wholeFoods:
            return "wholefoodsmarket.com"
        case .traderJoes:
            return "traderjoes.com"
        case .adsOnly:
            return nil
        }
    }
}
