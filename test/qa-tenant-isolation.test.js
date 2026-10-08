// QA: is Cartworth actually safe to serve to strangers?
//
// Before the refactor the server held one global settings row and one SQLite file, so visitor B
// would have seen visitor A's ZIP, stores, list, watchlist and price history. This file checks,
// executably, that the refactor really removed that — and pins the places where it did not.
//
// Convention, matching the other QA files in this directory:
//   "control: …"  asserts a property that HOLDS today and must keep holding.
//   "DEFECT n: …" asserts correct behavior and currently FAILS. Each one has a comment saying
//                 what was observed and how it was reproduced against a running server.
//
// Nothing here touches the network except where a test says so and skips itself if offline.
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-isolation node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep every test in this file off the real data directory.
process.env.BASKET_DATA_DIR ||= '/tmp/cartworth-qa-isolation';

const { contextFrom, requireZip, storeZip, queryFrom, DEFAULTS, LIMITS } = await import('../src/context.js');
const { clientKey, takeRequest, allowFresh } = await import('../src/guard.js');
const { db, getKV, legacyReport } = await import('../src/db.js');
const { recordProducts, historyStats, productHistory, historyCounts } = await import('../src/history.js');
const { makeProduct } = await import('../src/normalize.js');
const { normalizeItems } = await import('../src/list.js');
const { normalizeSpec } = await import('../src/watch.js');
const search = await import('../src/search.js');

const urlFor = (qs = '') => new URL(`http://x/api/search${qs}`);

// ---------------------------------------------------------------------------
// 1. The request context is the ONLY source of per-visitor settings.
// ---------------------------------------------------------------------------

test('control: two visitors build independent contexts from their own requests alone', () => {
  const a = contextFrom(urlFor('?zip=60614&stores=aldi,wholefoods&miles=5&prime=1'));
  const b = contextFrom(urlFor('?zip=94110&stores=traderjoes&miles=40'));
  assert.equal(a.zip, '60614');
  assert.equal(b.zip, '94110');
  assert.deepEqual(a.stores, ['aldi', 'wholefoods']);
  assert.deepEqual(b.stores, ['traderjoes']);
  assert.equal(a.maxMiles, 5);
  assert.equal(b.maxMiles, 40);
  assert.equal(a.prime, true);
  assert.equal(b.prime, false);
  // …and building B did not disturb A.
  const aAgain = contextFrom(urlFor('?zip=60614&stores=aldi,wholefoods&miles=5&prime=1'));
  assert.deepEqual(aAgain, a);
});

test('control: a visitor who sends nothing inherits nothing from the visitor before them', () => {
  contextFrom(urlFor('?zip=60614&stores=aldi&prime=1&cardPrices=0&miles=3&resultsPerStore=60'));
  const blank = contextFrom(urlFor(''));
  assert.equal(blank.zip, null, 'a blank request must not pick up the previous ZIP');
  assert.deepEqual(blank.stores, DEFAULTS.stores);
  assert.equal(blank.prime, DEFAULTS.prime);
  assert.equal(blank.cardPrices, DEFAULTS.cardPrices);
  assert.equal(blank.maxMiles, DEFAULTS.maxMiles);
  assert.equal(blank.resultsPerStore, DEFAULTS.resultsPerStore);
  assert.deepEqual(blank.overrides, {});
  assert.throws(() => requireZip(blank), /ZIP/i);
});

test('control: contextFrom reads no stored state — the saved settings row is gone and unused', () => {
  assert.equal(getKV('settings'), null, 'nothing may read or write a global settings row');
  const report = legacyReport();
  assert.equal(report.settingsRow, false);
  assert.deepEqual(report.tables, [], `legacy single-user tables still hold rows: ${report.tables.join(', ')}`);
});

test('control: per-chain ZIP overrides are per-request and never bleed between visitors', () => {
  const a = contextFrom(urlFor('?zip=60614&overrides=aldi:60601'));
  const b = contextFrom(urlFor('?zip=94110'));
  assert.equal(storeZip(a, 'aldi'), '60601');
  assert.equal(storeZip(a, 'wholefoods'), '60614');
  assert.equal(storeZip(b, 'aldi'), '94110', "B must not inherit A's per-chain override");
});

test('control: malformed visitor input is a 400, never a 500 and never another visitor’s problem', () => {
  for (const [qs, re] of [
    ['?zip=6061', /5-digit/i],
    ['?zip=abcde', /5-digit/i],
    ['?stores=not-a-store', /Unknown store/i],
    ['?zip=60614&overrides=aldi', /storeId:zip/i],
    ['?zip=60614&overrides=nope:60601', /Unknown store/i],
    ['?zip=60614&miles=banana', /number/i],
  ]) {
    let err = null;
    try {
      contextFrom(urlFor(qs));
    } catch (e) {
      err = e;
    }
    assert.ok(err, `${qs} should have been rejected`);
    assert.equal(err.status, 400, `${qs} must be a 400, got ${err.status}`);
    assert.match(err.message, re);
  }
  assert.throws(() => queryFrom(urlFor('?zip=60614')), /Type something/i);
});

test('control: the clamps that used to live in updateSettings still bound visitor input', () => {
  const wide = contextFrom(urlFor('?zip=60614&miles=9999&resultsPerStore=9999'));
  assert.equal(wide.maxMiles, LIMITS.maxMiles.max);
  assert.equal(wide.resultsPerStore, LIMITS.resultsPerStore.max);
  const narrow = contextFrom(urlFor('?zip=60614&miles=-50&resultsPerStore=0'));
  assert.equal(narrow.maxMiles, LIMITS.maxMiles.min);
  assert.equal(narrow.resultsPerStore, LIMITS.resultsPerStore.min);
  assert.throws(() => contextFrom(urlFor(`?zip=60614&stores=${Array.from({ length: 25 }, () => 'aldi').join(',')}`)), /Too many stores/i);
  assert.equal(queryFrom(urlFor(`?q=${'x'.repeat(500)}`)).length, LIMITS.query.max);
});

test('control: the shopping list and watch spec are re-validated as visitor input, not trusted', () => {
  assert.throws(() => normalizeItems('milk'), /array/i);
  assert.throws(() => normalizeItems([]), /empty/i);
  assert.throws(() => normalizeItems(Array.from({ length: 61 }, () => ({ text: 'x' }))), /Too many items/i);
  const items = normalizeItems([{ text: '  milk  ', qty: '999', id: 'x'.repeat(200), pinned: { storeId: 'aldi', key: 'aldi:1', evil: 1 } }]);
  assert.equal(items[0].text, 'milk');
  assert.equal(items[0].qty, 99, 'quantity must be clamped');
  assert.equal(items[0].id.length, 64, 'the echoed id must be bounded');
  assert.equal(items[0].pinned.evil, undefined, 'only known pinned fields survive');
  assert.throws(() => normalizeSpec({}), /Enter something/i);
  assert.equal(normalizeSpec({ query: 'eggs', dim: 'nonsense' }).dim, null);
});

// ---------------------------------------------------------------------------
// 2. The visitor's Kroger keys.
//    They are a secret the visitor supplies. They must arrive in headers (query strings land in
//    access logs, proxy logs, Referer headers and browser history), be used for one request, and
//    never be written down.
// ---------------------------------------------------------------------------

const KEYS = { id: 'qa-client-id', secret: 'qa-client-secret' };

// These check a VISITOR's keys, so the server's own keys (ops/kroger-launch.md) must not be set here.
delete process.env.KROGER_CLIENT_ID;
delete process.env.KROGER_CLIENT_SECRET;

test('control: Kroger keys are read from headers only', () => {
  const ctx = contextFrom(urlFor('?zip=60614'), null, {
    'x-kroger-client-id': KEYS.id,
    'x-kroger-client-secret': KEYS.secret,
  });
  assert.deepEqual(ctx.kroger, { clientId: KEYS.id, clientSecret: KEYS.secret, server: false });
});

test('control: Kroger keys sent in the query string or the body are ignored', () => {
  const viaQuery = contextFrom(urlFor(`?zip=60614&krogerClientId=${KEYS.id}&krogerClientSecret=${KEYS.secret}&x-kroger-client-id=${KEYS.id}`));
  assert.deepEqual(viaQuery.kroger, { clientId: '', clientSecret: '', server: false }, 'a secret in a URL must never be honoured');
  const viaBody = contextFrom(urlFor('?zip=60614'), { kroger: { clientId: KEYS.id, clientSecret: KEYS.secret }, 'x-kroger-client-id': KEYS.id });
  assert.deepEqual(viaBody.kroger, { clientId: '', clientSecret: '', server: false });
});

test('control: a half-configured Kroger pair is "not configured", not an error', () => {
  const half = contextFrom(urlFor('?zip=60614'), null, { 'x-kroger-client-id': KEYS.id });
  assert.deepEqual(half.kroger, { clientId: '', clientSecret: '', server: false });
  assert.throws(
    () => contextFrom(urlFor('?zip=60614'), null, { 'x-kroger-client-id': 'x'.repeat(300), 'x-kroger-client-secret': 'y' }),
    /too long/i,
  );
});

test('control: a Kroger secret is never written to the database', () => {
  contextFrom(urlFor('?zip=60614'), null, { 'x-kroger-client-id': KEYS.id, 'x-kroger-client-secret': KEYS.secret });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of tables) {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    const blob = JSON.stringify(rows);
    assert.ok(!blob.includes(KEYS.secret), `${t} contains a Kroger client secret`);
    assert.ok(!blob.includes(KEYS.id), `${t} contains a Kroger client id`);
  }
});

// DEFECT 1 — src/adapters/kroger.js:17,31-34.
//
//   const tokens = new Map(); // clientId -> { token, exp }
//   const hit = tokens.get(clientId);
//   if (!force && hit && Date.now() < hit.exp - 60_000) return hit.token;
//
// The cached access token is looked up by client id alone; the client SECRET is never compared.
// A Kroger client id is the non-secret half of an OAuth client-credentials pair. So once visitor A
// has minted a token, visitor B can send A's client id with ANY secret and ride A's token for up
// to 30 minutes — spending A's Kroger rate limit on B's searches, with no credential check at all.
// The cache key must bind the secret (e.g. a hash of id+secret) so a wrong secret can never hit.
//
// This one is asserted against the source because the token map, getToken() and the API base URL
// are all module-private, so there is no seam to drive it through without a real Kroger key.
test('DEFECT 1: the Kroger token cache must be keyed by the secret too, not the client id alone', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/adapters/kroger.js'), 'utf8');
  const cacheKeyBindsSecret = /tokens\.(get|set)\([^)]*(clientSecret|secretHash|keyFor|fingerprint|hash)/.test(src);
  assert.ok(
    cacheKeyBindsSecret,
    'tokens are cached by clientId only: a visitor who knows another visitor’s (non-secret) ' +
      'Kroger client id can send any secret and reuse their access token',
  );
});

// ---------------------------------------------------------------------------
// 3. What the server keeps on disk.
// ---------------------------------------------------------------------------

test('control: the schema has no per-visitor tables at all', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
  const expected = ['kv', 'cache', 'products', 'observations', 'flipp_details'];
  for (const t of tables) {
    assert.ok(expected.includes(t), `unexpected table "${t}" — every table here must be shared infrastructure`);
  }
  // No table may carry a per-visitor discriminator.
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name.toLowerCase());
    for (const banned of ['user_id', 'visitor_id', 'session_id', 'ip', 'client_id', 'device_id']) {
      assert.ok(!cols.includes(banned), `${t}.${banned} identifies a visitor`);
    }
  }
});

test('control: price history is keyed by product and store, never by a person', () => {
  const cols = db.prepare('PRAGMA table_info(observations)').all().map((c) => c.name);
  // A strict allowlist on purpose: any NEW column here has to be justified as being about the
  // product or the store, never the shopper. `location_id` is the retailer's own id for a physical
  // store, added so a Chicago shopper is not shown a Los Angeles low.
  assert.deepEqual(
    cols.sort(),
    ['id', 'location_id', 'observed_at', 'on_sale', 'pkey', 'price', 'promo', 'reg_price', 'store_id', 'unit_dim', 'unit_price'].sort(),
  );
  // A fresh id each run: recordProducts() deliberately skips an unchanged price seen < 12h ago.
  const id = `iso-${process.pid}-${Date.now()}`;
  const p = makeProduct({ storeId: 'qa', id, name: 'QA Milk', sizeText: '1 gal', price: 3.99 });
  assert.equal(p.key, `qa:${id}`, 'the history key is storeId:productId — nothing about the shopper');
  const before = historyCounts().observations;
  recordProducts([p]);
  assert.equal(historyCounts().observations, before + 1);
  const { product, series } = productHistory(`qa:${id}`);
  assert.equal(product.pkey, `qa:${id}`);
  assert.ok(series.length >= 1);
  for (const row of series) {
    assert.ok(!('zip' in row), 'a history point must not record where the shopper was');
  }
});

// DEFECT 2 — src/normalize.js (`key: ${f.storeId}:${f.id}`) + src/history.js.
//
// Reproduced live against a server on a scratch data directory:
//   visitor A: GET /api/search?zip=60614&stores=wholefoods&q=banana
//   visitor B: GET /api/search?zip=94110&stores=wholefoods&q=banana
// Both stores resolved correctly and independently (Lincoln Park vs Noe Valley), but 16 pkeys
// ended up with two observations each from the two cities, e.g.
//   wholefoods:chobani-strawberry-banana-drinkable-greek-yogurt-7-fz-… -> 2.79, 3.29
// and B's search results came back carrying A's Chicago price as the history:
//   {"n":1,"low":0.69,...}  on an item B was being quoted $0.89 for.
//
// The history is impersonal, which is what the privacy promise requires — but it is also
// location-blind, so "lowest price seen" and the "price dropped" flag now mean "somewhere in the
// United States, by someone else". A fix has to scope an observation to the store location it came
// from; the minimal shape of that is a location discriminator on the row.
test('DEFECT 2: a price observation must record which store location it came from', () => {
  const cols = db.prepare('PRAGMA table_info(observations)').all().map((c) => c.name.toLowerCase());
  const hasLocation = cols.some((c) => ['location_id', 'store_location_id', 'zip', 'postal_code', 'region'].includes(c));
  assert.ok(
    hasLocation,
    'observations are pooled per chain, not per store: a shopper in one city is shown the lowest ' +
      'price another city has ever seen, and "price dropped" flips whenever a distant visitor searches',
  );
});

test('control: history stats are a pure function of the recorded rows', () => {
  const p = makeProduct({ storeId: 'qa', id: 'iso-2', name: 'QA Eggs', sizeText: '12 ct', price: 4.49 });
  const stats = historyStats([p]);
  assert.ok(!stats[p.key] || typeof stats[p.key].n === 'number');
  // Reading history never mutates it.
  const before = historyCounts().observations;
  historyStats([p]);
  historyStats([p]);
  assert.equal(historyCounts().observations, before);
});

// ---------------------------------------------------------------------------
// 4. Module-level state that outlives a request.
// ---------------------------------------------------------------------------

// DEFECT 3 — src/search.js:17 `const health = {}`, written in searchStore()'s catch at line 81,
// read by getHealth() and served, unauthenticated, from BOTH /api/state and /api/health. The
// browser calls /api/state on every page load (public/js/actions.js boot()).
//
// Reproduced live:
//   visitor A: GET /api/search?zip=09999&stores=wholefoods&q=caviar   (valid format, geocoder 404)
//   visitor B: GET /api/state
//     -> "health":{"wholefoods":{"ok":false,...,"error":"ZIP 09999 was not found",...}}
//
// That is one visitor's ZIP code, held in module scope between requests and handed to every other
// visitor. The error text must be scrubbed of request input before it is stored globally.
test('DEFECT 3: the shared store-health object must never hold a visitor’s ZIP', async () => {
  const ctx = {
    zip: 'QAZIP', // stands in for the live case: a well-formed ZIP the geocoder cannot resolve
    stores: ['aldi'],
    prime: false,
    cardPrices: true,
    maxMiles: 25,
    resultsPerStore: 36,
    overrides: {},
    kroger: { clientId: '', clientSecret: '', server: false },
  };
  // geocodeZip() rejects this locally, so nothing leaves the machine.
  await search.searchStore('aldi', 'qa-probe', ctx);
  const health = JSON.stringify(search.getHealth());
  assert.ok(
    !health.includes('QAZIP'),
    `one visitor's ZIP is now in the globally-served health object and is returned by /api/state ` +
      `and /api/health to everybody: ${health.slice(0, 200)}`,
  );
});

test('control: nothing in the health object identifies a visitor beyond the store name', () => {
  for (const [storeId, h] of Object.entries(search.getHealth())) {
    assert.ok(typeof storeId === 'string');
    const keys = Object.keys(h).sort();
    for (const k of keys) {
      assert.ok(['ok', 'at', 'ms', 'error', 'source'].includes(k), `unexpected health field "${k}" on ${storeId}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 5. The politeness guard, which is the only thing standing between a stranger and a retailer.
// ---------------------------------------------------------------------------

function fakeReq(remoteAddress, headers = {}) {
  return { headers, socket: { remoteAddress } };
}

test('control: without BASKET_TRUST_PROXY, a forged X-Forwarded-For cannot dodge the budget', () => {
  delete process.env.BASKET_TRUST_PROXY;
  const a = clientKey(fakeReq('203.0.113.7', { 'x-forwarded-for': '1.1.1.1' }));
  const b = clientKey(fakeReq('203.0.113.7', { 'x-forwarded-for': '2.2.2.2' }));
  assert.equal(a, b, 'the socket address must win when the proxy header is not trusted');
  assert.equal(a, '203.0.113.7');
});

test('control: the per-IP budget actually refuses work rather than doing it', () => {
  delete process.env.BASKET_TRUST_PROXY;
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const limit = +process.env.BASKET_RATE_LIMIT || 90;
  let refusedAt = null;
  for (let i = 1; i <= limit + 5; i++) {
    const r = takeRequest(fakeReq(ip));
    if (!r.ok && refusedAt === null) refusedAt = i;
  }
  assert.equal(refusedAt, limit + 1, `budget should bite on request ${limit + 1}, bit on ${refusedAt}`);
  assert.ok(takeRequest(fakeReq(ip)).retryAfter > 0, 'a 429 must carry a retry-after');
});

test('control: the cache-bypass (fresh=1) budget is much smaller than the request budget', () => {
  delete process.env.BASKET_TRUST_PROXY;
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const limit = +process.env.BASKET_FRESH_LIMIT || 12;
  let allowed = 0;
  for (let i = 0; i < limit + 5; i++) if (allowFresh(fakeReq(ip))) allowed += 1;
  assert.equal(allowed, limit);
  assert.ok(limit < (+process.env.BASKET_RATE_LIMIT || 90));
});

// DEFECT 4 — src/guard.js:45-51.
//
//   if (process.env.BASKET_TRUST_PROXY === '1') {
//     const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
//     if (fwd) return fwd.slice(0, 64);
//   }
//
// BASKET_TRUST_PROXY=1 is exactly the setting a hosted deployment behind a load balancer needs,
// and it takes the LEFT-MOST X-Forwarded-For entry. The left-most entry is the value the client
// supplied; a proxy appends to the right. So with the flag on, the caller picks their own bucket.
//
// Reproduced live against `BASKET_TRUST_PROXY=1 PORT=4792 node server.js`:
//   100 requests, one fixed forged X-Forwarded-For -> 68x 200, 32x 429   (budget works)
//   100 requests, rotating forged X-Forwarded-For  -> 100x 200,  0x 429  (budget gone)
//
// The file's own comment says a header "cannot be spoofed to dodge the budget", which is only true
// while the flag is off. Behind a proxy, count hops from the right instead.
test('DEFECT 4: with BASKET_TRUST_PROXY on, a rotating X-Forwarded-For must not create new buckets', () => {
  const prev = process.env.BASKET_TRUST_PROXY;
  process.env.BASKET_TRUST_PROXY = '1';
  try {
    const socket = '203.0.113.99';
    const keys = new Set();
    for (let i = 0; i < 50; i++) keys.add(clientKey(fakeReq(socket, { 'x-forwarded-for': `10.0.0.${i}, ${socket}` })));
    assert.equal(
      keys.size,
      1,
      `one caller minted ${keys.size} distinct rate-limit buckets by rotating a header they control; ` +
        'the per-IP request budget and the fresh-request budget are both bypassed',
    );
  } finally {
    if (prev === undefined) delete process.env.BASKET_TRUST_PROXY;
    else process.env.BASKET_TRUST_PROXY = prev;
  }
});

// DEFECT 5 — src/http.js:63 `st = { active: 0, queue: [], last: 0, max: 4, gap: 40 }` and the
// fact that configureHost() is exported but never called from anywhere in the repo.
//
// Every retailer therefore gets the same default: 4 concurrent requests, 40ms apart — about 25
// requests per second, sustained, with an UNBOUNDED queue and no global budget. And the background
// weekly-ad enrichment (src/adapters/flipp.js enrichFlyer) detaches from the request that started
// it, so it is not counted against any per-IP budget at all.
//
// Measured live, one single unauthenticated request:
//   GET /api/deals?zip=60614&stores=aldi,jewel   -> responded in 2.4s
//   -> 883 outbound requests to backflipp.wishabi.com over the following ~40s (~22/s),
//      875 flyer-item detail fetches, all after the response had been sent.
// With 24 stores allowed per request, rotating ZIPs to miss the cache, and DEFECT 4 removing the
// per-IP budget, one caller can keep the server at its 25/s ceiling against a retailer indefinitely.
// Since Sept 2026 the default IS the owner's rule (one in flight, 700 ms apart) and no adapter may
// loosen it, so "some adapter calls configureHost" no longer stands in for politeness. The property
// itself — every retailer host held to the rule — is pinned in test/qa-http-politeness.test.js;
// here, only that nothing in the server loosens a host past it.
test('DEFECT 5: per-host politeness is never looser than the owner\'s rule', () => {
  const files = ['src/http.js', 'src/search.js', 'src/deals.js', 'src/directory.js', 'src/geo.js', 'server.js']
    .concat(fs.readdirSync(path.join(ROOT, 'src/adapters')).map((f) => `src/adapters/${f}`));
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/configureHost\(\s*'([^']+)'\s*,\s*\{([^}]*)\}/g)) {
      const max = Number(/max:\s*(\d+)/.exec(m[2])?.[1] ?? 1);
      const gap = Number(/gap:\s*(\d+)/.exec(m[2])?.[1] ?? 700);
      assert.ok(max <= 1 && gap >= 700, `${f} sets ${m[1]} to ${max} in flight ${gap} ms apart`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. The browser half. Everything personal now lives in localStorage, so localStorage failing
//    must degrade to in-memory state — not break the app.
//
//    These load the real public/js/store.js, rewriting only its two import specifiers (a bare
//    "preact/hooks" and the server-absolute "/shared/units.js") so it runs under Node.
// ---------------------------------------------------------------------------

const SCRATCH = path.join(process.env.BASKET_DATA_DIR, 'store-harness');
fs.mkdirSync(SCRATCH, { recursive: true });

function fakeStorage(mode = 'ok', seed = {}) {
  const map = new Map(Object.entries(seed));
  const deny = () => {
    const e = new Error('The operation is insecure.');
    e.name = 'SecurityError';
    throw e;
  };
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem(k) {
      if (mode === 'blocked') deny();
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (mode === 'blocked') deny();
      if (mode === 'quota') {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, String(v));
    },
    removeItem(k) {
      if (mode === 'blocked') deny();
      map.delete(k);
    },
    _map: map,
  };
}

let harnessSeq = 0;
async function loadBrowserStore(storage) {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/store.js'), 'utf8');
  const hooks = 'data:text/javascript,' + encodeURIComponent('export const useEffect=()=>{};export const useReducer=()=>[0,()=>{}];');
  const units = pathToFileURL(path.join(ROOT, 'shared/units.js')).href;
  const patched = src.replace("from '/vendor/preact-hooks.mjs'", `from '${hooks}'`).replace("from '/shared/units.js'", `from '${units}'`);
  assert.ok(patched.includes(hooks) && patched.includes(units), 'store.js imports changed — update this harness');
  const file = path.join(SCRATCH, `store.${process.pid}.${harnessSeq++}.mjs`);
  fs.writeFileSync(file, patched);
  globalThis.localStorage = storage;
  return import(pathToFileURL(file).href);
}

test('control: with storage blocked (private browsing), the app falls back to in-memory state', async () => {
  const S = await loadBrowserStore(fakeStorage('blocked'));
  S.hydrate(); // must not throw
  S.saveSettings({ zip: '60614', stores: ['aldi'] });
  S.saveList([{ text: 'milk', qty: 1 }]);
  S.rememberSearch('eggs');
  assert.equal(S.getState().settings.zip, '60614', 'this tab must still work');
  assert.equal(S.getState().list.length, 1);
  assert.equal(S.getState().recent.length, 1);
  assert.equal(S.storageHealthy(), false);
  assert.match(S.getState().storageWarning, /private browsing|blocked site data/i, 'the visitor must be told');
});

test('control: with the storage quota full, writes degrade and the visitor is warned', async () => {
  const S = await loadBrowserStore(fakeStorage('quota'));
  S.hydrate();
  S.saveSettings({ zip: '94110' });
  assert.equal(S.getState().settings.zip, '94110');
  assert.equal(S.storageHealthy(), false);
  assert.match(S.getState().storageWarning, /full/i);
});

test('control: truncated or unparseable JSON in storage starts over instead of crashing', async () => {
  const S = await loadBrowserStore(
    fakeStorage('ok', {
      'cartworth:v1:settings': '{"zip":"606',
      'cartworth:v1:list': '[{"text":"mil',
      'cartworth:v1:watches': 'not json at all',
      'cartworth:v1:recent': '',
    }),
  );
  const own = S.hydrate();
  assert.equal(own.settings.zip, null);
  assert.deepEqual(own.list, []);
  assert.deepEqual(own.watches, []);
  assert.deepEqual(own.recent, []);
  assert.equal(S.storageHealthy(), true);
});

// DEFECT 6 — public/js/store.js readJSON() (line ~70) and hydrate() (line ~215).
//
//   const v = JSON.parse(raw);
//   return v == null ? fallback : v;      // <- a parseable non-array is returned as-is
//   …
//   const list = (readJSON(STORAGE_KEYS.list, []) || []).filter(…)   // <- .filter on an object
//
// readJSON only falls back for UNPARSEABLE JSON. A stored value that parses but is the wrong type
// ({}, a string, a number) is handed straight to .filter(), which throws inside hydrate(), which
// throws inside boot(), and public/js/main.js turns that into a permanent bootError screen whose
// only control is a Reload button that fails identically forever. There is no in-app way out; the
// visitor has to clear site data by hand.
//
// Reproduced in a real browser against the running app: setting
//   localStorage['cartworth:v1:list'] = '{"oops":"valid JSON, wrong type"}'
// and reloading replaced the entire UI with:
//   "(readJSON(...) || []).filter is not a function"  +  a dead Reload button.
// Affects the list, watches and recent keys. The settings key is already safe (sanitizeSettings
// tolerates any input), which is the pattern the other three need.
test('DEFECT 6: storage holding valid JSON of the wrong type must not brick the app', async () => {
  for (const [key, value] of [
    ['cartworth:v1:list', '{"oops":"object"}'],
    ['cartworth:v1:list', '"a string"'],
    ['cartworth:v1:watches', '{"oops":"object"}'],
    ['cartworth:v1:recent', '42'],
  ]) {
    const S = await loadBrowserStore(fakeStorage('ok', { [key]: value }));
    let own = null;
    try {
      own = S.hydrate();
    } catch (err) {
      assert.fail(`hydrate() threw for ${key}=${value}: ${err.message} — the app shows a dead bootError screen`);
    }
    assert.deepEqual(own.list, [], `${key}=${value}`);
    assert.deepEqual(own.watches, []);
    assert.deepEqual(own.recent, []);
  }
});

test('control: the browser and the server agree on what "unset" and "too much" mean', async () => {
  const S = await loadBrowserStore(fakeStorage('ok'));
  assert.equal(S.SETTINGS_DEFAULTS.prime, DEFAULTS.prime);
  assert.equal(S.SETTINGS_DEFAULTS.cardPrices, DEFAULTS.cardPrices);
  assert.equal(S.SETTINGS_DEFAULTS.maxMiles, DEFAULTS.maxMiles);
  assert.equal(S.SETTINGS_DEFAULTS.resultsPerStore, DEFAULTS.resultsPerStore);
  const wild = S.sanitizeSettings({ zip: '6061', stores: Array.from({ length: 99 }, (_, i) => `s${i}`), maxMiles: 9999, resultsPerStore: 0, kroger: { clientId: 'x'.repeat(999) } });
  assert.equal(wild.zip, null);
  assert.equal(wild.stores.length, LIMITS.stores.max);
  assert.equal(wild.maxMiles, LIMITS.maxMiles.max);
  assert.equal(wild.resultsPerStore, LIMITS.resultsPerStore.min);
  assert.equal(wild.kroger.clientId.length, LIMITS.krogerKey.max);
});

test('control: forgetEverything really clears this browser, and the export carries no server data', async () => {
  const store = fakeStorage('ok');
  const S = await loadBrowserStore(store);
  S.hydrate();
  S.saveSettings({ zip: '60614', kroger: { clientId: KEYS.id, clientSecret: KEYS.secret } });
  S.saveList([{ text: 'milk', qty: 2 }]);
  S.rememberSearch('milk');
  const bundle = S.exportBundle();
  assert.equal(bundle.settings.zip, '60614');
  assert.equal(bundle.list.length, 1);
  S.forgetEverything();
  assert.equal(S.getState().settings.zip, null);
  assert.deepEqual(S.getState().list, []);
  assert.deepEqual(S.getState().recent, []);
  for (const k of ['cartworth:v1:settings', 'cartworth:v1:list', 'cartworth:v1:watches', 'cartworth:v1:recent']) {
    assert.equal(store._map.has(k), false, `${k} survived forgetEverything()`);
  }
});

test('control: an imported bundle is re-sanitised, so a hostile export file cannot poison state', async () => {
  const S = await loadBrowserStore(fakeStorage('ok'));
  S.hydrate();
  assert.throws(() => S.importBundle(null), /not a Cartworth export/i);
  assert.throws(() => S.importBundle({ app: 'something-else' }), /different app/i);
  const r = S.importBundle({ app: 'cartworth', settings: { zip: 'nope', maxMiles: 1e9 }, list: 'not an array', watches: { a: 1 }, recent: 7 });
  assert.equal(S.getState().settings.zip, null);
  assert.equal(S.getState().settings.maxMiles, LIMITS.maxMiles.max);
  assert.deepEqual(S.getState().list, []);
  assert.deepEqual(S.getState().watches, []);
  assert.equal(r.list, 0);
});

// ---------------------------------------------------------------------------
// 7. The shipped privacy promises, as far as the repository can answer them.
// ---------------------------------------------------------------------------

test('control: the web app loads no third-party script, style, font or pixel', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  // Tags that make the browser fetch something. Plain <a href> links (the footer's privacy and terms
  // pages, also in the static first screen) load nothing until clicked.
  const external = [...html.matchAll(/<(?:script|link|img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:src|href|srcset|data)="(?:https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
  assert.deepEqual(external, [], `public/index.html pulls in ${external.join(', ')}`);
  const js = fs.readdirSync(path.join(ROOT, 'public/js'), { recursive: true })
    .filter((f) => String(f).endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'public/js', String(f)), 'utf8'))
    .join('\n');
  // Match the analytics PRODUCT, not the English word. A bare substring test failed on
  // `implausible`, the flag that marks a unit price we do not believe, which is the opposite of
  // a tracker. Anchor the ambiguous names to a domain or a call.
  const trackers = [
    /google-analytics\.com/, /googletagmanager\.com/, /\bgtag\s*\(/,
    /plausible\.io/, /\bplausible\s*\(/, /usefathom\.com/, /\bfathom\s*\(/,
    /matomo\.(?:cloud|org)/, /\b_paq\b/, /segment\.(?:com|io)/, /\banalytics\.track\s*\(/,
    /hotjar\.com/, /\bhj\s*\(/, /\bfbq\s*\(/, /connect\.facebook\.net/,
  ];
  for (const re of trackers) {
    assert.ok(!re.test(js), `the web app references ${re}`);
  }
});

test('control: the server sets no cookie on the visitor', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(!/set-cookie/i.test(server), 'server.js sets a cookie on the visitor');
  // The one cookie jar in the codebase points outward, at retailers, not at the visitor.
  const http = fs.readFileSync(path.join(ROOT, 'src/http.js'), 'utf8');
  assert.ok(http.includes('class CookieJar'), 'the cookie jar is for outbound retailer requests');
});

test('control: the marketing site embeds nothing from a third party', () => {
  const dir = path.join(ROOT, 'site');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const external = [...html.matchAll(/<(?:script|link|iframe|img)[^>]*(?:src|href)="https?:\/\/[^"]+"/g)]
      .map((m) => m[0])
      .filter((tag) => !/rel="canonical"/.test(tag));
    assert.deepEqual(external, [], `site/${f} embeds ${external.join(', ')}`);
  }
});

// DEFECT 7 — site/privacy.html.
//
// The page body was updated for the refactor but the page's own <meta> description (and the
// matching og: and twitter: descriptions, lines 7, 16 and 24) still say "nothing stored on our
// servers". That is the text search engines and link previews show, and it now contradicts the
// body of the same file, which correctly says the web version IS a server-side application that
// keeps a price history and a retailer cache.
//
// Separately, the "What it keeps" bullet in the #web section (line 154) still describes the
// pre-refactor model: it lists the ZIP, radius, stores, list and watches as things "stored by the
// application", which reads as "on the server" in a paragraph whose whole point is that the web
// version has a server. After the refactor those live only in the visitor's browser, and the page
// never tells a web visitor that — which is now the single most important fact about the web
// version, because clearing site data destroys all of it and there is no server copy.
test('DEFECT 7: the privacy page must not claim "nothing stored on our servers"', () => {
  const html = fs.readFileSync(path.join(ROOT, 'site/privacy.html'), 'utf8');
  const metas = [...html.matchAll(/<meta[^>]+content="([^"]*nothing stored on our servers[^"]*)"/gi)].map((m) => m[1]);
  assert.deepEqual(
    metas,
    [],
    `${metas.length} meta description(s) still claim nothing is stored server-side, while the same ` +
      'page\'s #web section correctly describes a server that keeps a price history and a retailer cache',
  );
});

test('control: the privacy page still says the things about the web version that ARE true', () => {
  const html = fs.readFileSync(path.join(ROOT, 'site/privacy.html'), 'utf8');
  assert.match(html, /no sign-up, no email address and no password on the web version/i);
  assert.match(html, /reach the retailers' websites from the server, not from your browser/i);
  assert.match(html, /loads no analytics, no advertising and no third-party tracking code/i);
});
