// Trip planner: price each item the visitor sends us at every store they asked for (comparable
// amounts), then find the cheapest single store, the best 2- and 3-store splits, and the
// "cherry-pick everything" total.
//
// The shopping list itself is not stored here. It belongs to one person, so it lives in their
// browser and arrives in the request body; this module only does the arithmetic.
import { searchStore, withHistory, sourceFor } from './search.js';
import { bestPerStore, referenceAmount, searchTextFor, scoreItems, BASIS_SPREAD } from '../shared/compare.js';
import { RELEVANT } from '../shared/match.js';
import { mapLimit } from './http.js';
import { LIMITS } from './context.js';

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

const PIN_KEYS = ['storeId', 'key', 'name', 'brand', 'size', 'price', 'unitPerBase', 'dim', 'url', 'image', 'soldBy'];

/** Half a cent: below what any price card can show, so a smaller gap is not a real choice. */
const EPSILON = 0.005;

function pickPinned(p) {
  if (!p || typeof p !== 'object' || !p.storeId || !p.key) return null;
  return Object.fromEntries(PIN_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
}

/**
 * Validate the list the browser sent. Same shape the old `list_items` table produced, so the
 * planner below is unchanged, but every field is re-checked because it is now visitor input.
 */
export function normalizeItems(raw) {
  if (!Array.isArray(raw)) throw bad('Send your list as an array of items');
  const items = raw.filter((it) => it && typeof it === 'object' && !it.done);
  if (!items.length) throw bad('Your list is empty');
  if (items.length > LIMITS.listItems.max) throw bad(`Too many items (max ${LIMITS.listItems.max})`);
  return items.map((it, i) => {
    const text = String(it.text ?? '').trim().slice(0, 120);
    if (!text) throw bad('Every list item needs a name');
    const qty = Math.max(1, Math.min(99, Math.round(Number(it.qty) || 1)));
    // The id is only an echo so the browser can match rows back up; never trusted as a key.
    const id = it.id == null ? i : String(it.id).slice(0, 64);
    return { id, text, qty, pinned: pickPinned(it.pinned) };
  });
}

export async function optimize(rawItems, ctx, { fresh = false } = {}) {
  const items = normalizeItems(rawItems);
  const stores = ctx.stores.filter((s) => sourceFor(s, ctx));
  if (!stores.length) throw bad('None of your stores can be priced — turn on a store that publishes prices');

  const priced = await mapLimit(items, 2, async (it) => {
    const q = searchTextFor(it.text);
    const results = await Promise.all(stores.map((s) => searchStore(s, q, ctx, { fresh })));
    const byStore = {};
    const errors = {};
    const savedAt = {};
    for (const r of results) {
      byStore[r.storeId] = withHistory(r.items || [], { record: !r.stale });
      if (r.stale) savedAt[r.storeId] = r.savedAt ?? 0; // 0: saved, age unknown
      if (r.status === 'error') errors[r.storeId] = r.error;
      else if (r.status === 'busy') errors[r.storeId] = r.message; // not asked (src/guard.js): say so, not "no match"
    }
    return { ...priceItem(it, byStore, stores, ctx, savedAt), errors };
  });

  const plans = plan(priced, stores);
  return { items: priced, stores, plans, generatedAt: Date.now() };
}

/**
 * Cost one list item at every store, from the results those stores returned for it. Pure, so the
 * arithmetic that ends up in a trip total can be tested against captured results.
 */
export function priceItem(it, byStore, stores, ctx = {}, savedAt = {}) {
  const q = searchTextFor(it.text);
  // Score against the words the shopper is shopping for, not the words plus their size. Scored
  // on the raw text, "chicken broth 32 fl oz" made 'fl' the head noun and matched nothing at
  // all, while "chicken broth 32 oz" only matched products whose NAME contained "32" — Costco's
  // "Swanson Chicken Broth, 32 oz, 6-count" among them, which was then billed as 1.5 gal. The
  // size is not lost: referenceAmount reads it from the full text below.
  const best = bestPerStore(q, byStore, { prefs: ctx });
  const relevant = scoreItems(q, Object.values(byStore).flat()).filter((p) => p.score >= RELEVANT && p.dim === best.dim);
  const ref = best.dim ? referenceAmount(it.text, relevant, best.dim) : null;
  const perStore = {};
  for (const [storeId, b] of Object.entries(best.stores)) {
    const p = b.item;
    perStore[storeId] = {
      cost: ref ? round2(b.unit.perBase * ref.base * it.qty) : null,
      est: b.unit.est,
      product: { key: p.key, name: p.name, brand: p.brand, size: p.size, price: b.unit.member ? p.memberPrice : p.price, soldBy: p.soldBy, url: p.url, image: p.image, onSale: p.onSale, promo: p.promo, priceBasis: p.priceBasis },
      // Set when this store did not answer and its saved prices were used: when they were fetched
      // (0 when that is unknown), so the plan can say "saved 5 hours ago" beside the price.
      ...(storeId in savedAt ? { savedAt: savedAt[storeId] } : {}),
    };
  }
  if (it.pinned && stores.includes(it.pinned.storeId)) {
    // A pinned product is only bought at its store
    for (const k of Object.keys(perStore)) if (k !== it.pinned.storeId) delete perStore[k];
    perStore[it.pinned.storeId] = { cost: round2((Number(it.pinned.price) || 0) * it.qty), est: false, pinned: true, product: it.pinned };
  }
  const cheapest = Object.entries(perStore).filter(([, v]) => v.cost != null).sort((a, b) => a[1].cost - b[1].cost)[0]?.[0] || null;
  return { id: it.id, text: it.text, qty: it.qty, query: q, dim: best.dim, ref, perStore, cheapest, pinned: !!it.pinned };
}

function costIn(item, set) {
  let best = null;
  for (const s of set) {
    const c = item.perStore[s]?.cost;
    if (c != null && (best == null || c < best.cost)) best = { storeId: s, cost: c };
  }
  return best;
}

function evaluate(priced, set) {
  let total = 0;
  let low = 0;
  let high = 0;
  let missing = 0;
  const assign = {};
  const bases = new Set();
  for (const it of priced) {
    const b = costIn(it, set);
    if (!b) {
      missing += 1;
      continue;
    }
    total += b.cost;
    assign[it.id] = b.storeId;
    // What each line's price is (shelf, online, chain-wide) travels with the plan, with the range
    // the total could really be in, so "saves $X" between two plans can be judged by the same
    // rules as the best-price line (planSavingsClaim in shared/compare.js) instead of treating an
    // online or a chain-wide dollar as a shelf dollar.
    const cell = it.perStore[b.storeId];
    const basis = cell?.pinned ? 'shelf' : cell?.product?.priceBasis || 'shelf';
    const spread = BASIS_SPREAD[basis] || BASIS_SPREAD.shelf;
    bases.add(basis);
    low += b.cost * (1 - spread.below);
    high += b.cost * (1 + spread.above);
  }
  // `set` is only what we asked about. A plan may name nothing but the stores it actually buys
  // something at — sending someone to a shop the plan buys nothing at is a wrong instruction, and
  // it is what made the two- and three-store options look different when they were the same trip.
  return { stores: [...new Set(Object.values(assign))].sort(), total: round2(total), low: round2(low), high: round2(high), bases: [...bases].sort(), missing, assign };
}

/**
 * Drops every stop that costs nothing to skip. Tied prices are common, and a tie must never buy
 * the shopper an extra drive: if the same total and the same misses survive without a store, that
 * store comes out of the plan.
 */
function trimmed(priced, p) {
  let best = p;
  let changed = true;
  while (changed && best.stores.length > 1) {
    changed = false;
    for (const s of best.stores) {
      const trial = evaluate(priced, best.stores.filter((x) => x !== s));
      if (trial.missing <= best.missing && trial.total <= best.total + 1e-9) {
        best = trial;
        changed = true;
        break;
      }
    }
  }
  return best;
}

/** Strictly better for the shopper: fewer items they can't get, or a total a price card can show. */
function beats(a, b) {
  if (!b) return true;
  return a.missing !== b.missing ? a.missing < b.missing : a.total < b.total - EPSILON;
}

export function plan(priced, stores) {
  const pricedItems = priced.filter((i) => Object.keys(i.perStore).length);
  const singles = stores.map((s) => evaluate(pricedItems, [s])).sort(rank);
  const pairs = [];
  for (let i = 0; i < stores.length; i++) for (let j = i + 1; j < stores.length; j++) pairs.push(evaluate(pricedItems, [stores[i], stores[j]]));
  pairs.sort(rank);
  const triples = [];
  if (stores.length <= 14) {
    for (let i = 0; i < stores.length; i++) for (let j = i + 1; j < stores.length; j++) for (let k = j + 1; k < stores.length; k++) triples.push(evaluate(pricedItems, [stores[i], stores[j], stores[k]]));
    triples.sort(rank);
  }
  let everything = trimmed(pricedItems, evaluate(pricedItems, stores));
  // If a shorter trip matches the cherry-pick total, that shorter trip *is* the cherry-pick. The
  // card must never ask for an extra stop that buys nothing.
  for (const p of [...singles, ...pairs, ...triples]) {
    if (p.missing <= everything.missing && p.total <= everything.total + 1e-9 && p.stores.length < everything.stores.length) everything = p;
  }
  // An option earns a card only if it really makes k stops, beats anything reachable in fewer
  // stops, and is not the cherry-pick plan wearing a smaller label. Otherwise the list shows the
  // same trip at the same price two or three times over, which tells the shopper a third store is
  // worth a stop when it is not.
  const keep = (k, floor) => (p) =>
    p.stores.length === k && beats(p, floor) && (p.stores.length < everything.stores.length || beats(p, everything));
  const triFloor = [singles[0], pairs[0]].filter(Boolean).sort(rank)[0] || null;
  return {
    singles: singles.filter(keep(1, null)),
    pairs: pairs.filter(keep(2, singles[0] || null)).slice(0, 5),
    triples: triples.filter(keep(3, triFloor)).slice(0, 3),
    everything,
    unpriced: priced.length - pricedItems.length,
  };
}

function rank(a, b) {
  return a.missing - b.missing || a.total - b.total;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
