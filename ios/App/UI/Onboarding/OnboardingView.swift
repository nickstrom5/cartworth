import SwiftUI
import CoreLocation

struct OnboardingView: View {
    @Environment(AppState.self) private var app
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var step = 0
    @State private var zip = ""
    @State private var busy = false
    @State private var error: String?
    @State private var fetcher = LocationFetcher()

    /// True on iPad and in wide windows. This is the first screen anyone sees, and stacked at the
    /// top-left of a 13" display it reads as an unfinished phone app, so the welcome step becomes
    /// a real two-column layout instead of one column of stretched text.
    private var isWide: Bool { sizeClass == .regular }

    var body: some View {
        NavigationStack {
            Group {
                if step == 0 { welcome } else { stores }
            }
            .padding(.horizontal, isWide ? 32 : 20)
            .animation(.default, value: step)
        }
    }

    private var welcome: some View {
        GeometryReader { geo in
            ScrollView {
                Group {
                    if isWide {
                        // Pitch on the left, the thing you actually do on the right, so neither
                        // runs the full width of the screen and the eye has somewhere to land.
                        HStack(alignment: .top, spacing: 48) {
                            VStack(alignment: .leading, spacing: 22) {
                                pitch
                            }
                            .frame(maxWidth: 460, alignment: .leading)
                            startCard
                                .frame(width: 380)
                        }
                        .frame(maxWidth: 940)
                        .frame(maxWidth: .infinity)
                    } else {
                        VStack(alignment: .leading, spacing: 22) {
                            pitch
                            startControls
                            privacyNote
                            Spacer(minLength: 20)
                        }
                    }
                }
                // Centred vertically when it fits, scrollable when it doesn't (short windows).
                .frame(minHeight: isWide ? geo.size.height : 0, alignment: .center)
            }
        }
    }

    /// Icon, headline and what the app does.
    @ViewBuilder
    private var pitch: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "cart.fill")
                .font(.system(size: isWide ? 54 : 42))
                .foregroundStyle(Color.accentColor)
                .padding(.top, isWide ? 0 : 40)
            Text("Know where it’s cheapest")
                .font(isWide ? .system(size: 46, weight: .bold) : .largeTitle.bold())
                .fixedSize(horizontal: false, vertical: true)
            Text("Cartworth checks the grocery stores near you at the same time, converts every price to the same unit, and shows this week’s ad deals.")
                .font(isWide ? .title3 : .callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        VStack(alignment: .leading, spacing: 14) {
            Label("Live prices from the stores around you", systemImage: "antenna.radiowaves.left.and.right")
            Label("Per gallon, per pound, per dozen — compared fairly", systemImage: "scalemass")
            Label("Weekly ads, BOGOs and digital-coupon deals", systemImage: "tag")
            Label("Snap a recipe, get the cheapest shopping trip", systemImage: "camera")
        }
        .font(isWide ? .body : .subheadline)
    }

    /// The wide layout's right-hand column: the same controls, in a card.
    private var startCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Start with your neighborhood")
                .font(.headline)
            startControls
            privacyNote
        }
        .padding(20)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
    }

    private var startControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                Task { await useCurrentLocation() }
            } label: {
                HStack {
                    if busy { ProgressView().controlSize(.small) } else { Image(systemName: "location.fill") }
                    Text("Use my location")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(busy)

            HStack {
                TextField("or enter ZIP code", text: $zip)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 180)
                Button("Continue") { Task { await useZip() } }
                    .buttonStyle(.bordered)
                    .disabled(zip.count != 5 || busy)
                if isWide { Spacer(minLength: 0) }
            }
            if let error { InfoBanner(kind: .bad, symbol: "exclamationmark.triangle", text: error) }
        }
    }

    /// The first privacy statement anyone sees, before they have granted anything — so it has to
    /// be the true one.
    ///
    /// It used to read "It stays on your phone", which the app's own permission prompt flatly
    /// contradicts: `NSLocationWhenInUseUsageDescription` says Cartworth sends the ZIP, and for
    /// some retailers approximate coordinates, to the retailers' own websites. The plist string is
    /// the accurate one — sending the place to those endpoints is how prices are read at all — so
    /// this line now says the same thing, in the same order, before the ask rather than after it.
    /// An in-app claim that contradicts the purpose string is also a reviewable inaccuracy against
    /// the privacy nutrition label.
    private var privacyNote: some View {
        Text("Your location is only used to find stores near you. Cartworth sends your ZIP code — and for some retailers your approximate location — to those retailers’ own sites to look up their local prices. Your lists and price history stay on this device.")
            .font(.caption).foregroundStyle(.tertiary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var stores: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Stores near \(app.place?.city ?? app.place?.zip ?? "you")")
                    .font(.title2.bold())
                Text(app.isLoadingDirectory ? (app.directoryProgress ?? "Finding stores…") : "Pick the ones you shop. You can change these any time.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding(.top, 20)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity, alignment: .leading)

            if app.isLoadingDirectory && app.directory == nil {
                VStack(spacing: 10) {
                    ProgressView()
                    Text(app.directoryProgress ?? "Checking which stores have prices…").font(.footnote).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                StorePickerList()
            }

            Button {
                app.onboarded = true
            } label: {
                Text(app.selectedChainIds.isEmpty ? "Choose at least one store" : "Start comparing \(app.selectedChainIds.count) stores")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(app.selectedChainIds.isEmpty)
            .frame(maxWidth: isWide ? 420 : .infinity)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        // A list of store names is naturally one column — cap the measure rather than invent a
        // second one, and keep heading, list and button on the same axis.
        .readableWidth(720)
    }

    private func useCurrentLocation() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let loc = try await fetcher.current()
            let place = try await Geo.place(for: loc)
            await app.setPlace(place)
            step = 1
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn’t get your location. Enter your ZIP instead."
        }
    }

    private func useZip() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let place = try await Geo.place(forZip: zip)
            await app.setPlace(place)
            step = 1
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn’t find that ZIP code."
        }
    }
}

/// Nearby chains with their price source, selectable.
struct StorePickerList: View {
    @Environment(AppState.self) private var app

    var body: some View {
        List {
            if let dir = app.directory {
                Section {
                    ForEach(dir.chains.filter { $0.status != .none }) { chain in
                        row(chain)
                    }
                } header: {
                    Text("\(dir.chains.filter { $0.status != .none }.count) stores within \(Int(app.radiusMiles)) miles")
                } footer: {
                    Text("“Shelf prices” come from the store’s in-store listing. “Online (Instacart) prices” come from the store’s listing on Instacart, which can run higher than the shelf or the store’s own app. “National prices” are Instacart’s chain-wide listing, not a store near you. Ad-only stores don’t publish prices, but their weekly deals are included.")
                }
                let others = dir.chains.filter { $0.status == .none } + []
                if !others.isEmpty {
                    Section("No prices available") {
                        ForEach(others) { chain in row(chain) }
                    }
                }
                if !dir.others.isEmpty {
                    Section("Other stores nearby") {
                        ForEach(dir.others.prefix(12)) { s in
                            VStack(alignment: .leading, spacing: 2) {
                                StoreName(s.name).font(.subheadline)
                                Text([s.address, "\(Units.trimNum(s.distance)) mi"].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func row(_ chain: NearbyChain) -> some View {
        let selected = app.selectedChainIds.contains(chain.id)
        Button {
            if selected { app.selectedChainIds.removeAll { $0 == chain.id } } else { app.selectedChainIds.append(chain.id) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        StoreDot(storeId: chain.id)
                        // Word-safe: at an accessibility size a plain Text broke a one-word name
                        // like "Brookshire's" mid-word on a phone. See `StoreName`.
                        StoreName(chain.name).font(.body).fontWeight(.medium).foregroundStyle(.primary)
                    }
                    HStack(spacing: 6) {
                        switch chain.status {
                        case .shelf: Badge(text: "Shelf prices", kind: .good)
                        case .online: Badge(text: PriceProvenance.storeLabel(.online), kind: .info)
                        case .national: Badge(text: PriceProvenance.storeLabel(.national), kind: .info)
                        case .adsOnly: Badge(text: "Weekly ad only", kind: .neutral)
                        case .none: Badge(text: "No prices", kind: .outline)
                        }
                        if chain.hasAds && chain.status != .adsOnly { Badge(text: "weekly ad", kind: .neutral) }
                        if let d = chain.distance { Text("\(Units.trimNum(d)) mi").font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
