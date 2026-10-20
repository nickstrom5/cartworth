import SwiftUI
import UIKit
import Charts
import Combine

// MARK: - Store identity

/// Validated categorical palette (colorblind-safe in both modes); slot per store, never by rank.
enum StorePalette {
    // The Okabe-Ito colour-vision-deficiency-safe categorical palette, unmodified. Verified by
    // basket/scripts/check-palette.js: it keeps the largest minimum separation of any published
    // categorical set under protanopia and deuteranopia. No eight-colour palette survives every
    // deficiency, so colour is never the only cue — every dot is paired with the store's name.
    static let light: [Color] = [Color(hex: 0x898781), Color(hex: 0xE69F00), Color(hex: 0x0072B2), Color(hex: 0x009E73), Color(hex: 0xCC79A7), Color(hex: 0xD55E00), Color(hex: 0x56B4E9), Color(hex: 0xF0E442), Color(hex: 0x3A3A3A)]
    static let dark: [Color] = [Color(hex: 0x898781), Color(hex: 0xE69F00), Color(hex: 0x4A9FDC), Color(hex: 0x009E73), Color(hex: 0xCC79A7), Color(hex: 0xE2711D), Color(hex: 0x56B4E9), Color(hex: 0xF0E442), Color(hex: 0xDDDDDD)]

    static func color(slot: Int, dark: Bool) -> Color {
        let palette = dark ? Self.dark : Self.light
        return palette[max(0, min(slot, palette.count - 1))]
    }

    // A marker shape and a dash pattern per slot, so a charted series is never identified by hue
    // alone. The palette note above says colour is never the only cue, but the watch trend chart
    // broke that rule outright: ten stores drew ten identical 2pt solid lines with identical round
    // dots, separated by colour only — and `color(slot:)` clamps, so every store past the eighth
    // shares one grey and two lines were genuinely indistinguishable from each other. The target
    // rule in both charts is already dashed "rather than a second green" for this exact reason;
    // these carry that same idea onto the series themselves.
    //
    // These cycle rather than clamp: the combination of hue and shape is what separates the ninth
    // store from the first, so the shapes must keep moving once the colours have stopped.
    static let symbols: [BasicChartSymbolShape] = [.circle, .square, .triangle, .diamond, .pentagon, .plus, .cross, .asterisk]
    static let dashes: [[CGFloat]] = [[], [6, 3], [2, 3], [8, 3, 2, 3], [4, 2], [10, 3], [1, 3], [7, 2, 2, 2]]

    static func symbol(slot: Int) -> BasicChartSymbolShape { symbols[abs(slot) % symbols.count] }
    static func dash(slot: Int) -> [CGFloat] { dashes[abs(slot) % dashes.count] }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: 1)
    }

    /// Text in a warning or error colour. System orange is 2.2:1 on white and system red 3.6:1,
    /// under the 4.5:1 small text needs; these are the `Badge` inks (7.0:1 and 6.5:1 on white,
    /// 10.8:1 and 7.5:1 on Dark Mode's grouped background), and follow Dark Mode by themselves.
    static let warnInk = dynamic(light: 0x7A5100, dark: 0xF2C95C)
    static let badInk = dynamic(light: 0xB3261E, dark: 0xFF8A80)

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { trait in
            let v = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        })
    }
}

struct StoreDot: View {
    let storeId: String
    var size: CGFloat = 9
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Circle()
            .fill(StorePalette.color(slot: AppState.shared.colorSlot(for: storeId), dark: scheme == .dark))
            .overlay(Circle().strokeBorder(scheme == .dark ? .white.opacity(0.35) : .black.opacity(0.28), lineWidth: 1))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

struct StoreTag: View {
    let storeId: String
    var full = false

    var body: some View {
        let chain = RetailerCatalog.byId[storeId]
        HStack(spacing: 5) {
            StoreDot(storeId: storeId)
            // The dot is decorative and colour is never the only cue — eight colours cannot
            // survive colour blindness — so the name is the thing that identifies the store, and
            // it is drawn by `StoreName`, which never breaks a word. See there for what the
            // previous `lineLimit(3)` did to "Mariano's".
            StoreName(full ? (chain?.name ?? storeId) : (chain?.short ?? storeId))
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
        }
    }
}

/// A store's name, which may wrap between words but never inside one.
///
/// Store names carry identity. The colour dot beside one cannot — eight colours do not survive
/// colour blindness — so a name drawn as "Mar-" / "iano'" / "s" (seen in the iPad ads column at
/// AccessibilityXXXL) or "Wal-" / "mart" (the trip plan) leaves a shopper unable to say whose
/// price or whose ad they are reading, and Mariano's, Marianos-adjacent and two Dollar chains all
/// exist in the catalogue. A plain `Text` with a line limit breaks mid-word whenever one word is
/// wider than the space, and it prefers that to shrinking; no `lineLimit` value prevents it.
///
/// So each word is its own one-line `Text`, flowed onto lines by `WordFlow`: a word that fits
/// stays whole, a line breaks only between words, and a single word too wide for the space
/// *shrinks* (down to half size) rather than being cut. VoiceOver and UI tests still see one
/// element carrying the whole name.
struct StoreName: View {
    let name: String
    @ScaledMetric(relativeTo: .caption) private var wordGap: CGFloat = 3.5

    init(_ name: String) { self.name = name }

    var body: some View {
        WordFlow(spacing: wordGap) {
            ForEach(Array(name.split(separator: " ").enumerated()), id: \.offset) { _, word in
                Text(String(word)).lineLimit(1).minimumScaleFactor(0.5)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(name))
        .accessibilityAddTraits(.isStaticText)
    }
}

/// Greedy line-filling for words, used by `StoreName`.
///
/// Unlike `FlowRow` this reports only the width it actually uses (so a short name in an `HStack`
/// does not claim the whole row) and it puts no gap between lines. Like `FlowRow` it clamps: a
/// word wider than the line is re-proposed at the line's width, which is what lets a one-line
/// `Text` with a `minimumScaleFactor` shrink to fit instead of running past the edge.
struct WordFlow: Layout {
    var spacing: CGFloat = 4

    private func measure(_ s: LayoutSubview, limit: CGFloat) -> CGSize {
        let ideal = s.sizeThatFits(.unspecified)
        guard limit.isFinite, ideal.width > limit else { return ideal }
        return s.sizeThatFits(ProposedViewSize(width: limit, height: nil))
    }

    private func lines(_ subviews: Subviews, width: CGFloat) -> [[(Int, CGSize)]] {
        var out: [[(Int, CGSize)]] = [[]]
        var x: CGFloat = 0
        for (i, s) in subviews.enumerated() {
            let size = measure(s, limit: width)
            if x > 0, x + spacing + size.width > width {
                out.append([])
                x = 0
            }
            x += (x > 0 ? spacing : 0) + size.width
            out[out.count - 1].append((i, size))
        }
        return out
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var used: CGFloat = 0, height: CGFloat = 0
        for line in lines(subviews, width: width) {
            let w = line.reduce(0) { $0 + $1.1.width } + spacing * CGFloat(max(0, line.count - 1))
            used = max(used, w)
            height += line.map(\.1.height).max() ?? 0
        }
        return CGSize(width: min(used, width), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for line in lines(subviews, width: bounds.width) {
            var x = bounds.minX
            let h = line.map(\.1.height).max() ?? 0
            for (i, size) in line {
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += h
        }
    }
}

// MARK: - Badges

extension Color {
    /// The deal/promo text colour: the brand's dark orange on light, a light orange on dark (the dark
    /// hue was about 3:1 on Dark Mode's background).
    static let dealInk = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0xFF / 255, green: 0x9A / 255, blue: 0x6B / 255, alpha: 1)
            : UIColor(red: 0xB2 / 255, green: 0x3A / 255, blue: 0x0C / 255, alpha: 1)
    })
}

/// The age of a price taken from a store's saved copy because the store did not answer just now
/// ("saved 5 hr. ago"). Re-drawn every minute so it keeps up. Port of savedNote in public/js/format.js.
struct SavedNote: View {
    var date: Date
    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { _ in
            Group {
                if date > Date(timeIntervalSince1970: 0) {
                    Text("saved ") + Text(date, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                } else {
                    Text("saved price")
                }
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Color.warnInk)
            .accessibilityElement(children: .combine)
            .accessibilityHint("The store did not answer just now, so this is the last price Cartworth saved for it")
        }
    }
}

struct Badge: View {
    enum Kind { case neutral, sale, good, warn, info, outline }
    let text: String
    var kind: Kind = .neutral
    var symbol: String?
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 3) {
            if let symbol { Image(systemName: symbol).font(.system(size: 9, weight: .bold)) }
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        // `lineLimit(1)` alone let the text run wider than the pill that is supposed to contain
        // it: at an accessibility size a "40% off" badge overlaid on a deal card drew its tinted
        // background clipped at the card edge while the red text carried on into the gutter, over
        // the retailer's own printed price. A numeric claim rendered outside its container and on
        // top of a competing number invites exactly the misreading this app exists to avoid, so
        // the badge shrinks to fit instead, and `fixedSize` keeps it from being cut to an ellipsis
        // on the way down.
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(bg, in: RoundedRectangle(cornerRadius: 5))
        .foregroundStyle(fg)
        .overlay(kind == .outline ? RoundedRectangle(cornerRadius: 5).stroke(Color.secondary.opacity(0.35)) : nil)
    }

    private var bg: Color {
        switch kind {
        case .neutral: return Color.secondary.opacity(0.14)
        case .sale: return Color.orange.opacity(0.18)
        case .good: return Color.green.opacity(0.18)
        case .warn: return Color.yellow.opacity(0.22)
        case .info: return Color.blue.opacity(0.15)
        case .outline: return .clear
        }
    }

    /// The light-mode inks are dark hues; on Dark Mode's near-black, under a translucent tint, they
    /// fell to roughly 2:1 — "% off", "Best", "price looks wrong" and member prices were hard to read.
    /// Dark Mode gets light hues of the same colours, each above 4.5:1 on its tinted pill.
    private var fg: Color {
        let dark = scheme == .dark
        switch kind {
        case .neutral, .outline: return .secondary
        case .sale: return Color(hex: dark ? 0xFF9A6B : 0xB23A0C)
        case .good: return Color(hex: dark ? 0x6FD08C : 0x146B14)
        case .warn: return .warnInk
        case .info: return Color(hex: dark ? 0x7DB4FF : 0x1C5CAB)
        }
    }
}

// MARK: - Price labels

/// The one rule every price label in the app obeys: it is never wrapped, squeezed or clipped by
/// whatever shares its line.
///
/// All three failure modes read as a *different, smaller* number rather than as damage:
///
///   * wrapped — "$11.28" breaks after the third glyph and renders as "$11.2" over "8". The top
///     line is a well-formed price and is what a shopper reads.
///   * truncated — "$11.38" becomes "$1.…", an order of magnitude out. This one has shipped.
///   * overdrawn — a store name placed on top of the digits ("Woodman$5.79").
///
/// `lineLimit(1)` stops the wrap, `fixedSize` stops the truncation that `lineLimit` alone would
/// otherwise cause, and `layoutPriority` makes the *other* view in the line give up its width
/// first. `BestPerStoreChart.priceLabel` and the watch card in `TrackingView` have carried these
/// four modifiers for a while; this is the same guard, named, so every price can share it.
struct UnbreakablePrice: ViewModifier {
    func body(content: Content) -> some View {
        content
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .layoutPriority(1)
    }
}

extension View {
    /// See `UnbreakablePrice`. Apply to any `Text` that renders a money value.
    func unbreakablePrice() -> some View { modifier(UnbreakablePrice()) }
}

// The rules that recognise a broken price from its on-screen frame live in
// ios/UITests/PriceLabelGeometry.swift, compiled into the two test targets that use them. They
// are not app code: nothing in the shipping app measures its own labels.

// MARK: - Product row

struct ProductRowView: View {
    let row: ComparedRow
    let unit: DisplayUnit?
    var isBest = false
    var showStore = true
    var prefs = PricePrefs()
    var onTap: () -> Void = {}

    @Environment(\.dynamicTypeSize) private var typeSize

    private var p: Product { row.product }

    var body: some View {
        Button(action: onTap) {
            Group {
                if typeSize.isAccessibilitySize {
                    // At an accessibility type size the description and the price cannot share a
                    // line. On a 402pt phone the thumbnail and the name column leave the price
                    // column far too little, and the result was a price wrapped mid-number with
                    // the store name drawn over it. Give the price its own full-width line
                    // instead — the same switch `BestPerStoreChart.stackedRow` makes, for the
                    // same reason.
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 10) {
                            ProductThumb(url: p.imageURL, size: 54)
                            details
                        }
                        priceColumn(alignment: .leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    HStack(alignment: .top, spacing: 10) {
                        ProductThumb(url: p.imageURL, size: 54)
                        details
                        Spacer(minLength: 4)
                        priceColumn(alignment: .trailing)
                    }
                }
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(isBest ? Color.green.opacity(0.08) : nil)
    }

    /// Thumbnail-adjacent column: the product name and everything that qualifies it.
    private var details: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(p.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            FlowRow(spacing: 5) {
                        if showStore { StoreTag(storeId: p.storeId) }
                        if !p.size.isEmpty { Text(p.size).font(.caption).foregroundStyle(.secondary) }
                        if isBest { Badge(text: "Best", kind: .good, symbol: "checkmark") }
                        if let pct = p.pctOff, p.onSale { Badge(text: "\(pct)% off", kind: .sale) }
                        else if p.onSale { Badge(text: "Sale", kind: .sale) }
                        if let promo = p.promo { Badge(text: Money.shortPromo(promo), kind: .sale) }
                        if let mp = p.memberPrice, let label = p.memberLabel { Badge(text: "\(label) \(Money.full(mp))", kind: .info) }
                        if let h = row.hist, h.n >= 3, p.price <= h.low + 0.004 { Badge(text: "Lowest seen", kind: .good) }
                        else if let prev = row.hist?.prev, prev > p.price { Badge(text: "was \(Money.full(prev))", kind: .good, symbol: "arrow.down") }
                        else if let prev = row.hist?.prev, prev < p.price { Badge(text: "was \(Money.full(prev))", kind: .warn, symbol: "arrow.up") }
                        if p.isOutOfStock { Badge(text: "Out of stock", kind: .warn) }
                        // Names the source, not just "not the shelf": see `PriceProvenance`.
                        if let basis = PriceProvenance.badge(p.priceBasis) { Badge(text: basis, kind: .outline) }
                        // A price we do not believe stays visible, but says so. It has already been
                        // excluded from "best price" in Compare.bestPerStore.
                        if p.implausible != nil { Badge(text: "price looks wrong", kind: .warn) }
                        // The listing's size and its own name disagree ("750 ml" priced as a 12-bottle
                        // case): the price may not be for the size shown. Excluded from best price too.
                        if p.sizeConflict != nil && p.implausible == nil { Badge(text: "size unclear", kind: .warn) }
                        if p.sponsored { Badge(text: "Ad", kind: .neutral) }
            }
        }
    }

    /// The unit price, the pack price and the struck-out regular price. Every money label here is
    /// `unbreakablePrice()`; nothing in this column is allowed to wrap or clip.
    private func priceColumn(alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 2) {
            if let u = unit, let perBase = row.perBase {
                HStack(spacing: 1) {
                    Text(Money.unit(perBase, u)).font(.headline).unbreakablePrice()
                    // The suffix belongs to the number: "16.5¢" over "/fl" over "oz" is not a
                    // legible price either, so it is pinned on one line alongside it.
                    Text("/\(u.label)")
                        .font(.caption2).foregroundStyle(.secondary)
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                }
                if row.est { Text("est.").font(.caption2).foregroundStyle(.tertiary) }
                HStack(spacing: 4) {
                    Text(packPrice).font(.caption).foregroundStyle(.secondary).unbreakablePrice()
                    if let reg = p.regularPrice { regularPrice(reg, font: .caption) }
                }
            } else {
                Text(packPrice).font(.headline).unbreakablePrice()
                if let reg = p.regularPrice { regularPrice(reg, font: .caption) }
            }
        }
    }

    private var packPrice: String {
        Money.full(Compare.effectivePrice(p, prefs)) + (p.soldBy == .lb ? "/lb" : "")
    }

    /// The crossed-out was-price.
    ///
    /// VoiceOver does not announce a strikethrough, so without a label of its own this row reads
    /// aloud as two bare prices back to back — "…$2.99 $3.49" — with nothing saying which one the
    /// shopper would actually pay. That is a wrong price for a blind user. `DealsView` prints the
    /// literal word "Reg." for the same reason; a sighted reader already has the strikethrough, so
    /// here the qualifier only needs to exist in the spoken label.
    private func regularPrice(_ reg: Double, font: Font) -> some View {
        Text(Money.full(reg))
            .font(font).foregroundStyle(.tertiary).strikethrough()
            .unbreakablePrice()
            .accessibilityLabel("regular price \(Money.full(reg))")
    }
}

struct ProductThumb: View {
    let url: URL?
    var size: CGFloat = 54

    @ViewBuilder
    var body: some View {
        // Screenshot capture only, off in every shipping build (see `QAShot`). The thumbnails are
        // the retailers' own packaging photography; they belong in the app and not in a marketing
        // image, and dropping the view entirely is cleaner than a grid of grey "no image" boxes.
        if QAShot.hideRemoteImages {
            EmptyView()
        } else {
            remote
        }
    }

    private var remote: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFit()
            case .empty where url != nil: ProgressView().controlSize(.mini)
            default: Image(systemName: "photo").font(.caption).foregroundStyle(.tertiary)
            }
        }
        .frame(width: size, height: size)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.18)))
    }
}

/// Wrapping row of small views (badges, chips).
struct FlowRow: Layout {
    var spacing: CGFloat = 6

    /// A subview's ideal size, clamped to the width of the row itself.
    ///
    /// This clamp is the load-bearing part. Measuring with `.unspecified` asks a subview how wide
    /// it would like to be with no limit at all, and a subview that answers with more than the row
    /// has was previously placed at that width anyway — running off the edge of the device, or
    /// straight over whatever sits beside it. Two things went wrong because of it, both at
    /// accessibility type sizes:
    ///
    ///   * in `ProductRowView` the store tag overflowed its column and was drawn on top of the
    ///     shelf price, so "Woodman's" and "$1.49" occupied the same pixels. Overdrawn digits are
    ///     a wrong price, which is the one thing this app must never show.
    ///   * on the search landing page a long recent search ("disposable roasting pan") ran past
    ///     the right edge with no ellipsis and no scroller — the rest simply was not on screen.
    ///
    /// Re-proposing the clamped width lets the subview wrap or truncate *inside* the row, where it
    /// can still be read, instead of silently spilling out of it. The height that comes back is
    /// the wrapped height, so the row is tall enough for what it will actually draw.
    private func measure(_ subview: LayoutSubview, limit: CGFloat) -> CGSize {
        let ideal = subview.sizeThatFits(.unspecified)
        guard limit.isFinite, ideal.width > limit else { return ideal }
        return subview.sizeThatFits(ProposedViewSize(width: limit, height: nil))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = measure(s, limit: maxWidth)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)   // the trailing gap is not part of the content
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? widest : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for s in subviews {
            let size = measure(s, limit: bounds.width)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Chart scales
//
// Swift Charts' automatic numeric domain anchors a LineMark axis at zero and rounds the top out
// to a "nice" number. For money that is the wrong default twice over:
//
//   * Grocery prices live in a narrow band well away from zero, and the axis runs from zero to
//     whichever store is dearest. A butter watch whose ten stores run $2.44–$9.49/lb was measured
//     getting a 0–$10 axis, so a quarter of the plot was empty. In the QA capture
//     (marketing/screenshots/*/07-tracking-watch.png) one store's mis-parsed size put its unit
//     price somewhere between $150 and $200/lb, the axis ran 0–$200, and the prices anyone
//     actually cared about — $1.41 to $2.49 — collapsed onto the bottom gridline.
//   * A degenerate series (no points, one point, or every value identical) has a zero-width
//     data range, and Swift Charts draws nothing at all for one.
//
// These are plain functions rather than inline chart modifiers so the behaviour at those edges is
// testable without a rendering pass. See ios/Tests/ChartTests.swift.

enum ChartScale {
    /// Fraction of the data range added above and below, so marks never sit on the frame.
    /// 0.15 to match `LineChart` in public/js/charts.js, which is the same chart on the web.
    private static let padFraction = 0.15

    /// Y-domain for a price axis. Fitted to the data (never anchored at zero), always non-empty,
    /// and always wide enough to contain every finite value it was given — a price axis must not
    /// clip a point, because a clipped line looks exactly like a real plateau.
    ///
    /// This is a direct port of the `geo` block in `LineChart` (public/js/charts.js), which has
    /// always fitted its domain this way; only the iOS charts were relying on the automatic scale.
    ///
    /// - Parameter including: an extra value that must stay on screen (the target rule).
    static func priceDomain(_ values: [Double], including extra: Double? = nil) -> ClosedRange<Double> {
        var v = values.filter { $0.isFinite }
        if let extra, extra.isFinite { v.append(extra) }
        // Empty series: a neutral placeholder. Callers show an explanatory caption instead of
        // pretending there is a trend, but the domain still has to be a valid non-empty range.
        guard let low = v.min(), let high = v.max() else { return 0...1 }

        // One point, or every value identical, gives a zero-width range and Swift Charts draws
        // nothing at all for one. Fall back to a band around the value, then to a unit band when
        // the value itself is zero. Mirrors `(hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1`.
        var pad = (high - low) * padFraction
        if pad <= 0 { pad = abs(high) * 0.1 }
        if pad <= 0 { pad = 1 }

        let lo = Swift.max(0, low - pad)   // money is never negative
        var hi = high + pad
        if hi <= lo { hi = lo + 1 }
        return lo...hi
    }

    /// Longest bar to draw, in value units, for a zero-based bar chart.
    ///
    /// A bar's length *is* its value, so a single outlier flattens every other bar to a stub —
    /// one mis-parsed $29.84/gal milk turned $2.41 through $3.99 into seven identical nubs.
    /// This returns a Tukey-fence cap: bars at or below it keep the full width of the track, and
    /// a bar above it is drawn full-length **and flagged**, with its real number still printed
    /// beside it. Nothing is hidden or rescaled away — only the length encoding is capped, and
    /// the cap is signposted on the bar that hits it.
    ///
    /// The fence is the *far out* 3×IQR, not the usual 1.5×. Grocery prices across stores are
    /// genuinely right-skewed — Whole Foods and Trader Joe's really are three to four times ALDI
    /// — and a 1.5× fence flagged them on ordinary milk data. A break marker that fires on honest
    /// spread stops meaning anything, so it is reserved for values that actually wreck the scale.
    ///
    /// Fewer than four bars is too little to call anything an outlier, so the cap is just the max.
    static func barCap(_ values: [Double]) -> Double {
        let v = values.filter { $0.isFinite && $0 > 0 }.sorted()
        guard let maxV = v.last else { return 1 }
        guard v.count >= 4 else { return maxV }
        let q1 = quantile(v, 0.25)
        let q3 = quantile(v, 0.75)
        let fence = q3 + 3.0 * (q3 - q1)
        guard maxV > fence else { return maxV }
        let largestInlier = v.last(where: { $0 <= fence }) ?? maxV
        return largestInlier * 1.05
    }

    /// Linear-interpolated quantile of an already-sorted, non-empty array.
    static func quantile(_ sorted: [Double], _ p: Double) -> Double {
        guard let first = sorted.first, let last = sorted.last else { return 0 }
        if sorted.count == 1 { return first }
        let pos = Swift.min(Swift.max(p, 0), 1) * Double(sorted.count - 1)
        let i = Int(pos.rounded(.down))
        guard i + 1 < sorted.count else { return last }
        return sorted[i] + (pos - Double(i)) * (sorted[i + 1] - sorted[i])
    }
}

/// How one price axis renders every one of its tick labels.
///
/// `Money.unit` picks its format per value — it switches to whole dollars at 100 and to cents
/// under 0.9995 — which is right for a single figure in a row and wrong for an axis, where it
/// produced `$200`, `$150`, `$100`, `$50.00` and `0.00¢` as the five labels of one scale. The
/// format is chosen once from the domain so that every tick on an axis reads the same way.
enum PriceAxisFormat {
    case cents          // the whole axis is under a dollar
    case dollarsCents   // ordinary grocery range
    case dollars        // hundreds and up; cents would just be noise

    static func forDomain(_ domain: ClosedRange<Double>) -> PriceAxisFormat {
        if domain.upperBound >= 100 { return .dollars }
        if domain.upperBound < 1 { return .cents }
        return .dollarsCents
    }

    func label(_ v: Double) -> String {
        guard v.isFinite else { return "" }
        switch self {
        case .cents: return "\(Int((v * 100).rounded()))¢"
        case .dollarsCents: return String(format: "$%.2f", v)
        case .dollars: return String(format: "$%.0f", v)
        }
    }
}

// MARK: - Charts

/// Cheapest match per store, as bars (one hue; the winner is labeled, never color alone).
struct BestPerStoreChart: View {
    let rows: [ComparedRow]
    let unit: DisplayUnit
    var onSelect: (ComparedRow) -> Void = { _ in }
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var typeSize

    // The store-name column and the slot reserved for the price both hold text, so neither can be
    // a constant. They used to be a flat 92pt and 96pt, which held at the default type size and
    // failed badly above it: on the iPhone Duo's 466pt cover panel at AccessibilityXXXL every
    // store name collapsed to "M…" / "Je…" — and, far worse, the price itself was cut to "$1…",
    // which reads as a completely different and cheaper number than the $12.49 it stood for.
    // Showing a wrong price is the one thing this app must never do, so two rules apply below:
    // the price label is `fixedSize` and can never be clipped, and at accessibility type sizes the
    // row stops sharing a line altogether (see `stackedRow`).
    @ScaledMetric(relativeTo: .caption) private var nameColumn: CGFloat = 92
    @ScaledMetric(relativeTo: .caption) private var priceSlot: CGFloat = 96
    @ScaledMetric(relativeTo: .caption) private var priceSlotWide: CGFloat = 150
    @ScaledMetric(relativeTo: .caption) private var tagSlot: CGFloat = 112
    @ScaledMetric(relativeTo: .caption) private var rowHeight: CGFloat = 18
    @ScaledMetric(relativeTo: .caption) private var barHeight: CGFloat = 16

    /// Bar lengths are capped at a robust fence so one outlier can't flatten the rest; see
    /// `ChartScale.barCap`. A bar past the cap is drawn full width with a break marker and an
    /// "off scale" badge, and its exact price is printed beside it exactly as before.
    private var cap: Double { ChartScale.barCap(rows.map { $0.perBase ?? 0 }) }

    var body: some View {
        let cap = self.cap
        // One reserve for the whole chart, not per row: the bars only compare if every one of
        // them is measured against the same track. Wider when any row carries the extra badge.
        let anyOffScale = rows.contains { ($0.perBase ?? 0) > cap }
        // Room for "≈ same" and the price source ("Instacart"), when any row carries them.
        let anyTagged = rows.indices.contains { tags($0).close || tags($0).source != nil }
        let reserve: CGFloat = (anyOffScale ? priceSlotWide : priceSlot) + (anyTagged ? tagSlot : 0)
        VStack(alignment: .leading, spacing: typeSize.isAccessibilitySize ? 14 : 8) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                let value = r.perBase ?? 0
                let offScale = value > cap
                Button { onSelect(r) } label: {
                    if typeSize.isAccessibilitySize {
                        stackedRow(index: i, row: r, value: value, offScale: offScale, cap: cap)
                    } else {
                        inlineRow(index: i, row: r, value: value, offScale: offScale, cap: cap, reserve: reserve)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(RetailerCatalog.byId[r.product.storeId]?.name ?? r.product.storeId)
                .accessibilityValue("\(Money.unit(value, unit)) per \(unit.label)\(tags(i).source.map { ", \($0) price" } ?? "")\(i == 0 ? ", cheapest" : tags(i).close ? ", about the same as the cheapest" : "")\(offScale ? ", off the end of the chart scale" : "")")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Cheapest match per store, price per \(unit.label)")
    }

    // MARK: - row pieces

    /// What a row says besides its number: "≈ same" when it is within the price-basis margin of the
    /// winner (the lowest bar used to be "Best" and every other one drawn as beaten, even an
    /// Instacart price a few cents over a shelf price), and where a non-shelf price came from.
    private func tags(_ i: Int) -> (close: Bool, source: String?) {
        let r = rows[i]
        let source = PriceProvenance.badge(r.product.priceBasis)
        guard i > 0, let w = rows.first, let a = w.perBase, let b = r.perBase else { return (false, source) }
        return (Compare.isClose(winner: a, w.product.priceBasis, w.est, to: b, r.product.priceBasis, r.est), source)
    }

    @ViewBuilder private func tagBadges(_ i: Int) -> some View {
        let t = tags(i)
        if t.close { Badge(text: "≈ same", kind: .neutral) }
        if let s = t.source { Badge(text: s, kind: .outline) }
    }

    /// The store's dot plus its name. The dot is decorative — the name is what identifies the
    /// store — so the name wraps between words rather than being cut to an initial or broken
    /// inside a word. That is `StoreTag`, which this now is.
    private func storeName(_ storeId: String) -> some View {
        StoreTag(storeId: storeId)
    }

    /// The number. If the row runs out of room the bar shortens, never the price — a clipped
    /// price is a wrong price. See `UnbreakablePrice`, which is this guard, shared.
    private func priceLabel(_ value: Double) -> some View {
        Text(Money.unit(value, unit))
            .font(.caption.weight(.semibold))
            .unbreakablePrice()
    }

    private func bar(width: CGFloat, best: Bool, offScale: Bool) -> some View {
        UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: offScale ? 0 : 4, topTrailingRadius: offScale ? 0 : 4)
            .fill(best ? Color.accentColor : Color.accentColor.opacity(scheme == .dark ? 0.45 : 0.35))
            .frame(width: width, height: barHeight)
            .overlay(alignment: .trailing) {
                // Break marker: this bar ran off the end of the scale.
                if offScale {
                    Image(systemName: "chevron.compact.right")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(scheme == .dark ? .black.opacity(0.55) : .white)
                        .padding(.trailing, 1)
                }
            }
    }

    /// Name, bar and price on one line. Used at the normal type sizes, where they fit.
    private func inlineRow(index i: Int, row r: ComparedRow, value: Double, offScale: Bool, cap: Double, reserve: CGFloat) -> some View {
        HStack(spacing: 8) {
            storeName(r.product.storeId)
                .frame(width: nameColumn, alignment: .leading)
            GeometryReader { geo in
                let track = max(1, geo.size.width - reserve)
                let w = max(3, CGFloat(min(value, cap) / max(cap, 0.0001)) * track)
                HStack(spacing: 6) {
                    bar(width: w, best: i == 0, offScale: offScale)
                    priceLabel(value)
                    if i == 0 { Badge(text: "Best", kind: .good) }
                    tagBadges(i)
                    if offScale { Badge(text: "off scale", kind: .warn) }
                }
            }
            .frame(height: rowHeight)
        }
        .contentShape(Rectangle())
    }

    /// At an accessibility type size nothing shares a line: the store name gets the full width,
    /// the price and its badges get the next line, and the bar gets its own line beneath. Every
    /// bar is still measured against the same track — the full row width — so the comparison the
    /// chart exists to make survives the switch.
    private func stackedRow(index i: Int, row r: ComparedRow, value: Double, offScale: Bool, cap: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            storeName(r.product.storeId)
            FlowRow(spacing: 6) {
                priceLabel(value)
                if i == 0 { Badge(text: "Best", kind: .good) }
                tagBadges(i)
                if offScale { Badge(text: "off scale", kind: .warn) }
            }
            GeometryReader { geo in
                let w = max(3, CGFloat(min(value, cap) / max(cap, 0.0001)) * geo.size.width)
                bar(width: w, best: i == 0, offScale: offScale)
            }
            .frame(height: barHeight)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// Price over time for one product (step line — a price holds until it changes).
struct PriceHistoryChart: View {
    let points: [HistoryPointDTO]
    var target: Double?
    var height: CGFloat = 180

    private var domain: ClosedRange<Double> { ChartScale.priceDomain(points.map(\.price), including: target) }

    var body: some View {
        let domain = self.domain
        let format = PriceAxisFormat.forDomain(domain)
        Chart {
            ForEach(points) { p in
                LineMark(x: .value("Date", p.at), y: .value("Price", p.price))
                    .interpolationMethod(.stepEnd)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                PointMark(x: .value("Date", p.at), y: .value("Price", p.price))
                    .symbolSize(60)
                    .foregroundStyle(Color.accentColor)
                    // Without these the whole chart is one unlabelled element to VoiceOver.
                    .accessibilityLabel(p.at.formatted(date: .abbreviated, time: .omitted))
                    .accessibilityValue(Money.full(p.price) + (p.onSale ? ", on sale" : ""))
            }
            if let last = points.last {
                // Carry the last known price to now
                LineMark(x: .value("Date", Date()), y: .value("Price", last.price))
                    .interpolationMethod(.stepEnd)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
            }
            if let target {
                // Dashed, not just green: the price line is drawn in the accent colour, which is
                // also a green, so hue alone would not separate the two.
                RuleMark(y: .value("Target", target))
                    .foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, alignment: .leading) {
                        Text("Target \(Money.full(target))").font(.caption2).foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Target price")
                    .accessibilityValue(Money.full(target))
            }
        }
        .chartYScale(domain: domain)
        .chartYAxis { AxisMarks(position: .leading) { v in
            AxisGridLine()
            AxisValueLabel { if let d = v.as(Double.self) { Text(format.label(d)).font(.caption2) } }
        } }
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { v in
            AxisGridLine()
            AxisValueLabel(format: .dateTime.month(.abbreviated).day())
        } }
        .frame(height: height)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Price history")
        .accessibilityValue(summary)
    }

    private var summary: String {
        let prices = points.map(\.price).filter(\.isFinite)
        guard let low = prices.min(), let high = prices.max() else { return "No prices recorded yet" }
        if prices.count == 1 { return "One check, \(Money.full(low))" }
        return "\(prices.count) checks, \(Money.full(low)) to \(Money.full(high)), latest \(Money.full(points.last?.price))"
    }
}

/// Unit price per store over time (watchlist trend).
struct WatchTrendChart: View {
    struct Series: Identifiable {
        var id: String
        var label: String
        var points: [(Date, Double)]
    }
    let series: [Series]
    let unit: DisplayUnit
    var target: Double?
    @Environment(\.colorScheme) private var scheme

    /// Values arrive already converted to the display unit (price per lb, per gal…).
    private var values: [Double] { series.flatMap { $0.points.map(\.1) } }
    private var domain: ClosedRange<Double> { ChartScale.priceDomain(values, including: target) }
    /// A LineMark needs two samples to draw a segment. A watch that has been checked once has one
    /// sample per store, so every series is undrawable and the chart is a bare grid — which is
    /// exactly what shipped. Points are always drawn so a single sample is still visible, which is
    /// what `LineChart` in public/js/charts.js has always done (it emits a circle per observation).
    private var hasAnyLine: Bool { series.contains { $0.points.count > 1 } }

    /// Duplicate keys in a foreground-style scale domain have no defined mapping; two chains can
    /// share a short name, so keep the first of each.
    private var styleScale: (domain: [String], range: [Color], symbols: [BasicChartSymbolShape]) {
        var seen = Set<String>()
        var labels: [String] = []
        var colors: [Color] = []
        var symbols: [BasicChartSymbolShape] = []
        for s in series where seen.insert(s.label).inserted {
            let slot = AppState.shared.colorSlot(for: s.id)
            labels.append(s.label)
            colors.append(StorePalette.color(slot: slot, dark: scheme == .dark))
            symbols.append(StorePalette.symbol(slot: slot))
        }
        return (labels, colors, symbols)
    }

    var body: some View {
        let domain = self.domain
        let format = PriceAxisFormat.forDomain(domain)
        let scale = styleScale
        VStack(alignment: .leading, spacing: 6) {
            Chart {
                ForEach(series) { s in
                    let slot = AppState.shared.colorSlot(for: s.id)
                    let color = StorePalette.color(slot: slot, dark: scheme == .dark)
                    let dash = StorePalette.dash(slot: slot)
                    ForEach(Array(s.points.enumerated()), id: \.offset) { _, pt in
                        LineMark(x: .value("Date", pt.0), y: .value("Unit price", pt.1), series: .value("Store", s.label))
                            .interpolationMethod(.stepEnd)
                            // Shape and dash carry the identity alongside the hue; see
                            // `StorePalette.symbols`. A butt cap, because a round cap on a short
                            // dash smears the pattern back into a solid line.
                            .lineStyle(StrokeStyle(lineWidth: 2, lineCap: dash.isEmpty ? .round : .butt, dash: dash))
                            .foregroundStyle(color)
                            .accessibilityHidden(true)
                        PointMark(x: .value("Date", pt.0), y: .value("Unit price", pt.1))
                            .symbol(StorePalette.symbol(slot: slot))
                            .symbolSize(34)
                            .foregroundStyle(color)
                            .accessibilityLabel("\(s.label), \(pt.0.formatted(date: .abbreviated, time: .omitted))")
                            .accessibilityValue("\(Money.unit(pt.1 / unit.factor, unit)) per \(unit.label)")
                    }
                }
                if let target {
                    // Dashed rather than a second green: a store's series can be drawn in the
                    // palette's green (0x009E73), and hue alone would not tell them apart.
                    RuleMark(y: .value("Target", target))
                        .foregroundStyle(.secondary)
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .accessibilityLabel("Target price")
                        .accessibilityValue("\(Money.unit(target / unit.factor, unit)) per \(unit.label)")
                }
            }
            .chartYScale(domain: domain)
            .chartForegroundStyleScale(domain: scale.domain, range: scale.range)
            // The legend swatch carries the marker shape too, so a reader who cannot separate two
            // hues can still match a line to its store name.
            .chartSymbolScale(domain: scale.domain, range: scale.symbols)
            .chartLegend(position: .bottom, spacing: 8)
            .chartYAxis { AxisMarks(position: .leading) { v in
                AxisGridLine()
                AxisValueLabel { if let d = v.as(Double.self) { Text(format.label(d)).font(.caption2) } }
            } }
            .frame(height: 180)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Unit price per store over time, price per \(unit.label)")
            .accessibilityValue(summary)

            if !hasAnyLine && !series.isEmpty {
                Text("Checked once so far — each dot is one store's price. Lines appear once a store has been checked twice.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private var summary: String {
        let v = values.filter(\.isFinite)
        guard let low = v.min(), let high = v.max() else { return "No prices recorded yet" }
        return "\(series.count) stores, \(Money.unit(low / unit.factor, unit)) to \(Money.unit(high / unit.factor, unit)) per \(unit.label)"
    }
}

// MARK: - Misc

/// Rotating nationwide stats facts while a search runs.
struct FactTicker: View {
    @State private var line = NationalStats.shared.randomLine()
    let timer = Timer.publish(every: 6, on: .main, in: .common).autoconnect()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "lightbulb").foregroundStyle(.yellow)
            Text(line).font(.footnote).foregroundStyle(.secondary).animation(.easeInOut, value: line)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        // Text that changes by itself every 6 s is motion too, and VoiceOver loses its place in it.
        .onReceive(timer) { _ in if !reduceMotion { line = NationalStats.shared.randomLine() } }
    }
}

struct InfoBanner: View {
    enum Kind { case info, warn, bad, good }
    var kind: Kind = .info
    var symbol = "info.circle"
    let text: String
    var action: (title: String, run: () -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: symbol).foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 6) {
                Text(text).font(.footnote).foregroundStyle(.primary)
                if let action { Button(action.title, action: action.run).font(.footnote.weight(.semibold)) }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private var tint: Color {
        switch kind {
        case .info: return .blue
        case .warn: return .orange
        case .bad: return .red
        case .good: return .green
        }
    }
}

struct ProBadge: View {
    var body: some View {
        Text("PRO")
            .font(.caption2.weight(.black))
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(Color.accentColor.opacity(0.18), in: RoundedRectangle(cornerRadius: 4))
            .foregroundStyle(Color.accentColor)
    }
}

extension View {
    @ViewBuilder func hidden(_ condition: Bool) -> some View {
        if condition { self.hidden() } else { self }
    }
}

// MARK: - iPad adaptivity
//
// The app is universal, so every screen has to work at 1024pt+ as well as on a phone. A plain
// SwiftUI List or ScrollView happily stretches a line of text across a 13" iPad, which is both
// ugly and genuinely hard to read. These keep content at a sane measure without needing a
// separate iPad layout for screens whose content is naturally one column.

/// Constrains content to a readable width on regular-width devices.
///
/// For content *inside* a page — a pushed screen or a sheet whose title is inline, and therefore
/// centred over whatever sits beneath it. Callers today: AboutPricesView, DealDetailView,
/// OccasionView, FavoriteDealsView (all inline-titled), OnboardingView's store step (no navigation
/// title; its heading is part of the content).
///
/// **Not** for a tab's root screen with a *large* navigation title. A large title is laid out at
/// the navigation bar's own leading margin, which is the window's, so a centred column under it
/// leaves the heading overhanging nothing — on a 13" iPad in landscape "Settings" sat 338pt to the
/// left of the form it introduced, with a grey slab of form floating in a white page. Those
/// screens use `readablePage` instead, which narrows the navigation stack itself so the title, the
/// search field and the content share one column.
struct ReadableWidth: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    var max: CGFloat = 760
    var alignment: Alignment = .center

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: sizeClass == .regular ? max : .infinity)
            .frame(maxWidth: .infinity, alignment: sizeClass == .regular ? alignment : .center)
    }
}

extension View {
    /// Keep this content at a readable measure on iPad and in wide windows.
    func readableWidth(_ max: CGFloat = 760, alignment: Alignment = .center) -> some View {
        modifier(ReadableWidth(max: max, alignment: alignment))
    }
}

/// Caps a whole tab — navigation bar, large title, search field and content — to one centred
/// column on regular-width devices, and fills the margins with the page's own background.
///
/// Apply it to the tab's `NavigationStack`, not to the content inside it. That is the point: the
/// large navigation title is positioned by the navigation bar, so the only way to put it on the
/// same leading edge as the content is to narrow the bar too. The App Store's own iPad tabs read
/// this way — title and content share a column, centred in the window.
///
/// Before this, every tab capped only its *content* and did it three different ways: Search and
/// Deals centred a column under a title pinned to the window edge (230pt and 138pt apart in 13"
/// landscape), Lists and Settings did the same through `readableWidth()`, and Tracking alone
/// leading-aligned its column and left the right half of a landscape screen empty. A round-1 note
/// claimed Search had been fixed through `readableWidth`; it has never called it. See
/// `IPadLandscapeTests`, which photographs every tab in landscape.
///
/// - Parameters:
///   - max: the column's width cap.
///   - background: what fills the margins. A grouped `List`/`Form` paints its own grey only inside
///     the column, so those pages pass `.systemGroupedBackground` or the column floats as a grey
///     slab in a white window.
struct ReadablePage: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    var max: CGFloat
    var background: Color?

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: sizeClass == .regular ? max : .infinity)
            .frame(maxWidth: .infinity)
            .background { (background ?? .clear).ignoresSafeArea() }
    }
}

extension View {
    /// See `ReadablePage`. Apply to a tab's root `NavigationStack`.
    func readablePage(_ max: CGFloat, background: Color? = nil) -> some View {
        modifier(ReadablePage(max: max, background: background))
    }
}

/// A search field in the navigation bar drawer that gives the tab bar back once it loses focus.
///
/// On an iPad (regular width, iPadOS 18 and later) the tab bar sits at the top of the screen,
/// and a presented search takes that space: the tabs and the toolbar go, and there is no Cancel
/// button. Submitting or hiding the keyboard left search presented for as long as the field held
/// text, so the only way back to Deals, List, Tracking or Settings was to clear the query and
/// then hide the keyboard. Found during App Store capture on 2026-10-20 (iPad Pro 13", iOS 27.0).
/// The text, and so the results or the deals filter, stay; only the presentation ends. On a phone the tab bar is at the
/// bottom and search keeps its Cancel button, so nothing changes there.
struct DrawerSearch: ViewModifier {
    @Binding var text: String
    let prompt: String
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var presented = false

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.modifier(FocusAware(text: $text, presented: $presented, prompt: prompt, wide: sizeClass == .regular))
        } else {
            content.searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
        }
    }

    @available(iOS 18.0, *)
    private struct FocusAware: ViewModifier {
        @Binding var text: String
        @Binding var presented: Bool
        let prompt: String
        let wide: Bool
        @FocusState private var focused: Bool

        func body(content: Content) -> some View {
            content
                .searchable(text: $text, isPresented: $presented, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
                .searchFocused($focused)
                .onChange(of: focused) { _, now in
                    guard !now, wide, presented else { return }
                    let kept = text
                    presented = false
                    // Ending the presentation empties the field the way Cancel does: on the Search
                    // tab through the binding, on the Deals tab without telling it (the grid stayed
                    // filtered under a blank field). Once the dismissal has finished, the query is
                    // set again so the field and the binding agree. Set while it is still
                    // animating, the field stays blank.
                    guard !kept.isEmpty else { return }
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(700))
                        guard !focused, !presented, text.isEmpty || text == kept else { return }
                        if text == kept {
                            text = ""
                            try? await Task.sleep(for: .milliseconds(50))
                        }
                        text = kept
                    }
                }
        }
    }
}

extension View {
    /// `.searchable` in the navigation bar drawer, always shown. See `DrawerSearch`.
    func drawerSearch(text: Binding<String>, prompt: String) -> some View {
        modifier(DrawerSearch(text: text, prompt: prompt))
    }
}
