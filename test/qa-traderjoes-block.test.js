// QA: Trader Joe's refuses this server (Akamai "Access Denied", HTTP 403, from cloud addresses).
// The owner's rule is never to work around bot protection, so a refusal must stop the asking and
// tell the shopper plainly, not fail with "retry" and ask again on every search. And a ZIP with no
// Trader Joe's must not be priced from some other store (the old store-701 fallback).
//
// Drives the real adapter against a stubbed fetch; nothing touches the network.
// Run: BASKET_DATA_DIR=<scratch> node --test test/qa-traderjoes-block.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

const tj = await import('../src/adapters/traderjoes.js');
const { cached, invalidate, DAY } = await import('../src/cache.js');

function stub(respond) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const host = new URL(url).host;
    calls.push(host);
    const r = respond(host);
    return new Response(r.body ?? '{}', { status: r.status ?? 200, headers: { 'content-type': r.type || 'application/json' } });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const LOCATOR = JSON.stringify({ response: { collection: [{ clientkey: '690', name: 'Chicago Lincoln & Grace (690)', address1: '3745 N Lincoln Ave', city: 'Chicago', state: 'IL', latitude: '41.95', longitude: '-87.68' }] } });

test('DEFECT: a 403 from traderjoes.com stops the asking and says why, instead of "failed, retry"', async () => {
  tj._resetBlock();
  invalidate('geo:zip:60618');
  invalidate('tj:store:60618');
  await cached('geo:zip:60618', 365 * DAY, async () => ({ zip: '60618', lat: 41.9464, lng: -87.7042, city: 'Chicago', state: 'IL' }));
  const f = stub((host) => (host === 'alphaapi.brandify.com' ? { body: LOCATOR } : { status: 403, type: 'text/html', body: '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>' }));
  try {
    const first = await tj.search('milk', '60618');
    assert.equal(first.blocked, true);
    assert.deepEqual(first.items, []);
    assert.match(first.message, /iPhone app/);
    const asked = f.calls.filter((h) => h === 'www.traderjoes.com').length;
    assert.equal(asked, 1, 'one refused request');
    const second = await tj.search('eggs', '60618');
    assert.equal(second.blocked, true);
    assert.equal(f.calls.filter((h) => h === 'www.traderjoes.com').length, asked, 'asked again after being refused');
  } finally {
    f.restore();
    tj._resetBlock();
  }
});

test('DEFECT: a ZIP with no Trader Joe’s is not priced from another store', async () => {
  tj._resetBlock();
  invalidate('tj:store:99723');
  const f = stub((host) => (host === 'alphaapi.brandify.com' ? { body: JSON.stringify({ response: { collection: [] } }) } : { body: '{"data":{"products":{"items":[{"sku":"1","name":"Milk","price_range":{"minimum_price":{"final_price":{"value":3.49}}}}]}}}' }));
  try {
    const r = await tj.search('milk', '99723');
    assert.deepEqual(r.items, []);
    assert.equal(f.calls.includes('www.traderjoes.com'), false, 'searched a store that does not serve this ZIP');
  } finally {
    f.restore();
  }
});
