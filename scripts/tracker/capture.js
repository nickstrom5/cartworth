#!/usr/bin/env node
// Cartworth price tracker — one run is one daily capture.
//
//   node --disable-warning=ExperimentalWarning scripts/tracker/capture.js [options]
//
// For each tracked ZIP, asks the product's directory (src/directory.js) which stores within 25 miles
// can be priced, prices every term in scripts/tracker/terms.txt at each of them with the product's
// own searchStore (src/search.js), reads the weekly ads, and writes:
//   tracker.db                              every kept row, every attempt, every run (data dir)
//   <Drive>/daily/YYYY-MM-DD.csv            the full detail for the day
//   <Drive>/incoming/prices_…csv            one curated row per term, store and ZIP, for the Sheet
//   <Drive>/incoming/summary_…csv           one row per store per ZIP, plus one for the run
//
// Options
//   --zips 60618,60148        ZIPs to capture (default: the four test ZIPs)
//   --terms butter,milk       terms to price (default: every term in terms.txt)
//   --data-dir DIR            tracker data dir (default: $BASKET_DATA_DIR, else
//                             ~/Library/Application Support/Cartworth/tracker). Never inside <repo>/data.
//   --drive-dir DIR           the price-tracker folder to mirror into (default: My Drive/Cartworth/
//                             price-tracker under Google Drive for desktop, when it is mounted)
//   --no-drive                write local exports only
//   --no-ads                  skip the weekly-ad (Flipp) reads
//   --gap-ms N                per-host idle gap between requests, >= 700 (default 700)
//   --daily                   launchd mode: do nothing before 06:30 or if today is already captured
//   --label NAME              tag the run (default "manual"; "daily" with --daily)
//   --dry-run                 print the plan and exit: no product import, no network
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZIPS, MAX_MILES, ROWS_PER_STORE, RESULTS_PER_STORE, DRIVE_SUBDIR, readTerms, localDate, runIdFor, defaultDriveRoot } from './config.js';
import { prepareIsolation, assertProductDb, IsolationError } from './isolation.js';
import { createHostLimiter, installGlobalFetch, MIN_GAP_MS } from './limiter.js';
import { openTrackerDb, makeStore } from './trackerdb.js';
import { parserVersion as computeParserVersion } from './version.js';
import { runCapture } from './core.js';
import { curatedRow } from './rows.js';
import { toCsv } from './csv.js';
import { DETAIL_COLUMNS, PRICE_COLUMNS, SUMMARY_COLUMNS } from './columns.js';
import { writeAtomic, incomingName, resolveDriveDir, mirrorExports } from './exports.js';

const { values: args } = parseArgs({
  options: {
    zips: { type: 'string' },
    terms: { type: 'string' },
    'data-dir': { type: 'string' },
    'drive-dir': { type: 'string' },
    'no-drive': { type: 'boolean', default: false },
    'no-ads': { type: 'boolean', default: false },
    'gap-ms': { type: 'string' },
    daily: { type: 'boolean', default: false },
    label: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'directory-retry-ms': { type: 'string' },
  },
  strict: true,
});

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

function fail(code, message) {
  console.error(`capture: ${message}`);
  process.exit(code);
}

// ---------------------------------------------------------------- isolation first, before any src/ import
let paths;
try {
  paths = prepareIsolation({ dataDir: args['data-dir'] || null });
} catch (err) {
  fail(err instanceof IsolationError ? 2 : 1, err.message);
}

const zips = (args.zips ? args.zips.split(',') : ZIPS).map((z) => z.trim()).filter(Boolean);
for (const z of zips) if (!/^\d{5}$/.test(z)) fail(64, `bad ZIP "${z}"`);
const allTerms = readTerms();
const terms = args.terms
  ? args.terms.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => allTerms.find((x) => x.term === t) || { term: t, tags: [] })
  : allTerms;
const gapMs = args['gap-ms'] ? Number(args['gap-ms']) : MIN_GAP_MS;
if (!(gapMs >= MIN_GAP_MS)) fail(64, `--gap-ms must be at least ${MIN_GAP_MS}`);
const label = args.label || (args.daily ? 'daily' : 'manual');
const driveDir = args['no-drive'] ? null : resolveDriveDir({ explicit: args['drive-dir'] || null, driveRoot: defaultDriveRoot(), subdir: DRIVE_SUBDIR });
const exportsDir = path.join(paths.dataDir, 'exports');

if (args['dry-run']) {
  console.log(JSON.stringify({ dataDir: paths.dataDir, productDb: paths.productDb, trackerDb: paths.trackerDb, driveDir, zips, terms: terms.map((t) => t.term), gapMs, label, ads: !args['no-ads'] }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- one capture at a time
const lockFile = path.join(paths.dataDir, 'capture.lock');
function takeLock() {
  try {
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        fail(3, `another capture is running (pid ${pid}); not starting a second one`);
      } catch (e) {
        if (e.code !== 'ESRCH') throw e;
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  fs.writeFileSync(lockFile, String(process.pid));
}
const dropLock = () => {
  try {
    if (Number(fs.readFileSync(lockFile, 'utf8')) === process.pid) fs.unlinkSync(lockFile);
  } catch {
    /* already gone */
  }
};
takeLock();

const store = makeStore(openTrackerDb(paths.trackerDb));
const startedAt = Date.now();
const date = localDate(startedAt);

if (args.daily) {
  const d = new Date(startedAt);
  if (d.getHours() * 60 + d.getMinutes() < 6 * 60 + 30) {
    log(`daily: before 06:30, nothing to do`);
    dropLock();
    process.exit(0);
  }
  const today = store.runsOn(date).filter((r) => r.label === 'daily');
  if (today.some((r) => ['complete', 'partial', 'rate-limited'].includes(r.status))) {
    log(`daily: ${date} already captured (${today.map((r) => `${r.run_id} ${r.status}`).join(', ')})`);
    dropLock();
    process.exit(0);
  }
  if (today.length >= 3) {
    log(`daily: ${today.length} attempts already today; not trying again until tomorrow`);
    dropLock();
    process.exit(0);
  }
}

// ---------------------------------------------------------------- politeness, then the product
const limiter = createHostLimiter({ fetchImpl: globalThis.fetch.bind(globalThis), gapMs });
installGlobalFetch(limiter);
const pv = computeParserVersion();
process.removeAllListeners('warning');
process.on('warning', (w) => w.name !== 'ExperimentalWarning' && console.warn(w));
const productDb = await import('../../src/db.js');
try {
  assertProductDb(productDb.DB_PATH, paths.productDb);
} catch (err) {
  dropLock();
  fail(2, err.message);
}
if (productDb.dbStatus?.degraded) log(`note: product cache degraded to memory (${productDb.dbStatus.reason})`);
const { directory } = await import('../../src/directory.js');
const { searchStore, searchAds, sourceFor } = await import('../../src/search.js');

const runId = runIdFor(startedAt);
store.startRun({ runId, label, date, startedAt, parserVersion: pv.version, parserFiles: pv.files, zips, terms: terms.length });
log(`run ${runId} (${label}) · ${zips.length} ZIP(s) × ${terms.length} term(s) · parser ${pv.version} · data ${paths.dataDir} · product cache ${productDb.DB_PATH}`);

let finished = false;
function finish(status, note) {
  if (finished) return;
  finished = true;
  const finishedAt = Date.now();
  store.finishRun({ runId, status, finishedAt, durationMs: finishedAt - startedAt, requests: limiter.report(), note });
  dropLock();
}
// A multi-hour batch must not die on one stray rejection from a background probe; it is logged and
// the run goes on. Anything that breaks the run itself still lands in the catch below.
process.on('unhandledRejection', (err) => log(`unhandled rejection (continuing): ${String(err?.stack || err).slice(0, 400)}`));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log(`${sig}: stopping; rows already captured are kept`);
    finish('interrupted', sig);
    process.exit(130);
  });
}

let result;
try {
  result = await runCapture({
    deps: { directory, searchStore, searchAds, sourceFor },
    store,
    limiter,
    zips,
    terms,
    date,
    runId,
    parserVersion: pv.version,
    maxMiles: MAX_MILES,
    resultsPerStore: RESULTS_PER_STORE,
    rowsPerStore: ROWS_PER_STORE,
    withAds: !args['no-ads'],
    directoryRetryMs: args['directory-retry-ms'] ? Number(args['directory-retry-ms']) : 20000,
    log,
  });
} catch (err) {
  log(`run failed: ${err.stack || err}`);
  finish('failed', String(err?.message || err).slice(0, 300));
  process.exit(1);
}

// ---------------------------------------------------------------- report, exports, Drive
const durationMs = Date.now() - startedAt;
const requests = limiter.report();
const closed = limiter.closedHosts();
const hostLines = Object.entries(requests)
  .sort((a, b) => b[1].requests - a[1].requests)
  .map(([h, r]) => `    ${h.padEnd(28)} ${String(r.requests).padStart(5)} req · min gap end→start ${r.minGapEndToStartMs ?? '—'} ms · start→start ${r.minGapStartToStartMs ?? '—'} ms · peak in flight ${r.peakInFlight} · statuses ${JSON.stringify(r.statuses)}${r.closed ? ` · CLOSED (${r.closed.reason})` : ''}${r.refusedAfterClose ? ` · ${r.refusedAfterClose} not sent after close` : ''}`);
const totalReq = Object.values(requests).reduce((a, r) => a + r.requests, 0);
const minGap = Math.min(...Object.values(requests).map((r) => r.minGapEndToStartMs ?? Infinity));
const status = Object.keys(closed).length ? 'rate-limited' : result.zips.some((z) => z.error) ? 'partial' : 'complete';
const runNote = `${(durationMs / 60000).toFixed(1)} min; ${totalReq} requests; min idle gap per host ${Number.isFinite(minGap) ? `${minGap} ms` : 'n/a'}; closed hosts: ${Object.keys(closed).length ? Object.entries(closed).map(([h, c]) => `${h} (${c.reason})`).join(', ') : 'none'}; rows ${result.rows}, curated ${result.curated}`;

const runRow = {
  key: `${date}|ALL|_run|${runId}`, date, run_id: runId, zip: 'ALL', store: '(run)', store_id: '_run', basis: null, store_location_id: null,
  store_address: null, distance_mi: null, price_note: null, terms_tracked: terms.length, terms_ok: null, terms_empty: null,
  terms_failed: result.failed, rows_kept: result.rows, rows_flagged: null, curated_rows: result.curated, weekly_ad_rows: null,
  note: `${status}: ${runNote}`, parser_version: pv.version,
};
const runRows = store.rowsForRun(runId);
const curated = runRows.filter((r) => r.is_store_best).map(curatedRow);
const summaryRows = [...result.summaryRows, runRow];

const written = [];
function exportFile(rel, kind, columns, rows) {
  const bytes = writeAtomic(path.join(exportsDir, rel), toCsv(columns, rows));
  store.recordExport({ file: rel, kind, runId, rows: rows.length, bytes });
  written.push(`${rel} (${rows.length} rows, ${(bytes / 1024).toFixed(1)} KB)`);
}
if (curated.length) exportFile(path.join('incoming', incomingName('prices', date, runId, curated.length)), 'prices', PRICE_COLUMNS, curated);
exportFile(path.join('incoming', incomingName('summary', date, runId, summaryRows.length)), 'summary', SUMMARY_COLUMNS, summaryRows);
exportFile(path.join('daily', `${date}.csv`), 'daily', DETAIL_COLUMNS, store.rowsForDate(date));
const mirror = mirrorExports(store, exportsDir, driveDir);

fs.mkdirSync(path.join(paths.dataDir, 'runs'), { recursive: true });
fs.writeFileSync(path.join(paths.dataDir, 'runs', `${runId}.json`), JSON.stringify({ runId, label, status, date, durationMs, parserVersion: pv.version, zips: result.zips, requests, written, mirror }, null, 2));
finish(status, runNote);

log(`run ${runId} ${status} in ${(durationMs / 60000).toFixed(1)} min — ${result.rows} rows kept, ${result.curated} curated, ${result.failed} store searches not priced`);
log(`requests by host (${totalReq} total):\n${hostLines.join('\n')}`);
log(`exports:\n    ${written.join('\n    ')}`);
log(driveDir ? `Drive: ${mirror.mirrored.length} file(s) copied to ${driveDir}${mirror.pending.length ? `; ${mirror.pending.length} still pending (${mirror.error})` : ''}` : `Drive: not mounted or disabled; ${mirror.pending.length} file(s) wait in ${exportsDir} for the next run`);
process.exit(0);
