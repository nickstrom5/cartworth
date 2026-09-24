// One capture run, with the product's pipeline injected (capture.js passes the real
// src/directory.js and src/search.js; tests pass fakes). No network code lives here.
//
// For each ZIP: ask the product's directory which stores within the radius can be priced, then
// for each term price it at every one of those stores with the product's own searchStore, and
// read the weekly ads with the product's searchAds. Stores are grouped into lanes by the host
// that serves them, lanes run side by side, and within a lane stores go one at a time — so no
// host ever has a queue building up behind the limiter, and the product's own request timeouts
// never start ticking while a request waits its turn.
import { buildTermRows, buildSummaryRows } from './rows.js';

const PRICEABLE = new Set(['shelf', 'online', 'national']);
const SOURCE_HOSTS = { wholefoods: 'www.wholefoodsmarket.com', traderjoes: 'www.traderjoes.com', kroger: 'api.kroger.com' };
export const ADS_HOST = 'backflipp.wishabi.com';

export function hostForSource(src) {
  if (!src) return null;
  if (src.base) {
    try {
      return new URL(src.base).host;
    } catch {
      return null;
    }
  }
  return SOURCE_HOSTS[src.type] || src.type || null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param deps { directory(zip, {maxMiles, fresh}), searchStore(id, term, settings, {fresh}), searchAds(term, settings), sourceFor(id, settings) }
 * @param store  makeStore(openTrackerDb(...))
 * @param limiter  createHostLimiter(...) — consulted so a closed host is skipped and recorded, not retried
 */
export async function runCapture({
  deps,
  store,
  limiter,
  zips,
  terms,
  date,
  runId,
  parserVersion,
  maxMiles = 25,
  resultsPerStore = 36,
  rowsPerStore = 5,
  withAds = true,
  directoryRetryMs = 20000,
  log = () => {},
  now = Date.now,
}) {
  const summary = { zips: [], rows: 0, curated: 0, captures: 0, failed: 0, summaryRows: [] };
  for (const zip of zips) {
    const zinfo = { zip, stores: 0, error: null, unresolved: [] };
    summary.zips.push(zinfo);
    let dir;
    try {
      dir = await deps.directory(zip, { maxMiles });
      for (let i = 0; i < 2 && dir?.unresolved?.length; i++) {
        log(`  ${zip}: ${dir.unresolved.length} chain(s) did not answer (${dir.unresolved.join(', ')}); asking again in ${Math.round(directoryRetryMs / 1000)}s`);
        await wait(directoryRetryMs);
        dir = await deps.directory(zip, { maxMiles, fresh: true });
      }
    } catch (err) {
      zinfo.error = `directory failed: ${String(err?.message || err).slice(0, 200)}`;
      log(`  ${zip}: ${zinfo.error}`);
      summary.summaryRows.push(zoneRow({ date, runId, zip, parserVersion, note: zinfo.error }));
      continue;
    }
    zinfo.unresolved = dir.unresolved || [];
    const settings = {
      zip,
      // Every chain the directory lists, including ads-only ones: searchAds reads circulars for these.
      stores: (dir.chains || []).map((c) => c.id),
      prime: false,
      cardPrices: false,
      maxMiles,
      resultsPerStore,
      overrides: {},
      kroger: { clientId: '', clientSecret: '' },
    };
    const stores = (dir.chains || [])
      .filter((c) => PRICEABLE.has(c.status))
      .map((c) => {
        const src = deps.sourceFor(c.id, settings);
        return { id: c.id, name: c.name, status: c.status, distance: c.distance ?? null, address: c.address ?? null, priceNote: c.priceNote ?? null, source: src?.type || null, host: hostForSource(src) };
      })
      .filter((s) => s.source);
    zinfo.stores = stores.length;
    store.recordStores(runId, zip, stores);
    log(`  ${zip} (${dir.city || ''} ${dir.state || ''}): ${stores.length} priceable stores within ${maxMiles} mi — ${stores.map((s) => `${s.id}[${s.status}]`).join(' ')}${zinfo.unresolved.length ? ` · still unanswered: ${zinfo.unresolved.join(', ')}` : ''}`);

    const lanes = new Map();
    for (const s of stores) {
      if (!lanes.has(s.host)) lanes.set(s.host, []);
      lanes.get(s.host).push(s);
    }

    const zipRows = [];
    const zipCaptures = [];
    for (const { term } of terms) {
      const t0 = now();
      const results = {};
      const captures = [];
      const laneJobs = [...lanes].map(async ([host, list]) => {
        for (const s of list) {
          const cap = { run_id: runId, date, zip, term, store_id: s.id, status: null, error: null, results_total: 0, rows_kept: 0, not_kept: 0, captured_at: null, ms: 0 };
          captures.push(cap);
          if (host && limiter?.isClosed(host)) {
            cap.status = 'host-closed';
            cap.error = `${host} closed earlier in this run (${limiter.closedHosts()[host]?.reason}); not asked`;
            continue;
          }
          const started = now();
          let r;
          try {
            r = await deps.searchStore(s.id, term, settings, { fresh: true });
          } catch (err) {
            r = { status: 'error', items: [], error: String(err?.message || err) };
          }
          cap.ms = now() - started;
          cap.captured_at = new Date(now()).toISOString();
          cap.results_total = r.items?.length || 0;
          cap.status = r.status || 'error';
          cap.error = r.error || r.message || null;
          if (r.stale) {
            // The live search failed and the product fell back to a cached answer up to three days
            // old. That is not today's price, so it is not recorded as one.
            cap.status = 'stale-refused';
            cap.error = `live search failed (${r.stale}); a cached answer was offered and not recorded`;
          } else if (cap.status === 'error' && host && limiter?.isClosed(host)) {
            cap.status = 'host-closed';
          } else if (cap.status === 'ok') {
            results[s.id] = { items: r.items, capturedAt: now(), location: r.location || null };
          }
        }
      });
      let ads = [];
      let adsCap = null;
      const adsJob = (async () => {
        if (!withAds || !deps.searchAds) return;
        adsCap = { run_id: runId, date, zip, term, store_id: '_weekly_ads', status: null, error: null, results_total: 0, rows_kept: 0, not_kept: 0, captured_at: null, ms: 0 };
        if (limiter?.isClosed(ADS_HOST)) {
          adsCap.status = 'host-closed';
          return;
        }
        const started = now();
        try {
          const found = await deps.searchAds(term, settings);
          const at = now();
          ads = (found || []).map((d) => ({ ...d, capturedAt: at }));
          adsCap.status = ads.length ? 'ok' : 'empty';
        } catch (err) {
          adsCap.status = limiter?.isClosed(ADS_HOST) ? 'host-closed' : 'error';
          adsCap.error = String(err?.message || err).slice(0, 300);
        }
        adsCap.ms = now() - started;
        adsCap.captured_at = new Date(now()).toISOString();
        adsCap.results_total = ads.length;
      })();
      await Promise.all([...laneJobs, adsJob]);

      const { rows, dropped } = buildTermRows({ term, zip, date, runId, parserVersion, stores, results, ads, rowsPerStore });
      for (const c of captures) {
        c.rows_kept = rows.filter((r) => r.store_id === c.store_id && r.basis !== 'weekly-ad').length;
        c.not_kept = dropped[c.store_id] ?? 0;
      }
      if (adsCap) {
        adsCap.rows_kept = rows.filter((r) => r.basis === 'weekly-ad').length;
        adsCap.not_kept = Math.max(0, ads.length - adsCap.rows_kept);
        captures.push(adsCap);
      }
      store.recordTerm(captures, rows);
      zipRows.push(...rows);
      zipCaptures.push(...captures.filter((c) => c.store_id !== '_weekly_ads'));
      const ok = captures.filter((c) => c.status === 'ok' && c.store_id !== '_weekly_ads').length;
      const bad = captures.filter((c) => !['ok', 'empty'].includes(c.status));
      summary.rows += rows.length;
      summary.curated += rows.filter((r) => r.is_store_best).length;
      summary.captures += captures.length;
      summary.failed += bad.length;
      log(`    ${term}: ${ok}/${stores.length} stores priced, ${rows.length} rows (${rows.filter((r) => r.is_store_best).length} curated), ${((now() - t0) / 1000).toFixed(1)}s${bad.length ? ` · ${bad.map((c) => `${c.store_id}:${c.status}`).join(' ')}` : ''}`);
    }
    summary.summaryRows.push(
      ...buildSummaryRows({ date, runId, zip, parserVersion, stores, captures: zipCaptures, rows: zipRows, termsTracked: terms.length }),
      zoneRow({ date, runId, zip, parserVersion, note: `${stores.length} priceable stores; ads-only chains: ${(dir.chains || []).filter((c) => c.status === 'adsOnly').map((c) => c.id).join(', ') || 'none'}${zinfo.unresolved.length ? `; did not answer: ${zinfo.unresolved.join(', ')}` : ''}; weekly-ad rows: ${zipRows.filter((r) => r.basis === 'weekly-ad').length}` }),
    );
  }
  return summary;
}

function zoneRow({ date, runId, zip, parserVersion, note }) {
  return {
    key: `${date}|${zip}|_directory|${runId}`,
    date, run_id: runId, zip, store: '(stores near this ZIP)', store_id: '_directory', basis: null, store_location_id: null,
    store_address: null, distance_mi: null, price_note: null, terms_tracked: null, terms_ok: null, terms_empty: null,
    terms_failed: null, rows_kept: null, rows_flagged: null, curated_rows: null, weekly_ad_rows: null, note, parser_version: parserVersion,
  };
}
