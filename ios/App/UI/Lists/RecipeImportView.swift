import SwiftUI
import SwiftData
import PhotosUI
import VisionKit

/// Photo / link / pasted text → ingredients → shopping list.
struct RecipeImportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var ctx
    @Environment(Router.self) private var router

    @State private var stage: Stage = .pick
    @State private var photoItem: PhotosPickerItem?
    @State private var showScanner = false
    @State private var urlText = ""
    @State private var pastedText = ""
    @State private var recipe: ParsedRecipe?
    @State private var error: String?
    @State private var busy = false
    @State private var title = ""

    enum Stage { case pick, review }

    var body: some View {
        NavigationStack {
            Group {
                switch stage {
                case .pick: picker
                case .review: review
                }
            }
            .navigationTitle(stage == .pick ? "Add from a recipe" : "Ingredients")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if stage == .review {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add \(selectedCount)") { addToList() }.disabled(selectedCount == 0)
                    }
                }
            }
            // Full screen, not a sheet. This view is itself presented as a sheet, and on iPad a
            // sheet inside a sheet is a 580x650 form sheet: VNDocumentCameraViewController put
            // its shutter, Auto/Manual and filter controls in a column jammed against the right
            // edge of that box with a postage-stamp preview beside them. A camera wants the
            // window. On iPhone this also drops the page-sheet grabber over the viewfinder.
            .fullScreenCover(isPresented: $showScanner) {
                DocumentScanner { images in
                    showScanner = false
                    if let first = images.first { Task { await handle(image: first) } }
                }
                .ignoresSafeArea()
            }
        }
    }

    private var selectedCount: Int { recipe?.ingredients.filter(\.include).count ?? 0 }

    private var picker: some View {
        ScrollView {
            VStack(spacing: 14) {
                if busy {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("Reading the recipe…").font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 30)
                }
                if let error { InfoBanner(kind: .bad, symbol: "exclamationmark.triangle", text: error) }

                Button { showScanner = true } label: {
                    optionLabel("Scan a recipe", "Point your camera at a cookbook page or card", "doc.viewfinder")
                }
                PhotosPicker(selection: $photoItem, matching: .images) {
                    optionLabel("Choose a photo", "Use a screenshot or saved photo", "photo.on.rectangle")
                }
                .onChange(of: photoItem) { _, item in
                    guard let item else { return }
                    Task {
                        if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                            await handle(image: img)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Label("Paste a recipe link", systemImage: "link").font(.subheadline.weight(.semibold))
                    HStack {
                        TextField("https://…", text: $urlText)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        Button("Go") { Task { await handleURL() } }
                            .buttonStyle(.bordered)
                            .disabled(urlText.isEmpty || busy)
                    }
                }
                .padding(12)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 8) {
                    Label("Or paste the ingredients", systemImage: "text.alignleft").font(.subheadline.weight(.semibold))
                    TextEditor(text: $pastedText)
                        .frame(height: 120)
                        .padding(6)
                        .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
                    Button("Use this text") { Task { await handle(text: pastedText) } }
                        .buttonStyle(.bordered)
                        .disabled(pastedText.count < 10 || busy)
                }
                .padding(12)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
            .padding(16)
            // Four stacked choices, so one column is the right shape. The cap only bites if this
            // is ever presented wider than a form sheet (a wide window, a future page sheet);
            // inside today's 580pt iPad sheet and on a phone it changes nothing.
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
    }

    private func optionLabel(_ title: String, _ sub: String, _ symbol: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.title2).frame(width: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .foregroundStyle(.primary)
    }

    private var review: some View {
        List {
            Section {
                TextField("Recipe name", text: $title)
            } footer: {
                Text("Uncheck anything you already have. Cartworth will price the rest at every store you follow.")
            }
            if let r = recipe {
                Section("Ingredients (\(r.ingredients.count))") {
                    ForEach(Array(r.ingredients.enumerated()), id: \.element.id) { i, ing in
                        Button {
                            recipe?.ingredients[i].include.toggle()
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: ing.include ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(ing.include ? Color.accentColor : .secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ing.listText).foregroundStyle(.primary)
                                    Text(ing.original).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                if ing.pantry { Badge(text: "pantry", kind: .neutral) }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func handle(image: UIImage) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let text = try await RecipeImporter.text(from: image)
            guard text.count > 10 else { throw RecipeImportError.noText }
            await handle(text: text)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn’t read that photo."
        }
    }

    private func handle(text: String) async {
        busy = true
        error = nil
        defer { busy = false }
        let parsed = await RecipeImporter.parse(text: text)
        guard !parsed.ingredients.isEmpty else {
            error = RecipeImportError.noIngredients.errorDescription
            return
        }
        recipe = parsed
        title = parsed.title ?? "Recipe"
        stage = .review
    }

    private func handleURL() async {
        busy = true
        error = nil
        defer { busy = false }
        guard let url = URL(string: urlText.hasPrefix("http") ? urlText : "https://\(urlText)") else {
            error = RecipeImportError.badURL.errorDescription
            return
        }
        do {
            let parsed = try await RecipeImporter.fetch(url: url)
            recipe = parsed
            title = parsed.title ?? url.host ?? "Recipe"
            stage = .review
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Couldn’t read that page."
        }
    }

    private func addToList() {
        guard let r = recipe else { return }
        let name = title.trimmingCharacters(in: .whitespaces).isEmpty ? "Recipe" : title
        for (i, ing) in r.ingredients.enumerated() where ing.include {
            ctx.insert(ListEntry(text: ing.listText, qty: 1, sort: i, recipe: name))
        }
        try? ctx.save()
        dismiss()
    }
}

/// VisionKit document scanner wrapper.
struct DocumentScanner: UIViewControllerRepresentable {
    var onFinish: ([UIImage]) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onFinish: ([UIImage]) -> Void
        init(onFinish: @escaping ([UIImage]) -> Void) { self.onFinish = onFinish }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            onFinish(images)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { onFinish([]) }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { onFinish([]) }
    }
}
