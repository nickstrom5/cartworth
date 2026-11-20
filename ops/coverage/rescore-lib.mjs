// Shared by ops/coverage/rescore-cache.mjs and the QA tools that read the cache offline.
//
// The QA cache keeps each store's answer as the adapter returned it, normalised by the code of the
// day it was fetched. renormalize() rebuilds a row's feed fields and runs today's makeProduct on
// them; answer() runs the production comparison (bestPerStore -> standings -> savingsClaim, as
// scripts/price-audit.js does).
import fs from 'node:fs';
import readline from 'node:readline';
import { makeProduct } from '../../src/normalize.js';
import { bestPerStore, savingsClaim, standings, excludedCheaper } from '../../shared/compare.js';
import { DISPLAY_UNITS, sizeFromName, parseSize } from '../../shared/units.js';

const SHOW = { weight: 'lb', volume: 'gal', count: 'ct' };
export const money = (n) => (n == null ? '-' : `$${n.toFixed(2)}`);
export const perShow = (perBase, dim, q) => {
  if (!dim || !(perBase > 0)) return '-';
  const unit = dim === 'count' && /\beggs?\b/.test(q) ? 'dozen' : SHOW[dim];
  return `${money(perBase * DISPLAY_UNITS[unit].factor)}/${unit}`;
};

/** The adapter's input to makeProduct, rebuilt from its output. */
export const feedOf = (p) => ({
  locationId: p.locationId, storeId: p.storeId, id: p.id, name: p.name, brand: p.brand, sizeText: p.sizeText,
  packText: null, listedUnit: null, price: p.price, regularPrice: p.regularPrice, memberPrice: p.memberPrice,
  memberLabel: p.memberLabel, soldBy: p.soldBy,
  estEach: p.soldBy === 'lb' && p.unit?.count?.est ? p.unit.count.perBase : undefined,
  estPkg: p.estPkg, onSale: p.onSale, promo: p.promo, saleEnds: p.saleEnds, image: null, url: p.url, stock: p.stock,
  available: p.available, category: p.category, tags: p.tags, sponsored: p.sponsored, rank: p.rank, total: p.total,
  priceBasis: p.priceBasis,
});

// What only Instacart's unit line and pack line can say is not in the cache, so a row keeps what
// they decided when it was fetched: a "$0.91/oz" line that made an 8.5 lb deli turkey a price per
// pound (unitLineConflict), a "6 x 14.5 oz" line that made the price buy six (listingPack).
const fromListingLines = (c) => !!c && (/listing's own/.test(c.name) || /^\d+ × /.test(c.name));
// ...unless today's size already IS the pack the line describes: BJ's Kerrygold, stated "4 oz" with a
// "6 × 4 oz" line, is six sticks by its slug today (clubButterPack), and the line then agrees with it,
// as listingPack would find in the app.
const packLineAgrees = (c, t) => {
  const m = /^(\d+) × (.+)$/.exec(c.name || '');
  const unit = m && parseSize(m[2]);
  return !!unit && t.dim === unit.dim && t.base > 0 && Math.abs(t.base - +m[1] * unit.base) <= 0.02 * t.base;
};
// A row in conflict gets no slug figure in the app (otherDimFromSlug), so none in its size either.
const withoutSlugFigure = (t) => (Object.values(t.unit || {}).some((u) => u.slug) ? t.size.replace(/ · [^·]+$/, '') : t.size);
export function renormalize(p) {
  const t = makeProduct(feedOf(p));
  if (!t.sizeConflict && fromListingLines(p.sizeConflict) && !packLineAgrees(p.sizeConflict, t)) return { ...t, size: withoutSlugFigure(t), sizeConflict: p.sizeConflict, unit: p.unit, memberUnit: p.memberUnit, carried: 'listing-line conflict' };
  // A pack the name itself counts ("2 Count 15 oz") was worked out from the name, by the code of the
  // day; today's reading of it stands. Only a pack the name cannot explain came from the pack line.
  const ns = sizeFromName(p.name);
  const nameCounts = !!ns && (!!ns.countFirst || !!ns.countAfter || ns.count > 1);
  if (p.sizeSource === 'derived' && t.sizeSource !== 'derived' && p.base > (t.base || 0) && !p.sizeConflict && !t.sizeConflict && !nameCounts) {
    return { ...t, size: p.size, base: p.base, dim: p.dim, sizeSource: p.sizeSource, unit: p.unit, memberUnit: p.memberUnit, carried: 'listing-line pack' };
  }
  return t;
}

/** The production comparison for one query over { storeId: items }. Marks items (implausible). */
export function answer(q, results) {
  const best = bestPerStore(q, results, { prefs: { cardPrices: true } });
  const rows = standings(best.stores);
  const top = rows[0] && best.stores[rows[0].storeId];
  const second = rows[1] && best.stores[rows[1].storeId];
  const claim = top && second ? savingsClaim(top, second) : null;
  return { best, rows, claim, excluded: excludedCheaper(q, results, best, { prefs: { cardPrices: true } }) };
}

/**
 * Read "key\tvalue" lines (sqlite3 ... "select key || char(9) || value ...") into
 * Map(`${zip}\t${q}` -> { storeId -> cached items }). Only default-limit search keys.
 * `want(zip, q)` may skip groups before their JSON is parsed.
 */
export async function readGroups(input, want = () => true) {
  const groups = new Map();
  const rl = readline.createInterface({ input: typeof input === 'string' ? fs.createReadStream(input) : input, crlfDelay: Infinity });
  let entries = 0;
  for await (const line of rl) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const parts = line.slice(0, tab).split(':');
    if (parts.length !== 6 || parts[0] !== 'search') continue;
    const [, , storeId, , zip, q] = parts;
    if (!want(zip, q)) continue;
    let v;
    try { v = JSON.parse(line.slice(tab + 1)); } catch { continue; }
    entries += 1;
    const k = `${zip}\t${q}`;
    if (!groups.has(k)) groups.set(k, {});
    groups.get(k)[storeId] = v.items || [];
  }
  return { groups, entries };
}

export const renormalizeAll = (byStore) => Object.fromEntries(Object.entries(byStore).map(([id, items]) => [id, items.map(renormalize)]));
