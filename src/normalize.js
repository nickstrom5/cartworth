// Build the normalized product shape every adapter returns.
import { parseSize, sizeFromName, coerceLiquid, coerceSolid, looksLiquid, namesContainers, unitPrices, formatSize, produceWeightLb, noEachEstimate, weighedWholePumpkin, wholeTurkey, TYPICAL_TURKEY_LB, TURKEY_EACH_MIN, TURKEY_WHOLE_PACKAGE_LB_MIN, TURKEY_BREAST_PACKAGE_LB_MIN, PRODUCE_GRADE_COUNT, PRODUCE_PIECE_MAX } from '../shared/units.js';

export function money(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const str = String(s).replace(/,/g, '');
  const dollars = str.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollars) return +dollars[1];
  const cents = str.match(/(\d+)\s*¢/);
  if (cents) return +cents[1] / 100;
  const bare = str.match(/(\d+(?:\.\d+)?)/);
  return bare ? +bare[1] : null;
}

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * fields:
 *  storeId, id, name, brand, sizeText, price (current package price, or price per lb when soldBy='lb'),
 *  regularPrice, memberPrice, memberLabel, soldBy ('each'|'lb'), estEach, estPkg, promo, saleEnds,
 *  image, url, stock, available, category, tags, sponsored, rank, total, priceBasis, sourceLabel
 */
/**
 * Choose between the size a store states for the package and the size embedded in the product name.
 *
 * Warehouse clubs state the size of ONE unit while charging for a case: Costco lists "Kirkland
 * Ultra Filtered 2% Lactose Free Milk, Half Gallon, 3-count" with a sizeText of "64 fl oz" and a
 * price of $14.92. Dividing the case price by one bottle gives $29.84 a gallon for milk that is
 * really $9.95, which is wrong in the most damaging direction: it is the number the comparison
 * shows, and one outlier also flattens the per-store chart so every honest price looks identical.
 *
 * So the name wins whenever it describes a multi-pack that the stated size does not, and whenever
 * the stated size is just a unit count ("each") while the name carries a real measurement.
 */
function pickSize(fromText, fromName, listing = {}) {
  if (!fromName) return fromText;
  if (!fromText) return fromName;
  const settled = settleCountFirst(fromText, fromName, listing) || settleByStatedCount(fromText, fromName, listing);
  if (settled) return settled;
  const textPack = fromText.count > 1;
  const namePack = fromName.count > 1;
  if (namePack && !textPack) return fromName;

  // A bare "each" carries no quantity at all, so anything the name states beats it — INCLUDING
  // another count. The earlier version only swapped when the name gave a different dimension,
  // which meant an egg carton listed as sizeText "1 ea" and named "..., 24 count" kept the "1 ea":
  // a $9.32 carton was priced at $9.32 per egg instead of $0.39, and looked 32 times dearer than
  // a store whose "12 ct" happened to parse. Eggs are a staple, so this was wrong constantly.
  const textIsBareEach = fromText.dim === 'count' && fromText.unit === 'each' && fromText.base === 1 && !fromText.perWeight;
  if (textIsBareEach && (fromName.base ?? 0) > 1) return fromName;

  // "each" / "1 ct" tells us nothing a measured size does not.
  if (fromText.dim === 'count' && fromName.dim !== 'count' && !fromText.perWeight) return fromName;
  return fromText;
}

/**
 * "N ct, M oz" in a product name does not say whether M is one unit or all of them (see
 * COUNT_WORD_FIRST_RE in shared/units.js, which reads weights as the whole package and volumes as a
 * pack of containers). The retailer's own stated size can settle it, but only arithmetically:
 *
 *   stated == M        one unit is M, so there are N of them. Costco "Artesano the Original Bakery
 *                      Bread, 2-count, 20 oz", stated "20 oz", $7.08: two 20 oz loaves. Warehouse
 *                      clubs state one unit's size for every multipack (see pickSize).
 *   stated == N x M    the same, said the other way ("6 Pack, 8 fl oz Bottles", stated 48 fl oz).
 *   stated x N == M    M is the package: Sam's "Hormel Chili with Beans 6-Pack, 5.63 LB", stated
 *                      "15 oz". Six 15 oz cans are 5.63 lb, so the name's number is the total, and
 *                      the multipack reading priced the chili at 40c/lb against a true $2.39.
 *
 * Anything else (a stated piece count like "12 ct", no stated size, or a number that fits
 * neither) settles nothing and the parse's own conservative reading stands. 2% tolerance, the
 * same as dropStaleSizeFromName, for "5.63 lb" against 6 x 15 oz = 5.625 lb.
 */
const WAREHOUSE_CLUBS = new Set(['costco', 'samsclub', 'bjs']);
const SAYS_PACKAGE_RE = /\b(?:oz|ounces?|lbs?|pounds?)\.?\s+(?:package|pkg|total)\b/i;
function settleCountFirst(fromText, fromName, { club = false, name = '' } = {}) {
  const cf = fromName.countFirst;
  if (!cf || !(cf.n > 1) || !(cf.unitBase > 0)) return null;
  if (fromText.perWeight || fromText.count > 1 || fromText.dim !== fromName.dim || !(fromText.base > 0)) return null;
  const near = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.02;
  const one = cf.unitBase;
  const packBase = Math.round(cf.n * one * 10000) / 10000;
  // When the name was already read as the pack (a volume, or a plural container after the size),
  // the stated size only confirms it: that is the name's own reading, not one we derived.
  const pack = fromName.count === cf.n && fromName.base === packBase ? fromName : { ...fromName, base: packBase, count: cf.n };
  if (near(fromText.base, cf.n * one)) return pack;
  // "stated == M, so there are N" is how a warehouse club lists a multipack, and only a club. At a
  // supermarket a stated weight equal to the name's is the package said twice, and the count is
  // pieces: Meijer's "Ready-to-Bake Pie Crusts 2 Count 15 oz" (stated 15 oz) read as 30 oz and was
  // the best pie crust in Louisville, Indianapolis, Columbus and Detroit at $2.13/lb; Dierbergs'
  // "Split Top Dinner Rolls 16 ct - 20 oz" read $0.22/lb. Of the cached weights of this shape every
  // supermarket's is one package (10 products, 60 stores) and the clubs' are packs, bar one that
  // says so: BJ's "Gorton's ... 10 Count, 32.5 Ounce Package" (every cached answer re-scored, 19 Nov
  // 2026). Drinks keep the pack reading everywhere ("6 Pack 12 Fl Oz Cans", stated 12 fl oz), whether
  // their size is written fl oz or oz ("Chicken Broth 6 Pack 14.5 oz"), and so does a name that
  // counts containers ("4 ct 5 oz Cans").
  if (near(fromText.base, one)) return fromName.dim !== 'weight' || looksLiquid(name) || namesContainers(name) || (club && !SAYS_PACKAGE_RE.test(name)) ? pack : null;
  if (near(fromText.base * cf.n, one)) {
    return { ...fromName, base: Math.round(fromText.base * cf.n * 10000) / 10000, amount: fromText.amount, unit: fromText.unit, count: cf.n };
  }
  return null;
}

/**
 * Two single-unit sizes that differ by exactly a pack count the listing itself states.
 *
 * Retailers put one unit's size in one field and the pack's total in the other, and which goes
 * where varies: ALDI "Lunch Buddies 12pk Apple Squeezies Varie, 3.2 oz Pouch" states 38.4 oz;
 * Costco "Pulmuone Teriyaki Stir-fry Udon, 30.9 oz" states 7.72 oz with a slug reading
 * "...-772-oz-4count-772-oz"; Sam's "Jif Creamy Peanut Butter, ..., 96 Oz. Twin Pack" states 48 oz;
 * Cermak "Marinela Sponch, 4 ct, ..., 12.68 oz" states 3.17 oz. In every one the bigger number is
 * the package the price buys, and pricing from the smaller one made the udon, the peanut butter
 * and the cookies 2x to 4x too dear. When the ratio is within 2% of a whole number N that the name
 * or the slug states as a count, the two are not in conflict: they are one unit and N of them.
 *
 * This takes the LARGER size, which is the direction that can make a price too cheap, so it needs
 * both witnesses: exact arithmetic AND the retailer spelling out that count. A ratio with no count
 * behind it ("BELVITA ..., Pumpkin Spice 8.8 oz", stated 1.76 oz, is exactly 5x but says 5 nowhere)
 * is left to sizeConflict, which keeps the row off the headline.
 */
export function settleByStatedCount(fromText, fromName, { name = '', url = '' } = {}) {
  if (!fromText || !fromName || fromText.perWeight || fromName.perWeight) return null;
  if (fromText.count > 1 || fromName.count > 1 || fromText.dim !== fromName.dim || fromText.dim === 'count') return null;
  if (!(fromText.base > 0) || !(fromName.base > 0)) return null;
  const [small, big] = fromText.base < fromName.base ? [fromText, fromName] : [fromName, fromText];
  const ratio = big.base / small.base;
  const n = Math.round(ratio);
  if (n < 2 || Math.abs(ratio - n) > n * 0.02 || !statedCounts(name, url).has(n)) return null;
  return { ...small, base: big.base, count: n, text: big.text };
}

const COUNT_WORDS = 'ct|count|cnt|pk|pack|packs|packets?|pouch(?:es)?|cans?|bottles?|loaves|bars?|sticks|cups|pieces|pc|ea';
/** Every pack count a listing states in its name or its URL slug: "12pk", "4 ct", "Twin Pack", "-4count-". */
function statedCounts(name, url) {
  const out = new Set();
  const text = `${name || ''} ${String(url || '').replace(/^[^?#]*\/products\//, '').replace(/[?#].*$/, '')}`;
  for (const m of text.matchAll(new RegExp(`(?<![\\d.])(\\d{1,3})\\s*-?\\s*(?:${COUNT_WORDS})\\b`, 'gi'))) out.add(+m[1]);
  if (/\btwin[\s-]?pack\b|\btwo[\s-]?pack\b/i.test(text)) out.add(2);
  return out;
}

const SLUG_UNITS = {
  lb: 'lbs?|pounds?', lbs: 'lbs?|pounds?', pound: 'lbs?|pounds?', pounds: 'lbs?|pounds?',
  oz: 'oz|ounces?', ounce: 'oz|ounces?', ounces: 'oz|ounces?',
  g: 'g|grams?', gram: 'g|grams?', grams: 'g|grams?', kg: 'kg|kilograms?',
  floz: 'fl-oz|floz|fz|fluid-ounces?|oz', gal: 'gal|gallons?', gallon: 'gal|gallons?', qt: 'qt|quarts?', pt: 'pt|pints?',
  l: 'l|liters?|litres?', ml: 'ml',
};

/**
 * True when a retailer URL slug spells out this size: ".../18848374-sweet-potatoes-10-lbs-10-lb"
 * states 10 lb (and never 5 lb). Slugs write 3.5 lb as "3-5-lb" or, as often, "35-lb".
 */
export function slugStates(url, size, { beforeEnd = false } = {}) {
  const units = SLUG_UNITS[size?.unit];
  if (!url || !units || !(size.amount > 0)) return false;
  // A whole amount may carry a zero decimal: Plugra's slug is "...-extra-creamy-8-0-oz" (8.0 oz),
  // Cool Whip's "...-16-00-oz".
  const whole = Number.isInteger(+size.amount.toFixed(2));
  const amount = String(+size.amount.toFixed(2)).replace('.', '[-.]?') + (whole ? '(?:[-.]0{1,2})?' : '');
  const slug = String(url).replace(/^[^?#]*\/products?\//, '/').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const re = new RegExp(`(?<!\\d)(?<!\\d[-.])${amount}-?(?:${units})(?=$|[-/])`, 'gi');
  for (const m of slug.matchAll(re)) if (!beforeEnd || m.index + m[0].length < slug.length) return true;
  return false;
}

/**
 * Does the slug confirm this size independently of the stated size? Instacart appends the stated
 * size to every slug, so a size found only at the very END is the stated size repeating itself.
 * King Soopers' "2% Reduced Fat Milk Half Gallon", stated "2 gal" at $2.99, has the slug
 * ".../19280305-king-soopers-2-reduced-fat-milk-2-gal": read as confirmation, it made Denver's best
 * milk $1.50 a gallon (the nationwide audit). Costco's ".../sweet-potatoes-10-lbs-10-lb" still
 * confirms: the name part of the slug says 10 lbs too.
 */
export const slugConfirms = (url, size) => slugStates(url, size, { beforeEnd: true });

/**
 * The retailer's own URL says the price is per pound, but the stated size is a fixed weight.
 *
 * Smart & Final's "Table Carrots": stated "25 lb" at $2.19, slug ".../26519058-bulk-carrots-per-lb".
 * The $2.19 buys a pound; divided over the 25 lb case it made Phoenix's best carrots $0.09/lb (the
 * state x holiday audit), and a stated size is trusted down to 1/30 of the median, so the
 * plausibility guard let it through. The listing contradicts itself, so it keeps its price and
 * loses its unit price, like every size contradiction.
 */
const SLUG_PER_LB_RE = /-per-(?:lb|lbs|pound)(?=$|[-/?#])/i;
export function slugPerLbConflict(size, f, soldByLb) {
  if (soldByLb || !size || size.dim !== 'weight' || size.perWeight || !(size.base > 0)) return null;
  const slug = String(f.url || '').replace(/^[^?#]*\/products?\//, '/').replace(/[?#].*$/, '');
  if (!SLUG_PER_LB_RE.test(slug)) return null;
  if (Math.abs(size.base - 16) <= 0.32) return null; // stated 1 lb: the same thing said twice
  return { text: formatSize(size), name: 'priced per lb' };
}

/**
 * A turkey priced under an "each" label at less than a bird costs: the price buys a pound.
 *
 * Fred Meyer's "Butterball Fresh Bone-In Turkey Breast, All Natural, 3-9 lbs.": stated "6 lb", sold
 * "each", $2.99. The range says the piece is weighed at the till, the 6 lb is its middle, and the
 * $2.99 buys a pound; divided over 6 lb it was Portland's best turkey breast at $0.50/lb, "81% less
 * than the next-best store" (the Thanksgiving core list, 18 Nov 2026). The same shape in the QA
 * cache: Smith's "Jennie-O Whole Fresh Turkey (16-20 lb)" at $1.59 ($0.08/lb), Giant's Shady Brook
 * "24-26 Pound Frozen Turkey" at $0.49 ($0.02/lb), Martin's "Frozen Whole Turkey 16-20 lb" at $1.99.
 * No turkey of 3 lb or more sells whole for under TURKEY_EACH_MIN (wholeBirdEach's floor, for the
 * same reason), and a real each price stays: Harris Teeter's "Kroger Whole Frozen Turkey (14-16 lb)"
 * at $18.99. The row keeps its price and loses its unit price, like every size contradiction.
 *
 * The same listing under a name with no range won again the day that shipped: Dillons' "Butterball
 * All Natural Fresh Bone-In Turkey Breast" (Fred Meyer's product id), stated "6 lb" at $2.99, was
 * Wichita's best turkey breast at $0.50/lb. Cub's "Festive Frozen Turkey Breast" (4.5 lb, $1.99)
 * had won Minneapolis at $0.44/lb and Smart & Final's "Turkey Breast Random Cuts" (4 lb, $2.39)
 * Phoenix and Los Angeles at $0.60/lb since the 13-14 Nov runs. With no range to say the piece is
 * weighed, the price itself has to be one the kind never sells for: a whole bird that works out
 * under TURKEY_WHOLE_PACKAGE_LB_MIN a pound, a breast under TURKEY_BREAST_PACKAGE_LB_MIN. Every
 * such row in the QA cache is a price per pound (whole birds at 2-20c/lb, breasts at 25-60c/lb).
 * A real package price stands: Fry's "Kroger Frozen Whole Turkey", 14 lb at $9.66 (69c/lb), a 6 lb
 * breast at 99c/lb, ALDI's 3 lb ground turkey at $9.95. Parts and franks, which do sell near a
 * dollar a pound, are left to the store's own unit line (unitLineConflict).
 */
const TURKEY_BREAST_RE = /\bbreasts?\b/i;
const PET_AISLE_RE = /\b(?:dogs?|cats?|pets?|pupp(?:y|ies)|kittens?|kibble)\b/i;
// No whole turkey weighs under 4 lb (the smallest sold, Butterball's "Li'l", is about 7): Fairway's
// "Maplecrest 10-12 Natural Turkey" stated "18 oz" at $2.21 read $1.96/lb, and Weis's "Weis Young
// Turkey" stated "20 oz" at $10.39 was Weis's turkey at $8.31/lb (every cached answer re-scored, 20
// Nov 2026). The stated weight is not the bird's, so like every size contradiction the row keeps its
// price and loses its unit price. Not "1 lb": that is how a price per pound is listed (Stop & Shop's
// Shady Brook hen at $0.59, "1 lb", won three ZIPs at its real $0.59/lb), as slugPerLbConflict knows.
// The review of the rule: wholeTurkey() also says yes to "Whole Turkey Seasoning", gizzards in the
// Whole Turkey aisle and a "Whole Sub" (now refused there), so the floor also skips prepared, deli and
// spice aisles. "1.02 lb" is the 1 lb listing too (16.32 oz, a hair over 2% in floating point).
const NOT_A_BIRD_AISLE_RE = /\b(?:prepared|sandwich(?:es)?|wraps?|spices?|seasonings?|deli|lunch|meals?|rubs?|marinades?)\b/i;
export const TURKEY_WHOLE_MIN_OZ = 64;
export function turkeyPerLbConflict(name, size, nameSize, f, soldByLb) {
  if (!soldByLb && size?.dim === 'weight' && !size.perWeight && size.base > 0 && size.base < TURKEY_WHOLE_MIN_OZ && Math.abs(size.base - 16) > 0.33 && wholeTurkey(name, f.category) && !NOT_A_BIRD_AISLE_RE.test(f.category || '')) {
    return { text: formatSize(size), name: 'a whole turkey' };
  }
  if (soldByLb || !size || size.dim !== 'weight' || size.perWeight || !(size.base >= 48)) return null;
  if (!(f.price > 0) || f.price >= TURKEY_EACH_MIN || !/\bturkeys?\b/i.test(name)) return null;
  // To the cent, so a package at exactly the floor (12 lb at $4.44) is not under it.
  const perLb = Math.round((f.price / (size.base / 16)) * 100) / 100;
  const priced = nameSize?.range && nameSize.dim === 'weight' ? true
    : wholeTurkey(name, f.category) ? perLb < TURKEY_WHOLE_PACKAGE_LB_MIN
    : TURKEY_BREAST_RE.test(name) && !PET_AISLE_RE.test(`${name} ${f.category || ''}`) ? perLb < TURKEY_BREAST_PACKAGE_LB_MIN
    : false;
  return priced ? { text: formatSize(size), name: 'priced per lb' } : null;
}

/**
 * The retailer's own URL names a different product.
 *
 * King Soopers' "KRO TURKEY STUFFING MIX" came with a 20 oz size, $1.09, and the slug
 * ".../19275341-kroger-sugar-cinnamon-mini-pretzel-20-oz": a pretzel bag's listing under a stuffing
 * name. At $0.87/lb it was Denver's best stuffing (QA, 9 Nov 2026). Whole Foods' "Mary's Turkey ...
 * Turkey Bone-In Breast" carried ".../green-chile-chicken-sausage-bulk-1-lb" and its "Plainville
 * Farms Bone-In Turkey Breast" ".../chicken-leg-quarters-package-1-lb". When not one word of the
 * name (4+ letters, not a unit) appears in the slug, the price and size may belong to the other
 * product, so the row is recorded as a contradiction like every other and never crowned. A word
 * matches when one is a prefix of the other, they share 5 letters, or its letters appear in order
 * in the other ("chkn" in "chicken"), so store abbreviations still agree with their slugs. Across
 * 1,981 captured rows this flags the 4 mix-ups above and 3 renames (Whole Foods' "Heirloom Pumpkin"
 * as "autumn-couleur-bin", "Orange Sweet Potatoes" as "yams-jewel"), which only lose the crown.
 */
const SLUG_UNIT_WORDS = new Set(['each', 'count', 'pack', 'liter', 'litre']);
// Accents are folded, not split: "País" is "pais", as in the slug (and as the iPhone reads it).
const slugWords = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4 && !/\d/.test(w) && !SLUG_UNIT_WORDS.has(w));
const inOrder = (a, b) => { if (a[0] !== b[0]) return false; let i = 0; for (const c of b) if (c === a[i]) i += 1; return i === a.length; };
const sharedHead = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i += 1; return i >= 5; };
const sameWord = (a, b) => a.startsWith(b) || b.startsWith(a) || sharedHead(a, b) || inOrder(a, b) || inOrder(b, a);
// A slug that is only a house brand and label words names no product, so it cannot name another
// one. ALDI's Instacart listing "ALDI Evaporated Milk" (12 fl oz, 79-95¢) carries
// ".../18647623-baker-s-corner-vitamin-d-added-12-fl-oz": no word in common with the name, so it was
// flagged and dropped in 8 of the 13 states with an ALDI in the Thanksgiving core runs (13-15 Nov 2026), leaving organic
// cans at $2.88. ALDI renames its house brands "ALDI <product>" and the slug keeps the brand.
const SLUG_HOUSE_BRAND_RE = /^(?:baker s corner|bakers corner|countryside creamery|friendly farms|happy harvest|chef s cupboard|simply nature|specially selected|southern grove|lunch buddies|sweet harvest|bake shop|bakers treat|belmont|livegfree|millville|reggano|stonemill|kirkwood|never any|park street deli|season s choice|l oven fresh|earth grown|appleton farms|nature s nectar|carlini|savoritz|clancy s|barissimo|benton s|sundae shoppe|casa mamita|priano|mama cozzi s)\b/;
const SLUG_LABEL_WORDS = new Set(['vitamin', 'added', 'fortified', 'enriched', 'organic', 'natural', 'original', 'classic', 'premium', 'pure', 'fresh', 'reduced', 'free', 'light', 'lite', 'whole', 'grade', 'family', 'size', 'value']);
const slugNamesNoProduct = (slugText) => {
  const rest = slugText.toLowerCase().replace(SLUG_HOUSE_BRAND_RE, '');
  return rest !== slugText.toLowerCase() && slugWords(rest).every((w) => SLUG_LABEL_WORDS.has(w));
};
const SLUG_SAME_THING = [[/\bsweet potato(?:es)?\b/, /\byams?\b/], [/\bcrusts?\b/, /\bshells?\b/]];
export function slugProductConflict(name, url) {
  const m = String(url || '').match(/\/products\/\d+-([^?#/]+)/);
  if (!m) return null;
  if (slugNamesNoProduct(m[1].replace(/-/g, ' '))) return null;
  const slug = slugWords(m[1].replace(/-/g, ' '));
  const own = slugWords(name);
  if (slug.length < 2 || own.length < 2 || own.some((a) => slug.some((b) => sameWord(a, b)))) return null;
  // The same thing in the trade's other word: Sprouts' "Orange Sweet Potatoes" is ".../yams-jewel"
  // (set aside in 14 ZIPs) and Grocery Outlet's pie crusts are "...-pie-shell" (19 Nov 2026).
  if (SLUG_SAME_THING.some(([a, b]) => (a.test(own.join(' ')) && b.test(slug.join(' '))) || (b.test(own.join(' ')) && a.test(slug.join(' '))))) return null;
  return { text: m[1].replace(/-/g, ' '), name: 'listing names another product' };
}

/**
 * Pack count stated only in the retailer's URL slug.
 *
 * Sam's Club lists "Kerrygold Salted Irish Butter Sticks" with a sizeText of "4 oz" — the size of
 * one stick — at the case price of $14.60. Neither the name nor the stated size mentions a pack,
 * so pickSize had nothing to work with and the app published $58.40/lb for butter that is really
 * $9.73/lb: exactly 6x too high, and dear enough to make Costco look "87% less" when the real gap
 * is 23%. The 8x plausibility guard does not catch a 6x error. The product URL says it plainly:
 * .../76160768-kerrygold-salted-butter-sticks-4-oz-6-pk. Same shape on "Bruce's Yams Cut Sweet
 * Potatoes In Syrup", sizeText "29 oz" at $11.02, slug .../26039678-...-in-syrup-4-ct.
 */
function packFromUrl(url) {
  const m = String(url || '').match(/-(\d{1,2})-(?:pk|pack|ct|count|cnt)(?=$|[-?/#])/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return n > 1 && n <= 60 ? n : null;
}

/**
 * Multiply a one-unit size by a pack count found only in the URL.
 *
 * Deliberately narrow, because getting this wrong inflates a SIZE, which is a wrong price with no
 * outlier to catch it. A bare pack count in the slug is not enough on its own: across the four-ZIP
 * Thanksgiving sweep, 115 listings had one, and in most the stated size was already the pack total
 * ("Hawaiian Dinner Rolls", slug "...-12-ct", sizeText "16 oz" for the whole bag). Multiplying
 * those would have been catastrophic.
 *
 * So we require the slug to spell out the measurement and the count TOGETHER — literally
 * "...-4-oz-6-pk" — which is the retailer stating "six of these four-ounce units". That pattern
 * matched 4 of those 115 listings and was right on all four (Kirkland sliced turkey 2 x 20 oz,
 * Member's Mark mac and cheese 4 x 10 oz, a 6 x 16 fl oz kombucha and a 15 x 18 fl oz Bai case).
 * Where the slug is less explicit we leave the size alone: a missed pack shows a price that is too
 * dear, which is recoverable, while an invented one shows a price that is too cheap and wins.
 */
function applyUrlPack(size, { url }) {
  if (!size || size.count > 1 || size.perWeight) return size;
  if (size.dim !== 'weight' && size.dim !== 'volume') return size;
  const pack = packFromUrl(url);
  if (!pack || !(size.base > 0) || size.amount == null) return size;
  const amount = String(+size.amount.toFixed(2)).replace(/\.0+$/, '').replace('.', '[-.]');
  const together = new RegExp(`(?<![\\d.])${amount}-(?:fl-)?(?:oz|lb|g|ml|l)-${pack}-(?:pk|pack|ct|count|cnt)(?=$|[-?/#])`, 'i');
  if (!together.test(String(url || ''))) return size;
  return { ...size, base: Math.round(size.base * pack * 10000) / 10000, count: pack, packFromUrl: true };
}

/**
 * The name counts N pieces or packs ("Chomps Original Turkey Chomplings Mini Sticks - 6 Count"),
 * the stated size is one weight or volume ("0.5 oz"), and nothing says whether that size is one
 * piece or all of them. Read as all of them, ALDI's six sticks were 0.083 oz each and $223.68/lb,
 * beside Costco's identical sticks at $31.33/lb in the same results; the truth is $37.28/lb. Read
 * as one piece, the same rule would turn a 70-piece bag of 19.49 oz minis into 85 lb of candy.
 *
 * Measured on every captured listing of this shape (100 across 14 stores, each classified by hand
 * against its price and URL): when the stated size divided by the count is under 0.25 oz a piece
 * (2.5 fl oz for a liquid), it was a per-piece size in all 15 food cases — Chomps at ALDI, Mariano's
 * and Pick 'n Save, yeast packets, raisin boxes, trail-mix packs, Gamesa cookies, Nissin cups,
 * Handi-Snacks, Special K crisps, Summit's 12-pack, 2 Towns' 6-pack, LALA, Angry Orchard, Apple &
 * Eve — and a whole-package size in none (the smallest genuine whole-package pieces were Mars
 * minis at 0.28 oz and paper plates at 0.24 oz). We still do not multiply: a wrong multiplication
 * is a price too CHEAP, and it wins. We record the disagreement, which withholds the unit price
 * (see below) and keeps the row off the headline.
 */
function countOnlyConflict(size, chosen, textSize, nameSize) {
  if (!size || !textSize || chosen !== textSize || !nameSize || nameSize.dim !== 'count') return null;
  if (textSize.count > 1 || textSize.perWeight || (textSize.dim !== 'weight' && textSize.dim !== 'volume')) return null;
  const n = nameSize.base;
  if (!(n >= 2) || !(textSize.base > 0)) return null;
  const perPiece = textSize.base / n;
  const floor = size.dim === 'volume' ? 2.5 : 0.25;
  return perPiece < floor ? { text: formatSize(textSize), name: formatSize(nameSize) } : null;
}

/**
 * Butter sold by the stick, with the stick count as its only stated size.
 *
 * Jewel-Osco's cheapest butter in the owner's own store check was "Lucerne Salted Butter" at $4.99
 * (reg $6.99), stated "4 each": four sticks, which Jewel's own app sells as "Lucerne Butter Salted
 * Sweet Cream - 16 Oz". A count cannot be priced per pound, so the box silently dropped out of the
 * butter comparison and Jewel's "best" became a $7.99 pound of Land O Lakes — the store shown
 * dearer than its own shelf, with its cheapest item nowhere in the comparison.
 *
 * The weight is recovered only with two witnesses that agree:
 *   1. the US butter stick is a quarter pound (4 oz); a half stick says "half" on the box;
 *   2. the retailer's URL slug states a weight, and every weight it states fits N quarter-pound
 *      sticks — as the whole box (4N oz: Lucerne's "...-sweet-cream-salted-16-oz" over "4 each")
 *      or as one stick (4 oz: Kerrygold's "...-irish-butter-sticks-4-oz" over "4 ct").
 * Either way the box is N x 4 oz. A slug that states no weight ("...-unsalted-4-ea", Lucerne's own
 * unsalted box), or any weight that fits neither reading ("half-sticks-1-lb" over 8 ct), settles
 * nothing.
 * A name that counts anything but sticks is refused outright: Land O Lakes "Butter, Salted,
 * 2-Pack" is stated "4 ct" with a "...-1-lb" slug, which fits the rule, but Instacart's own per-
 * ounce price ($9.99 at $0.31/oz) says the pack is 2 lb.
 *
 * Measured over every captured listing in the Salted/Unsalted Butter categories whose size is a
 * count (26 distinct products, round 1's sweep plus round 2's): the rule fires on 12 — Lucerne
 * salted, Kerrygold unsalted sticks, Horizon salted and unsalted, Crystal Farms salted (8 oz) and
 * unsalted (16 oz), Danish Creamery x2 (8 oz), Grassland "butter quarters", Organic Valley (8 oz),
 * Plugra (8 oz), Essential Everyday unsalted — and every recovered weight is the one on the box as
 * the brand sells it (Jewel's own app: Lucerne "16 Oz"; Kerrygold's sticks, which Instacart states
 * elsewhere as "4 x 4 oz"). It abstains on 14, among them the three a stick-count rule alone would
 * have got wrong: the Land O Lakes 2-Pack (2 lb), Member's Mark "4 ct" (four 1 lb boxes) and Land
 * O Lakes Half Sticks (8 x 2 oz). Measured error rate where it fires: 0 of 12.
 * Where it abstains the box is still listed, and the comparison says a cheaper item was left out
 * (excludedCheaper in shared/compare.js) instead of pretending it is not there.
 */
const BUTTER_CATEGORY_RE = /^(?:salted|unsalted) butter$/i;
const NOT_JUST_STICKS_RE = /\b(?:half|pack|packs|pk|twin|family|value|bulk|case|foil|block|roll|tub|bar|brick|whipped|spread|pats?|minis?|cups?)\b|\d\s*-?\s*(?:ct|count|pk|pack)\b/i;
// A whole bird by its aisle or its name (not a breast, a part or a dish: see TURKEY_PART_RE in
// shared/match.js). Used to refuse a per-bird price for a turkey sold "1 ea" with no weight.
const WHOLE_BIRD_CAT_RE = /\bwhole turkeys?\b/i;
const WHOLE_BIRD_NAME_RE = /\b(?:whole|young|hen|tom)\b.*\bturkey\b|\bturkey\b.*\b(?:whole|young|hen|tom)\b/i;
const BIRD_PART_RE = /\b(?:breasts?|ground|wings?|legs?|drumsticks?|thighs?|necks?|deli|sliced|bacon|sausages?|burgers?)\b/i;
export function wholeBirdEach(name, category) {
  if (!/\bturkey\b/i.test(name || '') || BIRD_PART_RE.test(name || '')) return false;
  return WHOLE_BIRD_CAT_RE.test(category || '') || WHOLE_BIRD_NAME_RE.test(name || '');
}

// At a warehouse club "N ct" counts boxes, not sticks: BJ's "Wellsley Farms All Natural Salted Butter",
// "4 ct" at $11.49 under ".../salted-butter-1lb", is four 1 lb boxes ($2.87/lb), not four sticks (a
// pound of store-brand butter at $11.49, beside the same store's Kerrygold at $9.73/lb), in all 13 BJ's
// ZIPs of the QA cache; its "Unsalted Butter Quarters" the same (every cached answer re-scored, 20 Nov
// 2026). A club's slug weight of a pound or more is one box; a quarter-pound one is one stick, which
// is the same N x 4 oz the stick rule gives; anything else settles nothing there.
const CLUB_BUTTER_BOXES_MAX = 6;
export function butterSticks(size, { name = '', category = '', url = '', club = false } = {}) {
  if (!size || size.dim !== 'count' || size.perWeight || !BUTTER_CATEGORY_RE.test(String(category || '').trim())) return null;
  const n = size.base;
  if (!Number.isInteger(n) || n < 2 || n > 8 || NOT_JUST_STICKS_RE.test(name)) return null;
  // Every weight the slug states must be one of the two readings; one it cannot explain ("1-lb"
  // over eight half sticks) means the sticks are not quarter pounds, and nothing is recovered.
  const weights = slugWeightsOz(url);
  if (club) {
    const [w] = weights;
    if (!weights.length || !weights.every((x) => Math.abs(x - w) <= 0.02 * w)) return null;
    if (w >= 15.5 && n <= CLUB_BUTTER_BOXES_MAX) return { dim: 'weight', base: n * w, amount: w, unit: 'oz', count: n, perWeight: false, range: false, text: `${n} × ${formatSize({ amount: w, unit: 'oz' })}`, clubBoxes: n };
    if (Math.abs(w - 4) > 0.08) return null;
  }
  const fits = (w) => Math.abs(w - 4 * n) <= 0.02 * 4 * n || Math.abs(w - 4) <= 0.08;
  if (!weights.length || !weights.every(fits)) return null;
  return { dim: 'weight', base: 4 * n, amount: 4 * n, unit: 'oz', count: 1, perWeight: false, range: false, text: `${n} sticks`, sticks: n };
}

/**
 * The other dimension, from the retailer's own URL slug.
 *
 * A product keeps the one size its listing states, and a comparison is in one dimension, so a row
 * stated in the other was simply left out, however cheap: Walmart's "Great Value 2 Pack 9 Inch Deep
 * Dish Pie Crusts", stated "2 ct" at $1.36 under ".../great-value-deep-dish-pie-crusts-16-oz", and
 * ALDI's "Bake House Creations Pie Crusts - 2 Count" at $1.88 (".../pie-crust-14-1-oz") were missing
 * from pie crust, an answer by weight, in 26 of 32 ZIPs, and a dearer store was shown as the
 * cheapest. Dinner rolls the other way round: Walmart's brown-and-serve dozen, stated "12 oz" at
 * $1.05 (".../dinner-rolls-12-ct"), had no price per roll where rolls are compared by count.
 *
 * The slug's figure becomes a second unit price, in the other dimension only, marked `slug` so that:
 *   - it never decides which dimension an answer is in (dominantDim skips it), only lets the row be
 *     priced in the one the stated sizes chose, and the dimension picker does not offer a dimension
 *     only slug figures fill;
 *   - the plausibility guard judges it harder than a stated size, in every dimension, count included
 *     (flagImplausible, SLUG_LOW): a misread slug is ten times out, not two;
 *   - it is an estimate: shown "est.", and a claim made on it names no exact percentage, because
 *     the weight is the catalogue's, not the store's (Walmart's crusts may be 12 oz, not 16);
 *   - the size the shopper sees says where it came from ("2 ct · 16 oz").
 * Measured over the 1,107 cached answers (20 Nov 2026): 36 pie crust and 8 dinner roll answers
 * change store, no answer changes dimension. Walmart's two-pack ($1.24-$1.36) or ALDI's ($1.88)
 * leads pie crust where the store has one, Costco's 8-count (56.4 oz, $8.70) in four western ZIPs.
 * Narrow on purpose, because a size too big is a price too cheap, and that wins. The review of this
 * change (four reviewers over every cached row, 20 Nov 2026) found each of these misreads:
 *   - the product id is not part of the slug's words: Lunds & Byerlys' ".../57858643-l-b-brioche-
 *     dinner-rolls-8-ct" read "8 ct · 57858643 L", and a measure starts at a hyphen, so a Whole Foods
 *     ASIN ("...-3ct-b0fd3mlq6l") is not "6 L";
 *   - slugs drop decimal points: "...-214-oz" is Ghirardelli's 21.4 oz bag and "...-15-lb" Meijer's
 *     1.5 lb of brown sugar, so whole ounces of three digits and whole pounds over 12 settle nothing,
 *     and a pound written with a decimal ("3-5-lb") may be 3.5 lb or a 3-5 lb range;
 *   - every weight or volume in the slug must agree (2%), and none may be "up to", "about" or a
 *     price per pound (".../up-to-19-pound-large-pumpkins-each", "...-priced-per-pound-2232lb");
 *   - a count is a piece word (ct, count, ea), never a pack, a range ("31-to-40-count" shrimp,
 *     "16-20-ct") or a decimal ("...-apple-pie-3-50-ct"), and at least 2; an "-each" that restates
 *     the row's ounces ("...-heavy-16-each" on a pint of cream) is not pieces;
 *   - the row's own figures win: a count in its name or size line that differs from the slug's
 *     (Meijer's "French Dinner Rolls 10 ct" under "...-8-ct"), a weight in its name that differs,
 *     a size line that already names a measure ("8 pack, /15 oz"), or a weight written just before
 *     the row's own count ("...-15-oz-6-ct" on "6 ct": the weight is one piece's);
 *   - not for a turkey (weighed at the till), loose produce (a slug's "1 lb" on one onion is the
 *     catalogue's price per pound), a row sold by the pound, a row whose size came
 *     from butter sticks or a club's boxes, or a row whose own figures disagree (sizeConflict).
 */
const SLUG_MEASURE_RE = /(?<=[-/])(?<!\d-)(\d+)(?:-(\d{1,3}))?-?(fl-oz|floz|oz|ounces?|lbs?|pounds?|g|grams?|kg|gal|gallons?|qt|quarts?|pt|pints?|ml|l|liters?|litres?)(?=$|[-/])/gi;
const SLUG_MEASURE_UNIT = { 'fl-oz': 'fl oz', floz: 'fl oz', ounce: 'oz', ounces: 'oz', lbs: 'lb', pound: 'lb', pounds: 'lb', gram: 'g', grams: 'g', gallon: 'gal', gallons: 'gal', quart: 'qt', quarts: 'qt', pint: 'pt', pints: 'pt', liter: 'l', liters: 'l', litre: 'l', litres: 'l' };
const SLUG_PIECES_RE = /(?<=-)(?<!\d-)(?<!-to-)(\d{1,3})-(ct|count|cnt|ea|each)(?=$|[-/])/gi;
const SLUG_APPROX_RE = /(?:^|[-/])(?:up-to|upto|about|approx|approximately|avg|average)-\d+(?:-\d{1,3})?-?(?:fl-oz|floz|oz|ounces?|lbs?|pounds?|g|grams?|kg|gal|gallons?|qt|quarts?|pt|pints?|ml|l|liters?|litres?)(?=$|[-/])/i;
const SLUG_PACK_RE = /-(?:pk|pks|pack|packs|case|cases|box-of)(?=$|[-/])/;
const SLUG_PRICED_PER_RE = /(?:^|-)priced-per(?=-)/;
const SLUG_LB_MAX = 12;
// The slug's words, without the product id that starts them.
const slugPath = (url) => String(url || '').replace(/^[^?#]*\/products?\//, '/').replace(/[?#].*$/, '').replace(/^\/\d+(?=-)/, '/');
export function slugMeasure(url, name = '', category = '') {
  const found = [];
  const path = slugPath(url);
  if (SLUG_APPROX_RE.test(path)) return null;
  for (const m of path.matchAll(SLUG_MEASURE_RE)) {
    const unit = SLUG_MEASURE_UNIT[m[3].toLowerCase()] || m[3].toLowerCase();
    if (unit === 'lb' && (m[2] != null || +m[1] > SLUG_LB_MAX)) return null;
    if ((unit === 'oz' || unit === 'fl oz') && m[2] == null && m[1].length >= 3) return null;
    const s = parseSize(`${m[2] != null ? `${m[1]}.${m[2]}` : m[1]} ${unit}`);
    if (!s || !(s.base > 0) || (s.dim !== 'weight' && s.dim !== 'volume')) return null;
    found.push(coerceLiquid(s, `${name} ${category || ''}`, name));
  }
  if (!found.length) return null;
  const [first] = found;
  return found.every((s) => s.dim === first.dim && Math.abs(s.base - first.base) <= 0.02 * first.base) ? first : null;
}
export function slugPieces(url) {
  const path = slugPath(url);
  if (SLUG_PACK_RE.test(path)) return null;
  const counts = new Set([...path.matchAll(SLUG_PIECES_RE)].map((m) => +m[1]));
  const [n] = counts;
  return counts.size === 1 && n >= 2 ? n : null;
}
const countOf = (s) => (!s ? null : s.dim === 'count' ? s.base : s.countFirst?.n ?? s.countAfter?.n ?? (s.count > 1 ? s.count : null));
export function otherDimFromSlug(size, f, name, { soldByLb, sizeConflict, textSize, nameSize } = {}) {
  if (soldByLb || sizeConflict || !size || size.perWeight || !(size.base > 0) || !f.url) return null;
  if (size.sticks || size.clubBoxes || size.clubSlugPack) return null;
  if (/\bturkeys?\b/i.test(name) || produceWeightLb(name)) return null;
  const path = slugPath(f.url);
  if (SLUG_PER_LB_RE.test(path) || SLUG_PRICED_PER_RE.test(path)) return null;
  if (size.dim === 'count') {
    const m = slugMeasure(f.url, name, f.category);
    if (!m) return null;
    if (nameSize && nameSize.dim === m.dim && !nameSize.perWeight && nameSize.base > 0 && Math.abs(nameSize.base - m.base) > 0.02 * m.base) return null;
    if (/\d\s*(?:oz|ounces?|lbs?|pounds?|g|kg|ml|l|liters?|fl\.?\s*oz)\b/i.test(f.sizeText || '')) return null;
    // A weight written just before the row's own count is one unit's ("...-15-oz-6-ct" on "6 ct", as
    // applyUrlPack reads "...-4-oz-6-pk"); a count before the weight is the total ("...-8-count-56-400-oz").
    if (size.base > 1 && new RegExp(`(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|fl-oz|floz)-${size.base}-(?:ct|count|cnt|ea|each|pk|pks|pack|packs)(?=$|[-/])`, 'i').test(path)) return null;
    return { dim: m.dim, base: m.base, size: m };
  }
  // A bag of celery hearts is one package (CELERY_HEARTS_RE): its "2-ct" counts hearts, not bunches.
  if (CELERY_HEARTS_RE.test(name)) return null;
  const n = slugPieces(f.url);
  if (!n || n === size.count) return null;
  if ([countOf(textSize), countOf(nameSize)].some((c) => c > 1 && c !== n)) return null;
  if (new RegExp(`-${n}-(?:ea|each)(?=$|[-/])`, 'i').test(path) && (Math.abs(n - size.base) < 0.01 || Math.abs(n - (size.amount ?? -1)) < 0.01)) return null;
  return { dim: 'count', base: n, size: { dim: 'count', base: n, amount: n, unit: 'ct', count: 1 } };
}

/**
 * A bag of celery hearts is one package, however many hearts its listing counts.
 *
 * Celery is compared by the bunch where most stores sell it each, and a count counts bunches. BJ's
 * "Foxy Organic Celery Hearts", stated "4 each" at $2.59, was priced at $0.65 a heart and won celery
 * in Hartford, Queens, Atlanta and Miami, "59% less" than C-Town's $1.59 bunch; ALDI sells one bag
 * of the same hearts at $2.59. Sprouts' and Key Food's "2 ct" bags were priced per heart the same
 * way, ALDI's and Walmart's "1 each" bags per bag. A bag of trimmed hearts is about a pound, a bunch
 * a pound or two: as one package each, they compare as a shopper buys them.
 */
const CELERY_HEARTS_RE = /\bcelery\s+hearts?\b/i;

/**
 * A warehouse club's butter, stated as one pack under a slug that weighs a whole number of them.
 *
 * Sam's lists "Member's Mark Salted Sweet Cream Butter Sticks" as "16 oz" at $11.88 under
 * ".../member-s-mark-salted-sweet-cream-butter-sticks-4-lb": four pounds at $2.97/lb, read as one at
 * $11.88, so Sam's real butter never ranked in any of its 25 ZIPs (a tater-tot "butter" or Kerrygold
 * stood for it). BJ's states one box or one stick the same way: Wellsley Farms organic "16 oz" under
 * "...-2-lb", Land O Lakes "1 lb" under a 3 lb slug, Kerrygold "4 oz" under "...-24-oz". Only in a
 * butter aisle at a club: elsewhere a slug that drops the decimal point ("...-squares-214-oz" for
 * Ghirardelli's 21.4 oz bag, "...-57-18-oz" read as 571 oz) would make the price ten times too cheap.
 * Every butter row of this shape in the cache is one of those four, and every price it gives is a
 * club's butter price ($2.97 to $11.46/lb). Measured 20 Nov 2026.
 */
export function clubButterPack(size, f) {
  if (!size || size.dim !== 'weight' || size.perWeight || size.count > 1 || !(size.base > 0)) return null;
  if (!BUTTER_CATEGORY_RE.test(String(f.category || '').trim())) return null;
  const weights = slugWeightsOz(f.url);
  const [w] = weights;
  if (!weights.length || !weights.every((x) => Math.abs(x - w) <= 0.02 * w)) return null;
  const n = Math.round(w / size.base);
  if (n < 2 || n > 12 || Math.abs(w / size.base - n) > 0.02 * n) return null;
  return { ...size, base: Math.round(n * size.base * 10000) / 10000, count: n, clubSlugPack: true };
}

const SLUG_WEIGHT_RE = /(?<!\d)(?<!\d-)(\d+)(?:-(\d{1,2}))?-?(oz|ounces?|lbs?|pounds?|g|grams?|kg)(?=$|[-/])/gi;
const SLUG_OZ = { oz: 1, ounce: 1, ounces: 1, lb: 16, lbs: 16, pound: 16, pounds: 16, g: 0.03527396, gram: 0.03527396, grams: 0.03527396, kg: 35.27396 };
/** Every weight a retailer's URL slug states, in ounces: "...-salted-16-oz" -> [16], "...-8-0-oz" -> [8]. */
export function slugWeightsOz(url) {
  const slug = String(url || '').replace(/^[^?#]*\/products?\//, '/').replace(/[?#].*$/, '');
  const out = [];
  for (const m of slug.matchAll(SLUG_WEIGHT_RE)) out.push(+(m[2] != null ? `${m[1]}.${m[2]}` : m[1]) * SLUG_OZ[m[3].toLowerCase()]);
  return out;
}

/**
 * Instacart states a pack's structure in its own unit line ("pricingUnitString"): "4 x 14.5 oz"
 * beside a size of "14.5 oz" means the price buys four cans. We used to price such a listing from
 * the one can, so Del Monte's "4 Can Value Pack" of green beans at $6.99 read $7.71/lb instead of
 * $1.93, Campbell's four-pack of cream of mushroom read four times its price, Swanson's four
 * cartons of broth likewise — basket staples at Instacart-priced chains (Jewel, Mariano's, Meijer,
 * Pick 'n Save...), every one of them shown four to twelve times dearer than it is. 344 of the
 * 20,605 Instacart listings in round 1's capture carry such a line over a size we had priced as one
 * unit.
 *
 * The line is not always right, and when it is wrong it is wrong in the direction that WINS:
 * "Farmer's Market Mini Cucumbers" (a 14 oz bag of six, slug "...-6-ct") is stated "6 x 14 oz";
 * Zaro's dinner rolls "9 x 13 oz"; Goya's single 16 oz panela "12 x 16 oz" (the wholesaler's case);
 * a $2.49 bottle of Mr. Pure juice "12 x 16 fl oz". Multiplied, each of those would be a price four
 * to twelve times too CHEAP. So the count is used only when the listing names the same number of
 * PACKAGES itself — a pack or container word in the name or slug ("4 Can Value Pack", "12 Pack",
 * "4pk", "6 cans", "Twin Pack"), never a piece count ("6 ct" counts cucumbers). All 35 such
 * listings in the capture were checked by hand and are right.
 *
 * Otherwise the listing contradicts itself — its size says one can, its own unit line says four —
 * and like any size contradiction it is recorded (sizeConflict) and the unit price withheld: the
 * package price is still shown, and the item still counts as a cheaper one left out of the
 * comparison (excludedCheaper), but no per-pound figure is printed from either reading.
 */
const PACK_TEXT_RE = /^\s*(\d{1,3})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lbs?|g|kg|ml|l)\s*$/i;
const PACKAGE_WORDS = 'pk|pks|pack|packs|cans?|bottles?|pouch(?:es)?|boxes|cartons?|jars|tubs|cups';
function statedPackages(name, url) {
  const slug = String(url || '').replace(/^[^?#]*\/products?\//, '').replace(/[?#].*$/, '').replace(/-/g, ' ');
  const text = `${name || ''} ${slug}`;
  const out = new Set();
  for (const m of text.matchAll(new RegExp(`(?<![\\d.])(\\d{1,3})\\s*-?\\s*(?:${PACKAGE_WORDS})\\b`, 'gi'))) out.add(+m[1]);
  if (/\btwin[\s-]?pack\b|\btwo[\s-]?pack\b/i.test(text)) out.add(2);
  return out;
}
export function listingPack(size, packText, { name = '', url = '' } = {}) {
  const m = PACK_TEXT_RE.exec(String(packText || ''));
  if (!m || !size || size.perWeight || size.count > 1 || (size.dim !== 'weight' && size.dim !== 'volume') || !(size.base > 0)) return null;
  const n = +m[1];
  const unit = parseSize(`${m[2]} ${m[3]}`);
  if (!(n >= 2) || !unit || unit.dim !== size.dim || Math.abs(unit.base - size.base) > 0.02 * size.base) return null;
  if (statedPackages(name, url).has(n)) return { size: { ...size, base: Math.round(n * size.base * 10000) / 10000, count: n, packFromListing: true } };
  return { conflict: { text: formatSize(size), name: `${n} × ${formatSize(size)}` } };
}

/**
 * A package price that is really a price PER POUND, caught by the retailer's own unit line.
 *
 * Round-3 price check, Piggly Wiggly (order.shopthepig.com) at 53142: "Certified Angus Beef 80%
 * Ground Chuck Beef", size "10 lb", $7.99, and Instacart's own line under it "$0.50/oz" — $7.99 buys
 * ONE pound. Divided by the stated 10 lb it was 80c/lb and took Kenosha's and Milwaukee's ground-beef
 * headline "81% less than the next-best store". Cady Creek cheddar "5 lb" at $8.99, "$0.56/oz": the
 * same. It is how a store that prices meat and cheese by the pound reads when the feed says "each".
 *
 * Measured twice over fresh listings at 53142 (16 stores, 14 staples; 5,834 then 3,782 rows). The
 * line is NOT a reliable size on its own: on a sale it is often the regular price over the size, with
 * no regular price sent (Mariano's Land O Lakes, 1 lb at $3.99 with "$0.50/oz"; Butternut bread 20 oz
 * at $2.99 with "$0.25/oz"); on a warehouse pack it is one unit (Costco "Uncle Matt's ..., 52 oz,
 * 2-count"); on counts it is arbitrary; and some lines are wrong the other way (Sargento 7.5 oz at
 * $4.49, "$0.07/oz"). Every row that implied a smaller package for any of those reasons implied some
 * other amount; every Piggly Wiggly row, and only those, implied exactly one pound (15.98 to 16.19 oz)
 * against a stated 3, 5 or 10 lb. So the rule is that shape and no wider: a weight of 1.5 lb or more
 * whose own line says the price buys one pound, +/-3% for rounding the line to the cent. The row then
 * keeps its package price and loses its unit price (sizeConflict), like every size contradiction.
 *
 * `f.listedUnit` is { price, unit } from the adapter (the line as printed: "$0.50/oz", "$7.99/lb").
 */
const LISTED_WEIGHT = { oz: 1, lb: 16, lbs: 16 };
export function unitLineConflict(size, f) {
  const lu = f.listedUnit;
  const per = lu && LISTED_WEIGHT[String(lu.unit || '').toLowerCase().replace(/\.$/, '').trim()];
  if (!per || !(lu.price > 0) || !(f.price > 0) || !size || size.perWeight || size.dim !== 'weight' || !(size.base >= 24)) return null;
  const implied = (f.price / lu.price) * per;
  if (Math.abs(implied - 16) > 16 * 0.03) return null;
  return { text: formatSize(size), name: `1 lb (the listing's own ${'$'}${lu.price}/${lu.unit})` };
}

const BREAD_PIECES_RE = /\b(?:rolls|buns|biscuits|croissants|bagels)\b/i;
// Rolls that are not bread (paper, foil, egg and spring rolls, sushi, cabbage, fruit rolls), rolls
// sold loose, and a meal that comes with rolls.
const NOT_BREAD_PIECES_RE = /\b(?:paper|towels?|toilet|tissue|bath|tape|foil|wrap|film|plastic|egg|spring|sushi|cabbage|fruit|bulk|loose|single|dinner with|meals?|sides|sandwich(?:es)?|lobster)\b/i;
const ROLL_BAG_MIN_PRICE = 2;
const ROLL_GOODS_RE = /\b(?:alumin(?:i)?um foil|foil|plastic wrap|cling wrap|wax(?:ed)? paper|parchment(?: paper)?|freezer paper|butcher paper)\b/i;
const NOT_A_ROLL_RE = /\b(?:pans?|trays?|roasters?|containers?|lids?|liners?|bags?|sheets?|cups?|plates?|tins?|dish(?:es)?|board|foilware|racks?|burners?|tape|ducts?)\b/i;
const LENGTH_OR_AREA_RE = /\d+(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|square\s+f(?:ee|oo)t|ft\.?|feet|foot|yds?\.?|yards?)(?![a-z])|\d+(?:\.\d+)?\s*['\u2019]\s*L\b/i;

export function makeProduct(f) {
  const name = String(f.name || '').replace(/\s+/g, ' ').trim();
  const textSize = parseSize(f.sizeText);
  const nameSize = sizeFromName(name);
  const chosen = pickSize(textSize, nameSize, { name, url: f.url, club: WAREHOUSE_CLUBS.has(f.storeId) });
  let size = applyUrlPack(chosen, f);
  // Four sticks of butter are a pound only when the retailer's slug says so too (butterSticks).
  const club = WAREHOUSE_CLUBS.has(f.storeId);
  const sticks = butterSticks(size, { name, category: f.category, url: f.url, club });
  if (sticks) size = sticks;
  // A club's butter stated as one pack under a slug that weighs several (clubButterPack).
  const clubPack = club ? clubButterPack(size, f) : null;
  if (clubPack) size = clubPack;
  // Instacart's own unit line may say the price buys several of this size (listingPack).
  const listed = listingPack(size, f.packText, { name, url: f.url });
  if (listed?.size) size = listed.size;
  size = coerceLiquid(size, `${name} ${f.category || ''}`, name);
  size = coerceSolid(size, `${name} ${f.category || ''}`, name);
  if (size?.dim === 'count' && !size.perWeight && size.base > 1 && CELERY_HEARTS_RE.test(name)) size = { ...size, base: 1, amount: 1, count: 1, heartsPack: size.text || formatSize(size) };

  // The product's own name and its stated size sometimes contradict each other outright: Costco
  // lists "Sweet Potatoes, 5 lbs" with a sizeText of "10 lb", and the app silently keeps the
  // sizeText — the reading that halves the unit price and hands the item the "best price" badge.
  // We cannot tell which is stale without asking the retailer, so we record the disagreement and
  // let the comparison refuse to crown a row whose own two numbers disagree by 2x.
  // Only when pickSize kept the sizeText over a name that said something else in the SAME
  // dimension. Everywhere pickSize deliberately prefers the name — a bare "1 ea" against
  // "24-count", or "64 fl oz" against "Half Gallon, 3-count" — it has already resolved the
  // reading, and that is a decision, not a contradiction.
  const soldByLb = f.soldBy === 'lb' || size?.perWeight;
  const sizeConflict = slugPerLbConflict(size, f, soldByLb) || turkeyPerLbConflict(name, size, nameSize, f, soldByLb) || slugProductConflict(name, f.url) || (
    // A range in the name ("4-10 Pounds HoKa Turkey Breast") describes a variable-weight item,
    // not a second statement of this package, so it contradicts nothing.
    // And when the retailer's own URL slug names the stated size and not the name's, the name's
    // clause is the stale one (Costco "Sweet Potatoes, 5 lbs", stated 10 lb, slug
    // "...-10-lbs-10-lb"): that is settled, not a conflict. src/adapters/instacart.js drops such a
    // clause from the displayed name by the same test; deciding it HERE too means a client whose
    // adapter does not (the iOS app) reaches the same price and the same verdict.
    !(slugConfirms(f.url, textSize) && !slugStates(f.url, nameSize)) &&
    chosen && chosen === textSize && nameSize && !nameSize.perWeight && !nameSize.range &&
    textSize.dim === nameSize.dim && textSize.base > 0 && nameSize.base > 0 && !size?.packFromUrl &&
    Math.max(textSize.base, nameSize.base) / Math.min(textSize.base, nameSize.base) >= 1.5
      ? { text: formatSize(textSize), name: formatSize(nameSize) }
      : soldByLb ? null
      : listed?.conflict ? listed.conflict
      : size?.packFromListing ? null
      : unitLineConflict(size, f) || countOnlyConflict(size, chosen, textSize, nameSize));
  // Where the size we priced from came from, so the plausibility guard can tell a number the
  // retailer stated from one we inferred (see flagImplausible in shared/compare.js):
  //   perLb    the retailer's own price per pound; no size is involved at all
  //   stated   the retailer's structured size, used as given
  //   name     read out of the product name
  //   derived  a pack multiplication or reconciliation we worked out (settle*, URL pack)
  const sizeSource = soldByLb ? 'perLb' : !size ? null
    : size.packFromUrl || size.packFromListing || size.sticks || size.heartsPack || size.clubBoxes || size.clubSlugPack || (chosen !== textSize && chosen !== nameSize) ? 'derived'
    : chosen === textSize ? 'stated' : 'name';

  const price = round2(f.price);
  const regular = f.regularPrice != null && f.regularPrice > (price || 0) + 0.004 ? round2(f.regularPrice) : null;
  const member = f.memberPrice != null && f.memberPrice < (price || Infinity) - 0.004 ? round2(f.memberPrice) : null;

  // Unit prices are computed on the best price anyone can get without a paid membership.
  const effective = price;
  const up = unitPrices({
    price: soldByLb ? null : effective,
    size: soldByLb ? null : size,
    perLbPrice: soldByLb ? effective : null,
    estEach: soldByLb && f.estEach && !noEachEstimate(name) ? f.estEach : null,
    estPkgWeightOz: null,
  });
  // Produce sold "each" vs "per lb": add an estimated cross-unit price so they can be compared.
  const pieceLb = produceWeightLb(name);
  if (pieceLb && effective > 0) {
    if (soldByLb && !up.count) up.count = { perBase: effective * pieceLb, est: true };
    // One loose piece, at a price a piece can cost: see PRODUCE_GRADE_COUNT and PRODUCE_PIECE_MAX.
    // ...and not when the retailer's own URL says the price is per pound: Kroger's "Sweet Potato",
    // "1 ct" at $0.99 under ".../golden-sweet-potatoes-yams-per-lb", was estimated at $1.65/lb as one
    // 0.6 lb potato, though the same listing is sold by the pound at $0.99 in seven other ZIPs (20
    // Nov 2026). Which reading is right cannot be told from the row, so it gets no estimate at all.
    else if (!soldByLb && size?.dim === 'count' && size.base > 0 && size.base < PRODUCE_GRADE_COUNT && effective / size.base <= PRODUCE_PIECE_MAX && !up.weight && !SLUG_PER_LB_RE.test(slugPath(f.url))) up.weight = { perBase: effective / size.base / (pieceLb * 16), est: true };
    // ...nor a price per piece: it may be a price per pound.
    if (!soldByLb && size?.dim === 'count' && size.base === 1 && SLUG_PER_LB_RE.test(slugPath(f.url))) delete up.count;
  }
  // A whole pumpkin at a fixed price with its weight stated is one pumpkin at that price
  // (weighedWholePumpkin). A per-lb pumpkin still gets no per-pumpkin price: see pieceWeightVaries.
  if (!soldByLb && !up.count && effective > 0 && weighedWholePumpkin(name, size)) up.count = { perBase: effective, est: false };
  // A whole turkey priced per bird with no weight gets an estimated price per pound from a typical
  // bird (wholeTurkey in shared/units.js), so it is ranked with the birds sold by the pound instead
  // of dropping out of the comparison.
  const bird = effective > 0 && wholeTurkey(name, f.category);
  if (bird && !soldByLb && !up.weight && effective >= TURKEY_EACH_MIN && (!size || (size.dim === 'count' && size.base === 1))) {
    up.weight = { perBase: effective / (TYPICAL_TURKEY_LB * 16), est: true };
  }
  // A roll of foil, wrap or parchment states its length or area ("18\"W x 500'L", "75 sq ft"), and
  // a per-EACH price then compares a 500 ft roll with a 25 sq ft one as if they were the same
  // thing: Costco's $55.97 Kirkland roll was set against ALDI's 75 ft roll at $3.95, "per each".
  // Neither price is wrong; the comparison is. Until there is an area dimension (see the owner
  // question in the round-2 report), such a row keeps its package price and loses its per-each
  // price, so it is listed but never compared by the roll.
  // A whole turkey sold "each" with no weight has no price per bird we can stand behind: Ingles'
  // "Fresh Hen & Turkey", 1 ea at $3.59 in Whole Turkey, was Charlotte's best "fresh turkey" at
  // $3.59 a bird, a per-pound price (the Thanksgiving core list). It is listed, not ranked per bird.
  if (!soldByLb && up.count && (size?.dim === 'count' || !size) && (size?.base ?? 1) === 1 && wholeBirdEach(name, f.category)) delete up.count;
  if (!soldByLb && up.count && (size?.dim === 'count' || !size) && LENGTH_OR_AREA_RE.test(`${name} ${f.sizeText || ''}`)) delete up.count;
  // ...and so does a roll that does not say how long it is. "Signature SELECT Aluminum Foil, 1 ea"
  // at $2.99 and ALDI's "Boulder Heavy Duty Aluminum Foil, 1 ea" at $3.95 are two rolls of unknown
  // and different lengths; per each, they are the same comparison as the 500 ft roll against the
  // 75 ft one with the lengths hidden. Pre-cut sheets ("50 ct") stay countable, as do pans, trays
  // and liners, which are sold one to a unit.
  if (!soldByLb && up.count && (!size || (size.dim === 'count' && size.base === 1)) && ROLL_GOODS_RE.test(name) && !NOT_A_ROLL_RE.test(name)) delete up.count;
  // A bag of rolls stated "1 each" is one bag of an unknown number of rolls, not one roll: Natural
  // Grocers' "Organic Hawaiian Rolls" at $6.29 was ranked last in seven ZIPs at "$6.29/ct" (every
  // cached answer re-scored, 20 Nov 2026). Its price per bag says nothing per roll. A bakery single
  // under a plural name is one roll, and the price says which: Bashas' "Bolillos Rolls" at $0.49 and
  // every other single in the cache is $1.79 or less (the review of this change).
  if (!soldByLb && up.count && (!size || (size.dim === 'count' && size.base === 1)) && effective >= ROLL_BAG_MIN_PRICE && BREAD_PIECES_RE.test(name) && !nameSize && !NOT_BREAD_PIECES_RE.test(name)) delete up.count;
  // A row stated in one dimension whose slug states the other is priced in that one too, but never
  // votes for the dimension (otherDimFromSlug).
  const other = effective > 0 ? otherDimFromSlug(size, f, name, { soldByLb, sizeConflict, textSize, nameSize }) : null;
  const slugDim = other && (!up[other.dim] || up[other.dim].est) ? other : null;
  if (slugDim) up[slugDim.dim] = { perBase: effective / slugDim.base, est: true, slug: true };
  // A row whose own numbers disagree about the size has no unit price we can stand behind, in
  // either reading. Publishing one anyway is exactly "$224/lb" beside "$31/lb" for the same sticks.
  // The package price stays; the per-unit figure goes, everywhere (list, detail, history, planner).
  if (sizeConflict && !soldByLb) for (const k of Object.keys(up)) delete up[k];
  // Weighed packages with an estimated package price ("$3.98 /pkg (est.)") keep that as a hint
  const estPkg = soldByLb && f.estPkg ? round2(f.estPkg) : null;

  const onSale = !!(regular || f.onSale);
  const pctOff = regular && price ? Math.round((1 - price / regular) * 100) : f.pctOff ?? null;

  return {
    key: `${f.storeId}:${f.id}`,
    storeId: f.storeId,
    // The retailer's own id for the physical store this price came from. Price history is scoped
    // to it so a shopper is never shown another city's low. Never a visitor identifier.
    locationId: f.locationId ?? null,
    id: String(f.id),
    name,
    brand: f.brand ? tidyBrand(f.brand) : '',
    // Recovered stick weights say where they came from: "4 sticks · 16 oz", never a bare "16 oz"
    // the retailer did not print.
    // A second figure from the slug is shown beside the stated one: "2 ct · 16 oz".
    size: size && !soldByLb ? `${size.sticks ? `${size.sticks} sticks · ${formatSize(size)}` : size.heartsPack ? `1 pack · ${size.heartsPack}` : formatSize(size)}${slugDim ? ` · ${formatSize(slugDim.size)}` : ''}` : soldByLb ? 'per lb' : f.sizeText || '',
    sizeText: f.sizeText || '',
    // Set only when the name and the stated size disagree about how much is in the package. The
    // comparison treats it like an unbelievable price: still listed, never the headline.
    sizeConflict,
    dim: size?.dim || (soldByLb ? 'weight' : null),
    sizeSource,
    base: size && !size.perWeight ? size.base : null,
    soldBy: soldByLb ? 'lb' : 'each',
    price,
    regularPrice: regular,
    memberPrice: member,
    memberLabel: member ? f.memberLabel || 'Member' : null,
    memberUnit: member && !soldByLb && size?.base && !sizeConflict ? member / size.base : member && soldByLb ? member / 16 : null,
    estPkg,
    // A bird sold by the pound: what a typical bird would cost, for display only. Never a register
    // price (excludedCheaper reads estPkg): a $2.89 "1 each" listing is not cheaper than a $48.86
    // estimate (qa-pricing-round2, "a package price is never called cheaper than a price per pound").
    estBird: soldByLb && bird && !f.estPkg ? round2(effective * TYPICAL_TURKEY_LB) : null,
    onSale,
    pctOff: pctOff > 0 ? pctOff : null,
    promo: f.promo || null,
    saleEnds: f.saleEnds || null,
    unit: up,
    image: f.image || null,
    url: f.url || null,
    stock: f.stock || null,
    available: f.available !== false,
    category: f.category || null,
    tags: f.tags || [],
    sponsored: !!f.sponsored,
    rank: f.rank ?? null,
    total: f.total ?? null,
    priceBasis: f.priceBasis || 'shelf',
  };
}

function tidyBrand(b) {
  const s = String(b).trim();
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    return s.replace(/\w[\w']*/g, (w) => (w.length <= 2 && /^[A-Z]+$/i.test(w) && s === s.toUpperCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()));
  }
  return s;
}

export function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Oz|Fl|Lb|Ct|Pk)\b/g, (w) => w.toLowerCase());
}
