#!/usr/bin/env node
// Rebuild stats/stats.json (plus store-picks.json and aggregate-log.json) from stats/samples.jsonl.
//
//   node --disable-warning=ExperimentalWarning scripts/sampler/aggregate.js [--run YYYY-MM-DD] [--facts N]
//
// Samples keep every plausible candidate, so this re-runs the staples.js matching rules from scratch:
// fix a matching problem in staples.js and re-run this — no new requests are made.
import {
  SAMPLES_FILE, STATS_FILE, PICKS_FILE, LOG_FILE,
  parseArgs, readJSONL, writeJSON, median, roundPrice,
} from './util.js';
import { STAPLES, STAPLE_BY_ID } from './staples.js';
import { CHAINS } from './retailers.js';
import { pickBest } from './match.js';
import { buildFacts } from './facts.js';

const OUTLIER_HIGH = 3;      // > 3x the national median is a bad match, not a price
const OUTLIER_LOW = 0.3;     // < 0.3x likewise
const MIN_STATE_STORES = 2;  // a state reported from a single store isn't a claim worth publishing

function cheapest(entries) {
  return entries.reduce((a, b) => (a == null || b.price < a.price ? b : a), null);
}

/** "4893 Lone Tree Way, Antioch, CA 94531" -> "Antioch" */
function cityFromAddress(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[parts.length - 2] : null;
}

/**
 * Which city to name in a fact. The ZIP's metro is the recognisable label, but some chains serve a
 * ZIP from well outside it (the "San Francisco" Walmart is 35 miles away in another town), and a
 * fact must not put a store in a city it isn't in.
 */
function cityLabel(sample, shopInfo) {
  const info = shopInfo.get(`${sample.zip}|${sample.chain}`);
  const far = (sample.distance ?? info?.distance ?? 0) > 15;
  const real = cityFromAddress(info?.address);
  return far && real ? real : sample.city;
}

export function aggregate({ run = null, factsMax = 24, verbose = false } = {}) {
  const rows = readJSONL(SAMPLES_FILE);
  const samples = rows.filter((r) => r.type !== 'shop');
  const shops = rows.filter((r) => r.type === 'shop');
  if (!samples.length) throw new Error(`No samples in ${SAMPLES_FILE} — run scripts/sampler/run.js first`);

  const runId = run || samples.map((s) => s.run).sort().at(-1);
  const inRun = samples.filter((s) => s.run === runId);

  // Latest record wins for each ZIP+chain+staple.
  const latest = new Map();
  for (const s of inRun) {
    const key = `${s.zip}|${s.chain}|${s.item}`;
    const prev = latest.get(key);
    if (!prev || String(s.at) > String(prev.at)) latest.set(key, s);
  }

  const shopInfo = new Map();
  for (const s of shops) if (s.ok !== false) shopInfo.set(`${s.zip}|${s.chain}`, { address: s.address, distance: s.distance, name: s.name });

  const log = { run: runId, generatedAt: new Date().toISOString(), outliers: [], noMatch: [], warnings: [] };
  const picks = [];
  const byItem = new Map(STAPLES.map((s) => [s.id, []]));
  const zipsSeen = new Set();
  const statesSeen = new Set();
  const chainsSeen = new Set();
  let errors = 0;

  for (const s of latest.values()) {
    zipsSeen.add(s.zip);
    statesSeen.add(s.state);
    if (s.status === 'error') {
      errors += 1;
      continue;
    }
    const staple = STAPLE_BY_ID[s.item];
    if (!staple || !byItem.has(s.item)) continue;
    // Re-run matching from the stored candidates so staples.js changes apply retroactively.
    const r = s.candidates ? pickBest(staple, s.candidates, { basis: s.basis }) : { pick: s.pick, rejected: s.rejected || {} };
    if (!r.pick) {
      log.noMatch.push({
        item: s.item, state: s.state, city: s.city, chain: s.chainName, results: s.results ?? 0,
        reasons: Object.entries(r.rejected || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`),
      });
      continue;
    }
    chainsSeen.add(s.chain);
    const entry = {
      item: s.item, state: s.state, city: cityLabel(s, shopInfo), zip: s.zip,
      chain: s.chain, chainName: s.chainName || CHAINS[s.chain]?.name || s.chain,
      parent: s.parent || CHAINS[s.chain]?.parent || null,
      basis: r.pick.priceBasis || s.basis || 'online',
      price: roundPrice(r.pick.unitPrice),
      packagePrice: r.pick.price,
      product: `${r.pick.brand && !r.pick.name.startsWith(r.pick.brand) ? r.pick.brand + ' ' : ''}${r.pick.name}`.trim(),
      size: r.pick.size || null,
      onSale: !!r.pick.onSale,
      est: !!r.pick.est,
      store: s.shopName || null,
      at: s.at,
    };
    byItem.get(s.item).push(entry);
  }

  const items = [];
  for (const staple of STAPLES) {
    let entries = byItem.get(staple.id) || [];
    if (!entries.length) continue;

    // ---- outliers: clearly-wrong matches, not real prices ----
    const med0 = median(entries.map((e) => e.price));
    const kept = [];
    for (const e of entries) {
      const ratio = e.price / med0;
      if (ratio > OUTLIER_HIGH || ratio < OUTLIER_LOW) {
        log.outliers.push({ ...e, nationalMedian: roundPrice(med0), ratio: Math.round(ratio * 100) / 100, reason: ratio > OUTLIER_HIGH ? 'too high' : 'too low' });
        continue;
      }
      kept.push(e);
    }
    entries = kept;
    if (!entries.length) continue;

    // ---- per state ----
    // A state needs at least MIN_STATE_STORES priced stores to be reported at all: a "cheapest
    // state" built on one store is not a claim worth publishing. Dropped states leave the item
    // entirely (national figures too) so every number in an item covers the same set of samples.
    const byState = new Map();
    for (const e of entries) {
      if (!byState.has(e.state)) byState.set(e.state, []);
      byState.get(e.state).push(e);
    }
    for (const [code, list] of [...byState]) {
      if (list.length < MIN_STATE_STORES) {
        byState.delete(code);
        log.warnings.push({ kind: 'thin-state', item: staple.id, state: code, stores: list.length, note: `dropped: fewer than ${MIN_STATE_STORES} priced stores` });
      }
    }
    entries = [...byState.values()].flat();
    if (!entries.length) continue;
    picks.push(...entries);

    const states = {};
    for (const [code, list] of byState) {
      // min / median / max all come from the SAME list, so min <= median <= max always holds.
      const min = cheapest(list);
      const max = list.reduce((a, b) => (a == null || b.price > a.price ? b : a), null);
      const shelf = list.filter((e) => e.basis === 'shelf');
      const online = list.filter((e) => e.basis === 'online');
      const shelfMin = shelf.length ? cheapest(shelf) : null;
      const baseline = list.filter((e) => e.chain === 'target').sort((a, b) => a.price - b.price)[0];
      states[code] = {
        median: roundPrice(median(list.map((e) => e.price))),
        min: min.price,
        max: max.price,
        minStore: min.chainName,
        minCity: min.city,
        stores: list.length,
        basis: min.basis,
        minProduct: min.product,
        onSale: min.onSale || undefined,
        est: min.est || undefined,
        // Shelf prices kept as their own, clearly-named fields — they never redefine `min`.
        shelfStores: shelf.length,
        shelfMin: shelfMin ? shelfMin.price : undefined,
        shelfMinStore: shelfMin ? shelfMin.chainName : undefined,
        shelfMinCity: shelfMin ? shelfMin.city : undefined,
        shelfMedian: shelf.length ? roundPrice(median(shelf.map((e) => e.price))) : undefined,
        onlineMin: online.length ? cheapest(online).price : undefined,
        onlineMedian: online.length ? roundPrice(median(online.map((e) => e.price))) : undefined,
        baseline: baseline ? baseline.price : undefined,
      };
    }

    const codes = Object.keys(states);
    const byMin = [...codes].sort((a, b) => states[a].min - states[b].min || states[a].median - states[b].median);
    const cheapestState = byMin[0];
    const priciestState = byMin.at(-1);

    // ---- chains ----
    const chains = {};
    for (const e of entries) {
      const c = (chains[e.chainName] ??= { stores: 0, prices: [], wins: 0, states: new Set(), basis: e.basis });
      c.stores += 1;
      c.prices.push(e.price);
      c.states.add(e.state);
    }
    // "Cheapest chain": in how many states did this chain have the lowest price we found?
    for (const [, list] of byState) {
      const lowest = Math.min(...list.map((e) => e.price));
      const winners = new Set(list.filter((e) => e.price <= lowest + 1e-9).map((e) => e.chainName));
      for (const w of winners) chains[w].wins += 1;
    }
    const chainOut = {};
    for (const [name, c] of Object.entries(chains)) {
      chainOut[name] = { median: roundPrice(median(c.prices)), stores: c.stores, states: c.states.size, wins: c.wins, basis: c.basis };
    }
    const bestChain = Object.entries(chainOut).sort((a, b) => b[1].wins - a[1].wins || b[1].states - a[1].states || a[1].median - b[1].median)[0];

    // ---- baseline chain (Target is the only chain in all 51 jurisdictions) ----
    const baselineEntries = entries.filter((e) => e.chain === 'target');
    const baselineByState = new Map();
    for (const e of baselineEntries) {
      const cur = baselineByState.get(e.state);
      if (!cur || e.price < cur.price) baselineByState.set(e.state, e);
    }
    const baselineSorted = [...baselineByState.values()].sort((a, b) => a.price - b.price);
    const baseline = baselineSorted.length >= 2 ? {
      chain: 'Target',
      basis: baselineSorted[0].basis,
      states: baselineSorted.length,
      median: roundPrice(median(baselineSorted.map((e) => e.price))),
      cheapestState: baselineSorted[0].state,
      cheapestPrice: baselineSorted[0].price,
      priciestState: baselineSorted.at(-1).state,
      priciestPrice: baselineSorted.at(-1).price,
    } : undefined;

    const prices = entries.map((e) => e.price);
    const lowNat = cheapest(entries);
    const highNat = entries.reduce((a, b) => (a == null || b.price > a.price ? b : a), null);
    const shelfNat = entries.filter((e) => e.basis === 'shelf');
    const shelfLow = shelfNat.length ? cheapest(shelfNat) : null;
    // How much weight the superlatives can carry — the app gates "cheapest state" copy on this.
    const confidence = codes.length >= 25 && entries.length >= 60 ? 'high'
      : codes.length >= 10 && entries.length >= 25 ? 'medium'
        : 'low';

    items.push({
      id: staple.id,
      label: staple.label,
      noun: staple.noun,
      plural: staple.plural || undefined,
      unit: staple.unit,
      unitText: staple.unitText,
      national: {
        median: roundPrice(median(prices)),
        min: lowNat.price,
        max: highNat.price,
        stores: entries.length,
        states: codes.length,
        minState: lowNat.state, minStore: lowNat.chainName, minCity: lowNat.city, minBasis: lowNat.basis,
        maxState: highNat.state, maxStore: highNat.chainName, maxCity: highNat.city, maxBasis: highNat.basis,
        shelfStores: shelfNat.length,
        shelfMin: shelfLow ? shelfLow.price : undefined,
        shelfMinState: shelfLow ? shelfLow.state : undefined,
        shelfMinStore: shelfLow ? shelfLow.chainName : undefined,
        shelfMinCity: shelfLow ? shelfLow.city : undefined,
        shelfMedian: shelfNat.length ? roundPrice(median(shelfNat.map((e) => e.price))) : undefined,
        onlineMedian: roundPrice(median(entries.filter((e) => e.basis === 'online').map((e) => e.price))) ?? undefined,
      },
      states,
      confidence,
      cheapestState,
      priciestState,
      cheapestChain: bestChain ? { name: bestChain[0], wins: bestChain[1].wins, of: bestChain[1].states } : undefined,
      chains: chainOut,
      baseline,
      discarded: log.outliers.filter((x) => x.item === staple.id).length || undefined,
    });
  }

  if (!items.length) throw new Error('Nothing could be aggregated — every sample was unmatched or an outlier');

  // ---- self-check: min <= median <= max everywhere, and superlatives point at real states ----
  const EPS = 1e-9;
  for (const item of items) {
    const check = (scope, b) => {
      if (!(b.min <= b.median + EPS && b.median <= b.max + EPS)) {
        log.warnings.push({ kind: 'range-invariant', item: item.id, scope, min: b.min, median: b.median, max: b.max });
      }
    };
    check('national', item.national);
    for (const [code, st] of Object.entries(item.states)) check(code, st);
    for (const [label, code] of [['cheapestState', item.cheapestState], ['priciestState', item.priciestState]]) {
      if (code && !item.states[code]) log.warnings.push({ kind: 'missing-state', item: item.id, scope: label, state: code });
    }
    const cheapVal = item.states[item.cheapestState]?.min;
    if (cheapVal != null && cheapVal > item.national.median + EPS) {
      log.warnings.push({ kind: 'cheapest-above-median', item: item.id, state: item.cheapestState, min: cheapVal, nationalMedian: item.national.median });
    }
  }
  const invariantFailures = log.warnings.filter((w) => w.kind === 'range-invariant' || w.kind === 'missing-state').length;

  const stats = {
    version: 1,
    generatedAt: new Date().toISOString(),
    weekOf: runId,
    coverage: {
      states: statesSeen.size,
      zips: zipsSeen.size,
      chains: chainsSeen.size,
      stores: new Set(picks.map((p) => `${p.zip}|${p.chain}`)).size,
      samples: latest.size,
      priced: picks.length,
      noMatch: log.noMatch.length,
      errors,
      shelfStores: new Set(picks.filter((p) => p.basis === 'shelf').map((p) => `${p.zip}|${p.chain}`)).size,
      shopsChecked: new Set(shops.map((s) => `${s.zip}|${s.chain}`)).size,
      invariantFailures,
    },
    notes: {
      basis: 'shelf = in-store shelf price (ALDI in-store shops, Walmart "No markups" on Instacart). online = Instacart marketplace price, which Instacart labels "Prices vary from in-store" and which can run above the shelf price.',
      prices: 'Sale prices count; loyalty-card prices do not. Each state figure is the best price found at the sampled stores in that state\'s largest metro(s), not a statewide average.',
      min: 'Within any one scope (a state block, or national) min, median and max are computed over the same set of priced stores, so min <= median <= max always holds. Shelf-only figures are the separate shelfMin/shelfMedian fields and never redefine min.',
      states: `Only states with at least ${MIN_STATE_STORES} priced stores are reported; item.confidence (low/medium/high) reflects how many states and stores back the superlatives.`,
    },
    items,
    facts: [],
  };
  stats.facts = buildFacts(stats, { max: factsMax });

  writeJSON(STATS_FILE, stats);
  writeJSON(PICKS_FILE, { weekOf: runId, generatedAt: stats.generatedAt, picks: picks.sort((a, b) => a.item.localeCompare(b.item) || a.state.localeCompare(b.state) || a.price - b.price) });
  writeJSON(LOG_FILE, log);

  if (verbose) {
    console.log(`Aggregated week of ${runId}: ${items.length} staples · ${stats.coverage.priced} store prices · ${stats.coverage.states} states · ${stats.coverage.stores} stores (${stats.coverage.shelfStores} shelf-priced)`);
    if (log.outliers.length) console.log(`Discarded ${log.outliers.length} outlier(s) — see stats/aggregate-log.json`);
    if (log.noMatch.length) console.log(`${log.noMatch.length} store/staple combination(s) had no qualifying product — see stats/aggregate-log.json`);
    const thin = log.warnings.filter((w) => w.kind === 'thin-state').length;
    if (thin) console.log(`Dropped ${thin} state block(s) with fewer than ${MIN_STATE_STORES} priced stores — see stats/aggregate-log.json`);
    console.log(invariantFailures
      ? `SELF-CHECK FAILED: ${invariantFailures} min/median/max or missing-state violation(s) — see stats/aggregate-log.json`
      : 'Self-check passed: min <= median <= max for every state and national block.');
    console.log(`Wrote stats/stats.json (${stats.facts.length} facts), stats/store-picks.json, stats/aggregate-log.json`);
  }
  return stats;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  try {
    aggregate({ run: args.run || null, factsMax: +(args.facts || 24), verbose: true });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
