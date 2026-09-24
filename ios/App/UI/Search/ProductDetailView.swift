import SwiftUI
import SwiftData

struct ProductDetailView: View {
    let product: Product
    var unit: DisplayUnit?
    var prefs: PricePrefs

    @Environment(\.dismiss) private var dismiss
    @Environment(Entitlements.self) private var pro
    @State private var history: [HistoryPointDTO] = []
    @State private var loadingHistory = true
    @State private var showPaywall = false
    @State private var added = false
    @State private var watched = false

    /// The sheet's headline price, scaled with Dynamic Type rather than pinned at 30pt. See the
    /// matching note on `HeroBestCard.heroSize`.
    @ScaledMetric(relativeTo: .title) private var heroSize: CGFloat = 30

    private var chain: Chain? { RetailerCatalog.byId[product.storeId] }
    private var price: Double { Compare.effectivePrice(product, prefs) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top, spacing: 14) {
                        ProductThumb(url: product.imageURL, size: 110)
                        VStack(alignment: .leading, spacing: 6) {
                            // Wraps rather than squeezes: see the matching note in `HeroBestCard`.
                            FlowRow(spacing: 6) {
                                StoreTag(storeId: product.storeId, full: true)
                                Badge(text: PriceProvenance.label(product.priceBasis), kind: product.priceBasis == .shelf ? .good : .outline)
                            }
                            // FlowRow, not HStack: at an accessibility size this sheet's price
                            // ended up smaller than the "shelf price" badge and the store tag
                            // beside it, and the three items had no room to share a line. The
                            // price scales with the type size now (see `heroSize`) and shrinks
                            // rather than wraps — a smaller $2.45 is still $2.45, "$2." over "45"
                            // is a different number.
                            FlowRow(spacing: 6) {
                                Text(Money.full(price))
                                    .font(.system(size: heroSize, weight: .bold))
                                    .monospacedDigit().lineLimit(1).minimumScaleFactor(0.4)
                                if product.soldBy == .lb { Text("/lb").font(.subheadline).foregroundStyle(.secondary) }
                                if let reg = product.regularPrice {
                                    // VoiceOver does not announce a strikethrough, so without this
                                    // the sheet reads out as two bare prices in a row.
                                    Text(Money.full(reg))
                                        .font(.subheadline).foregroundStyle(.tertiary).strikethrough()
                                        .monospacedDigit().lineLimit(1)
                                        .fixedSize(horizontal: true, vertical: false)
                                        .accessibilityLabel("regular price \(Money.full(reg))")
                                }
                            }
                            if let mp = product.memberPrice, let label = product.memberLabel {
                                Text("\(label): \(Money.full(mp))\(Compare.usesMember(product, prefs) ? " (used in comparisons)" : " (not counted — change in Settings)")")
                                    .font(.caption).foregroundStyle(Color.accentColor)
                            }
                            if let promo = product.promo { Text(promo).font(.caption.weight(.medium)).foregroundStyle(Color(hex: 0xB23A0C)) }
                            if let est = product.estPkg { Text("Typical package ≈ \(Money.full(est)) (weighed at the register)").font(.caption).foregroundStyle(.secondary) }
                        }
                    }

                    if !product.unit.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Unit price").font(.subheadline.weight(.semibold))
                            ForEach(Dim.allCases.filter { product.unit[$0.rawValue] != nil }, id: \.self) { dim in
                                if let u = product.unitPrice(dim) {
                                    HStack {
                                        Text(dim == .count ? "Per item" : "Per \(dim.label)").font(.footnote).foregroundStyle(.secondary)
                                        Spacer()
                                        Text(DisplayUnit.units(for: dim).map { "\(Money.unit(u.perBase, $0))/\($0.label)" }.joined(separator: " · "))
                                            .font(.footnote).monospacedDigit()
                                        if u.est { Text("est.").font(.caption2).foregroundStyle(.tertiary) }
                                    }
                                }
                            }
                        }
                        .padding(12)
                        .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Price history").font(.subheadline.weight(.semibold))
                            if !pro.isPro { ProBadge() }
                            Spacer()
                            if history.count > 1 { Text("\(history.count) checks").font(.caption).foregroundStyle(.secondary) }
                        }
                        if !pro.isPro {
                            Button {
                                showPaywall = true
                            } label: {
                                InfoBanner(kind: .info, symbol: "chart.line.uptrend.xyaxis", text: "Pro keeps a price history for everything you search, so you know whether today’s price is actually a deal.")
                            }
                            .buttonStyle(.plain)
                        } else if loadingHistory {
                            ProgressView().frame(maxWidth: .infinity)
                        } else if history.count < 2 {
                            Text(history.isEmpty
                                 ? "No history yet — Cartworth records a price every time this item shows up in a search."
                                 : "First seen at \(Money.full(history[0].price)). The chart fills in as the price changes.")
                                .font(.footnote).foregroundStyle(.secondary)
                        } else {
                            PriceHistoryChart(points: history)
                            HStack(spacing: 16) {
                                if let low = history.map(\.price).min() { Text("Low \(Money.full(low))").font(.caption) }
                                if let high = history.map(\.price).max() { Text("High \(Money.full(high))").font(.caption) }
                                let avg = history.map(\.price).reduce(0, +) / Double(history.count)
                                Text("Avg \(Money.full(avg))").font(.caption)
                            }
                            .foregroundStyle(.secondary)
                        }
                    }

                    if let bad = product.implausible {
                        InfoBanner(
                            kind: .bad,
                            text: "This works out \(Units.trimNum(bad.ratio))× the typical unit price for this search. Usually that means the listing's size is wrong, for example a multi-pack priced as one unit. Check the label before trusting it."
                        )
                    }
                    // Where this number came from, in full. This used to call an Instacart price
                    // "Jewel's online listing" — and Jewel's own app is an online listing that
                    // shows different prices. See `PriceProvenance`.
                    if let note = PriceProvenance.note(product.priceBasis, storeName: chain?.short ?? "This store") {
                        InfoBanner(kind: .info, text: product.priceBasis == .online
                                   ? note + " Weekly-ad and digital-coupon prices appear on the Deals tab."
                                   : note)
                    }

                    VStack(spacing: 10) {
                        if let url = product.url {
                            // Named by where it goes, not by whose price it is: for most chains
                            // this is an instacart.com page, and "Open at Walmart" landing on
                            // Instacart is a misattribution. See `OutboundLink`.
                            let dest = OutboundLink.destination(for: url, chain: chain)
                            Link(destination: url) {
                                Label(dest.title, systemImage: "arrow.up.right.square").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            Text(OutboundLink.caption(for: dest, chain: chain))
                                .font(.caption2).foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity)
                                .multilineTextAlignment(.center)
                        }
                        HStack(spacing: 10) {
                            Button {
                                addToList()
                            } label: {
                                Label(added ? "Added" : "Add to list", systemImage: added ? "checkmark" : "plus").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .disabled(added)
                            Button {
                                watch()
                            } label: {
                                Label(watched ? "Watching" : "Watch price", systemImage: watched ? "star.fill" : "star").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .disabled(watched)
                        }
                    }
                }
                .padding(16)
                // One column of facts about one product. iPad presents this as a 580pt form
                // sheet, where nothing stretches, so this cap is a guard for a wider
                // presentation rather than a fix for something visibly broken today.
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle(product.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $showPaywall) { PaywallView(reason: "Price history") }
            .task {
                if pro.isPro {
                    history = await HistoryStore.shared.series(key: product.key)
                }
                loadingHistory = false
            }
        }
    }

    private func addToList() {
        let ctx = Persistence.container.mainContext
        ctx.insert(ListEntry(text: product.name, pinned: PinnedProduct(storeId: product.storeId, key: product.key, name: product.name, size: product.size, price: price, soldBy: product.soldBy, url: product.url, imageURL: product.imageURL)))
        try? ctx.save()
        added = true
    }

    private func watch() {
        let ctx = Persistence.container.mainContext
        let w = WatchItem(query: product.name, label: product.name, dim: product.dim?.rawValue)
        ctx.insert(w)
        try? ctx.save()
        watched = true
        Task { await WatchService.refresh(w, fresh: false) }
    }
}
