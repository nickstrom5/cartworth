import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(Entitlements.self) private var pro
    @State private var zip = ""
    @State private var busy = false
    @State private var error: String?
    @State private var showPaywall = false
    @State private var counts: (products: Int, points: Int) = (0, 0)
    @State private var fetcher = LocationFetcher()
    @Environment(\.dynamicTypeSize) private var typeSize
    /// A flat 110pt cut "60618" down to "60…" at the accessibility type sizes on a narrow panel.
    /// The field holds five digits the user has to be able to read back, so it scales with them.
    @ScaledMetric(relativeTo: .body) private var zipFieldWidth: CGFloat = 110

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Label("Location", systemImage: "location")
                        Spacer()
                        Text(app.place.map { "\($0.city ?? "") \($0.zip)" } ?? "Not set").foregroundStyle(.secondary)
                    }
                    // Three controls on one line stop fitting well before the largest type sizes
                    // on a narrow panel, so above the accessibility threshold they stack instead.
                    zipRow(stacked: typeSize.isAccessibilitySize)
                    Picker("Search radius", selection: Binding(get: { app.radiusMiles }, set: { app.radiusMiles = $0; Task { await app.loadDirectory(fresh: true) } })) {
                        ForEach([5.0, 10, 15, 25, 40], id: \.self) { r in Text("\(Int(r)) miles").tag(r) }
                    }
                    if let e = error { Text(e).font(.footnote).foregroundStyle(.red) }
                } header: {
                    Text("Where you shop")
                }

                Section {
                    NavigationLink {
                        StorePickerList().navigationTitle("Your stores")
                    } label: {
                        HStack {
                            Label("Stores", systemImage: "storefront")
                            Spacer()
                            Text("\(app.selectedChainIds.count) selected").foregroundStyle(.secondary)
                        }
                    }
                    Button {
                        Task { await app.loadDirectory(fresh: true) }
                    } label: {
                        HStack {
                            Label("Find stores again", systemImage: "arrow.clockwise")
                            if app.isLoadingDirectory { Spacer(); ProgressView().controlSize(.small) }
                        }
                    }
                    .disabled(app.isLoadingDirectory)
                } footer: {
                    if let dir = app.directory {
                        Text("\(dir.chains.count) chains and \(dir.others.count) other stores found within \(Int(dir.radius)) miles.")
                    }
                }

                Section("Pricing") {
                    Toggle(isOn: Binding(get: { app.prefs.cardPrices }, set: { app.prefs.cardPrices = $0 })) {
                        VStack(alignment: .leading) {
                            Text("Count loyalty-card prices")
                            Text("Use card/member prices when comparing").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Toggle(isOn: Binding(get: { app.prefs.prime }, set: { app.prefs.prime = $0 })) {
                        VStack(alignment: .leading) {
                            Text("I have Amazon Prime")
                            Text("Use Whole Foods’ extra Prime price").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Picker("Results per store", selection: Binding(get: { app.resultsPerStore }, set: { app.resultsPerStore = $0 })) {
                        ForEach([20, 36, 48, 60], id: \.self) { Text("\($0)").tag($0) }
                    }
                }

                Section("Alerts") {
                    Toggle(isOn: Binding(get: { app.alertsEnabled }, set: { app.alertsEnabled = $0; if $0 { Task { _ = await BackgroundRefresh.requestPermission() } } })) {
                        VStack(alignment: .leading) {
                            Text("Price and sale alerts")
                            Text("Notify me when a watched item hits its target or a favorite goes on sale").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(!pro.isPro)
                    if !pro.isPro {
                        Button { showPaywall = true } label: { Label("Alerts are part of Pro", systemImage: "sparkles") }
                    }
                }

                Section("Cartworth Pro") {
                    if pro.isPro {
                        HStack {
                            Label("Pro", systemImage: "checkmark.seal.fill").foregroundStyle(Color.accentColor)
                            Spacer()
                            Text(pro.activePlan.map { $0 == .lifetime ? "Lifetime" : $0.rawValue.capitalized } ?? "Active").foregroundStyle(.secondary)
                        }
                        if pro.activePlan != .lifetime, let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                            Link("Manage subscription", destination: url)
                        }
                    } else {
                        Button { showPaywall = true } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Get Pro").fontWeight(.semibold)
                                Text("Unlimited searches, alerts, recipe lists, trip planning").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("Restore purchases") {
                        Task { error = await pro.restore() }
                    }
                }

                Section {
                    HStack {
                        Text("Products tracked")
                        Spacer()
                        Text("\(counts.products)").foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Price observations")
                        Spacer()
                        Text("\(counts.points)").foregroundStyle(.secondary)
                    }
                    Button("Clear cached prices") {
                        Task { await Cache.shared.clearAll() }
                    }
                    Button("Delete price history", role: .destructive) {
                        Task {
                            await HistoryStore.shared.clearAll()
                            counts = await HistoryStore.shared.counts()
                        }
                    }
                } header: {
                    Text("Data")
                } footer: {
                    // "this device", not "this iPhone": the app ships universal
                    // (TARGETED_DEVICE_FAMILY "1,2"), and on iPad this paragraph — the one
                    // paragraph that makes the app's privacy claim — was telling the reader about
                    // a phone they were not holding.
                    Text("Your lists, watches and price history stay on this device. Cartworth reads the same public prices each store shows on its own site, only when you search or when a watched item is re-checked.")
                }

                Section {
                    NavigationLink("How prices work") { AboutPricesView() }
                    Link("Privacy policy", destination: URL(string: "https://cartworth.app/privacy")!)
                    Link("Terms of use", destination: URL(string: "https://cartworth.app/terms")!)
                    Link("Support", destination: URL(string: "https://cartworth.app/support")!)
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0").foregroundStyle(.secondary)
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Settings")
            .sheet(isPresented: $showPaywall) { PaywallView(reason: "Cartworth Pro") }
            .task {
                zip = app.place?.zip ?? ""
                counts = await HistoryStore.shared.counts()
            }
        }
        // A Form stretches to the window, which puts a toggle about a thousand points from the
        // label it belongs to on a large iPad. The whole stack is capped — not just the form — so
        // the large "Settings" title sits on the form's own leading edge; capping only the form
        // left the title 166pt (portrait) to 338pt (landscape) to its left. See `ReadablePage`.
        .readablePage(700, background: Color(.systemGroupedBackground))
    }

    /// The ZIP field, its Update button and the use-my-location button. Side by side normally;
    /// stacked when the type size is large enough that one line would clip the ZIP.
    @ViewBuilder
    private func zipRow(stacked: Bool) -> some View {
        let field = TextField("ZIP code", text: $zip)
            .keyboardType(.numberPad)
            .frame(maxWidth: stacked ? .infinity : zipFieldWidth)
        let update = Button("Update") { Task { await setZip() } }
            .disabled(zip.count != 5 || busy)
        if stacked {
            VStack(alignment: .leading, spacing: 10) {
                field
                update
                // Room to spell the action out once it is on its own line.
                Button { Task { await useLocation() } } label: {
                    Label("Use my location", systemImage: "location.fill")
                }
                .disabled(busy)
            }
        } else {
            HStack {
                field
                update
                Spacer()
                Button { Task { await useLocation() } } label: {
                    Image(systemName: "location.fill")
                }
                .disabled(busy)
                .accessibilityLabel("Use my location")
            }
        }
    }

    private func setZip() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let place = try await Geo.place(forZip: zip)
            await app.setPlace(place)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn’t find that ZIP."
        }
    }

    private func useLocation() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let loc = try await fetcher.current()
            let place = try await Geo.place(for: loc)
            zip = place.zip
            await app.setPlace(place)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn’t get your location."
        }
    }
}

struct AboutPricesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // This used to say every price was the store's own website's, "the same prices
                // you'd see browsing that site". For most chains it is the store's listing on
                // Instacart, and a shopper who checks the store's own app finds different numbers
                // — which is how the owner found it (Jewel butter). See `PriceProvenance`.
                group("Where prices come from",
                      "Cartworth reads the prices stores publish online for the location nearest you. For most chains that is the store’s listing on Instacart; a few stores are read from their own websites. Nothing is crowdsourced or guessed, and every price says which kind it is.")
                group("Shelf vs. Instacart prices",
                      "Some stores publish their in-store shelf prices; those are marked “shelf”. Others are priced from their Instacart listing, which can run higher than the shelf price or the store’s own app; those are marked “Instacart”. “National” means Instacart’s chain-wide listing, used when there is no location near you. Weekly-ad prices always come from the store’s circular.")
                group("Unit prices",
                      "Every price is converted to a common unit — per gallon, per pound, per dozen — so a 64 oz jug and a gallon can be compared honestly. Items sold by weight (meat, produce) use the per-pound price; when a store only lists “each”, a typical piece weight is used and the number is marked “est.”")
                group("Deals and coupons",
                      "Multi-buy (“2 for $5”), BOGO and digital-coupon prices are read from the circular, including the fine print — limits, “must buy 2”, and the price without the coupon. Prices that need a store card or a clipped coupon are labeled.")
                group("How fresh",
                      "Prices are fetched live when you search and cached for 20 minutes. Weekly ads refresh a few times a day, and next week's ads appear as soon as the store posts them.")
                group("Accuracy",
                      "Stores change prices without notice and listings can be wrong. Always check the shelf tag — Cartworth is a guide, not a guarantee.")
            }
            .padding(16)
            .readableWidth()
        }
        .navigationTitle("How prices work")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func group(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(body).font(.footnote).foregroundStyle(.secondary)
        }
    }
}
