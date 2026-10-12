import SwiftUI
import SwiftData

struct SearchView: View {
    @Bindable var model: SearchModel
    @Environment(AppState.self) private var app
    @Environment(Entitlements.self) private var pro
    @Query(sort: \RecentSearch.lastAt, order: .reverse) private var recents: [RecentSearch]

    @State private var text = ""
    @State private var options = CompareOptions()
    @State private var output = CompareOutput()
    @State private var detail: Product?
    @State private var showPaywall = false
    @State private var showStores = false
    @State private var limit = 40
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize

    /// True on iPad and in wide windows, where a single stretched column reads badly.
    private var isWide: Bool { sizeClass == .regular }

    /// Results in two columns — rows on the left, best price / ads / chart in a side column.
    ///
    /// Not at accessibility type sizes, even on iPad. The side column is 340pt, and at
    /// AccessibilityXXXL that holds about six characters of headline a line: "In this week's ads"
    /// took three lines, the hero's "/oz" was pushed under its own number, and the ads in it drew
    /// "$2.99 ea" as "$2.99" over "ea" (found by `IPadLandscapeTests` on a 13" iPad in
    /// landscape). At that size the phone's single stacked column is the layout that works, and
    /// the iPad page is wide enough to give each block the full width.
    private var twoColumn: Bool { isWide && !typeSize.isAccessibilitySize }

    private let staples = ["milk", "eggs", "bananas", "chicken breast", "ground beef", "butter", "bread", "coffee", "avocados", "strawberries", "cheddar cheese", "orange juice"]

    private struct Signature: Equatable {
        var query: String
        var counts: String
        var options: CompareOptions
        var prefs: PricePrefs
    }

    private var signature: Signature {
        Signature(query: model.query,
                  counts: model.results.keys.sorted().map { "\($0)\(model.results[$0]?.items.count ?? 0)" }.joined(),
                  options: options, prefs: app.prefs)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if model.query.isEmpty {
                        idleContent
                    } else {
                        resultsContent
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.immediately)
            .navigationTitle(model.query.isEmpty ? "Cartworth" : model.query)
            .navigationBarTitleDisplayMode(model.query.isEmpty ? .large : .inline)
            .searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search any food item")
            .searchSuggestions {
                if !text.isEmpty {
                    ForEach(suggestions, id: \.self) { s in
                        Text(s).searchCompletion(s)
                    }
                }
            }
            .onSubmit(of: .search) { start(text) }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showStores = true } label: {
                        Label("\(app.selectedChainIds.count) stores", systemImage: "storefront")
                    }
                    .font(.footnote)
                }
                if !model.query.isEmpty {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { start(model.query, fresh: true) } label: { Image(systemName: "arrow.clockwise") }
                            .disabled(model.isRunning)
                    }
                }
            }
            .sheet(item: $detail) { p in
                ProductDetailView(product: p, unit: output.unit, prefs: app.prefs)
            }
            .sheet(isPresented: $showPaywall) { PaywallView(reason: "Unlimited searches") }
            .sheet(isPresented: $showStores) {
                NavigationStack {
                    StorePickerList()
                        .navigationTitle("Your stores")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showStores = false } } }
                }
            }
            .task(id: signature) { recompute() }
            .refreshable { if !model.query.isEmpty { start(model.query, fresh: true) } }
        }
        // Keep lines readable instead of letting them run the full width of a 13" iPad — but cap
        // the whole stack, not the scroll content. Capping the content (as this did, at 920)
        // centred the results under a "Cartworth" title and a search field that stayed pinned to
        // the window edge: 56pt apart in portrait, 228pt in landscape. 1180 leaves portrait
        // (1032pt) uncapped and gives the two-column results real width in landscape.
        .readablePage(1180)
    }

    // MARK: idle

    private var idleContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(Seasonal.featured()) { occasion in
                NavigationLink {
                    OccasionView(occasion: occasion)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: occasion.symbol).font(.title2).foregroundStyle(Color.accentColor)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(occasion.name) \(occasion.whenText)")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                            Text(occasion.blurb).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                    .padding(12)
                    .background(Color.accentColor.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }

            if !recents.isEmpty {
                sectionHeader("Recent")
                chipSection(recents.prefix(8).map(\.q))
            }

            sectionHeader("Staples")
            chipSection(staples)

            let season = Seasonal.season()
            sectionHeader("In season — usually the cheapest produce")
            chipSection(season.produce)

            if !pro.isPro {
                InfoBanner(kind: .info, symbol: "sparkles",
                           text: "You have \(UsageMeter.shared.remainingFreeSearches) free searches today. Cartworth Pro unlocks unlimited searches, price alerts, recipe lists and trip planning.",
                           action: ("See Pro", { showPaywall = true }))
            }

            VStack(alignment: .leading, spacing: 8) {
                sectionHeader("How it compares")
                Label("Every price becomes a unit price — per gallon, per pound, per dozen — so package sizes compare fairly.", systemImage: "scalemass")
                Label("Only real matches count: “milk chocolate” never wins a search for milk.", systemImage: "checkmark.seal")
                Label("Sale prices, multi-buy deals and weekly-ad prices are all included.", systemImage: "tag")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
        // Leading, not centred. The "Cartworth" large title and the search field both run to the
        // window's own margin, so a centred 760pt column put Recent/Staples/In season a hundred
        // points to the right of the heading above them and read as a different page.
        .frame(maxWidth: isWide ? 760 : .infinity, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sectionHeader(_ t: String) -> some View {
        Text(t).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
    }

    /// A row of tappable search terms.
    ///
    /// At an accessibility type size a single term is wider than the whole screen — "disposable
    /// roasting pan" ran clean off the right edge with no ellipsis, no wrap and no scroller, so
    /// the rest of the term simply was not on the device. `FlowRow` now clamps a subview to the
    /// row width (see `FlowRow.measure`), which is what keeps the chip on screen; stacking on top
    /// of that is presentation, because at this size every chip is a full-width row anyway and a
    /// flow layout of one-per-line just adds ragged gaps. Below the threshold, nothing changes.
    @ViewBuilder
    private func chipSection(_ terms: [String]) -> some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(terms, id: \.self) { chipButton($0) }
            }
        } else {
            FlowRow(spacing: 8) {
                ForEach(terms, id: \.self) { chipButton($0) }
            }
        }
    }

    /// One tappable term. Deliberately no `lineLimit`: the term wraps inside its own capsule
    /// rather than being cut off, because a chip truncated to "disposable roastin…" is a search
    /// the reader cannot identify. Wrapping costs vertical space, which this screen has.
    private func chipButton(_ term: String) -> some View {
        Button { start(term) } label: {
            Text(term).multilineTextAlignment(.leading)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    /// See the note where these are used: one line, never broken inside a word.
    private func actionLabel(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }

    // MARK: results

    // On a phone everything stacks. On iPad (and a wide window) the best-price card, the ads and
    // the per-store chart move into a side column, the way the website lays them out, so the
    // product rows don't stretch to 1000pt and become unreadable.
    private var resultsContent: some View {
        Group {
            if twoColumn {
                HStack(alignment: .top, spacing: 20) {
                    VStack(alignment: .leading, spacing: 16) { resultsMain }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 16) { resultsAside }
                        .frame(width: 340)
                }
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    resultsAside
                    resultsMain
                }
            }
        }
    }

    /// The best-price card, this week's ads and the per-store chart.
    @ViewBuilder
    private var resultsAside: some View {
        if let best = output.bestPerStore.first, let unit = output.unit {
            HeroBestCard(row: best, unit: unit, runnerUp: output.bestPerStore.dropFirst().first, prefs: app.prefs) {
                detail = best.product
            }
        }

        if !model.ads.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("In this week’s ads", systemImage: "tag")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(model.ads.count)").font(.caption).foregroundStyle(.secondary)
                }
                if twoColumn || typeSize.isAccessibilitySize {
                    // A horizontal carousel in a narrow side column hides most of its content,
                    // so stack the ads instead when there is vertical room — each one the full
                    // width of the column, not a phone card's 230pt.
                    //
                    // Stacked at accessibility sizes too, on every device. There each card is
                    // several hundred points wide, so the carousel shows one card and cuts the
                    // next one's price at the edge of the column: on a 13" iPad in landscape at
                    // AccessibilityXXXL, "2 for $5.00" was drawn as "2 for $5.(" and a "$16.99"
                    // sat half past the window (found by `IPadLandscapeTests`). A price cut by an
                    // edge is a clipped price.
                    VStack(spacing: 8) {
                        ForEach(model.ads.prefix(4)) { d in
                            NavigationLink { DealDetailView(deal: d) } label: { DealMiniCard(deal: d, fill: true) }
                                .buttonStyle(.plain)
                        }
                    }
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(model.ads.prefix(12)) { d in
                                NavigationLink { DealDetailView(deal: d) } label: { DealMiniCard(deal: d) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    // Bleed to the screen edge on a phone only; on iPad the page is a capped
                    // column and the margins beside it are not this scroller's to draw in.
                    .scrollClipDisabled(!isWide)
                }
            }
        }

        if output.bestPerStore.count > 1, let unit = output.unit {
            VStack(alignment: .leading, spacing: 10) {
                // Sharing a line, the heading was squeezed into a one-word column and broken as
                // "Cheap- / est / match / per / store" while "per fl oz" sat beside it. Stack the
                // two at accessibility sizes so each gets the full width.
                let heading = Text("Cheapest match per store").font(.subheadline.weight(.semibold))
                let unitNote = Text("per \(unit.label)").font(.caption).foregroundStyle(.secondary)
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 2) {
                        heading
                        unitNote
                    }
                } else {
                    HStack {
                        heading
                        Spacer()
                        unitNote
                    }
                }
                BestPerStoreChart(rows: output.bestPerStore, unit: unit) { detail = $0.product }
                if let note = PriceProvenance.chartFootnote(hasOnline: output.bestPerStore.contains { $0.product.priceBasis == .online },
                                                            hasNational: output.bestPerStore.contains { $0.product.priceBasis == .national }) {
                    Text(note).font(.caption2).foregroundStyle(.tertiary)
                }
            }
            .padding(12)
            .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        }
    }

    /// Store status, filters and the product rows themselves.
    @ViewBuilder
    private var resultsMain: some View {
        StoreStatusStrip(model: model) { id in start(model.query, fresh: true, only: [id]) }

        if let err = model.error {
            InfoBanner(kind: .bad, symbol: "exclamationmark.triangle", text: err)
        }

        if model.isRunning && !model.anyResults {
            FactTicker()
            ForEach(0..<4, id: \.self) { _ in SkeletonRow() }
        }

        if model.anyResults {
            FilterBar(options: $options, output: output)
        }

        if !output.rows.isEmpty {
            LazyVStack(spacing: 0) {
                ForEach(output.rows.prefix(limit)) { row in
                    ProductRowView(row: row, unit: output.unit, isBest: row.id == output.bestPerStore.first?.id, prefs: app.prefs) {
                        detail = row.product
                    }
                    Divider()
                }
            }
            if output.rows.count > limit {
                Button("Show \(min(40, output.rows.count - limit)) more") { limit += 40 }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
            }
            Text(footerText).font(.caption).foregroundStyle(.tertiary)
        } else if !model.isRunning {
            emptyState
        }

        if model.anyResults {
            // "Watch price" rendered as "Wat / ch / pri / ce" inside its own capsule at
            // accessibility sizes. Same remedy as the filter menus: pin each label to one line so
            // it cannot break inside a word, and stop the two sharing a line when there is no
            // longer room for both.
            let actions = Group {
                Button { addSearchToList() } label: { actionLabel("Add to list", "plus") }
                    .buttonStyle(.bordered)
                Button { watchSearch() } label: { actionLabel("Watch price", "star") }
                    .buttonStyle(.bordered)
            }
            Group {
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) { actions }
                } else {
                    HStack(spacing: 10) { actions }
                }
            }
            .font(.footnote)
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label(model.anyResults ? "Nothing matches those filters" : "No prices found", systemImage: model.anyResults ? "line.3.horizontal.decrease.circle" : "magnifyingglass")
        } description: {
            Text(model.anyResults
                 ? "\(output.total) products came back, but none pass the current filters."
                 : "None of your stores returned “\(model.query)”. Try a simpler name, or check the spelling.")
        } actions: {
            if model.anyResults {
                Button("Show everything") {
                    options = CompareOptions(strictness: .everything, sort: options.sort)
                }
            }
        }
    }

    private var footerText: String {
        var parts = ["Showing \(min(output.rows.count, limit)) of \(output.total) products"]
        if options.strictness != .everything && output.hiddenWeak > 0 { parts.append("\(output.hiddenWeak) weaker matches hidden") }
        if let at = model.finishedAt { parts.append("checked \(at.formatted(date: .omitted, time: .shortened))") }
        return parts.joined(separator: " · ")
    }

    private var suggestions: [String] {
        let t = text.lowercased()
        let pool = recents.map(\.q) + staples
        return Array(Set(pool.filter { $0.contains(t) && $0 != t })).sorted().prefix(6).map { $0 }
    }

    // MARK: actions

    private func start(_ q: String, fresh: Bool = false, only: [String]? = nil) {
        guard !q.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        if !pro.isPro && !UsageMeter.shared.canSearch() {
            showPaywall = true
            return
        }
        text = q
        limit = 40
        if only == nil { options = CompareOptions(strictness: options.strictness, sort: options.sort) }
        model.run(q, fresh: fresh, only: only)
    }

    private func recompute() {
        output = Comparer.compute(query: model.query, results: model.results, history: model.history, options: options, prefs: app.prefs, storeOrder: app.selectedChainIds)
    }

    private func addSearchToList() {
        let ctx = Persistence.container.mainContext
        ctx.insert(ListEntry(text: ([model.query] + options.include).joined(separator: " ")))
        try? ctx.save()
    }

    private func watchSearch() {
        let ctx = Persistence.container.mainContext
        let w = WatchItem(query: model.query, label: ([model.query] + options.include).joined(separator: " "), include: options.include, exclude: options.exclude,
                          dim: output.dim?.rawValue, displayUnit: output.unit?.rawValue)
        ctx.insert(w)
        try? ctx.save()
        Task { await WatchService.refresh(w, fresh: false) }
        Task { _ = await BackgroundRefresh.requestPermission() }  // see TrackingView.addWatch
    }
}

// MARK: - Pieces

struct SkeletonRow: View {
    @State private var shimmer = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 8).frame(width: 54, height: 54)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4).frame(height: 13)
                RoundedRectangle(cornerRadius: 4).frame(width: 120, height: 10)
            }
            Spacer()
            RoundedRectangle(cornerRadius: 4).frame(width: 60, height: 18)
        }
        .foregroundStyle(Color.secondary.opacity(shimmer ? 0.10 : 0.20))
        .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: shimmer)
        .onAppear { if !reduceMotion { shimmer = true } }  // a pulsing placeholder is motion; Reduce Motion keeps it still
        .padding(.vertical, 6)
    }
}

struct StoreStatusStrip: View {
    let model: SearchModel
    var retry: (String) -> Void
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(model.order, id: \.self) { id in
                    if let r = model.results[id] {
                        chip(r)
                    }
                }
            }
        }
        // See the note on `FilterBar.chipScroller`. This strip is the worse of the two: it holds
        // one chip per store, so it runs the full window width as soon as a dozen stores report
        // in, and unclipped it was drawn right over the aside's BEST PRICE card on iPad.
        .scrollClipDisabled(sizeClass != .regular)
    }

    @ViewBuilder
    private func chip(_ r: StoreResult) -> some View {
        let name = RetailerCatalog.byId[r.retailerId]?.short ?? r.retailerId
        switch r.status {
        case .loading:
            label { HStack(spacing: 5) { ProgressView().controlSize(.mini); Text(name) } }
        case .ok:
            label {
                HStack(spacing: 5) {
                    StoreDot(storeId: r.retailerId)
                    Text(name).fontWeight(.semibold)
                    Text("\(r.items.count)").foregroundStyle(.secondary)
                    if r.stale != nil {
                        Image(systemName: "clock.badge.exclamationmark").foregroundStyle(.orange)
                            .accessibilityHidden(true)
                        if let saved = r.savedAt {
                            // Re-drawn every minute, so the age keeps up while results stay on screen.
                            TimelineView(.periodic(from: .now, by: 60)) { _ in
                                Text(saved, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                                    .foregroundStyle(.orange)
                                    .accessibilityLabel("saved prices from \(saved.formatted(.relative(presentation: .named))); the store did not answer just now")
                            }
                        } else {
                            Text("saved").foregroundStyle(.orange)
                                .accessibilityLabel("saved prices; the store did not answer just now")
                        }
                    }
                }
            }
        case .empty:
            label { HStack(spacing: 5) { StoreDot(storeId: r.retailerId); Text(name); Text("none").foregroundStyle(.secondary) } }
        case .adsOnly:
            label { HStack(spacing: 5) { StoreDot(storeId: r.retailerId); Text(name); Text("ads").foregroundStyle(.secondary) } }.opacity(0.7)
        case .error(let msg):
            Button { retry(r.retailerId) } label: {
                HStack(spacing: 5) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(name).fontWeight(.semibold)
                    Text("retry").foregroundStyle(.secondary)
                }
                .font(.caption)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Color.orange.opacity(0.12), in: Capsule())
            }
            .buttonStyle(.plain)
            .help(msg)
            .accessibilityHint("\(msg). Double-tap to try again.")
        }
    }

    private func label<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        content()
            .font(.caption)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Color.secondary.opacity(0.1), in: Capsule())
    }
}

struct HeroBestCard: View {
    let row: ComparedRow
    let unit: DisplayUnit
    var runnerUp: ComparedRow?
    var prefs: PricePrefs
    var onTap: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The one number the whole app exists to report, so it scales like everything around it.
    ///
    /// As a flat `size: 40` it did not scale at all, and the decoration did: at AccessibilityXXXL
    /// the price rendered *smaller* than its own "/fl oz" suffix (`.title3`) and smaller than the
    /// store tag under it (`.caption`). Someone who has chosen the largest text size because they
    /// cannot read small text was getting the price at its default size and the trimmings at
    /// triple.
    @ScaledMetric(relativeTo: .largeTitle) private var heroSize: CGFloat = 40

    /// The line under the headline, as `Compare.savingsClaim` words it — the same rules and the
    /// same sentence as shared/compare.js `savingsClaim`.
    ///
    /// This card used to print "N% less than <store>" over ANY two prices, so ALDI's Kenosha shelf
    /// price read "0.08¢/fl oz (1%) less than Walmart" against Instacart's chain-wide listing — a
    /// store the app itself says is not near you, at a price it says may differ either way. A
    /// percentage between two prices the app says are not comparable is a wrong number. Now: an
    /// exact figure only between two prices of the same basis, neither estimated; across bases,
    /// "less than" only when the gap survives each basis's spread, otherwise "about the same";
    /// and nothing at all against a flagged price.
    private var savingsLine: String? {
        guard let r = runnerUp, let a = row.perBase, let b = r.perBase,
              let claim = Compare.savingsClaim(best: row.product, perBase: a, est: row.est, runnerUp: r.product, perBase: b, est: r.est)
        else { return nil }
        return claim.text
            .replacingOccurrences(of: "{amount}", with: claim.diffPerBase.map { Money.unit($0, unit) } ?? "")
            .replacingOccurrences(of: "{unit}", with: unit.label)
            .replacingOccurrences(of: "{store}", with: RetailerCatalog.byId[claim.storeId]?.short ?? claim.storeId)
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                Text("BEST PRICE").font(.caption2.weight(.bold)).foregroundStyle(.secondary).tracking(0.8)
                // At an accessibility size the number and its unit stop sharing a line rather
                // than fight over the width. Note the price shrinks to fit (`minimumScaleFactor`)
                // and is never truncated or wrapped: a smaller rendering of $11.28 is still
                // $11.28, whereas "$11.2" over "8" is a different number.
                let price = Text(Money.unit(row.perBase ?? 0, unit))
                    .font(.system(size: heroSize, weight: .bold, design: .default))
                let suffix = Text("/\(unit.label)").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 0) {
                        price.monospacedDigit().lineLimit(1).minimumScaleFactor(0.4)
                        suffix.lineLimit(1)
                    }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        price.monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                        suffix
                    }
                }
                // FlowRow, not HStack: "Jewel-Osco" beside "online (Instacart) price" does not fit
                // one line at an accessibility size, and an HStack would cut the provenance badge
                // to "online (Insta…" — the one word that says where the number came from.
                FlowRow(spacing: 6) {
                    StoreTag(storeId: row.product.storeId, full: true)
                    if row.est { Badge(text: "est.", kind: .neutral) }
                    if row.product.priceBasis != .shelf { Badge(text: PriceProvenance.label(row.product.priceBasis), kind: .outline) }
                }
                // The name may be shortened; the package price may not. On one line with a lineLimit, a
                // long name at a large text size cut the price itself ("… · $1…").
                Text(row.product.name)
                    .font(.footnote).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.leading)
                Text("\(row.product.size.isEmpty ? "" : "\(row.product.size) · ")\(Money.full(Compare.effectivePrice(row.product, prefs)))\(row.product.soldBy == .lb ? "/lb" : "")")
                    .font(.footnote).foregroundStyle(.secondary).unbreakablePrice()
                if let line = savingsLine {
                    Text(line).font(.caption).foregroundStyle(.tertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.green.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct FilterBar: View {
    @Binding var options: CompareOptions
    let output: CompareOutput
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.horizontalSizeClass) private var sizeClass

    /// `lineLimit(1)` plus `fixedSize` is what actually stops the mid-word fragmentation: without
    /// it the label is allowed to break inside a word to fit the space it was given, and at an
    /// accessibility size these three rendered as one-character columns — "U / ni / t / pr / ic /
    /// e", "p / er / fl / oz", "M / at / c / h / e / s" — filling most of the screen and reading
    /// as nothing at all. These three controls pick the sort order, the comparison unit and the
    /// strictness, which between them decide *which price the app calls best*, so a user who
    /// cannot read them cannot check the answer. Lifted verbatim from `DealsView.filterLabel`,
    /// which had already fixed this on the other tab.
    private func filterLabel(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.footnote)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // At accessibility sizes the three menus stop sharing a line, the same switch
            // DealsView makes: side by side there is not enough width left for any of them.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) { menus }
            } else {
                HStack(spacing: 8) {
                    menus
                    Spacer()
                }
            }
            chipScroller
        }
    }

    @ViewBuilder
    private var menus: some View {
        Group {
                Menu {
                    Picker("Sort", selection: $options.sort) {
                        ForEach(CompareOptions.Sort.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                } label: {
                    filterLabel(options.sort.label, "arrow.up.arrow.down")
                }
                if let dim = output.dim {
                    Menu {
                        Picker("Unit", selection: Binding(get: { options.unit ?? output.unit ?? .oz }, set: { options.unit = $0 })) {
                            ForEach(DisplayUnit.units(for: dim)) { u in Text("per \(u.label)").tag(u) }
                        }
                        if output.dims.count > 1 {
                            Divider()
                            Picker("Compare by", selection: Binding(get: { options.dim ?? dim }, set: { options.dim = $0; options.unit = nil })) {
                                ForEach(output.dims, id: \.self) { d in Text("by \(d.label)").tag(d) }
                            }
                        }
                    } label: {
                        filterLabel("per \(output.unit?.label ?? "")", "scalemass")
                    }
                }
                Menu {
                    Picker("Show", selection: $options.strictness) {
                        ForEach(CompareOptions.Strictness.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                } label: {
                    filterLabel(options.strictness.label, "line.3.horizontal.decrease")
                }
        }
    }

    private var chipScroller: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                toggleChip("On sale", isOn: $options.saleOnly, count: output.counts.sale)
                toggleChip("Organic", isOn: $options.organic, count: output.counts.organic)
                toggleChip("Store brand", isOn: $options.storeBrand, count: output.counts.storeBrand)
                toggleChip("In stock", isOn: $options.inStock, count: nil)
                ForEach(output.chips, id: \.chip) { c in
                    refineChip(c)
                }
            }
        }
        // Let the chips bleed to the screen edge on a phone, where this scroller owns the full
        // width — but never on iPad. `resultsContent` puts this in the left column of a two-column
        // layout, and an unclipped scroller is not bounded by that column: at accessibility sizes
        // the chip row is several hundred points wider than the column and was drawn straight
        // across the aside, covering the words "BEST PRICE" and the store name under the headline
        // figure. Today it lands on the label; with a different chip set it lands on the digits.
        .scrollClipDisabled(sizeClass != .regular)
    }

    private func toggleChip(_ title: String, isOn: Binding<Bool>, count: Int?) -> some View {
        Button {
            isOn.wrappedValue.toggle()
        } label: {
            HStack(spacing: 4) {
                Text(title)
                if let count, count > 0 { Text("\(count)").foregroundStyle(.secondary) }
            }
            .font(.caption)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(isOn.wrappedValue ? Color.accentColor : Color.secondary.opacity(0.12), in: Capsule())
            .foregroundStyle(isOn.wrappedValue ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func refineChip(_ c: Match.RefineChip) -> some View {
        let included = options.include.contains(c.chip)
        let excluded = options.exclude.contains(c.chip)
        return Button {
            if included {
                options.include.removeAll { $0 == c.chip }
                options.exclude.append(c.chip)
            } else if excluded {
                options.exclude.removeAll { $0 == c.chip }
            } else {
                options.include.append(c.chip)
            }
        } label: {
            HStack(spacing: 4) {
                Text(c.chip).strikethrough(excluded)
                if !included && !excluded { Text("\(c.count)").foregroundStyle(.secondary) }
            }
            .font(.caption)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(included ? Color.accentColor : excluded ? Color.red.opacity(0.18) : Color.secondary.opacity(0.12), in: Capsule())
            .foregroundStyle(included ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}
