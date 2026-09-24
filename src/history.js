// Price history: every product we see is remembered, and a new observation is stored whenever
// its price changes (or at most every 12 hours otherwise). This powers "lowest price seen",
// "price dropped" flags, and per-product charts.
import { db, tx, trySoftWrite, RETAIN } from './db.js';

const upsertProduct = db.prepare(`
  INSERT INTO products (pkey, store_id, name, brand, size, image, url, first_seen, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(pkey) DO UPDATE SET name = excluded.name, brand = excluded.brand, size = excluded.size,
    image = COALESCE(excluded.image, products.image), url = COALESCE(excluded.url, products.url), last_seen = excluded.last_seen`);
// Scoped to the location: the previous price at a DIFFERENT store tells us nothing about whether
// this one changed, and comparing across them made "price dropped" flip whenever a visitor in
// another city searched.
const lastObs = db.prepare(
  'SELECT price, reg_price, on_sale, observed_at FROM observations WHERE pkey = ? AND location_id IS ? ORDER BY observed_at DESC LIMIT 1',
);
const insertObs = db.prepare(`INSERT INTO observations (pkey, store_id, location_id, price, reg_price, unit_dim, unit_price, on_sale, promo, observed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const REPEAT_MS = 12 * 60 * 60 * 1000;

function primaryUnit(p) {
  const dim = p.dim && p.unit?.[p.dim] ? p.dim : Object.keys(p.unit || {})[0];
  return dim ? { dim, value: p.unit[dim].perBase } : { dim: null, value: null };
}

export function recordProducts(products, now = Date.now()) {
  if (!products?.length) return 0;
  let written = 0;
  // Recording history is bookkeeping on top of a response whose prices are already correct and
  // complete. A full disk, a read-only volume or another process holding the write lock must not
  // turn a visitor's search into a 500 — it costs us a history point, and that is all.
  trySoftWrite('recordProducts', () => {
    written = tx(() => {
      let n = 0;
      for (const p of products) {
        // A 0 price is a missing price, and letting one in makes it the product's recorded "low"
        // for good — every later real price then reads as a rise from a number nobody ever paid.
        if (p.price == null || !(p.price > 0)) continue;
        upsertProduct.run(p.key, p.storeId, p.name, p.brand || null, p.size || null, p.image || null, p.url || null, now, now);
        // The retailer's own id for the physical store. Never a visitor identifier.
        const locationId = p.locationId ?? null;
        const last = lastObs.get(p.key, locationId);
        const changed = !last || Math.abs((last.price ?? -1) - p.price) > 0.004 || (last.reg_price ?? null) !== (p.regularPrice ?? null) || !!last.on_sale !== !!p.onSale;
        if (changed || now - last.observed_at > REPEAT_MS) {
          const u = primaryUnit(p);
          insertObs.run(p.key, p.storeId, locationId, p.price, p.regularPrice ?? null, u.dim, u.value, p.onSale ? 1 : 0, p.promo || null, now);
          n += 1;
        }
      }
      return n;
    });
  });
  counts.pending += written;
  return written;
}

// All three are scoped to a single store location. Pooling them per chain meant "lowest seen"
// could be a price from a store two thousand miles away.
//
// `avg` is a TIME-WEIGHTED mean: each row's price is weighted by how long it stood before the next
// row replaced it, over the window actually observed (first_at → last_at). Two reasons, and the
// second is the one that matters.
//
// It is what the word means. AVG(price) is a mean over ROWS, and rows arrive on a 12-hour
// heartbeat whenever any visitor searches this product at this store — so the old number was a
// mean weighted by how popular a search is. The identical product on the identical prices reads
// differently in a busy week than in a quiet one, and a sale that happened to fall over a weekend
// of heavy traffic drags the "average" down.
//
// And it is what makes the scheduled compaction in src/db.js safe. Compaction deletes a row only
// when the row before it and the row after it hold the same price — the interior of a flat stretch.
// Removing such a row leaves this integral EXACTLY unchanged, not approximately: the two segments
// it split, p·(t_j − t_{j−1}) and p·(t_{j+1} − t_j), merge into the one segment p·(t_{j+1} − t_{j−1})
// at the same price, and the first and last rows — the denominator — are never interior. A mean
// over rows has no such property: on a year of the real heartbeat, compaction moved AVG(price)
// from $4.30 to $4.22. That is a money figure on the product page moving eight cents because a
// cron job ran, which is exactly the kind of wrong number this app must never show.
//
// The last row is given no weight rather than being extended to now: it would mean asserting a
// price over a stretch nobody checked, and for a product nobody has searched in months that
// stretch is most of the window.
//
// Kept as two statements, not one. COUNT/MIN/MAX/AVG come straight off obs_pkey_loc_time without
// materialising anything (measured ~20 µs); the weighted sums need a window, and a window needs the
// rows in hand. Folding the plain aggregates into the window's subquery makes them pay for that
// materialisation too — 102 µs for one combined statement against 58 µs for these two.
const statsStmt = db.prepare(`
  SELECT COUNT(*) n, MIN(price) low, MAX(price) high, AVG(price) mean,
         MIN(observed_at) first_at, MAX(observed_at) last_at
  FROM observations WHERE pkey = ? AND location_id IS ?`);
const weightedAvgStmt = db.prepare(`
  SELECT SUM(price * held) wsum, SUM(held) wtot
  FROM (
    SELECT price, LEAD(observed_at) OVER (ORDER BY observed_at, id) - observed_at AS held
    FROM observations WHERE pkey = ? AND location_id IS ?
  )`);
const lowAtStmt = db.prepare('SELECT observed_at FROM observations WHERE pkey = ? AND location_id IS ? AND price <= ? ORDER BY observed_at DESC LIMIT 1');
const prevStmt = db.prepare('SELECT price FROM observations WHERE pkey = ? AND location_id IS ? AND observed_at < ? ORDER BY observed_at DESC LIMIT 1');

/**
 * Summary stats for a set of products (attached to search results).
 *
 * Every number here survives the scheduled compaction in src/db.js unchanged — `low`, `high`,
 * `lowAt`, `prev`, `firstAt` because compaction keeps the first and last row of every run of one
 * price, and `avg` because it is time-weighted (see statsStmt above).
 *
 * The exception is `n`, which is honestly just "how many rows we have" and so does fall when
 * compaction runs — from 730 to 89 on a real year of one head product, measured. That matters
 * because the browser gates the "lowest price seen" badge on `n >= 3`
 * (public/js/views/compare.js), and the case that nearly broke it is the dullest one: a price that
 * has never changed is a single run, and "keep the first and last row of each run" leaves two.
 * MIN_SERIES_ROWS in src/db.js is the answer — compaction will not take any series below four
 * rows — so `n >= 3` holds by construction rather than by argument. qa-db.test.js pins it.
 */
export function historyStats(products, now = Date.now()) {
  const out = {};
  for (const p of products) {
    const loc = p.locationId ?? null;
    const s = statsStmt.get(p.key, loc);
    if (!s || s.n < 1) continue;
    const lowAt = lowAtStmt.get(p.key, loc, s.low + 0.004)?.observed_at ?? null;
    // Previous distinct price before the current one
    const prev = prevStmt.get(p.key, loc, now - 60 * 1000)?.price ?? null;
    out[p.key] = {
      n: s.n,
      low: round2(s.low),
      high: round2(s.high),
      avg: round2(weightedAvg(p.key, loc, s.mean)),
      lowAt,
      firstAt: s.first_at,
      prev: prev != null && Math.abs(prev - p.price) > 0.004 ? round2(prev) : null,
    };
  }
  return out;
}

// The chart's series. Note the location scope, and that both variants are bounded: see
// productHistory() for why an unbounded version of this is a public denial of service.
const seriesStmt = db.prepare(
  'SELECT price, reg_price, unit_price, unit_dim, on_sale, promo, observed_at FROM observations WHERE pkey = ? AND location_id IS ? ORDER BY observed_at DESC LIMIT ?',
);
const anySeriesStmt = db.prepare(
  'SELECT price, reg_price, unit_price, unit_dim, on_sale, promo, observed_at FROM observations WHERE pkey = ? ORDER BY observed_at DESC LIMIT ?',
);
// "Does this product's history come from more than one store location?" — nothing more.
//
// COUNT(DISTINCT location_id) would be wrong on its own terms: it silently ignores NULLs, so a
// product with one real store plus a chain-wide (NULL) row would report "1 location" and then hand
// back both. DISTINCT treats NULL as a value of its own, which is exactly what it is — "this price
// is the chain's national listing, not a shelf in a particular shop".
//
// But counting them ALL was also the slowest thing left on the request path, and the endpoint is
// an unauthenticated GET. Counting is O(rows for this product): on the head product — one chain's
// milk at 760 locations with a year of the 12-hour heartbeat, 554,800 rows — it measured 144 ms,
// and node:sqlite is synchronous, so that is 144 ms in which nobody else's request moves. A client
// in a loop on one URL still takes the site down; only the constant changed.
//
// LIMIT 2 answers the actual question instead of computing a number nobody reads. SQLite walks the
// covering index and stops at the second distinct value, so it reads one location's rows rather
// than every location's: the same head product measured 0.00 ms. What bounds "one location's rows"
// is retention — the 12-hour heartbeat cannot put more than ~730 rows a year in one series, and
// compaction takes that down to a few dozen.
const locationProbeStmt = db.prepare('SELECT DISTINCT location_id FROM observations WHERE pkey = ? LIMIT 2');
const productStmt = db.prepare('SELECT * FROM products WHERE pkey = ?');

/** The most points a single chart will ever draw. Two a day for a year is already more than the ~600px chart can resolve. */
export const MAX_SERIES_POINTS = 1000;

/**
 * The series behind one product's chart.
 *
 * This used to be `WHERE pkey = ?` with no location and no limit, which was wrong twice over.
 *
 * WRONG NUMBERS. The modal is headed "Price history at Jewel-Osco" and the chart's axis title is
 * "Price of <product> at <store>", but the rows came from every Jewel-Osco in the country. A
 * shopper in Chicago was shown a line containing prices from stores they cannot shop at, and the
 * low underneath it was a price they could never have paid. That is the one thing this app must
 * never do. The stats beside it (src/search.js withHistory → historyStats) have been scoped to the
 * location since location_id was added; the chart was the piece that was missed.
 *
 * BLOCKING THE SERVER. node:sqlite is synchronous, so this runs on the event loop with nothing
 * else able to proceed. Measured on one head product ("milk" at one chain) after a month of public
 * traffic — 760 store locations × the 12-hour heartbeat = 45,600 rows — the un-scoped, un-capped
 * version took 394 ms to read and 3.3 SECONDS once server.js JSON-encoded the 4.5 MB response.
 * Every other visitor's search waits behind that, and the endpoint is an unauthenticated GET, so
 * one client in a loop takes the site down. Scoped to one location the same product is 60 rows.
 *
 * `locationId` is the retailer's own id for a physical store, the same value that arrives on the
 * product (src/normalize.js). Callers that have it MUST pass it. When it is absent and the product
 * has history from more than one location there is no honest answer to give, so the series comes
 * back empty with `mixed: true` rather than a chart of somebody else's city — no number beats a
 * wrong number. The browser already renders that case ("No history yet…"). Wiring the location
 * through is one line in server.js's /api/history/:key route and one in public/js/views/product.js
 * (the product object there already carries `locationId`); neither file is mine to change.
 */
export function productHistory(pkey, locationId, { limit = MAX_SERIES_POINTS } = {}) {
  const product = productStmt.get(pkey);
  const cap = Math.max(1, Math.min(limit, MAX_SERIES_POINTS));
  const scoped = locationId !== undefined;
  // 0, 1, or 2 — where 2 means "two or more". Never an exact count above one, because getting one
  // costs a walk of the whole product's history; see locationProbeStmt.
  const locations = locationProbeStmt.all(pkey).length;
  let rows;
  if (scoped) rows = seriesStmt.all(pkey, locationId ?? null, cap);
  else if (locations > 1) rows = [];
  else rows = anySeriesStmt.all(pkey, cap);

  // Read newest-first so the LIMIT keeps the RECENT end of the history — that is the part the
  // chart is about — then hand it back oldest-first the way the chart expects.
  const series = rows
    .map((r) => ({
      t: r.observed_at,
      price: r.price,
      regular: r.reg_price,
      unit: r.unit_price,
      dim: r.unit_dim,
      onSale: !!r.on_sale,
      promo: r.promo,
    }))
    .reverse();

  return {
    product,
    series,
    // 0, 1 or 2-meaning-two-or-more. `locationsExact` says which, so nobody can read a capped
    // number as a real count. Nothing in public/ or ios/ reads either field today.
    locations,
    locationsExact: locations < 2,
    // true when we were not told which store this is for and the answer would have mixed several.
    mixed: !scoped && locations > 1,
    truncated: rows.length >= cap,
  };
}

// ---------------------------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------------------------
// `SELECT COUNT(*) FROM observations` has no shortcut in SQLite: it is a full scan of the
// smallest covering index, O(rows). Measured at 9 ms over 342,720 observations and growing
// linearly, and /api/state calls it on EVERY page load — so on a public server this was a
// synchronous, event-loop-blocking scan of the whole price history for each visitor who opened
// the site, getting slower every day.
//
// The fix is not to make the count approximate (it is shown to people) but to stop recomputing it
// for every visitor. The count is exact as of at most COUNT_TTL_MS ago, and inserts made since are
// added on, so it never goes backwards between scans.
const countStmt = db.prepare('SELECT COUNT(*) n FROM observations');
const prodCountStmt = db.prepare('SELECT COUNT(*) n FROM products');
const COUNT_TTL_MS = 60 * 1000;
const counts = { at: 0, observations: 0, products: 0, pending: 0 };

export function historyCounts({ now = Date.now() } = {}) {
  if (now - counts.at > COUNT_TTL_MS) {
    counts.observations = countStmt.get().n;
    counts.products = prodCountStmt.get().n;
    counts.pending = 0;
    counts.at = now;
  }
  return { observations: counts.observations + counts.pending, products: counts.products };
}

/** Drop the memoized counts — after retention has deleted rows, the cached numbers are stale high. */
export function resetHistoryCounts() {
  counts.at = 0;
  counts.pending = 0;
}

export { RETAIN };

/**
 * Every statement a visitor's own request can make run, by name.
 *
 * Exported so qa-db.test.js can EXPLAIN the real SQL instead of a copy pasted into the test. The
 * copy is the failure mode worth designing out: it keeps passing while the statement it was copied
 * from grows a table scan, which on a synchronous database is the whole site stalling.
 */
export const REQUEST_PATH_STATEMENTS = Object.freeze({
  'historyStats aggregate': statsStmt,
  'historyStats time-weighted average': weightedAvgStmt,
  'historyStats lowAt': lowAtStmt,
  'historyStats prev': prevStmt,
  'recordProducts lastObs': lastObs,
  'productHistory series': seriesStmt,
  'productHistory series (no location)': anySeriesStmt,
  'productHistory location probe': locationProbeStmt,
  'productHistory product': productStmt,
});

/**
 * Mean price weighted by how long each price stood. See statsStmt for why it is defined this way.
 *
 * Falls back to the plain mean when there is nothing to weight by: one row, or several rows
 * sharing a timestamp, leave a total duration of zero, and in both of those cases the two
 * definitions agree anyway.
 */
function weightedAvg(pkey, locationId, mean) {
  const w = weightedAvgStmt.get(pkey, locationId);
  return w && w.wtot > 0 ? w.wsum / w.wtot : mean;
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}
