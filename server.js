#!/usr/bin/env node
// Cartworth — grocery price checker. Works anywhere in the US: set a ZIP and it finds the
// chains near you, then prices any item at each of them.
// Run: npm start   (then open http://localhost:4747)
//
// The server is a stateless price proxy. It holds no visitor state at all: no sessions, no
// cookies, no accounts, no per-person rows. Every request carries what it needs (see
// src/context.js), and the only things kept on disk are shared infrastructure — the HTTP/price
// cache, the Instacart guest session, weekly-ad details, and the impersonal product price history.
// Each visitor's ZIP, stores, preferences, shopping list, watchlist and search history live in
// their own browser (public/js/store.js).

// node:sqlite prints an ExperimentalWarning on some Node versions; it is stable enough for us.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(w);
});

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { contextFrom, requireZip, storeZip, queryFrom, DEFAULTS, LIMITS, RADIUS_MILES, snapRadius } = await import('./src/context.js');
const { takeRequest, allowFresh, guardStats } = await import('./src/guard.js');
const search = await import('./src/search.js');
const deals = await import('./src/deals.js');
const flipp = await import('./src/adapters/flipp.js');
const watch = await import('./src/watch.js');
const list = await import('./src/list.js');
const history = await import('./src/history.js');
const kroger = await import('./src/adapters/kroger.js');
const instacart = await import('./src/adapters/instacart.js');
const wholefoods = await import('./src/adapters/wholefoods.js');
const traderjoes = await import('./src/adapters/traderjoes.js');
const { STORES, STORE_BY_ID, CORE_STORE_IDS, slotFor } = await import('./shared/stores.js');
const { directory, defaultStoreIds } = await import('./src/directory.js');
const { stats: httpStats } = await import('./src/http.js');
const { cachePurge, db, DB_PATH, dbStatus, legacyReport, maintain, purgeLegacy, softWriteFailures } = await import('./src/db.js');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 4747;
const HOST = process.env.HOST || '127.0.0.1';
const STARTED_AT = Date.now();
const STATIC = { '/': path.join(ROOT, 'public'), '/shared/': path.join(ROOT, 'shared') };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

// ---------------- search radius ----------------
// RADIUS_MILES and snapRadius live in src/context.js, beside the clamp they refine, so that
// src/search.js can apply the same radius to a price search. Re-exported here for the tests.
export { RADIUS_MILES, snapRadius };

// ---------------- helpers ----------------
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}
function serveStatic(req, res, pathname) {
  let base = STATIC['/'];
  let rel = pathname;
  if (pathname.startsWith('/shared/')) {
    base = STATIC['/shared/'];
    rel = pathname.slice('/shared'.length);
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, decodeURIComponent(rel)));
  if (!file.startsWith(base)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback for hash-less deep links
      if (!path.extname(rel)) return serveStatic(req, res, '/');
      return send(res, 404, 'Not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

/** Build the request context, and fold the fresh-request budget into it. */
function ctxFor(req, url, body = null) {
  const ctx = contextFrom(url, body, req.headers);
  if (ctx.fresh && !allowFresh(req)) ctx.fresh = false; // over budget: serve the cache, spare the retailer
  return ctx;
}

async function resolveLocation(storeId, ctx, fresh = false) {
  const src = search.sourceFor(storeId, ctx);
  const zip = storeZip(ctx, storeId);
  if (!src || !zip) return null;
  switch (src.type) {
    case 'instacart': {
      const s = await instacart.resolveShop({ ...src, storeId }, zip, { fresh });
      if (!s || s.none) return { none: true };
      // A canonical shop is Instacart's chain-wide storefront, not a store near this ZIP. Showing
      // its address and distance would tell the shopper their nearest Sam's Club is 1,400 miles
      // away, which is worse than saying nothing.
      if (s.canonical) return { canonical: true, name: s.name, priceNote: 'Chain-wide listing — no store near you on Instacart' };
      return { name: s.label || s.name, address: s.address, distance: s.distance, serviceType: s.serviceType, priceNote: s.serviceType === 'instore' ? 'In-store shelf prices' : s.priceNote };
    }
    case 'wholefoods': {
      const s = await wholefoods.resolveStore(zip, { fresh });
      return s.none ? { none: true } : { name: s.name, address: s.address, distance: s.distance, priceNote: 'Store shelf prices' };
    }
    case 'traderjoes': {
      const s = await traderjoes.resolveStore(zip, { fresh });
      return s.none ? { none: true } : { name: s.name, address: s.address, distance: s.distance, priceNote: 'Posted prices' };
    }
    case 'kroger': {
      const s = await kroger.resolveStore(ctx, zip, src.chain, { fresh });
      return s.none ? { none: true } : { name: s.name, address: s.address, distance: s.distance, priceNote: 'Exact store prices (Kroger API)' };
    }
    default:
      return null;
  }
}

// ---------------- routes ----------------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

/**
 * Server health and catalog metadata. It used to return the one global settings row, which is
 * exactly the thing that made this app single-user; now it returns nothing about anybody. The
 * browser boots from its own localStorage and uses this only to know what the server can do.
 */
route('GET', '/api/state', async () => ({
  version: 2,
  app: 'cartworth',
  stateless: true,
  startedAt: STARTED_AT,
  uptimeMs: Date.now() - STARTED_AT,
  catalog: {
    storeCount: STORES.length,
    coreStoreIds: CORE_STORE_IDS,
    stores: STORES.map((s) => ({
      id: s.id, name: s.name, short: s.short, slot: slotFor(s.id), note: s.note || null,
      priceSource: s.price?.type || null,
      canUseKroger: s.alt?.type === 'kroger',
      hasAds: !!(s.ads && s.ads.length),
      states: s.states || null,
    })),
  },
  defaults: DEFAULTS,
  limits: LIMITS,
  counts: history.historyCounts(),
  health: search.getHealth(),
}));

// `ok` is a claim, so it has to be computed. It was hard-coded true, which meant an instance that
// had failed over to the in-memory database — no history, no cache, nothing surviving a restart —
// reported healthy and stayed in the load balancer's rotation serving degraded results.
//
// `softWrites` is the other half. A write that fails is swallowed on purpose (a visitor's search
// should not 500 because the history write lost a race), so a disk filling up is otherwise
// completely silent: every search still succeeds and nothing is recorded. The counter self-clears
// after a quiet minute, so a non-zero value means failures are happening NOW.
route('GET', '/api/health', async () => ({
  ok: !dbStatus.degraded && softWriteFailures.count === 0,
  uptimeMs: Date.now() - STARTED_AT,
  db: { degraded: dbStatus.degraded, reason: dbStatus.reason, path: dbStatus.path },
  softWrites: { count: softWriteFailures.count, last: softWriteFailures.last },
  stores: search.getHealth(),
  http: httpStats,
  guard: guardStats(),
}));

route('GET', '/api/directory', async (req, url) => {
  const ctx = ctxFor(req, url);
  const zip = requireZip(ctx);
  // `dir.maxMiles` comes back from the build, so the radius in the response is the one that was
  // actually applied to the distances — never the one that was asked for.
  const dir = await directory(zip, { maxMiles: snapRadius(ctx.maxMiles), fresh: ctx.fresh });
  return { ...dir, radiusOptions: RADIUS_MILES, suggested: defaultStoreIds(dir) };
});

route('GET', '/api/locations', async (req, url) => {
  const ctx = ctxFor(req, url);
  requireZip(ctx);
  const out = {};
  await Promise.all(ctx.stores.map(async (id) => {
    try {
      out[id] = await resolveLocation(id, ctx, ctx.fresh);
    } catch (err) {
      out[id] = { error: err.message };
    }
  }));
  return out;
});

route('GET', '/api/search', async (req, url, res) => {
  const ctx = ctxFor(req, url);
  const q = queryFrom(url);
  requireZip(ctx);
  const ids = ctx.stores.filter((id) => STORE_BY_ID[id]);

  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  let closed = false;
  req.on('close', () => {
    closed = true;
  });
  const emit = (event, data) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const t0 = Date.now();
  emit('start', { query: q, stores: ids, zip: ctx.zip });
  const tasks = ids.map(async (id) => {
    if (!search.sourceFor(id, ctx)) {
      emit('store', { storeId: id, status: 'unsupported', items: [], message: STORE_BY_ID[id].note || 'No price lookup for this store' });
      return;
    }
    const r = await search.searchStore(id, q, ctx, { fresh: ctx.fresh });
    if (r.items?.length) r.items = search.withHistory(r.items);
    emit('store', r);
  });
  const ads = search.searchAds(q, ctx).then((d) => emit('ads', { deals: d })).catch((err) => emit('ads', { deals: [], error: err.message }));
  await Promise.all([...tasks, ads]);
  emit('done', { ms: Date.now() - t0 });
  res.end();
  return undefined;
});

route('GET', '/api/deals', async (req, url) => {
  const ctx = ctxFor(req, url);
  requireZip(ctx);
  const week = url.searchParams.get('week') === 'next' ? 'next' : 'current';
  return deals.getDeals(ctx, { week, fresh: ctx.fresh });
});

route('GET', '/api/deals/progress', async (req, url) => {
  ctxFor(req, url); // validates zip/stores if sent; the answer itself is about flyers, not people
  const ids = (url.searchParams.get('flyers') || '').split(',').map(Number).filter(Boolean).slice(0, 40);
  return deals.enrichmentProgress(ids);
});

route('GET', '/api/deals/item/:id', async (req, url, res, p) => {
  const id = Number(p.id);
  if (!id) throw Object.assign(new Error('Bad item id'), { status: 400 });
  return { detail: await flipp.itemDetail(id) };
});

// Price history is keyed by product, not by person: an impersonal record of what something cost,
// built from every search anyone runs and served back to everyone.
// `?location=` scopes the series to one physical store, which is what the modal's heading already
// claims ("Price history at Jewel-Osco"). Three distinct states, and the difference matters:
//   absent        → undefined → un-scoped. productHistory refuses to mix stores, so a product sold
//                   at 2+ locations comes back with an EMPTY series and `mixed: true`. That was the
//                   only thing the browser ever sent, so every multi-store product's chart was dead.
//   present/empty → null → the chain-wide series, which is where a `national` price is filed.
//                   A national-basis product has no location, and null is its location, not "any".
//   present       → that store's series.
route('GET', '/api/history/:key', async (req, url, res, p) => {
  const raw = url.searchParams.get('location');
  const locationId = raw === null ? undefined : raw === '' ? null : raw;
  return history.productHistory(decodeURIComponent(p.key), locationId);
});

/**
 * Re-price one watched item. The watchlist lives in the browser; this checks a single spec and
 * hands back the result plus one history point per store for the browser to keep.
 */
route('POST', '/api/watch/check', async (req, url) => {
  const body = await readBody(req);
  const ctx = ctxFor(req, url, body);
  requireZip(ctx);
  return watch.checkWatch(body, ctx, { fresh: ctx.fresh });
});

/** Plan a trip from the list in the request body. The list itself is never stored here. */
route('POST', '/api/list/optimize', async (req, url) => {
  const body = await readBody(req);
  const ctx = ctxFor(req, url, body);
  requireZip(ctx);
  return list.optimize(body.items, ctx, { fresh: ctx.fresh });
});

/** Check a visitor's Kroger keys. They arrive in headers and are used for this request only. */
route('POST', '/api/kroger/test', async (req, url) => {
  const body = await readBody(req);
  const ctx = ctxFor(req, url, body);
  const zip = requireZip(ctx);
  if (!kroger.hasKeys(ctx)) throw Object.assign(new Error('Send both the client ID and secret'), { status: 400 });
  return kroger.testKeys(ctx, zip);
});

// ---------------- server ----------------
/**
 * Same-origin only. Hosted, "this app's own pages" means the origin the page was served from;
 * localhost stays allowed so `npm start` and dev tooling keep working. Set BASKET_ALLOWED_ORIGINS
 * to a comma-separated list to permit others.
 */
const EXTRA_ORIGINS = String(process.env.BASKET_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl, same-origin GETs, EventSource on some engines
  if (EXTRA_ORIGINS.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  }
  if (!originAllowed(req)) return send(res, 403, { error: 'Cross-origin requests are not allowed' });
  const budget = takeRequest(req);
  if (!budget.ok) return send(res, 429, { error: 'Too many requests — give it a moment.' }, { 'retry-after': String(budget.retryAfter) });

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    try {
      const out = await r.handler(req, url, res, params);
      if (out !== undefined && !res.headersSent) send(res, 200, out);
    } catch (err) {
      const status = err.status || 500;
      // A malformed request is one visitor's problem, not a server fault: log only real faults,
      // and never log the request's headers (they may carry that visitor's Kroger secret).
      if (status >= 500) console.error(`[${req.method} ${pathname}]`, err);
      if (!res.headersSent) send(res, status, { error: err.message || 'Something went wrong' });
      else res.end();
    }
    return;
  }
  send(res, 404, { error: 'No such endpoint' });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Is Cartworth already running? Try: PORT=4748 npm start\n`);
    process.exit(1);
  }
  throw err;
});

// Listen only when this file was started directly (`npm start`). Imported — by a test that wants
// to exercise one of the pure helpers above — it defines the routes and binds nothing.
const RUN_DIRECTLY = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Retention that actually runs.
//
// Every window, index and compaction query in src/db.js was written against a measured 5.2 GB/yr
// of growth — and none of it had any effect, because nothing ever called it. The only automatic
// deletion in the whole server was the single cachePurge() below, on the boot path, so an instance
// that stays up for a month never purged anything at all.
//
// Two intervals, both deliberately modest, because node:sqlite is synchronous and every one of
// these runs on the event loop with nobody else's request able to move:
//   - the cache is the fastest-growing table (~27.5 KB a row) and its purge is a plain range
//     delete on cache_expires, so it can run often.
//   - the full sweep skips VACUUM. Ageing out and compacting are bounded per statement (worst
//     measured 300 ms against a 5,000 ms busy_timeout); VACUUM rebuilds the entire file behind a
//     write lock and belongs in the weekly cron, not in a live server.
//
// scripts/db-maintenance.js is still the one to schedule for the vacuum:
//   17 4 * * 0  cd /srv/cartworth && node scripts/db-maintenance.js --json >> /var/log/cartworth-db.log
const CACHE_PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000;

function scheduleMaintenance() {
  setInterval(() => {
    const n = cachePurge();
    if (n) console.log(`[db] purged ${n} stale cache row${n === 1 ? '' : 's'}`);
  }, CACHE_PURGE_EVERY_MS).unref();

  setInterval(() => {
    const r = maintain({ vacuumFile: false });
    const { observations, compacted, products, cache, flippDetails } = r.removed;
    console.log(
      `[db] swept: ${observations} aged out, ${compacted} compacted, ${products} products, ${cache} cache, ${flippDetails} flipp — ${r.after.bytes} bytes on disk`,
    );
  }, SWEEP_EVERY_MS).unref();
}

if (RUN_DIRECTLY) server.listen(PORT, HOST, () => {
  cachePurge();
  scheduleMaintenance();
  console.log(`\n  🧺 Cartworth is running at http://localhost:${PORT}\n`);
  console.log(`  Stateless: every visitor's ZIP, stores, list and watchlist stay in their own browser.`);
  console.log(`  Shared data (cache + price history): ${DB_PATH}\n`);
  if (process.env.BASKET_PURGE_LEGACY === '1') {
    purgeLegacy();
    console.log('  Removed the legacy single-user tables and settings row from this database.\n');
  } else {
    const legacy = legacyReport();
    if (legacy.any) {
      const bits = [...legacy.tables, legacy.settingsRow ? 'the saved settings row (which held your Kroger client secret)' : null].filter(Boolean);
      console.warn(`  ⚠ This database still contains single-user data: ${bits.join(', ')}.`);
      console.warn('    Nothing reads it any more. Do not deploy this file. Run once with BASKET_PURGE_LEGACY=1 to delete it.\n');
    }
  }
});

for (const sig of RUN_DIRECTLY ? ['SIGINT', 'SIGTERM'] : []) {
  process.on(sig, () => {
    server.close();
    try {
      db.close();
    } catch {}
    process.exit(0);
  });
}
