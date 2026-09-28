// QA round 2, P18: the official Kroger API path, end to end on the web, with the network stubbed.
//
// The catalog gives Mariano's and Pick 'n Save `alt: { type: 'kroger' }`, and Settings takes a free
// developer client id/secret. The moment both are present, those chains must switch from their
// Instacart listing ('online', marked up — measured 0-20% over the shelf in round 2) to exact store
// shelf prices with the card price as the sale. Nothing here touches api.kroger.com: every request
// is answered by the stub below, shaped like the documented API.
//
// Run: BASKET_DATA_DIR=<scratch dir> node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFor, searchStore } from '../src/search.js';
import { sameBanner, siteFor, ensureValidated } from '../src/adapters/kroger.js';
import { contextFrom } from '../src/context.js';

const KEYS = { 'x-kroger-client-id': 'qa-client', 'x-kroger-client-secret': 'qa-secret' };
const ctx = (zip, headers = {}) => contextFrom(new URL(`http://x/api/search?zip=${zip}`), null, headers);

test('control: without keys, Mariano’s and Pick ’n Save are priced from Instacart', () => {
  assert.equal(sourceFor('marianos', ctx('60618')).type, 'instacart');
  assert.equal(sourceFor('picknsave', ctx('53211')).type, 'instacart');
});

// Keys are used once Kroger has accepted them (a token request; see kroger.js ensureValidated).
async function accepted(c) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'qa-token', expires_in: 1800 }), { status: 200, headers: { 'content-type': 'application/json' } });
  try { await ensureValidated(c); } finally { globalThis.fetch = real; }
  return c;
}

test('P18: with both keys, Mariano’s and Pick ’n Save switch to the Kroger API', async () => {
  assert.deepEqual(sourceFor('marianos', await accepted(ctx('60618', KEYS))), { type: 'kroger', chain: 'MARIANOS' });
  assert.deepEqual(sourceFor('picknsave', await accepted(ctx('53211', KEYS))), { type: 'kroger', chain: 'PICK_N_SAVE' });
  // Half a pair is "not configured", never an error.
  assert.equal(sourceFor('marianos', ctx('60618', { 'x-kroger-client-id': 'qa-client' })).type, 'instacart');
});

test('P18: a Pick ’n Save search with keys returns shelf prices, the card price as the sale, and Pick ’n Save links', async () => {
  const realFetch = globalThis.fetch;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    seen.push(u.replace(/\?.*$/, ''));
    if (u.includes('zippopotam.us')) return json({ places: [{ latitude: '43.07', longitude: '-87.88', 'place name': 'Milwaukee', 'state abbreviation': 'WI' }] });
    if (u.endsWith('/connect/oauth2/token')) {
      assert.match(init.headers?.authorization || '', /^Basic /, 'client credentials go in the Authorization header');
      return json({ access_token: 'qa-token', expires_in: 1800 });
    }
    if (u.includes('/v1/locations')) {
      // The exact chain filter finds nothing; the fallback's nearby list spells the banner its own way.
      if (u.includes('filter.chain=')) return json({ data: [] });
      return json({ data: [
        { locationId: '53100001', chain: 'MARIANOS', name: "Mariano's", address: { addressLine1: '1 A St', city: 'Chicago', state: 'IL' }, geolocation: { latitude: 41.9, longitude: -87.7 } },
        { locationId: '53100002', chain: 'PICKNSAVE', name: "Pick 'n Save", address: { addressLine1: '2 B St', city: 'Milwaukee', state: 'WI' }, geolocation: { latitude: 43.08, longitude: -87.89 } },
      ] });
    }
    if (u.includes('/v1/products')) {
      assert.match(u, /filter\.locationId=53100002/, 'products are asked for at the Pick ’n Save store');
      return json({ data: [
        { productId: '1', description: 'Kroger Salted Butter Sticks', brand: 'Kroger', productPageURI: '/p/kroger-salted-butter/1', items: [{ size: '16 oz', soldBy: 'UNIT', price: { regular: 4.99, promo: 3.99 } }], categories: ['Dairy'] },
        { productId: '2', description: 'Land O Lakes Butter', brand: 'Land O Lakes', items: [{ size: '1 lb', soldBy: 'UNIT', price: { regular: 5.49, promo: 0 } }] },
      ] });
    }
    throw new Error(`unexpected request ${u}`);
  };
  try {
    const r = await searchStore('picknsave', 'butter', await accepted(ctx('53222', KEYS)), { fresh: true });
    assert.equal(r.status, 'ok', r.error || r.message);
    assert.ok(seen.every((u) => /api\.kroger\.com|zippopotam/.test(u)), `left the Kroger API: ${seen}`);
    const [k, lol] = r.items;
    assert.equal(k.priceBasis, 'shelf');
    assert.equal(k.price, 3.99);
    assert.equal(k.regularPrice, 4.99);
    assert.equal(k.promo, 'Card price');
    assert.match(k.url, /^https:\/\/www\.picknsave\.com\//, `linked to ${k.url}`);
    assert.equal(lol.price, 5.49);
    assert.equal(lol.regularPrice, null);
    assert.equal(r.location.name, "Pick 'n Save");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('control: banner matching compares letters only, either way round', () => {
  assert.ok(sameBanner('PICKNSAVE', 'PICK_N_SAVE'));
  assert.ok(sameBanner('FRED', 'FRED_MEYER'));
  assert.ok(!sameBanner('MARIANOS', 'PICK_N_SAVE'));
  assert.equal(siteFor('METRO_MARKET'), 'https://www.metromarket.net');
});
