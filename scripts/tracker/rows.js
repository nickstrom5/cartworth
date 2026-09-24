// Turn one term's search results at one ZIP into tracker rows. Pure: no network, no disk.
//
// Everything that decides a price is the product's own code, imported, never re-implemented:
// relevance from shared/match.js, the per-store best comparable item and the implausible-price
// guard from shared/compare.js (bestPerStore, the same call the website makes), unit conversion
// from shared/units.js. When those are fixed, the tracker's next run inherits the fix.
//
// What this file adds is only bookkeeping:
//   * which rows to keep: the top ROWS_PER_STORE by relevance at each store, plus that store's
//     best comparable item if it ranked lower. Nothing is dropped for being flagged or weak — a
//     flagged or low-relevance row that made the cut is kept and MARKED (flags, implausible,
//     low_relevance). What falls outside the cut is counted in the capture record, not silently lost;
//   * the basis, spelled so it cannot be misread: 'online-instacart' is a store's Instacart
//     listing, which runs at or above its shelf price (Jewel's Instacart listing is not the Jewel
//     app or the Jewel shelf);
//   * parser_version on every row.
import { relevance, RELEVANT } from '../../shared/match.js';
import { bestPerStore, unitFor, suggestUnit } from '../../shared/compare.js';
import { toDisplay, DISPLAY_UNITS, defaultDisplayUnit } from '../../shared/units.js';
import { STORE_BY_ID } from '../../shared/stores.js';
import { PREFS, ROWS_PER_STORE } from './config.js';
import { PRICE_COLUMNS, SUMMARY_COLUMNS, priceKey, summaryKey } from './columns.js';

const round = (n, d = 2) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d);
/** A unit price to the cent, or to a tenth of a cent under $1 (24.9c/oz) — no more precision than a shelf tag shows. */
export const roundUnit = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Math.abs(n) >= 0.995 ? round(n, 2) : round(n, 3));

/**
 * The basis a price was read on. Instacart-listed online prices say so in the name of the basis
 * itself; a reader of one CSV cell must not be able to mistake one for a shelf price.
 *   shelf             the store's in-store shelf price (ALDI, Woodman's, Whole Foods, Trader Joe's,
 *                     and Instacart stores whose listing is labelled in-store / "no markup")
 *   online-instacart  the store's own Instacart listing; the store's shelf and its app can be lower
 *   national          a chain-wide Instacart listing (Walmart), not tied to a store near the ZIP
 *   weekly-ad         the store's weekly circular (Flipp), with its own conditions and dates
 */
export function basisOf(item, sourceType) {
  const b = item?.priceBasis || 'shelf';
  if (b === 'online') return sourceType === 'instacart' ? 'online-instacart' : 'online';
  return b;
}

/** One row per product id per store: Instacart can list one product under two item ids. First (best-ranked) wins. */
export function dedupeProducts(items) {
  const seen = new Set();
  const out = [];
  for (const p of items || []) {
    const k = String(p.id ?? p.key);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function flagsOf(r) {
  const f = [];
  if (r.implausible) f.push(`implausible-${r.implausible_direction}${r._unconfirmed ? '-unconfirmed' : ''}`);
  if (r.size_conflict) f.push('size-conflict');
  if (r.low_relevance) f.push('low-relevance');
  if (r.available === false) f.push('unavailable');
  if (r.sponsored) f.push('sponsored');
  if (r.unit_price == null) f.push('no-unit-price');
  return f.join(';');
}

/**
 * @param stores   [{ id, name, source, distance, address, priceNote }] — the directory's priceable stores
 * @param results  { storeId: { items, capturedAt, location } } — ONLY fresh, successful searches
 * @param ads      weekly-ad deals from the product's searchAds (each with storeId and score)
 * @returns { dim, displayUnit, rows, dropped: { storeId: n } }
 */
export function buildTermRows({ term, zip, date, runId, parserVersion, stores, results, ads = [], rowsPerStore = ROWS_PER_STORE, prefs = PREFS }) {
  if (!parserVersion) throw new Error('buildTermRows needs parserVersion');
  const byStore = {};
  for (const [sid, r] of Object.entries(results || {})) byStore[sid] = dedupeProducts((r.items || []).map((p) => ({ ...p })));
  // The product's own answer to "which item is this store's price for <term>": relevant, not
  // implausible, sizes that agree, cheapest per unit. It also stamps .implausible on byStore items.
  const { dim, stores: best } = bestPerStore(term, byStore, { prefs });
  const scored = {};
  const relevantAll = [];
  for (const [sid, items] of Object.entries(byStore)) {
    scored[sid] = items.map((p) => ({ p, score: relevance(term, p) }));
    for (const x of scored[sid]) if (x.score >= RELEVANT) relevantAll.push(x.p);
  }
  const displayUnit = dim ? suggestUnit(dim, relevantAll, term) : null;

  const rows = [];
  const dropped = {};
  const storeById = Object.fromEntries((stores || []).map((s) => [s.id, s]));
  for (const [sid, list] of Object.entries(scored)) {
    const s = storeById[sid] || { id: sid, name: STORE_BY_ID[sid]?.name || sid };
    const r = results[sid];
    const ranked = [...list].sort((a, b) => b.score - a.score || (a.p.rank ?? 1e9) - (b.p.rank ?? 1e9));
    const bestKey = best[sid]?.item?.key ?? null;
    const kept = ranked.slice(0, rowsPerStore);
    if (bestKey && !kept.some((x) => x.p.key === bestKey)) kept.push(ranked.find((x) => x.p.key === bestKey));
    dropped[sid] = ranked.length - kept.length;
    for (const { p, score } of kept) {
      let u = dim ? unitFor(p, dim, prefs) : null;
      let uDim = u ? dim : null;
      if (!u && p.dim) {
        u = unitFor(p, p.dim, prefs);
        uDim = u ? p.dim : null;
      }
      const dispUnit = !uDim ? null : uDim === dim ? displayUnit : defaultDisplayUnit(uDim, p.base ? [p.base] : [], term);
      const row = {
        date,
        captured_at: r?.capturedAt ? new Date(r.capturedAt).toISOString() : null,
        run_id: runId,
        zip,
        term,
        store: s.name || STORE_BY_ID[sid]?.name || sid,
        store_id: sid,
        store_location_id: p.locationId ?? r?.location?.id ?? null,
        store_address: s.address ?? r?.location?.address ?? null,
        store_distance_mi: round(s.distance ?? r?.location?.distance, 1),
        basis: basisOf(p, s.source),
        source: s.source || null,
        price_note: r?.location?.priceNote ?? s.priceNote ?? null,
        product_id: p.id != null ? String(p.id) : null,
        product: p.name,
        brand: p.brand || null,
        size_listed: p.sizeText || null,
        price: round(p.price),
        price_per: p.soldBy === 'lb' ? 'lb' : 'package',
        regular_price: round(p.regularPrice),
        on_sale: !!p.onSale,
        pct_off: p.pctOff ?? null,
        promo: p.promo || null,
        sale_ends: p.saleEnds || null,
        card_price: round(p.memberPrice),
        card_label: p.memberPrice != null ? p.memberLabel || 'Card' : null,
        est_pkg_price: round(p.estPkg),
        available: p.available !== false,
        stock: p.stock || null,
        sponsored: !!p.sponsored,
        search_rank: p.rank ?? null,
        url: p.url || null,
        valid_from: null,
        valid_to: null,
        parser_version: parserVersion,
        unit_price: u ? roundUnit(toDisplay(u.perBase, dispUnit)) : null,
        unit: dispUnit ? DISPLAY_UNITS[dispUnit].label : null,
        unit_price_est: u ? !!u.est : null,
        dim: p.dim || null,
        size_parsed: p.size || null,
        size_source: p.sizeSource || null,
        relevance: round(score, 3),
        low_relevance: score < RELEVANT,
        implausible: !!p.implausible,
        implausible_direction: p.implausible?.direction ?? null,
        implausible_ratio: p.implausible ? round(p.implausible.ratio, 1) : null,
        size_conflict: !!p.sizeConflict,
        is_store_best: !!bestKey && p.key === bestKey,
        _unconfirmed: !!p.implausible?.unconfirmed,
      };
      row.flags = flagsOf(row);
      delete row._unconfirmed;
      rows.push(row);
    }
  }

  // Weekly-ad rows: the circular's own words and dates. No unit price is derived from them (an ad
  // rarely states a size), and they never compete with listed prices: different basis.
  const adsByStore = {};
  for (const d of ads || []) {
    if (!d?.storeId) continue;
    (adsByStore[d.storeId] ||= []).push(d);
  }
  for (const [sid, list] of Object.entries(adsByStore)) {
    const ranked = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    for (const d of ranked.slice(0, rowsPerStore)) {
      const score = d.score ?? relevance(term, { name: d.name, brand: d.brand });
      const row = {
        date,
        captured_at: d.capturedAt ? new Date(d.capturedAt).toISOString() : null,
        run_id: runId,
        zip,
        term,
        store: STORE_BY_ID[sid]?.name || d.merchant || sid,
        store_id: sid,
        store_location_id: d.flyerId != null ? `flyer:${d.flyerId}` : null,
        store_address: null,
        store_distance_mi: null,
        basis: 'weekly-ad',
        source: 'flipp',
        price_note: d.week === 'next' ? "next week's ad" : "this week's ad",
        product_id: d.flippId != null ? `flipp:${d.flippId}` : null,
        product: d.name,
        brand: d.brand || null,
        size_listed: null,
        price: round(d.price),
        price_per: d.perLb ? 'lb' : d.qty > 1 ? `${d.qty}-for` : 'package',
        regular_price: round(d.regular),
        on_sale: true,
        pct_off: d.pctOff ?? null,
        promo: [d.priceText, d.story, d.disclaimer].filter(Boolean).join(' · ') || null,
        sale_ends: d.validTo || null,
        card_price: null,
        card_label: d.needsCard ? 'card required' : d.needsCoupon ? 'digital coupon required' : null,
        est_pkg_price: null,
        available: true,
        stock: null,
        sponsored: false,
        search_rank: null,
        url: null,
        valid_from: d.validFrom || null,
        valid_to: d.validTo || null,
        parser_version: parserVersion,
        unit_price: null,
        unit: null,
        unit_price_est: null,
        dim: null,
        size_parsed: null,
        size_source: null,
        relevance: round(score, 3),
        low_relevance: score < RELEVANT,
        implausible: false,
        implausible_direction: null,
        implausible_ratio: null,
        size_conflict: false,
        is_store_best: false,
      };
      row.flags = flagsOf(row);
      rows.push(row);
    }
  }
  return { dim, displayUnit, rows, dropped };
}

/** A curated Sheet row from a detail row that is its store's best. */
export function curatedRow(r) {
  const out = {};
  for (const c of PRICE_COLUMNS) out[c] = c === 'key' ? priceKey(r) : r[c] ?? null;
  return out;
}

/**
 * daily_summary rows for one ZIP of one run: one per priceable store, from the capture records
 * (every attempt, including failures) and the rows kept.
 */
export function buildSummaryRows({ date, runId, zip, parserVersion, stores, captures, rows, termsTracked }) {
  const out = [];
  for (const s of stores) {
    const caps = captures.filter((c) => c.store_id === s.id);
    const mine = rows.filter((r) => r.store_id === s.id && r.basis !== 'weekly-ad');
    const ads = rows.filter((r) => r.store_id === s.id && r.basis === 'weekly-ad');
    const failed = caps.filter((c) => !['ok', 'empty'].includes(c.status));
    const reasons = [...new Set(failed.map((c) => c.status))];
    const basis = mine[0]?.basis ?? (s.status === 'online' ? (s.source === 'instacart' ? 'online-instacart' : 'online') : s.status);
    const row = {
      date,
      run_id: runId,
      zip,
      store: s.name,
      store_id: s.id,
      basis,
      store_location_id: mine.find((r) => r.store_location_id)?.store_location_id ?? null,
      store_address: s.address ?? null,
      distance_mi: s.distance != null ? round(s.distance, 1) : null,
      price_note: s.priceNote ?? mine.find((r) => r.price_note)?.price_note ?? null,
      terms_tracked: termsTracked,
      terms_ok: caps.filter((c) => c.status === 'ok').length,
      terms_empty: caps.filter((c) => c.status === 'empty').length,
      terms_failed: failed.length,
      rows_kept: mine.length,
      rows_flagged: mine.filter((r) => r.implausible || r.size_conflict || r.low_relevance).length,
      curated_rows: mine.filter((r) => r.is_store_best).length,
      weekly_ad_rows: ads.length,
      note: reasons.length ? `not priced: ${reasons.map((x) => `${x} x${failed.filter((c) => c.status === x).length}`).join(', ')}` : null,
      parser_version: parserVersion,
    };
    row.key = summaryKey(row);
    out.push(Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c, row[c] ?? null])));
  }
  // Chains seen only in the weekly ads (Target, say: it blocks price lookups but publishes a circular).
  const priced = new Set(stores.map((s) => s.id));
  const adOnly = [...new Set(rows.filter((r) => r.basis === 'weekly-ad' && !priced.has(r.store_id)).map((r) => r.store_id))].sort();
  for (const sid of adOnly) {
    const ads = rows.filter((r) => r.store_id === sid && r.basis === 'weekly-ad');
    const row = {
      date, run_id: runId, zip, store: ads[0].store, store_id: sid, basis: 'weekly-ad', weekly_ad_rows: ads.length,
      note: 'weekly ad only: no listed prices are read for this chain', parser_version: parserVersion,
    };
    row.key = summaryKey(row);
    out.push(Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c, row[c] ?? null])));
  }
  return out;
}
