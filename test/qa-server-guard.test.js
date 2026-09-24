// QA: protecting the retailers (and every other visitor) from one heavy visitor, before the web
// app is public. The per-IP request budget counted a cached search the same as one that asks 20
// store sites; nothing limited NEW lookups, and nothing stopped one visitor's searches from queueing
// everyone else's behind them until Instacart answered 429, which stops that store for everybody.
//
// Nothing here touches the network: the lookups that would reach a retailer are refused before
// they are made, and the tests prove no request was attempted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { admitCold } from '../src/guard.js';
import { searchStore, sourceFor, cacheKey } from '../src/search.js';
import { cached } from '../src/cache.js';
import { contextFrom } from '../src/context.js';

const req = (ip) => ({ headers: {}, socket: { remoteAddress: ip } });

test('DEFECT: a visitor who has spent their new-lookup budget is refused further new lookups', () => {
  const t = Date.now();
  let ok = 0;
  for (let i = 0; i < 300; i++) if (admitCold(req('10.0.0.1'), ['www.instacart.com'], t)) ok += 1;
  assert.equal(ok, 240);
  assert.equal(admitCold(req('10.0.0.2'), ['www.instacart.com'], t), true, 'another visitor is unaffected');
  assert.equal(admitCold(req('10.0.0.1'), ['www.instacart.com'], t + 11 * 60_000), true, 'the budget refills');
});

test('DEFECT: when a store already has a long queue, new lookups there are shed for everyone', () => {
  const backlog = (h) => (h === 'www.instacart.com' ? 40 : 0);
  assert.equal(admitCold(req('10.0.0.3'), ['www.instacart.com'], Date.now(), backlog), false);
  assert.equal(admitCold(req('10.0.0.3'), ['www.wholefoodsmarket.com'], Date.now(), backlog), true, 'other stores still answer');
});

const ctx = (admit) => {
  const c = contextFrom(new URL('http://x/api/search?zip=60618&stores=aldi&q=guardtest'));
  Object.defineProperty(c, 'admitCold', { value: admit, enumerable: false });
  return c;
};

test('DEFECT: a refused lookup with nothing saved says the store is busy, and asks no one', async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; throw new Error('no network in tests'); };
  try {
    const r = await searchStore('aldi', 'guardtest never searched', ctx(() => false));
    assert.equal(r.status, 'busy');
    assert.match(r.message, /busy/);
    assert.equal(fetched, 0, 'a refused lookup must not reach the retailer');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('DEFECT: a refused lookup with saved prices serves them, marked stale', async () => {
  const c = ctx(() => false);
  const key = cacheKey('aldi', sourceFor('aldi', c), '60618', 'guardtest saved');
  await cached(key, 1, async () => ({ items: [{ id: 'x', storeId: 'aldi', name: 'Saved Milk', price: 2.5, unit: {} }], location: { name: 'ALDI', distance: 1 } }));
  await new Promise((r) => setTimeout(r, 5)); // expired: no longer a fresh cache hit
  const r = await searchStore('aldi', 'guardtest saved', c);
  assert.equal(r.status, 'ok');
  assert.equal(r.items[0].name, 'Saved Milk');
  assert.match(r.stale, /busy/);
});

test('control: a cached answer is served without asking the guard at all', async () => {
  let asked = 0;
  const c = ctx(() => { asked += 1; return false; });
  const key = cacheKey('aldi', sourceFor('aldi', c), '60618', 'guardtest fresh');
  await cached(key, 60_000, async () => ({ items: [{ id: 'y', storeId: 'aldi', name: 'Fresh Eggs', price: 3, unit: {} }], location: { name: 'ALDI', distance: 1 } }));
  const r = await searchStore('aldi', 'guardtest fresh', c);
  assert.equal(r.status, 'ok');
  assert.equal(asked, 0, 'a cache hit costs the retailer nothing, so it costs the visitor nothing');
});
