// Accessibility: axe-core (test/vendor/axe.min.js, MPL-2.0, test-only) on every screen of the web app,
// at a desktop and a phone size and in the dark theme, against WCAG 2.2 A/AA and axe's best practices.
//
// Launch review, 24 Sep 2026: four rules failed and were fixed — the weekly-ad picture was a button
// with no name, links inside muted text were told apart by colour alone (1.05:1 against their
// text), Compare had no h1, and Sales and List skipped a heading level. Zero violations since.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SKIP, startAppServer, launchBrowser, openApp, seedStorage } from './helpers/browser.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/app-behaviour.json', import.meta.url), 'utf8'));
const AXE = fs.readFileSync(new URL('./vendor/axe.min.js', import.meta.url), 'utf8');
const DAY = 86400e3;

const api = {
  'GET /api/state': { version: 2, app: 'cartworth', stateless: true, catalog: { storeCount: 119, coreStoreIds: [], stores: [] }, defaults: {}, limits: {}, counts: { products: 0, observations: 0 }, health: {} },
  'GET /api/directory': fx.directory,
  'GET /api/locations': {},
  'GET /api/deals': { week: 'current', deals: [{ id: 'd1', source: 'flipp', flippId: 1, storeId: fx.stores[0], name: 'Dark Roast Coffee', price: 6.99, priceText: '$6.99', enriched: true, category: 'Beverages', week: 'current' }], flyers: [], errors: [] },
  'GET /api/search': (req, url) => {
    const q = url.searchParams.get('q');
    const asked = (url.searchParams.get('stores') || '').split(',').filter(Boolean);
    const results = fx.search[q] || [];
    const events = [['start', { query: q, stores: asked, zip: fx.zip }]];
    for (const id of asked) events.push(['store', results.find((r) => r.storeId === id) || { storeId: id, status: 'empty', items: [] }]);
    events.push(['ads', { deals: [] }], ['done', { ms: 5 }]);
    return { sse: events };
  },
  'GET /api/history/*': { series: [5.49, 5.29].map((price, i) => ({ t: Date.now() - (2 - i) * DAY, price, onSale: false, regular: null, promo: null })), locations: 1, locationsExact: true, mixed: false },
  'POST /api/list/optimize': fx.plan,
};
const STORAGE = {
  ...seedStorage({ zip: fx.zip, stores: fx.stores, list: [{ id: 'a', text: 'brown sugar', done: false }] }),
  'cartworth:v1:watches': JSON.stringify([{ id: 'w1', query: 'brown sugar', label: 'Brown sugar', dim: 'weight', target: null }]),
};
const VIEWS = [['onboarding', '#/', {}], ['compare', '#/compare?q=brown%20sugar', STORAGE], ['sales', '#/sales', STORAGE], ['watchlist', '#/watch', STORAGE], ['list', '#/list', STORAGE], ['settings', '#/settings', STORAGE]];

let srv;
let browser;
let page;
before(async () => {
  if (SKIP) return;
  srv = await startAppServer({ api });
  browser = await launchBrowser();
  page = browser.page;
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

for (const [w, h, dark] of [[1280, 900, false], [390, 844, false], [390, 844, true]]) {
  for (const [name, hash, storage] of VIEWS) {
    test(`axe: ${name} at ${w}px${dark ? ', dark' : ''} has no WCAG 2.2 AA or best-practice violations`, { skip: SKIP }, async () => {
      await page.viewport(w, h, { dark });
      await openApp(page, srv.origin, { storage: dark ? { ...storage, 'cartworth:v1:pref:theme': JSON.stringify('dark') } : storage, hash });
      await page.waitFor(`!!document.querySelector('main, .onboard') && !document.querySelector('.skeleton')`, { what: `${name} rendered` });
      await new Promise((r) => setTimeout(r, 400));
      await page.eval(`${AXE}; true`);
      const violations = await page.eval(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })
        .then((r) => r.violations.map((v) => v.impact + ' ' + v.id + ': ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')))`);
      assert.deepEqual(violations, []);
    });
  }
}
