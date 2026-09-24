import Foundation
import Vision
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

struct RecipeIngredient: Identifiable, Hashable, Codable {
    var id = UUID()
    /// The line as written in the recipe
    var original: String
    var quantity: Double?
    var unit: String?
    /// Core ingredient name ("chicken breast", "unsalted butter")
    var name: String
    /// Probably already in the pantry (salt, pepper, oil…)
    var pantry: Bool
    /// User keeps it on the shopping list
    var include: Bool

    /// Text for the shopping list / search, with an amount when it's a purchasable measure ("chicken breast 2 lb").
    var listText: String {
        if let q = quantity, let u = unit, let s = Units.parseSize("\(Units.trimNum(q)) \(u)"), s.dim != .count || u.lowercased().hasPrefix("dozen") {
            // Cooking volumes (cups/tbsp) of dry goods don't map to a package size; keep the name only
            if ["cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons"].contains(u.lowercased()) { return name }
            return "\(name) \(Units.format(s))"
        }
        if let q = quantity, unit == nil, q >= 1, Rx("\\b(eggs?|lemons?|limes?|avocados?|onions?|potatoes|apples?|bananas?|peppers?|tomatoes?)\\b").test(name) {
            return "\(name) \(Int(q.rounded(.up))) ct"
        }
        return name
    }
}

struct ParsedRecipe: Hashable, Codable {
    var title: String?
    var servings: String?
    var ingredients: [RecipeIngredient]
    var source: String
}

enum RecipeImportError: LocalizedError {
    case noText, noIngredients, badURL, fetchFailed(String)
    var errorDescription: String? {
        switch self {
        case .noText: return "Couldn’t read any text in that photo. Try a closer, well-lit shot of the ingredient list."
        case .noIngredients: return "Couldn’t find an ingredient list. You can paste the ingredients instead."
        case .badURL: return "That doesn’t look like a recipe link."
        case .fetchFailed(let m): return "Couldn’t load that recipe page (\(m))."
        }
    }
}

enum RecipeImporter {
    // MARK: sources

    /// On-device text recognition.
    static func text(from image: UIImage) async throws -> String {
        guard let cg = image.cgImage else { throw RecipeImportError.noText }
        return try await withCheckedThrowingContinuation { cont in
            let request = VNRecognizeTextRequest { req, err in
                if let err { cont.resume(throwing: err); return }
                let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
                // Top-to-bottom, then left-to-right (two-column recipe cards)
                let lines = obs.sorted {
                    abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.012 ? $0.boundingBox.midY > $1.boundingBox.midY : $0.boundingBox.minX < $1.boundingBox.minX
                }.compactMap { $0.topCandidates(1).first?.string }
                cont.resume(returning: lines.joined(separator: "\n"))
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            let handler = VNImageRequestHandler(cgImage: cg, orientation: CGImagePropertyOrientation(image.imageOrientation))
            DispatchQueue.global(qos: .userInitiated).async {
                do { try handler.perform([request]) } catch { cont.resume(throwing: error) }
            }
        }
    }

    /// Recipe web page → schema.org Recipe data (most recipe sites publish it).
    static func fetch(url: URL) async throws -> ParsedRecipe {
        guard url.scheme?.hasPrefix("http") == true else { throw RecipeImportError.badURL }
        let r: HTTPResponse
        do { r = try await HTTP.shared.request(url, headers: ["Accept": "text/html"], timeout: 20) } catch { throw RecipeImportError.fetchFailed(error.localizedDescription) }
        guard r.ok else { throw RecipeImportError.fetchFailed("HTTP \(r.status)") }
        let html = r.text
        for block in Rx("<script[^>]*application/ld\\+json[^>]*>([\\s\\S]*?)</script>").matches(html) {
            guard let raw = block[1], let j = try? J.parse(Data(raw.trimmingCharacters(in: .whitespacesAndNewlines).utf8)) else { continue }
            if let recipe = findRecipe(j) {
                let lines = recipe["recipeIngredient"].array.compactMap { $0.text } + recipe["ingredients"].array.compactMap { $0.text }
                if !lines.isEmpty {
                    let yield = recipe["recipeYield"].text ?? recipe["recipeYield"][0].text
                    var parsed = await parse(lines: lines)
                    parsed.title = recipe["name"].text.map(decodeEntities)
                    parsed.servings = yield
                    parsed.source = url.host ?? "web"
                    return parsed
                }
            }
        }
        // No structured data: fall back to the page's visible text
        let text = decodeEntities(html.replacingOccurrences(of: "<script[\\s\\S]*?</script>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "<style[\\s\\S]*?</style>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "<br\\s*/?>|</p>|</li>|</h\\d>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression))
        var parsed = await parse(text: text)
        parsed.source = url.host ?? "web"
        guard !parsed.ingredients.isEmpty else { throw RecipeImportError.noIngredients }
        return parsed
    }

    private static func findRecipe(_ j: J) -> J? {
        switch j {
        case .arr(let a):
            for x in a { if let r = findRecipe(x) { return r } }
        case .obj(let d):
            let type = d["@type"] ?? .null
            let types = type.array.compactMap { $0.string } + [type.string].compactMap { $0 }
            if types.contains(where: { $0.lowercased() == "recipe" }) { return j }
            if let g = d["@graph"], let r = findRecipe(g) { return r }
            if let m = d["mainEntity"], let r = findRecipe(m) { return r }
        default: break
        }
        return nil
    }

    static func decodeEntities(_ s: String) -> String {
        var t = s
        for (k, v) in ["&amp;": "&", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&frac12;": "½", "&frac14;": "¼", "&frac34;": "¾", "&#8217;": "’", "&#x27;": "'", "&lt;": "<", "&gt;": ">", "&deg;": "°"] {
            t = t.replacingOccurrences(of: k, with: v)
        }
        return t
    }

    // MARK: parsing

    /// Free text (OCR or pasted) → ingredients.
    static func parse(text: String) async -> ParsedRecipe {
        let lines = ingredientSection(text)
        return await parse(lines: lines)
    }

    static func parse(lines: [String]) async -> ParsedRecipe {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let llm = await parseWithModel(lines) {
            return llm
        }
        #endif
        return ParsedRecipe(title: nil, servings: nil, ingredients: lines.compactMap(parseLine), source: "text")
    }

    /// Lines between "Ingredients" and "Instructions/Directions", or lines that look like ingredients.
    static func ingredientSection(_ text: String) -> [String] {
        let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let start = lines.firstIndex { Rx("^ingredients?\\b").test($0) }
        let stopRx = Rx("^(instructions|directions|method|preparation|steps|how to make|nutrition|notes)\\b")
        if let s = start {
            var out: [String] = []
            for l in lines[(s + 1)...] {
                if stopRx.test(l) { break }
                out.append(l)
            }
            if !out.isEmpty { return out }
        }
        return lines.filter { looksLikeIngredient($0) }
    }

    private static let qtyStart = Rx("^\\s*(?:[-•*▢□◦·]\\s*)?(\\d|½|⅓|⅔|¼|¾|⅛|⅜|⅝|⅞|one\\b|two\\b|three\\b|a\\s+(?:pinch|dash|handful))")
    private static func looksLikeIngredient(_ l: String) -> Bool {
        l.count < 90 && qtyStart.test(l) && !Rx("^\\d+\\s*(?:minutes?|mins?|hours?|servings?|°)").test(l) && !Rx("^step\\s+\\d").test(l)
    }

    private static let unicodeFractions: [Character: Double] = ["½": 0.5, "⅓": 1.0 / 3, "⅔": 2.0 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875]
    private static let unitWords = ["cups", "cup", "c", "tablespoons", "tablespoon", "tbsp", "tbs", "tbl", "teaspoons", "teaspoon", "tsp", "ounces", "ounce", "oz", "fl oz", "pounds", "pound", "lbs", "lb", "grams", "gram", "g", "kilograms", "kg", "ml", "milliliters", "liters", "liter", "l", "pinch", "pinches", "dash", "dashes", "cloves", "clove", "cans", "can", "packages", "package", "pkg", "sticks", "stick", "slices", "slice", "bunch", "bunches", "heads", "head", "sprigs", "sprig", "quarts", "quart", "qt", "pints", "pint", "pt", "gallons", "gallon", "dozen", "jars", "jar", "bags", "bag", "boxes", "box", "bottles", "bottle", "handful", "pieces", "piece", "fillets", "fillet"]
    private static let pantryRx = Rx("^(salt|kosher salt|sea salt|table salt|black pepper|pepper|ground black pepper|salt and pepper|water|ice|cooking spray|nonstick spray|vegetable oil|canola oil|olive oil|extra virgin olive oil|sugar|granulated sugar|all-purpose flour|flour|baking soda|baking powder|vanilla extract|vanilla|garlic powder|onion powder|paprika|cumin|chili powder|dried oregano|oregano|dried thyme|cinnamon|red pepper flakes|cayenne|bay leaf|bay leaves)$")
    private static let prepWords = Rx("\\b(finely|coarsely|roughly|thinly|freshly|lightly|well|very)?\\s*(chopped|diced|minced|sliced|grated|shredded|crushed|peeled|seeded|cubed|halved|quartered|julienned|melted|softened|beaten|divided|drained|rinsed|trimmed|packed|sifted|toasted|cooked|uncooked|cut|torn|zested|juiced|at room temperature|room temperature|to taste|for serving|for garnish|optional|plus more|or more|as needed)\\b")

    static func parseLine(_ raw: String) -> RecipeIngredient? {
        var s = raw.replacingOccurrences(of: "^\\s*[-•*▢□◦·]+\\s*", with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        guard s.count >= 2, s.count < 140 else { return nil }
        if Rx("^(ingredients?|for the|equipment|serves|yield|prep time|cook time|total time)\\b").test(s) { return nil }
        // Quantity (with unicode fractions and ranges)
        var qty: Double?
        for (ch, v) in unicodeFractions where s.contains(ch) {
            s = s.replacingOccurrences(of: String(ch), with: " \(v) ")
        }
        s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        if let m = Rx("^(\\d+(?:\\.\\d+)?)(?:\\s+(\\d+/\\d+|0\\.\\d+))?(?:\\s*(?:-|to|–)\\s*(\\d+(?:\\.\\d+)?(?:/\\d+)?))?\\s*").match(s), let whole = m[0] {
            var q = Units.parseNumber(m[1]) ?? 0
            if let frac = m[2] { q += Units.parseNumber(frac) ?? 0 }
            if let hi = m[3].flatMap(Units.parseNumber) { q = max(q, hi) }
            qty = q
            s = String(s.dropFirst(whole.count))
        } else if let m = Rx("^(\\d+/\\d+)\\s*").match(s), let whole = m[0] {
            qty = Units.parseNumber(m[1])
            s = String(s.dropFirst(whole.count))
        } else if let m = Rx("^(one|two|three|four|five|six)\\s+").match(s), let whole = m[0] {
            qty = ["one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6][m[1]!.lowercased()]
            s = String(s.dropFirst(whole.count))
        }
        // "(14.5 oz) can diced tomatoes" -> keep the package size as the unit
        var unit: String?
        if let m = Rx("^\\((\\d+(?:\\.\\d+)?)\\s*(oz|ounce|ounces|g|grams|ml|lb)\\.?\\)\\s*").match(s), let whole = m[0] {
            if let n = Double(m[1] ?? "") { qty = (qty ?? 1) * n }
            unit = m[2]
            s = String(s.dropFirst(whole.count))
        }
        let lower = s.lowercased()
        if unit == nil {
            for u in unitWords.sorted(by: { $0.count > $1.count }) {
                if lower.hasPrefix(u + " ") || lower.hasPrefix(u + ".") || lower == u {
                    unit = u
                    s = String(s.dropFirst(u.count)).trimmingCharacters(in: CharacterSet(charactersIn: ". "))
                    break
                }
            }
        } else {
            // skip a container word after a package size: "(15 oz) can black beans"
            s = s.replacingOccurrences(of: "^(cans?|jars?|packages?|boxes?|bags?)\\s+", with: "", options: [.regularExpression, .caseInsensitive])
        }
        s = s.replacingOccurrences(of: "^of\\s+", with: "", options: [.regularExpression, .caseInsensitive])
        // Remove parentheticals and prep notes after commas
        var name = s.replacingOccurrences(of: "\\([^)]*\\)", with: " ", options: .regularExpression)
        if let comma = name.firstIndex(of: ",") { name = String(name[..<comma]) }
        name = prepWords.replace(name, with: " ")
        name = name.replacingOccurrences(of: "\\b(large|medium|small|extra-large|jumbo|fresh|good quality|store-bought|homemade)\\b", with: " ", options: [.regularExpression, .caseInsensitive])
        name = name.replacingOccurrences(of: "\\bor\\b.*$", with: "", options: [.regularExpression, .caseInsensitive])
        name = name.replacingOccurrences(of: "[^A-Za-z0-9%&'’ -]", with: " ", options: .regularExpression)
        name = name.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces).lowercased()
        name = simplify(name)
        guard name.count >= 2, !Rx("^\\d+$").test(name) else { return nil }
        let pantry = pantryRx.test(name)
        return RecipeIngredient(original: raw.trimmingCharacters(in: .whitespaces), quantity: qty, unit: unit, name: name, pantry: pantry, include: !pantry)
    }

    /// Shorter, store-searchable names.
    static func simplify(_ n: String) -> String {
        var s = n
        let rules: [(String, String)] = [
            ("boneless,? skinless chicken breasts?( halves)?", "chicken breast"), ("chicken breasts?", "chicken breast"),
            ("boneless,? skinless chicken thighs?", "chicken thighs"), ("garlic cloves?|cloves? garlic|cloves? of garlic", "garlic"),
            ("large eggs|eggs", "eggs"), ("unsalted butter", "unsalted butter"), ("salted butter", "butter"),
            ("heavy whipping cream|heavy cream", "heavy cream"), ("yellow onions?|white onions?|onions?", "onion"),
            ("scallions|green onions", "green onions"), ("russet potatoes|potatoes", "potatoes"), ("lemon juice", "lemons"), ("lime juice", "limes"),
            ("shredded cheddar cheese|cheddar cheese", "cheddar cheese"), ("grated parmesan cheese|parmesan cheese|parmigiano reggiano", "parmesan cheese"),
            ("ground beef.*", "ground beef"), ("diced tomatoes", "diced tomatoes"), ("tomato paste", "tomato paste"),
        ]
        for (p, r) in rules where s.range(of: "^(\(p))$", options: [.regularExpression, .caseInsensitive]) != nil {
            s = r
            break
        }
        return s
    }

    // MARK: Apple Intelligence (on-device), when available

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    @Generable
    struct GenIngredient {
        @Guide(description: "Numeric quantity as a decimal, or 0 if none")
        var quantity: Double
        @Guide(description: "Unit as written, lowercase, e.g. cup, tbsp, lb, oz, clove, can; empty if none")
        var unit: String
        @Guide(description: "Short grocery-store product name to search for, lowercase, no preparation words, e.g. 'chicken breast', 'unsalted butter', 'diced tomatoes'")
        var name: String
        @Guide(description: "True for basic pantry staples most kitchens already have: salt, pepper, water, cooking oil, sugar, flour, common dried spices")
        var pantry: Bool
    }

    @available(iOS 26.0, *)
    @Generable
    struct GenRecipe {
        @Guide(description: "One entry per ingredient line, in order")
        var ingredients: [GenIngredient]
    }

    @available(iOS 26.0, *)
    static func parseWithModel(_ lines: [String]) async -> ParsedRecipe? {
        guard SystemLanguageModel.default.isAvailable, !lines.isEmpty, lines.count <= 60 else { return nil }
        let session = LanguageModelSession(instructions: "You convert recipe ingredient lines into grocery shopping items. Ignore section headers and instructions.")
        let prompt = "Ingredient lines:\n" + lines.joined(separator: "\n")
        guard let response = try? await session.respond(to: prompt, generating: GenRecipe.self) else { return nil }
        let items = response.content.ingredients
        guard !items.isEmpty else { return nil }
        let ingredients: [RecipeIngredient] = items.enumerated().compactMap { i, g in
            let name = g.name.trimmingCharacters(in: .whitespaces).lowercased()
            guard name.count >= 2 else { return nil }
            return RecipeIngredient(original: i < lines.count ? lines[i] : name, quantity: g.quantity > 0 ? g.quantity : nil,
                                    unit: g.unit.isEmpty ? nil : g.unit, name: simplify(name), pantry: g.pantry, include: !g.pantry)
        }
        return ParsedRecipe(title: nil, servings: nil, ingredients: ingredients, source: "text")
    }
    #endif
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
