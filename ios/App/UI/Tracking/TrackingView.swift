import SwiftUI
import SwiftData

struct TrackingView: View {
    @Environment(Entitlements.self) private var pro
    @Environment(Router.self) private var router
    @Environment(\.modelContext) private var ctx
    @Query(sort: \WatchItem.createdAt, order: .reverse) private var watches: [WatchItem]
    @Query(sort: \Favorite.createdAt, order: .reverse) private var favorites: [Favorite]
    @Query private var points: [WatchPoint]

    @State private var newWatch = ""
    @State private var newFavorite = ""
    @State private var refreshing: Set<UUID> = []
    @State private var showPaywall = false
    @State private var paywallReason = ""
    @State private var dealsModel = DealsModel.shared

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Watch an item — “milk 1 gal”, “large eggs”", text: $newWatch)
                            .onSubmit(addWatch)
                        Button(action: addWatch) { Image(systemName: "plus.circle.fill") }
                            .disabled(newWatch.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } header: {
                    Text("Price watch")
                } footer: {
                    Text("Cartworth re-checks watched items in the background and tells you when one hits your target or its lowest price yet.")
                }

                if watches.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label("Nothing watched yet", systemImage: "star")
                        } description: {
                            Text("Add the staples you buy every week to build your own price book.")
                        }
                    }
                } else {
                    ForEach(watches) { w in
                        Section {
                            WatchCard(watch: w, points: points.filter { $0.watchId == w.id }, refreshing: refreshing.contains(w.id),
                                      onRefresh: { Task { await refresh(w) } },
                                      onCompare: { router.compare(w.query) },
                                      onDelete: { delete(w) })
                        }
                    }
                }

                Section {
                    HStack {
                        TextField("Brand or ingredient — “Fairlife”, “salmon”", text: $newFavorite)
                            .onSubmit(addFavorite)
                        Button(action: addFavorite) { Image(systemName: "plus.circle.fill") }
                            .disabled(newFavorite.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    ForEach(favorites) { f in
                        let matches = dealsModel.matches(terms: [f.term])[f.term] ?? []
                        NavigationLink {
                            FavoriteDealsView(term: f.term, deals: matches)
                        } label: {
                            HStack {
                                Text(f.term.capitalized)
                                Spacer()
                                if matches.isEmpty {
                                    Text("no deals now").font(.caption).foregroundStyle(.secondary)
                                } else {
                                    Badge(text: "\(matches.count) on sale", kind: .good)
                                }
                            }
                        }
                    }
                    .onDelete { idx in
                        for i in idx { ctx.delete(favorites[i]) }
                        try? ctx.save()
                    }
                } header: {
                    HStack {
                        Text("Favorite brands & ingredients")
                        if !pro.isPro { ProBadge() }
                    }
                } footer: {
                    Text("We check your favorites against every weekly ad and alert you when one goes on sale.")
                }
            }
            .navigationTitle("Tracking")
            .toolbar {
                if !watches.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { Task { for w in watches { await refresh(w) } } } label: { Image(systemName: "arrow.clockwise") }
                            .disabled(!refreshing.isEmpty)
                    }
                }
            }
            .sheet(isPresented: $showPaywall) { PaywallView(reason: paywallReason) }
            .task { if dealsModel.deals[.current] == nil { await dealsModel.load(.current) } }
        }
        // The watch rows and their text fields ran the full width. This used to be the one tab
        // that got the title right, by leading-aligning a capped list — which put "Tracking" on
        // the list's edge but left the right 600pt of a landscape iPad empty. Capping the stack
        // keeps the title on the column's edge *and* centres the column. See `ReadablePage`.
        .readablePage(780, background: Color(.systemGroupedBackground))
    }

    private func addWatch() {
        let q = newWatch.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        if !pro.isPro && watches.count >= UsageMeter.freeWatchItems {
            paywallReason = "Unlimited price watches"
            showPaywall = true
            return
        }
        let w = WatchItem(query: q)
        ctx.insert(w)
        try? ctx.save()
        newWatch = ""
        Task { await refresh(w) }
        // Watch alerts need notification permission, and until now only adding a favorite asked for
        // it: someone who only watched prices never got their target alert. Asks once; a no is kept.
        Task { _ = await BackgroundRefresh.requestPermission() }
    }

    private func addFavorite() {
        let t = newFavorite.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        if !pro.isPro {
            paywallReason = "Favorite brands & sale alerts"
            showPaywall = true
            return
        }
        ctx.insert(Favorite(term: t))
        try? ctx.save()
        newFavorite = ""
        Task { _ = await BackgroundRefresh.requestPermission() }
    }

    private func refresh(_ w: WatchItem) async {
        refreshing.insert(w.id)
        defer { refreshing.remove(w.id) }
        await WatchService.refresh(w, fresh: true, context: ctx)
    }

    private func delete(_ w: WatchItem) {
        for p in points where p.watchId == w.id { ctx.delete(p) }
        ctx.delete(w)
        try? ctx.save()
    }
}

struct WatchCard: View {
    let watch: WatchItem
    let points: [WatchPoint]
    let refreshing: Bool
    var onRefresh: () -> Void
    var onCompare: () -> Void
    var onDelete: () -> Void

    @State private var showEdit = false
    @State private var expanded = false

    /// The watch card's headline price, scaled with Dynamic Type. See `HeroBestCard.heroSize`.
    @ScaledMetric(relativeTo: .title) private var heroSize: CGFloat = 28

    /// How much elapsed time a trend has to cover before it is drawn as a trend.
    ///
    /// The old gate was `points.count > 3`, a count across *all* stores. With ten stores a single
    /// refresh produces ten points, so the gate opened on the first check and the card rendered a
    /// ten-series "price history" whose x-axis spanned fifteen seconds, every line dead flat. That
    /// sits under a heading the paywall sells as "Know whether today's 'sale' is really a deal" —
    /// presenting two samples seconds apart as a trend implies history the data does not have,
    /// which is the same sin as implying precision a price does not have. Six hours is short
    /// enough that an overnight re-check opens it and long enough that no burst of manual
    /// refreshes can.
    private static let minTrendSpan: TimeInterval = 6 * 3600

    /// True once the samples cover a period a shopper would care about. The count check stays —
    /// two points are still the minimum for a line — but elapsed time is what actually decides.
    private func showsTrend(_ points: [WatchPoint]) -> Bool {
        guard points.count > 3, let first = points.min(by: { $0.at < $1.at })?.at,
              let last = points.max(by: { $0.at < $1.at })?.at else { return false }
        return last.timeIntervalSince(first) >= Self.minTrendSpan
    }

    private var status: (best: Double?, du: DisplayUnit?, atTarget: Bool, lowest: Bool) { WatchService.status(watch, points: points) }
    private var stores: [(String, WatchResult.StoreBest)] {
        (watch.result?.stores ?? [:]).sorted { $0.value.unitPerBase < $1.value.unitPerBase }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(watch.label).font(.headline)
                    Text(watch.lastChecked.map { "checked \($0.formatted(.relative(presentation: .named)))" } ?? "not checked yet")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if refreshing { ProgressView().controlSize(.small) } else {
                    Menu {
                        Button { onRefresh() } label: { Label("Check now", systemImage: "arrow.clockwise") }
                        Button { showEdit = true } label: { Label("Edit", systemImage: "slider.horizontal.3") }
                        Button { onCompare() } label: { Label("Compare now", systemImage: "magnifyingglass") }
                        Button(role: .destructive) { onDelete() } label: { Label("Remove", systemImage: "trash") }
                    } label: { Image(systemName: "ellipsis.circle").foregroundStyle(.secondary) }
                }
            }

            if let best = status.best, let du = status.du, let bestId = watch.result?.bestStoreId {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    // Scaled, not a flat 28pt: see `HeroBestCard.heroSize`. Shrinks to fit rather
                    // than wrapping, and the store tag gives up its width first.
                    Text(Money.unit(best / du.factor, du))
                        .font(.system(size: heroSize, weight: .bold))
                        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.4)
                        .layoutPriority(1)
                    Text("/\(du.label)").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    StoreTag(storeId: bestId)
                }
                HStack(spacing: 6) {
                    if status.atTarget { Badge(text: "at your target", kind: .good, symbol: "checkmark") }
                    else if let t = watch.target { Badge(text: "target \(Money.full(t))", kind: .neutral) }
                    if status.lowest { Badge(text: "lowest seen", kind: .good) }
                    // Where the headline number came from (the owner's rule): an Instacart or
                    // chain-wide listing is not the shelf price, and an estimate is not exact.
                    if let b = watch.result?.stores[bestId] {
                        if let tag = PriceProvenance.badge(b.priceBasis) { Badge(text: tag, kind: .outline) }
                        if b.est { Badge(text: "est.", kind: .outline) }
                    }
                }
            } else if let err = watch.lastError {
                Text(err).font(.footnote).foregroundStyle(.secondary)
            } else {
                ProgressView().controlSize(.small)
            }

            ForEach(stores.prefix(expanded ? 20 : 3), id: \.0) { storeId, best in
                HStack(spacing: 8) {
                    StoreTag(storeId: storeId)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(best.name).font(.caption).lineLimit(1)
                        Text([best.size, Money.full(best.price) + (best.soldBy == .lb ? "/lb" : ""), best.onSale ? "sale" : nil, PriceProvenance.badge(best.priceBasis), best.est ? "est." : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let du = status.du {
                        // Never let the unit price be squeezed into an ellipsis by the store name
                        // beside it: a clipped price reads as a different, usually smaller number.
                        Text(Money.unit(best.unitPerBase, du))
                            .font(.caption.weight(.semibold))
                            .monospacedDigit()
                            .fixedSize(horizontal: true, vertical: false)
                            .layoutPriority(1)
                    }
                }
            }
            if stores.count > 3 {
                Button(expanded ? "Show less" : "Show all \(stores.count) stores") { expanded.toggle() }
                    .font(.caption)
            }

            if showsTrend(points), let du = status.du {
                let series = Dictionary(grouping: points, by: \.storeId).map { (id, pts) in
                    WatchTrendChart.Series(id: id, label: RetailerCatalog.byId[id]?.short ?? id, points: pts.sorted { $0.at < $1.at }.map { ($0.at, $0.unitPerBase * du.factor) })
                }
                WatchTrendChart(series: series, unit: du, target: watch.target)
            } else if points.count > 3 {
                // Say why there is no chart rather than drawing a flat one. See `minTrendSpan`.
                Text("Prices so far are all from the same check. The trend appears once this has been re-checked on another day.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .sheet(isPresented: $showEdit) { WatchEditSheet(watch: watch) }
    }
}

struct WatchEditSheet: View {
    let watch: WatchItem
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var ctx
    @State private var label = ""
    @State private var target = ""
    @State private var unit: DisplayUnit = .lb
    @State private var include = ""
    @State private var exclude = ""

    private var unitChoices: [DisplayUnit] {
        guard let d = watch.dim.flatMap(Dim.init(rawValue:)) else { return DisplayUnit.allCases }
        return DisplayUnit.units(for: d)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") { TextField("Name", text: $label) }
                Section("Target price") {
                    HStack {
                        TextField("e.g. 2.50", text: $target).keyboardType(.decimalPad)
                        Picker("per", selection: $unit) {
                            // Only units of what the watch measures: butter "per gal" multiplied a per-ounce
                            // price by 128 into the card, the chart and the target alert.
                            ForEach(unitChoices) { u in Text("per \(u.label)").tag(u) }
                        }
                        .labelsHidden()
                    }
                }
                Section {
                    TextField("must include (comma separated)", text: $include)
                    TextField("exclude", text: $exclude)
                } header: {
                    Text("Match")
                } footer: {
                    Text("Use these to pin the watch to what you actually buy — e.g. include “whole, gallon”, exclude “organic”.")
                }
            }
            .navigationTitle("Edit watch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        watch.label = label.isEmpty ? watch.query : label
                        // A decimal-comma region types "2,50"; Double("2,50") is nil and silently cleared the target.
                        watch.target = Double(target.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
                        watch.displayUnit = unit.rawValue
                        let newInclude = include.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        let newExclude = exclude.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        let changed = newInclude != watch.include || newExclude != watch.exclude
                        watch.include = newInclude
                        watch.exclude = newExclude
                        try? ctx.save()
                        if changed { Task { await WatchService.refresh(watch, fresh: false, context: ctx) } }
                        dismiss()
                    }
                }
            }
            .onAppear {
                label = watch.label
                target = watch.target.map { String($0) } ?? ""
                let saved = watch.displayUnit.flatMap(DisplayUnit.init(rawValue:))
                unit = saved.flatMap { unitChoices.contains($0) ? $0 : nil } ?? [DisplayUnit.lb, .gal, .ct].first(where: unitChoices.contains) ?? .lb
                include = watch.include.joined(separator: ", ")
                exclude = watch.exclude.joined(separator: ", ")
            }
        }
    }
}

struct FavoriteDealsView: View {
    let term: String
    let deals: [Deal]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                ForEach(deals) { d in
                    NavigationLink { DealDetailView(deal: d) } label: { DealCard(deal: d) }.buttonStyle(.plain)
                }
            }
            .padding(16)
            .readableWidth(1000)
            if deals.isEmpty {
                ContentUnavailableView("No deals right now", systemImage: "tag", description: Text("We’ll alert you when \(term) shows up in a weekly ad."))
                    .padding(.top, 40)
            }
        }
        .navigationTitle(term.capitalized)
        .navigationBarTitleDisplayMode(.inline)
    }
}
