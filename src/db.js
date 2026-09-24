// SQLite storage (node:sqlite, no dependencies).
//
// Everything in here is shared infrastructure, not anybody's personal data:
//   kv             — the Instacart guest session (one per storefront, shared by all visitors)
//   cache          — the HTTP/price cache that keeps us light on the retailers' sites
//   products/      — impersonal price history: what a product cost, when. Keyed by product, never
//   observations     by visitor, and every visitor benefits from it.
//   flipp_details  — weekly-ad item details
//
// Per-visitor state (settings, shopping list, watchlist, recent searches) is deliberately absent:
// it lives in each visitor's own browser. See public/js/store.js.
//
// This file was written for one person on one laptop. Cartworth is now a public stateless
// service, so three things that did not matter then matter now and are handled below:
//   * nothing ever deleted anything, so every table grew forever — see RETENTION.
//   * the database was assumed to open, be healthy, and be opened by exactly one process —
//     see "opening the database" and MAINTENANCE.
//   * node:sqlite is SYNCHRONOUS. A slow statement does not block one visitor, it blocks the
//     whole event loop and therefore every visitor. That is a correctness budget, not a
//     performance nicety, and it is why the retention below is aggressive.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.BASKET_DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = process.env.BASKET_DB || path.join(DATA_DIR, 'basket.db');

// ---------------------------------------------------------------------------------------------
// Opening the database
// ---------------------------------------------------------------------------------------------
// Everything on disk here is derived: the cache can be refetched, the price history is a bonus on
// top of live prices, and the Instacart guest session is re-negotiated on demand. So a database
// that cannot be opened — corrupt file, unwritable directory, read-only volume, a half-copied file
// from a bad deploy — must NOT stop the server from serving prices. It falls back to an in-memory
// database: the app boots, searches work, history restarts empty, and /api/health says so.
//
// The alternative is what the code did before: throw at import time, so `node server.js` exits
// before it listens and the whole site is down because a cache file went bad.
export const dbStatus = { ok: true, degraded: false, reason: null, path: DB_PATH };

/**
 * How long a writer waits for the lock before giving up.
 *
 * It is a real deadline, not a formality: past it a write does not queue, it throws, and
 * trySoftWrite turns that into a dropped history point. So it is also the ceiling every long
 * statement in this file has to stay under — see COMPACT_ROW_BUDGET.
 */
export const BUSY_TIMEOUT_MS = 5000;

function open(file) {
  const handle = new DatabaseSync(file);
  // busy_timeout FIRST, and the order is the whole point.
  //
  // It is the difference between "two processes share the file" and "the second process throws
  // SQLITE_BUSY": without it the timeout is 0, so anything that finds a lock held gives up
  // instantly instead of waiting the few milliseconds the other side needs.
  //
  // Setting it after `journal_mode = WAL` — which is where it used to be — leaves exactly one
  // statement running at a timeout of zero, and that statement takes an EXCLUSIVE lock to
  // rewrite the file header. Two servers starting together is all it takes: one wins, the other
  // throws on its very first statement, openOrDegrade catches it, and that instance runs its
  // whole life on an in-memory database — no shared cache, no price history, no write ever
  // reaching the file. It says so on /api/health and nowhere else. Reproduced by the two-process
  // test in qa-db.test.js, which failed on exactly this before the line was reordered.
  handle.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  // ...and busy_timeout is still not enough for the very next statement. Switching a fresh file
  // into WAL is a write, and SQLite refuses to call the busy handler at all when waiting could
  // deadlock: a connection holding a SHARED lock that needs to write, while ANOTHER connection
  // holds RESERVED, gets SQLITE_BUSY immediately ("the busy handler is not invoked if ... could
  // result in a deadlock", sqlite.org/c3ref/busy_handler.html). Two servers starting on one fresh
  // file produce exactly that: one is mid-way through its own switch or first CREATE TABLE
  // (RESERVED) while the other has just read the header (SHARED). Measured with pairs of processes
  // importing this file against one fresh file: 21 of 80 fell back to :memory:, and a statement-by-
  // statement probe put every failure on this one pragma ("database is locked", errcode 5), after
  // 1 ms — no waiting at all. With the other process holding only SHARED, the same pragma DOES
  // wait the full timeout, which is why the reordering above looked like the fix. openOrDegrade
  // caught the error, and that process spent its whole life on :memory:; qa-db's two-process test
  // failed 1-2 runs in 6 because of it.
  //
  // So this one statement gets the waiting SQLite will not give it: on BUSY/LOCKED the failed
  // statement has already released its own SHARED lock (which is what lets the other side
  // finish), and we retry for up to the same BUSY_TIMEOUT_MS budget, then give up exactly as a
  // timed-out write would.
  retryWhileBusy(() => handle.exec('PRAGMA journal_mode = WAL'));
  handle.exec('PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  return handle;
}

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Run a statement SQLite will not wait for, waiting for it ourselves. Synchronous on purpose: the
 * database opens at import time, before the server listens, and nothing else can run until it
 * has. Backs off 5 → 50 ms, with jitter so two processes starting together do not retry in
 * lockstep.
 */
export function retryWhileBusy(fn, { budgetMs = BUSY_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + budgetMs;
  for (let wait = 5; ; wait = Math.min(50, wait * 2)) {
    try {
      return fn();
    } catch (err) {
      const busy = err?.errcode === SQLITE_BUSY || err?.errcode === SQLITE_LOCKED || /database is (locked|busy)/i.test(String(err?.message));
      if (!busy || Date.now() + wait > deadline) throw err;
      pause(wait + Math.floor(Math.random() * (wait / 2)));
    }
  }
}

function openOrDegrade() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const handle = open(DB_PATH);
    // Cheap structural check (pages, not every index entry): catches a truncated or scribbled
    // file at boot rather than at the first search. quick_check on a 100 MB file is milliseconds;
    // the full integrity_check is not, and belongs in scripts/db-maintenance.js.
    const verdict = handle.prepare('PRAGMA quick_check(1)').get();
    const answer = verdict ? Object.values(verdict)[0] : 'ok';
    if (String(answer).toLowerCase() !== 'ok') throw new Error(`quick_check: ${answer}`);
    return handle;
  } catch (err) {
    dbStatus.ok = false;
    dbStatus.degraded = true;
    dbStatus.reason = String(err?.message || err).slice(0, 200);
    dbStatus.path = ':memory:';
    console.error(`\n  ⚠ Cartworth could not use ${DB_PATH}: ${dbStatus.reason}`);
    console.error('    Running with an in-memory database. Prices still work; the cache and price');
    console.error('    history start empty and are lost on restart. Fix the file and restart.\n');
    return open(':memory:');
  }
}

export const db = openOrDegrade();

/**
 * Run a write that the app can live without.
 *
 * A public server hits write failures the laptop version never did: the disk fills up, the volume
 * goes read-only mid-deploy, another process holds the write lock past busy_timeout. None of those
 * should turn a visitor's search into a 500 — the prices in that response are already correct and
 * complete, and only the bookkeeping failed. Returns true when the write happened.
 */
export function trySoftWrite(what, fn) {
  try {
    fn();
    if (softWriteFailures.count && Date.now() - softWriteFailures.at > 60_000) softWriteFailures.count = 0;
    return true;
  } catch (err) {
    softWriteFailures.count += 1;
    softWriteFailures.at = Date.now();
    softWriteFailures.last = `${what}: ${String(err?.message || err).slice(0, 160)}`;
    // One line per minute, not one per dropped row: a full disk fails thousands of times a second.
    if (softWriteFailures.count === 1 || softWriteFailures.count % 500 === 0) {
      console.error(`[db] dropped a write (${softWriteFailures.count} so far) — ${softWriteFailures.last}`);
    }
    return false;
  }
}
export const softWriteFailures = { count: 0, at: 0, last: null };

db.exec(`
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  pkey TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT,
  brand TEXT,
  size TEXT,
  image TEXT,
  url TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  pkey TEXT NOT NULL,
  store_id TEXT NOT NULL,
  -- The retailer's OWN id for the physical store this price came from. Without it, observations
  -- pool per chain: a shopper in Chicago is shown the lowest price a Los Angeles ALDI has ever
  -- had, and "price dropped" flips whenever a distant visitor happens to search. It is the store,
  -- never the person: no visitor identifier is recorded anywhere in this table.
  location_id TEXT,
  price REAL,
  reg_price REAL,
  unit_dim TEXT,
  unit_price REAL,
  on_sale INTEGER NOT NULL DEFAULT 0,
  promo TEXT,
  observed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS flipp_details (
  id INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
`);

// Tiny forward-only migration: add columns the schema above gained after a database was created.
// CREATE TABLE IF NOT EXISTS never alters an existing table, so without this an older file keeps
// the old shape and every insert naming the new column fails.
for (const [table, column, decl] of [['observations', 'location_id', 'TEXT']]) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

// ---------------------------------------------------------------------------------------------
// Numbered forward-only migrations
// ---------------------------------------------------------------------------------------------
// Same spirit as the column loop above — run once, never roll back — but for changes that are not
// "add a column", so they need a marker to know they already ran. PRAGMA user_version is that
// marker; it costs no table and no row.

// Dropped child-first: watch_points has a REFERENCES watches(id) and PRAGMA foreign_keys is ON, so
// dropping the parent while the child still exists is the one ordering that can fail.
//
// `searches` belongs on this list even though the brief only named the other three. It is the same
// thing: a table of what somebody typed into the box, which src/search.js says in so many words now
// lives only in that person's browser. It is empty in the shipped file, nothing reads or writes it,
// and leaving a ready-made table for "what visitors searched for" on a shared server is the same
// loaded gun as leaving one for their shopping list.
const DEAD_PER_VISITOR_TABLES = ['watch_points', 'watches', 'list_items', 'searches'];

const MIGRATIONS = [
  // 1. Drop the dead per-visitor tables.
  //
  // `watches`, `watch_points`, `list_items` and `searches` are from the single-user era. The
  // multi-tenant refactor moved all of them into the browser (public/js/store.js) and onto the
  // phone (ios/App/Persistence). Nothing on the server reads or writes them any more — the only
  // SQL that names them is legacyReport()/purgeLegacy() below, which exist to report them.
  //
  // Leaving an empty table lying around is not neutral on a shared server. The privacy policy says
  // one visitor's list and watchlist never reach it; an empty table with exactly the right columns
  // is a loaded gun for the next person who adds a feature in a hurry. Removing it means such a
  // write fails loudly instead of quietly pooling strangers' shopping lists in one file.
  //
  // Safe on an existing database because it only drops a table that is EMPTY. A developer's own
  // file may still hold their real watchlist and shopping list, and we do not delete somebody's
  // data behind their back: those survive here and are reported at boot, with the opt-in
  // BASKET_PURGE_LEGACY=1 escape hatch below for when they want them gone.
  function dropEmptyPerVisitorTables(handle) {
    const dropped = [];
    for (const t of DEAD_PER_VISITOR_TABLES) {
      const exists = handle.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (!exists) continue;
      const n = handle.prepare(`SELECT COUNT(*) n FROM ${t}`).get()?.n ?? 0;
      if (n > 0) continue; // somebody's real data — report it, never drop it silently
      handle.exec(`DROP TABLE ${t}`);
      dropped.push(t);
    }
    if (dropped.length) console.log(`[db] removed dead per-visitor tables: ${dropped.join(', ')}`);
  },
];

function runMigrations() {
  const at = db.prepare('PRAGMA user_version').get()?.user_version ?? 0;
  for (let v = at; v < MIGRATIONS.length; v++) {
    MIGRATIONS[v](db);
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }
}
try {
  runMigrations();
} catch (err) {
  // A migration that cannot run is not worth refusing to serve prices over. It will be retried on
  // the next boot, and legacyReport() still tells the operator what is left.
  console.error(`[db] migration failed (will retry next boot): ${String(err?.message || err).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------------------------
// Indexes over migrated columns must come after the migration, not in the schema block above:
// on an existing database that block runs first and the column does not exist yet.
//
// Every index here is paid for on every INSERT into the hottest table in the app, so the set is
// deliberately minimal and each one is here because EXPLAIN QUERY PLAN and a stopwatch said so.
//
// Measured on one generated database — 1,908,901 observations, 84,673 products, 760 store
// locations, including a realistic head product ("milk" at one chain, seen at all 760 locations
// with a year of the 12-hour heartbeat behind it: 554,800 rows on its own) — with only the index
// set varied between runs. BEFORE is what this file shipped with: obs_pkey_time(pkey,
// observed_at), and no index anywhere else.
//
//                                                       BEFORE        AFTER
//   GET /api/history/:key, head product                7,172 ms     0.005 ms
//   the same, scoped to one store                            —      2.93 ms
//   "how many locations is this product in?"           5,542 ms     0.008 ms
//   one search page: stats for 288 products           12,894 ms       18 ms
//   write path: "what did this cost here last time?"   4,705 µs         5 µs
//   /api/state COUNT(*) observations                    78.6 ms     34.4 ms
//
//   obs_pkey_loc_time(pkey, location_id, observed_at)
//       Serves every read and the write path's lookup. obs_pkey_time could not: it stops at pkey,
//       so every location-scoped statement had to walk the product's rows across ALL 760 locations
//       and filter. That is the whole of the first four rows above.
//
//   obs_time(observed_at)
//       Retention is `DELETE FROM observations WHERE observed_at < ?`. Without it the plan was a
//       skip-scan over obs_pkey_time — "ANY(pkey) AND observed_at<?", which is every pkey in the
//       table. With it, "SEARCH observations USING INDEX obs_time (observed_at<?)".
//
//   cache_expires(expires_at)
//       Same story for cachePurge(): "SCAN cache" became a range seek. A cache row is a whole
//       search result — ~27.5 KB measured — so scanning to find expired rows reads the entire
//       cache off disk. Cheap to maintain: the cache is written once per upstream fetch, which the
//       retailers rate-limit us to anyway (src/guard.js), not once per request.
//
// And one index was REMOVED: obs_pkey_time(pkey, observed_at) is a strict prefix of
// obs_pkey_loc_time, so SQLite answers everything it covered from the wider index. It cost a
// B-tree write on every observation and bought nothing. Dropping it is why the two additions above
// are not a net increase in write cost on the hot table.
//
// Nothing else was added. An index on products.last_seen would turn pruneProducts (177 ms, a scan)
// into a seek — but that is a B-tree write on every product on every search result, to save 177 ms
// once a week. No.
db.exec('CREATE INDEX IF NOT EXISTS obs_pkey_loc_time ON observations(pkey, location_id, observed_at);');
db.exec('CREATE INDEX IF NOT EXISTS obs_time ON observations(observed_at);');
db.exec('CREATE INDEX IF NOT EXISTS cache_expires ON cache(expires_at);');
db.exec('DROP INDEX IF EXISTS obs_pkey_time;');

// ---------- kv ----------
const kvGet = db.prepare('SELECT value FROM kv WHERE key = ?');
const kvSet = db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
const kvDel = db.prepare('DELETE FROM kv WHERE key = ?');

export function getKV(key, fallback = null) {
  const row = kvGet.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}
export function setKV(key, value) {
  trySoftWrite('kv', () => kvSet.run(key, JSON.stringify(value), Date.now()));
}
export function delKV(key) {
  trySoftWrite('kv', () => kvDel.run(key));
}

// ---------- persistent cache ----------
const cGet = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?');
const cSet = db.prepare('INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at');
const cDelPrefix = db.prepare("DELETE FROM cache WHERE key LIKE ? ESCAPE '\\'");
const cPurge = db.prepare('DELETE FROM cache WHERE expires_at < ?');

export function cacheGet(key) {
  const row = cGet.get(key);
  if (!row || row.expires_at < Date.now()) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}
/** Expired entries are kept for a while so they can be served if the source is down. */
export function cacheGetStale(key, maxStaleMs) {
  const row = cGet.get(key);
  if (!row || row.expires_at < Date.now() - maxStaleMs) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}
export function cacheSet(key, value, ttlMs) {
  // A cache write is the definition of a write we can live without: failing to remember an answer
  // we already have costs one extra upstream fetch later, not a broken response now.
  trySoftWrite('cache', () => cSet.run(key, JSON.stringify(value), Date.now() + ttlMs));
}
export function cacheDeletePrefix(prefix) {
  trySoftWrite('cache', () => cDelPrefix.run(prefix.replace(/[\\%_]/g, (c) => '\\' + c) + '%'));
}

// ---------------------------------------------------------------------------------------------
// RETENTION
// ---------------------------------------------------------------------------------------------
// Nothing in this file used to delete anything, anywhere.
//
// MEASURED, by running the real recordProducts() path for 14 simulated days at 100 visitors a day
// — 4 searches each, 8 chains, 36 products a chain (src/search.js:48), visitors spread over 40
// ZIPs, search terms drawn Zipf(1) from a 300-term vocabulary so "milk" is constant and the tail
// is searched once:
//
//     96,295 observation rows a DAY   at 147 bytes a row (table + indexes)
//   = 2.9 million rows and 425 MB a MONTH
//   = 35 million rows and 5.2 GB a YEAR, and still climbing, forever.
//
// Almost none of that is information. It is the heartbeat described in RETAIN.compactAfterDays
// below writing down the same price twice a day. Ageing out at a year and then compacting takes a
// year of one (product, store) series from 730 rows to 34.9 — measured, 20.9x — so the same year
// costs ~250 MB and stops growing instead of ~5 GB and growing.
//
// The cache is a different shape and needed no window widened: rows are upserted by key, so the
// table is bounded by the number of distinct (store, query, ZIP) keys rather than by write rate.
// What it needed was for the purge to actually run — it was called once at boot, so a server that
// stays up never purged at all, and a cache row is a whole search result at ~27.5 KB.
//
// The windows below are the ones that are defensible rather than round:
export const RETAIN = {
  // One full seasonal cycle. Grocery prices are seasonal — produce, holidays, back-to-school —
  // so a year is the shortest window in which "the lowest it has been" means anything. It is also
  // close to the longest: a price from eighteen months ago is from a different price regime, and
  // showing it as the low advertises a number the shopper can no longer get. That is the failure
  // mode the owner cares about most, so the window stops at one year.
  observationDays: 365,

  // The heartbeat, and where nearly all the waste is.
  //
  // src/history.js records an observation when the price CHANGED or when the last one at this
  // location is older than REPEAT_MS (12 hours). The second clause fires constantly: every
  // (product, store location) pair that anyone searches twice in a day gets a new row a day,
  // forever, saying exactly what the row before it said. In the simulation a stable product
  // accumulated ~60 rows a month of which two or three were real price changes.
  //
  // Those duplicate rows carry no information — they cannot change the low, the high, the "lowest
  // seen at" date, the average or the previous price — so deleting the INTERIOR of each run of
  // identical prices, keeping the first and last row of every run, is lossless for every number
  // the product page shows except one: `n`, which is honestly just a count of rows. (`avg` would
  // have moved too, which is why src/history.js now computes it as a time-weighted mean; and `n`
  // is why MIN_SERIES_ROWS exists.)
  //
  // Seven days of raw rows are kept untouched so that the "price dropped" comparison and the
  // recent end of the chart — the parts a shopper actually looks at — are byte-identical to what
  // they were before any maintenance ran. Seven days is one weekly-ad cycle.
  compactAfterDays: 7,

  // A product nobody has seen in a year has no observations left either, so its row is dead
  // weight in a table that is upserted on EVERY search result — 84,673 rows after 14 simulated
  // days, still growing by ~1,070 a day as the long tail of searches reaches new products.
  productDays: 365,

  // The cache's stale window, and it is NOT a free choice — it is dictated by the callers.
  //
  // src/cache.js serves an expired entry when the retailer is down, up to that caller's
  // `maxStaleMs`. So anything this purge deletes sooner than the longest maxStaleMs in the
  // codebase is not "saving space", it is removing the fallback that a caller is still counting
  // on, and turning "we showed you last week's store list because Instacart is down" into an
  // error page. The longest today is src/directory.js at 30 days (the store directory — the thing
  // that maps a ZIP to nearby shops, and the worst one to lose in an outage); src/adapters/flipp.js
  // asks for 10 and src/search.js for 3.
  //
  // 31 days is that maximum plus a day of slack. It is not unbounded: cache rows are upserted by
  // key, so the table is bounded by the number of distinct keys, and a key that is still being
  // read is refreshed rather than accumulated.
  //
  // qa-db.test.js re-derives this from the source rather than trusting the paragraph above, which
  // matters because the failure is silent — the fallback simply is not there on the day it is
  // needed.
  cacheStaleDays: 31,

  // Weekly ads. A flipp_details row describes an item in a circular; circulars run a week, and
  // src/deals.js never asks about one older than the current or next week. Thirty days is already
  // four expired cycles of slack.
  flippDays: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Drop cache entries that no caller could read any more.
 *
 * Kept as the original name and the original no-argument call (server.js calls it at boot), but it
 * now returns what it removed and takes an override so the maintenance script and the tests can be
 * explicit.
 */
export function cachePurge({ now = Date.now(), staleDays = RETAIN.cacheStaleDays } = {}) {
  let changes = 0;
  trySoftWrite('cachePurge', () => {
    changes = Number(cPurge.run(now - staleDays * DAY_MS).changes || 0);
  });
  return changes;
}

/**
 * The fewest rows maintenance will ever leave in one (pkey, location_id) series.
 *
 * Both deletions honour it, and they need to. Compaction's reason is documented at length below;
 * age-out's is the same failure with a different cause. Measured against the real code before this
 * floor was applied here:
 *
 *   a price that has NEVER changed, 8 rows, 6 of them older than the window
 *     before  n=8  low=$5.00   "lowest price seen" badge: shown
 *     after   n=2  low=$5.00   badge: hidden
 *
 *   a historic low older than the window, shopper is looking at $1.99 on the shelf
 *     before  n=6  low=$1.99   badge: shown
 *     after   n=2  low=$2.99   badge: hidden
 *
 * public/js/views/compare.js gates that badge on `hist.n >= 3`, so in both cases a shopper watching
 * a steady price saw the badge disappear the first time the cron ran, for no reason they could see.
 * MIN_SERIES_ROWS was added to stop compaction doing this and was simply never applied to age-out,
 * which runs FIRST in maintain().
 */
export const MIN_SERIES_ROWS = 4;

// Age-out, with the floor. The correlated subquery answers "are there already MIN_SERIES_ROWS rows
// in this series newer than me?" and only then is this row expendable.
//
// The inner LIMIT is what keeps it cheap: it stops after MIN_SERIES_ROWS rows instead of counting
// the whole series, so the work is O(4) index steps per candidate row rather than O(rows in the
// series). obs_pkey_loc_time(pkey, location_id, observed_at) serves it as a range seek.
//
// `location_id IS o.location_id` rather than `=`: a chain-wide price is filed under a NULL
// location, and NULL = NULL is not true. IS treats it as the value it actually is.
const obsPruneStmt = db.prepare(`
  DELETE FROM observations AS o
   WHERE o.observed_at < ?
     AND (SELECT COUNT(*) FROM (
            SELECT 1 FROM observations x
             WHERE x.pkey = o.pkey AND x.location_id IS o.location_id AND x.observed_at > o.observed_at
             LIMIT ${MIN_SERIES_ROWS}
          )) >= ${MIN_SERIES_ROWS}`);
const productPruneStmt = db.prepare('DELETE FROM products WHERE last_seen < ? AND pkey NOT IN (SELECT pkey FROM observations)');
const flippPruneStmt = db.prepare('DELETE FROM flipp_details WHERE fetched_at < ?');

/**
 * Observations older than the retention window, except the newest MIN_SERIES_ROWS of each series.
 *
 * The floor means a long-abandoned product keeps a few rows forever rather than ageing away to
 * nothing. That is deliberate: it is at most four rows per series, and the alternative is a chart
 * and a "lowest seen" badge that vanish from under a shopper. pruneProducts still reaps the
 * product row only when its history is genuinely empty, so this does not resurrect dead products —
 * it keeps live ones honest.
 */
export function pruneObservations({ now = Date.now(), days = RETAIN.observationDays } = {}) {
  let changes = 0;
  trySoftWrite('pruneObservations', () => {
    changes = Number(obsPruneStmt.run(now - days * DAY_MS).changes || 0);
  });
  return changes;
}

/**
 * Product rows with nothing left to say: not seen for a year AND with no surviving observation.
 * The second condition is what makes this safe to run in any order relative to the others — a
 * product that still has history keeps its name, brand and image so the history can be labelled.
 */
export function pruneProducts({ now = Date.now(), days = RETAIN.productDays } = {}) {
  let changes = 0;
  trySoftWrite('pruneProducts', () => {
    changes = Number(productPruneStmt.run(now - days * DAY_MS).changes || 0);
  });
  return changes;
}

export function pruneFlippDetails({ now = Date.now(), days = RETAIN.flippDays } = {}) {
  let changes = 0;
  trySoftWrite('pruneFlippDetails', () => {
    changes = Number(flippPruneStmt.run(now - days * DAY_MS).changes || 0);
  });
  return changes;
}

/**
 * Remove the interior of every run of identical consecutive observations.
 *
 * Within one (pkey, location_id) series ordered by time, a row is redundant exactly when the row
 * before it and the row after it both describe the same price, regular price and sale flag. The
 * first and last row of each run are kept, so:
 *
 *   low / high                             unchanged (the same set of prices survives)
 *   avg     ("Average $4.30")              unchanged (it is time-weighted; see src/history.js)
 *   lowAt   ("cheapest on <date>")         unchanged (the last row of the cheapest run survives)
 *   prev    ("was $4.29")                  unchanged (it reads the row before the current one)
 *   firstAt ("observations since <date>")  unchanged (the first row of the first run survives)
 *   the chart                              unchanged in shape — a step function drawn from the
 *                                          corners of each step looks the same as one drawn from
 *                                          the corners plus fifty dots along the flat part
 *
 * What does change is `n`. `avg` does NOT: src/history.js computes it as a time-weighted mean,
 * which this is exactly — not approximately — lossless for. See the proof there.
 *
 * Rows newer than `graceDays` are never touched.
 *
 * ---------------------------------------------------------------------------------------------
 * Why the work is budgeted in ROWS and not in products
 * ---------------------------------------------------------------------------------------------
 * node:sqlite hands the event loop back between statements and not during one, so the number that
 * decides whether this is safe to run against a live server is not how long the whole job takes —
 * it is how long the LONGEST SINGLE STATEMENT holds the write lock. Every visitor's history write
 * queues behind it, and busy_timeout is 5 s, after which they do not queue, they fail.
 *
 * Chunking by a count of products does not bound that, because products are wildly different
 * sizes: one head product ("milk" at one chain) exists at 760 store locations, and a year of the
 * 12-hour heartbeat gives it 554,800 rows on its own. Measured, a chunk of 500 products spanning
 * 1.46 M rows ran as ONE statement holding the lock for 47.8 SECONDS — nine times the busy_timeout,
 * so for 43 of those seconds every visitor's history write was dropped, not delayed.
 *
 * Budgeting by rows instead, with a product too big for one budget split across its locations:
 *
 *     chunk by 500 products   worst statement 47,828 ms   total 39.6 s
 *     chunk by 5,000 rows     worst statement    811 ms   total 36.9 s
 *
 * — the same rows removed either way, because which rows are redundant does not depend on how the
 * work is divided (qa-db.test.js asserts exactly that). Splitting a product across its locations
 * is safe for the same reason: the window partitions by (pkey, location_id), so one location's
 * series is self-contained and a chunk that takes whole locations sees every neighbour it needs.
 *
 * The total barely moves. All the budget buys is that the lock is given back 400 times instead of
 * 80, which is the only thing a visitor waiting on a write can tell the difference between.
 */
const compactByProducts = (n) => compactSql(`pkey IN (${Array(n).fill('?').join(',')})`, 'pkey, location_id');
const compactByLocations = (n) => compactSql(`pkey = ? AND (${Array(n).fill('location_id IS ?').join(' OR ')})`, 'location_id');

/**
 * The floor: never leave a (product, store location) series with fewer than this many rows.
 *
 * Without it the run rule has a degenerate case. A product whose price has NEVER changed is one
 * single run, so "keep the first and last row of every run" keeps exactly two rows — and
 * public/js/views/compare.js gates the "lowest price seen" badge on `hist.n >= 3`. So a shelf
 * price that had been steady for a year would lose its badge the first time the cron job ran,
 * which is a visible change to a shopper caused purely by maintenance. Keeping the first two and
 * last two rows of each series costs two rows per series — against the ~35 a compacted year of one
 * series holds, roughly 6% — and makes `n >= 3` an invariant rather than an argument.
 *
 * It only ever DECLINES to delete, so every losslessness property above still holds.
 *
 * Declared above pruneObservations, which needs the same floor for the same reason.
 */

function compactSql(scope, partition) {
  return `
  DELETE FROM observations WHERE id IN (
    SELECT id FROM (
      SELECT id, observed_at, price, reg_price, on_sale,
             LAG(price)     OVER w AS p_prev, LEAD(price)     OVER w AS p_next,
             LAG(reg_price) OVER w AS r_prev, LEAD(reg_price) OVER w AS r_next,
             LAG(on_sale)   OVER w AS s_prev, LEAD(on_sale)   OVER w AS s_next,
             ROW_NUMBER()   OVER w AS rn,     COUNT(*)        OVER w AS rows_in_series
      FROM observations
      WHERE ${scope}
      -- The explicit frame is doing real work twice over.
      --
      -- Without it, a window with an ORDER BY defaults to "everything up to this row", so
      -- COUNT(*) OVER w is a RUNNING count that always equals rn — and the floor test below
      -- quietly becomes "rn <= rn - 2", which is never true, so nothing is ever deleted at all.
      --
      -- And it has to be THIS window rather than a second, order-less one. Two window definitions
      -- make SQLite sort the rows twice: measured, that took the longest statement in a run from
      -- 421 ms to 11,232 ms, which is past busy_timeout and therefore past the point where
      -- visitors' history writes fail rather than wait. LAG, LEAD and ROW_NUMBER all ignore the
      -- frame, so one window with a full frame gives every column here what it needs.
      WINDOW w AS (PARTITION BY ${partition} ORDER BY observed_at, id
                   ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    )
    WHERE observed_at < ?
      AND p_prev IS NOT NULL AND p_next IS NOT NULL
      AND p_prev IS price     AND p_next IS price
      AND r_prev IS reg_price AND r_next IS reg_price
      AND s_prev IS on_sale   AND s_next IS on_sale
      AND rn > ${MIN_SERIES_ROWS / 2} AND rn <= rows_in_series - ${MIN_SERIES_ROWS / 2}
  )`;
}

/** How many rows one DELETE may cover. 5,000 measured at 811 ms worst case; see above. */
export const COMPACT_ROW_BUDGET = 5000;

/**
 * And a second, independent bound: how many `?` one statement may carry.
 *
 * The row budget alone does not bound this — a batch of products with one row each would put one
 * parameter in the statement per product and walk straight into SQLITE_MAX_VARIABLE_NUMBER, which
 * is 999 on any SQLite older than 3.32. That throws, trySoftWrite swallows it, and compaction
 * silently stops compacting. Whichever bound bites first wins.
 */
const MAX_PARAMS = 500;

/** What the last compaction did, for the maintenance script to print and the tests to assert. */
export const lastCompaction = { at: 0, statements: 0, splitProducts: 0, removed: 0, totalMs: 0, worstStatementMs: 0, busyTimeoutMs: 0 };

export function compactObservations({ now = Date.now(), graceDays = RETAIN.compactAfterDays, budget = COMPACT_ROW_BUDGET } = {}) {
  const cutoff = now - graceDays * DAY_MS;
  // One row per product that has anything old enough to be a candidate, with its size. Grouping by
  // the leading column of obs_pkey_loc_time means a covering scan in index order and no temp
  // B-tree; HAVING rather than WHERE is what keeps it that way. `n` counts the product's rows
  // including recent ones, which over-estimates the work and so only ever makes a chunk smaller.
  const sized = db.prepare('SELECT pkey, COUNT(*) n FROM observations GROUP BY pkey HAVING MIN(observed_at) < ?').all(cutoff);
  const locationsOf = db.prepare('SELECT DISTINCT location_id FROM observations WHERE pkey = ?');

  // Pack products into statements until the row budget is reached; a single product bigger than
  // the whole budget is split across its store locations instead.
  const jobs = [];
  let batch = [];
  let batchRows = 0;
  const flush = () => {
    if (batch.length) jobs.push({ keys: batch });
    batch = [];
    batchRows = 0;
  };
  for (const { pkey, n } of sized) {
    if (n > budget) {
      flush();
      const locs = locationsOf.all(pkey).map((r) => r.location_id);
      const per = Math.max(1, Math.ceil(n / locs.length)); // rows in one of this product's series
      const step = Math.min(MAX_PARAMS, Math.max(1, Math.floor(budget / per)));
      for (let i = 0; i < locs.length; i += step) jobs.push({ pkey, locs: locs.slice(i, i + step) });
      continue;
    }
    if (batchRows + n > budget || batch.length >= MAX_PARAMS) flush();
    batch.push(pkey);
    batchRows += n;
  }
  flush();

  let changes = 0;
  let worst = 0;
  const started = Date.now();
  for (const job of jobs) {
    const sql = job.keys ? db.prepare(compactByProducts(job.keys.length)) : db.prepare(compactByLocations(job.locs.length));
    const args = job.keys ? [...job.keys, cutoff] : [job.pkey, ...job.locs, cutoff];
    const t = process.hrtime.bigint();
    trySoftWrite('compactObservations', () => {
      changes += Number(sql.run(...args).changes || 0);
    });
    const took = Number(process.hrtime.bigint() - t) / 1e6;
    if (took > worst) worst = took;
  }
  // The operator's number. Not how long the job took — how long the single longest statement held
  // the write lock, because that is how long a visitor's history write waited, and past
  // busy_timeout (5,000 ms) it did not wait, it failed. If this ever approaches that, lower the
  // budget; it costs nothing but more statements.
  Object.assign(lastCompaction, {
    at: started,
    statements: jobs.length,
    splitProducts: jobs.filter((j) => j.locs).length,
    removed: changes,
    totalMs: Date.now() - started,
    worstStatementMs: Math.round(worst),
    busyTimeoutMs: BUSY_TIMEOUT_MS,
  });
  return changes;
}

// ---------------------------------------------------------------------------------------------
// MAINTENANCE
// ---------------------------------------------------------------------------------------------
// WAL never checkpointed and the file never vacuumed, so disk use only went up — deleting rows
// without these two just moves the space into the free list and the write-ahead log.
//
// Both are expensive and BLOCKING (node:sqlite is synchronous), which is precisely why they belong
// in scripts/db-maintenance.js on a schedule and not in a request. Run them against a live server
// and every visitor waits for the vacuum.

/** Fold the write-ahead log back into the database file and truncate it. */
export function checkpoint() {
  try {
    const r = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() || {};
    return { ok: r.busy === 0, ...r };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 160) };
  }
}

/**
 * Rebuild the file so deleted pages go back to the operating system.
 *
 * The trailing checkpoint is not optional and is easy to get wrong: in WAL mode a VACUUM writes
 * the entire rebuilt database into the write-ahead log, so measuring the size straight afterwards
 * shows the file having GROWN — 91.6 MB became 150.5 MB in testing — until the log is folded back
 * in. Checkpoint first, then measure.
 */
export function vacuum() {
  const before = fileBytes();
  try {
    db.exec('VACUUM');
    checkpoint();
    return { ok: true, before, after: fileBytes() };
  } catch (err) {
    checkpoint();
    return { ok: false, before, after: fileBytes(), error: String(err?.message || err).slice(0, 160) };
  }
}

/** The slow, thorough check. Minutes on a large file — never call this from a request. */
export function integrityCheck() {
  try {
    const rows = db.prepare('PRAGMA integrity_check').all();
    const problems = rows.map((r) => Object.values(r)[0]).filter((v) => String(v).toLowerCase() !== 'ok');
    return { ok: problems.length === 0, problems };
  } catch (err) {
    return { ok: false, problems: [String(err?.message || err).slice(0, 160)] };
  }
}

/** Refresh the statistics the query planner uses to pick between the indexes above. */
export function analyze() {
  try {
    db.exec('ANALYZE');
    return true;
  } catch {
    return false;
  }
}

export function fileBytes() {
  try {
    if (dbStatus.degraded) return 0;
    let total = 0;
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        total += fs.statSync(DB_PATH + suffix).size;
      } catch {
        /* the -wal/-shm files come and go */
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export function tableCounts() {
  const out = {};
  for (const t of ['kv', 'cache', 'products', 'observations', 'flipp_details']) {
    try {
      out[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    } catch {
      out[t] = null;
    }
  }
  return out;
}

/**
 * Only one process may run maintenance at a time.
 *
 * Two instances behind a load balancer share this file (that is what a naive two-replica deploy
 * does), and two simultaneous VACUUMs on one file is the one way to turn a slow maintenance run
 * into a stuck one. The lease is a kv row with an expiry, so a crashed run does not hold the lock
 * forever. It is advisory and deliberately cheap — the damage it prevents is duplicated work, not
 * corruption; SQLite's own locking handles that.
 */
const LOCK_KEY = 'maintenance:lease';
export function takeMaintenanceLease(owner, ttlMs = 30 * 60 * 1000, now = Date.now()) {
  const held = getKV(LOCK_KEY);
  if (held && held.until > now && held.owner !== owner) return false;
  setKV(LOCK_KEY, { owner, until: now + ttlMs, at: now });
  const check = getKV(LOCK_KEY);
  return check?.owner === owner;
}
export function releaseMaintenanceLease(owner) {
  const held = getKV(LOCK_KEY);
  if (!held || held.owner === owner) delKV(LOCK_KEY);
}

/**
 * The whole scheduled job. Returns a report rather than printing, so the script can format it and
 * the tests can assert on it.
 */
export function maintain({ now = Date.now(), vacuumFile = true, dryRun = false, compact = true } = {}) {
  const before = { ...tableCounts(), bytes: fileBytes() };
  const removed = { observations: 0, compacted: 0, products: 0, cache: 0, flippDetails: 0 };
  if (!dryRun) {
    // Order matters: age out first, then compact what is left, then drop products that no longer
    // have any history, then the caches.
    removed.observations = pruneObservations({ now });
    if (compact) removed.compacted = compactObservations({ now });
    removed.products = pruneProducts({ now });
    removed.cache = cachePurge({ now });
    removed.flippDetails = pruneFlippDetails({ now });
  }
  const walResult = dryRun ? null : checkpoint();
  const vacuumResult = dryRun || !vacuumFile ? null : vacuum();
  if (!dryRun) analyze();
  const after = { ...tableCounts(), bytes: fileBytes() };
  return { dryRun, before, after, removed, checkpoint: walResult, vacuum: vacuumResult, reclaimedBytes: before.bytes - after.bytes };
}

// ---------- legacy single-user data ----------
// A database created before Cartworth became multi-visitor still holds the owner's own settings
// row (which included their Kroger client secret in plain text), watchlist, shopping list and
// search history. Nothing reads those any more, but leaving them on disk — and especially shipping
// that file to a host — would keep a secret the server is no longer supposed to have.
//
// Migration 1 above already drops the per-visitor tables when they are EMPTY, which is the case on
// every database that has only ever run the current code. What survives to be reported here is a
// developer's own file with real rows in it, and we never delete somebody's data behind their
// back: this only reports. Run the server once with BASKET_PURGE_LEGACY=1 to remove them.
const LEGACY_TABLES = DEAD_PER_VISITOR_TABLES;

export function legacyReport() {
  const found = [];
  for (const t of LEGACY_TABLES) {
    try {
      const n = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get()?.n ?? 0;
      if (n > 0) found.push(`${t} (${n} rows)`);
    } catch {
      /* table does not exist: nothing to report */
    }
  }
  const hasSettings = !!kvGet.get('settings');
  return { tables: found, settingsRow: hasSettings, any: found.length > 0 || hasSettings };
}

export function purgeLegacy() {
  for (const t of LEGACY_TABLES) {
    try {
      db.exec(`DROP TABLE IF EXISTS ${t}`);
    } catch {
      /* ignore */
    }
  }
  delKV('settings');
  return legacyReport();
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // A failed ROLLBACK means the transaction was already gone (SQLITE_FULL aborts it for us).
      // Swallowing it here keeps the ORIGINAL error — the one that says what really went wrong —
      // as the one the caller sees.
    }
    throw e;
  }
}
