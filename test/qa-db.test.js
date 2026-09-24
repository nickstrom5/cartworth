// QA: is Cartworth's database safe to run as a public service?
//
// It was designed for one person on one laptop, where "never delete anything", "the file always
// opens", "one process" and "a blocking query only blocks me" are all fine assumptions. None of
// them survive being put on the internet. This file pins the four things that changed:
//
//   1. RETENTION       — nothing used to be deleted, anywhere. Measured against the real
//                        recordProducts() path at 100 visitors a day, observations grew by 96,295
//                        rows a DAY — 2.9 M rows and 425 MB a month, forever. Compaction is what
//                        makes that survivable (a year of one series: 730 rows down to 35), so
//                        what it must not disturb is pinned here row by row.
//   2. LOCATION SCOPE  — history is per store location. A statistic or a chart that pools two
//                        locations shows a shopper a price they cannot get, which is the one
//                        thing this app must never do (see qa-implausible-prices.test.js).
//   3. BLOCKING        — node:sqlite is synchronous, so a slow statement does not block one
//                        visitor, it blocks all of them. The plans asserted here are the
//                        difference between an index seek and a scan of the whole price history.
//   4. DEGRADING       — a corrupt file, a full disk or a second process must make the server
//                        worse, not dead.
//
// Convention, matching the other QA files: "control: …" asserts a property that HOLDS today and
// must keep holding.
//
// Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This file DELETES, DROPS and VACUUMs, so it gets a scratch directory of its own rather than
// `||=`-ing onto whatever the run is using: node --test runs files in parallel, and a VACUUM
// underneath another file's assertions would be a spectacular way to produce a flaky suite.
const DATA_DIR = path.join(os.tmpdir(), 'cartworth-qa-db');
fs.rmSync(DATA_DIR, { recursive: true, force: true });
process.env.BASKET_DATA_DIR = DATA_DIR;

const DB = await import('../src/db.js');
const H = await import('../src/history.js');
const { makeProduct } = await import('../src/normalize.js');
const cache = await import('../src/cache.js');

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const uniq = (p) => `${p}-${process.pid}-${seq++}`;

/** Put a row straight into observations, so a test can place history at an arbitrary time. */
const rawInsert = DB.db.prepare(
  'INSERT INTO observations (pkey, store_id, location_id, price, reg_price, unit_dim, unit_price, on_sale, promo, observed_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
);
function obs(pkey, locationId, price, at, { reg = null, onSale = false } = {}) {
  rawInsert.run(pkey, pkey.split(':')[0], locationId, price, reg, 'weight', price / 10, onSale ? 1 : 0, null, at);
}
const prices = (pkey, loc) =>
  DB.db.prepare('SELECT price, observed_at FROM observations WHERE pkey = ? AND location_id IS ? ORDER BY observed_at').all(pkey, loc);

// ---------------------------------------------------------------------------
// 1. The dead per-visitor tables are gone, and the migration that removes them is safe.
// ---------------------------------------------------------------------------

test('control: the per-visitor tables from the single-user era do not exist', () => {
  const tables = DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const dead of ['watches', 'watch_points', 'list_items', 'searches']) {
    assert.ok(!tables.includes(dead), `"${dead}" is per-visitor data and must not exist on a shared server`);
  }
});

test('control: nothing in the server writes to a per-visitor table', () => {
  // The hazard is not the empty tables themselves, it is the next feature added in a hurry: a
  // stray INSERT would put one visitor's watchlist on a server the privacy policy says never
  // receives one. Grep is the check that keeps working as the code changes.
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  files.push(path.join(ROOT, 'server.js'));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const t of ['watches', 'watch_points', 'list_items', 'searches']) {
      // SQL that names the table, not the JS variable `watches` the browser code also uses.
      const re = new RegExp(`(INSERT\\s+(OR\\s+\\w+\\s+)?INTO|UPDATE|DELETE\\s+FROM)\\s+${t}\\b`, 'i');
      if (re.test(src)) offenders.push(`${path.relative(ROOT, f)} writes to ${t}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('control: the migration drops an empty legacy table but never one with rows in it', () => {
  // Rebuild the pre-refactor shape in a scratch file and open it the way a deploy would.
  const dir = path.join(os.tmpdir(), uniq('cartworth-qa-db-legacy'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'basket.db');
  const script = `
    import { DatabaseSync } from 'node:sqlite';
    const d = new DatabaseSync(process.env.BASKET_DB);
    d.exec('CREATE TABLE watches (id INTEGER PRIMARY KEY, query TEXT)');
    d.exec('CREATE TABLE watch_points (id INTEGER PRIMARY KEY, watch_id INTEGER)');
    d.exec('CREATE TABLE list_items (id INTEGER PRIMARY KEY, text TEXT)');
    d.exec("INSERT INTO list_items (text) VALUES ('the owner''s real shopping list')");
    d.close();
    const db = await import(${JSON.stringify(path.join(ROOT, 'src/db.js'))});
    const names = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    console.log(JSON.stringify({ names, legacy: db.legacyReport() }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', script], {
    env: { ...process.env, BASKET_DATA_DIR: dir, BASKET_DB: file },
    encoding: 'utf8',
  });
  const { names, legacy } = JSON.parse(out.trim().split('\n').pop());
  assert.ok(!names.includes('watches'), 'an empty watches table must be dropped');
  assert.ok(!names.includes('watch_points'), 'an empty watch_points table must be dropped');
  assert.ok(names.includes('list_items'), 'a table holding somebody’s real rows must NOT be deleted behind their back');
  assert.ok(legacy.tables.some((t) => t.startsWith('list_items')), 'and it must be reported so the operator can act');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('control: the migration is safe on the database this project actually shipped', () => {
  // The test above builds a stand-in. This one runs against the real pre-refactor schema —
  // including the foreign key from watch_points to watches, which is the one ordering that can
  // make a DROP fail, and the `searches` table, which is per-visitor data the brief did not name.
  const dir = path.join(os.tmpdir(), uniq('cartworth-qa-db-shipped'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'basket.db');
  const script = `
    import { DatabaseSync } from 'node:sqlite';
    const d = new DatabaseSync(process.env.BASKET_DB);
    d.exec(\`
      CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE products (pkey TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT, brand TEXT, size TEXT,
        image TEXT, url TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);
      CREATE TABLE observations (id INTEGER PRIMARY KEY, pkey TEXT NOT NULL, store_id TEXT NOT NULL, price REAL,
        reg_price REAL, unit_dim TEXT, unit_price REAL, on_sale INTEGER NOT NULL DEFAULT 0, promo TEXT,
        observed_at INTEGER NOT NULL);
      CREATE INDEX obs_pkey_time ON observations(pkey, observed_at);
      CREATE TABLE searches (q TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 1, last_at INTEGER NOT NULL);
      CREATE TABLE watches (id INTEGER PRIMARY KEY, query TEXT NOT NULL, label TEXT);
      CREATE TABLE watch_points (id INTEGER PRIMARY KEY, watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
        store_id TEXT NOT NULL, pkey TEXT, at INTEGER NOT NULL);
      CREATE INDEX wp_watch_time ON watch_points(watch_id, at);
      CREATE TABLE list_items (id INTEGER PRIMARY KEY, text TEXT NOT NULL, qty REAL NOT NULL DEFAULT 1, done INTEGER NOT NULL DEFAULT 0);
    \`);
    // A row of real price history, so the migration is proved not to disturb one.
    d.prepare('INSERT INTO observations (pkey, store_id, price, observed_at) VALUES (?,?,?,?)').run('jewel:milk', 'jewel', 3.49, 1700000000000);
    d.close();
    const db = await import(${JSON.stringify(path.join(ROOT, 'src/db.js'))});
    console.log(JSON.stringify({
      degraded: db.dbStatus.degraded,
      tables: db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
      indexes: db.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all().map((r) => r.name),
      columns: db.db.prepare('PRAGMA table_info(observations)').all().map((c) => c.name),
      kept: db.db.prepare('SELECT price, location_id FROM observations').all(),
      version: db.db.prepare('PRAGMA user_version').get().user_version,
      legacy: db.legacyReport(),
    }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', script], {
    env: { ...process.env, BASKET_DATA_DIR: dir, BASKET_DB: file },
    encoding: 'utf8',
  });
  const r = JSON.parse(out.trim().split('\n').pop());

  assert.equal(r.degraded, false, 'the migration must not push a healthy database into the in-memory fallback');
  for (const dead of ['watches', 'watch_points', 'list_items', 'searches']) {
    assert.ok(!r.tables.includes(dead), `"${dead}" survived the migration on a real file`);
  }
  assert.ok(!r.indexes.includes('wp_watch_time'), 'the dropped table’s index goes with it');
  assert.ok(r.columns.includes('location_id'), 'the added column must arrive on an existing table');
  assert.ok(!r.indexes.includes('obs_pkey_time'), 'the redundant index must be dropped');
  assert.ok(r.indexes.includes('obs_pkey_loc_time') && r.indexes.includes('obs_time') && r.indexes.includes('cache_expires'));
  assert.deepEqual(r.kept, [{ price: 3.49, location_id: null }], 'real price history must come through untouched');
  assert.equal(r.version, 1, 'and the migration must record that it ran, so it never runs twice');
  assert.equal(r.legacy.any, false, 'nothing left to report');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 2. Retention.
// ---------------------------------------------------------------------------

test('control: observations older than the retention window are deleted, newer ones are not', () => {
  const key = `qa:${uniq('retain')}`;
  const now = Date.now();
  // Eight rows, six of them past the 365-day window. The floor keeps the newest MIN_SERIES_ROWS
  // regardless of age, so the two youngest EXPIRED rows survive alongside the two live ones.
  for (const [price, age] of [[1, 400], [2, 399], [3, 398], [4, 397], [5, 396], [6, 366], [7, 364], [8, 1]]) {
    obs(key, 'loc-a', price, now - age * DAY);
  }
  DB.pruneObservations({ now });
  assert.deepEqual(prices(key, 'loc-a').map((r) => r.price), [5, 6, 7, 8]);
  assert.equal(prices(key, 'loc-a').length, DB.MIN_SERIES_ROWS);
});

// The floor is not a rounding detail — it is the whole reason age-out is safe to run.
//
// Before it, a price that had never changed aged out to two rows, and public/js/views/compare.js
// gates the "Lowest seen" badge on `hist.n >= 3`. A shopper watching a steady price saw the badge
// vanish the first time the cron ran, with nothing in the world having changed.
test('control: age-out never takes a series below the badge threshold, however old it is', () => {
  const key = `qa:${uniq('floor')}`;
  const now = Date.now();
  for (let i = 0; i < 8; i++) obs(key, 'loc-a', 5.0, now - (500 + i) * DAY);
  DB.pruneObservations({ now });
  const left = prices(key, 'loc-a');
  assert.equal(left.length, DB.MIN_SERIES_ROWS, 'a price that never changed keeps its floor, not nothing');
  assert.ok(left.length >= 3, 'compare.js gates the "Lowest seen" badge on n >= 3');
  assert.deepEqual([...new Set(left.map((r) => r.price))], [5], 'and the surviving rows still say what it costs');
});

// The floor is per (pkey, location_id), so one busy location cannot spend another's.
test('control: the age-out floor is per store location, not per product', () => {
  const key = `qa:${uniq('floor-loc')}`;
  const now = Date.now();
  for (let i = 0; i < 10; i++) obs(key, 'loc-a', 2.0, now - (500 + i) * DAY);
  for (let i = 0; i < 10; i++) obs(key, 'loc-b', 3.0, now - (500 + i) * DAY);
  // A chain-wide price is filed under a NULL location and is its own series.
  for (let i = 0; i < 10; i++) obs(key, null, 4.0, now - (500 + i) * DAY);
  DB.pruneObservations({ now });
  for (const loc of ['loc-a', 'loc-b', null]) {
    assert.equal(prices(key, loc).length, DB.MIN_SERIES_ROWS, `series ${loc ?? 'NULL (chain-wide)'} kept its own floor`);
  }
});

test('control: a product with no history left and no recent sighting is removed; one with history is kept', () => {
  const now = Date.now();
  const dead = `qa:${uniq('dead')}`;
  const alive = `qa:${uniq('alive')}`;
  const ins = DB.db.prepare('INSERT INTO products (pkey, store_id, name, first_seen, last_seen) VALUES (?,?,?,?,?)');
  ins.run(dead, 'qa', 'gone', now - 500 * DAY, now - 500 * DAY);
  ins.run(alive, 'qa', 'still here', now - 500 * DAY, now - 500 * DAY);
  obs(alive, 'loc-a', 5.0, now - 2 * DAY);
  DB.pruneProducts({ now });
  const has = (k) => !!DB.db.prepare('SELECT 1 FROM products WHERE pkey = ?').get(k);
  assert.equal(has(dead), false, 'a product with no observations and no sighting for a year is dead weight');
  assert.equal(has(alive), true, 'a product that still has history keeps its name so the history can be labelled');
});

test('control: the cache keeps what a caller could still read as stale and drops what it could not', () => {
  const now = Date.now();
  const fresh = uniq('cache-fresh');
  const usable = uniq('cache-usable');
  const unreachable = uniq('cache-unreachable');
  // cacheSet takes a TTL; expires_at is what retention looks at.
  DB.cacheSet(fresh, { v: 1 }, 20 * 60 * 1000);
  // Both sides of the boundary are taken FROM the window rather than written as a number: the
  // window moved once already (8 days, which was shorter than what src/directory.js asks for and
  // so was deleting a fallback that was still in use), and a hard-coded 30 here went on passing
  // right through that bug.
  DB.cacheSet(usable, { v: 2 }, -(DB.RETAIN.cacheStaleDays - 1) * DAY); // still inside every stale window
  DB.cacheSet(unreachable, { v: 3 }, -(DB.RETAIN.cacheStaleDays + 1) * DAY); // past every stale window
  DB.cachePurge({ now });
  const row = (k) => DB.db.prepare('SELECT 1 FROM cache WHERE key = ?').get(k);
  assert.ok(row(fresh));
  assert.ok(row(usable), 'src/cache.js serves an expired entry when a retailer is down — do not delete those');
  assert.ok(!row(unreachable), 'nothing can read an entry older than the longest stale window');
});

test('control: the cache is not purged sooner than a caller can still read it', () => {
  // The dangerous direction of a retention window. src/cache.js serves an expired entry when a
  // retailer is down, up to the caller's maxStaleMs — so purging at any window SHORTER than the
  // longest maxStaleMs in the tree silently removes a fallback somebody is relying on, and the
  // first sign of it is an error page during an outage that was supposed to degrade gracefully.
  //
  // Derived from the source, not asserted as a number, because the number changes when somebody
  // adds a caller and nothing else would notice.
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY_MS = 24 * HOUR;
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  files.push(path.join(ROOT, 'server.js'));

  const found = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/maxStaleMs\s*[:=]\s*([0-9_*\s+A-Za-z]+?)\s*[,}\n)]/g)) {
      const expr = m[1].trim();
      if (!/^[0-9_*\s+]*(?:(?:DAY|HOUR|MIN|SECOND)\b[0-9_*\s+]*)*$/.test(expr)) continue; // not a literal window
      const ms = Function('DAY', 'HOUR', 'MIN', 'SECOND', `return (${expr});`)(DAY_MS, HOUR, MIN, 1000);
      if (Number.isFinite(ms) && ms > 0) found.push({ where: path.relative(ROOT, f), expr, days: ms / DAY_MS });
    }
  }
  assert.ok(found.length >= 3, `expected to find the stale windows in the source, found ${JSON.stringify(found)}`);
  const worst = found.reduce((a, b) => (b.days > a.days ? b : a));
  assert.ok(
    DB.RETAIN.cacheStaleDays >= worst.days,
    `${worst.where} serves a cached answer up to ${worst.days} days stale (${worst.expr}), but cachePurge deletes it ` +
      `after ${DB.RETAIN.cacheStaleDays} — the fallback would be gone exactly when the retailer is down`,
  );
});

test('control: weekly-ad details age out', () => {
  const now = Date.now();
  const put = DB.db.prepare('INSERT OR REPLACE INTO flipp_details (id, json, fetched_at) VALUES (?,?,?)');
  put.run(910001, '{}', now - 40 * DAY);
  put.run(910002, '{}', now - 2 * DAY);
  DB.pruneFlippDetails({ now });
  const has = (id) => !!DB.db.prepare('SELECT 1 FROM flipp_details WHERE id = ?').get(id);
  assert.equal(has(910001), false);
  assert.equal(has(910002), true);
});

// ---------------------------------------------------------------------------
// 3. Compaction — the heartbeat rows. This is where the growth actually is, so this is where the
//    proof that nothing a shopper sees moves has to be.
// ---------------------------------------------------------------------------

/** Every number src/history.js derives from a series, straight from its own statements. */
function displayed(pkey, loc) {
  const s = DB.db.prepare(
    'SELECT COUNT(*) n, MIN(price) low, MAX(price) high, MIN(observed_at) first_at, MAX(observed_at) last_at FROM observations WHERE pkey = ? AND location_id IS ?',
  ).get(pkey, loc);
  const lowAt = DB.db.prepare('SELECT observed_at FROM observations WHERE pkey = ? AND location_id IS ? AND price <= ? ORDER BY observed_at DESC LIMIT 1')
    .get(pkey, loc, s.low + 0.004)?.observed_at ?? null;
  const prev = DB.db.prepare('SELECT price FROM observations WHERE pkey = ? AND location_id IS ? AND observed_at < ? ORDER BY observed_at DESC LIMIT 1')
    .get(pkey, loc, s.last_at)?.price ?? null;
  // The line the chart draws: the sequence of distinct consecutive prices. Extra samples along a
  // flat stretch draw the same line.
  const steps = [];
  for (const r of prices(pkey, loc)) if (steps[steps.length - 1] !== r.price) steps.push(r.price);
  return { low: s.low, high: s.high, firstAt: s.first_at, lastAt: s.last_at, lowAt, prev, steps };
}

test('control: compaction removes the duplicate heartbeat rows and changes nothing a shopper sees', () => {
  const key = `qa:${uniq('compact')}`;
  const now = Date.now();
  // A year of the real pattern: the 12-hour heartbeat writing the same price over and over, with
  // three genuine price moves and one sale week.
  const plan = [
    { price: 4.29, from: 360, to: 300 },
    { price: 3.49, from: 300, to: 240, sale: true, reg: 4.29 }, // the low, and it must keep its date
    { price: 4.29, from: 240, to: 120 },
    { price: 4.79, from: 120, to: 20 },
  ];
  let rows = 0;
  for (const seg of plan) {
    for (let d = seg.from; d > seg.to; d -= 0.5) {
      obs(key, 'loc-a', seg.price, now - d * DAY, { reg: seg.reg ?? null, onSale: !!seg.sale });
      rows++;
    }
  }
  const before = displayed(key, 'loc-a');
  assert.ok(rows > 600, `the heartbeat really does write this many rows for one product at one store (${rows})`);

  const removed = DB.compactObservations({ now });
  const after = displayed(key, 'loc-a');
  const kept = prices(key, 'loc-a').length;

  assert.ok(removed > 0);
  assert.ok(kept <= 10, `a year of one product at one store should collapse to a handful of rows, got ${kept}`);
  assert.deepEqual(after, before, 'every number the product page shows must be byte-identical after compaction');
});

test('control: compaction keeps the first and last row of every run of one price', () => {
  const key = `qa:${uniq('runs')}`;
  const now = Date.now();
  for (let i = 0; i < 10; i++) obs(key, 'loc-a', 2.0, now - (100 - i) * DAY);
  for (let i = 0; i < 10; i++) obs(key, 'loc-a', 3.0, now - (90 - i) * DAY);
  DB.compactObservations({ now });
  const kept = prices(key, 'loc-a');
  const at = (d) => kept.some((r) => r.observed_at === now - d * DAY);

  // The corners of the step, which is everything the chart and every statistic are made of.
  assert.ok(at(100), 'the first sighting is when the history starts — keep it');
  assert.ok(at(91), 'the last row at the old price is when it changed — keep it');
  assert.ok(at(90), 'the first row at the new price — keep it');
  assert.ok(at(81), 'the most recent row — keep it');
  assert.deepEqual([...new Set(kept.map((r) => r.price))], [2, 3], 'and no price is lost');

  // Six, not four: MIN_SERIES_ROWS in src/db.js also protects the first two and last two rows of
  // the series, so that a series can never fall below the three observations the "lowest price
  // seen" badge needs. Here that adds the second row and the second-to-last.
  assert.deepEqual(kept.map((r) => r.price), [2, 2, 2, 3, 3, 3]);
});

test('control: compaction never touches a row inside the grace window', () => {
  const key = `qa:${uniq('grace')}`;
  const now = Date.now();
  // Ten identical rows, all from the last three days. The "price dropped" comparison and the
  // recent end of the chart read these, so maintenance must leave them exactly alone.
  for (let i = 0; i < 10; i++) obs(key, 'loc-a', 1.99, now - i * 0.3 * DAY);
  DB.compactObservations({ now });
  assert.equal(prices(key, 'loc-a').length, 10);
});

test('control: compaction keeps a row whose neighbours differ in reg_price or the sale flag alone', () => {
  const key = `qa:${uniq('sale-edge')}`;
  const now = Date.now();
  // Same price throughout, but the middle row is the one where it went on sale — the price is the
  // same $4 either way, so a naive "same price as both neighbours" rule would throw away the fact
  // that a sale started.
  obs(key, 'loc-a', 4.0, now - 60 * DAY, { reg: null, onSale: false });
  obs(key, 'loc-a', 4.0, now - 50 * DAY, { reg: 5.0, onSale: true });
  obs(key, 'loc-a', 4.0, now - 40 * DAY, { reg: null, onSale: false });
  DB.compactObservations({ now });
  assert.equal(prices(key, 'loc-a').length, 3, 'a change in the sale flag is a change, even at an unchanged price');
});

test('control: compaction treats each store location as its own series', () => {
  const key = `qa:${uniq('per-loc')}`;
  const now = Date.now();
  // Interleaved in time across two stores. Compacted per pkey alone, each row's "neighbour" would
  // be the other city's row and the two histories would shred each other.
  for (let d = 60; d > 20; d -= 1) {
    obs(key, 'loc-a', 2.0, now - d * DAY);
    obs(key, 'loc-b', 9.0, now - (d - 0.25) * DAY);
  }
  DB.compactObservations({ now });
  // Four apiece, not two: a series of one unchanging price is one run, and MIN_SERIES_ROWS keeps
  // its first two and last two rows. The point here is that no $9 row turns up in loc-a's series.
  assert.deepEqual(prices(key, 'loc-a').map((r) => r.price), [2, 2, 2, 2]);
  assert.deepEqual(prices(key, 'loc-b').map((r) => r.price), [9, 9, 9, 9]);
});

// ---------------------------------------------------------------------------
// 4. Location scope. A pooled statistic is a wrong price.
// ---------------------------------------------------------------------------

test('control: a legacy row with no location_id does not poison a real location’s history', () => {
  const now = Date.now();
  const id = uniq('null-loc');
  const key = `qa:${id}`;
  // The NULL rows are chain-wide listings (Instacart hands us one when no store serves the ZIP).
  // They are a bucket of their own, not a wildcard that joins every store's history.
  obs(key, null, 0.99, now - 10 * DAY);
  obs(key, null, 0.99, now - 9 * DAY);
  obs(key, 'loc-a', 5.49, now - 3 * DAY);
  const p = makeProduct({ storeId: 'qa', id, name: 'QA Butter', sizeText: '16 oz', price: 5.49, locationId: 'loc-a' });
  const stats = H.historyStats([p])[key];
  assert.equal(stats.n, 1, 'only the rows from this store count');
  assert.equal(stats.low, 5.49, 'the $0.99 chain-wide listing is NOT this store’s lowest seen');
  assert.equal(stats.high, 5.49);
  assert.equal(stats.prev, null, 'and it is not a "was $0.99" either');

  // …and the chain-wide bucket is still readable on its own terms.
  const national = makeProduct({ storeId: 'qa', id, name: 'QA Butter', sizeText: '16 oz', price: 0.99 });
  assert.equal(national.locationId, null);
  assert.equal(H.historyStats([national])[key].low, 0.99);
});

test('control: recordProducts compares against the last price AT THE SAME STORE', () => {
  const now = Date.now();
  const id = uniq('same-store');
  const key = `qa:${id}`;
  const at = (loc, price) => makeProduct({ storeId: 'qa', id, name: 'QA Milk', sizeText: '1 gal', price, locationId: loc });
  assert.equal(H.recordProducts([at('loc-a', 3.99)], now), 1);
  // A different store at a different price is a new series, not a change to the first one.
  assert.equal(H.recordProducts([at('loc-b', 8.99)], now), 1);
  // The same store at the same price a minute later is neither changed nor stale: no row.
  assert.equal(H.recordProducts([at('loc-a', 3.99)], now + 60_000), 0);
  assert.deepEqual(prices(key, 'loc-a').map((r) => r.price), [3.99]);
  assert.deepEqual(prices(key, 'loc-b').map((r) => r.price), [8.99]);
});

test('control: the product chart is scoped to one store location', () => {
  const now = Date.now();
  const key = `qa:${uniq('chart')}`;
  obs(key, 'chicago', 3.29, now - 3 * DAY);
  obs(key, 'chicago', 3.49, now - 1 * DAY);
  obs(key, 'los-angeles', 6.99, now - 2 * DAY);

  const here = H.productHistory(key, 'chicago');
  assert.deepEqual(here.series.map((s) => s.price), [3.29, 3.49], 'oldest first, and only this store');
  assert.equal(here.locations, 2);
  assert.equal(here.mixed, false);
  assert.ok(!here.series.some((s) => s.price === 6.99), 'the modal says "Price history at <store>" — it must mean this one');
});

test('control: asked for a chart with no location, a product seen at several answers with none rather than the wrong one', () => {
  const now = Date.now();
  const key = `qa:${uniq('unscoped')}`;
  obs(key, 'chicago', 3.29, now - 2 * DAY);
  obs(key, 'los-angeles', 6.99, now - 1 * DAY);
  const r = H.productHistory(key);
  assert.equal(r.mixed, true);
  assert.deepEqual(r.series, [], 'no number beats a wrong number');
});

test('control: a product seen at exactly one location still charts when no location is given', () => {
  const now = Date.now();
  const key = `qa:${uniq('single')}`;
  obs(key, 'chicago', 3.29, now - 2 * DAY);
  obs(key, 'chicago', 3.19, now - 1 * DAY);
  const r = H.productHistory(key);
  assert.equal(r.mixed, false);
  assert.deepEqual(r.series.map((s) => s.price), [3.29, 3.19]);
});

test('control: one product’s chart is bounded, however many observations it has', () => {
  const now = Date.now();
  const key = `qa:${uniq('huge')}`;
  const n = H.MAX_SERIES_POINTS + 250;
  DB.db.exec('BEGIN');
  for (let i = 0; i < n; i++) obs(key, 'loc-a', 2 + (i % 7) / 100, now - (n - i) * 60_000);
  DB.db.exec('COMMIT');
  const r = H.productHistory(key, 'loc-a');
  assert.equal(r.series.length, H.MAX_SERIES_POINTS);
  assert.equal(r.truncated, true);
  // The cap must keep the RECENT end — that is what the chart is about.
  assert.equal(r.series[r.series.length - 1].t, now - 60_000);
  assert.ok(r.series[0].t > now - n * 60_000, 'the oldest points are the ones dropped');
});

// ---------------------------------------------------------------------------
// 5. Blocking. node:sqlite is synchronous, so a scan here is a scan for every visitor at once.
// ---------------------------------------------------------------------------

const planOf = (sql) => DB.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => r.detail).join(' | ');

test('control: every statement on the request path is an index seek, not a scan', () => {
  // The SQL comes from src/history.js itself (REQUEST_PATH_STATEMENTS), not from a copy pasted in
  // here: a copy keeps passing while the statement it was copied from grows a table scan.
  const hot = Object.entries(H.REQUEST_PATH_STATEMENTS).map(([label, stmt]) => [label, stmt.sourceSQL]);
  hot.push(['cache read', 'SELECT value, expires_at FROM cache WHERE key = ?']);
  for (const [label, sql] of hot) {
    const plan = planOf(sql);
    // "SCAN (subquery-N)" is a walk of a co-routine's few rows, which is the point of a window
    // function. "SCAN observations" is a walk of the whole price history, which is the bug.
    const scansATable = plan.split(' | ').some((step) => /\bSCAN\b/.test(step) && !/\bSCAN \(?(subquery|CO-ROUTINE)/i.test(step));
    assert.ok(!scansATable, `${label} scans a table instead of seeking: ${plan}`);
  }
});

test('control: the statements the request path runs are the ones asserted above', () => {
  // Guards the guard: if a statement is dropped from REQUEST_PATH_STATEMENTS the test above
  // silently stops covering it.
  const names = Object.keys(H.REQUEST_PATH_STATEMENTS);
  for (const needed of ['historyStats aggregate', 'historyStats lowAt', 'historyStats prev', 'recordProducts lastObs', 'productHistory series', 'productHistory location probe']) {
    assert.ok(names.includes(needed), `${needed} is no longer being plan-checked`);
  }
});

test('control: the average a shopper is shown does not move when maintenance runs', () => {
  // THE property that lets compaction delete anything at all. public/js/views/product.js renders
  // `Average $x.xx` straight from historyStats().avg, so if maintenance can move that number,
  // maintenance can put a wrong price on the page — the one thing the app must never do.
  const id = uniq('avg-stable');
  const key = `qa:${id}`;
  const now = Date.now();
  // A year of the real pattern: the 12-hour heartbeat, one long sale, one shelf-price rise.
  const plan = [
    { price: 4.29, from: 365, to: 200 },
    { price: 3.19, from: 200, to: 190, sale: true, reg: 4.29 }, // a short sale, heavily sampled
    { price: 4.29, from: 190, to: 60 },
    { price: 4.99, from: 60, to: 9 },
  ];
  for (const seg of plan) {
    for (let d = seg.from; d > seg.to; d -= 0.5) obs(key, 'loc-a', seg.price, now - d * DAY, { reg: seg.reg ?? null, onSale: !!seg.sale });
  }
  const product = { key, locationId: 'loc-a', price: 4.99 };
  const before = H.historyStats([product], now)[key];
  const removed = DB.compactObservations({ now });
  const after = H.historyStats([product], now)[key];

  assert.ok(removed > 500, `compaction must actually have removed the heartbeat rows (removed ${removed})`);
  assert.equal(after.avg, before.avg, 'the displayed average moved because a cron job ran');
  assert.equal(after.low, before.low);
  assert.equal(after.high, before.high);
  assert.equal(after.lowAt, before.lowAt);
  assert.equal(after.firstAt, before.firstAt);
});

test('control: the average is weighted by how long a price stood, not by how often people searched', () => {
  // Two products, identical prices over identical stretches. One is searched constantly while it
  // is cheap; the other is not. A mean over rows tells the shopper they are different.
  const now = Date.now();
  const mk = (id, cheapSamples) => {
    const key = `qa:${uniq(id)}`;
    obs(key, 'loc-a', 10, now - 100 * DAY); // $10 for 90 days
    for (let i = 0; i < cheapSamples; i++) obs(key, 'loc-a', 5, now - 10 * DAY + i * 1000); // $5 for the last 10
    obs(key, 'loc-a', 5, now - 0.5 * DAY);
    return H.historyStats([{ key, locationId: 'loc-a', price: 5 }], now)[key];
  };
  const quiet = mk('avg-quiet', 1);
  const busy = mk('avg-busy', 400);
  assert.equal(quiet.avg, busy.avg, 'the same price history read differently because one was searched more');
  // $10 for ~90 of the ~100 observed days.
  assert.ok(quiet.avg > 9 && quiet.avg < 9.6, `expected ~9.5, got ${quiet.avg}`);
});

test('control: one compaction statement is bounded by rows, not by how many products it names', () => {
  // A single head product — one chain's milk at many store locations — is bigger than a whole
  // chunk on its own, so chunking by a count of products does not bound the work. Measured before
  // this was fixed: one DELETE held the write lock for 47.8 seconds, nine times busy_timeout, so
  // visitors' history writes did not queue, they failed.
  const key = `qa:${uniq('fat-head')}`;
  const now = Date.now();
  const LOCS = 40;
  for (let L = 0; L < LOCS; L++) {
    for (let d = 60; d > 8; d -= 0.5) obs(key, `loc-${L}`, L % 2 ? 2.99 : 3.49, now - d * DAY);
  }
  const mine = () => DB.db.prepare('SELECT COUNT(*) n FROM observations WHERE pkey = ?').get(key).n;
  assert.equal(mine(), LOCS * 104);

  // A budget far below one product's size forces the split-by-location path.
  DB.compactObservations({ now, budget: 50 });

  // Every location kept its own floor of rows, at its own price — a split that leaked across
  // locations would leave one location's price standing in for another's.
  assert.equal(mine(), LOCS * 4, 'each location collapses to the MIN_SERIES_ROWS floor');
  for (let L = 0; L < LOCS; L++) {
    const got = prices(key, `loc-${L}`);
    assert.equal(got.length, 4, `location ${L}`);
    for (const r of got) assert.equal(r.price, L % 2 ? 2.99 : 3.49, `location ${L} kept another location’s price`);
  }
});

test('control: compaction reports how long it held the write lock, and stays under busy_timeout', () => {
  const key = `qa:${uniq('lock-report')}`;
  const now = Date.now();
  for (let L = 0; L < 12; L++) for (let d = 120; d > 8; d -= 0.5) obs(key, `loc-${L}`, 6.25, now - d * DAY);

  DB.compactObservations({ now, budget: 200 });
  const c = DB.lastCompaction;
  assert.ok(c.statements > 1, 'a budget this small must have been spread over several statements');
  assert.ok(c.splitProducts > 0, 'and a product bigger than the whole budget must have been split across its locations');
  assert.ok(c.removed > 0);
  assert.ok(
    c.worstStatementMs < c.busyTimeoutMs,
    `the longest statement held the write lock ${c.worstStatementMs} ms, past the ${c.busyTimeoutMs} ms busy_timeout — ` +
      'visitors’ history writes would stop queueing and start failing',
  );
  assert.equal(c.busyTimeoutMs, DB.BUSY_TIMEOUT_MS);
});

test('control: splitting the work differently removes exactly the same rows', () => {
  // Correctness must not depend on the chunk budget. Identical histories, two very different
  // budgets, and the survivors must match row for row. (compactObservations works on the whole
  // table, so the two are built and compacted one after the other rather than side by side.)
  const now = Date.now();
  const build = (id) => {
    const key = `qa:${uniq(id)}`;
    for (let L = 0; L < 6; L++) {
      let p = 1.99;
      for (let d = 90; d > 8; d -= 0.5) {
        if (Math.round(d * 2) % 37 === 0) p = Math.round((p + 0.4) * 100) / 100;
        obs(key, `loc-${L}`, p, now - d * DAY);
      }
    }
    return key;
  };
  const survivors = (k) =>
    [0, 1, 2, 3, 4, 5].map((L) => prices(k, `loc-${L}`).map((r) => `${r.price}@${r.observed_at}`).join(',')).join(' | ');

  const a = build('budget-small');
  const rawA = survivors(a);
  DB.compactObservations({ now, budget: 20 }); // forces the split-by-location path
  const keptA = survivors(a);

  const b = build('budget-large');
  assert.equal(survivors(b), rawA, 'the two histories must start out identical');
  DB.compactObservations({ now, budget: 1_000_000 }); // one statement for the lot
  assert.equal(survivors(b), keptA, 'the row budget changed which rows were judged redundant');
  assert.ok(keptA.length < rawA.length, 'and something was actually removed');
});

test('control: the "lowest price seen" badge still has its three observations after maintenance', () => {
  // public/js/views/compare.js gates the badge on hist.n >= 3, and compaction cuts `n`. The
  // guarantee is the grace window: a product on screen was just searched, and compaction never
  // touches the last RETAIN.compactAfterDays. This is the tightest case — a flat price, so every
  // interior row is redundant, and a single search inside the window.
  const id = uniq('badge');
  const key = `qa:${id}`;
  const now = Date.now();
  for (let d = 200; d > 8; d -= 0.5) obs(key, 'loc-a', 2.49, now - d * DAY); // all older than the grace window
  obs(key, 'loc-a', 2.49, now - 2 * DAY); // one search inside it
  DB.compactObservations({ now });
  const s = H.historyStats([{ key, locationId: 'loc-a', price: 2.49 }], now)[key];
  assert.ok(s.n >= 3, `the badge would disappear: n = ${s.n}`);
  assert.equal(s.low, 2.49);
});

test('control: counting a product’s store locations does not read the product’s whole history', () => {
  // GET /api/history/:key is an unauthenticated GET. Counting every distinct location was
  // O(rows for this product): 144 ms on a head product with 554,800 rows, and node:sqlite is
  // synchronous, so that is 144 ms in which no other visitor's request moves.
  const key = `qa:${uniq('probe')}`;
  const now = Date.now();
  for (let L = 0; L < 3; L++) for (let i = 0; i < 400; i++) obs(key, `loc-${L}`, 3 + L, now - i * 60_000);

  const probe = H.REQUEST_PATH_STATEMENTS['productHistory location probe'];
  assert.match(probe.sourceSQL, /LIMIT 2/, 'the probe must stop at the second location, not count them all');
  assert.equal(probe.all(key).length, 2, 'it answers "more than one" with two rows, whatever the real count');

  const h = H.productHistory(key);
  assert.equal(h.locations, 2, 'capped at two');
  assert.equal(h.locationsExact, false, 'and it says the number is capped, so nobody reads it as a count');
  assert.equal(h.mixed, true);
  assert.deepEqual(h.series, [], 'asked without a location, a multi-location product answers with no chart');

  // And it is still right about a product that really does have one location.
  const single = `qa:${uniq('probe-one')}`;
  obs(single, 'loc-only', 1.25, now - DAY);
  const one = H.productHistory(single);
  assert.equal(one.locations, 1);
  assert.equal(one.locationsExact, true);
  assert.equal(one.mixed, false);
  assert.equal(one.series.length, 1);
});

test('control: retention deletes by range, not by reading the whole table', () => {
  // Without obs_time this is "SCAN observations": a full read of the entire price history, with
  // the event loop held, every time maintenance runs.
  assert.ok(/USING (COVERING )?INDEX obs_time/.test(planOf('DELETE FROM observations WHERE observed_at < ?')), planOf('DELETE FROM observations WHERE observed_at < ?'));
  // A cache row is a whole search result (~27 KB measured), so scanning the cache table to find
  // expired rows reads the entire cache off disk.
  assert.ok(/USING (COVERING )?INDEX cache_expires/.test(planOf('DELETE FROM cache WHERE expires_at < ?')), planOf('DELETE FROM cache WHERE expires_at < ?'));
});

test('control: the observations table carries no redundant index', () => {
  // obs_pkey_time(pkey, observed_at) was a strict prefix-subset of obs_pkey_loc_time: SQLite
  // answered everything it covered from the wider index's leading column, so it was a B-tree write
  // on every single observation in exchange for nothing. Every index here is paid for on the
  // hottest write path in the app, so a new one needs a query that measurably needs it.
  const names = DB.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='observations' AND sql IS NOT NULL").all().map((r) => r.name).sort();
  assert.deepEqual(names, ['obs_pkey_loc_time', 'obs_time']);
});

test('control: the counts on /api/state do not rescan the price history for every visitor', () => {
  // COUNT(*) has no shortcut in SQLite — it is O(rows), measured at 9 ms over 342,720 observations
  // and growing — and /api/state runs on every page load.
  H.resetHistoryCounts();
  const now = Date.now();
  const first = H.historyCounts({ now });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) H.historyCounts({ now: now + 1000 });
  const perCall = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  assert.ok(perCall < 0.05, `a memoized count must be effectively free, took ${perCall.toFixed(3)}ms`);
  assert.equal(H.historyCounts({ now: now + 1000 }).observations, first.observations);
});

test('control: a memoized count never reads low — new observations show up immediately', () => {
  H.resetHistoryCounts();
  const now = Date.now();
  const before = H.historyCounts({ now }).observations;
  const p = makeProduct({ storeId: 'qa', id: uniq('counted'), name: 'QA Rice', sizeText: '2 lb', price: 4.19, locationId: 'loc-a' });
  assert.equal(H.recordProducts([p], now), 1);
  assert.equal(H.historyCounts({ now }).observations, before + 1, 'within the memo window the new row must still be counted');
});

// ---------------------------------------------------------------------------
// 6. Degrading rather than dying.
// ---------------------------------------------------------------------------

test('control: a writer waits for the lock instead of failing instantly', () => {
  // busy_timeout was 0, so the second of two processes threw SQLITE_BUSY on its first write rather
  // than waiting the few milliseconds the first one needed. That is what a two-replica deploy does.
  const t = DB.db.prepare('PRAGMA busy_timeout').get();
  assert.ok(Object.values(t)[0] >= 1000, `busy_timeout is ${JSON.stringify(t)}`);
  assert.equal(Object.values(t)[0], DB.BUSY_TIMEOUT_MS);
});

test('control: two server processes on one file both keep writing, and nothing is lost', async () => {
  // The PRAGMA above is the setting; this is the behaviour. Two instances behind a load balancer
  // sharing a volume is what a naive two-replica deploy produces, and it is the case the
  // single-laptop version never had to survive: both processes open the same file, both write
  // price history for every search they serve, and neither may crash or quietly drop a row.
  const dir = path.join(os.tmpdir(), uniq('cartworth-qa-db-two'));
  fs.mkdirSync(dir, { recursive: true });
  const WRITES = 150;
  const script = `
    const db = await import(${JSON.stringify(path.join(ROOT, 'src/db.js'))});
    const h = await import(${JSON.stringify(path.join(ROOT, 'src/history.js'))});
    const { makeProduct } = await import(${JSON.stringify(path.join(ROOT, 'src/normalize.js'))});
    const who = process.env.WHO;
    let written = 0;
    for (let i = 0; i < ${WRITES}; i++) {
      const p = makeProduct({ storeId: 'qa', id: who + '-' + i, name: 'Milk', sizeText: '1 gal', price: 3 + i / 100, locationId: 'shared' });
      written += h.recordProducts([p], Date.now() + i);
    }
    console.log(JSON.stringify({ who, written, degraded: db.dbStatus.degraded, dropped: db.softWriteFailures.count }));
  `;
  const run = (who) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', script], {
        env: { ...process.env, BASKET_DATA_DIR: dir, WHO: who },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => (code === 0 ? resolve(JSON.parse(out.trim().split('\n').pop())) : reject(new Error(`${who} exited ${code}: ${err}`))));
    });

  // Started together, on purpose: the point is that they contend.
  const [a, b] = await Promise.all([run('alpha'), run('beta')]);
  for (const r of [a, b]) {
    assert.equal(r.degraded, false, `${r.who} fell back to an in-memory database rather than sharing the file`);
    assert.equal(r.dropped, 0, `${r.who} dropped ${r.dropped} writes — busy_timeout was not enough`);
    assert.equal(r.written, WRITES, `${r.who} recorded ${r.written} of ${WRITES} observations`);
  }

  // And both processes' rows are really on disk, in one file, none overwritten by the other.
  const { DatabaseSync } = await import('node:sqlite');
  const check = new DatabaseSync(path.join(dir, 'basket.db'), { readOnly: true });
  const n = check.prepare('SELECT COUNT(*) n FROM observations').get().n;
  const alpha = check.prepare("SELECT COUNT(*) n FROM observations WHERE pkey LIKE '%alpha%'").get().n;
  const beta = check.prepare("SELECT COUNT(*) n FROM observations WHERE pkey LIKE '%beta%'").get().n;
  check.close();
  assert.equal(alpha, WRITES);
  assert.equal(beta, WRITES);
  assert.equal(n, WRITES * 2, 'one process’s writes were lost behind the other’s');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('DEFECT (flaky two-process test): switching a file to WAL waits out another process’s lock instead of degrading to :memory:', async () => {
  // The two-process test above is a race, so it failed 1-2 runs in 6 and passed the rest. This is
  // the same race made deterministic. The cause: switching a fresh file to WAL is a write, and when
  // ANOTHER connection holds a RESERVED lock SQLite does not call the busy handler at all (it
  // could deadlock), so `PRAGMA journal_mode = WAL` throws SQLITE_BUSY in about 1 ms whatever
  // busy_timeout says. Two servers starting on one file: one is creating its tables (RESERVED)
  // while the other switches to WAL — openOrDegrade caught the error, and that process ran on
  // :memory: for good.
  //
  // Here the "other server" is this test, holding a write transaction open on a file that is still
  // in rollback mode (as every brand-new file is), and committing 400 ms after the server process
  // announces it is about to open. A server that waits for the lock opens the real file; one that
  // does not falls back to memory, every time.
  const { DatabaseSync } = await import('node:sqlite');
  const dir = path.join(os.tmpdir(), uniq('cartworth-qa-db-walswitch'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'basket.db');
  const holder = new DatabaseSync(file);
  holder.exec('CREATE TABLE held (x); INSERT INTO held VALUES (1);');
  assert.equal(holder.prepare('PRAGMA journal_mode').get().journal_mode, 'delete', 'precondition: the file is not yet in WAL');
  holder.exec('BEGIN IMMEDIATE'); // RESERVED lock, held until COMMIT

  const script = `
    process.stderr.write('opening\\n');
    const t0 = Date.now();
    const db = await import(${JSON.stringify(path.join(ROOT, 'src/db.js'))});
    console.log(JSON.stringify({ degraded: db.dbStatus.degraded, reason: db.dbStatus.reason, ms: Date.now() - t0, mode: db.db.prepare('PRAGMA journal_mode').get().journal_mode }));
  `;
  const r = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', script], {
      env: { ...process.env, BASKET_DATA_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let released = false;
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => {
      err += d;
      if (!released && err.includes('opening')) {
        released = true;
        setTimeout(() => holder.exec('COMMIT'), 400);
      }
    });
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(out.trim().split('\n').pop())) : reject(new Error(`exited ${code}: ${err}`))));
  });
  holder.close();
  assert.equal(r.degraded, false, `the server gave up on the shared file (${r.reason}) instead of waiting ${400} ms for a lock`);
  assert.equal(r.mode, 'wal');
  // Proof the contention really happened, so this test cannot pass by missing the window: the
  // open could not complete until the lock was released.
  assert.ok(r.ms >= 300, `the open finished in ${r.ms} ms, before the lock was released — the test did not contend`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('control: a corrupt database file does not stop the server from serving prices', () => {
  const dir = path.join(os.tmpdir(), uniq('cartworth-qa-db-corrupt'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'basket.db');
  // A plausible bad deploy: a half-copied or scribbled-on file that is not a database at all.
  fs.writeFileSync(file, Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(8192, 0x5a)]));
  const script = `
    const db = await import(${JSON.stringify(path.join(ROOT, 'src/db.js'))});
    const h = await import(${JSON.stringify(path.join(ROOT, 'src/history.js'))});
    const { makeProduct } = await import(${JSON.stringify(path.join(ROOT, 'src/normalize.js'))});
    const p = makeProduct({ storeId: 'qa', id: 'degraded', name: 'Milk', sizeText: '1 gal', price: 3.99, locationId: 'l' });
    h.recordProducts([p]);
    console.log(JSON.stringify({ degraded: db.dbStatus.degraded, reason: !!db.dbStatus.reason, stats: h.historyStats([p])[p.key] ?? null }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', script], {
    env: { ...process.env, BASKET_DATA_DIR: dir, BASKET_DB: file },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.equal(r.degraded, true, 'the file is unusable, and /api/health has to be able to say so');
  assert.ok(r.stats, 'and the app must still work: the cache and history simply start empty');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('control: a database that cannot be written does not turn a search into a 500', () => {
  // Everything on disk here is derived. Failing to record a history point is a lost history point,
  // not a failed response — the prices in that response were already correct and complete.
  const dir = path.join(os.tmpdir(), uniq('cartworth-qa-db-readonly'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'basket.db');
  const script = `
    const db = await import(${JSON.stringify(path.join(ROOT, 'src/db.js'))});
    const h = await import(${JSON.stringify(path.join(ROOT, 'src/history.js'))});
    const { makeProduct } = await import(${JSON.stringify(path.join(ROOT, 'src/normalize.js'))});
    const p = makeProduct({ storeId: 'qa', id: 'ro', name: 'Milk', sizeText: '1 gal', price: 3.99, locationId: 'l' });
    h.recordProducts([p]);
    // Take the writes away underneath a running server, the way a full disk or a remounted volume does.
    db.db.exec('PRAGMA query_only = ON');
    let threw = null;
    try { h.recordProducts([makeProduct({ storeId: 'qa', id: 'ro2', name: 'Eggs', sizeText: '12 ct', price: 4.49, locationId: 'l' })]); }
    catch (e) { threw = String(e.message); }
    const stillReads = h.historyStats([p])[p.key];
    db.cacheSet('k', { a: 1 }, 1000);
    console.log(JSON.stringify({ threw, stillReads: !!stillReads, softFailures: db.softWriteFailures.count }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--disable-warning=ExperimentalWarning', '-e', script], {
    env: { ...process.env, BASKET_DATA_DIR: dir, BASKET_DB: file },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.equal(r.threw, null, 'a failed history write must not propagate to the visitor');
  assert.equal(r.stillReads, true, 'reads keep working');
  assert.ok(r.softFailures >= 2, 'and the failures are counted so /api/health can report them');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('control: only one process runs maintenance at a time', () => {
  // Two simultaneous VACUUMs on one file is how a slow maintenance run becomes a stuck one.
  const now = Date.now();
  DB.releaseMaintenanceLease('a');
  assert.equal(DB.takeMaintenanceLease('a', 60_000, now), true);
  assert.equal(DB.takeMaintenanceLease('b', 60_000, now), false, 'the second instance must stand down');
  assert.equal(DB.takeMaintenanceLease('b', 60_000, now + 61_000), true, 'a crashed run must not hold the lock forever');
  DB.releaseMaintenanceLease('b');
});

// ---------------------------------------------------------------------------
// 7. The scheduled job itself.
// ---------------------------------------------------------------------------

test('control: maintenance reclaims disk, and a dry run changes nothing', () => {
  const now = Date.now();
  const key = `qa:${uniq('maint')}`;
  DB.db.exec('BEGIN');
  for (let i = 0; i < 4000; i++) obs(key, `loc-${i % 20}`, 3.5, now - (500 + i) * DAY);
  DB.db.exec('COMMIT');
  DB.checkpoint();

  const dry = DB.maintain({ now, dryRun: true });
  assert.equal(dry.after.observations, dry.before.observations, 'a dry run must not delete anything');
  assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM observations WHERE pkey = ?').get(key).n, 4000);

  const r = DB.maintain({ now });
  // 20 locations, every row past the window: each series ages out to its MIN_SERIES_ROWS floor
  // rather than to nothing, so the product keeps a chart and a "Lowest seen" badge.
  const LOCS = 20;
  assert.equal(
    DB.db.prepare('SELECT COUNT(*) n FROM observations WHERE pkey = ?').get(key).n,
    LOCS * DB.MIN_SERIES_ROWS,
    'expired rows are gone except each location series floor',
  );
  assert.ok(r.removed.observations >= 4000 - LOCS * DB.MIN_SERIES_ROWS);
  assert.ok(r.vacuum.ok, `vacuum failed: ${r.vacuum.error}`);
  // The WAL must be folded back in BEFORE the size is read: in WAL mode a VACUUM writes the whole
  // rebuilt database into the log, so measuring too early reports the file having grown.
  assert.ok(r.after.bytes <= r.before.bytes, `file grew: ${r.before.bytes} -> ${r.after.bytes}`);
});

test('control: the maintenance entry point runs, reports, and exits clean', () => {
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts/db-maintenance.js'), '--json', '--check'], {
    env: { ...process.env, BASKET_DATA_DIR: DATA_DIR, BASKET_DB: path.join(DATA_DIR, 'maint.db') },
    encoding: 'utf8',
  });
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.equal(r.ok, true);
  assert.equal(r.integrity.ok, true, `integrity_check: ${JSON.stringify(r.integrity.problems)}`);
  assert.ok(r.retention.observationDays > 0 && r.retention.compactAfterDays > 0);
  assert.ok(r.after && typeof r.after.observations === 'number');
});

// ---------------------------------------------------------------------------
// 8. The in-memory half of the cache.
// ---------------------------------------------------------------------------

test('control: the memory cache is bounded by bytes, not just by entry count', () => {
  // A cached store result measured 27.5 KB, and a directory build or a weekly-ad flyer is larger.
  // Bounding only the count means the resident size of a public server is whatever the biggest
  // 800 things anyone searched for happened to weigh.
  const s = cache.memStats();
  assert.ok(s.maxBytes > 0 && s.maxEntries > 0);
  const big = { pad: 'x'.repeat(200_000) };
  for (let i = 0; i < 400; i++) cache.remember?.(`qa:${i}`, big, 60_000);
  // remember() is internal; drive it the way the app does instead.
  return Promise.all(
    Array.from({ length: 400 }, (_, i) => cache.cached(`qa-mem-${i}`, 60_000, async () => big, { persist: false })),
  ).then(() => {
    const after = cache.memStats();
    assert.ok(after.bytes <= after.maxBytes, `memory cache held ${after.bytes} bytes, cap is ${after.maxBytes}`);
    assert.ok(after.entries <= after.maxEntries);
  });
});

test('control: a key that keeps being read is not evicted ahead of one written once', () => {
  const hot = 'qa-lru-hot';
  return cache.cached(hot, 60_000, async () => ({ v: 'hot' }), { persist: false }).then(async () => {
    for (let i = 0; i < 200; i++) {
      await cache.cached(hot, 60_000, async () => ({ v: 'hot' }), { persist: false }); // a read, which must refresh it
      await cache.cached(`qa-lru-cold-${i}`, 60_000, async () => ({ v: i }), { persist: false });
    }
    assert.deepEqual(cache.peek(hot), { v: 'hot' }, 'the hot key is exactly the one the old eviction order threw away first');
  });
});
