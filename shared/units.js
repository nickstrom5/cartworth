// Package-size parsing and unit-price math. Shared by the server and the browser.
//
// Every size is normalized to one of three dimensions with a base unit:
//   weight -> ounces (oz), volume -> fluid ounces (floz), count -> each (ct)
// Unit prices are stored per base unit and converted for display.

export const DIMS = ['weight', 'volume', 'count'];

const UNIT_ALIASES = {
  // weight (value = ounces)
  oz: ['weight', 1], ounce: ['weight', 1], ounces: ['weight', 1], onz: ['weight', 1], wt: ['weight', 1],
  lb: ['weight', 16], lbs: ['weight', 16], pound: ['weight', 16], pounds: ['weight', 16],
  g: ['weight', 0.03527396], gr: ['weight', 0.03527396], gm: ['weight', 0.03527396], gram: ['weight', 0.03527396], grams: ['weight', 0.03527396],
  kg: ['weight', 35.27396], kgs: ['weight', 35.27396], kilo: ['weight', 35.27396], kilogram: ['weight', 35.27396], kilograms: ['weight', 35.27396],
  mg: ['weight', 0.00003527396],
  // volume (value = fluid ounces)
  floz: ['volume', 1], fz: ['volume', 1], fo: ['volume', 1], 'fluid ounce': ['volume', 1], 'fluid ounces': ['volume', 1],
  gal: ['volume', 128], gals: ['volume', 128], gallon: ['volume', 128], gallons: ['volume', 128], gl: ['volume', 128],
  qt: ['volume', 32], qts: ['volume', 32], quart: ['volume', 32], quarts: ['volume', 32],
  pt: ['volume', 16], pts: ['volume', 16], pint: ['volume', 16], pints: ['volume', 16],
  cup: ['volume', 8], cups: ['volume', 8],
  l: ['volume', 33.8140227], lt: ['volume', 33.8140227], ltr: ['volume', 33.8140227], liter: ['volume', 33.8140227], liters: ['volume', 33.8140227], litre: ['volume', 33.8140227], litres: ['volume', 33.8140227],
  ml: ['volume', 0.0338140227], mls: ['volume', 0.0338140227], milliliter: ['volume', 0.0338140227], milliliters: ['volume', 0.0338140227],
  cl: ['volume', 0.338140227],
  // count (value = each)
  ct: ['count', 1], cnt: ['count', 1], count: ['count', 1], each: ['count', 1], ea: ['count', 1],
  pc: ['count', 1], pcs: ['count', 1], piece: ['count', 1], pieces: ['count', 1],
  pk: ['count', 1], pack: ['count', 1], packs: ['count', 1], pkg: ['count', 1],
  dozen: ['count', 12], dz: ['count', 12], doz: ['count', 12],
  roll: ['count', 1], rolls: ['count', 1], sheet: ['count', 1], sheets: ['count', 1],
  bunch: ['count', 1], head: ['count', 1], bag: ['count', 1], can: ['count', 1], cans: ['count', 1],
  bottle: ['count', 1], bottles: ['count', 1], bar: ['count', 1], bars: ['count', 1],
  pouch: ['count', 1], pouches: ['count', 1], stick: ['count', 1], sticks: ['count', 1],
  capsule: ['count', 1], capsules: ['count', 1], pod: ['count', 1], pods: ['count', 1], 'k-cup': ['count', 1], 'k-cups': ['count', 1],
  tablet: ['count', 1], tablets: ['count', 1], load: ['count', 1], loads: ['count', 1], wipes: ['count', 1],
  egg: ['count', 1], eggs: ['count', 1], unit: ['count', 1], units: ['count', 1],
};

// Multi-word aliases must be matched before single words.
const UNIT_PATTERN = [
  'fl\\.?\\s*oz\\.?', 'fluid\\s+ounces?', 'k-cups?',
  ...Object.keys(UNIT_ALIASES).filter((k) => !k.includes(' ') && !k.includes('-')).sort((a, b) => b.length - a.length),
].join('|');

// Longest alternatives first: "1 1/2" must match as a mixed number, not as "1" followed by "1/2".
const NUM = '(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|\\.\\d+)';
const SIZE_RE = new RegExp(`${NUM}\\s*(?:-|to)?\\s*(?:${NUM}\\s*)?(${UNIT_PATTERN})\\b\\.?`, 'i');
/**
 * A gram figure followed by a nutrient is a nutrition claim, not the package. Meijer lists
 * "Kellogg's Froot Loops With Marshmallows Breakfast Cereal 12g Whole Grains Family Size 16.2 oz":
 * the first size in the name is 12 g, so the name "said" 12 g against a stated 16.2 oz and the
 * size-conflict guard fired on a row whose numbers agree. Tony's "Pop-Tarts ..., 10g Protein" and
 * Sam's "Jif ..., 7g Protein (7% DV)" are the same shape in the captured results. Such a figure is
 * skipped and the next size in the text is used, if there is one.
 */
const NUTRIENT_AFTER_RE = /^\s*(?:of\s+)?(?:whole\s+grains?|protein|fib(?:er|re)|(?:added\s+|total\s+)?sugars?|(?:net\s+)?carbs?|carbohydrates?|(?:sat(?:urated)?\s+|trans\s+)?fat|sodium|caffeine|collagen)\b/i;
const SIZE_RE_ALL = new RegExp(SIZE_RE.source, 'gi');
const NUTRITION_CLAIM_RE = new RegExp(`(?<![\\d.])\\d+(?:\\.\\d+)?\\s*(?:g|gr|gm|grams?|mg)\\b(?=${NUTRIENT_AFTER_RE.source.slice(1)})`, 'gi');

/**
 * A slash between two whole numbers is a fraction only when it reads like one. "3/4 lb" and "1/2
 * gal" are; "4/4 oz" (Kroger's "4/4 oz Elgin Stick ... Butter 1 lb": four 4 oz sticks) and "24/16
 * Oz" (Cermak's panela: a 24-count case of the 16 oz unit it sells) are pack notation, and parsed
 * as fractions they said 1 oz and 1.5 oz and set off the size-conflict guard against correct rows.
 * Which side is the count is not knowable — 4x4 is the retail pack, 24x16 is the wholesaler's case —
 * so such a figure is not read as a size at all, and the next size in the text is used instead.
 */
function packNotation(numText) {
  const f = /^(\d+)\/(\d+)$/.exec(String(numText || '').trim());
  if (!f) return false;
  const a = +f[1], b = +f[2];
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  return a >= b || gcd(a, b) > 1;
}

/** First size in `s` that is not a nutrition claim or pack notation. Same shape as String#match. */
function matchSize(s) {
  SIZE_RE_ALL.lastIndex = 0;
  let m;
  while ((m = SIZE_RE_ALL.exec(s))) {
    const u = lookupUnit(m[3]);
    if (u && u.dim === 'weight' && /^(?:g|gr|gm|grams?|mg)$/.test(u.key) && NUTRIENT_AFTER_RE.test(s.slice(m.index + m[0].length))) continue;
    if (packNotation(m[1]) || packNotation(m[2])) continue;
    return m;
  }
  return null;
}
// "12 x 12 fl oz", "12 pk / 12 fl oz", "6 ct, 16.9 fl oz", "24 - 16.9 fl oz", "12pk 12oz".
// (?<![\d.]) stops the count being digits pulled out of a decimal: without it "1.5-2 lb" parsed
// as five 2-lb packs and priced a chicken breast at 7 cents a pound.
// A bare "/" separator is excluded because "3/4 lb" is a fraction, not three 4-lb packs; a
// slash-separated multipack ("12 pk / 12 fl oz") still matches via the pack-word branch.
const MULTI_RE = new RegExp(
  `(?<![\\d.])(\\d+)\\s*-?\\s*(?:x|×|pk\\.?|pack|ct\\.?|count|cans?|bottles?)\\s*(?:\\/|,|x|×|-|of)?\\s*${NUM}\\s*(${UNIT_PATTERN})\\b`,
  'i'
);
const MULTI_RE_1B = new RegExp(
  `(?<![\\d.])(\\d+)\\s*(?:,|x|×|-|of)\\s*${NUM}\\s*(${UNIT_PATTERN})\\b`,
  'i'
);
const MULTI_RE_2 = new RegExp(`(?<![\\d.])(\\d+)\\s*(?:pk\\.?|pack|ct\\.?|count)\\s+${NUM}\\s*(${UNIT_PATTERN})\\b`, 'i');
/**
 * A COUNT WORD before the size ("12 ct, 15 oz", "6-Pack, 5.63 LB", "24 Count, 6.75 FL OZ") says
 * how many of something there are, but not whether the size that follows is each one or all of
 * them. An explicit multiplication sign ("4 x 14.4 oz") does say, and is not covered here.
 *
 * Read as a multipack, "Sara Lee Hawaiian Rolls, 12 ct, 15 oz" became 12 x 15 oz = 180 oz: 23.9c/lb
 * for rolls that are $2.87/lb, which took the BEST PRICE headline at 53211 with "46% less" on top.
 * The bag holds twelve rolls and weighs 15 oz in all.
 *
 * Measured, not guessed. Every listing round 1 captured (7,939 distinct name/size pairs, four ZIPs)
 * was scanned for a count word directly before a size, and each of the 11 hits classified by hand
 * against its price, stated size and URL:
 *   - VOLUME, 5 of 5 are packs of N containers: SunnyD "24 Count, 6.75 FL OZ Bottles" at $9.32,
 *     ALDI juice "6 Pack, 8 fl oz Bottles" (stated size 48 fl oz = 6 x 8), "8 Pack, 6.75 fl oz
 *     Juice Boxes" twice, a "6 pack, 12 fl oz" cider. Drinks are labelled per container.
 *   - WEIGHT, 3 of 4 state the whole package: the Sara Lee rolls (stated size "12 ct"), Sam's
 *     "Hamburger Buns, 16 count, 30 oz" (stated "16 ct"; 30 lb of buns for $4.93 is not a thing),
 *     and Sam's "Hormel Chili with Beans 6-Pack, 5.63 LB" (stated "15 oz": 6 x 15 oz IS 5.63 lb, so
 *     the multipack reading priced it at 40c/lb against a true $2.39). This is the US NET WT
 *     convention: the count is pieces, the weight is the package. The same names with other words
 *     in between ("Artesano 12 ct, White, Bakery Rolls, Dinner Rolls, 18 oz") were already read as
 *     the package, and 11 of those 12 are right to be; only adjacency ever made them multiply. The
 *     twelfth, ALDI "Lunch Buddies 12pk ..., 3.2 oz Pouch", is priced from its stated 38.4 oz.
 *   - The fourth, Costco "Artesano the Original Bakery Bread, 2-count, 20 oz" at $7.08, really is
 *     two 20 oz loaves; Costco's stated size is "20 oz", one loaf, which is how warehouse clubs
 *     state every multipack. That is settled in pickSize (src/normalize.js), which has the stated
 *     size, not here: the parse alone cannot tell these apart, and when it cannot, it takes the
 *     reading that cannot make a price too cheap. A missed pack is too dear and loses; an invented
 *     one is too cheap and wins.
 * (?<![\d.]) as in MULTI_RE. ' x ' and '×' are not count words and keep the multipack reading.
 *
 * Only words that count PIECES qualify: ct, count, cnt, and "pack" spelled out. The abbreviation
 * "pk" and a container noun ("6 cans, 15 oz") count PACKAGES, and keep the multipack reading.
 * Measured in round 2 over every captured name that uses "Npk" (16 distinct products): 15 are
 * packs of units — Whole Foods cider, broth and green-bean "4pk"/"6pk"/"9pk", ALDI "Lunch Buddies
 * 12pk", duraflame "6pk" of 6 lb logs that Instacart itself states as "6 x 6 lb". The sixteenth,
 * King's Hawaiian "Savory Butter Rolls 4PK" (stated 4 ct), counts rolls but states no weight, so
 * this rule never sees it.
 * Round 2's first cut included "pk" here and read "12pk 12oz" — a twelve-pack of cans — as one
 * 12 oz package, twelve times too dear; the iOS suite's "unambiguous multipack" control caught it.
 * Whole Foods' own titles show the same split: 8 of 8 "pk" titles are packs of units, while its
 * spelled-out "N Pack"/"N Count" titles state the whole box (see splitNameSize in
 * src/adapters/wholefoods.js).
 */
/**
 * A COUNT AFTER a weight, written "9ct" or "48 Count" with no hyphen, is as ambiguous as a count
 * before it. Measured over every captured name of the form "M oz, N count" (153, round 3):
 *   - "N-count" / "N-pack" with a hyphen is Costco's and Sam's multipack spelling, and every one is
 *     N units of M ("Kerrygold Pure Irish Butter, Salted, 8 oz, 4-count").
 *   - "N pack" / "N pk" count packages, as COUNT_WORD_FIRST_RE's note found.
 *   - "N ct" / "N count" on a WEIGHT splits: "Tillamook Farmstyle Medium Cheddar Cheese Slices,
 *     8oz, 9ct" is nine slices in an 8 oz pack (stated 8 oz, $5.49) and "Ferrero Rocher ..., 21.2 oz,
 *     48 Count" is 48 chocolates in 21.2 oz; read as packs they were 9x and 48x too cheap, and the
 *     Tillamook slices took Chicago's cheddar headline at $1.22/lb in the round-3 price check.
 *     "Tillamook ... Snack Portions, 0.75oz, 10ct", "Chobani Greek Yogurt Cups, 5.3 oz, 12 Count" and
 *     "Stonyfield ... Yogurt Pouches, 3.5 oz., 4 Ct" really are N of M, and each says so with a plural
 *     container word in the name (CONTAINER_IN_NAME_RE, applied by sizeFromName).
 * So such a weight is read as the package, the reading that cannot be too cheap, and carries
 * `countAfter` so that a container word in the name can turn it back into the pack. A retailer that
 * states the pack's total ("12.5 oz, 4 count" stated 50 oz) is priced from that already: pickSize
 * prefers a measured stated size to the name's. Volumes keep the pack reading: drinks are labelled
 * per container.
 */
const CONTAINER_IN_NAME_RE = /\b(?:cups|pouches|portions|packets|cans|bottles|jars|tubs|cartons|containers|boxes|bars|pods|sticks|packs|bags|cartridges|k-cups)\b/i;

const COUNT_WORD_FIRST_RE = /^\s*\d+\s*-?\s*(?:pack|packs|ct\.?|count|cnt)\b/i;
const CONTAINERS_AFTER_RE = /^\s*\.?\s*(?:[a-z]+\s+)?(?:cups|cans|bottles|pouches|packets|jars|tubs|cartons|containers|boxes)\b/i;
// The count can also come AFTER the size: "12 fl oz, 12 Pack Cans", "5.3 oz, 12 Count".
const MULTI_RE_TRAILING = new RegExp(
  // The hyphen in "12-pack" is not optional in the wild: Costco lists nearly every case that way
  // ("16.9 fl oz, 12-pack"). Without it the size resolved to a bare count of 12 and the volume was
  // thrown away, which prices a case of shakes per bottle.
  `${NUM}\\s*(${UNIT_PATTERN})\\b[\\s,.]*-?[\\s,.]*(?<![\\d.])(\\d+)(\\s*-?\\s*)(pk\\.?|pack|ct\\.?|count)\\b`,
  'i'
);

export function parseNumber(s) {
  if (s == null) return NaN;
  s = String(s).trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  return parseFloat(s);
}

function lookupUnit(raw) {
  if (!raw) return null;
  let u = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (/^fl ?oz$/.test(u) || /^fluid ounces?$/.test(u)) u = 'floz';
  return UNIT_ALIASES[u] ? { key: u, dim: UNIT_ALIASES[u][0], factor: UNIT_ALIASES[u][1] } : null;
}

/**
 * Parse a package size string.
 * Returns { dim, base, amount, unit, count, perWeight, range, text } or null.
 *   base: size in base units (oz / floz / ct)
 *   perWeight: true when the item is sold by weight ("per lb") and has no fixed size
 */
/**
 * Bound what the size regexes see. Several backtrack on long runs of digits: 400 digits took about
 * 1.5 s and 2,000 about 30 s (the security review), and product names come from retailers with no
 * length limit. No real size needs more than a couple of hundred characters or a 9-digit number.
 */
function boundSizeText(v) {
  return String(v).slice(0, 200).replace(/\d{10,}/g, (d) => d.slice(0, 9));
}

export function parseSize(input) {
  if (input == null) return null;
  let s = boundSizeText(input).replace(/[\u00ae\u2122]/g, ' ').replace(/\u00a0/g, ' ').trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (/^(?:priced\s+)?per\s+(lb|pound|kg)\b/.test(lower) || /^(?:avg\.?\s*)?\/\s*lb$/.test(lower) || lower === 'lb' || lower === 'per lb') {
    return { dim: 'weight', base: null, amount: null, unit: 'lb', count: 1, perWeight: true, range: false, text: s };
  }
  if (/^(?:1\s+)?each$|^ea\.?$|^1\s*ea\.?$/.test(lower)) {
    return { dim: 'count', base: 1, amount: 1, unit: 'each', count: 1, perWeight: false, range: false, text: s };
  }

  // "12 Double Rolls", "6 Mega Rolls", "8 Family Size Bars"
  s = s.replace(/(\d)\s+(?:double|triple|mega|huge|giant|super|jumbo|family(?:\s+size)?|big|regular|large|xl)\s+(?=[a-z])/i, '$1 ');

  // Spelled-out fractions, which appear on milk and butter listings with no digits at all.
  s = s
    .replace(/\bhalf\s+(gallon|gal|pint|pt|dozen|lb|pound|liter|litre)\b/gi, '0.5 $1')
    // "three-quarter" must be rewritten BEFORE "quarter", or the quarter rule fires first and
    // turns it into "three-0.25 pound", which then parses as 4 oz instead of 12.
    .replace(/\bthree[- ]quarters?\s+(pound|lb|gallon|gal)\b/gi, '0.75 $1')
    .replace(/\bquarter\s+(pound|lb|gallon|gal)\b/gi, '0.25 $1')
    .replace(/\b(?:a|one)\s+dozen\b/gi, '12 ct')
    .replace(/\bhalf[- ]dozen\b/gi, '6 ct');

  // Count-before-size, then count-after-size ("12 fl oz, 12 Pack").
  let m = s.match(MULTI_RE) || s.match(MULTI_RE_2) || s.match(MULTI_RE_1B);
  let n = m ? parseInt(m[1], 10) : NaN;
  let each = m ? parseNumber(m[2]) : NaN;
  let u = m ? lookupUnit(m[3]) : null;
  if (m && u && COUNT_WORD_FIRST_RE.test(m[0]) && !/^\s*\d+(?:\.\d+)?\s*(?:-|to)\s*\d/.test(m[0]) && n > 1 && n <= 200 && each > 0 && u.dim !== 'count' && !isDoseNotPackage(u, each)) {
    // "N ct, M oz": see COUNT_WORD_FIRST_RE. Volume keeps the pack reading (drinks are labelled per
    // container); weight is read as the package's net weight. Both carry `countFirst` so pickSize
    // can overrule the reading when the retailer's own stated size settles it arithmetically.
    const countFirst = { n, unitBase: round(each * u.factor) };
    // ...unless the text itself says the size is per container: a PLURAL container noun right
    // after it ("12-count 5.3 oz cups", "6 Pack, 8 fl oz Bottles", "8 Pack, 6.75 fl oz Juice
    // Boxes") means each of those holds that much. Singular does not ("15 oz Bag" is the bag).
    const perContainer = CONTAINERS_AFTER_RE.test(s.slice(s.indexOf(m[0]) + m[0].length));
    if (u.dim === 'weight' && !perContainer) return { dim: u.dim, base: round(each * u.factor), amount: each, unit: u.key, count: 1, perWeight: false, range: false, text: s, countFirst };
    return { dim: u.dim, base: round(n * each * u.factor), amount: each, unit: u.key, count: n, perWeight: false, range: false, text: s, countFirst };
  }
  if (!m) {
    const t = s.match(MULTI_RE_TRAILING);
    if (t) {
      each = parseNumber(t[1]);
      u = lookupUnit(t[2]);
      n = parseInt(t[3], 10);
      m = t;
      // "8oz, 9ct": see CONTAINER_IN_NAME_RE. A weight followed by an unhyphenated piece count is
      // the package, with the count kept for sizeFromName and pickSize to settle.
      const pieceWord = /^(?:ct|count)/i.test(t[5]) && !t[4].includes('-');
      if (pieceWord && u && u.dim === 'weight' && n > 1 && n <= 200 && each > 0 && !isDoseNotPackage(u, each)) {
        return { dim: u.dim, base: round(each * u.factor), amount: each, unit: u.key, count: 1, perWeight: false, range: false, text: s, countAfter: { n, unitBase: round(each * u.factor) } };
      }
    }
  }
  if (m && u) {
    // "10-15 oz" is a range, not ten 15-oz packs. Any dash-joined pair of plain numbers followed
    // by a unit is a range, regardless of which side is larger.
    const dashRange = /^\s*\d+(?:\.\d+)?\s*(?:-|to)\s*\d/.test(m[0]);
    if (isDoseNotPackage(u, each)) return null;
    if (!dashRange && n > 1 && n <= 200 && each > 0 && u.dim !== 'count') {
      return { dim: u.dim, base: round(n * each * u.factor), amount: each, unit: u.key, count: n, perWeight: false, range: false, text: s };
    }
  }

  m = matchSize(s);
  if (m) {
    const a = parseNumber(m[1]);
    const b = m[2] != null ? parseNumber(m[2]) : NaN;
    const u = lookupUnit(m[3]);
    // A milligram figure on a label is a dose, not a package size ("Vitamin D3, 25 mg"). Treating
    // it as the package gives a true but useless number — hundreds of thousands of dollars per
    // pound. Fall through to "each" instead, which is how these are actually sold.
    if (u && isDoseNotPackage(u, a)) return null;
    if (u && a > 0) {
      // "12.2-14.4 oz" style ranges: keep the low end but flag it
      const range = Number.isFinite(b) && b > a;
      return { dim: u.dim, base: round(a * u.factor), amount: a, unit: u.key, count: 1, perWeight: false, range, text: s };
    }
  }

  // "12" alone with no unit — too ambiguous
  return null;
}

/**
 * A capacity is not a net quantity. "Reynolds Turkey Size Oven Bags, Holds Up to 24 Pounds, 2 Count"
 * parsed as two 24 lb packages — 768 oz of oven bag at 5c/lb — and in a whole-turkey search at
 * 53211 those were the five cheapest per-pound rows at five stores, above every real bird. "Up to"
 * and "holds"/"fits" state what the thing takes, never what is in the box. Only the Reynolds bags
 * carry such a phrase in the captured results; the rule is written for the shape, not the brand.
 */
const CAPACITY_RE = /\b(?:(?:holds?|fits?|accommodates?|for)\s+)?up\s+to\s+\d+(?:\.\d+)?\s*-?\s*(?:lbs?|pounds?|oz|ounces?|kg|qts?|quarts?|gal(?:lons?)?|cups?|servings?)\b|\b(?:holds?|fits?)\s+\d+(?:\.\d+)?\s*-?\s*(?:lbs?|pounds?|oz|ounces?|kg|qts?|quarts?|gal(?:lons?)?)\b/gi;

// Size is often embedded at the end of a product name: "Organic Whole Milk, 64 FZ", "Eggs Large 12ct"
export function sizeFromName(name) {
  if (!name) return null;
  // Nutrition claims ("12g Whole Grains", "10g Protein") are not sizes; see NUTRIENT_AFTER_RE.
  // Nor is what a product HOLDS: see CAPACITY_RE.
  name = boundSizeText(name).replace(NUTRITION_CLAIM_RE, ' ').replace(CAPACITY_RE, ' ');
  const parts = String(name).split(/,\s*/);
  // Try progressively longer tails before single segments: a pack size is often split across two
  // of them ("Coca-Cola, 12 fl oz, 12 Pack Cans"), and parsing only the last segment would keep
  // the count and silently throw away the 12 fl oz.
  for (let i = Math.max(0, parts.length - 3); i < parts.length - 1; i++) {
    const tail = parts.slice(i).join(', ');
    const p = parseSize(tail);
    // A count-first weight ("12 ct, 15 oz") parses with count 1 but must still be returned from
    // here WITH its stated count: dropping to the last segment alone would lose the "2-count" that
    // pickSize needs to recognise Costco's two 20 oz loaves.
    if (p && !p.perWeight && (p.count > 1 || p.countFirst || p.countAfter) && p.dim !== 'count') return p.countAfter ? packIfContainers(p, name) : p;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parseSize(parts[i]);
    if (p && !p.perWeight) return p.countAfter ? packIfContainers(p, name) : p;
  }
  const m = String(name).match(new RegExp(`(\\d+\\s*(?:x|pk|pack|ct)?\\s*(?:\\/|x|-)?\\s*)?${NUM}\\s*(${UNIT_PATTERN})\\b`, 'i'));
  if (m) return parseSize(m[0]);
  // A container word with no number: "Alta Dena Whole Milk, Paper Quart" is one quart. Walmart listed
  // it as "1 gal" at $1.98 and, with the name read as having no size, it became Los Angeles's best
  // milk at $1.98 a GALLON (the nationwide audit). Only for liquids: a "Quart Freezer Bag" is not.
  const bare = /\b(gallon|quart|pint)\b/i.exec(String(name));
  if (bare && looksLiquid(name)) return parseSize(`1 ${bare[1]}`);
  return null;
}

/** "Yogurt Cups, 5.3 oz, 12 Count": the name counts containers, so the count-after reading is N of M. */
function packIfContainers(p, name) {
  if (!CONTAINER_IN_NAME_RE.test(String(name))) return p;
  const { n, unitBase } = p.countAfter;
  return { ...p, base: round(n * unitBase), count: n, countAfter: undefined };
}

/** True when a parsed weight is a dosage rather than the size of the package. */
function isDoseNotPackage(u, amount) {
  if (u.dim !== 'weight') return false;
  if (u.key === 'mg') return true;
  // Loose spices and yeast packets start around 5 g; anything below that is a dose.
  if ((u.key === 'g' || u.key === 'gram' || u.key === 'grams') && amount < 3) return true;
  return false;
}

function round(n) {
  if (!Number.isFinite(n)) return n;
  // Keep enough significant figures that a milligram size never collapses to zero and take the
  // item out of the comparison without anyone noticing.
  if (n !== 0 && Math.abs(n) < 0.001) return n;
  return Math.round(n * 10000) / 10000;
}

// ---------- unit prices ----------

// Display units: [label, dim, basePerDisplay]
export const DISPLAY_UNITS = {
  oz: { label: 'oz', dim: 'weight', factor: 1 },
  lb: { label: 'lb', dim: 'weight', factor: 16 },
  kg: { label: 'kg', dim: 'weight', factor: 35.27396 },
  floz: { label: 'fl oz', dim: 'volume', factor: 1 },
  qt: { label: 'qt', dim: 'volume', factor: 32 },
  gal: { label: 'gal', dim: 'volume', factor: 128 },
  l: { label: 'L', dim: 'volume', factor: 33.8140227 },
  ct: { label: 'ea', dim: 'count', factor: 1 },
  dozen: { label: 'dozen', dim: 'count', factor: 12 },
};

export function displayUnitsFor(dim) {
  return Object.entries(DISPLAY_UNITS).filter(([, v]) => v.dim === dim).map(([k]) => k);
}

/** Convert a per-base-unit price to a display unit (e.g. per-floz -> per gal). */
export function toDisplay(perBase, displayUnit) {
  const d = DISPLAY_UNITS[displayUnit];
  if (!d || perBase == null) return null;
  return perBase * d.factor;
}

/**
 * Compute unit prices for a product.
 * price: effective package price (sale if on sale)
 * size: parsed size (from parseSize)
 * perLbPrice: price per pound for weight-priced items
 * estEach: estimated price per piece for weight-priced produce (Instacart "each (est.)")
 * Returns { weight?:{perBase,est}, volume?:{...}, count?:{...} }
 */
export function unitPrices({ price, size, perLbPrice, estEach, estPkgWeightOz }) {
  const out = {};
  if (perLbPrice > 0) out.weight = { perBase: perLbPrice / 16, est: false };
  if (estEach > 0) out.count = { perBase: estEach, est: true };
  if (price > 0 && size && size.base > 0 && !size.perWeight) {
    const perBase = price / size.base;
    if (!out[size.dim]) out[size.dim] = { perBase, est: !!size.range };
    // A fixed-count package of a weighed good ("5 ct" chicken) still has a count price.
  }
  if (!out.weight && price > 0 && estPkgWeightOz > 0) out.weight = { perBase: price / estPkgWeightOz, est: true };
  return out;
}

/** Pick a sensible default display unit for a dimension given observed package sizes (in base units). */
export function defaultDisplayUnit(dim, sizes = [], query = '') {
  const q = String(query).toLowerCase();
  if (dim === 'count') return /\beggs?\b/.test(q) ? 'dozen' : 'ct';
  const sorted = sizes.filter((x) => x > 0).sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  if (dim === 'weight') return med >= 12 || !sorted.length ? 'lb' : 'oz';
  if (dim === 'volume') {
    if (/\b(milk|juice|water|tea|lemonade|cider|oj)\b/.test(q) && med >= 32) return 'gal';
    return med >= 96 ? 'gal' : 'floz';
  }
  return 'ct';
}

const UNIT_LABEL = {
  floz: 'fl oz', fz: 'fl oz', fo: 'fl oz', gl: 'gal', gals: 'gal', gallon: 'gal', gallons: 'gal', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ounce: 'oz', ounces: 'oz', onz: 'oz', wt: 'oz', l: 'L', lt: 'L', ltr: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L',
  mls: 'ml', milliliter: 'ml', milliliters: 'ml', qts: 'qt', quart: 'qt', quarts: 'qt', pint: 'pt', pints: 'pt', pts: 'pt',
  cnt: 'ct', count: 'ct', each: 'ea', dz: 'dozen', doz: 'dozen', gr: 'g', gm: 'g', gram: 'g', grams: 'g', kgs: 'kg',
};

export function unitLabel(unit) {
  return UNIT_LABEL[unit] || unit;
}

// Stores often write "12 oz" for canned/bottled drinks where they mean fluid ounces.
// Words that mean the package really holds a liquid. Deliberately excludes "can" and "bottle" on
// their own: canned corn and canned pumpkin are sold by net weight, and "pop" alone matched
// Pop-Tarts. A container word only counts when something else on the label is also a drink.
// 'soup' is deliberately absent: a can or pouch of soup is labelled NET WT (condensed cream of
// mushroom is 10.5 oz of food, not 10.5 fluid ounces), and treating it as a liquid published
// "$8.90/gal" for a can of ALDI condensed soup. Broth and stock stay, because those really are
// sold in fluid ounces — the 158 broth coercions across the four-ZIP sweep are all correct.
// Pourable cream is a liquid too. Heavy cream is sold in pints and quarts, and a store that states
// its carton as "16 oz" means 16 fl oz: without these, Whole Foods' "Organic Heavy Cream, 16 OZ"
// ($4.09), Tony's "Best Choice Heavy Whipping Cream 16 oz" and Costco's only heavy cream, "Maola
// 40% Heavy Whipping Cream, 32 oz" at $4.84 — the cheapest quart in Chicago — were weights in a
// heavy-cream search that compares by volume, and dropped out of it (14 captured listings). Not
// "whipped" cream or "table cream": Reddi-wip and Nestlé Media Crema are sold by NET WT.
const LIQUID_RE = /\b(beer|ale|lager|ipa|seltzer|soda|cola|sparkling water|water|juice|lemonade|drink|beverage|milk|kefir|creamer|tea|kombucha|cider|wine|vodka|whiskey|rum|tequila|gin|spirits?|broth|stock|smoothie|shake|coffee drink|cold brew|energy drink|sports drink|gatorade|oil|vinegar|syrup|sauce|dressing|soda pop|heavy (?:whip(?:ping)? )?cream|whipping cream|half (?:&|and|n) half|half-and-half|egg ?nog|buttermilk)\b/i;
// Containers that only imply a liquid alongside a real liquid word.
const CONTAINER_RE = /\b(cans?|bottles?|jugs?|cartons?)\b/i;
// "Cut Sweet Potatoes in Syrup", "Peaches in Light Syrup", "Tuna in Water": what follows "in" is
// the packing medium, not the product. The can is still sold by NET WEIGHT. Without this, two
// 40 oz cans of the same cut sweet potato at the same $4.99 on the same Mariano's shelf landed in
// different dimensions — one compared per pound at $2.00, the other quoted at $15.97 per gallon
// and dropped out of the comparison entirely — purely because one label said "in Syrup".
//
// The medium is usually qualified, and a fixed list of qualifiers missed the commonest canned-fruit
// label of all: "Sweet Harvest Peach Slices in 100% Juice", "Pineapple Chunks in Pineapple Juice",
// "Diced Tomatoes In Tomato Juice" were all still quoted per gallon, while the same fruit "in Heavy
// Syrup" was compared per pound. Up to two words may now sit between "in" and the medium, and a
// "with Coconut Water" tacked on after it is part of the medium too. Every one of the 45 captured
// names with an "in ... <medium>" phrase was checked: all are net-weight cans, jars, pouches or
// pet food, and none is a drink.
const PACKING_MEDIUM_RE = /\b(?:packed\s+)?in\s+(?:[a-z0-9%'-]+\s+){0,2}(?:syrup|juices?|water|brine|oil|sauce|gravy)(?:\s+(?:with|and)\s+(?:[a-z'-]+\s+){0,2}(?:water|juices?|syrup))?\b/gi;

export function looksLiquid(name) {
  const n = String(name || '').replace(PACKING_MEDIUM_RE, ' ');
  if (LIQUID_RE.test(n)) return true;
  // "12 pk cans" is only a liquid if the label names a drink somewhere too.
  return CONTAINER_RE.test(n) && /\b(soda|cola|beer|seltzer|juice|water|drink|energy)\b/i.test(n);
}

/** Reinterpret a weight-oz size as fluid ounces for liquids ("12 pk, 12 oz cans"). */
// Things sold by net weight even though a liquid word appears on the label. Flavour words like
// "chocolate" and "strawberry" are NOT here: chocolate milk is still milk, and vetoing it put the
// flavoured version in a different dimension from the plain one, so they stopped comparing.
// Canned and jarred solids. 'cranberr(y|ies)' and 'jellied' were added because a 14 oz can of
// jellied cranberry sauce is NET WT 14 oz of gel — about 10.5 fluid ounces — so quoting it at
// "$14.54/gal" understated it by roughly a third; 'yam'/'sweet potato' because the same cut sweet
// potato compared in two different dimensions depending on whether its label mentioned syrup; and
// 'soup'/'condensed' to keep container words from dragging a soup can back into volume.
//
// Dry and concentrated forms of a liquid are sold by net weight too, and quoting them per gallon
// put them into the same comparison as the ready-to-drink thing at absurd figures: Whole Foods'
// Bare Bones "Chicken Broth Pantry Pack" (instant broth sticks, NET WT 2.12 oz) read $422/gal in a
// chicken-broth search whose real broths sat near $10/gal, the worst unit price in the whole Chicago
// sweep. Same shape: "Instant Chicken Bone Broth Sticks" at 0.53 "fl oz", LonoLife "Individual
// Packets", Trader Joe's "Chicken Broth Concentrate", every "Instant Non-Fat Dry Milk", and a tub of
// "Celery Sticks" in water. 'concentrate' does not fire on "From Concentrate", which is juice.
//
// 'butter' does not fire on "Butter Chicken": that is a curry, not a dairy fat. Kettle & Fire's
// "Organic Butter Chicken Bone Broth" and "Organic Classic Chicken Bone Broth", both 16.9 OZ at the
// same $7.99, landed in different dimensions because of it and so could never be compared.
const SOLID_RE = /\b(gelatin|jell-?o|bites?|bars?|cookies?|candy|chips?|cheese|crackers?|cereal|powder|mix|bread|cake|pastr(?:y|ies)|snacks?|nuts?|jerky|butter(?!\s+chicken)|beans?|noodles?|pasta|rice|flakes|granola|pretzels?|popcorn|gummies|grounds?|whole bean|k-cups?|pods?|tea bags?|frozen|yogurt|yoghurt|skyr|cottage|ricotta|curds?|oats?|oatmeal|flour|sugar|cocoa|corn|pumpkin|tuna|salmon|soups?|soup mix|condensed|kernel|cranberr(?:y|ies)|jellied|yams?|sweet potato(?:es)?|pie filling|muffins?|donuts?|doughnuts?|instant|(?<!non-)sticks?|stick packs?|packets?|(?<!from\s)concentrate|cubes?|bouillon|granules?|pantry pack|dry milk)\b/i;

export function coerceLiquid(size, name) {
  if (!size || size.dim !== 'weight' || size.perWeight) return size;
  if (!['oz', 'ounce', 'ounces', 'onz'].includes(size.unit)) return size;
  if (!looksLiquid(name) || SOLID_RE.test(String(name || ''))) return size;
  return { ...size, dim: 'volume', unit: 'floz', liquidCoerced: true };
}

export function formatSize(size) {
  if (!size) return '';
  if (size.perWeight) return 'per lb';
  const u = unitLabel(size.unit);
  const amt = size.amount != null ? trimNum(size.amount) : '';
  if (size.count > 1) return `${size.count} × ${amt} ${u}`;
  return `${amt} ${u}`.trim();
}

export function trimNum(n) {
  if (n == null || !Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

// ---------- produce: typical weight of one piece (lb), for comparing "each" vs "per lb" ----------
// Estimates only; results using them are always flagged as estimated.
const PRODUCE_LB = [
  [/\bbaby bananas?\b/, 0.15], [/\bplantains?\b/, 0.6], [/\bbananas?\b/, 0.33], [/\bavocados?\b/, 0.4], [/\blemons?\b/, 0.25], [/\blimes?\b/, 0.15],
  [/\b(honeycrisp|gala|fuji|granny smith|pink lady|braeburn|red delicious|golden delicious|envy|jazz|cosmic crisp|ambrosia)\b|\bapples?\b/, 0.4],
  [/\bnavel oranges?\b|\boranges?\b/, 0.45], [/\bgrapefruits?\b/, 1.0], [/\bmangos?\b|\bmangoes\b/, 0.75], [/\bpears?\b/, 0.45], [/\bpeach(es)?\b/, 0.35],
  [/\bnectarines?\b/, 0.33], [/\bplums?\b/, 0.2], [/\bkiwis?\b/, 0.2], [/\bpomegranates?\b/, 0.6],
  [/\b(bell )?peppers?\b/, 0.4], [/\bcucumbers?\b/, 0.6], [/\bzucchini\b/, 0.5], [/\byellow squash\b/, 0.5], [/\beggplants?\b/, 1.0],
  [/\broma tomato(es)?\b/, 0.15], [/\btomato(es)?\b/, 0.33], [/\bsweet potato(es)?\b|\byams?\b/, 0.6], [/\bpotato(es)?\b/, 0.55],
  [/\bonions?\b/, 0.5], [/\bgarlic\b/, 0.12], [/\bjalapenos?\b/, 0.05], [/\bartichokes?\b/, 0.5], [/\bcorn\b/, 0.6],
];

/**
 * Words that mean the produce word in the name is not one loose piece of produce.
 *
 * The estimate is multiplied by a price to publish a per-pound figure, so a wrong match invents a
 * number out of nothing. Live results gave us a 69¢ packet of "Mama Bean Vermicelli Tom Yam"
 * quoted at $1.15/lb as Woodman's cheapest yam, and a 6-count box of "Sweety Mochi, Ube Purple
 * Yam" — 7.5 oz of ice cream in total — quoted at $1.66/lb when the honest figure is $12.78/lb.
 * A container word is just as disqualifying: a "Yellow Onion Bag" is not one 0.5 lb onion, and
 * pricing it as one published $25.98/lb against a real onion median of $1.75.
 */
const NOT_ONE_PIECE_RE = /\b(juice|bread|chips?|sauce|dried|frozen|canned|jar|salsa|guacamole|oil|mix|pie|cake|smoothie|yogurt|candy|bar|powder|seasoning|soup|salad kit|noodles?|vermicelli|ramen|pasta|mochi|ice cream|dessert|cookies?|crackers?|syrup|bag|case|box|carton|crate|tray|pack|instant|cut|sliced|diced|wedges?|fries|tots|puree|filling|tablets?|capsules?|caplets?|softgels?|pills?|gumm(?:y|ies)|mg|mcg)\b/;

export function produceWeightLb(name) {
  const n = String(name || '').toLowerCase();
  if (NOT_ONE_PIECE_RE.test(n)) return null;
  for (const [re, lb] of PRODUCE_LB) if (re.test(n)) return lb;
  return null;
}
