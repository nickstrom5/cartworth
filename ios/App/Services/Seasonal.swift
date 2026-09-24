import Foundation

/// Holidays and seasons with shopping lists and deal keywords ("Thanksgiving in 9 days — turkey deals this week").
struct Occasion: Identifiable, Hashable {
    var id: String
    var name: String
    var date: Date
    var symbol: String
    var blurb: String
    /// Words to match against weekly-ad deals
    var keywords: [String]
    /// Starter shopping list
    var list: [String]

    /// "is today", "is tomorrow", "in 9 days" ("in 1 days" before).
    var whenText: String { daysAway == 0 ? "is today" : daysAway == 1 ? "is tomorrow" : "in \(daysAway) days" }

    var daysAway: Int { max(0, Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: Calendar.current.startOfDay(for: date)).day ?? 0) }
}

enum Seasonal {
    private static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }()

    private static func d(_ y: Int, _ m: Int, _ day: Int) -> Date { cal.date(from: DateComponents(year: y, month: m, day: day))! }

    /// n-th weekday of a month (weekday: 1 = Sunday … 7 = Saturday); n = -1 for the last one.
    private static func nth(_ n: Int, weekday: Int, month: Int, year: Int) -> Date {
        if n > 0 {
            var comps = DateComponents(year: year, month: month, weekday: weekday, weekdayOrdinal: n)
            comps.calendar = cal
            return cal.date(from: comps)!
        }
        let firstNext = d(month == 12 ? year + 1 : year, month == 12 ? 1 : month + 1, 1)
        var day = cal.date(byAdding: .day, value: -1, to: firstNext)!
        while cal.component(.weekday, from: day) != weekday { day = cal.date(byAdding: .day, value: -1, to: day)! }
        return day
    }

    /// Western Easter (anonymous Gregorian algorithm).
    static func easter(_ y: Int) -> Date {
        let a = y % 19, b = y / 100, c = y % 100, dd = b / 4, e = b % 4
        let f = (b + 8) / 25, g = (b - f + 1) / 3, h = (19 * a + b - dd - g + 15) % 30
        let i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
        let m = (a + 11 * h + 22 * l) / 451
        let month = (h + l - 7 * m + 114) / 31
        let day = ((h + l - 7 * m + 114) % 31) + 1
        return d(y, month, day)
    }

    // Lunar-calendar holidays (published dates)
    private static let hanukkah: [Int: (Int, Int)] = [2025: (12, 14), 2026: (12, 4), 2027: (12, 24), 2028: (12, 12), 2029: (12, 1), 2030: (12, 20)]
    private static let diwali: [Int: (Int, Int)] = [2025: (10, 20), 2026: (11, 8), 2027: (10, 29), 2028: (10, 17), 2029: (11, 5), 2030: (10, 26)]
    private static let lunarNewYear: [Int: (Int, Int)] = [2026: (2, 17), 2027: (2, 6), 2028: (1, 26), 2029: (2, 13), 2030: (2, 3)]
    private static let eidAlFitr: [Int: (Int, Int)] = [2026: (3, 20), 2027: (3, 10), 2028: (2, 27), 2029: (2, 15), 2030: (2, 5)]

    static func occasions(year y: Int) -> [Occasion] {
        var out: [Occasion] = [
            Occasion(id: "newyear-\(y)", name: "New Year’s", date: d(y, 1, 1), symbol: "sparkles", blurb: "Bubbly, party snacks and a lucky New Year’s Day meal.",
                     keywords: ["champagne", "sparkling", "prosecco", "black-eyed peas", "cabbage", "shrimp", "cheese", "crackers", "chips"],
                     list: ["sparkling wine", "shrimp cocktail", "cheese", "crackers", "black-eyed peas", "cabbage"]),
            Occasion(id: "superbowl-\(y)", name: "Big Game Sunday", date: nth(2, weekday: 1, month: 2, year: y), symbol: "sportscourt", blurb: "Wings, dips and snacks for game day.",
                     keywords: ["wings", "chips", "salsa", "guacamole", "avocado", "dip", "soda", "beer", "pizza", "tortilla chips", "queso"],
                     list: ["chicken wings", "tortilla chips", "salsa", "avocados", "sour cream", "soda", "frozen pizza"]),
            Occasion(id: "valentines-\(y)", name: "Valentine’s Day", date: d(y, 2, 14), symbol: "heart", blurb: "Dinner for two, strawberries and chocolate.",
                     keywords: ["chocolate", "strawberries", "wine", "steak", "salmon", "roses", "flowers"],
                     list: ["strawberries", "chocolate", "steak", "asparagus", "wine"]),
            Occasion(id: "stpatricks-\(y)", name: "St. Patrick’s Day", date: d(y, 3, 17), symbol: "leaf", blurb: "Corned beef season — it’s usually at its lowest price all year.",
                     keywords: ["corned beef", "cabbage", "potatoes", "carrots", "soda bread", "beer"],
                     list: ["corned beef", "cabbage", "potatoes", "carrots", "irish soda bread"]),
            Occasion(id: "easter-\(y)", name: "Easter", date: easter(y), symbol: "hare", blurb: "Ham, eggs and candy — ham and eggs are often loss leaders this week.",
                     keywords: ["ham", "eggs", "candy", "jelly beans", "chocolate", "asparagus", "rolls", "potatoes"],
                     list: ["spiral ham", "eggs", "asparagus", "dinner rolls", "potatoes", "jelly beans"]),
            Occasion(id: "cinco-\(y)", name: "Cinco de Mayo", date: d(y, 5, 5), symbol: "party.popper", blurb: "Tacos, guacamole and margarita fixings.",
                     keywords: ["avocado", "limes", "tortillas", "salsa", "cilantro", "beer", "tequila", "chips", "ground beef"],
                     list: ["avocados", "limes", "tortillas", "ground beef", "salsa", "cilantro", "tortilla chips"]),
            Occasion(id: "mothers-\(y)", name: "Mother’s Day", date: nth(2, weekday: 1, month: 5, year: y), symbol: "gift", blurb: "Brunch, berries and flowers.",
                     keywords: ["flowers", "strawberries", "eggs", "bacon", "orange juice", "champagne", "croissants"],
                     list: ["eggs", "bacon", "strawberries", "orange juice", "croissants", "flowers"]),
            Occasion(id: "memorial-\(y)", name: "Memorial Day", date: nth(-1, weekday: 2, month: 5, year: y), symbol: "flame", blurb: "Kickoff of grilling season — burgers and hot dogs hit their lows.",
                     keywords: ["burgers", "ground beef", "hot dogs", "buns", "charcoal", "corn", "watermelon", "chips", "brats", "ketchup"],
                     list: ["ground beef", "hot dogs", "hamburger buns", "hot dog buns", "corn", "watermelon", "charcoal"]),
            Occasion(id: "fathers-\(y)", name: "Father’s Day", date: nth(3, weekday: 1, month: 6, year: y), symbol: "flame", blurb: "Steaks, ribs and BBQ.",
                     keywords: ["steak", "ribs", "bbq sauce", "brisket", "beer", "charcoal"],
                     list: ["ribeye steak", "baby back ribs", "bbq sauce", "corn", "potatoes"]),
            Occasion(id: "july4-\(y)", name: "Fourth of July", date: d(y, 7, 4), symbol: "fireworks", blurb: "Cookout staples, watermelon and berries.",
                     keywords: ["burgers", "hot dogs", "buns", "watermelon", "corn", "chips", "lemonade", "berries", "blueberries", "strawberries", "charcoal", "beer"],
                     list: ["ground beef", "hot dogs", "buns", "watermelon", "corn", "potato chips", "blueberries", "strawberries"]),
            Occasion(id: "backtoschool-\(y)", name: "Back to school", date: d(y, 8, 15), symbol: "backpack", blurb: "Lunchbox staples and snacks.",
                     keywords: ["bread", "peanut butter", "jelly", "juice", "snacks", "yogurt", "string cheese", "granola bars", "apples", "lunch meat"],
                     list: ["bread", "peanut butter", "turkey lunch meat", "string cheese", "granola bars", "apples", "juice boxes"]),
            Occasion(id: "labor-\(y)", name: "Labor Day", date: nth(1, weekday: 2, month: 9, year: y), symbol: "flame", blurb: "Last big cookout of summer.",
                     keywords: ["burgers", "hot dogs", "brats", "buns", "corn", "chips", "watermelon", "beer"],
                     list: ["ground beef", "brats", "buns", "corn", "potato salad", "chips"]),
            Occasion(id: "halloween-\(y)", name: "Halloween", date: d(y, 10, 31), symbol: "moon.stars", blurb: "Candy is cheapest in bulk bags — and 50% off on Nov 1.",
                     keywords: ["candy", "chocolate", "pumpkin", "apple cider", "caramel", "fun size", "snickers", "reese"],
                     list: ["halloween candy", "pumpkin", "apple cider", "caramel apples"]),
            Occasion(id: "thanksgiving-\(y)", name: "Thanksgiving", date: nth(4, weekday: 5, month: 11, year: y), symbol: "leaf.fill", blurb: "Turkey is often free or under $1/lb with a purchase — compare the weekly ads.",
                     keywords: ["turkey", "stuffing", "cranberry", "sweet potatoes", "pumpkin", "pie", "green beans", "rolls", "butter", "heavy cream", "potatoes", "gravy", "celery", "onions"],
                     list: ["whole turkey", "stuffing", "cranberry sauce", "sweet potatoes", "russet potatoes", "green beans", "dinner rolls", "butter", "heavy cream", "pumpkin pie filling", "pie crust", "celery", "onions", "chicken broth"]),
            Occasion(id: "christmas-\(y)", name: "Christmas", date: d(y, 12, 25), symbol: "gift.fill", blurb: "Holiday roasts and baking — flour, sugar and butter hit yearly lows.",
                     keywords: ["ham", "prime rib", "roast", "flour", "sugar", "butter", "chocolate chips", "eggnog", "cookies", "baking", "cream cheese"],
                     list: ["spiral ham", "flour", "sugar", "butter", "chocolate chips", "eggs", "eggnog", "cream cheese"]),
        ]
        if let (m, dd) = hanukkah[y] {
            out.append(Occasion(id: "hanukkah-\(y)", name: "Hanukkah", date: d(y, m, dd), symbol: "flame", blurb: "Latkes, brisket and sufganiyot.",
                                keywords: ["potatoes", "oil", "applesauce", "sour cream", "brisket", "onions", "chocolate coins"],
                                list: ["russet potatoes", "onions", "vegetable oil", "applesauce", "sour cream", "brisket"]))
        }
        if let (m, dd) = diwali[y] {
            out.append(Occasion(id: "diwali-\(y)", name: "Diwali", date: d(y, m, dd), symbol: "sparkles", blurb: "Sweets, snacks and festive meals.",
                                keywords: ["ghee", "rice", "lentils", "sugar", "milk", "nuts", "cashews", "cardamom"],
                                list: ["ghee", "basmati rice", "lentils", "milk", "sugar", "cashews"]))
        }
        if let (m, dd) = lunarNewYear[y] {
            out.append(Occasion(id: "lunarnewyear-\(y)", name: "Lunar New Year", date: d(y, m, dd), symbol: "sparkles", blurb: "Dumplings, noodles and oranges.",
                                keywords: ["dumplings", "noodles", "oranges", "tangerines", "fish", "pork", "bok choy"],
                                list: ["dumpling wrappers", "ground pork", "noodles", "mandarins", "bok choy"]))
        }
        if let (m, dd) = eidAlFitr[y] {
            out.append(Occasion(id: "eid-\(y)", name: "Eid al-Fitr", date: d(y, m, dd), symbol: "moon", blurb: "Feast staples, dates and sweets.",
                                keywords: ["dates", "lamb", "rice", "chicken", "yogurt", "nuts", "sugar"],
                                list: ["dates", "lamb", "basmati rice", "yogurt", "pistachios"]))
        }
        return out
    }

    /// Occasions in the next `days` days (and today), soonest first.
    static func upcoming(from now: Date = Date(), within days: Int = 30) -> [Occasion] {
        let y = cal.component(.year, from: now)
        let start = cal.startOfDay(for: now)
        let end = cal.date(byAdding: .day, value: days, to: start)!
        return (occasions(year: y) + occasions(year: y + 1))
            .filter { $0.date >= start && $0.date <= end }
            .sorted { $0.date < $1.date }
    }

    /// The occasions to feature: the soonest two in the window. One card was not enough when two
    /// holidays share a season: in 2027 Hanukkah begins Dec 24, and the single "next occasion" card
    /// showed Hanukkah instead of Christmas for the whole three weeks before Christmas.
    static func featured(from now: Date = Date(), within days: Int = 21) -> [Occasion] {
        Array(upcoming(from: now, within: days).prefix(2))
    }

    struct Season: Hashable {
        var name: String
        var symbol: String
        var produce: [String]
    }

    /// What's in season (US-wide, roughly) — often the cheapest produce.
    static func season(for date: Date = Date()) -> Season {
        switch cal.component(.month, from: date) {
        case 12, 1, 2: return Season(name: "Winter citrus", symbol: "snowflake", produce: ["oranges", "grapefruit", "clementines", "lemons", "cabbage", "sweet potatoes", "kale"])
        case 3, 4, 5: return Season(name: "Spring produce", symbol: "leaf", produce: ["asparagus", "strawberries", "artichokes", "peas", "spinach", "green onions"])
        case 6, 7, 8: return Season(name: "Summer produce", symbol: "sun.max", produce: ["watermelon", "corn", "peaches", "blueberries", "tomatoes", "zucchini", "cherries"])
        default: return Season(name: "Fall harvest", symbol: "leaf.fill", produce: ["apples", "pumpkins", "butternut squash", "pears", "sweet potatoes", "brussels sprouts", "cranberries"])
        }
    }
}
