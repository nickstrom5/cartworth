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
  for (let i = 0; i < 700; i++) if (admitCold(req('10.0.0.1'), ['www.instacart.com'], t)) ok += 1;
  assert.equal(ok, 600);
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

// The security review: /api/directory, /api/locations, weekly ads and deal details reached retailers
// without ever asking the guard, so walking ZIPs could fill a store's queue and turn every other
// visitor's searches "busy". The check now sits where every outbound request passes.
import { request, requestScope, unscoped } from '../src/http.js';

test('DEFECT: any outbound request made for a visitor is refused when they are over budget, before it leaves', async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return new Response('{}', { status: 200 }); };
  try {
    await assert.rejects(requestScope.run({ admit: () => false }, () => request('https://backflipp.wishabi.com/flipp/flyers?postal_code=60618')), (e) => e.busy === true);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('control: shared background work and requests outside any visitor are not charged', async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return new Response('{}', { status: 200 }); };
  try {
    await requestScope.run({ admit: () => false }, () => unscoped(() => request('https://backflipp.wishabi.com/flipp/flyers/1')));
    await request('https://backflipp.wishabi.com/flipp/flyers/2');
    assert.equal(fetched, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// The security review: the limiter's idea of "one visitor" could be dodged.
import { clientKey } from '../src/guard.js';
test('DEFECT: a forged CF-Connecting-IP is ignored unless the server is behind Cloudflare', () => {
  process.env.BASKET_TRUST_PROXY = '1';
  delete process.env.BASKET_TRUST_CF;
  try {
    const r = { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7' }, socket: { remoteAddress: '10.0.0.9' } };
    assert.equal(clientKey(r), '198.51.100.7');
    process.env.BASKET_TRUST_CF = '1';
    assert.equal(clientKey(r), '203.0.113.9');
  } finally {
    delete process.env.BASKET_TRUST_PROXY;
    delete process.env.BASKET_TRUST_CF;
  }
});

test('DEFECT: every address in one IPv6 /64 is one visitor', () => {
  const k = (ip) => clientKey({ headers: {}, socket: { remoteAddress: ip } });
  assert.equal(k('2001:db8:1:2::1'), k('2001:db8:1:2:ffff:ffff:ffff:ffff'));
  assert.notEqual(k('2001:db8:1:2::1'), k('2001:db8:1:3::1'));
  assert.equal(k('::ffff:192.0.2.1'), '192.0.2.1');
});

// The security review: request() re-sent the same headers and cookie jar on every redirect hop, to
// any host, including private addresses.
import { CookieJar } from '../src/http.js';
test('DEFECT: a redirect to another site drops the Authorization header and the cookies', async () => {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (u, init) => {
    seen.push({ u: String(u), auth: init.headers.authorization, cookie: init.headers.cookie });
    if (seen.length === 1) return new Response('', { status: 302, headers: { location: 'https://cdn.example.org/next' } });
    return new Response('{}', { status: 200 });
  };
  try {
    const jar = new CookieJar();
    jar.cookies.set('session', 'secret-session');
    await request('https://api.kroger.com/v1/redir-test', { headers: { authorization: 'Bearer secret' }, jar });
    assert.equal(seen[0].auth, 'Bearer secret');
    assert.equal(seen[1].u, 'https://cdn.example.org/next');
    assert.equal(seen[1].auth, undefined);
    assert.equal(seen[1].cookie, undefined);
  } finally {
    globalThis.fetch = real;
  }
});

test('DEFECT: a redirect to a private address or plain http is refused', async () => {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }) : new Response('{}'));
  try {
    await assert.rejects(request('https://backflipp.wishabi.com/flipp/redir-test'), /Refused a redirect/);
    assert.equal(n, 1, 'the private address was never asked');
  } finally {
    globalThis.fetch = real;
  }
});

// The security review: size regexes backtracked on long digit runs (2,000 digits took ~30 s).
import { parseSize, sizeFromName } from '../shared/units.js';
test('DEFECT: a long run of digits in a size or product name is parsed quickly', () => {
  const t = Date.now();
  parseSize('1'.repeat(2000));
  sizeFromName('1'.repeat(2000));
  assert.ok(Date.now() - t < 500, `took ${Date.now() - t} ms`);
  assert.equal(parseSize('12 x 16.9 fl oz').base, 202.8, 'control: real sizes parse as before');
});
