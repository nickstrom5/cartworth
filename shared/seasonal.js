// Holidays with starter shopping lists and weekly-ad keywords, for the web app's holiday cards.
// GENERATED from ios/App/Services/Seasonal.swift (the phone's list) — test/qa-seasonal.test.js
// fails if the two drift. Dates are calendar days in the viewer's local time.

export const OCCASIONS = [
  {
    "id": "newyear",
    "name": "New Year’s",
    "rule": {
      "fixed": [
        1,
        1
      ]
    },
    "blurb": "Bubbly, party snacks and a lucky New Year’s Day meal.",
    "keywords": [
      "champagne",
      "sparkling",
      "prosecco",
      "black-eyed peas",
      "cabbage",
      "shrimp",
      "cheese",
      "crackers",
      "chips"
    ],
    "list": [
      "sparkling wine",
      "shrimp cocktail",
      "cheese",
      "crackers",
      "black-eyed peas",
      "cabbage"
    ]
  },
  {
    "id": "superbowl",
    "name": "Big Game Sunday",
    "rule": {
      "nth": [
        2,
        1,
        2
      ]
    },
    "blurb": "Wings, dips and snacks for game day.",
    "keywords": [
      "wings",
      "chips",
      "salsa",
      "guacamole",
      "avocado",
      "dip",
      "soda",
      "beer",
      "pizza",
      "tortilla chips",
      "queso"
    ],
    "list": [
      "chicken wings",
      "tortilla chips",
      "salsa",
      "avocados",
      "sour cream",
      "soda",
      "frozen pizza"
    ]
  },
  {
    "id": "valentines",
    "name": "Valentine’s Day",
    "rule": {
      "fixed": [
        2,
        14
      ]
    },
    "blurb": "Dinner for two, strawberries and chocolate.",
    "keywords": [
      "chocolate",
      "strawberries",
      "wine",
      "steak",
      "salmon",
      "roses",
      "flowers"
    ],
    "list": [
      "strawberries",
      "chocolate",
      "steak",
      "asparagus",
      "wine"
    ]
  },
  {
    "id": "stpatricks",
    "name": "St. Patrick’s Day",
    "rule": {
      "fixed": [
        3,
        17
      ]
    },
    "blurb": "Corned beef season — it’s usually at its lowest price all year.",
    "keywords": [
      "corned beef",
      "cabbage",
      "potatoes",
      "carrots",
      "soda bread",
      "beer"
    ],
    "list": [
      "corned beef",
      "cabbage",
      "potatoes",
      "carrots",
      "irish soda bread"
    ]
  },
  {
    "id": "easter",
    "name": "Easter",
    "rule": {
      "easter": true
    },
    "blurb": "Ham, eggs and candy — ham and eggs are often loss leaders this week.",
    "keywords": [
      "ham",
      "eggs",
      "candy",
      "jelly beans",
      "chocolate",
      "asparagus",
      "rolls",
      "potatoes"
    ],
    "list": [
      "spiral ham",
      "eggs",
      "asparagus",
      "dinner rolls",
      "potatoes",
      "jelly beans"
    ]
  },
  {
    "id": "cinco",
    "name": "Cinco de Mayo",
    "rule": {
      "fixed": [
        5,
        5
      ]
    },
    "blurb": "Tacos, guacamole and margarita fixings.",
    "keywords": [
      "avocado",
      "limes",
      "tortillas",
      "salsa",
      "cilantro",
      "beer",
      "tequila",
      "chips",
      "ground beef"
    ],
    "list": [
      "avocados",
      "limes",
      "tortillas",
      "ground beef",
      "salsa",
      "cilantro",
      "tortilla chips"
    ]
  },
  {
    "id": "mothers",
    "name": "Mother’s Day",
    "rule": {
      "nth": [
        2,
        1,
        5
      ]
    },
    "blurb": "Brunch, berries and flowers.",
    "keywords": [
      "flowers",
      "strawberries",
      "eggs",
      "bacon",
      "orange juice",
      "champagne",
      "croissants"
    ],
    "list": [
      "eggs",
      "bacon",
      "strawberries",
      "orange juice",
      "croissants",
      "flowers"
    ]
  },
  {
    "id": "memorial",
    "name": "Memorial Day",
    "rule": {
      "nth": [
        -1,
        2,
        5
      ]
    },
    "blurb": "Kickoff of grilling season — burgers and hot dogs hit their lows.",
    "keywords": [
      "burgers",
      "ground beef",
      "hot dogs",
      "buns",
      "charcoal",
      "corn",
      "watermelon",
      "chips",
      "brats",
      "ketchup"
    ],
    "list": [
      "ground beef",
      "hot dogs",
      "hamburger buns",
      "hot dog buns",
      "corn",
      "watermelon",
      "charcoal"
    ]
  },
  {
    "id": "fathers",
    "name": "Father’s Day",
    "rule": {
      "nth": [
        3,
        1,
        6
      ]
    },
    "blurb": "Steaks, ribs and BBQ.",
    "keywords": [
      "steak",
      "ribs",
      "bbq sauce",
      "brisket",
      "beer",
      "charcoal"
    ],
    "list": [
      "ribeye steak",
      "baby back ribs",
      "bbq sauce",
      "corn",
      "potatoes"
    ]
  },
  {
    "id": "july4",
    "name": "Fourth of July",
    "rule": {
      "fixed": [
        7,
        4
      ]
    },
    "blurb": "Cookout staples, watermelon and berries.",
    "keywords": [
      "burgers",
      "hot dogs",
      "buns",
      "watermelon",
      "corn",
      "chips",
      "lemonade",
      "berries",
      "blueberries",
      "strawberries",
      "charcoal",
      "beer"
    ],
    "list": [
      "ground beef",
      "hot dogs",
      "buns",
      "watermelon",
      "corn",
      "potato chips",
      "blueberries",
      "strawberries"
    ]
  },
  {
    "id": "backtoschool",
    "name": "Back to school",
    "rule": {
      "fixed": [
        8,
        15
      ]
    },
    "blurb": "Lunchbox staples and snacks.",
    "keywords": [
      "bread",
      "peanut butter",
      "jelly",
      "juice",
      "snacks",
      "yogurt",
      "string cheese",
      "granola bars",
      "apples",
      "lunch meat"
    ],
    "list": [
      "bread",
      "peanut butter",
      "turkey lunch meat",
      "string cheese",
      "granola bars",
      "apples",
      "juice boxes"
    ]
  },
  {
    "id": "labor",
    "name": "Labor Day",
    "rule": {
      "nth": [
        1,
        2,
        9
      ]
    },
    "blurb": "Last big cookout of summer.",
    "keywords": [
      "burgers",
      "hot dogs",
      "brats",
      "buns",
      "corn",
      "chips",
      "watermelon",
      "beer"
    ],
    "list": [
      "ground beef",
      "brats",
      "buns",
      "corn",
      "potato salad",
      "chips"
    ]
  },
  {
    "id": "halloween",
    "name": "Halloween",
    "rule": {
      "fixed": [
        10,
        31
      ]
    },
    "blurb": "Candy is cheapest in bulk bags — and 50% off on Nov 1.",
    "keywords": [
      "candy",
      "chocolate",
      "pumpkin",
      "apple cider",
      "caramel",
      "fun size",
      "snickers",
      "reese"
    ],
    "list": [
      "halloween candy",
      "pumpkin",
      "apple cider",
      "caramel apples"
    ]
  },
  {
    "id": "thanksgiving",
    "name": "Thanksgiving",
    "rule": {
      "nth": [
        4,
        5,
        11
      ]
    },
    "blurb": "Turkey is often free or under $1/lb with a purchase — compare the weekly ads.",
    "keywords": [
      "turkey",
      "stuffing",
      "cranberry",
      "sweet potatoes",
      "pumpkin",
      "pie",
      "green beans",
      "rolls",
      "butter",
      "heavy cream",
      "potatoes",
      "gravy",
      "celery",
      "onions"
    ],
    "list": [
      "whole turkey",
      "stuffing",
      "cranberry sauce",
      "sweet potatoes",
      "russet potatoes",
      "green beans",
      "dinner rolls",
      "butter",
      "heavy cream",
      "pumpkin puree",
      "pie crust",
      "celery",
      "onions",
      "chicken broth"
    ]
  },
  {
    "id": "christmas",
    "name": "Christmas",
    "rule": {
      "fixed": [
        12,
        25
      ]
    },
    "blurb": "Holiday roasts and baking — flour, sugar and butter hit yearly lows.",
    "keywords": [
      "ham",
      "prime rib",
      "roast",
      "flour",
      "sugar",
      "butter",
      "chocolate chips",
      "eggnog",
      "cookies",
      "baking",
      "cream cheese"
    ],
    "list": [
      "spiral ham",
      "flour",
      "sugar",
      "butter",
      "chocolate chips",
      "eggs",
      "eggnog",
      "cream cheese"
    ]
  },
  {
    "id": "hanukkah",
    "name": "Hanukkah",
    "rule": {
      "table": "hanukkah"
    },
    "blurb": "Latkes, brisket and sufganiyot.",
    "keywords": [
      "potatoes",
      "oil",
      "applesauce",
      "sour cream",
      "brisket",
      "onions",
      "chocolate coins"
    ],
    "list": [
      "russet potatoes",
      "onions",
      "vegetable oil",
      "applesauce",
      "sour cream",
      "brisket"
    ]
  },
  {
    "id": "diwali",
    "name": "Diwali",
    "rule": {
      "table": "diwali"
    },
    "blurb": "Sweets, snacks and festive meals.",
    "keywords": [
      "ghee",
      "rice",
      "lentils",
      "sugar",
      "milk",
      "nuts",
      "cashews",
      "cardamom"
    ],
    "list": [
      "ghee",
      "basmati rice",
      "lentils",
      "milk",
      "sugar",
      "cashews"
    ]
  },
  {
    "id": "lunarnewyear",
    "name": "Lunar New Year",
    "rule": {
      "table": "lunarnewyear"
    },
    "blurb": "Dumplings, noodles and oranges.",
    "keywords": [
      "dumplings",
      "noodles",
      "oranges",
      "tangerines",
      "fish",
      "pork",
      "bok choy"
    ],
    "list": [
      "dumpling wrappers",
      "ground pork",
      "noodles",
      "mandarins",
      "bok choy"
    ]
  },
  {
    "id": "eid",
    "name": "Eid al-Fitr",
    "rule": {
      "table": "eid"
    },
    "blurb": "Feast staples, dates and sweets.",
    "keywords": [
      "dates",
      "lamb",
      "rice",
      "chicken",
      "yogurt",
      "nuts",
      "sugar"
    ],
    "list": [
      "dates",
      "lamb",
      "basmati rice",
      "yogurt",
      "pistachios"
    ]
  }
];

// Lunar-calendar holidays: published dates, by year.
export const TABLES = {
  "hanukkah": {
    "2025": [
      12,
      14
    ],
    "2026": [
      12,
      4
    ],
    "2027": [
      12,
      24
    ],
    "2028": [
      12,
      12
    ],
    "2029": [
      12,
      1
    ],
    "2030": [
      12,
      20
    ]
  },
  "diwali": {
    "2025": [
      10,
      20
    ],
    "2026": [
      11,
      8
    ],
    "2027": [
      10,
      29
    ],
    "2028": [
      10,
      17
    ],
    "2029": [
      11,
      5
    ],
    "2030": [
      10,
      26
    ]
  },
  "lunarnewyear": {
    "2026": [
      2,
      17
    ],
    "2027": [
      2,
      6
    ],
    "2028": [
      1,
      26
    ],
    "2029": [
      2,
      13
    ],
    "2030": [
      2,
      3
    ]
  },
  "eid": {
    "2026": [
      3,
      20
    ],
    "2027": [
      3,
      10
    ],
    "2028": [
      2,
      27
    ],
    "2029": [
      2,
      15
    ],
    "2030": [
      2,
      5
    ]
  }
};

const day = (y, m, d) => new Date(y, m - 1, d);

/** n-th weekday of a month (weekday 1 = Sunday … 7 = Saturday); n = -1 for the last one. */
function nth(n, weekday, month, y) {
  if (n > 0) {
    const first = day(y, month, 1);
    const offset = (weekday - 1 - first.getDay() + 7) % 7;
    return day(y, month, 1 + offset + (n - 1) * 7);
  }
  const last = day(y, month + 1, 0);
  const back = (last.getDay() - (weekday - 1) + 7) % 7;
  return day(y, month, last.getDate() - back);
}

/** Western Easter (anonymous Gregorian algorithm). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return day(y, month, ((h + l - 7 * m + 114) % 31) + 1);
}

export function occasions(y) {
  const out = [];
  for (const o of OCCASIONS) {
    let date = null;
    if (o.rule.fixed) date = day(y, ...o.rule.fixed);
    else if (o.rule.nth) date = nth(o.rule.nth[0], o.rule.nth[1], o.rule.nth[2], y);
    else if (o.rule.easter) date = easter(y);
    else if (TABLES[o.rule.table]?.[y]) date = day(y, ...TABLES[o.rule.table][y]);
    if (date) out.push({ ...o, id: `${o.id}-${y}`, date });
  }
  return out;
}

/** Calendar days from today to the occasion (0 = today). */
export function daysAway(date, now = new Date()) {
  const a = day(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return Math.round((date - a) / 86400000);
}

export const whenText = (n) => (n === -1 ? 'was yesterday' : n === 0 ? 'is today' : n === 1 ? 'is tomorrow' : `in ${n} days`);

/**
 * Occasions whose best deal is the day after. Halloween's card says candy is "50% off on Nov 1",
 * and it vanished at midnight on 31 Oct, the day before that was true (the third Halloween QA pass).
 * Such an occasion stays featured one more day with this line in place of its blurb. Kept apart from
 * OCCASIONS, which is generated from the phone's list; ios/App/Services/Seasonal.swift `dayAfter`
 * holds the same words (test/qa-seasonal.test.js).
 */
export const DAY_AFTER = {
  halloween: 'Candy is often 50% off today — check the weekly ads.',
};

const baseId = (o) => o.id.replace(/-\d{4}$/, '');

/** The occasions to feature: the soonest two within `days` (two, because Hanukkah 2027 begins Dec 24). */
export function featured(now = new Date(), days = 21) {
  const y = now.getFullYear();
  return [...occasions(y - 1), ...occasions(y), ...occasions(y + 1)]
    .map((o) => ({ ...o, daysAway: daysAway(o.date, now) }))
    .filter((o) => (o.daysAway >= 0 && o.daysAway <= days) || (o.daysAway === -1 && DAY_AFTER[baseId(o)]))
    .map((o) => (o.daysAway === -1 ? { ...o, blurb: DAY_AFTER[baseId(o)], dayAfter: true } : o))
    .sort((a, b) => a.date - b.date)
    .slice(0, 2);
}
