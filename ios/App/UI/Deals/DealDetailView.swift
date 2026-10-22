import SwiftUI
import SwiftData

struct DealDetailView: View {
    let deal: Deal
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var detail: FlippSource.Detail?
    /// The item's own detail could not be read, so the ad's terms stay unknown.
    @State private var detailFailed = false
    @State private var added = false
    /// The ad price, scaled with Dynamic Type (it was a flat 30 pt). See `HeroBestCard.heroSize`.
    @ScaledMetric(relativeTo: .title) private var priceSize: CGFloat = 30

    private var description: String? { detail?.description ?? deal.description }
    private var disclaimer: String? { detail?.disclaimer ?? deal.disclaimer }
    /// The deal as its terms say once they arrive: a "10 for $10.00" listed as $10.00 becomes ten
    /// at $1.00 each, with its percent off worked out per unit.
    private var shown: Deal { detail.map { FlippSource.deal(deal, detail: $0) } ?? deal }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Screenshot capture drops the ad clipping: retailer flyer artwork and brand
                // packaging stay out of marketing images (see `QAShot`, `ProductThumb`).
                if !QAShot.hideRemoteImages, let url = deal.imageURL {
                    AsyncImage(url: url) { img in
                        img.resizable().scaledToFit()
                    } placeholder: {
                        Color.clear.frame(height: 120)
                    }
                    .frame(maxWidth: .infinity, maxHeight: 220)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }

                priceBlock(shown)

                Text(deal.name).font(.headline)
                if let description { Text(description).font(.subheadline).foregroundStyle(.secondary) }

                FlowRow(spacing: 6) {
                    StoreTag(storeId: deal.retailerId, full: true)
                    if shown.needsCoupon { Badge(text: "needs digital coupon", kind: .info) }
                    if shown.needsCard { Badge(text: "needs store card", kind: .info) }
                    if let l = shown.limit { Badge(text: "limit \(l)", kind: .neutral) }
                    if let m = shown.mustBuy { Badge(text: "must buy \(m)", kind: .warn) }
                    Badge(text: shown.category.rawValue, kind: .neutral)
                }

                if let from = deal.validFrom, let to = deal.validTo {
                    Label("\(from.formatted(.dateTime.month(.abbreviated).day())) – \(to.formatted(.dateTime.month(.abbreviated).day()))  ·  \(endsText(to))", systemImage: "calendar")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                if let disclaimer {
                    Text(disclaimer).font(.caption).foregroundStyle(.tertiary)
                }

                VStack(spacing: 10) {
                    Button {
                        router.compare(simplify(deal.name))
                        dismiss()
                    } label: {
                        Label("Compare at every store", systemImage: "magnifyingglass").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    Button {
                        let ctx = Persistence.container.mainContext
                        ctx.insert(ListEntry(text: simplify(deal.name)))
                        try? ctx.save()
                        added = true
                    } label: {
                        Label(added ? "Added to list" : "Add to list", systemImage: added ? "checkmark" : "plus").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(added)
                }
            }
            .padding(16)
            .readableWidth()
        }
        .navigationTitle("Deal")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if deal.source == "flipp", !deal.enriched, let id = deal.flippId, let fid = deal.flyerId {
                detail = try? await FlippSource.shared.detail(itemId: id, flyerId: fid)
                detailFailed = detail == nil
            }
        }
    }

    /// Never quotes a price the shopper cannot get. Until a weekly-ad price's terms are known, the
    /// number may be for several items ("10 for $10.00" arrives as $10.00) or per pound, so it is
    /// not the headline and no per-unit regular price or percent off is worked out from it.
    @ViewBuilder private func priceBlock(_ d: Deal) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if d.termsPending {
                if detailFailed {
                    Text("See ad")
                        .font(.system(size: priceSize, weight: .bold))
                        .minimumScaleFactor(0.6)
                    if let price = d.price {
                        Text("The ad lists \(Money.full(price)). Flipp didn't send whether that's for one item, several or a pound.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                } else {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Checking the ad's terms…").font(.headline).foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            } else {
                Text(d.priceText.isEmpty ? (d.story ?? "See ad") : d.priceText)
                    .font(.system(size: priceSize, weight: .bold))
                    .minimumScaleFactor(0.6)
                if d.qty > 1, let each = d.each { Text("\(Money.full(each)) each").foregroundStyle(.secondary) }
                if let reg = d.regular ?? ProductFactory.money(d.regularText) {
                    Text("Regular \(Money.full(reg))\(d.pctOff.map { " · save \($0)%" } ?? "")").font(.subheadline).foregroundStyle(.secondary)
                }
                if let m = d.memberText { Text(m).font(.subheadline.weight(.semibold)).foregroundStyle(Color.accentColor) }
                if let s = d.story, d.price != nil { Text(s).font(.subheadline.weight(.medium)).foregroundStyle(Color.dealInk) }
            }
        }
    }
}

/// "Oreos 10-15 oz., Newtons 10 oz. or Ritz…" -> "Oreos"
func simplify(_ name: String) -> String {
    var s = name.components(separatedBy: CharacterSet(charactersIn: ",|(;")).first ?? name
    s = s.replacingOccurrences(of: "\\s+or\\s+.*$", with: "", options: [.regularExpression, .caseInsensitive])
    s = s.replacingOccurrences(of: "\\b\\d+(\\.\\d+)?\\s*(-\\s*\\d+(\\.\\d+)?)?\\s*(oz|lb|ct|pk|fl|gal|count|pack)\\.?\\b.*$", with: "", options: [.regularExpression, .caseInsensitive])
    s = s.replacingOccurrences(of: "\\b(select varieties|assorted|family size|value pack)\\b", with: "", options: [.regularExpression, .caseInsensitive])
    return s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? name : s.trimmingCharacters(in: .whitespacesAndNewlines)
}

struct OccasionView: View {
    let occasion: Occasion
    @Environment(Router.self) private var router
    @State private var model = DealsModel.shared
    @State private var added = false

    private var matches: [Deal] { model.matchingDeals(terms: occasion.keywords) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        Image(systemName: occasion.symbol).font(.title).foregroundStyle(Color.accentColor)
                        VStack(alignment: .leading) {
                            Text(occasion.name).font(.title2.bold())
                            Text(occasion.date.formatted(date: .complete, time: .omitted)).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    Text(occasion.blurb).font(.subheadline).foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Starter shopping list").font(.subheadline.weight(.semibold))
                    FlowRow(spacing: 6) {
                        ForEach(occasion.list, id: \.self) { item in
                            Button { router.compare(item) } label: {
                                Text(item).font(.caption)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(Color.secondary.opacity(0.12), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Button {
                        let ctx = Persistence.container.mainContext
                        for (i, item) in occasion.list.enumerated() {
                            ctx.insert(ListEntry(text: item, sort: i, recipe: occasion.name))
                        }
                        try? ctx.save()
                        added = true
                    } label: {
                        Label(added ? "Added \(occasion.list.count) items" : "Add all to my list", systemImage: added ? "checkmark" : "plus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(added)
                }

                if !matches.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(matches.count) matching deals this week").font(.subheadline.weight(.semibold))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                            ForEach(matches.prefix(24)) { d in
                                NavigationLink { DealDetailView(deal: d) } label: { DealCard(deal: d) }.buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(16)
            .readableWidth()
        }
        .navigationTitle(occasion.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { if model.deals[.current] == nil { await model.load(.current) } }
    }
}
