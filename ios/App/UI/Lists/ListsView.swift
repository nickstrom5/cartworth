import SwiftUI
import SwiftData
import PhotosUI

struct ListsView: View {
    @Environment(AppState.self) private var app
    @Environment(Entitlements.self) private var pro
    @Environment(Router.self) private var router
    @Environment(\.modelContext) private var ctx
    @Query(sort: [SortDescriptor(\ListEntry.sort), SortDescriptor(\ListEntry.addedAt)]) private var entries: [ListEntry]

    @State private var newItem = ""
    @State private var plan: TripPlanner.Result?
    @State private var planning = false
    @State private var showRecipe = false
    @State private var paywall: PaywallReason?

    /// Identifies the presentation as well as naming it. With `.sheet(isPresented:)` and a
    /// separate reason string, SwiftUI presented the sheet with the *previous* reason — tapping
    /// "Add from a recipe" opened a paywall headed "Trip planning is part of Pro".
    private struct PaywallReason: Identifiable {
        let title: String
        var id: String { title }
    }

    private var open: [ListEntry] { entries.filter { !$0.done } }
    private var done: [ListEntry] { entries.filter(\.done) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Add item — milk 1 gal, eggs 18 ct…", text: $newItem)
                            .onSubmit(add)
                        Button(action: add) { Image(systemName: "plus.circle.fill") }
                            .disabled(newItem.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    Button {
                        if pro.isPro { showRecipe = true } else { paywall = PaywallReason(title: "Recipe to shopping list") }
                    } label: {
                        HStack {
                            Label("Add from a recipe", systemImage: "camera.viewfinder")
                            Spacer()
                            if !pro.isPro { ProBadge() }
                        }
                    }
                }

                if !open.isEmpty {
                    Section("To buy (\(open.count))") {
                        ForEach(open) { e in row(e) }
                            .onDelete { idx in delete(idx.map { open[$0] }) }
                    }
                }

                if let plan {
                    Section("Trip plan") {
                        TripPlanSummary(plan: plan, onRefresh: { Task { await runPlan(fresh: true) } }, planning: planning)
                    }
                }

                if !open.isEmpty {
                    Section {
                        Button {
                            if pro.isPro { Task { await runPlan() } } else { paywall = PaywallReason(title: "Trip planning") }
                        } label: {
                            HStack {
                                if planning { ProgressView().controlSize(.small) }
                                Label(plan == nil ? "Plan the cheapest trip" : "Re-plan with fresh prices", systemImage: "cart")
                                Spacer()
                                if !pro.isPro { ProBadge() }
                            }
                        }
                        .disabled(planning)
                    } footer: {
                        Text("Prices each item at every store you follow — for the same amount — then finds the cheapest single store, the best two- and three-store split, and the cherry-pick total.")
                    }
                }

                if !done.isEmpty {
                    Section("Done (\(done.count))") {
                        ForEach(done) { e in row(e) }
                            .onDelete { idx in delete(idx.map { done[$0] }) }
                        Button("Clear done", role: .destructive) { delete(done) }
                    }
                }

                if entries.isEmpty {
                    ContentUnavailableView {
                        Label("Your list is empty", systemImage: "list.bullet")
                    } description: {
                        Text("Add items here, or from any product or deal. Include a size (“milk 1 gal”) and Cartworth prices exactly that much at every store.")
                    }
                }
            }
            .navigationTitle("Shopping list")
            .toolbar {
                if !entries.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { copyList() } label: { Label("Copy list", systemImage: "doc.on.doc") }
                            Button(role: .destructive) { delete(entries) } label: { Label("Clear everything", systemImage: "trash") }
                        } label: { Image(systemName: "ellipsis.circle") }
                    }
                }
            }
            .sheet(isPresented: $showRecipe) { RecipeImportView() }
            .sheet(item: $paywall) { PaywallView(reason: $0.title) }
        }
        // A shopping list is one column of short lines. Left unbounded it puts the item name at
        // one edge of a 13" iPad and its price and search button 900pt away at the other. The
        // stack is capped rather than the list, so "Shopping list" heads its own column instead of
        // sitting 136pt (portrait) to 308pt (landscape) left of it. See `ReadablePage`.
        .readablePage(760, background: Color(.systemGroupedBackground))
    }

    @ViewBuilder
    private func row(_ e: ListEntry) -> some View {
        HStack(spacing: 10) {
            Button {
                e.done.toggle()
                try? ctx.save()
            } label: {
                Image(systemName: e.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(e.done ? Color.accentColor : .secondary)
            }
            .buttonStyle(.plain)
            // An image-only button: VoiceOver read "button" with no name and no state.
            .accessibilityLabel("Got \(e.text)")
            .accessibilityValue(e.done ? "done" : "not done")
            .accessibilityAddTraits(e.done ? .isSelected : [])

            VStack(alignment: .leading, spacing: 2) {
                Text(e.text)
                    .strikethrough(e.done)
                    .foregroundStyle(e.done ? .secondary : .primary)
                if let pin = e.pinned {
                    HStack(spacing: 4) {
                        Image(systemName: "pin.fill").font(.caption2)
                        StoreTag(storeId: pin.storeId)
                        // Sharing a line with the store tag, so it carries the same guard every
                        // other price in the app does — see `UnbreakablePrice`.
                        Text(Money.full(pin.price) + (pin.soldBy == .lb ? "/lb" : ""))
                            .font(.caption).foregroundStyle(.secondary).unbreakablePrice()
                    }
                } else if let p = plan?.items.first(where: { $0.id == e.id }), let cheapest = p.cheapest, let c = p.perStore[cheapest] {
                    HStack(spacing: 4) {
                        Text("cheapest:").font(.caption).foregroundStyle(.secondary)
                        StoreTag(storeId: cheapest)
                        Text(Money.full(c.cost))
                            .font(.caption.weight(.semibold)).foregroundStyle(.secondary).unbreakablePrice()
                    }
                    // The quantity that cost buys. Without it "$2.51" beside a gallon of juice that
                    // costs $6.99 cannot be reconciled — see `CostedAmount`.
                    if let amount = CostedAmount.line(for: p, storeId: cheapest) {
                        Text(amount).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if let r = e.recipe { Text(r).font(.caption2).foregroundStyle(.tertiary) }
            }
            Spacer()
            if e.qty > 1 { Text("×\(e.qty)").font(.footnote).foregroundStyle(.secondary) }
            Button { router.compare(e.pinned?.name ?? e.text) } label: { Image(systemName: "magnifyingglass") }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
        }
        .swipeActions(edge: .leading) {
            Button { e.qty += 1; try? ctx.save() } label: { Label("More", systemImage: "plus") }.tint(.blue)
            if e.qty > 1 {
                Button { e.qty -= 1; try? ctx.save() } label: { Label("Fewer", systemImage: "minus") }.tint(.gray)
            }
        }
    }

    private func add() {
        let text = newItem.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        for part in text.components(separatedBy: ",").map({ $0.trimmingCharacters(in: .whitespaces) }).filter({ !$0.isEmpty }) {
            ctx.insert(ListEntry(text: part, sort: entries.count))
        }
        try? ctx.save()
        newItem = ""
        plan = nil
    }

    private func delete(_ items: [ListEntry]) {
        for i in items { ctx.delete(i) }
        try? ctx.save()
        plan = nil
    }

    private func runPlan(fresh: Bool = false) async {
        planning = true
        defer { planning = false }
        plan = await TripPlanner.price(entries: open, fresh: fresh)
    }

    private func copyList() {
        UIPasteboard.general.string = open.map { "• \($0.qty > 1 ? "\($0.qty) × " : "")\($0.text)" }.joined(separator: "\n")
    }
}

struct TripPlanSummary: View {
    let plan: TripPlanner.Result
    var onRefresh: () -> Void
    var planning: Bool
    /// Which option card is expanded. 1 — the two-store plan — is the usual sweet spot, so it is
    /// the default *when it exists*; see `selectedIndex`, which is what actually indexes.
    @State private var choice = 1
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize

    /// 130pt is a phone compromise that truncates three-store labels to "ALDI + Costco + W…".
    /// The readable column on iPad has room for the whole thing.
    ///
    /// Scaled rather than flat, and a *minimum* rather than a fixed width. As a flat constant this
    /// was the same mistake the 92/96pt `BestPerStoreChart` columns already made and had fixed:
    /// at an accessibility type size a 130pt card broke its own total across two lines, drawing
    /// "$13.96" as "$13" over ".96". Side by side, two cards then read "$13" and "$14" at a
    /// glance — a wrong price, and the whole point of the card is its total. Scaling grows the
    /// card with the text, and `minWidth` lets it grow further still rather than push a
    /// `fixedSize` price out over the card beside it.
    @ScaledMetric(relativeTo: .title3) private var phoneOptionWidth: CGFloat = 130
    @ScaledMetric(relativeTo: .title3) private var padOptionWidth: CGFloat = 170
    private var optionWidth: CGFloat { sizeClass == .regular ? padOptionWidth : phoneOptionWidth }

    /// The option whose per-store breakdown is shown, clamped into range.
    ///
    /// `choice` starts at 1 because the two-store plan is usually the one worth reading, but the
    /// options list is only as long as the plans that actually earned a card. When a list prices
    /// down to a single option — common when most items cannot be found — `choice` sat past the
    /// end and `choice < options.count` was false, so the shopper got an option card with **no
    /// item breakdown underneath it at all** and nothing to say why. Clamp instead of dropping.
    private var selectedIndex: Int? {
        guard !options.isEmpty else { return nil }
        return min(choice, options.count - 1)
    }

    private var options: [(String, TripPlanner.Plan)] {
        var o: [(String, TripPlanner.Plan)] = []
        if let s = plan.single.first { o.append(("One store", s)) }
        if let p = plan.pairs.first { o.append(("Two stores", p)) }
        if let t = plan.triples.first { o.append(("Three stores", t)) }
        o.append(("Cherry-pick", plan.everything))
        return o
    }

    /// One option: its label, its total, the stores it visits and what it saves.
    ///
    /// `stacked` is the accessibility-size column. There a card is exactly as wide as the column:
    /// `optionWidth` is a minimum for the side-by-side row, and at the largest sizes the iPad's
    /// scaled 170pt is about 400pt, wider than a narrow column, so the card ran off the screen.
    private func optionCard(_ i: Int, _ o: (String, TripPlanner.Plan), stacked: Bool) -> some View {
        Button { choice = i } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(o.0).font(.caption).foregroundStyle(.secondary)
                // A plan that buys nothing has a total of zero, and "$0.00" on a
                // trip card states that the shopper's basket is free. Seen live
                // on a four-item list in Milwaukee where every lookup came back
                // empty. There is no price to show here, so none is shown — the
                // "n not found" line below carries the real story.
                if o.1.stores.isEmpty {
                    Text("—").font(.title3.bold()).foregroundStyle(.secondary)
                        .accessibilityLabel("no price")
                } else {
                    Text(Money.full(o.1.total)).font(.title3.bold()).unbreakablePrice()
                }
                // Names, not just dots: eight store colours can't stay distinct
                // for a colourblind reader, so the text carries the identity.
                // Two lines, because one cut a three-store plan off at a dangling
                // "Jewel + Costco + " — which names a stop the reader cannot see.
                Text(o.1.stores.prefix(3).map { RetailerCatalog.byId[$0]?.short ?? $0 }.joined(separator: " + ")
                     + (o.1.stores.count > 3 ? " +\(o.1.stores.count - 3)" : ""))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                if o.1.missing > 0 {
                    Text("\(o.1.missing) not found").font(.caption2).foregroundStyle(.orange)
                } else if i > 0, let single = plan.single.first,
                          let claim = TripPlanner.savingsClaim(o.1, over: single, items: plan.items) {
                    // "saves $X" only between two all-shelf plans; see
                    // `TripPlanner.savingsClaim`. The longer sentences wrap
                    // inside the card rather than stretching it across the row.
                    Text(claim.text.replacingOccurrences(of: "{amount}", with: claim.amount.map(Money.full) ?? ""))
                        .font(.caption2)
                        .foregroundStyle(claim.kind == .exact ? Color.green : Color.secondary)
                        .frame(width: stacked ? nil : max(optionWidth - 20, 90), alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(10)
            .frame(minWidth: stacked ? nil : optionWidth, maxWidth: stacked ? CGFloat.infinity : nil, alignment: .leading)
            // Highlight the card whose breakdown is actually shown, which is the
            // clamped index — not the raw `choice`, which can sit past the end.
            .background(selectedIndex == i ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selectedIndex == i ? Color.accentColor : .clear))
        }
        .buttonStyle(.plain)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Side by side in a scroller normally. At an accessibility size each card is wider
            // than half the screen, so the row shows one card and cuts the next one's total at the
            // edge of the screen — a clipped price, the same defect `IPadLandscapeTests` found in
            // the search screen's ads carousel. There the cards stack instead, each one the width
            // of the column.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(options.enumerated()), id: \.offset) { i, o in optionCard(i, o, stacked: true) }
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(options.enumerated()), id: \.offset) { i, o in optionCard(i, o, stacked: false) }
                    }
                }
                .scrollClipDisabled()
            }

            if let index = selectedIndex {
                let selected = options[index].1
                ForEach(Array(Set(selected.assign.values)).sorted(), id: \.self) { storeId in
                    let items = plan.items.filter { selected.assign[$0.id] == storeId }
                    let subtotal = items.reduce(0.0) { $0 + ($1.perStore[storeId]?.cost ?? 0) }
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            StoreTag(storeId: storeId, full: true)
                            Spacer()
                            Text(Money.full(subtotal)).font(.subheadline.weight(.semibold)).unbreakablePrice()
                        }
                        ForEach(items) { it in
                            HStack(alignment: .top, spacing: 8) {
                                Text("•").foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text("\(it.qty > 1 ? "\(it.qty) × " : "")\(it.text)").font(.subheadline)
                                    // Printed on every line: the cost to the right is for this
                                    // amount, not for the package named below it. Two shipped
                                    // frames costed one gallon of juice at $2.51 and $2.73 because
                                    // they silently used 46 and 50 fl oz. See `CostedAmount`.
                                    if let amount = CostedAmount.line(for: it, storeId: storeId) {
                                        Text(amount).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                                    }
                                    if let c = it.perStore[storeId] {
                                        // Name and price on separate lines: the name may be shortened, the price never.
                                        if let name = c.product?.name ?? c.pinnedProduct?.name {
                                            Text(name).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                        }
                                        if let p = c.product {
                                            Text([p.size.isEmpty ? nil : p.size, Money.full(p.price) + (p.soldBy == .lb ? "/lb" : "")].compactMap { $0 }.joined(separator: " · "))
                                                .font(.caption).foregroundStyle(.secondary).unbreakablePrice()
                                            if let saved = p.savedAt { SavedNote(date: saved) }
                                        }
                                    }
                                }
                                Spacer()
                                if let c = it.perStore[storeId] {
                                    // Competing with the item's own VStack across a Spacer, this
                                    // wrapped to "$6.1" over "7" at accessibility sizes — read
                                    // beside the item it says $6.17 costs $6.1.
                                    Text(Money.full(c.cost)).font(.subheadline).unbreakablePrice()
                                }
                            }
                        }
                    }
                    .padding(10)
                    .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                }
            }

            Text("Each cost is for the amount printed under the item, priced at that store’s cheapest matching product — the same amount at every store, so package sizes compare fairly. Items weighed at the register are estimates.")
                .font(.caption2).foregroundStyle(.tertiary)
            Button { onRefresh() } label: {
                Label("Fresh prices", systemImage: "arrow.clockwise").font(.footnote)
            }
            .disabled(planning)
        }
    }
}
