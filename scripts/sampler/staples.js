// The staples we price, and the rules that keep them comparable across stores.
//
// Every store search returns a mixed bag ("milk" brings back formula, kefir and chocolate milk), so
// each staple pins down one shopping-comparable product:
//   query       what we type into the store's search box
//   match       the phrase scored by shared/match.js relevance() (include/exclude are passed too)
//   require     regexes that must ALL match "<brand> <name> | <category>"
//   reject      regexes where ANY match disqualifies the product
//   categories  Instacart's own category taxonomy — the same names across retailers, so it is the
//               strongest signal we have ([Plain Milk] vs [Chocolate Milk], [Cheddar], [Ground Beef])
//   size        package size window in BASE units (oz for weight, fl oz for volume, ct for count),
//               which is what makes prices comparable: gallon jugs, dozen eggs, 20 oz loaves…
//   dim/unit    dimension and the display unit prices are reported in (unit/factor in base units)
//
// Tuning notes live next to the rules: everything here was checked against real results.
import { DISPLAY_UNITS } from '../../shared/units.js';

export const STAPLES = [
  {
    id: 'milk',
    label: 'Milk, whole, 1 gallon',
    noun: 'milk',
    nounPhrase: 'a gallon of whole milk',
    query: 'whole milk gallon',
    match: 'milk',
    dim: 'volume', unit: 'gal', unitText: '/gal',
    size: { min: 120, max: 132 }, // gallon jugs only — half gallons cost far more per gallon
    include: ['milk'],
    exclude: ['organic', 'lactose', 'chocolate', 'a2', 'ultra filtered', 'fairlife', 'goat', 'formula',
      'toddler', 'infant', 'buttermilk', 'evaporated', 'condensed', 'powdered', 'kefir', 'eggnog',
      'almond', 'oat', 'soy', 'coconut', 'cashew', 'hemp', 'raw', 'strawberry', 'vanilla'],
    // "Good & Gather Organic Vitamins A & D 2% Reduced Fat Milk 38% Less Fat Than Whole Milk" scores
    // 0.96 on relevance alone, so fat level is pinned by regex, not by words.
    require: [/\bwhole\b|\bvitamin\s*d\b|\bhomogeni[sz]ed\b/i],
    reject: [/\b(1|2|1\.5)\s*%/, /\b(reduced|low)[\s-]*fat\b/i, /\blowfat\b/i, /\bskim\b/i, /\bnon[\s-]?fat\b/i,
      /\bfat[\s-]?free\b/i, /\bformula\b/i, /\bhalf\b[\s\S]{0,6}\bhalf\b/i, /\bcreamer?\b/i, /\bwhipping\b/i],
    categories: [/plain milk/i, /whole milk/i, /^milk$/i],
    denyCategories: [/lactose|chocolate|flavored|formula|yogurt|cream|kefir|non-?dairy|plant/i],
    minScore: 0.45,
    keywords: ['milk'],
  },
  {
    id: 'eggs',
    plural: true,
    label: 'Eggs, Grade A large, dozen',
    noun: 'eggs',
    nounPhrase: 'a dozen large eggs',
    query: 'large eggs',
    match: 'eggs',
    dim: 'count', unit: 'dozen', unitText: '/dozen',
    size: { min: 12, max: 12 },
    countFromName: true, // ALDI lists a dozen eggs as "24 oz", so the count comes from the name
    include: ['egg'],
    exclude: ['organic', 'pasture', 'free range', 'liquid', 'beaters', 'substitute', 'noodle', 'nog',
      'salad', 'bites', 'patty', 'omelet', 'scramble', 'quail', 'duck'],
    require: [/\blarge\b/i],
    reject: [/\bwhites\b/i, /\begg\s*white\b/i, /\b(x[\s-]?large|extra[\s-]?large|jumbo|medium|small)\b/i,
      /\bliquid\b/i, /\bhard[\s-]?(boiled|cooked)\b/i, /\bpeeled\b/i, /\bpowder/i],
    categories: [/whole eggs/i, /^eggs$/i],
    denyCategories: [/liquid|substitute|prepared/i],
    minScore: 0.4,
    keywords: ['egg'],
  },
  {
    id: 'bread',
    label: 'White sandwich bread, 20 oz loaf',
    noun: 'white bread',
    nounPhrase: 'a 20-ounce loaf of white sandwich bread',
    query: 'white sandwich bread',
    match: 'white bread',
    dim: 'weight', unit: 'loaf', unitText: ' per 20-oz loaf', unitFactor: 20,
    size: { min: 19.5, max: 20.5 }, // the standard 20 oz loaf: a real shelf price, no normalising
    include: ['bread'],
    exclude: ['wheat', 'whole grain', 'multigrain', 'rye', 'sourdough', 'keto', 'gluten', 'organic',
      'brioche', 'hawaiian', 'potato', 'honey', 'cinnamon', 'raisin', 'italian', 'french', 'artisan',
      'bagel', 'bun', 'roll', 'muffin', 'tortilla', 'pita', 'naan', 'stuffing', 'crumb', 'dough',
      'protein', 'sprouted', 'seed', 'rustic', 'sourdough'],
    require: [/\bwhite\b|\bsandwich bread\b|\benriched bread\b/i],
    reject: [/\bwhole\s*(wheat|grain)\b/i, /\btexas toast\b/i, /\bgluten[\s-]?free\b/i, /\bketo\b/i,
      /\bthin[\s-]?sliced\b/i, /\bhot dog|hamburger\b/i, /\bstuffing\b/i, /\bcrouton/i],
    categories: [/white bread/i],
    minScore: 0.4,
    keywords: ['bread'],
  },
  {
    id: 'bananas',
    plural: true,
    label: 'Bananas, per pound',
    noun: 'bananas',
    nounPhrase: 'a pound of bananas',
    query: 'bananas',
    match: 'banana',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    perLb: true, allowEst: true, // sold loose per lb, or each (converted with shared/units.js weights)
    size: { min: 8, max: 160 },
    include: ['banana'],
    exclude: ['organic', 'plantain', 'dried', 'chips', 'bread', 'frozen', 'pudding', 'candy',
      'smoothie', 'juice', 'snack', 'pepper', 'baby'],
    require: [/\bbanana/i],
    reject: [/\bplantain/i, /\bbanana\s+(bread|pepper|chip|candy|split|nut|pudding)/i, /\bred bananas?\b/i,
      /\bbaby bananas?\b/i, /\bmanzano|burro\b/i],
    categories: [/yellow bananas/i, /^bananas$/i],
    minScore: 0.3,
    keywords: ['banana'],
  },
  {
    id: 'chicken',
    label: 'Boneless skinless chicken breast, per pound',
    noun: 'chicken breast',
    nounPhrase: 'a pound of boneless skinless chicken breast',
    query: 'boneless skinless chicken breast',
    match: 'chicken breast',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    perLb: true,
    size: { min: 12, max: 120 }, // fresh trays and family packs, not 40 oz frozen bags
    include: ['chicken', 'breast'],
    exclude: ['frozen', 'organic', 'tenderloin', 'tender', 'strip', 'diced', 'breaded', 'cooked',
      'grilled', 'seasoned', 'marinated', 'fajita', 'nugget', 'patty', 'sausage', 'thigh', 'wing',
      'drumstick', 'ground', 'canned', 'rotisserie', 'fillet', 'cutlet', 'stuffed', 'bites'],
    require: [/\bbreasts?\b/i],
    // Chains name the same cut differently: Walmart "Boneless Skinless Chicken Breasts", ALDI Los
    // Angeles just "Kirkwood Chicken Breasts, per lb". Instacart's fresh [Chicken Breast] category
    // is boneless/skinless unless the name says split or bone-in, which `reject` rules out.
    requireAny: [/\bboneless\b/i, /\|\s*chicken breast\s*$/i],
    reject: [/\bfrozen\b/i, /\bbone[\s-]?in\b/i, /\bsplit\b/i, /\bhalf\b/i, /\bthin[\s-]?sliced\b/i, /\borganic\b/i,
      /\bair[\s-]?chilled\b/i, /\btenderloin/i, /\btenders?\b/i, /\bstrips?\b/i, /\bpieces?\b/i,
      /\bseasoned\b/i, /\bmarinated\b/i, /\bbreaded\b/i, /\bnugget/i, /\bdiced\b/i, /\bcubed?\b/i, /\bchunks?\b/i, /\bpatt(y|ies)\b/i, /\bwings?\b/i,
      /\bthighs?\b/i, /\bdrumstick/i, /\bcutlet/i, /\bskin[\s-]?on\b/i],
    categories: [/chicken breast/i],
    denyCategories: [/frozen|prepared|cooked/i],
    minScore: 0.45,
    keywords: ['chicken'],
  },
  {
    id: 'beef',
    label: 'Ground beef, 80/20, per pound',
    noun: 'ground beef',
    nounPhrase: 'a pound of 80/20 ground beef',
    query: '80/20 ground beef',
    match: 'ground beef',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    perLb: true,
    size: { min: 12, max: 56 }, // 0.75–3.5 lb: 5 lb chubs are a bulk format and skew per-lb prices
    include: ['ground', 'beef'],
    exclude: ['patty', 'burger', 'frozen', 'organic', 'grass fed', 'meatball', 'taco', 'seasoned',
      'turkey', 'pork', 'chicken', 'bison', 'veal', 'lamb'],
    // Lean/fat ratio is written half a dozen ways: "80% Lean/20% Fat", "80/20", "80% Lean 20% Fat".
    require: [/\b80\s*%?\s*(?:lean)?\s*[\/-]?\s*20\b|\b80\s*%\s*lean\b|\b80\/20\b/i],
    reject: [/\bpatt(y|ies)\b/i, /\bburger/i, /\bfrozen\b/i, /\bmeatball/i, /\bmeatloaf/i, /\bseasoned\b/i],
    categories: [/ground beef/i],
    denyCategories: [/frozen|patties|prepared/i],
    minScore: 0.4,
    keywords: ['beef'],
  },
  {
    id: 'butter',
    label: 'Butter, salted, 1 lb',
    noun: 'butter',
    nounPhrase: 'a pound of salted butter',
    query: 'salted butter',
    match: 'butter',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    size: { min: 15.5, max: 16.5 },
    include: ['butter'],
    exclude: ['unsalted', 'spread', 'whipped', 'light', 'organic', 'ghee', 'peanut', 'almond', 'apple',
      'cocoa', 'body', 'cookie', 'garlic', 'honey', 'cinnamon', 'plant', 'vegan', 'olive'],
    // ALDI's salted butter is called "Sweet Cream Butter", so "salted" may only be in the category.
    require: [/\bsalted\b|\bsweet cream butter\b/i],
    reject: [/\bunsalted\b/i, /\bspread/i, /\blight\b/i, /\bolive oil\b/i, /\bwhipped\b/i, /\bghee\b/i,
      /\bplant[\s-]based\b/i, /\bvegan\b/i, /\bgarlic\b/i, /\bhoney\b/i, /\bcinnamon\b/i, /\bbody\b/i],
    categories: [/salted butter/i, /^butter$/i],
    denyCategories: [/unsalted|spread|ghee|margarine/i],
    minScore: 0.35,
    keywords: ['butter'],
  },
  {
    id: 'coffee',
    label: 'Ground coffee, 9–13 oz, per ounce',
    noun: 'ground coffee',
    nounPhrase: 'ground coffee',
    query: 'ground coffee',
    match: 'ground coffee',
    dim: 'weight', unit: 'oz', unitText: '/oz',
    size: { min: 9, max: 13.5 }, // the standard bag/brick; big canisters are cheaper per oz
    include: ['coffee'],
    exclude: ['whole bean', 'instant', 'decaf', 'pod', 'capsule', 'organic', 'flavored', 'vanilla',
      'hazelnut', 'caramel', 'mocha', 'pumpkin', 'cinnamon', 'chocolate', 'creamer', 'syrup',
      'cold brew', 'concentrate'],
    require: [/\bground\b/i],
    reject: [/\bwhole bean\b/i, /\bbeans\b/i, /\binstant\b/i, /\bdecaf/i, /\bk[\s-]?cups?\b/i, /\bpods?\b/i,
      /\bsingle[\s-]serve\b/i, /\bfilter packs?\b/i, /\bcold brew\b/i, /\bcreamer\b/i, /\bflavored\b/i],
    categories: [/ground coffee/i],
    denyCategories: [/whole bean|pods|instant|creamer/i],
    minScore: 0.45,
    keywords: ['coffee'],
  },
  {
    id: 'cheddar',
    label: 'Cheddar cheese, block or shredded, per pound',
    noun: 'cheddar cheese',
    nounPhrase: 'cheddar cheese',
    query: 'cheddar cheese',
    match: 'cheddar cheese',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    // Per pound, cheddar costs about the same at 8 oz and 16 oz (ALDI Houston: $3.50 vs $3.49/lb),
    // so one window covering the everyday 8/12/16 oz packs keeps every store in play without a
    // pack-size bias — and stops an 8-oz-only rule from landing on a specialty cheese.
    size: { min: 6, max: 17 },
    include: ['cheddar'],
    exclude: ['sliced', 'snack', 'stick', 'cube', 'cracker', 'string', 'organic', 'reduced fat',
      'spread', 'dip', 'sauce', 'powder', 'soup', 'chip', 'jack', 'colby', 'mozzarella', 'american',
      'swiss', 'provolone', 'parmesan', 'gouda', 'havarti', 'queso', 'singles', 'blend', 'curd'],
    require: [/\bcheddar\b/i],
    reject: [/\bslice/i, /\bsingles\b/i, /\bstring\b/i, /\bcube/i, /\bsnack\b/i, /\bcracker\b/i,
      /\bspread\b/i, /\bdip\b/i, /\bsauce\b/i, /\bpowder/i, /\bcurds?\b/i, /\bcrumbl/i, /\bjack\b/i,
      /\bcolby\b/i, /\bblend\b/i, /\b2\s*%/i, /\breduced[\s-]fat\b/i, /\bfat[\s-]free\b/i, /\bpuff/i,
      // flavoured/specialty cheddars are a different product and can be the only 8 oz pack in stock
      /\b(cranberry|jalapeno|habanero|chipotle|horseradish|buffalo|smoked|garlic|herb|bacon|onion|dill|truffle|wine|port|whiskey|beer|fig|maple|caramelized)\b/i,
      /\baged\b/i, /\breserve\b/i, /\bunexpected\b/i],
    categories: [/cheddar/i],
    denyCategories: [/slices|snack|string|dip|sauce/i],
    minScore: 0.45,
    keywords: ['cheddar'],
  },
  {
    id: 'potatoes',
    plural: true,
    label: 'Russet potatoes, 5–10 lb bag, per pound',
    noun: 'russet potatoes',
    nounPhrase: 'russet potatoes',
    query: 'russet potatoes',
    match: 'potatoes',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    // Bagged russets only: loose "extra large bakers" sell for two to three times the bag price
    // per pound. The 5 lb bag is the standard; stores that only carry 10 lb (Safeway, Vons, some
    // ALDIs) fall back to the second tier rather than dropping out.
    sizeTiers: [{ min: 70, max: 90 }, { min: 48, max: 170 }],
    include: ['potato'],
    exclude: ['sweet', 'red', 'gold', 'yellow', 'baby', 'fingerling', 'purple', 'instant', 'mashed',
      'hash', 'fries', 'frozen', 'chip', 'canned', 'organic', 'salad', 'tot', 'puff', 'wedge', 'seasoned'],
    // ALDI sells them as "Baking Potatoes" in the [Russet Potatoes] category.
    require: [/\brusset|\bidaho\b|\bbaking potato/i],
    reject: [/\bsweet potato/i, /\byukon\b/i, /\borganic\b/i, /\bfrozen\b/i, /\binstant\b/i],
    categories: [/russet potatoes/i, /potatoes/i],
    denyCategories: [/sweet|red|gold|yellow|frozen|prepared|instant/i],
    minScore: 0.3,
    keywords: ['potato'],
  },
  {
    id: 'rice',
    label: 'White rice, long grain, 2–5 lb bag, per pound',
    noun: 'white rice',
    nounPhrase: 'long grain white rice',
    query: 'long grain white rice',
    match: 'rice',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    size: { min: 30, max: 82 },
    include: ['rice'],
    exclude: ['brown', 'jasmine', 'basmati', 'instant', 'minute', 'arborio', 'wild', 'sushi', 'seasoned',
      'spanish', 'yellow', 'mexican', 'fried', 'cake', 'flour', 'cereal', 'noodle', 'pudding', 'vinegar',
      'milk', 'organic', 'parboiled', 'risotto', 'quinoa', 'cauliflower', 'pilaf', 'sticky', 'calrose'],
    require: [/\bwhite\b|\blong grain\b|\benriched\b/i],
    reject: [/\binstant\b|\bminute\b|\bmicrowav|\b90[\s-]second\b|\bready[\s-]to[\s-]serve\b|\bboil[\s-]in[\s-]bag\b/i,
      /\bparboiled\b/i, /\bjasmine|basmati|arborio|calrose|sushi\b/i, /\bbrown rice\b/i, /\bcups?\b/i],
    categories: [/enriched rice/i, /white rice/i, /^rice$/i],
    denyCategories: [/jasmine|basmati|brown|wild|prepared|meals/i],
    minScore: 0.3,
    keywords: ['rice'],
  },
  {
    id: 'orange-juice',
    label: 'Orange juice, 52–64 fl oz, per gallon',
    noun: 'orange juice',
    nounPhrase: 'orange juice',
    query: 'orange juice',
    match: 'orange juice',
    dim: 'volume', unit: 'gal', unitText: '/gal',
    size: { min: 50, max: 66 },
    include: ['orange', 'juice'],
    exclude: ['organic', 'drink', 'punch', 'cocktail', 'blend', 'mango', 'pineapple', 'strawberry',
      'tangerine', 'grapefruit', 'apple', 'cranberry', 'lemonade', 'sparkling', 'kids', 'light', 'smoothie'],
    require: [/\borange juice\b/i],
    reject: [/\bdrink\b|\bpunch\b|\bcocktail\b|\bbeverage\b/i, /\bsunny\s*d/i, /\blight\b/i, /\bblend\b/i],
    categories: [/orange juice/i],
    denyCategories: [/concentrate|drink|blend|punch/i],
    minScore: 0.45,
    keywords: ['orange'],
  },
  {
    id: 'peanut-butter',
    label: 'Peanut butter, creamy, 15–18 oz, per ounce',
    noun: 'peanut butter',
    nounPhrase: 'creamy peanut butter',
    query: 'creamy peanut butter',
    match: 'peanut butter',
    dim: 'weight', unit: 'oz', unitText: '/oz',
    size: { min: 15, max: 18.5 }, // the standard jar (16 oz, 16.3 oz, 18 oz)
    include: ['peanut', 'butter'],
    exclude: ['crunchy', 'chunky', 'organic', 'powder', 'honey', 'chocolate', 'jelly', 'banana',
      'protein', 'whipped', 'reduced fat', 'cookie', 'cracker', 'bar', 'granola', 'dog', 'squeeze'],
    require: [/\bpeanut butter\b/i],
    // "Peanut Butter Spread" is a different, cheaper product (less than 90% peanuts).
    reject: [/\bcrunch|chunky\b/i, /\bspread\b/i, /\bpowder/i, /\bhoney\b/i, /\bchocolate\b/i,
      /\breduced[\s-]fat\b/i, /\bto[\s-]go\b/i, /\bcups?\b/i, /\bwhipped\b/i, /\bjelly\b/i],
    categories: [/peanut butter/i],
    denyCategories: [/snack|bar|cookie|candy/i],
    minScore: 0.45,
    keywords: ['peanut'],
  },
  {
    id: 'apples',
    plural: true,
    label: 'Gala apples, per pound',
    noun: 'gala apples',
    nounPhrase: 'a pound of gala apples',
    query: 'gala apples',
    match: 'gala apple',
    dim: 'weight', unit: 'lb', unitText: '/lb',
    perLb: true, allowEst: true,
    size: { min: 16, max: 80 }, // loose per lb, or 2–5 lb bags
    include: ['gala'],
    exclude: ['organic', 'juice', 'sauce', 'chip', 'dried', 'slice', 'pie', 'cider', 'candy', 'caramel',
      'fritter', 'honeycrisp', 'fuji', 'granny', 'cosmic', 'envy', 'sugarbee'],
    require: [/\bgala\b/i],
    reject: [/\borganic\b/i, /\bjuice|sauce|chips?|dried|caramel|candied|fritter|pie\b/i, /\bslice/i],
    categories: [/gala apples/i, /apples/i],
    denyCategories: [/honeycrisp|granny|fuji|cosmic|envy|prepared|dried/i],
    minScore: 0.3,
    keywords: ['apple'],
  },
];

export const STAPLE_BY_ID = Object.fromEntries(STAPLES.map((s) => [s.id, s]));

/** Base units per display unit (e.g. gal -> 128 fl oz, dozen -> 12 ct, "loaf" -> 20 oz). */
export function unitFactor(staple) {
  return staple.unitFactor ?? DISPLAY_UNITS[staple.unit]?.factor ?? 1;
}

/** "$2.29/gal", "$1.45/dozen", "$1.35 per 20-oz loaf" */
export function formatPrice(staple, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}${staple.unitText}`;
}
