import SwiftUI
import SwiftData

struct DealsView: View {
    @Environment(AppState.self) private var app
    @Environment(Entitlements.self) private var pro
    @Environment(SearchModel.self) private var search
    @Query private var favorites: [Favorite]

    @State private var model = DealsModel.shared
    @State private var week: AdWeek = .current
    @State private var text = ""
    @State private var store: String?
    @State private var category: GroceryCategory?
    /// At accessibility text sizes the three filter menus cannot share one row: each label needs
    /// more width than a third of the screen, so SwiftUI compresses them and breaks the words
    /// themselves. "Category" rendered as "Cat / eg / ory". Stack them instead.
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var type: DealType = .all
    @State private var sort: DealSort = .best
    @State private var groceryOnly = true
    @State private var limit = 40
    @State private var showPaywall = false
    @Environment(\.horizontalSizeClass) private var sizeClass

    /// True on iPad and in wide windows. Deals are the one screen here that genuinely wants the
    /// extra width — it is a grid of cards — so it keeps a wide measure rather than a capped
    /// column, but the cards themselves grow so their store names stop truncating.
    private var isWide: Bool { sizeClass == .regular }

    enum DealType: String, CaseIterable, Identifiable {
        case all, bigPercent, bogo, multi, coupon, noStrings
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "All deals"
            case .bigPercent: return "30% off or more"
            case .bogo: return "Buy one, get one"
            case .multi: return "Multi-buy"
            case .coupon: return "Digital coupon"
            case .noStrings: return "No coupon or card"
            }
        }
    }

    enum DealSort: String, CaseIterable, Identifiable {
        case best, percent, price, ending, store
        var id: String { rawValue }
        var label: String {
            switch self {
            case .best: return "Best deals"
            case .percent: return "Biggest % off"
            case .price: return "Lowest price"
            case .ending: return "Ending soonest"
            case .store: return "Store"
            }
        }
    }

    private var deals: [Deal] { model.deals[week] ?? [] }

    private var filtered: [Deal] {
        let terms = Match.tokens(text)
        var list = deals.filter { d in
            (!groceryOnly || d.category != .other)
                && (store == nil || d.retailerId == store)
                && (category == nil || d.category == category)
                && matchesType(d)
        }
        if !terms.isEmpty {
            list = list.filter { d in
                let words = Set(Match.tokens("\(d.name) \(d.brand) \(d.description ?? "")"))
                return terms.allSatisfy { t in words.contains { $0.hasPrefix(t) } }
            }
        }
        switch sort {
        case .best: list.sort { $0.score > $1.score }
        case .percent: list.sort { ($0.pctOff ?? -1) > ($1.pctOff ?? -1) }
        case .price: list.sort { ($0.termsPending ? 1 : 0, $0.each ?? $0.price ?? .infinity) < ($1.termsPending ? 1 : 0, $1.each ?? $1.price ?? .infinity) }
        case .ending: list.sort { ($0.validTo ?? .distantFuture) < ($1.validTo ?? .distantFuture) }
        case .store: list.sort { ($0.retailerId, -$0.score) < ($1.retailerId, -$1.score) }
        }
        return list
    }

    private func matchesType(_ d: Deal) -> Bool {
        switch type {
        case .all: return true
        case .bigPercent: return (d.pctOff ?? 0) >= 30
        case .bogo: return d.terms?.kind == .bogo || d.terms?.kind == .bxgy
        case .multi: return d.qty > 1
        case .coupon: return d.needsCoupon
        case .noStrings: return !d.needsCoupon && !d.needsCard
        }
    }

    private var favoriteMatches: [String: [Deal]] {
        guard !favorites.isEmpty else { return [:] }
        return model.matches(terms: favorites.map(\.term), week: week)
    }

    /// A segmented control is UIKit-backed and keeps its own ~13pt label whatever the content size
    /// category is, so at AccessibilityXXXL it was the smallest text on a screen where everything
    /// else had tripled. It gates a Pro feature (next week's ads), so a reader who cannot see it
    /// cannot find the upsell either. Above the accessibility threshold this becomes a menu, whose
    /// label does scale. Two styles are two concrete types, so this is a branch, not a ternary.
    @ViewBuilder
    private var weekPicker: some View {
        let picker = Picker("Week", selection: $week) {
            Text("This week").tag(AdWeek.current)
            Text("Next week").tag(AdWeek.next)
        }
        if typeSize.isAccessibilitySize {
            picker.pickerStyle(.menu)
        } else {
            picker.pickerStyle(.segmented)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    weekPicker
                    // Two segments stretched across a 13" iPad are a 500pt hit area each.
                    .frame(maxWidth: isWide ? 420 : .infinity, alignment: .leading)
                    .onChange(of: week) { _, newValue in
                        if newValue == .next && !pro.isPro {
                            week = .current
                            showPaywall = true
                        } else {
                            Task { await load() }
                        }
                    }

                    if let err = model.errors[week] {
                        InfoBanner(kind: .bad, symbol: "exclamationmark.triangle", text: err, action: ("Try again", { Task { await load(fresh: true) } }))
                    }
                    if model.stale[week] == true {
                        InfoBanner(kind: .warn, symbol: "clock", text: "Showing the last weekly ads we loaded — the circular service isn’t responding right now.")
                    }
                    if let e = model.enrichment, e.running {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.mini)
                            Text("Reading deal details (multi-buy, BOGO, coupons)… \(e.done)/\(e.total)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }

                    if !favoriteMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Your favorites on sale", systemImage: "star.fill").font(.subheadline.weight(.semibold))
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    // Each deal once, in a stable order: a deal matching two favorites was listed
                                    // twice (duplicate ForEach ids) and the row reshuffled with dictionary order.
                                    ForEach(model.matchingDeals(terms: favorites.map(\.term), week: week).prefix(12)) { d in
                                        NavigationLink { DealDetailView(deal: d) } label: { DealMiniCard(deal: d) }.buttonStyle(.plain)
                                    }
                                }
                            }
                            .scrollClipDisabled(!isWide)   // see the store-chip row below
                        }
                        .padding(.bottom, 4)
                    }

                    ForEach(Seasonal.featured()) { occasion in
                        let matches = model.matchingDeals(terms: occasion.keywords, week: week)
                        NavigationLink { OccasionView(occasion: occasion) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: occasion.symbol).font(.title3).foregroundStyle(Color.accentColor)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(occasion.name) \(occasion.whenText)").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                    Text(matches.isEmpty ? occasion.blurb : "\(matches.count) matching deals in \(week == .next ? "next" : "this") week’s ads").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                            }
                            .padding(12)
                            .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }

                    filters

                    if model.loading.contains(week) && deals.isEmpty {
                        VStack(spacing: 10) {
                            ProgressView()
                            Text("Loading weekly ads…").font(.footnote).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 160)
                    } else if filtered.isEmpty {
                        ContentUnavailableView {
                            Label(deals.isEmpty ? "No weekly ads yet" : "No deals match", systemImage: "tag")
                        } description: {
                            Text(deals.isEmpty
                                 ? (week == .next ? "Next week’s ads usually post mid-week. Check back Tuesday or Wednesday." : "No circulars were found for your stores. Add more stores in Settings.")
                                 : "Try a different store, category or search.")
                        }
                        .frame(minHeight: 200)
                    } else {
                        Text("\(filtered.count) deals").font(.caption).foregroundStyle(.secondary)
                        // 150pt cards on a 1024pt screen give six columns of truncated store
                        // names ("Maria…", "Walm…"), and the store name is what identifies the
                        // retailer for anyone who can't rely on the colour dot.
                        // A 150pt minimum puts two cards side by side on a phone, which is right
                        // until the text triples: at that point a card is too narrow to name its
                        // own store ("Dol la…") or print its end date on one line. Give a card
                        // the full width instead once the type is that large.
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? (isWide ? 360 : 300) : (isWide ? 220 : 150)), spacing: 12)], spacing: 12) {
                            ForEach(filtered.prefix(limit)) { d in
                                NavigationLink { DealDetailView(deal: d) } label: { DealCard(deal: d) }.buttonStyle(.plain)
                            }
                        }
                        if filtered.count > limit {
                            Button("Show more deals") { limit += 60 }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .navigationTitle("Deals")
            .searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search deals")
            .refreshable { await load(fresh: true) }
            .task { if model.deals[week] == nil { await load() } }
            .onChange(of: text) { _, _ in limit = 40 }
            .sheet(isPresented: $showPaywall) { PaywallView(reason: "Next week’s ads") }
        }
        // Wide, but not unbounded: past ~1100pt the grid starts losing the top-to-bottom scan
        // that makes a deal wall usable, and a 13" landscape window is 1376pt. The cap is on the
        // stack, not the grid, so the "Deals" title and the search field share the grid's leading
        // edge — capping the grid alone put the title 138pt left of it in landscape.
        .readablePage(1100)
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    chip(title: "All stores", active: store == nil) { store = nil }
                    ForEach(storeCounts, id: \.0) { id, count in
                        chip(title: RetailerCatalog.byId[id]?.short ?? id, count: count, active: store == id, dot: id) {
                            store = store == id ? nil : id
                        }
                    }
                }
            }
            // Bleed to the screen edge on a phone, where this scroller owns the width. On iPad the
            // page is a capped column (`readablePage`), and an unclipped row would spill into the
            // margins beside it.
            .scrollClipDisabled(!isWide)
            filterMenus
        }
    }

    /// The three filter menus. One row normally; stacked at accessibility text sizes, where a
    /// shared row forces mid-word breaks and the filters become unreadable.
    @ViewBuilder
    private var filterMenus: some View {
        let menus = Group {
            Menu {
                Picker("Category", selection: $category) {
                    Text("Everything").tag(GroceryCategory?.none)
                    ForEach(categoryCounts, id: \.0) { c, n in Text("\(c.rawValue) (\(n))").tag(GroceryCategory?.some(c)) }
                }
            } label: { filterLabel(category?.rawValue ?? "Category", "square.grid.2x2") }
            Menu {
                Picker("Deal type", selection: $type) { ForEach(DealType.allCases) { Text($0.label).tag($0) } }
            } label: { filterLabel(type == .all ? "Deal type" : type.label, "tag") }
            Menu {
                Picker("Sort", selection: $sort) { ForEach(DealSort.allCases) { Text($0.label).tag($0) } }
                Divider()
                Toggle("Hide non-grocery", isOn: $groceryOnly)
            } label: { filterLabel(sort.label, "arrow.up.arrow.down") }
        }

        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) { menus }
        } else {
            HStack(spacing: 8) {
                menus
                Spacer()
            }
        }
    }

    /// `lineLimit(1)` plus `fixedSize` is what actually stops the mid-word fragmentation: without
    /// it the label is allowed to break inside a word to fit the space it was given.
    private func filterLabel(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.footnote)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }

    private var storeCounts: [(String, Int)] {
        var counts: [String: Int] = [:]
        for d in deals where (!groceryOnly || d.category != .other) { counts[d.retailerId, default: 0] += 1 }
        return counts.sorted { $0.value > $1.value }.map { ($0.key, $0.value) }
    }

    private var categoryCounts: [(GroceryCategory, Int)] {
        var counts: [GroceryCategory: Int] = [:]
        for d in deals where (store == nil || d.retailerId == store) { counts[d.category, default: 0] += 1 }
        return GroceryCategory.allCases.compactMap { c in counts[c].map { (c, $0) } }
    }

    private func chip(title: String, count: Int? = nil, active: Bool, dot: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let dot { StoreDot(storeId: dot) }
                // A store chip is in a horizontal scroller, so it may be as wide as it needs to be.
                // Without lineLimit it breaks the store NAME across lines at accessibility sizes,
                // and the name is what identifies the store: the colour dot alone cannot.
                Text(title).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                if let count { Text("\(count)").foregroundStyle(active ? Color.white.opacity(0.8) : .secondary) }
            }
            .font(.caption)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(active ? Color.accentColor : Color.secondary.opacity(0.12), in: Capsule())
            .foregroundStyle(active ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func load(fresh: Bool = false) async {
        limit = 40
        await model.load(week, fresh: fresh)
    }
}

struct DealCard: View {
    let deal: Deal
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                Rectangle().fill(Color.white).aspectRatio(4 / 3, contentMode: .fit)
                // Screenshot capture shows the tag placeholder instead of the ad clipping (`QAShot`).
                if !QAShot.hideRemoteImages, let url = deal.imageURL {
                    AsyncImage(url: url) { img in
                        img.resizable().scaledToFit().padding(6)
                    } placeholder: {
                        Image(systemName: "tag").foregroundStyle(.tertiary)
                    }
                    .aspectRatio(4 / 3, contentMode: .fit)
                } else {
                    Image(systemName: "tag").font(.title).foregroundStyle(.tertiary).frame(maxWidth: .infinity).aspectRatio(4 / 3, contentMode: .fit)
                }
                // A buy-one-get-one is checked FIRST, before the percentage.
                //
                // `DealTerms` assigns a BOGO `pct = 50` (Deals.swift), which is true of the pair
                // and false of the price printed on the card: `priceText` for one of these is the
                // ad's own "Single Item Price", the ordinary undiscounted shelf price. Pairing
                // that untouched number with a "50% off" badge told anyone scanning the grid that
                // the item is half price today — it is not, and the discount only exists if they
                // buy two. The offer is the honest headline, which is what the deal detail shows
                // and what the ad itself prints.
                if let offer = deal.terms?.offerBadge {
                    Badge(text: offer, kind: .sale).padding(6)
                } else if let pct = deal.pctOff {
                    Badge(text: "\(pct)% off", kind: .sale).padding(6)
                }
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                Text(deal.priceText.isEmpty ? (deal.story ?? "See ad") : deal.priceText)
                    .font(.title3.weight(.bold)).lineLimit(2).minimumScaleFactor(0.7)
                // Say what the big number is. On a BOGO it is the price of one item at full
                // price, not a reduced price, and without this line the card shows a bold dollar
                // figure directly under a discount badge.
                if deal.terms?.kind == .bogo, !deal.priceText.isEmpty {
                    Text("single item price").font(.caption2).foregroundStyle(.secondary)
                }
                if deal.termsPending {
                    Text("checking ad terms…").font(.caption2).foregroundStyle(.secondary)
                        .accessibilityLabel("Ad terms not loaded yet; this price may be for more than one, or per pound")
                }
                if deal.qty > 1, let each = deal.each {
                    Text("\(Money.full(each)) each").font(.caption).foregroundStyle(.secondary)
                }
                if let reg = deal.regular ?? ProductFactory.money(deal.regularText) {
                    Text("Reg. \(Money.full(reg))").font(.caption2).foregroundStyle(.tertiary)
                }
                if let m = deal.memberText { Text(m).font(.caption2.weight(.semibold)).foregroundStyle(Color.accentColor) }
                Text(deal.name).font(.caption.weight(.medium)).lineLimit(2).multilineTextAlignment(.leading)
                if let d = deal.description { Text(d).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                // Inside a two-column grid cell this footer had no room to share a line at an
                // accessibility size: the store name came out "Dol la…" (Dollar General or
                // Dollar Tree? both are in the catalogue) and the date fragmented into
                // "En / ds / Tue". Stack them instead, and pin the date to one line.
                let validity = Group {
                    if deal.week == .next, let from = deal.validFrom {
                        Text("Starts \(from.formatted(.dateTime.month(.abbreviated).day()))")
                            .font(.caption2).foregroundStyle(.secondary)
                            .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                    } else if let to = deal.validTo {
                        Text(endsText(to))
                            .font(.caption2).foregroundStyle(.secondary)
                            .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                    }
                }
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 4) {
                        StoreTag(storeId: deal.retailerId)
                        validity
                    }
                } else {
                    HStack(spacing: 5) {
                        StoreTag(storeId: deal.retailerId)
                        Spacer()
                        validity
                    }
                }
                FlowRow(spacing: 4) {
                    if deal.needsCoupon { Badge(text: "digital coupon", kind: .info) }
                    if deal.needsCard { Badge(text: "with card", kind: .info) }
                    if let l = deal.limit { Badge(text: "limit \(l)", kind: .neutral) }
                    if let m = deal.mustBuy { Badge(text: "buy \(m)", kind: .warn) }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.15)))
    }
}

/// A weekly-ad deal in miniature: the search screen's "In this week's ads" carousel (phone) and
/// column (iPad).
///
/// Fixed at 230pt with the text beside a 52pt thumbnail, the card had 148pt of text column. At
/// AccessibilityXXXL that could not hold "$2.99 ea" on one line — it was drawn as "$2.99" over
/// "ea", which `IPadLandscapeTests` flags as a wrapped price — nor a store tag and a badge side by
/// side, so "Mariano's" was broken into "Mar-" / "iano'" / "s" and the badge was cut to "cou…".
/// Three changes:
///   * at accessibility sizes the thumbnail goes above the text, not beside it, and in the iPad
///     column the card fills the column (`fill`) instead of sitting at a phone card's width;
///   * the price is one line and shrinks to fit — it never wraps (a wrapped price reads as a
///     different number the moment a break lands inside one);
///   * the store tag and the coupon badge flow, so each keeps its whole width and the badge
///     drops to the next line instead of squeezing the tag. The tag itself never breaks a word
///     (`StoreName`).
struct DealMiniCard: View {
    let deal: Deal
    /// Fill the container's width. The iPad results aside stacks these in a column; the phone
    /// carousel scrolls them sideways at a card width.
    var fill = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .headline) private var cardWidth: CGFloat = 230

    var body: some View {
        let stacked = typeSize.isAccessibilitySize
        Group {
            if stacked {
                VStack(alignment: .leading, spacing: 8) {
                    thumb
                    details
                }
            } else {
                HStack(spacing: 10) {
                    thumb
                    details
                }
            }
        }
        .padding(10)
        // A carousel card grows with the type size, but not past what a phone can show beside
        // the edge of the next one.
        .frame(width: fill ? nil : min(cardWidth, 300), alignment: .leading)
        .frame(maxWidth: fill ? .infinity : nil, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.15)))
    }

    @ViewBuilder
    private var thumb: some View {
        if !QAShot.hideRemoteImages, let url = deal.imageURL {
            AsyncImage(url: url) { img in img.resizable().scaledToFit() } placeholder: { Color.clear }
                .frame(width: 52, height: 52)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            // "2 for $5.00" and "$2.99 ea" are prices: one line, shrinking to fit, never wrapped.
            Text(deal.priceText.isEmpty ? (deal.story ?? "See ad") : deal.priceText)
                .font(.headline).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
            Text(deal.name).font(.caption).lineLimit(2).multilineTextAlignment(.leading).foregroundStyle(.primary)
            FlowRow(spacing: 4) {
                StoreTag(storeId: deal.retailerId)
                if deal.needsCoupon { Badge(text: "coupon", kind: .info) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

func endsText(_ to: Date) -> String { SaleDates.endsText(to) }
