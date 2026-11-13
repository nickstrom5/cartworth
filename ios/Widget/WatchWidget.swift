import AppIntents
import SwiftUI
import WidgetKit

// The home-screen and Lock Screen widget for a watched product. It shows what the app last found
// (WidgetSnapshot, written by WidgetBridge after every price check) and never asks a store itself.

@main
struct CartworthWidgets: WidgetBundle {
    var body: some Widget { WatchWidget() }
}

struct WatchWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: WidgetStore.widgetKind, intent: SelectWatchIntent.self, provider: WatchProvider()) { entry in
            WatchWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Price watch")
        .description("The best price near you for a product you watch in Cartworth.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Choosing the product

struct WatchEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Watched product"
    static var defaultQuery = WatchQuery()
    var id: UUID
    var label: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(label)") }
}

struct WatchQuery: EntityQuery {
    func entities(for identifiers: [UUID]) async throws -> [WatchEntity] {
        WidgetStore.read().watches.filter { identifiers.contains($0.id) }.map { WatchEntity(id: $0.id, label: $0.label) }
    }

    func suggestedEntities() async throws -> [WatchEntity] {
        WidgetSnapshot.ordered(WidgetStore.read().watches).map { WatchEntity(id: $0.id, label: $0.label) }
    }

    func defaultResult() async -> WatchEntity? { try? await suggestedEntities().first }
}

struct SelectWatchIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose a product"
    static var description = IntentDescription("Pick which watched product the widget shows.")

    @Parameter(title: "Product")
    var watch: WatchEntity?
}

// MARK: - Timeline

struct WatchEntry: TimelineEntry {
    var date: Date
    var watch: WidgetSnapshot.Watch?
    var hasWatches: Bool
}

struct WatchProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> WatchEntry {
        WatchEntry(date: Date(), watch: .init(id: UUID(), label: "Whole milk, 1 gal", price: "$3.29", unit: "gal", storeId: "aldi", storeName: "ALDI",
                                              qualifiers: [], onSale: false, atTarget: false, lowest: true, target: nil,
                                              trend: [3.69, 3.59, 3.59, 3.49, 3.29], change: -0.2, checkedAt: Date(), error: nil),
                   hasWatches: true)
    }

    func snapshot(for configuration: SelectWatchIntent, in context: Context) async -> WatchEntry {
        let s = WidgetStore.read()
        return s.watches.isEmpty && context.isPreview ? placeholder(in: context) : entry(s, configuration)
    }

    func timeline(for configuration: SelectWatchIntent, in context: Context) async -> Timeline<WatchEntry> {
        // The app reloads the widget whenever a price check finishes. The hourly entry only keeps
        // the "checked … ago" line honest when nothing has been checked for a while.
        Timeline(entries: [entry(WidgetStore.read(), configuration)], policy: .after(Date().addingTimeInterval(3600)))
    }

    private func entry(_ s: WidgetSnapshot, _ c: SelectWatchIntent) -> WatchEntry {
        WatchEntry(date: Date(), watch: s.watch(c.watch?.id), hasWatches: !s.watches.isEmpty)
    }
}

// MARK: - Views

private let good = Color(red: 0.11, green: 0.49, blue: 0.29)
/// The web's --deal-ink, light and dark.
private let dealInk = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1, green: 0.737, blue: 0.596, alpha: 1) : UIColor(red: 0.545, green: 0.227, blue: 0.059, alpha: 1) })

struct WatchWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WatchEntry

    var body: some View {
        Group {
            if let w = entry.watch {
                switch family {
                case .accessoryInline: inline(w)
                case .accessoryRectangular: rectangular(w)
                case .systemMedium: medium(w)
                default: small(w)
                }
            } else {
                empty
            }
        }
        .widgetURL(URL(string: entry.watch.map { "cartworth://watch?id=\($0.id.uuidString)" } ?? "cartworth://tab?name=tracking"))
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "star").foregroundStyle(good)
            Text(entry.hasWatches ? "Open Cartworth to check prices" : "Watch a product in Cartworth’s Tracking tab")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func priceLine(_ w: WidgetSnapshot.Watch, size: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(w.price ?? "—").font(.system(size: size, weight: .bold)).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.5)
            if let u = w.unit { Text("/\(u)").font(.caption).foregroundStyle(.secondary).lineLimit(1) }
        }
    }

    /// The store and, when it is not a shelf price, what kind of price it is.
    private func storeLine(_ w: WidgetSnapshot.Watch) -> some View {
        Text(([w.storeName].compactMap { $0 } + w.qualifiers).joined(separator: " · "))
            .font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
    }

    @ViewBuilder
    private func flag(_ w: WidgetSnapshot.Watch) -> some View {
        if w.atTarget { Label("At your target", systemImage: "checkmark.circle.fill").foregroundStyle(good) }
        else if w.lowest { Label("Lowest seen", systemImage: "arrow.down.circle.fill").foregroundStyle(good) }
        else if w.onSale { Label("On sale", systemImage: "tag.fill").foregroundStyle(good) }
        else if let c = w.change, abs(c) >= 0.01 {
            Label("\(c < 0 ? "down" : "up") \(String(format: "$%.2f", abs(c)))", systemImage: c < 0 ? "arrow.down" : "arrow.up")
                .foregroundStyle(c < 0 ? good : .secondary)
        } else if let t = w.target { Text(t).foregroundStyle(.secondary) }
    }

    private func checked(_ w: WidgetSnapshot.Watch) -> some View {
        Group {
            if let e = w.error, w.price == nil { Text(e) }
            // "checked 2 min. ago", worded when the entry is drawn. The live `.relative` style
            // ticked every second ("1 min, 29 sec"); the timeline redraws hourly and after every check.
            else if let d = w.checkedAt { Text("checked \(d.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)))") }
            else { Text("not checked yet") }
        }
        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
    }

    private func small(_ w: WidgetSnapshot.Watch) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(w.label).font(.caption.weight(.semibold)).lineLimit(2)
            Spacer(minLength: 0)
            priceLine(w, size: 26)
            storeLine(w)
            if let ad = w.ad {
                // A weekly-ad price below the listed best (Mariano's 58¢/lb turkey, 13 Nov 2026).
                Text(ad).font(.caption2.weight(.semibold)).foregroundStyle(dealInk).lineLimit(1).minimumScaleFactor(0.8)
            }
            flag(w).font(.caption2.weight(.semibold)).lineLimit(1)
            checked(w)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func medium(_ w: WidgetSnapshot.Watch) -> some View {
        HStack(alignment: .top, spacing: 12) {
            small(w)
            VStack(alignment: .trailing, spacing: 4) {
                if w.trend.count >= 2 {
                    Sparkline(values: w.trend).stroke(good, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    Text("best price at each check").font(.caption2).foregroundStyle(.secondary)
                } else {
                    Spacer()
                    Text("A trend appears once prices have been checked over a few hours.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func rectangular(_ w: WidgetSnapshot.Watch) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(w.label).font(.caption.weight(.semibold)).lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(w.price ?? "—").font(.headline).monospacedDigit()
                if let u = w.unit { Text("/\(u)").font(.caption2) }
                if let s = w.storeName { Text(s).font(.caption2).lineLimit(1) }
            }
            flag(w).font(.caption2).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ w: WidgetSnapshot.Watch) -> some View {
        Text("\(w.label): \(w.price ?? "—")\(w.unit.map { "/\($0)" } ?? "")\(w.storeName.map { " at \($0)" } ?? "")")
    }
}

/// The trend, scaled to its own range (a flat line when the price never moved).
struct Sparkline: Shape {
    var values: [Double]
    func path(in rect: CGRect) -> Path {
        var p = Path()
        guard values.count >= 2, let lo = values.min(), let hi = values.max() else { return p }
        let span = hi - lo
        for (i, v) in values.enumerated() {
            let x = rect.minX + rect.width * CGFloat(i) / CGFloat(values.count - 1)
            let y = span < 1e-9 ? rect.midY : rect.maxY - rect.height * CGFloat((v - lo) / span)
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        return p
    }
}
