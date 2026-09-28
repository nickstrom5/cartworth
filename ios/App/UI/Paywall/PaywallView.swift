import SwiftUI
import StoreKit

struct PaywallView: View {
    var reason: String = "Cartworth Pro"
    @Environment(\.dismiss) private var dismiss
    @Environment(Entitlements.self) private var pro
    @State private var selected: Entitlements.Plan = .yearly
    @State private var message: String?
    @State private var working = false

    private let features: [(String, String, String)] = [
        ("infinity", "Unlimited searches", "Compare every store, as often as you want"),
        ("bell.badge", "Price alerts", "Get told when a watched item hits your target or its lowest price"),
        ("camera.viewfinder", "Recipe to shopping list", "Snap or paste a recipe and price every ingredient"),
        ("cart", "Trip planning", "The cheapest single store, two-store split, or cherry-pick total"),
        ("calendar", "Next week’s ads", "See deals before the week starts"),
        ("chart.line.uptrend.xyaxis", "Price history", "Know whether today’s “sale” is really a deal"),
        ("star", "Favorite brands", "Hear when the brands you buy go on sale"),
    ]

    var body: some View {
        NavigationStack {
            // A sheet carries its own geometry, and on iPad it reports a COMPACT horizontal size
            // class however wide it is (a default form sheet measures 580pt and still says
            // compact), so `readableWidth()` and any sizeClass test are no-ops in here. Measure
            // the presentation instead.
            GeometryReader { geo in
                let wide = geo.size.width >= 700
                ScrollView {
                    Group {
                        if wide {
                            HStack(alignment: .top, spacing: 44) {
                                VStack(alignment: .leading, spacing: 28) {
                                    headline(large: true)
                                    featureList(spacing: 18)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                VStack(alignment: .leading, spacing: 16) {
                                    plansAndPurchase
                                }
                                .frame(width: 340)
                            }
                            .frame(maxWidth: 900)
                            .frame(maxWidth: .infinity)
                        } else {
                            VStack(alignment: .leading, spacing: 20) {
                                headline(large: false)
                                featureList(spacing: 12)
                                plansAndPurchase
                            }
                        }
                    }
                    .padding(wide ? 32 : 20)
                    // Centred in the page sheet rather than hanging from the top of it.
                    .frame(minHeight: wide ? geo.size.height : 0, alignment: .center)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() } } }
            // Every time it opens, not only when nothing has loaded: products loaded at launch
            // kept a changed price off the paywall until the app was next relaunched.
            .task { await pro.load() }
            .onChange(of: pro.isPro) { _, isPro in if isPro { dismiss() } }
        }
        // The default iPad form sheet is a 580x650 box: seven features, three plans and the legal
        // small print do not fit in it, so the one screen whose whole job is to persuade opened
        // showing half a feature list. A page-size sheet gives it room for the two-column layout.
        .pageSizedSheet()
    }

    private func headline(large: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "cart.fill")
                .font(large ? .system(size: 46) : .largeTitle)
                .foregroundStyle(Color.accentColor)
            Text(reason == "Cartworth Pro" ? "Cartworth Pro" : "\(reason) is part of Pro")
                .font(large ? .system(size: 38, weight: .bold) : .title.bold())
                .fixedSize(horizontal: false, vertical: true)
            Text("One subscription covers every store near you, nationwide.")
                .font(large ? .title3 : .callout).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func featureList(spacing: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(features, id: \.1) { f in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: f.0).frame(width: 24).foregroundStyle(Color.accentColor)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(f.1).font(.subheadline.weight(.semibold))
                        Text(f.2).font(.caption).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var plansAndPurchase: some View {
        VStack(spacing: 10) {
            ForEach(Entitlements.Plan.allCases, id: \.self) { plan in
                planRow(plan)
            }
        }

        if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
        if let err = pro.loadError { Text(err).font(.footnote).foregroundStyle(.orange) }

        Button {
            Task { await buy() }
        } label: {
            HStack {
                if working { ProgressView().controlSize(.small) }
                Text(pro.isPro ? "You’re on Pro" : "Continue")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(working || pro.isPro || pro.product(selected) == nil)

        HStack {
            Button("Restore purchases") { Task { message = await pro.restore() } }
            Spacer()
            Link("Terms", destination: URL(string: "https://cartworth.app/terms")!)
            Text("·").foregroundStyle(.secondary)
            Link("Privacy", destination: URL(string: "https://cartworth.app/privacy")!)
        }
        .font(.footnote)

        Text("Subscriptions renew automatically until cancelled. Manage or cancel any time in your Apple ID settings. The lifetime option is a one-time purchase.")
            .font(.caption2).foregroundStyle(.tertiary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func planRow(_ plan: Entitlements.Plan) -> some View {
        let product = pro.product(plan)
        let isSelected = selected == plan
        return Button { selected = plan } label: {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle").foregroundStyle(isSelected ? Color.accentColor : .secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(plan)).font(.subheadline.weight(.semibold))
                    if let sub = subtitle(plan) { Text(sub).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                // Only ever StoreKit's own `displayPrice`, never a figure of our own.
                //
                // This used to fall back to a hard-coded "$3.99" / "$19.99" / "$29.99", which the
                // sheet printed in confident bold *beside its own "Subscriptions aren't available
                // right now." error* — three exact prices on the one screen that says it could not
                // load any. Two ways that lies: a shopper in a non-USD storefront is quoted USD
                // amounts Apple would never charge them, and if the App Store Connect prices are
                // ever changed the paywall goes on quoting the old ones. An em dash says "not
                // known yet", which is the truth, and Continue is already disabled in that state.
                Text(product?.displayPrice ?? "—")
                    .font(.headline).monospacedDigit()
                    .foregroundStyle(product == nil ? .secondary : .primary)
                    .accessibilityLabel(product?.displayPrice ?? "price unavailable")
            }
            .padding(12)
            .background(isSelected ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(isSelected ? Color.accentColor : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func title(_ p: Entitlements.Plan) -> String {
        switch p {
        case .monthly: return "Monthly"
        case .yearly: return "Yearly"
        case .lifetime: return "Lifetime"
        }
    }

    /// The per-month figure under "Yearly" is computed from the *real* yearly product, in the
    /// storefront's own currency, and is simply omitted when there is no product to divide.
    /// Hard-coded, it read "about $1.67 a month" — one twelfth of a hard-coded $19.99 — and stayed
    /// on screen whatever Apple was actually charging, including when nothing had loaded at all.
    private func subtitle(_ p: Entitlements.Plan) -> String? {
        switch p {
        case .monthly: return "Billed every month"
        case .yearly:
            guard let product = pro.product(.yearly) else { return "Best value" }
            return "Best value — about \((product.price / 12).formatted(product.priceFormatStyle)) a month"
        case .lifetime: return "One payment, yours forever"
        }
    }

    private func buy() async {
        working = true
        defer { working = false }
        switch await pro.purchase(selected) {
        case .success: dismiss()
        case .pending: message = "That purchase is waiting for approval."
        case .cancelled: break
        case .failed(let m): message = m
        }
    }
}

private extension View {
    /// Ask for a page-size sheet where the system offers one (iPad, iOS 18+). On iPhone, and on
    /// iOS 17, this is a no-op and the sheet keeps the size it has today.
    @ViewBuilder
    func pageSizedSheet() -> some View {
        if #available(iOS 18.0, *) {
            self.presentationSizing(.page)
        } else {
            self
        }
    }
}
