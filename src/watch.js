// Price-book check: given one watched item (a query plus optional include/exclude words and a
// unit dimension), find the best matching product at each of the visitor's stores.
//
// The watchlist itself is not stored here any more. A watchlist is a list of things one person
// buys, so it lives in that person's browser along with its history points; this module is a pure
// function of the request. There is no scheduler either: a server timer would be refreshing
// somebody's private list on a server that is not supposed to know it has one.
import { searchStore, withHistory, sourceFor } from './search.js';
import { bestPerStore, searchTextFor, suggestUnit } from '../shared/compare.js';
import { STORE_BY_ID } from '../shared/stores.js';

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function words(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
  if (typeof v === 'string') return words(v.split(','));
  return [];
}

/** Validate the watch spec the browser sent. */
export function normalizeSpec(body = {}) {
  const query = String(body.query ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!query) throw bad('Enter something to watch');
  const dim = ['weight', 'volume', 'count'].includes(body.dim) ? body.dim : null;
  return { query, dim, include: words(body.include), exclude: words(body.exclude) };
}

/**
 * Check one watched item. Returns the same `result` shape the old server-side watch row stored,
 * plus a suggested display unit, and one `point` per store for the browser to append to its own
 * history. Nothing is written to the server except the impersonal product price history that
 * every search already records.
 */
export async function checkWatch(spec, ctx, { fresh = false } = {}) {
  const { query, dim, include, exclude } = normalizeSpec(spec);
  const stores = ctx.stores.filter((s) => sourceFor(s, ctx));
  if (!stores.length) throw bad('None of your stores can be priced — turn on a store that publishes prices');

  const q = searchTextFor(query);
  const results = await Promise.all(stores.map((s) => searchStore(s, q, ctx, { fresh })));
  const byStore = {};
  const errors = {};
  const savedAt = {};
  for (const r of results) {
    if (r.status === 'error') errors[r.storeId] = r.error;
    else if (r.status === 'busy') errors[r.storeId] = r.message;
    byStore[r.storeId] = withHistory(r.items || [], { record: !r.stale });
    if (r.stale) savedAt[r.storeId] = r.savedAt ?? 0;
  }

  const best = bestPerStore(query, byStore, { dim, include, exclude, prefs: ctx });
  const now = Date.now();
  const storesOut = {};
  const points = [];
  let overall = null;
  for (const [storeId, b] of Object.entries(best.stores)) {
    const p = b.item;
    const price = p.memberPrice != null && b.unit.member ? p.memberPrice : p.price;
    storesOut[storeId] = {
      key: p.key, name: p.name, brand: p.brand, size: p.size, price,
      regularPrice: p.regularPrice, onSale: p.onSale, promo: p.promo, unitPerBase: b.unit.perBase, est: b.unit.est, member: b.unit.member,
      memberLabel: p.memberLabel, url: p.url, image: p.image, soldBy: p.soldBy, priceBasis: p.priceBasis, hist: p.hist || null,
      ...(storeId in savedAt ? { savedAt: savedAt[storeId] } : {}),
    };
    // A saved copy is not a new reading: a point stamped now would put a days-old price on today's
    // date in the watch's history, and a drop it never saw could alert.
    if (!(storeId in savedAt)) points.push({ storeId, pkey: p.key, name: p.name, price, unit: b.unit.perBase, onSale: !!p.onSale, t: now });
    if (!overall || b.unit.perBase < overall.unitPerBase) overall = { storeId, unitPerBase: b.unit.perBase };
  }

  let suggestedUnit = null;
  if (best.dim) {
    const items = Object.values(byStore).flat();
    suggestedUnit = suggestUnit(best.dim, items.filter((p) => p.dim === best.dim), query);
  }

  return {
    result: {
      dim: best.dim,
      stores: storesOut,
      errors,
      best: overall ? { ...overall, storeName: STORE_BY_ID[overall.storeId]?.name } : null,
      checkedAt: now,
    },
    points,
    suggestedUnit,
    checkedAt: now,
    error: Object.keys(best.stores).length ? null : 'No matching products found',
  };
}
