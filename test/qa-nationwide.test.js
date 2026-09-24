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

// ---------------------------------------------------------------------------
// The nationwide staples audit (live, Sept 2026): LA, Houston, Manhattan, Miami, Seattle.
// ---------------------------------------------------------------------------
import { makeProduct } from '../src/normalize.js';
import { sizeFromName } from '../shared/units.js';
import { relevance, RELEVANT } from '../shared/match.js';

test('DEFECT (LA): a milk named "Paper Quart" but listed as 1 gal is a size conflict, not $1.98 a gallon', () => {
  const p = makeProduct({ storeId: 'walmart', id: 'ad', name: 'Alta Dena Whole Milk, Paper Quart', sizeText: '1 gal', price: 1.98 });
  assert.ok(p.sizeConflict, 'the name says a quart');
  assert.equal(p.unit.volume, undefined, 'no unit price from a size we cannot trust');
  assert.equal(sizeFromName('Lucerne 2% Milk Gallon').base, 128);
});

test('control: a container word on something that is not a liquid is not a size', () => {
  assert.equal(sizeFromName('Ziploc Quart Freezer Bags'), null);
  assert.equal(sizeFromName("Ben & Jerry's Pint"), null);
});

test('DEFECT (LA): a surprise egg toy is not eggs', () => {
  assert.ok(relevance('eggs', { name: 'Surprise Crystal Egg' }) < RELEVANT);
  assert.ok(relevance('eggs', { name: "Eggland's Best Large Eggs" }) >= RELEVANT);
});

// DEFECT (Seattle audit): three Puget Sound grocers on Instacart were not in the catalog, so a
// Seattle shopper saw none of them. Each slug was verified against a nearby store by find-slugs.js.
test('DEFECT (Seattle): PCC, Metropolitan Market and Town & Country Markets are priced chains', () => {
  assert.equal(storeForMerchant('PCC Community Markets'), 'pcc');
  assert.equal(storeForMerchant('Metropolitan Market'), 'metropolitanmarket');
  assert.equal(storeForMerchant('Town & Country Markets'), 'townandcountry');
  for (const id of ['pcc', 'metropolitanmarket', 'townandcountry']) assert.equal(chainForName(id === 'pcc' ? 'PCC' : id === 'metropolitanmarket' ? 'Metropolitan Market' : 'Town and Country Markets')?.id, id);
});

test('control: lookalike names stay with their own chain or with none', () => {
  assert.equal(storeForMerchant('Metro Market'), 'metromarket');
  assert.equal(storeForMerchant('Town & Country'), null);
  assert.equal(storeForMerchant('Central Market'), null);
});

// DEFECT: when zippopotam.us failed (not a 404), the Nominatim fallback stored the state's NAME.
// The catalog's state lists are postal codes, so the ZIP matched no regional chain, for the year
// the geocode is cached: a Seattle shopper would have lost PCC, QFC and every other WA chain.
import { geocodeZip, stateCode } from '../src/geo.js';
import { chainsInState } from '../shared/catalog.js';

test('DEFECT: a ZIP geocoded by the Nominatim fallback keeps its regional chains', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('zippopotam.us')) return new Response('down', { status: 503 });
    if (u.includes('nominatim.openstreetmap.org')) {
      return new Response(JSON.stringify([{ lat: '47.66', lon: '-122.34', address: { city: 'Seattle', state: 'Washington', 'ISO3166-2-lvl4': 'US-WA' } }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected request ${u}`);
  };
  try {
    const geo = await geocodeZip('98199');
    assert.equal(geo.state, 'WA');
    assert.ok(chainsInState(geo.state).some((c) => c.id === 'pcc'));
  } finally { globalThis.fetch = realFetch; }
});

test('DEFECT: a state name without the ISO code is still read as its postal code', () => {
  assert.equal(stateCode({ state: 'Washington' }), 'WA');
  assert.equal(stateCode({ state: 'District of Columbia' }), 'DC');
  assert.equal(stateCode({ state: 'Puerto Rico' }), 'PR');
});

test('control: an unknown state asks the national chains only, never every chain', () => {
  assert.equal(stateCode({ state: 'CA' }), 'CA');
  const st = stateCode({ state: 'Atlantis' });
  assert.ok(st);
  assert.ok(chainsInState(st).every((c) => c.states === 'US'));
});

// DEFECT (Denver audit): King Soopers lists "2% Reduced Fat Milk Half Gallon" stated "2 gal" at
// $2.99. Its slug ends "-2-gal" only because Instacart appends the stated size to every slug, and
// that was read as the retailer settling the disagreement: Denver's best milk was $1.50 a gallon.
const KS_MILK = 'https://www.instacart.com/products/19280305-king-soopers-2-reduced-fat-milk-2-gal?retailerSlug=king-soopers';

test('DEFECT (Denver): a half gallon stated "2 gal" is a size conflict and cannot be the best milk', () => {
  const p = makeProduct({ storeId: 'kingsoopers', id: 'ks-1', name: 'King Soopers® City Market® 2% Reduced Fat Milk Half Gallon', sizeText: '2 gal', price: 2.99, url: KS_MILK, relevance: 1 });
  assert.ok(p.sizeConflict, 'the name says half a gallon and the size says two');
  assert.equal(p.unit.volume, undefined, 'no $1.50 a gallon from a size we cannot trust');
});

test('control: a slug that states the size inside the name part still settles it (Costco)', () => {
  const p = makeProduct({ storeId: 'costco', id: 'c-1', name: 'Sweet Potatoes, 5 lbs', sizeText: '10 lb', price: 8.07, url: 'https://www.instacart.com/products/18848374-sweet-potatoes-10-lbs-10-lb?retailerSlug=costco' });
  assert.equal(p.sizeConflict, null);
});
