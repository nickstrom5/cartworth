#!/usr/bin/env node
// Social-worthy stats from tracker.db — and only the ones the data can honestly support.
//
//   node --disable-warning=ExperimentalWarning scripts/tracker/stats.js [command] [options]
//
// Commands
//   coverage   what history exists: capture days, runs, rows, parser versions
//   changes    same SKU, same store location, same basis: package-price changes over --days N
//   cheapest   per term per ZIP per day: the cheapest store's comparable item, within one basis
//   spread     the identical product (same retailer product id) at different stores, same day, same basis
//   basket     like-for-like basket total, ONLY for stores that have every item in the same basis
//   rows       print raw detail rows (filter with --date --zip --term --store)
//   all        coverage, then every stat (default)
//
// Options: --data-dir DIR | --db FILE, --days N (default 28), --date YYYY-MM-DD (default: latest),
//          --zip Z, --term T, --store ID, --basis B, --terms thanksgiving|staples|a,b,c,
//          --min-pct N (changes; default 1), --limit N, --json
//
// Rules this file enforces rather than trusts:
//   * Every printed stat names its basis, store, ZIP and date range.
//   * Nothing is ever compared across bases. An Instacart listing (online-instacart) runs at or
//     above the shelf, a chain-wide listing (national) is not a local store, and a weekly ad has
//     conditions: a "cheaper" between two of those is not a fact. --basis all is refused.
//   * Unit prices come from the parser; a series that crosses a parser_version boundary is marked,
//     and package-price changes are reported from what the retailer listed, not from the parser.
//   * Weekly-ad rows are never compared with listed prices, and flyer item ids are not SKUs, so
//     they appear in no comparison here.
//   * Each command says how much history it needs to mean anything, and how much there is.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { defaultDataDir, readTerms } from './config.js';
import { rowFromDb } from './trackerdb.js';
import { referenceAmount } from '../../shared/compare.js';
import { parseSize, DISPLAY_UNITS } from '../../shared/units.js';

export const HISTORY = {
  changes: { min: 2, meaningful: 21, need: 'two capture days to show any change; call it a trend ("over six weeks") only with 21+ days of captures' },
  cheapest: { min: 1, meaningful: 14, need: 'one day names that day\'s cheapest store; "usually the cheapest" needs 14+ capture days' },
  spread: { min: 1, meaningful: 1, need: 'a same-day snapshot; it needs one day, and it is only true for that day' },
  basket: { min: 1, meaningful: 1, need: 'a same-day snapshot; "the basket got dearer" needs 14+ days with the same stores complete' },
};

const LISTED = (r) => r.basis !== 'weekly-ad';
const money = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);
/** A unit price as a shelf tag shows it: $3.99/lb, or 24.9¢/oz under a dollar. Never more digits than the row holds. */
const unitMoney = (n) => (n == null ? '—' : Number(n) >= 0.995 ? money(n) : `${(Number(n) * 100).toFixed(1)}¢`);
/** "Brand Product" without saying the brand twice when the retailer's name already starts with it. */
const named = (r) => (r.brand && !String(r.product || '').toLowerCase().startsWith(String(r.brand).toLowerCase()) ? `${r.brand} ${r.product}` : r.product);
const sale = (r) => (r.on_sale ? ` (sale${r.regular_price != null ? `, reg ${money(r.regular_price)}` : ''})` : '');
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const where = (r) => `[${r.basis}] ${r.store}${r.store_location_id ? ` (loc ${r.store_location_id})` : ''} · ZIP ${r.zip}`;

export class CrossBasisError extends Error {}

function checkBasis(basis) {
  if (basis && /^(all|any|\*)$/i.test(basis)) throw new CrossBasisError('Refusing --basis all: prices on different bases are not comparable (shelf vs online-instacart vs national vs weekly-ad). Pick one basis, or leave --basis off to see each basis separately.');
}

// ------------------------------------------------------------------ coverage

export function coverage(rows) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const versions = {};
  for (const r of rows) (versions[r.parser_version] ||= new Set()).add(r.date);
  return {
    days: dates.length,
    first: dates[0] || null,
    last: dates.at(-1) || null,
    rows: rows.length,
    curated: rows.filter((r) => r.is_store_best).length,
    parserVersions: Object.fromEntries(Object.entries(versions).map(([v, s]) => [v, [...s].sort()])),
  };
}

// ------------------------------------------------------------------ same-SKU package-price changes

/**
 * Same product id, same store location, same basis, same pricing unit (package vs per lb).
 * One observation per day (the earliest capture that day). Reports first vs last in the window.
 */
export function skuChanges(rows, { days = 28, endDate = null, minPct = 1 } = {}) {
  const listed = rows.filter((r) => LISTED(r) && r.product_id && r.price != null);
  const end = endDate || listed.map((r) => r.date).sort().at(-1);
  if (!end) return { window: null, changes: [], tracked: 0 };
  const start = addDays(end, -days);
  const groups = new Map();
  for (const r of listed) {
    if (r.date < start || r.date > end) continue;
    const k = [r.store_id, r.store_location_id, r.basis, r.product_id, r.price_per].join('|');
    let g = groups.get(k);
    if (!g) groups.set(k, (g = new Map()));
    const prev = g.get(r.date);
    if (!prev || String(r.captured_at) < String(prev.captured_at)) g.set(r.date, r);
  }
  const changes = [];
  for (const g of groups.values()) {
    if (g.size < HISTORY.changes.min) continue;
    const series = [...g.values()].sort((a, b) => a.date.localeCompare(b.date));
    const first = series[0];
    const last = series.at(-1);
    const change = Math.round((last.price - first.price) * 100) / 100;
    const pct = first.price > 0 ? Math.round((change / first.price) * 1000) / 10 : null;
    if (change === 0 || Math.abs(pct ?? 0) < minPct) continue;
    const reg = (o) => (o.on_sale ? o.regular_price : o.price);
    let kind = 'price change';
    if (!first.on_sale && last.on_sale) kind = 'sale started';
    else if (first.on_sale && !last.on_sale) kind = 'sale ended';
    else if (first.on_sale && last.on_sale) kind = 'sale price changed';
    else kind = 'regular price changed';
    const versions = [...new Set(series.map((o) => o.parser_version))];
    const spanned = daysBetween(first.date, last.date);
    changes.push({
      basis: last.basis, store: last.store, store_id: last.store_id, store_location_id: last.store_location_id,
      zips: [...new Set(series.map((o) => o.zip))], product: last.product, brand: last.brand, size_listed: last.size_listed,
      product_id: last.product_id, price_per: last.price_per,
      from: { date: first.date, price: first.price, on_sale: first.on_sale, regular: reg(first) },
      to: { date: last.date, price: last.price, on_sale: last.on_sale, regular: reg(last) },
      change, pct, kind, observations: series.length, days_spanned: spanned,
      trend_ok: spanned >= HISTORY.changes.meaningful,
      parser_versions: versions, parser_changed: versions.length > 1,
      series: series.map((o) => ({ date: o.date, price: o.price, on_sale: o.on_sale })),
    });
  }
  changes.sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
  return { window: { start, end, days }, changes, tracked: groups.size };
}

// ------------------------------------------------------------------ cheapest store per term per ZIP per day

export function cheapestByDay(rows, { zip = null, term = null, basis = null } = {}) {
  checkBasis(basis);
  const best = rows.filter((r) => r.is_store_best && LISTED(r) && r.unit_price != null && (!zip || r.zip === zip) && (!term || r.term === term) && (!basis || r.basis === basis));
  const groups = new Map();
  for (const r of best) {
    // parser_version and unit are part of the key: a comparison is only ever inside one run's
    // parser and one display unit.
    const k = [r.date, r.zip, r.term, r.basis, r.unit, r.parser_version].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const days = [];
  for (const list of groups.values()) {
    // One row per store (a store location seen from two ZIPs is still one store in this ZIP's list).
    const byStore = new Map();
    for (const r of list) if (!byStore.has(r.store_id) || r.unit_price < byStore.get(r.store_id).unit_price) byStore.set(r.store_id, r);
    const ranked = [...byStore.values()].sort((a, b) => a.unit_price - b.unit_price);
    const [w, second] = ranked;
    const exact = second && !w.unit_price_est && !second.unit_price_est;
    days.push({
      date: w.date, zip: w.zip, term: w.term, basis: w.basis, unit: w.unit, stores: ranked.length,
      winner: w, runnerUp: second || null,
      gapPct: exact && second.unit_price > 0 ? Math.round((1 - w.unit_price / second.unit_price) * 1000) / 10 : null,
    });
  }
  days.sort((a, b) => a.zip.localeCompare(b.zip) || a.term.localeCompare(b.term) || a.basis.localeCompare(b.basis) || a.date.localeCompare(b.date));
  // How often each store won, per ZIP / term / basis.
  const wins = new Map();
  for (const d of days) {
    const k = [d.zip, d.term, d.basis].join('|');
    if (!wins.has(k)) wins.set(k, { zip: d.zip, term: d.term, basis: d.basis, days: 0, first: d.date, last: d.date, byStore: {} });
    const w = wins.get(k);
    w.days += 1;
    w.last = d.date;
    w.byStore[d.winner.store] = (w.byStore[d.winner.store] || 0) + 1;
  }
  return { days, wins: [...wins.values()].map((w) => ({ ...w, meaningful: w.days >= HISTORY.cheapest.meaningful })) };
}

// ------------------------------------------------------------------ identical product, different stores

export function identicalSpread(rows, { date = null, zip = null, basis = null } = {}) {
  checkBasis(basis);
  const listed = rows.filter((r) => LISTED(r) && r.product_id && r.price != null && (!basis || r.basis === basis));
  const day = date || listed.map((r) => r.date).sort().at(-1);
  const groups = new Map();
  for (const r of listed) {
    if (r.date !== day) continue;
    // Same retailer platform (product ids are only shared within one source), same basis, same
    // pricing unit. Instacart product ids are catalog-wide, so the same id at Jewel and at
    // Mariano's is the same item.
    const k = [r.source, r.basis, r.product_id, r.price_per].join('|');
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k);
    const loc = `${r.store_id}|${r.store_location_id}`;
    if (!g.has(loc)) g.set(loc, r);
  }
  const out = [];
  for (const g of groups.values()) {
    const list = [...g.values()];
    if (new Set(list.map((r) => r.store_id)).size < 2) continue;
    if (zip && !list.some((r) => r.zip === zip)) continue;
    list.sort((a, b) => a.price - b.price);
    const lo = list[0];
    const hi = list.at(-1);
    if (hi.price <= lo.price) continue;
    out.push({
      date: day, basis: lo.basis, product: lo.product, brand: lo.brand, size_listed: lo.size_listed, product_id: lo.product_id, price_per: lo.price_per,
      low: lo, high: hi, spread: Math.round((hi.price - lo.price) * 100) / 100, pct: Math.round((1 - lo.price / hi.price) * 1000) / 10, stores: list,
    });
  }
  out.sort((a, b) => b.pct - a.pct);
  return { date: day, items: out };
}

// ------------------------------------------------------------------ like-for-like basket

const UNIT_BY_LABEL = Object.fromEntries(Object.entries(DISPLAY_UNITS).map(([k, v]) => [v.label, { key: k, ...v }]));

/**
 * For one date, ZIP and basis: each store's best comparable item per term, costed at the SAME
 * amount at every store (shared/compare.js referenceAmount, as the product's trip planner does).
 * A store missing any term in this basis is left out and listed with what it was missing.
 */
export function basketTotals(rows, { date = null, zip, basis, terms }) {
  checkBasis(basis);
  if (!zip || !basis) throw new Error('basketTotals needs a zip and a basis');
  const best = rows.filter((r) => r.is_store_best && r.zip === zip && r.basis === basis && r.unit_price != null);
  const day = date || best.map((r) => r.date).sort().at(-1);
  const today = best.filter((r) => r.date === day && terms.includes(r.term));
  const stores = new Map();
  for (const r of today) {
    if (!stores.has(r.store_id)) stores.set(r.store_id, { store: r.store, store_id: r.store_id, items: {} });
    stores.get(r.store_id).items[r.term] = r;
  }
  const complete = [...stores.values()].filter((s) => terms.every((t) => s.items[t]));
  const incomplete = [...stores.values()].filter((s) => !terms.every((t) => s.items[t])).map((s) => ({ store: s.store, missing: terms.filter((t) => !s.items[t]) }));
  if (complete.length < 2) return { date: day, zip, basis, terms, complete: [], incomplete, amounts: {}, note: `${complete.length} store(s) have all ${terms.length} items in ${basis}; a comparison needs two` };
  const amounts = {};
  for (const t of terms) {
    const items = complete.map((s) => s.items[t]);
    const units = new Set(items.map((r) => r.unit));
    if (units.size !== 1) return { date: day, zip, basis, terms, complete: [], incomplete, amounts: {}, note: `"${t}" is priced in different units (${[...units].join(', ')}); not comparable` };
    const u = UNIT_BY_LABEL[items[0].unit];
    const pseudo = items.map((r) => {
      const s = r.price_per === 'lb' ? null : parseSize(r.size_parsed);
      return { dim: u.dim, base: s && !s.perWeight ? s.base : null, soldBy: r.price_per === 'lb' ? 'lb' : 'each' };
    });
    const ref = referenceAmount(t, pseudo, u.dim);
    amounts[t] = { base: ref.base, unit: u.label, amount: Math.round((ref.base / u.factor) * 1000) / 1000, dim: u.dim };
  }
  const totals = complete.map((s) => {
    let total = 0;
    let est = false;
    const lines = terms.map((t) => {
      const r = s.items[t];
      const a = amounts[t];
      const cost = (r.unit_price / UNIT_BY_LABEL[r.unit].factor) * a.base;
      total += cost;
      est ||= !!r.unit_price_est;
      return { term: t, product: r.product, size_listed: r.size_listed, price: r.price, unit_price: r.unit_price, unit: r.unit, amount: a.amount, cost: Math.round(cost * 100) / 100 };
    });
    return { store: s.store, store_id: s.store_id, total: Math.round(total * 100) / 100, includesEstimates: est, lines };
  });
  totals.sort((a, b) => a.total - b.total);
  return { date: day, zip, basis, terms, complete: totals, incomplete, amounts, note: null };
}

// ------------------------------------------------------------------ CLI

function loadRows(dbFile) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const rows = db.prepare('SELECT * FROM observations').all().map(rowFromDb);
  db.close();
  return rows;
}

function termsFor(spec, allRows) {
  if (!spec) return null;
  const all = readTerms();
  const tag = all.filter((t) => t.tags.includes(spec.toLowerCase())).map((t) => t.term);
  if (tag.length) return tag;
  return spec.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function printHistory(kind, days) {
  const h = HISTORY[kind];
  const ok = days >= h.meaningful;
  console.log(`  history: ${days} capture day(s). Needs ${h.need}.${ok ? '' : days >= h.min ? ' → SHORT WINDOW: fine to look at, not yet a claim.' : ' → NOT ENOUGH HISTORY YET.'}`);
}

async function main() {
  const { values: o, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'data-dir': { type: 'string' }, db: { type: 'string' }, days: { type: 'string' }, date: { type: 'string' }, zip: { type: 'string' },
      term: { type: 'string' }, store: { type: 'string' }, basis: { type: 'string' }, terms: { type: 'string' }, 'min-pct': { type: 'string' },
      limit: { type: 'string' }, json: { type: 'boolean', default: false },
    },
  });
  const cmd = positionals[0] || 'all';
  const dbFile = o.db || path.join(o['data-dir'] || process.env.BASKET_DATA_DIR || defaultDataDir(), 'tracker.db');
  if (!fs.existsSync(dbFile)) {
    console.error(`stats: no tracker database at ${dbFile}. Run scripts/tracker/capture.js first, or pass --data-dir / --db.`);
    process.exit(1);
  }
  try {
    checkBasis(o.basis);
  } catch (e) {
    console.error(`stats: ${e.message}`);
    process.exit(2);
  }
  const rows = loadRows(dbFile);
  const limit = Number(o.limit || 15);
  const cov = coverage(rows);
  const out = {};
  const want = (c) => cmd === c || cmd === 'all';
  const J = o.json;

  if (want('coverage')) {
    out.coverage = cov;
    if (!J) {
      console.log(`\nCOVERAGE  ${dbFile}`);
      console.log(`  ${cov.days} capture day(s)${cov.first ? ` · ${cov.first} .. ${cov.last}` : ''} · ${cov.rows} rows · ${cov.curated} curated`);
      for (const [v, ds] of Object.entries(cov.parserVersions)) console.log(`  parser ${v}: ${ds.length} day(s), ${ds[0]} .. ${ds.at(-1)}`);
      console.log('  Every number here is a snapshot of a retailer listing. Re-check it live the same day before posting.');
    }
  }
  if (want('changes')) {
    const r = skuChanges(rows.filter((x) => (!o.zip || x.zip === o.zip) && (!o.term || x.term === o.term) && (!o.store || x.store_id === o.store) && (!o.basis || x.basis === o.basis)), { days: Number(o.days || 28), endDate: o.date || null, minPct: Number(o['min-pct'] ?? 1) });
    out.changes = r;
    if (!J) {
      console.log(`\nSAME-SKU PACKAGE-PRICE CHANGES${r.window ? ` · ${r.window.start} .. ${r.window.end}` : ''} · same product id, same store location, same basis`);
      printHistory('changes', cov.days);
      if (!r.changes.length) console.log(`  none (${r.tracked} SKU series in the window)`);
      for (const c of r.changes.slice(0, limit)) {
        console.log(`  [${c.basis}] ${c.store}${c.store_location_id ? ` (loc ${c.store_location_id})` : ''} · ZIP ${c.zips.join('/')} · ${c.from.date} .. ${c.to.date}: ${named(c)}${c.size_listed ? ` (${c.size_listed})` : ''} ${money(c.from.price)} → ${money(c.to.price)}${c.price_per === 'lb' ? '/lb' : ''} (${c.change > 0 ? '+' : ''}${c.pct}%) · ${c.kind} · ${c.observations} obs over ${c.days_spanned} d${c.trend_ok ? '' : ' · short window'}${c.parser_changed ? ` · PARSER CHANGED (${c.parser_versions.join(' → ')}): verify` : ''}`);
      }
    }
  }
  if (want('cheapest')) {
    const r = cheapestByDay(rows, { zip: o.zip, term: o.term, basis: o.basis });
    out.cheapest = r;
    if (!J) {
      console.log('\nCHEAPEST COMPARABLE STORE, PER TERM, PER ZIP, PER DAY · within one basis only · unit price of the price anyone pays (no card, no membership)');
      printHistory('cheapest', cov.days);
      const latest = o.date || r.days.map((d) => d.date).sort().at(-1);
      for (const d of r.days.filter((x) => x.date === latest).slice(0, cmd === 'cheapest' ? 10000 : limit)) {
        const w = d.winner;
        console.log(`  [${d.basis}] ZIP ${d.zip} · ${d.date} · "${d.term}": ${w.store}${w.store_location_id ? ` (loc ${w.store_location_id})` : ''} ${named(w)} (${w.size_listed ?? '?'} listed) ${money(w.price)}${w.price_per === 'lb' ? '/lb' : ''}${sale(w)} = ${unitMoney(w.unit_price)}/${d.unit}${w.unit_price_est ? ' (est.)' : ''}${d.runnerUp ? ` · next ${d.runnerUp.store} ${unitMoney(d.runnerUp.unit_price)}/${d.unit}${sale(d.runnerUp)}${d.gapPct != null ? ` (${d.gapPct}% less)` : ' (estimate involved: no % claimed)'}` : ' · only store in this basis'} · of ${d.stores} store(s)`);
      }
      for (const w of r.wins.filter((x) => x.days > 1).slice(0, limit)) {
        console.log(`  [${w.basis}] ZIP ${w.zip} · ${w.first} .. ${w.last} · "${w.term}" cheapest: ${Object.entries(w.byStore).map(([s, n]) => `${s} ${n}/${w.days} days`).join(', ')}${w.meaningful ? '' : ' · short window'}`);
      }
    }
  }
  if (want('spread')) {
    const r = identicalSpread(rows, { date: o.date, zip: o.zip, basis: o.basis });
    out.spread = r;
    if (!J) {
      console.log(`\nSAME PRODUCT, DIFFERENT STORES · ${r.date || 'no data'} · same retailer product id, same basis, package price as listed`);
      printHistory('spread', cov.days);
      if (!r.items.length) console.log('  none: no product id was listed at two stores on the same basis that day');
      for (const s of r.items.slice(0, limit)) {
        console.log(`  [${s.basis}] ${s.date} · ${named(s)}${s.size_listed ? ` (${s.size_listed})` : ''}: ${money(s.low.price)}${sale(s.low)} at ${s.low.store} (ZIP ${s.low.zip}) vs ${money(s.high.price)}${sale(s.high)} at ${s.high.store} (ZIP ${s.high.zip}) — ${s.pct}% less · ${s.stores.length} listings`);
      }
    }
  }
  if (want('basket')) {
    const spec = o.terms || 'thanksgiving';
    const terms = termsFor(spec, rows);
    const zips = o.zip ? [o.zip] : [...new Set(rows.map((r) => r.zip))].sort();
    const bases = o.basis ? [o.basis] : [...new Set(rows.filter((r) => r.is_store_best && LISTED(r)).map((r) => r.basis))].sort();
    out.basket = [];
    if (!J) {
      console.log(`\nLIKE-FOR-LIKE BASKET (${spec}: ${terms.length} items) · each item costed at the same amount at every store · only stores with EVERY item in the same basis`);
      printHistory('basket', cov.days);
    }
    for (const zip of zips) {
      for (const basis of bases) {
        const b = basketTotals(rows, { date: o.date, zip, basis, terms });
        out.basket.push(b);
        if (J) continue;
        if (!b.complete.length) {
          console.log(`  [${basis}] ZIP ${zip} · ${b.date || '—'}: no comparison — ${b.note}${b.incomplete.length ? `; closest: ${b.incomplete.sort((x, y) => x.missing.length - y.missing.length).slice(0, 3).map((s) => `${s.store} missing ${s.missing.length}`).join(', ')}` : ''}`);
          continue;
        }
        console.log(`  [${basis}] ZIP ${zip} · ${b.date}: ${b.complete.map((s) => `${s.store} ${money(s.total)}${s.includesEstimates ? ' (incl. estimates)' : ''}`).join(' · ')}${b.incomplete.length ? ` · left out (missing items): ${b.incomplete.map((s) => s.store).join(', ')}` : ''}`);
      }
    }
  }
  if (cmd === 'rows') {
    const sel = rows.filter((r) => (!o.date || r.date === o.date) && (!o.zip || r.zip === o.zip) && (!o.term || r.term === o.term) && (!o.store || r.store_id === o.store) && (!o.basis || r.basis === o.basis));
    out.rows = sel;
    if (!J) {
      for (const r of sel) {
        console.log(`  ${where(r)} · ${r.date} ${String(r.captured_at).slice(11, 19)}Z · "${r.term}" · ${r.brand ? `${r.brand} | ` : ''}${r.product} | size listed "${r.size_listed ?? ''}" | ${money(r.price)}${r.price_per === 'lb' ? '/lb' : ''}${r.regular_price != null ? ` (reg ${money(r.regular_price)})` : ''}${r.on_sale ? ' SALE' : ''}${r.promo ? ` | promo "${r.promo}"` : ''}${r.card_price != null ? ` | ${r.card_label} ${money(r.card_price)}` : ''} | unit ${r.unit_price != null ? `${unitMoney(r.unit_price)}/${r.unit}${r.unit_price_est ? ' est.' : ''}` : '—'} | rel ${r.relevance}${r.flags ? ` | flags ${r.flags}` : ''}${r.is_store_best ? ' | STORE BEST (curated)' : ''} | id ${r.product_id} | ${r.parser_version}${r.price_note ? ` | note "${r.price_note}"` : ''}`);
      }
      console.log(`  ${sel.length} row(s)`);
    }
  }
  if (J) console.log(JSON.stringify(out, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scripts/tracker/stats.js')) {
  main().catch((e) => {
    console.error(e instanceof CrossBasisError ? `stats: ${e.message}` : e);
    process.exit(e instanceof CrossBasisError ? 2 : 1);
  });
}
