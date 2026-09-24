// Turning a store's search results into ONE comparable product per store.
//
// Order of business for every candidate:
//   1. hard rules from staples.js (category, require/reject regexes, package-size window, stock)
//   2. shared/compare.js bestPerStore() — relevance scoring (include/exclude) + cheapest unit price
// Rules run first because relevance alone is far too generous: infant formula scores 0.96 for
// "milk", and a 40 oz frozen bag scores 0.98 for "boneless skinless chicken breast".
import { bestPerStore } from '../../shared/compare.js';
import { unitFactor } from './staples.js';

// Member/loyalty-card prices are NOT used: the everyday shelf price is the comparable one.
const PREFS = { cardPrices: false, prime: false };

// shared/match.js singular() leaves words ending in "as" alone, so "Bananas" never matches "banana".
const NAME_FIXES = [[/\bbananas\b/gi, 'banana']];

export function matchName(name) {
  let s = String(name || '');
  for (const [re, to] of NAME_FIXES) s = s.replace(re, to);
  return s;
}

/** Keep only the fields the sampler needs, so every candidate can be stored for re-aggregation. */
export function compact(p) {
  const out = {
    id: p.id, name: p.name, brand: p.brand || undefined, size: p.size || undefined,
    sizeText: p.sizeText && p.sizeText !== p.size ? p.sizeText : undefined,
    category: p.category || undefined,
    price: p.price, regularPrice: p.regularPrice ?? undefined, memberPrice: p.memberPrice ?? undefined,
    memberLabel: p.memberLabel || undefined, memberUnit: p.memberUnit ?? undefined,
    dim: p.dim || undefined, base: p.base ?? undefined, soldBy: p.soldBy, unit: p.unit,
    onSale: p.onSale || undefined, promo: p.promo || undefined,
    available: p.available === false ? false : undefined,
    rank: p.rank ?? undefined, total: p.total ?? undefined, priceBasis: p.priceBasis,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** Loose filter deciding which candidates are worth keeping in samples.jsonl. */
export function worthKeeping(staple, p) {
  const text = `${p.brand || ''} ${p.name || ''} ${p.category || ''}`.toLowerCase();
  return (staple.keywords || []).some((k) => text.includes(k));
}

/** Count of units from the product name — ALDI lists a dozen eggs with a "24 oz" size. */
export function countFromName(name) {
  const s = String(name || '');
  let m = s.match(/(\d+)\s*(?:ct\b|count\b|[\s-]pack\b|pk\b)/i);
  if (m) return +m[1];
  m = s.match(/\b(\d+)?\s*dozen\b/i);
  if (m) return (m[1] ? +m[1] : 1) * 12;
  return null;
}

/**
 * Price per base unit for this staple's dimension, or null.
 * Handles eggs, where the usable "size" is a count written in the name.
 */
export function unitPriceFor(staple, p) {
  const dim = staple.dim;
  if (staple.countFromName && dim === 'count') {
    const n = p.dim === 'count' && p.base > 0 ? p.base : countFromName(p.name);
    if (!n || !(p.price > 0)) return null;
    return { perBase: p.price / n, est: false, count: n };
  }
  const u = p.unit?.[dim];
  if (!u || !(u.perBase > 0)) return null;
  return { perBase: u.perBase, est: !!u.est };
}

/**
 * Does this product qualify as the staple? Returns null when it does, otherwise a short reason
 * (reasons are tallied per store so matching problems are visible instead of silent).
 */
export function checkItem(staple, p, sizeWindow = staple.size) {
  if (p.available === false) return 'out-of-stock';
  if (!(p.price > 0)) return 'no-price';

  const text = `${p.brand || ''} ${p.name || ''} | ${p.category || ''}`;
  for (const re of staple.require || []) if (!re.test(text)) return `missing:${re.source.slice(0, 22)}`;
  // requireAny: at least one must match — for products the same chain names two different ways
  // (ALDI sells "Kirkwood Chicken Breasts, per lb", Walmart "Boneless Skinless Chicken Breasts").
  if (staple.requireAny?.length && !staple.requireAny.some((re) => re.test(text))) return 'missing:any-of';
  for (const re of staple.reject || []) if (re.test(text)) return `reject:${re.source.slice(0, 22)}`;

  if (p.category) {
    for (const re of staple.denyCategories || []) if (re.test(p.category)) return `category:${p.category}`;
    if (staple.categories?.length && !staple.categories.some((re) => re.test(p.category))) return `category:${p.category}`;
  }

  const u = unitPriceFor(staple, p);
  if (!u) return 'no-unit-price';
  if (u.est && !staple.allowEst) return 'estimated-size';

  const size = sizeWindow;
  if (size) {
    const n = u.count ?? (p.dim === staple.dim ? p.base : null);
    if (n != null) {
      if (n < size.min || n > size.max) return `size:${n}`;
    } else if (p.soldBy === 'lb' && staple.dim === 'weight') {
      if (!staple.perLb) return 'sold-by-weight';
    } else if (u.est && staple.allowEst) {
      // produce priced each: no package size to check, the weight is estimated
    } else {
      return 'no-size';
    }
  }
  return null;
}

/**
 * Best product for one staple at one store.
 * Returns { pick, considered, accepted, rejected } — pick is null when nothing qualifies.
 */
export function pickBest(staple, items, { basis = null } = {}) {
  // Size tiers keep formats comparable: take the standard pack (a 5 lb bag of potatoes) everywhere
  // it exists and only fall back at stores that don't carry it, instead of letting a 10 lb bag's
  // lower per-pound price masquerade as a cheap state. Most staples have a single window.
  const tiers = staple.sizeTiers?.length ? staple.sizeTiers : [staple.size];
  const considered = items?.length || 0;
  let rejected = {};
  let acceptedCount = 0;
  let chosen = null;
  let orig = null;
  let tier = 0;

  for (let t = 0; t < tiers.length; t++) {
    rejected = {};
    const accepted = [];
    const byKey = new Map();
    for (const p of items || []) {
      const why = checkItem(staple, p, tiers[t]);
      if (why) {
        rejected[why] = (rejected[why] || 0) + 1;
        continue;
      }
      const u = unitPriceFor(staple, p);
      const key = `${p.id}`;
      byKey.set(key, p);
      accepted.push({
        ...p,
        key,
        name: matchName(p.name),
        unit: { ...(p.unit || {}), [staple.dim]: { perBase: u.perBase, est: u.est } },
        dim: p.dim || staple.dim,
      });
    }
    acceptedCount = accepted.length;
    tier = t;
    if (!accepted.length) continue;

    const best = bestPerStore(staple.match, { s: accepted }, {
      dim: staple.dim,
      include: staple.include || [],
      exclude: staple.exclude || [],
      prefs: PREFS,
      minScore: staple.minScore ?? 0.55,
      inStockOnly: true,
    });
    if (best.stores?.s) {
      chosen = best.stores.s;
      orig = byKey.get(chosen.item.key) || chosen.item;
      break;
    }
    rejected['low-relevance'] = accepted.length;
  }

  if (!chosen) return { pick: null, considered, accepted: acceptedCount, rejected };
  const factor = unitFactor(staple);
  return {
    pick: {
      id: orig.id,
      name: orig.name,
      brand: orig.brand || '',
      size: orig.size || orig.sizeText || '',
      category: orig.category || null,
      price: orig.price,
      regularPrice: orig.regularPrice ?? null,
      memberPrice: orig.memberPrice ?? null,
      onSale: !!orig.onSale,
      soldBy: orig.soldBy,
      unitPrice: Math.round(chosen.unit.perBase * factor * 1000) / 1000,
      perBase: chosen.unit.perBase,
      unit: staple.unit,
      est: !!chosen.unit.est,
      score: Math.round(chosen.item.score * 100) / 100,
      priceBasis: basis || orig.priceBasis || null,
      sizeTier: tier || undefined, // >0 means this store had no standard-size pack
    },
    considered,
    accepted: acceptedCount,
    rejected,
  };
}
