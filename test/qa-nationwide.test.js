// QA: the nationwide coverage sweep (Sept 2026). The real nearby-store directory was built for ZIPs
// in all 50 states + DC (a metro, a small town and a rural ZIP each, picked from the Census ZIP
// list), and Flipp's circular list was read for all 153.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainForName } from '../shared/catalog.js';
import { storeForMerchant } from '../shared/stores.js';

// DEFECT: Flipp spells two priced chains differently from the catalog. "Wegman's" advertised into
// 27 sampled ZIPs across NY, PA, NJ, MA, MD, VA, NC, DE and DC, and "FoodCity" into AL, GA and TN;
// neither matched, so their weekly ads never reached the Sales tab (the stores were still priced:
// every in-state chain with a price source is asked regardless of Flipp).
test("DEFECT: Flipp's spellings of Wegmans and Food City are those chains", () => {
  assert.equal(storeForMerchant("Wegman's"), 'wegmans');
  assert.equal(storeForMerchant('FoodCity'), 'foodcity');
});

test('control: the catalog spellings, and chains that merely look alike, stay as they were', () => {
  assert.equal(storeForMerchant('Wegmans'), 'wegmans');
  assert.equal(storeForMerchant('Food City'), 'foodcity');
  assert.equal(chainForName('Seafood City')?.id, 'seafoodcity');
  assert.equal(chainForName('Restaurant Depot'), null);
});

// DEFECT: Whole Foods answers "no store near this ZIP" with a 404. The adapter threw on it, so in 11
// of the 30 ZIPs the sweep built for real (every rural one) Whole Foods was "unresolved": the
// directory said its counts might be low and rebuilt the ZIP every few minutes, asking again.
import { resolveStore } from '../src/adapters/wholefoods.js';

async function withFetch(closestStatus, fn) {
  const realFetch = globalThis.fetch;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/csrf')) return json({ token: 't' });
    if (u.includes('/api/wwos/location/store/closest')) return json(closestStatus === 200 ? { storeCode: '88888' } : { message: 'Not Found' }, closestStatus);
    if (u.includes('/api/stores/88888/summary')) return json({ storeId: 88888, displayName: 'Test', primaryLocation: { latitude: 41.9, longitude: -87.7, address: {} } });
    if (u.includes('zippopotam.us')) return json({ places: [{ latitude: '41.9', longitude: '-87.7', 'place name': 'Test', 'state abbreviation': 'IL' }] });
    throw new Error(`unexpected request ${u}`);
  };
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

test('DEFECT: a ZIP with no Whole Foods near it is "none", not a failed lookup', async () => {
  const r = await withFetch(404, () => resolveStore('38748', { fresh: true }));
  assert.deepEqual(r, { none: true });
});

test('control: a real failure still fails, and a store is still found', async () => {
  await assert.rejects(withFetch(500, () => resolveStore('38749', { fresh: true })), /500/);
  const r = await withFetch(200, () => resolveStore('38750', { fresh: true }));
  assert.equal(r.id, '88888');
});
