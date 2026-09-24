// QA: the Kroger API made ready for launch day. Until now it worked only for a visitor who pasted
// their own developer keys into Settings; the owner will hold one set for everybody. Kroger's public
// tier allows about 10,000 product and 1,600 location calls a day, and its terms allow keeping its
// content only as long as its cache headers say. Nothing here touches api.kroger.com.
//
// Convention: "DEFECT: …" failed before the change; "control: …" held before and must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFor, searchStore } from '../src/search.js';
import { ttlFromCacheControl, _setBudgetForTests, ensureValidated } from '../src/adapters/kroger.js';
import { contextFrom } from '../src/context.js';

const ctx = (zip, headers = {}) => contextFrom(new URL(`http://x/api/search?zip=${zip}`), null, headers);
const withEnv = async (env, fn) => {
  const old = {};
  for (const [k, v] of Object.entries(env)) { old[k] = process.env[k]; if (v == null) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v == null) delete process.env[k]; else process.env[k] = v; } }
};

test('DEFECT: the server’s own Kroger keys price Mariano’s for a visitor who brought none', () => withEnv({ KROGER_CLIENT_ID: 'owner-id', KROGER_CLIENT_SECRET: 'owner-secret' }, () => {
  const c = ctx('60618');
  assert.deepEqual(sourceFor('marianos', c), { type: 'kroger', chain: 'MARIANOS' });
  assert.equal(c.kroger.server, true);
}));

test('control: a visitor’s own keys win over the server’s, and no keys at all means Instacart', async () => {
  await withEnv({ KROGER_CLIENT_ID: 'owner-id', KROGER_CLIENT_SECRET: 'owner-secret' }, () => {
    const c = ctx('60618', { 'x-kroger-client-id': 'v-id', 'x-kroger-client-secret': 'v-secret' });
    assert.equal(c.kroger.clientId, 'v-id');
    assert.equal(c.kroger.server, false);
  });
  await withEnv({ KROGER_CLIENT_ID: null, KROGER_CLIENT_SECRET: null }, () => assert.equal(sourceFor('marianos', ctx('60618')).type, 'instacart'));
});

test('DEFECT: Kroger’s cache headers decide how long a Kroger answer may be kept', () => {
  assert.equal(ttlFromCacheControl('public, max-age=300'), 300_000);
  assert.equal(ttlFromCacheControl('no-store'), 0);
  assert.equal(ttlFromCacheControl('private, max-age=600'), 0);
  assert.equal(ttlFromCacheControl(''), null);
});

function stubKroger({ cacheControl, onProducts = () => {} }) {
  const json = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
  return async (url) => {
    const u = String(url);
    if (u.includes('zippopotam.us')) return json({ places: [{ latitude: '41.94', longitude: '-87.70', 'place name': 'Chicago', 'state abbreviation': 'IL' }] });
    if (u.endsWith('/connect/oauth2/token')) return json({ access_token: 't', expires_in: 1800 });
    if (u.includes('/v1/locations')) return json({ data: [{ locationId: '53100009', chain: 'MARIANOS', name: "Mariano's", address: { addressLine1: '1 A St', city: 'Chicago', state: 'IL' }, geolocation: { latitude: 41.94, longitude: -87.7 } }] });
    if (u.includes('/v1/products')) {
      onProducts();
      return json({ data: [{ productId: '9', description: 'Simple Truth Organic Milk', brand: 'Simple Truth', items: [{ size: '1 gal', soldBy: 'UNIT', price: { regular: 5.49 } }] }] }, cacheControl ? { 'cache-control': cacheControl } : {});
    }
    throw new Error(`unexpected request ${u}`);
  };
}

test('DEFECT: a Kroger answer marked no-store is not kept, so the next search asks again', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = stubKroger({ cacheControl: 'no-store', onProducts: () => (calls += 1) });
  try {
    const c = ctx('60601', { 'x-kroger-client-id': 'nostore-id', 'x-kroger-client-secret': 's' });
    await ensureValidated(c);
    const r1 = await searchStore('marianos', 'milk nostore', c);
    assert.equal(r1.status, 'ok', r1.error);
    await searchStore('marianos', 'milk nostore', c);
    assert.equal(calls, 2, 'a no-store answer was served from our cache');
  } finally {
    globalThis.fetch = real;
  }
});

test('control: a Kroger answer with a max-age is kept and reused', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = stubKroger({ cacheControl: 'max-age=120', onProducts: () => (calls += 1) });
  try {
    const c = ctx('60602', { 'x-kroger-client-id': 'maxage-id', 'x-kroger-client-secret': 's' });
    await ensureValidated(c);
    await searchStore('marianos', 'milk maxage', c);
    const r2 = await searchStore('marianos', 'milk maxage', c);
    assert.equal(calls, 1);
    assert.equal(r2.cached, true);
  } finally {
    globalThis.fetch = real;
  }
});

test('DEFECT: once the server keys’ daily budget is spent, Mariano’s falls back to Instacart', () => withEnv({ KROGER_CLIENT_ID: 'owner-id', KROGER_CLIENT_SECRET: 'owner-secret' }, async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stubKroger({ cacheControl: 'no-store' });
  _setBudgetForTests({ products: 3, locations: 100 });
  try {
    const c = ctx('60603');
    assert.equal(sourceFor('marianos', c).type, 'kroger');
    for (let i = 0; i < 3; i++) assert.equal((await searchStore('marianos', `budget ${i}`, c)).status, 'ok');
    assert.equal(sourceFor('marianos', ctx('60603')).type, 'instacart', 'over budget, the store is priced from Instacart');
    // A visitor's own keys carry their own limits and are not affected.
    const own = ctx('60603', { 'x-kroger-client-id': 'v', 'x-kroger-client-secret': 'w' });
    await ensureValidated(own);
    assert.equal(sourceFor('marianos', own).type, 'kroger');
  } finally {
    globalThis.fetch = real;
    _setBudgetForTests({ products: 9000, locations: 1400 });
  }
}));

// The security review: a made-up key pair switched the source to Kroger and was served Kroger
// results another visitor's keys had paid for.
test('DEFECT: a visitor’s keys are used only after Kroger accepts them', async () => {
  const real = globalThis.fetch;
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  try {
    globalThis.fetch = async () => json({ error: 'invalid_client' }, 401);
    const bad = ctx('60604', { 'x-kroger-client-id': 'made-up', 'x-kroger-client-secret': 'nope' });
    assert.equal(sourceFor('marianos', bad).type, 'instacart', 'untested keys are not used');
    await ensureValidated(bad);
    assert.equal(sourceFor('marianos', bad).type, 'instacart', 'rejected keys are not used');
    globalThis.fetch = async () => json({ access_token: 't', expires_in: 1800 });
    const good = ctx('60604', { 'x-kroger-client-id': 'real-id', 'x-kroger-client-secret': 'real' });
    await ensureValidated(good);
    assert.equal(sourceFor('marianos', good).type, 'kroger');
  } finally {
    globalThis.fetch = real;
  }
});

// Nationwide review: six Kroger banners were not wired to the Kroger API at all, so the owner's keys
// would not have priced Metro Market (named in the Kroger email), Food 4 Less, Gerbes or JayC; and
// City Market and Baker's, which are not on Instacart, could never be priced.
import { priceable } from '../src/directory.js';
import { CHAIN_BY_ID } from '../shared/catalog.js';

test('DEFECT: every Kroger banner in the catalog prices through the Kroger API when the keys are set', () => withEnv({ KROGER_CLIENT_ID: 'owner-id', KROGER_CLIENT_SECRET: 'owner-secret' }, () => {
  _setBudgetForTests({ products: 9000, locations: 1400 });
  for (const [id, chain] of [['metromarket', 'METRO_MARKET'], ['food4less', 'FOOD_4_LESS'], ['gerbes', 'GERBES'], ['jayc', 'JAYC'], ['citymarket', 'CITY_MARKET'], ['bakersplus', 'BAKERS']]) {
    assert.deepEqual(sourceFor(id, ctx('80202')), { type: 'kroger', chain }, id);
  }
  assert.equal(priceable(CHAIN_BY_ID.citymarket), true, 'City Market is located through Kroger');
}));

test('control: without keys, City Market and Baker’s stay weekly-ad only and the rest keep Instacart', () => withEnv({ KROGER_CLIENT_ID: null, KROGER_CLIENT_SECRET: null }, () => {
  assert.equal(priceable(CHAIN_BY_ID.citymarket), false);
  assert.equal(sourceFor('citymarket', ctx('80202')), null);
  assert.equal(sourceFor('metromarket', ctx('53211')).type, 'instacart');
}));
