// Comparison helpers shared by the browser (Compare view) and server (watchlist, list optimizer).
import { relevance, RELEVANT } from './match.js';
import { defaultDisplayUnit, parseSize, formatSize } from './units.js';

/** Score every item against the query (adds .score). */
export function scoreItems(query, items, { include = [], exclude = [] } = {}) {
  return items.map((p) => ({ ...p, score: relevance(query, p, { include, exclude }) }));
}

/** Price used for comparisons, honoring membership preferences. Returns per-base price in `dim`. */
export function unitFor(p, dim, prefs = {}) {
  const u = p.unit?.[dim];
  if (!u) return null;
  if (p.memberPrice != null && p.memberUnit != null && dim === p.dim && usesMember(p, prefs)) {
    return { perBase: p.memberUnit, est: u.est, member: true };
  }
  return { perBase: u.perBase, est: u.est, member: false };
}

export function usesMember(p, prefs = {}) {
  if (p.memberPrice == null) return false;
  if (/prime/i.test(p.memberLabel || '')) return !!prefs.prime;
  return prefs.cardPrices !== false;
}

export function priceFor(p, prefs = {}) {
  return usesMember(p, prefs) ? p.memberPrice : p.price;
}

/** Which dimension (weight/volume/count) most relevant items can be compared in. */
export function dominantDim(items) {
  const counts = { weight: 0, volume: 0, count: 0 };
  for (const p of items) {
    if (p.dim && p.unit?.[p.dim] && !p.unit[p.dim].est) counts[p.dim] += 2;
    for (const d of Object.keys(p.unit || {})) counts[d] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

export function suggestUnit(dim, items, query) {
  const sizes = items.filter((p) => p.dim === dim && p.base).map((p) => p.base);
  if (dim === 'weight' && items.some((p) => p.soldBy === 'lb')) return 'lb';
  return defaultDisplayUnit(dim, sizes, query);
}

/**
 * Best relevant item per store (lowest unit price in `dim`).
 * resultsByStore: { storeId: items[] } (items already scored or not)
 */
/**
 * How far a unit price may sit from its peers before we refuse to treat it as comparable.
 *
 * The two directions are not symmetric, and a four-ZIP Thanksgiving sweep showed why. Of 86 flags
 * the old symmetric 8x rule raised, 69 were correctly-priced listings; every one of the 10 flags
 * it raised in the LOW direction was a false positive — a $1.16/lb turkey drumstick on sale, pie
 * pumpkins at 99c/lb, packs of pre-cut foil sheets at 5c a sheet. It never once caught a wrong
 * price by being too cheap, while a real 49c/lb holiday bird was suppressed in all four ZIPs.
 *
 * What the guard does catch is a case priced as one unit: warehouse clubs state one unit's size
 * and charge for the case, which lands the item far ABOVE its peers. Those sat at 5.7x to 6.7x of
 * the median and slipped under an 8x cut, so the high side is tightened to 5x.
 *
 * The low side stays, because a wrong price that is too cheap wins the comparison and is the most
 * damaging thing this app can print. Round 1 moved it from 1/8 to 1/30 of the median, because a
 * plain 1/8 floor put the suppression line at $1.11-$1.29/lb against a turkey median near $9 —
 * inside the range a supermarket sells a Thanksgiving bird for. That was right about the birds and
 * wrong about everything else: "Sara Lee Hawaiian Rolls, 12 ct, 15 oz", read as twelve 15 oz bags,
 * sat at 1/18 and 1/10 of the dinner-rolls median and went straight to the BEST PRICE headline at
 * 53211. Ratio alone cannot separate that 1/10 (wrong) from Tony's 1/8.6 turkey drumsticks (right),
 * so round 2 adds a second signal on WHERE the size came from (UNCONFIRMED_LOW, flagImplausible).
 */
const IMPLAUSIBLE_HIGH = 5;
// The hard floor: below 1/30 of the median a price is badged "price looks wrong" whatever its
// provenance. It has to sit this far out because a real Thanksgiving doorbuster does: a 37c/lb bird
// in a "turkey" search whose median is $9.98/lb (deli breast, ground turkey, sticks) is at 1/27.
const IMPLAUSIBLE_LOW = 30;
// The reach of the second signal, re-measured in round 2 on the REPAIRED pool (the matcher and size
// fixes of round 1 plus the size-parse fixes of round 2), over the four-ZIP Thanksgiving capture
// (116 query groups, every item scoring as a match): the cheapest correct item in any group sits at
// 0.116 of its median (Tony's turkey drumsticks, $1.16/lb against $9.99), and every item between
// 1/8 and 1/3 is a correct price (butter bricks, store-brand cans, produce, ground turkey). What
// fell below 1/8 before round 2 were the mis-parsed ones: the "12 ct, 15 oz" rolls at 0.054 and
// 0.101, the Sam's buns, the oven bags at 0.005. Ratio alone cannot separate 0.101 (wrong) from
// 0.116 (right), and round 1's 1/30 let the rolls straight through to the headline.
const UNCONFIRMED_LOW = 8;
// A cheap price corroborates another when it is within this factor of it.
const CORROBORATES = 1.5;

function medianOf(values) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/** The retailer stated this unit price's basis itself: a price per pound, or its own package size. */
function statedUnit(p) {
  return p.sizeSource === 'perLb' || p.sizeSource === 'stated';
}

const sameName = (a, b) => String(a.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === String(b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Mark results whose unit price cannot be right given the others for the same query.
 *
 * This does NOT hide anything: the item still appears in the list, carrying the flag so the UI can
 * say the price looks wrong. It only stops it being presented as the best price or as the truth.
 * Needs at least four comparable results, because with three you cannot tell an outlier from a
 * genuinely cheap store.
 *
 * Two signals on the cheap side, because the cheap side is the one that WINS:
 *   1. below 1/30 of the median, flagged, full stop;
 *   2. below 1/8, flagged unless something vouches for it. A wrong price that is far too cheap has
 *      always, in every case seen, come from a size WE worked out — a pack multiplication, a size
 *      read out of the name — never from a per-pound price or a package size the retailer stated
 *      itself. So a sub-1/8 price stands if the retailer stated its basis (sizeSource 'perLb' or
 *      'stated'), or if a DIFFERENT product whose basis the retailer stated sits within 1.5x of it
 *      (a real bargain is rarely alone; a parse error is always alone). The Tony's drumsticks at
 *      0.116 stand on their stated 3.43 lb; a 37c/lb doorbuster sold by the pound stands on its
 *      price per pound. The "12 ct, 15 oz" rolls — size from the name, same product at the only
 *      other store near them — are flagged at 0.054 and 0.101 even with the round-1 parse bug put
 *      back, which is the point: the guard no longer depends on the parser being right.
 * Measured on both captures (round 1's four-ZIP sweep and round 2's recording: 228 query groups,
 * 11,375 matched unit prices in weight and volume): with the round-2 parse the guard flags nothing,
 * and every one of the 13 prices below 1/5 of its median was checked by hand and is right (Tony's
 * drumsticks and wings at their stated weights, a 1 lb ground turkey at $1.99, 2 lb of celery, 1 lb
 * of cranberries): 0 false positives, 0 false negatives. With the round-1 size parse put back, it
 * flags all 3 wrong rows (the rolls, at 0.054, 0.055 and 0.101) and nothing that is right, where the
 * round-1 guard flagged none of them. A 37c/lb bird sold by the pound, or packaged with a stated
 * weight, stands on the retailer's own basis (DEFECT 10 and its control in the Thanksgiving tests).
 * Products carrying no sizeSource (built before it existed — a cached result) are treated as
 * unconfirmed, so the search cache must be versioned with this change (see the round-2 handoff).
 */
export function flagImplausible(items, dim, prefs = {}) {
  // The count dimension counts PACKAGES, so its median mixes a 50-sheet box of foil with a single
  // roll and a 2-pack of heavy duty. Distance from that median says nothing about whether a price
  // is right: it flagged six correct per-sheet foil prices as "price looks wrong" and a 500 ft
  // Kirkland roll, which is the cheapest foil in the sweep, as implausibly dear. Telling a shopper
  // a correct price looks wrong is the mirror image of showing a wrong one.
  if (dim === 'count') return items;
  const priced = items.map((p) => ({ p, u: unitFor(p, dim, prefs) })).filter((x) => x.u && Number.isFinite(x.u.perBase) && x.u.perBase > 0);
  if (priced.length < 4) return items;
  const med = medianOf(priced.map((x) => x.u.perBase));
  if (!med) return items;
  for (const { p, u } of priced) {
    const ratio = u.perBase / med;
    const flag = (extra = {}) => {
      p.implausible = {
        ratio: Math.round(ratio * 10) / 10,
        median: med,
        // Which way it is wrong matters: too cheap wins the comparison and misleads, too dear
        // only looks silly.
        direction: ratio > 1 ? 'high' : 'low',
        ...extra,
      };
    };
    if (ratio >= IMPLAUSIBLE_HIGH || ratio <= 1 / IMPLAUSIBLE_LOW) flag();
    else if (ratio <= 1 / UNCONFIRMED_LOW && !statedUnit(p)) {
      const vouched = priced.some((o) => o.p !== p && statedUnit(o.p) && !sameName(o.p, p) && o.u.perBase <= u.perBase * CORROBORATES);
      if (!vouched) flag({ unconfirmed: true });
    }
  }
  return items;
}

/**
 * The one population plausibility is judged against, on every screen and both platforms: the items
 * that score as real matches (RELEVANT), whatever the shopper's Show control says. The Show control
 * widens or narrows the LIST; it must not move the median, or the same price is "wrong" in one view
 * and fine in another — measured in round 1 at 12 items that lost their badge on "Everything".
 * Flags the objects passed in (callers hold them), and returns them.
 */
export function judgePlausibility(scoredItems, dim, prefs = {}) {
  if (!dim) return scoredItems;
  flagImplausible(scoredItems.filter((p) => (p.score ?? 0) >= RELEVANT), dim, prefs);
  return scoredItems;
}

/** May this row be a store's answer (its bar, the headline, the trip planner's pick)? */
export function headlineEligible(p, { answerFloor = RELEVANT } = {}) {
  if (!p || p.implausible || p.sizeConflict) return false;
  if (p.score != null && p.score < answerFloor) return false;
  return true;
}

export function bestPerStore(query, resultsByStore, { dim, include = [], exclude = [], prefs = {}, minScore = RELEVANT, inStockOnly = false } = {}) {
  const out = {};
  const scored = {};
  let all = [];
  let pool = [];
  for (const [storeId, items] of Object.entries(resultsByStore)) {
    const every = scoreItems(query, items || [], { include, exclude });
    // The plausibility pool is every real match (see judgePlausibility), NOT the caller's
    // minScore: a stricter answer threshold must not move the median the flags are judged by.
    pool = pool.concat(every.filter((p) => p.score >= RELEVANT));
    const s = every.filter((p) => p.score >= minScore && (!inStockOnly || p.available !== false));
    scored[storeId] = s;
    all = all.concat(s);
  }
  const d = dim || dominantDim(all);
  if (!d) return { dim: null, stores: {} };
  // Judge plausibility against the items the app has already decided ARE matches. Judging against
  // everything the store returned is judging against noise: the "pumpkin puree" pool carried
  // Costco sweet potatoes and baby-food pouches, and the medians that produced disagreed with the
  // iOS mirror on 49 items across 21 query groups — the phone and the website flagging different
  // prices in the same basket in the same ZIP.
  //
  // Still flags the ORIGINAL item objects, not the scored copies: callers (and the Compare view)
  // hold the originals, and scoreItems spreads them, so a flag set here travels where it is needed.
  const poolKeys = new Set(pool.map((p) => p.key));
  const originals = Object.values(resultsByStore).flat().filter((p) => p && poolKeys.has(p.key));
  flagImplausible(originals, d, prefs);
  const flagged = new Map(originals.filter((p) => p.implausible).map((p) => [p.key, p.implausible]));
  for (const list of Object.values(scored)) {
    for (const p of list) {
      const f = flagged.get(p.key);
      if (f) p.implausible = f;
    }
  }
  for (const [storeId, items] of Object.entries(scored)) {
    let best = null;
    for (const p of items) {
      const u = unitFor(p, d, prefs);
      if (!u) continue;
      // A price we cannot believe must not become the headline number for a store. Neither may a
      // row whose own two numbers disagree about how much is in the package (sizeConflict):
      // keeping the sizeText of Costco's "Sweet Potatoes, 5 lbs" / "10 lb" halved the unit price
      // and handed it the best-price badge, which is the least safe way to resolve a
      // contradiction we cannot settle without asking the retailer. Both still appear in the list.
      if (!headlineEligible(p, { answerFloor: minScore })) continue;
      if (!best || u.perBase < best.unit.perBase - 1e-9 || (Math.abs(u.perBase - best.unit.perBase) < 1e-9 && p.score > best.item.score)) {
        best = { item: p, unit: u };
      }
    }
    if (best) out[storeId] = best;
  }
  return { dim: d, stores: out };
}

/**
 * A store's cheapest item that the unit comparison had to leave out, when it is cheaper at the
 * register than the item shown as that store's best (or when the store has no comparable item).
 *
 * The owner's own store check: Cartworth showed Jewel-Osco's butter at $7.99 while Jewel had a
 * pound of Lucerne at $4.99 on the same Instacart page, stated only as "4 each". Four sticks have no
 * price per pound, so the box was dropped without a word and the store looked 60% dearer than its
 * shelf. Where the weight can be established (butterSticks in src/normalize.js) it now is; where it
 * cannot, the item is still the store's cheapest at the register and the shopper must be told it
 * exists rather than shown a "best" it beats. This names it; the UI says "Cheaper item not
 * comparable per lb: Lucerne Unsalted Butter, 4 ct, $4.99".
 *
 * Only real matches (minScore), in stock when the caller asks for that, not sold by the pound, not
 * flagged as an implausible price, and without a unit price in the comparison's dimension. "Cheaper"
 * is the package price, the only figure such an item has: it says nothing per pound, and the line
 * must not either. So it is judged only against a store answer that has a register price too — not
 * against a price per pound (Festival's "Butterball Frozen Turkey, 1 ea, $2.89" is not "cheaper"
 * than a $14.49/lb deli loaf; those two numbers do not measure the same thing). A store with no
 * comparable item at all is named too (hasBest false): it is otherwise simply missing from the
 * comparison, which is how Costco's only heavy cream vanished from a Chicago search.
 *
 * Measured over the 116 captured Thanksgiving query groups (912 store/query pairs): 128 store answers
 * were beaten at the register by an item the comparison had left out on round 1's code, among them
 * Jewel's butter; see the round-2 report for the list after this round's size fixes.
 *
 * Returns { storeId: { item, reason, hasBest } }, reason one of 'count' (a count where the
 * comparison is by weight or volume), 'sizeConflict' (its own name and size disagree), 'noSize' or
 * 'otherDim'.
 */
export function excludedCheaper(query, resultsByStore, best, { include = [], exclude = [], prefs = {}, minScore = RELEVANT, inStockOnly = false } = {}) {
  const d = best?.dim;
  const out = {};
  if (!d) return out;
  for (const [storeId, items] of Object.entries(resultsByStore || {})) {
    let cheapest = null;
    for (const p of scoreItems(query, items || [], { include, exclude })) {
      if (p.score < minScore || (inStockOnly && p.available === false) || p.soldBy === 'lb' || p.implausible) continue;
      if (unitFor(p, d, prefs)) continue;
      const price = priceFor(p, prefs);
      if (!(price > 0)) continue;
      if (!cheapest || price < priceFor(cheapest, prefs) - 1e-9) cheapest = p;
    }
    if (!cheapest) continue;
    const shown = best.stores?.[storeId]?.item;
    if (shown) {
      const register = shown.soldBy === 'lb' ? shown.estPkg : priceFor(shown, prefs);
      if (!(register > 0) || !(priceFor(cheapest, prefs) < register - 0.004)) continue;
    }
    const reason = cheapest.sizeConflict ? 'sizeConflict' : cheapest.dim === 'count' ? 'count' : !cheapest.dim ? 'noSize' : 'otherDim';
    out[storeId] = { item: cheapest, reason, hasBest: !!shown };
  }
  return out;
}

// ---------- price bases and the savings line ----------

/**
 * How far a listed price can sit from the shelf price at the shopper's own store, by basis.
 *
 * 'online' is the store's own Instacart listing, which the directory labels "Prices vary from
 * in-store". MEASURED in round 2, the one legitimate way: the same chain's printed weekly ad (Flipp)
 * against its Instacart listing of the same product and package, same ZIP, same week, 24 pairs
 * checked by hand plus the owner's own in-store check of Jewel. Instacart ran 0% to 20.0% above the
 * shelf (median 13.3%, mean 10.7%); Jewel 13 pairs, median 14.3%, max 20.0% (the owner's Lucerne
 * pound: $4.99 against Jewel's own $4.49, $6.99 against $5.99; Kerrygold $7.99 against $6.99). It
 * never ran meaningfully below (-0.2% once: a $4.99 listing against a $5.00 card price). Three
 * less certain pairs (a 2-for deal, an ad that prints no size) reached 34% and 43%. So an online
 * price is taken to be up to 25% above the shelf — below: 0.20 of the listed price — which covers
 * all 24 confident pairs; the round-1 figure of 0.15 (a 17.6% markup) covered 21 of them and was
 * why a Jewel listing could still "lose" to a shelf price its own store would have beaten.
 * Instacart storefronts that sell at in-store prices (Woodman's, Tony's, ALDI) are 'shelf': their
 * three pairs matched the ad to the cent.
 *
 * 'national' is a chain-wide listing answered by another location, with no address and no
 * distance, which can sit either side of the local price. Not measurable from anything captured;
 * +/-25% is a stated assumption (see the owner question in the round-2 report). 'est' is a unit
 * price worked out from a typical piece weight.
 */
export const BASIS_SPREAD = {
  shelf: { below: 0, above: 0 },
  online: { below: 0.2, above: 0 },
  national: { below: 0.25, above: 0.25 },
};
const EST_SPREAD = 0.3;
const BASIS_WORD = { shelf: 'shelf price', online: 'online price', national: 'chain-wide price' };
const BOTH_WORD = { online: 'both online prices', national: 'both chain-wide prices' };

function claimSide(x) {
  if (!x) return null;
  // Accepts a bestPerStore entry ({ item, unit }), a Compare-view row (product fields + cmp), or
  // a plain { product, perBase, est } — the three shapes the callers hold.
  const p = x.item || x.product || x;
  // Only a bestPerStore entry ({ item, unit }) has a single `unit`; a product or a Compare row carries
  // a `unit` MAP keyed by dimension, and reading that as one price found none (the web headline's
  // savings line never showed).
  const entry = !!(x.item && x.unit);
  const perBase = entry ? x.unit.perBase : x.cmp != null ? x.cmp : x.perBase;
  const est = !!(entry ? x.unit.est : x.cmp != null ? x.cmpEst : x.est);
  const basis = BASIS_SPREAD[p.priceBasis] ? p.priceBasis : 'shelf';
  return { storeId: p.storeId, perBase, est, basis, flagged: !!(p.implausible || p.sizeConflict) };
}

function spreadOf(side) {
  const b = BASIS_SPREAD[side.basis];
  return { below: Math.max(b.below, side.est ? EST_SPREAD : 0), above: Math.max(b.above, side.est ? EST_SPREAD : 0) };
}

/**
 * The line under the best price, decided once for the website and the phone.
 *
 * "20.4c/lb (46%) less than the next-best store" is a claim about two prices, and it is only as
 * true as the less certain of them. At 53142 the headline said ALDI's shelf price was "1% less than
 * the next-best store, walmart" — a chain-wide listing from another location — and "1% less than
 * festivalfoods", an online price the app itself labels as varying from in-store. 11 of 19 basket
 * searches there had a headline like that. The rules:
 *
 *   - Never against a price the app has flagged (implausible, or sizes that disagree), on either
 *     side: "88% less than Festival" was quoted against a row badged "price looks wrong". -> null
 *   - An exact saving (amount and percent) only between two prices of the SAME basis, neither an
 *     estimate, and only when it rounds to at least 1%. -> kind 'exact'
 *   - Across bases, or with an estimate on either side, no number at all. If the winner is cheaper
 *     even after each price is moved to the far edge of its basis's spread (BASIS_SPREAD), say so
 *     without a number -> kind 'ahead'. If it is not, the ordering itself is inside the noise and
 *     the line says that no saving is claimed -> kind 'close'.
 *   - No runner-up, or a runner-up that is not dearer -> null.
 *
 * Every basis may still be RANKED: the list and the per-store chart order all of them, each wearing
 * its basis badge. What changes with the basis is only what may be said about the gap.
 *
 * Returns null or { kind, storeId, basis, pct?, diffPerBase?, text }. `text` is final except for
 * three placeholders the UI fills with its own formatting: {amount} (diffPerBase in the display
 * unit), {unit} (the display unit's label) and {store} (the runner-up's short name). Both clients
 * must render `text` and nothing else, so the phone and the website say the same sentence.
 */
/** How the dearer of two sides relates to the cheaper: 'exact', 'ahead', 'close', or null if b is not dearer. */
function relation(a, b) {
  if (!(a.perBase > 0) || !(b.perBase > a.perBase)) return null;
  if (a.basis === b.basis && !a.est && !b.est) return Math.round((1 - a.perBase / b.perBase) * 100) >= 1 ? 'exact' : null;
  return a.perBase * (1 + spreadOf(a).above) < b.perBase * (1 - spreadOf(b).below) ? 'ahead' : 'close';
}

export function savingsClaim(best, runnerUp) {
  const a = claimSide(best);
  const b = claimSide(runnerUp);
  if (!a || !b) return null;
  if (a.flagged || b.flagged) return null;
  const rel = relation(a, b);
  if (!rel) return null;
  // The parenthesis always describes the RUNNER-UP's price; the winner's own basis and "est." are
  // already badged on the headline itself.
  const qualifier = b.est ? 'estimated price' : BASIS_WORD[b.basis];
  if (rel === 'exact') {
    const pct = Math.round((1 - a.perBase / b.perBase) * 100);
    // Two online (or two chain-wide) listings compare exactly AS LISTINGS, and the sentence says so:
    // it is not a claim about either shelf.
    const as = BOTH_WORD[b.basis] ? ` (${BOTH_WORD[b.basis]})` : '';
    return { kind: 'exact', storeId: b.storeId, basis: b.basis, pct, diffPerBase: b.perBase - a.perBase, text: `{amount}/{unit} (${pct}%) less than the next-best store, {store}${as}` };
  }
  if (rel === 'ahead') return { kind: 'ahead', storeId: b.storeId, basis: b.basis, text: `Less than the next-best store, {store} (${qualifier})` };
  return { kind: 'close', storeId: b.storeId, basis: b.basis, text: `About the same as {store} (${qualifier}), so no saving is claimed` };
}

/**
 * Where every store stands against the listed winner, once each price is allowed the spread its
 * basis carries (BASIS_SPREAD). The per-store chart and the result list rank stores by listed price;
 * that order is only a claim about the listings. An Instacart price within the Instacart markup of
 * a shelf price is not evidence that the store is dearer — Jewel's $4.99 pound of Lucerne is $4.49 on
 * Jewel's own shelf — so such a store is 'close' to the winner, not 'dearer', and the UI must not
 * present it as beaten (see the round-2 handoff). Same rule as savingsClaim's 'close': the store's
 * lowest possible shelf price is at or below the winner's highest; between two prices of one basis,
 * a gap under 1% is 'close' too.
 *
 * Returns [{ storeId, perBase, basis, est, low, high, verdict }] cheapest listed first; verdict is
 * 'best' (the listed winner), 'close' or 'dearer'.
 */
export function standings(stores) {
  const rows = [];
  for (const [storeId, entry] of Object.entries(stores || {})) {
    const s = claimSide(entry);
    if (!s || !(s.perBase > 0)) continue;
    const sp = spreadOf(s);
    rows.push({ storeId, perBase: s.perBase, basis: s.basis, est: s.est, low: s.perBase * (1 - sp.below), high: s.perBase * (1 + sp.above), verdict: 'dearer' });
  }
  rows.sort((a, b) => a.perBase - b.perBase || (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0));
  if (!rows.length) return rows;
  rows[0].verdict = 'best';
  // Exactly the savings line's rule (relation): a store is 'dearer' only when the line under the
  // headline could say so about it, by a number or in words.
  for (const r of rows.slice(1)) { const rel = relation(rows[0], r); r.verdict = rel === 'exact' || rel === 'ahead' ? 'dearer' : 'close'; }
  return rows;
}

/**
 * The same rules for "saves $X" between two trip plans (src/list.js plan()). A plan's total adds up
 * prices of whatever basis each line was bought at, so an exact dollar saving is stated only when
 * every line of both plans is a shelf price; otherwise the plans are compared on the range each
 * total could really be in (`low`..`high`, from BASIS_SPREAD) and the line is 'ahead' (cheaper even
 * at the far edges) or 'close' (no saving claimed). Returns null when `plan` is not cheaper, or
 * { kind, amount?, text } with {amount} left for the UI's money formatting.
 */
export function planSavingsClaim(plan, other) {
  if (!plan || !other || !(other.total > plan.total)) return null;
  const shelfOnly = (p) => Array.isArray(p.bases) && p.bases.every((b) => b === 'shelf');
  if (shelfOnly(plan) && shelfOnly(other)) {
    const amount = Math.round((other.total - plan.total) * 100) / 100;
    return amount >= 0.01 ? { kind: 'exact', amount, text: 'saves {amount}' } : null;
  }
  const high = plan.high ?? plan.total;
  const low = other.low ?? other.total;
  if (high < low) return { kind: 'ahead', text: 'cheaper, but some prices are online or chain-wide, so the exact saving is not known' };
  return { kind: 'close', text: 'about the same once online and chain-wide prices are allowed for' };
}

// ---------- trip planner amounts ----------

/**
 * How much of a list item to cost at every store (in base units).
 *
 * From the shopper's own text when it states a size. "chicken broth 32 oz" is what people type for
 * a quart, and the old rule only honoured a size in the SAME dimension as the matches: "32 oz"
 * parses as a weight, broth compares by volume, so the shopper's quantity was silently replaced by
 * the median package — Costco's 6 x 32 fl oz case, 192 fl oz, billed at $12.43 in a trip total
 * when 32 oz costs about $2.07. A plain "oz" against liquid matches is read as fluid ounces, the
 * same reading coerceLiquid gives a label that says "oz" on a drink. A size that cannot be used in
 * the comparison's dimension at all ("eggs 2 lb") is reported back as `unused` so the UI can say
 * it was not used, instead of pricing some other amount as if it were what was asked.
 *
 * Otherwise from the matches' median package: sizes[floor(n/2)], always a package size some store
 * in the results actually sells. The median moves with whichever results a device happened to
 * get — the two shipped screenshot sets costed "orange juice" at 46 and 50 fl oz, $2.51 and $2.73
 * at the same store for the same carton — and neither printed the amount. Round 2 considered
 * snapping it to a fixed ladder of amounts (1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48 ...) and
 * measured it on 226 captured query groups: it moved 83 of the 226 costed amounts, by x0.75 to
 * x1.20 — a 14.5 oz can of green beans costed as 16 oz, 10.5 oz of condensed soup as 12, a 32 lb
 * turkey as 24 — amounts no store sells, to fix a disagreement that printing the amount already
 * makes honest. So the amount stays a real package, and both UIs print it beside every cost
 * (costedAmount in public/js/views/list.js, CostedAmount on iOS).
 *
 * Returns { base, fromText, unused? }.
 */
export function referenceAmount(text, items, dim) {
  const s = parseSize(text);
  if (s && s.base && !s.perWeight) {
    if (s.dim === dim) return { base: s.base, fromText: true };
    if (dim === 'volume' && s.dim === 'weight' && ['oz', 'ounce', 'ounces', 'onz'].includes(s.unit)) return { base: s.base, fromText: true };
  }
  const unused = s && s.base && !s.perWeight ? formatSize(s) : undefined;
  const out = (base) => (unused ? { base, fromText: false, unused } : { base, fromText: false });
  if (dim === 'weight' && items.some((p) => p.dim === 'weight' && p.soldBy === 'lb')) {
    const fixed = items.filter((p) => p.dim === 'weight' && p.base).map((p) => p.base).sort((a, b) => a - b);
    return out(fixed.length ? fixed[Math.floor(fixed.length / 2)] : 16);
  }
  const sizes = items.filter((p) => p.dim === dim && p.base).map((p) => p.base).sort((a, b) => a - b);
  if (!sizes.length) return out(dim === 'count' ? 1 : 16);
  return out(sizes[Math.floor(sizes.length / 2)]);
}

/** Strip a trailing/leading size from list text so it can be searched ("milk 1 gal" -> "milk"). */
export function searchTextFor(text) {
  const t = String(text || '').trim();
  const cleaned = t
    .replace(/\b\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:fl\.?\s*oz|oz|lbs?|pounds?|gal(?:lons?)?|qt|quarts?|ct|count|pk|pack|dozen|doz|l|ml|g|kg)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || t;
}
