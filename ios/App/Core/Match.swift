import Foundation

/// Query/product relevance scoring.
/// Store search engines return tangential products ("milk chocolate" for "milk"); every product
/// gets a 0…1 score so "best price" summaries only use true matches.
enum Match {
    static let relevant: Double = 0.55

    private static let stop: Set<String> = ["the", "a", "an", "of", "and", "or", "for", "with", "in", "to", "by", "fresh", "brand", "ct", "oz", "lb", "pack", "pk"]

    private static let synonyms: [String: [String]] = [
        "oj": ["orange", "juice"], "tp": ["toilet", "paper"], "evoo": ["extra", "virgin", "olive", "oil"],
        "pb": ["peanut", "butter"], "pj": ["pajama"], "bsb": ["boneless", "skinless", "breast"], "bscb": ["boneless", "skinless", "chicken", "breast"],
        "hh": ["half", "half"], "half-and-half": ["half", "half"],
        // One spelling each ("bbq sauce" finds Barbecue Sauce, "black-eyed peas" Blackeye Peas).
        "barbecue": ["bbq"], "bar-b-q": ["bbq"], "blackeye": ["black", "eyed"], "blackeyed": ["black", "eyed"],
    ]

    /// Words that turn a product into something else when they follow the searched noun
    /// ("milk" -> "milk chocolate", "banana" -> "banana bread", "chicken" -> "chicken broth").
    private static let traps: Set<String> = [
        "chocolate", "candy", "cookie", "cracker", "cereal", "snack", "bread", "crumb", "muffin", "cake", "pie", "brownie", "donut",
        "sauce", "dressing", "soup", "broth", "stock", "bouillon", "seasoning", "marinade", "rub", "gravy", "mix", "powder",
        "drink", "juice", "smoothie", "shake", "yogurt", "creamer", "cheese", "noodle", "pasta", "ramen", "ricotta",
        "soap", "shampoo", "conditioner", "lotion", "candle", "freshener", "spray", "wipe", "detergent", "cleaner", "filter", "mug",
        "treat", "dog", "cat", "pet", "kibble", "bone", "infant", "toddler", "gummy", "gummies", "vitamin", "supplement",
        "extract", "syrup", "spread", "dip", "jam", "jelly", "preserve", "pudding", "gelatin", "hash", "fry", "surprise", "popsicle", "bar", "bite", "chip", "crisp",
        "nugget", "tender", "patty", "burger", "sausage", "jerky", "salad", "sandwich", "wrap", "pizza", "meal", "entree", "kit",
        // Compound-modifier nouns: "peanut butter", "cream cheese", "macaroni and cheese",
        // "beef base", "butter lettuce". Without these the head noun matched and the product
        // scored as a real hit. Every one is guarded by "not in the query" at the call site, so
        // searching for peanut butter still works.
        "peanut", "cream", "macaroni", "mac", "chili", "base", "lettuce", "dinner", "casserole", "bisque",
        // "Tomato Ketchup" was the best "tomatoes", "Spaghetti Squash" the best "spaghetti".
        "ketchup", "catsup", "paste", "squash",
        "stew", "hummus", "pesto", "salsa", "guacamole", "dressing", "concentrate", "concentrated", "substitute", "flavoring",
        // Head nouns that make the searched word a modifier: "butter popcorn", "butter shrimp",
        // "all butter danish". Found in live Sam's Club and Costco results, where each produced an
        // absurd per-pound price that then set the scale of the per-store chart. Mirrors the same
        // addition in shared/match.js; the two must not diverge.
        "popcorn", "pretzel", "granola", "danish", "twist", "pastry", "scone", "croissant", "roll",
        "shrimp", "salmon", "tuna", "crab", "lobster", "scallop", "fish", "chicken", "beef", "pork",
        // The rest of the shellfish: "Garlic Butter Mussels" is seafood, not butter. "Oyster
        // mushrooms" are mushrooms: see benignBefore. Mirrors shared/match.js.
        "clam", "mussel", "oyster", "squid", "octopus",
        "turkey", "ham", "bacon", "steak", "ravioli", "lasagna", "pierogi", "dumpling", "taco", "burrito",
        "cupcake", "brownie", "toffee", "fudge", "caramel", "praline", "nut", "almond", "cashew", "pecan",
        // Single-serve and concentrated forms that cannot be compared on unit price with the thing
        // itself: a K-Cup box against ground coffee, a wellness shot against a carton of juice.
        // Found live at 16x to 59x the median. Mirrors shared/match.js.
        "pod", "keurig", "capsule", "shot", "concentrate", "instant", "powdered",
        // Non-food that shares a food word. "Body Butter" skincare matched a butter search at
        // $119/lb in live Sprouts results. NOT "pan" or "skillet": "Pan Pizza" is a real food and
        // adding them made a pizza search reject DiGiorno. Cookware is left to the plausibility
        // guard, which judges the unit price rather than guessing from the name.
        "skincare", "balm", "salve", "elixir", "tallow", "body", "wellness", "serum", "moisturizer",
        "cookware", "utensil",
        // Hardware that shares "aluminum foil" (a dryer-vent foil duct, HVAC foil tape). Mirrors shared/match.js.
        "duct", "hvac", "tape",
        "boiled", "deviled", "pickled",
        // Imitation products and prepared dishes. These eight words existed on the web and were
        // missing here, which is how "Best Choice Tastes Like Butter" — margarine — scored 0.920 on
        // the phone against 0.276 on the website and won the BEST PRICE card for a butter search,
        // and how a "Turkey, Sweet Potatoes Cranberries Recipe in Gravy" can of Whole Paws dog food
        // scored 0.800 here against 0.320 on the web and headlined "whole turkey".
        "margarine", "buttery", "imitation", "potato", "potatoes", "mashed", "gratin", "pilaf",
        "oil", "vinegar", "tea", "coffee", "cone", "waffle", "pancake", "bagel", "tortilla", "bun", "biscuit", "croissant",
        "pastry", "granola", "bouquet", "plant", "seed", "fertilizer", "toy", "costume", "card", "flavored", "flavor", "cream", "butter",
        // Legumes as a compound modifier: "Brown Sugar & Hickory Baked Beans" covered both words of
        // "brown sugar" and became the cheapest brown sugar at three chains. Safe for the basket
        // because a trap is skipped whenever the shopper typed it, so "green beans" is untouched.
        "bean", "lentil", "chickpea",
        // Bakery shapes that carry a fruit name: a "Cranberry Orange Walnut Boule" was Sam's Club's
        // headline price for fresh cranberries at $5.05/lb.
        "boule", "loaf", "baguette", "walnut", "pistachio",
        // Alcohol. Hard cider scored 0.80-0.90 against "apple cider" in every ZIP and at $170/gal
        // dragged the median far enough to move the plausibility floor. Guarded by the query, so
        // someone searching for wine or seltzer still finds it.
        "hard", "alcoholic", "beer", "ale", "lager", "ipa", "wine", "vodka", "whiskey", "whisky", "rum",
        "tequila", "bourbon", "liqueur", "brandy", "cocktail", "hopped", "cerveza", "seltzer",
        // Flyers print the grape, not the word "wine": JaM Cellars' "Butter" Chardonnay scored as
        // butter in the weekly-ad search. Mirrors shared/match.js.
        "chardonnay", "merlot", "cabernet", "pinot", "sauvignon", "riesling", "moscato", "zinfandel", "malbec",
        "prosecco", "stout", "perry", "cellars", "winery", "vineyard", "brewery", "brewing",
        // Health and beauty that borrows a food word: "Redken All Soft Heavy Cream Treatment" at
        // $632/gal was a relevant match for "heavy cream".
        "treatment", "tonic", "detox", "scalp", "hair", "cosmetic", "makeup", "deodorant",
        // Seasonings and dressings named after the dish. A 1.12 oz jar of "McCormick Pumpkin Pie
        // Spice" is correctly priced at $99.86/lb and has nothing to do with the price of a pie.
        "spice", "vinaigrette",
    ]

    /// Whole-name markers for things that are not groceries at all.
    ///
    /// The position-aware trap loop cannot see these: it skips any word sitting behind an "in" or
    /// "with" phrase (so "tuna in oil" is not penalised), and that is exactly where the giveaway
    /// lands in "Turkey in Disguise (Hardcover)". Mirrors shared/match.js.
    /// Supplements named after a food ("NaturesPlus Apple Pectin 500 mg Tablets" was Dallas's best
    /// "apples"). Port of SUPPLEMENT_RE in shared/match.js.
    /// A dose alone is not enough ("Milk with Vitamin D 400 IU" is milk); the pill's form word is.
    /// A processed form of fresh fruit ("Diced Canned Tomatoes"). Port of PROCESSED_FORM_RE.
    private static let processedFormRx = Rx("\\bin (?:light |heavy )?(?:syrup|juice)\\b|\\b(?:canned|diced|crushed|stewed|sun[- ]?dried|freeze[- ]?dried|dried|dehydrated|pureed?|frozen)\\b")
    private static let aLaRx = Rx("\\ba la\\b")
    private static let supplementRx = Rx("\\b(?:tablets?|caplets?|softgels?|vegcaps?|veggie caps|lozenges?|chewables?)\\b")
    private static let wantsSupplementRx = Rx("\\b(?:tablets?|caplets?|capsules?|softgels?|supplements?|vitamins?|pectin|lozenges?|chewable|mg|mcg)\\b")
    private static let nonGroceryRx = Rx("\\b(?:hardcover|paperback|board book|audiobook|dvd|blu-?ray|vinyl record|jigsaw|puzzle|stainless steel|tumbler|cookbook|gift card|apparel|t-shirt|lawn|light-?up|led lights?|string lights|inflatable|ornaments?|wreaths?|garland|tree topper|gift wrap|wrapping paper|nativity|figurines?|candles?|pajamas|sweater|scrub|dolls?)\\b")

    /// Imitation markers: a product that says it merely tastes like the thing is not the thing.
    /// Flavoured waters named after the drink they taste of ("Spiced Cider Sparkling Water" is not
    /// sparkling cider). Mirrors WATER_DRINK_RE / WANTS_WATER_RE in shared/match.js.
    /// Baby FOOD by what it is, not the word 'baby' (Baby Spinach and Baby Carrots are vegetables).
    /// Mirrors BABY_PRODUCT_RE / WANTS_BABY_RE in shared/match.js.
    private static let babyProductRx = Rx("\\bbaby (?:foods?|formula|wipes?|puree|cereal|shampoo|lotion|wash|oil|powder|snacks?|puffs|teethers?|yogurt melts)\\b|\\bgerber\\b|\\bbeech-?nut\\b|\\bstage [1-4]\\b|\\bfor babies\\b")
    private static let wantsBabyRx = Rx("\\bbaby (?:food|formula|cereal|wipes?)\\b|\\bformula\\b|\\bgerber\\b|\\bbeech-?nut\\b|\\binfant\\b|\\btoddler\\b")
    /// Fresh fruit bought loose (not vegetables: frozen green beans answer "green beans"). Port of FRESH_FRUIT_RE.
    private static let freshFruitRx = Rx("\\b(?:mandarins?|clementines?|tangerines?|bananas?|plantains?|apples?|oranges?|lemons?|limes?|grapefruits?|avocados?|mangos?|mangoes|pears?|peach(?:es)?|nectarines?|plums?|kiwis?|grapes?|strawberr(?:y|ies)|blueberr(?:y|ies)|raspberr(?:y|ies)|blackberr(?:y|ies)|cherr(?:y|ies)|pineapples?|melons?|watermelons?|cantaloupes?|tomato(?:es)?)\\b")
    private static let waterDrinkRx = Rx("\\b(?:sparkling|mineral|spring|flavou?red|still|infused) water\\b|\\bseltzer\\b|\\bla croix\\b")
    private static let wantsWaterRx = Rx("\\bwater\\b|\\bseltzer\\b|\\bla croix\\b")
    /// Juice-flavoured drinks: Costco's "Sunny D Citrus Punch", filed under Orange Juice, was
    /// Minneapolis's best orange juice. Port of JUICE_IMPOSTOR_RE in shared/match.js.
    private static let juiceImpostorRx = Rx("\\bpunch\\b|\\b(?:orange|lemon|lime|cherry|grape|power|gator)ade\\b|\\bjuice (?:drink|beverage|cocktail blend)s?\\b|\\bsunny ?d\\b|\\bhi[- ]?c\\b|\\bkool[- ]?aid\\b|\\bcapri ?sun\\b|\\btampico\\b|\\bdrink mix\\b")
    private static let wantsJuiceDrinkRx = Rx("\\bpunch\\b|\\bdrinks?\\b|\\bbeverage\\b|\\bsunny ?d\\b|\\bhi[- ]?c\\b|\\bkool[- ]?aid\\b|\\bcapri ?sun\\b|\\btampico\\b")
    private static let juiceWordRx = Rx("\\bjuice\\b")
    private static let imitationRx = Rx("\\btastes?\\s+like\\b|\\bimitation\\b|\\b(?:butter|cheese|milk|meat|crab)[- ]style\\b|\\balternative to\\b|\\bsubstitute\\b")
    /// ...unless the shopper is looking for the imitation category itself, in which case a name
    /// like "Tastes Like Butter Margarine" is exactly what they asked for.
    private static let imitationCategoryRx = Rx("\\bmargarine|spreads?|substitutes?|alternatives?|non-?dairy|plant[- ]?based|vegan\\b")

    /// Qualifiers that turn a trap noun back into an ordinary description of the searched product.
    ///
    /// "Sweet Cream Butter" is the standard US label for plain butter — Land O'Lakes, Kirkland and
    /// every ALDI store brand use it — but 'cream' is a trap so that "cream cheese" does not score
    /// as cheese. Plain butter scored 0.40 and lost to spreadable blends at 0.97.
    /// From the Christmas run: "Sprinkles Mix" is sprinkles, "Ocean Spray" is a brand, a "Juice Cocktail" is juice.
    private static let benignAfter: [String: Set<String>] = ["cream": ["sweet", "whipping"], "mix": ["sprinkle"], "spray": ["ocean"], "cocktail": ["juice"], "concentrate": ["from"], "squash": ["zucchini", "yellow", "summer", "butternut", "acorn"]]
    /// A trap noun forgiven when the next word names what it is: "King Oyster Mushrooms" are
    /// mushrooms. Mirrors BENIGN_BEFORE in shared/match.js.
    private static let benignBefore: [String: Set<String>] = ["oyster": ["mushroom"]]

    /// How the food is kept, not what it is. Only these are forgiven when the retailer's own
    /// category is exactly what was searched. 'dried' is deliberately absent: dried cranberries are
    /// a different commodity from fresh ones and sell at a wildly different price per pound.
    private static let storageState: Set<String> = ["frozen", "chilled", "refrigerated"]
    /// Plant bases in front of the noun make a different product ("almond milk").
    private static let altBase: Set<String> = ["almond", "oat", "oatmilk", "soy", "coconut", "cashew", "rice", "hemp", "macadamia", "pea", "plant", "pistachio", "flax", "banana", "evaporated", "condensed", "powdered", "dry", "goat"]
    /// Prepared/processed forms are still the product but rarely what a price-checker wants.
    private static let mild: Set<String> = ["frozen", "dried", "liquid", "breaded", "stuffed", "rotisserie", "cooked", "grilled", "fried", "marinated", "seasoned", "smoked", "glazed", "sweetened", "mini", "snack", "kids"]
    /// Flavors make it a different product for comparison ("chocolate milk" vs "milk").
    private static let flavor: Set<String> = ["chocolate", "strawberry", "vanilla", "banana", "caramel", "mocha", "cinnamon", "honey", "maple", "pumpkin", "peppermint", "cookie", "cherry", "blueberry", "raspberry", "peach", "mango", "coconut", "hazelnut", "flavored", "flavor"]
    /// Flavours that ARE the product when the shopper names it: candy canes are peppermint. Keyed by
    /// a word of the query. Mirrors INHERENT_FLAVOR in shared/match.js.
    private static let inherentFlavor: [String: Set<String>] = ["cane": ["peppermint"], "bark": ["peppermint", "chocolate"], "fudge": ["chocolate"], "brownie": ["chocolate"], "truffle": ["chocolate"], "cocoa": ["chocolate"], "tomato": ["cherry"], "tomatoes": ["cherry"]]
    /// Qualifiers that are just variants (never penalized).
    /// Words that describe, rather than change, what a particular query asks for ("Beef Ribeye
    /// Steak" answers "steak", a Cabernet answers "wine"). Port of QUERY_ALLOWS in shared/match.js.
    private static let animals = ["beef", "pork", "chicken", "turkey", "lamb", "bone", "frozen", "smoked"]
    private static let alcoholWords = ["wine", "red", "white", "rose", "sparkling", "chardonnay", "merlot", "cabernet", "pinot", "sauvignon", "riesling", "moscato", "zinfandel", "malbec", "prosecco", "cellars", "winery", "vineyard", "brut", "champagne", "cava"]
    private static let queryAllows: [String: Set<String>] = [
        "wine": Set(alcoholWords), "prosecco": Set(alcoholWords), "champagne": Set(alcoholWords),
        "steak": Set(animals), "ribeye": Set(animals), "brisket": Set(animals), "rib": Set(animals), "chop": Set(animals), "roast": Set(animals), "tenderloin": Set(animals),
        "sirloin": Set(animals), "wing": Set(animals), "dog": Set(animals + ["frank"]), "frank": Set(animals), "brat": Set(animals + ["beer"]), "sausage": Set(animals),
        "turkey": ["frozen"], "ham": ["honey", "spiral", "smoked", "pork"],
        "bun": ["hot", "dog", "hamburger", "seed", "sesame"], "croissant": ["butter", "mini"], "flower": ["bouquet", "cut", "mixed"],
        "pumpkin": ["pie", "carving"], "stuffing": ["mix", "turkey", "chicken", "cornbread", "herb", "seasoned"],
        "candy": ["snack", "halloween", "chocolate", "assortment"], "wrapper": ["wrap", "round"], "chip": ["potato", "tortilla", "kettle"],
        "tortilla": ["taco", "soft"], "tortillas": ["taco", "soft"], "chocolate": ["bar", "dark"], "pea": ["dry", "dried"], "peas": ["dry", "dried"], "filling": ["mix"],
        "watermelon": ["mini", "seedless", "personal"], "bar": ["oat", "honey"],
        "bacon": ["smoked", "hardwood", "pork"],
    ]
    /// Products that normally come in flavours. Port of FLAVOR_OK_HEADS.
    private static let flavorOkHeads: Set<String> = ["bar", "chip", "cereal", "candy", "soda", "bread", "ham", "meat", "cracker", "cookie", "sauce", "bean", "granola"]
    /// Compound names that are a different product. Ports of HEAD_COMPOUNDS / MODIFIER_COMPOUNDS.
    private static let headCompounds = ["peanut butter cup", "bacon bit", "corn flake", "corn tortilla", "flour tortilla", "celery salt", "celery seed",
        "onion salt", "garlic salt", "yogurt raisin", "yogurt covered", "yogurt pretzel", "wine glass", "glass set", "champagne flute",
        "sugar free", "charcoal toothpaste", "chocolate milk"].map { tokens($0) }
    private static let modifierCompounds = ["baking soda", "cooking wine", "creme egg", "cadbury egg", "chocolate egg", "plastic egg", "mini egg",
        "candy corn", "corned beef brisket", "cottage cheese", "salisbury steak"].map { tokens($0) }
    private static func stem(_ w: String) -> String { w.hasSuffix("s") ? String(w.dropLast()) : w }
    private static func hasPhrase(_ words: [String], _ phrase: [String]) -> Bool {
        guard !phrase.isEmpty, words.count >= phrase.count else { return false }
        for i in 0...(words.count - phrase.count) where phrase.indices.allSatisfy({ stem(words[i + $0]) == stem(phrase[$0]) }) { return true }
        return false
    }
    /// Canned and dried forms of vegetables and meats. Ports of FRESH_VEG_MEAT_RE / SHELF_FORM_RE.
    /// Cuts of a bird or animal ("Chicken Drumsticks" filed under Chicken Wings). Port of CUTS.
    private static let cuts: Set<String> = ["wing", "drumstick", "thigh", "breast", "leg", "tenderloin", "tender", "gizzard", "liver", "neck", "quarter", "drumette"]
    private static let champagneGrapesRx = Rx("\\bchampagne grapes?\\b")
    private static let grapeRx = Rx("\\bgrape")
    private static let freshVegMeatRx = Rx("^(?:asparagus|carrot|celery|onion|cabbage|potato|cilantro|choy|broccoli|spinach|kale|lettuce|mushroom|pepper|cucumber|zucchini|beef|brisket|ham|chicken|pork|lamb|turkey|steak)$")
    private static let shelfFormRx = Rx("\\b(?:canned|dehydrated|freeze[- ]?dried)\\b")

    private static let soft: Set<String> = ["organic", "lactose", "free", "ultra", "filtered", "reduced", "fat", "low", "whole", "skim", "natural", "grass", "fed", "pasture", "raised", "cage", "large", "medium", "small", "extra", "jumbo", "grade", "fresh", "boneless", "skinless", "lean", "ground"]
    /// Product words that imply another ("ground chuck" is ground beef).
    private static let implies: [String: [String]] = ["champagne": ["sparkling", "wine"], "prosecco": ["sparkling", "wine"], "cava": ["sparkling", "wine"], "frank": ["dog"], "chuck": ["beef"], "sirloin": ["beef"], "brisket": ["beef"], "ribeye": ["beef"], "kcup": ["coffee"], "k-cup": ["coffee"], "espresso": ["coffee"], "cage": ["egg"], "clementine": ["mandarin"], "cutie": ["mandarin"], "tp": ["toilet"]]
    private static let chipNoise: Set<String> = ["carton", "bottle", "jug", "container", "package", "bag", "box", "can", "jar", "each", "value", "family", "size", "select", "original", "classic", "premium", "organic", "brand", "pack", "count", "ounce", "gallon", "gal", "quart", "half", "pint", "fl", "lb", "lbs", "oz", "ct", "with", "made", "great", "best", "store", "kroger", "signature", "good", "gather", "market", "pantry", "farm", "farms", "simple", "truth", "nature", "kirkland", "365", "everyday", "item", "items"]

    private static let percentRx = Rx("(\\d)\\s*%")
    private static let junkRx = Rx("[^a-z0-9%.\\s-]", caseInsensitive: false)
    private static let looseDashRx = Rx("(?<![a-z0-9])-|-(?![a-z0-9])", caseInsensitive: false)
    private static let spaceRx = Rx("\\s+", caseInsensitive: false)
    private static let pureNumberRx = Rx("^\\d+(\\.\\d+)?$", caseInsensitive: false)
    private static let sizeTokenRx = Rx("^\\d+(oz|lb|ct|gal|fl)$")

    static func normalize(_ s: String?) -> String {
        guard var t = s, !t.isEmpty else { return "" }
        t = t.lowercased().folding(options: [.diacriticInsensitive], locale: nil)
        t = t.replacingOccurrences(of: "\u{00AE}", with: " ").replacingOccurrences(of: "\u{2122}", with: " ").replacingOccurrences(of: "\u{00A9}", with: " ")
        // Apostrophes are NOT deleted. shared/match.js simply leaves them out of the `[^a-z0-9%.\s-]`
        // keep-set, so both ' and U+2019 become a SPACE. Deleting them welded the halves into one
        // token, which singular() then mangled ("joes" -> "jo", because it ends in "oes"), and the
        // possessive brands that fill this catalog (Trader Joe's, Mariano's, Sam's Club, Raley's)
        // scored differently on the phone and on the web. junkRx below does the replacement.
        t = t.replacingOccurrences(of: "&", with: " and ")
        t = percentRx.replace(t, with: "$1%")
        t = junkRx.replace(t, with: " ")
        t = looseDashRx.replace(t, with: " ")
        t = spaceRx.replace(t, with: " ")
        return t.trimmingCharacters(in: .whitespaces)
    }

    /// Nouns that already end in -ie, so their plural -ies is just an added s.
    ///
    /// English cannot decide this from the letters: "anchovies" -> "anchovy" but "brownies" ->
    /// "brownie", and the two words rhyme. The -ies -> -y rule turned "cookies" into "cooky", a
    /// token in neither `traps` nor `flavor`, so every cookie product escaped the penalty its
    /// singular form receives — which is how a box of "Benton's Pecan Shortbread Cookies" became
    /// ALDI's cheapest pecans at $2.77/lb against real chopped pecans at $7.18/lb.
    private static let iePlurals: Set<String> = ["cookies", "brownies", "smoothies", "veggies", "hoagies"]

    static func singular(_ w: String) -> String {
        if w.count <= 3 || w.contains(where: \.isNumber) { return w }
        if w.hasSuffix("ss") || w.hasSuffix("us") || w.hasSuffix("is") || w.hasSuffix("as") { return w }
        if iePlurals.contains(w) { return String(w.dropLast()) }
        if w.hasSuffix("ies") && w.count > 4 { return String(w.dropLast(3)) + "y" }
        if w.hasSuffix("oes") { return String(w.dropLast(2)) }
        for suf in ["ches", "shes", "xes", "zes", "sses"] where w.hasSuffix(suf) { return String(w.dropLast(2)) }
        if w.hasSuffix("ves") && w.count > 5 { return String(w.dropLast(3)) + "f" }
        if w.hasSuffix("s") { return String(w.dropLast()) }
        return w
    }

    static func tokens(_ s: String?) -> [String] {
        var out: [String] = []
        for raw in normalize(s).split(separator: " ").map(String.init) where !raw.isEmpty {
            if let syn = synonyms[raw] {
                out.append(contentsOf: syn)
                continue
            }
            for part in raw.split(separator: "-").map(String.init) where !part.isEmpty {
                var p = part
                if p.hasSuffix(".") { p.removeLast() }
                if !p.isEmpty { out.append(singular(p)) }
            }
        }
        return out
    }

    private static func productTokens(_ s: String) -> [String] {
        var t = tokens(s)
        for w in t { if let imp = implies[w] { t.append(contentsOf: imp) } }
        return t
    }

    static func queryTokens(_ q: String) -> [String] {
        let t = tokens(q).filter { !stop.contains($0) }
        return t.isEmpty ? tokens(q) : t
    }

    /// 0…1 relevance of a product for a query. `include`/`exclude` are word lists the user picked.
    static func relevance(query: String, name: String, brand: String? = nil, category: String? = nil, rank: Int? = nil, total: Int? = nil, include: [String] = [], exclude: [String] = []) -> Double {
        let qt = queryTokens(query)
        if qt.isEmpty { return 0.5 }
        let full = "\(brand ?? "") \(name)"
        let nameNorm = normalize(full)
        let nameTok = Set(productTokens(full))
        let selfTok = Set(productTokens(name))
        let brandTok = Set(productTokens(brand ?? ""))
        let catTok = Set(tokens(category))

        // A word that appears ONLY in the brand counts as a match when it identifies the product
        // ("Kerrygold" for a kerrygold search) but NOT when it is a generic grocery qualifier,
        // because then it is almost always part of the retailer's own trading name. "365 By Whole
        // Foods Market" supplied the word "whole" to every one of its products, so "whole turkey"
        // in Milwaukee headlined $5.99/lb ground turkey while Woodman's real $1.69/lb birds scored
        // below the cut. Mirrors shared/match.js.
        func fromBrandOnly(_ t: String) -> Bool { !selfTok.contains(t) && brandTok.contains(t) }
        func generic(_ t: String) -> Bool { soft.contains(t) || mild.contains(t) || stop.contains(t) }

        for ex in exclude {
            let et = tokens(ex)
            if !et.isEmpty && et.allSatisfy({ nameTok.contains($0) }) { return 0 }
        }
        for inc in include {
            let it = tokens(inc)
            if !it.isEmpty && !it.allSatisfy({ nameTok.contains($0) || catTok.contains($0) }) { return 0 }
        }

        // A product the retailer itself filed under the exact phrase the shopper typed is the
        // strongest evidence in the record — stronger than the product name, which is a marketing
        // string. Scoring a category hit at 0.6 of a name hit meant "Jennie-O Less Than 14 Pounds
        // Turkey", category "Whole Turkey", reached only 0.52 against a 0.55 cut, so every
        // category-only whole bird in Kenosha and Milwaukee was hidden.
        //
        // A category that ALSO names a different food does not count, or the aisle sign starts
        // matching instead of the product: Trader Joe's files apricot preserves under "Nut Butters
        // & Fruit Spreads", which contains "butter", and chicken thighs under "Chicken & Turkey".
        let qsetAll = Set(qt)
        // A category that names a processed FORM covers only a shopper who asked for that form
        // ("Dried Bananas", "Frozen Bananas" were each store's "bananas"). Only for fresh fruit. Port of `processedCat` in shared/match.js.
        let freshFruit = freshFruitRx.test(qt.last ?? "") // the head, not "apple juice"
        let processedCat = freshFruit && catTok.contains(where: { w in
            ["dried", "dehydrated", "freeze", "canned", "frozen"].contains(w) && !qt.contains(w)
        })
        let catCoversQuery = !catTok.isEmpty && qt.allSatisfy { catTok.contains($0) } && !processedCat
            && !catTok.contains(where: { traps.contains($0) && !qsetAll.contains($0) })

        // The same words are invisible to the prefix fallback below, or "Whole Foods Market" would
        // hand the query word back through hasPrefix at 0.7 instead of 1.
        let hitTok = nameTok.filter { !(fromBrandOnly($0) && generic($0)) }

        var hits = 0.0
        for t in qt {
            if nameTok.contains(t) && !(fromBrandOnly(t) && generic(t)) { hits += 1 }
            else if catTok.contains(t) { hits += catCoversQuery ? 1 : 0.6 }
            else if t.count >= 5 && hitTok.contains(where: { $0.hasPrefix(t) || ($0.count >= 5 && t.hasPrefix($0)) }) { hits += 0.7 }
        }
        let coverage = hits / Double(qt.count)
        var score = coverage >= 1 ? 0.8 : coverage * 0.55
        let qNorm = normalize(query)
        if !qNorm.isEmpty && nameNorm.contains(qNorm) { score += 0.12 }
        let head = qt[qt.count - 1]
        if !catTok.isEmpty && catTok.contains(head) && !processedCat { score += 0.08 }

        let words = tokens(name)
        let qset = Set(qt)
        let headIdx = words.lastIndex(of: head)
        var mult = 1.0
        if let hi = headIdx, hi > 0 {
            let before = words[max(0, hi - 3)..<hi]
            if before.contains(where: { ["with", "made", "from", "in"].contains($0) }) && words[0..<hi].contains(where: { traps.contains($0) && !qset.contains($0) }) {
                mult *= 0.3
            }
        }
        let allowed = Set(qt.flatMap { Array(queryAllows[$0] ?? []) })
        if let hi = headIdx {
            var strong = 0
            // Look on BOTH sides of the head noun. A trap word before it is just as disqualifying
            // as one after: "peanut butter" is not butter and "cream cheese" is not cheese, but
            // scoring only the words after the head let both through as genuine matches.
            for i in words.indices {
                if i == hi { continue }
                let w = words[i]
                if qset.contains(w) || soft.contains(w) || allowed.contains(w) { continue }
                let prev = i >= 1 ? words[i - 1] : nil
                let prev2 = i >= 2 ? words[i - 2] : nil
                if prev == "in" || prev == "with" || prev2 == "in" { continue } // "tuna in oil", "with sauce"
                if let ok = benignAfter[w], let p = prev, ok.contains(p) { continue } // "sweet cream butter"
                if let ok = benignBefore[w], i + 1 < words.count, ok.contains(words[i + 1]) { continue } // "oyster mushrooms"
                if traps.contains(w) { strong += 1 }
            }
            var alt = 0, mildN = 0, flavorN = 0
            for w in words {
                if qset.contains(w) || allowed.contains(w) { continue }
                // Position-independent: "Frozen Orange Juice" and "Orange Juice Frozen" are the
                // same product and must score the same. Anchoring these to the head noun meant
                // word order alone changed the score by a factor of two.
                if altBase.contains(w) { alt += 1 }
                else if flavor.contains(w) && !qt.contains(where: { inherentFlavor[$0]?.contains(w) == true }) && !flavorOkHeads.contains(head) { flavorN += 1 }
                // When the retailer filed the product under exactly what was searched, a storage
                // word in the name describes a variant OF that category rather than a different
                // product. "Jennie-O Whole Frozen Turkey" in category "Frozen Whole Turkey" scored
                // 0.510 against a 0.55 cut purely because of 'frozen'.
                else if mild.contains(w) { if !(catCoversQuery && storageState.contains(w)) { mildN += 1 } }
            }
            mult *= pow(0.4, Double(min(strong, 3))) * pow(0.55, Double(min(alt, 2))) * pow(0.58, Double(min(mildN, 3))) * (flavorN > 0 ? 0.5 : 1)
        } else {
            let trapCount = Set(words).filter { traps.contains($0) && !qset.contains($0) && !allowed.contains($0) }.count
            mult *= pow(0.6, Double(min(trapCount, 3)))
        }
        // "Tastes Like Butter" is margarine. Only penalize when the shopper did not ask for it.
        let qNormForImitation = normalize(query)
        let wantsImitation = imitationRx.test(qNormForImitation) || imitationCategoryRx.test(qNormForImitation)
        if imitationRx.test(nameNorm) && !wantsImitation { mult *= 0.3 }
        if waterDrinkRx.test(nameNorm) && !wantsWaterRx.test(qNormForImitation) { mult *= 0.3 }
        // "Chicken a la King" is a frozen dinner, "Coffee a la Jaggery" a sweetened mix: "<the thing>
        // a la <style>" names a prepared dish. Port of the same rule in shared/match.js.
        // Not "a la carte" (sold separately) or "a la mode".
        if !aLaRx.test(qNormForImitation) && Rx("(?:^|\\s)\(NSRegularExpression.escapedPattern(for: qNormForImitation)) a la (?!carte\\b|mode\\b)").test(nameNorm) { mult *= 0.3 }
        // A processed form of fresh fruit is not the fruit ("Diced Canned Tomatoes" was Salt Lake City's
        // best "tomatoes"), unless the query names one of the forms. Port of the rule in shared/match.js.
        if freshFruitRx.test(qt.last ?? "") {
            let q = qNormForImitation.replacingOccurrences(of: "-", with: " ")
            let forms = processedFormRx.matches(nameNorm).compactMap { $0.first ?? nil }
            if !forms.isEmpty && !forms.contains(where: { q.contains($0.replacingOccurrences(of: "-", with: " ")) }) { mult *= 0.3 }
        }
        do {
            let qstems = Set(qt.map(stem))
            let inQ = { (w: String) in qstems.contains(stem(w)) }
            if headCompounds.contains(where: { hasPhrase(words, $0) && $0.dropLast().contains(where: inQ) && !inQ($0.last!) }) { mult *= 0.2 }
            if modifierCompounds.contains(where: { hasPhrase(words, $0) && inQ($0.last!) && !inQ($0.first!) }) { mult *= 0.2 }
        }
        if let qCut = qt.first(where: { cuts.contains($0) }), words.contains(where: { cuts.contains($0) && $0 != qCut && !qset.contains($0) }), !words.contains(qCut) { mult *= 0.2 }
        // "Glaze for Strawberries" is to use WITH strawberries. Port of the "for" rule in shared/match.js.
        if !qset.contains("for"), Rx("\\bfor (?:[a-z]+ ){0,2}\(NSRegularExpression.escapedPattern(for: head))").test(words.joined(separator: " ")) { mult *= 0.2 }
        if champagneGrapesRx.test(nameNorm) && !grapeRx.test(qNormForImitation) { mult *= 0.2 }
        if freshVegMeatRx.test(head) {
            if let m = shelfFormRx.match(nameNorm)?.first ?? nil {
                if !qNormForImitation.contains(m) { mult *= 0.3 }
            } else if catTok.contains("canned") && !qset.contains("canned") { mult *= 0.3 } // "Brookdale Corned Beef" in Canned Meat
        }
        if juiceWordRx.test(qNormForImitation) && juiceImpostorRx.test(nameNorm) && !wantsJuiceDrinkRx.test(qNormForImitation) { mult *= 0.3 }
        if babyProductRx.test(nameNorm) && !wantsBabyRx.test(qNormForImitation) { mult *= 0.2 }
        // Books, cookware and apparel that happen to name a food. Applied to the whole name because
        // the position rules deliberately look past "in"/"with" phrases, which is where the
        // giveaway sits.
        if nonGroceryRx.test(nameNorm) { mult *= 0.15 }
        if supplementRx.test(nameNorm) && !wantsSupplementRx.test(normalize(query)) { mult *= 0.15 }

        score *= mult
        if let rank, let total, total > 1 { score *= 1 - 0.15 * (Double(rank) / Double(total)) }
        return max(0, min(1, score))
    }

    struct RefineChip: Hashable, Identifiable {
        var chip: String
        var count: Int
        var id: String { chip }
    }

    /// Refinement chips from words common in relevant results ("whole", "2%", "lactose free"…).
    static func refineChips(query: String, names: [(name: String, brand: String?)], max limit: Int = 10) -> [RefineChip] {
        let qt = Set(queryTokens(query))
        let brands = Set(names.flatMap { normalize($0.brand).split(separator: " ").map(String.init) }.filter { $0.count > 2 }.map(singular))
        var counts: [String: Int] = [:]
        var order: [String] = []
        for item in names {
            var seen = Set<String>()
            let words = normalize(item.name).split(separator: " ").map(String.init)
            for (i, raw) in words.enumerated() {
                let w = singular(raw)
                if w.isEmpty || qt.contains(w) || stop.contains(w) || chipNoise.contains(w) || (w.count < 3 && !w.hasSuffix("%")) { continue }
                // shared/match.js skips a chip only when it matches /^\d+(\.\d+)?$/. Using
                // Double(w) != nil also swallowed "nan", "inf", "infinity" and "1e3" — and NAN is
                // a real infant-formula brand, so that refinement chip silently vanished.
                if pureNumberRx.test(w) || sizeTokenRx.test(w) { continue }
                if brands.contains(w) { continue }
                var chip = raw
                let next = i + 1 < words.count ? words[i + 1] : ""
                let prev = i > 0 ? words[i - 1] : ""
                if w == "lactose" && next == "free" { chip = "lactose free" }
                if w == "cage" && next == "free" { chip = "cage free" }
                if w == "grass" && next.hasPrefix("fed") { chip = "grass fed" }
                if w == "free" && ["lactose", "cage", "gluten", "sugar"].contains(prev) { continue }
                if w == "fed" && prev == "grass" { continue }
                if seen.contains(chip) { continue }
                seen.insert(chip)
                if counts[chip] == nil { order.append(chip) }
                counts[chip, default: 0] += 1
            }
        }
        let n = Double(max(names.count, 1))
        return order
            .compactMap { c -> RefineChip? in
                let k = counts[c] ?? 0
                return k >= 2 && Double(k) <= n * 0.85 ? RefineChip(chip: c, count: k) : nil
            }
            .sorted { $0.count > $1.count }
            .prefix(limit)
            .map { $0 }
    }
}
