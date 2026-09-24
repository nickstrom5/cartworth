// Build the normalized product shape every adapter returns.
import { parseSize, sizeFromName, coerceLiquid, unitPrices, formatSize, produceWeightLb } from '../shared/units.js';

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
  const settled = settleCountFirst(fromText, fromName) || settleByStatedCount(fromText, fromName, listing);
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
function settleCountFirst(fromText, fromName) {
  const cf = fromName.countFirst;
  if (!cf || !(cf.n > 1) || !(cf.unitBase > 0)) return null;
  if (fromText.perWeight || fromText.count > 1 || fromText.dim !== fromName.dim || !(fromText.base > 0)) return null;
  const near = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.02;
  const one = cf.unitBase;
  const packBase = Math.round(cf.n * one * 10000) / 10000;
  // When the name was already read as the pack (a volume, or a plural container after the size),
  // the stated size only confirms it: that is the name's own reading, not one we derived.
  const pack = fromName.count === cf.n && fromName.base === packBase ? fromName : { ...fromName, base: packBase, count: cf.n };
  if (near(fromText.base, one) || near(fromText.base, cf.n * one)) return pack;
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
export function slugStates(url, size) {
  const units = SLUG_UNITS[size?.unit];
  if (!url || !units || !(size.amount > 0)) return false;
  // A whole amount may carry a zero decimal: Plugra's slug is "...-extra-creamy-8-0-oz" (8.0 oz),
  // Cool Whip's "...-16-00-oz".
  const whole = Number.isInteger(+size.amount.toFixed(2));
  const amount = String(+size.amount.toFixed(2)).replace('.', '[-.]?') + (whole ? '(?:[-.]0{1,2})?' : '');
  const slug = String(url).replace(/^[^?#]*\/products?\//, '/').replace(/[?#].*$/, '');
  return new RegExp(`(?<!\\d)(?<!\\d[-.])${amount}-?(?:${units})(?=$|[-/])`, 'i').test(slug);
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
export function butterSticks(size, { name = '', category = '', url = '' } = {}) {
  if (!size || size.dim !== 'count' || size.perWeight || !BUTTER_CATEGORY_RE.test(String(category || '').trim())) return null;
  const n = size.base;
  if (!Number.isInteger(n) || n < 2 || n > 8 || NOT_JUST_STICKS_RE.test(name)) return null;
  // Every weight the slug states must be one of the two readings; one it cannot explain ("1-lb"
  // over eight half sticks) means the sticks are not quarter pounds, and nothing is recovered.
  const weights = slugWeightsOz(url);
  const fits = (w) => Math.abs(w - 4 * n) <= 0.02 * 4 * n || Math.abs(w - 4) <= 0.08;
  if (!weights.length || !weights.every(fits)) return null;
  return { dim: 'weight', base: 4 * n, amount: 4 * n, unit: 'oz', count: 1, perWeight: false, range: false, text: `${n} sticks`, sticks: n };
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
 * The retailer's own unit price, when it disagrees with the package size, is a third witness that
 * the listing contradicts itself.
 *
 * Round-3 price check, Piggly Wiggly (order.shopthepig.com) at 53142: "Certified Angus Beef 80%
 * Ground Chuck Beef", size "10 lb", $7.99 — Instacart's own line under it reads "$0.50/oz", which is
 * $7.99 for ONE pound. Divided by the stated 10 lb it was 80c/lb and took Kenosha's and Milwaukee's
 * ground-beef headline "81% less than the next-best store". "Cady Creek Farms Sharp Cheddar Cheese",
 * "5 lb", $8.99, "$0.56/oz": the same shape, $1.80/lb against a listing that says $8.99/lb. Which
 * number is stale cannot be known from outside, so like every other size contradiction the row keeps
 * its package price and loses its unit price (sizeConflict). A factor of 1.5 or more, as for the
 * name-versus-size conflict above: the listed line is rounded to the cent, which on a cheap item
 * ("$0.03/oz") is itself worth up to 17%.
 *
 * `f.listedUnit` is { price, unit } from the adapter (the line as printed: "$0.50/oz", "$3.49/gal").
 */
const LISTED_UNITS = { oz: ['weight', 1], lb: ['weight', 16], lbs: ['weight', 16], 'fl oz': ['volume', 1], floz: ['volume', 1], gal: ['volume', 128], qt: ['volume', 32], l: ['volume', 33.8140227], ct: ['count', 1], each: ['count', 1], ea: ['count', 1] };
export function unitLineConflict(size, f) {
  const lu = f.listedUnit;
  const u = lu && LISTED_UNITS[String(lu.unit || '').toLowerCase().replace(/\.$/, '').trim()];
  if (!u || !(lu.price > 0) || !(f.price > 0) || !size || size.perWeight || !(size.base > 0) || u[0] !== size.dim) return null;
  const impliedBase = (f.price / lu.price) * u[1];
  const ratio = Math.max(impliedBase, size.base) / Math.min(impliedBase, size.base);
  if (ratio < 1.5) return null;
  return { text: formatSize(size), name: `${Math.round(impliedBase * 100) / 100} ${u[0] === 'weight' ? 'oz' : u[0] === 'volume' ? 'fl oz' : 'ct'} (the listing's own ${'$'}${lu.price}/${lu.unit})` };
}

const ROLL_GOODS_RE = /\b(?:alumin(?:i)?um foil|foil|plastic wrap|cling wrap|wax(?:ed)? paper|parchment(?: paper)?|freezer paper|butcher paper)\b/i;
const NOT_A_ROLL_RE = /\b(?:pans?|trays?|roasters?|containers?|lids?|liners?|bags?|sheets?|cups?|plates?|tins?|dish(?:es)?|board|foilware|racks?|burners?|tape|ducts?)\b/i;
const LENGTH_OR_AREA_RE = /\d+(?:\.\d+)?\s*(?:sq\.?\s*ft\.?|sqft|square\s+f(?:ee|oo)t|ft\.?|feet|foot|yds?\.?|yards?)(?![a-z])|\d+(?:\.\d+)?\s*['\u2019]\s*L\b/i;

export function makeProduct(f) {
  const name = String(f.name || '').replace(/\s+/g, ' ').trim();
  const textSize = parseSize(f.sizeText);
  const nameSize = sizeFromName(name);
  const chosen = pickSize(textSize, nameSize, { name, url: f.url });
  let size = applyUrlPack(chosen, f);
  // Four sticks of butter are a pound only when the retailer's slug says so too (butterSticks).
  const sticks = butterSticks(size, { name, category: f.category, url: f.url });
  if (sticks) size = sticks;
  // Instacart's own unit line may say the price buys several of this size (listingPack).
  const listed = listingPack(size, f.packText, { name, url: f.url });
  if (listed?.size) size = listed.size;
  size = coerceLiquid(size, `${name} ${f.category || ''}`);

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
  const sizeConflict =
    // A range in the name ("4-10 Pounds HoKa Turkey Breast") describes a variable-weight item,
    // not a second statement of this package, so it contradicts nothing.
    // And when the retailer's own URL slug names the stated size and not the name's, the name's
    // clause is the stale one (Costco "Sweet Potatoes, 5 lbs", stated 10 lb, slug
    // "...-10-lbs-10-lb"): that is settled, not a conflict. src/adapters/instacart.js drops such a
    // clause from the displayed name by the same test; deciding it HERE too means a client whose
    // adapter does not (the iOS app) reaches the same price and the same verdict.
    !(slugStates(f.url, textSize) && !slugStates(f.url, nameSize)) &&
    chosen && chosen === textSize && nameSize && !nameSize.perWeight && !nameSize.range &&
    textSize.dim === nameSize.dim && textSize.base > 0 && nameSize.base > 0 && !size?.packFromUrl &&
    Math.max(textSize.base, nameSize.base) / Math.min(textSize.base, nameSize.base) >= 1.5
      ? { text: formatSize(textSize), name: formatSize(nameSize) }
      : soldByLb ? null
      : listed?.conflict ? listed.conflict
      : size?.packFromListing ? null
      : unitLineConflict(size, f) || countOnlyConflict(size, chosen, textSize, nameSize);
  // Where the size we priced from came from, so the plausibility guard can tell a number the
  // retailer stated from one we inferred (see flagImplausible in shared/compare.js):
  //   perLb    the retailer's own price per pound; no size is involved at all
  //   stated   the retailer's structured size, used as given
  //   name     read out of the product name
  //   derived  a pack multiplication or reconciliation we worked out (settle*, URL pack)
  const sizeSource = soldByLb ? 'perLb' : !size ? null
    : size.packFromUrl || size.packFromListing || size.sticks || (chosen !== textSize && chosen !== nameSize) ? 'derived'
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
    estEach: soldByLb && f.estEach ? f.estEach : null,
    estPkgWeightOz: null,
  });
  // Produce sold "each" vs "per lb": add an estimated cross-unit price so they can be compared.
  const pieceLb = produceWeightLb(name);
  if (pieceLb && effective > 0) {
    if (soldByLb && !up.count) up.count = { perBase: effective * pieceLb, est: true };
    else if (!soldByLb && size?.dim === 'count' && size.base > 0 && !up.weight) up.weight = { perBase: effective / size.base / (pieceLb * 16), est: true };
  }
  // A roll of foil, wrap or parchment states its length or area ("18\"W x 500'L", "75 sq ft"), and
  // a per-EACH price then compares a 500 ft roll with a 25 sq ft one as if they were the same
  // thing: Costco's $55.97 Kirkland roll was set against ALDI's 75 ft roll at $3.95, "per each".
  // Neither price is wrong; the comparison is. Until there is an area dimension (see the owner
  // question in the round-2 report), such a row keeps its package price and loses its per-each
  // price, so it is listed but never compared by the roll.
  if (!soldByLb && up.count && (size?.dim === 'count' || !size) && LENGTH_OR_AREA_RE.test(`${name} ${f.sizeText || ''}`)) delete up.count;
  // ...and so does a roll that does not say how long it is. "Signature SELECT Aluminum Foil, 1 ea"
  // at $2.99 and ALDI's "Boulder Heavy Duty Aluminum Foil, 1 ea" at $3.95 are two rolls of unknown
  // and different lengths; per each, they are the same comparison as the 500 ft roll against the
  // 75 ft one with the lengths hidden. Pre-cut sheets ("50 ct") stay countable, as do pans, trays
  // and liners, which are sold one to a unit.
  if (!soldByLb && up.count && (!size || (size.dim === 'count' && size.base === 1)) && ROLL_GOODS_RE.test(name) && !NOT_A_ROLL_RE.test(name)) delete up.count;
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
    size: size && !soldByLb ? (size.sticks ? `${size.sticks} sticks · ${formatSize(size)}` : formatSize(size)) : soldByLb ? 'per lb' : f.sizeText || '',
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
