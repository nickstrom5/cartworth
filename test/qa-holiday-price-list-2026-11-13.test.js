// The owner, 13 Nov 2026: after "Add all to my list" on the Thanksgiving card "I expected at least a
// button to easily see the pricing of those items". The card's only answer was a toast whose "View
// list" vanished in four seconds, and the list then still waited for "Plan my trip". Now the card
// turns into "See prices for my list (N items)", which opens the list and plans it at once
// (priceList), with what it is doing shown in the plan panel while it runs (PlanningNote).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, startAppServer, launchBrowser, openApp, seedStorage } from './helpers/browser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/app-behaviour.json'), 'utf8'));
// 13 Nov 2026: Thanksgiving is 13 days away, so its card is on the Compare screen.
const NOW = Date.parse('2026-11-13T12:00:00-06:00');

let srv;
let browser;
let optimizeCalls = 0;
let releasePlan;
before(async () => {
  if (SKIP) return;
  srv = await startAppServer({
    api: {
      'GET /api/state': { version: 2, app: 'cartworth', stateless: true, catalog: { storeCount: 119, coreStoreIds: [], stores: [] }, defaults: {}, limits: {}, counts: { products: 0, observations: 0 }, health: {} },
      'GET /api/directory': fx.directory,
      'GET /api/locations': {},
      'GET /api/deals': { deals: [], flyers: [] },
      // Held until the test has looked at the panel, so "planning" can be seen.
      'POST /api/list/optimize': async () => {
        optimizeCalls += 1;
        await new Promise((r) => (releasePlan = r));
        return fx.plan;
      },
    },
  });
  browser = await launchBrowser();
  await browser.page.initScript(`(() => { const N = ${NOW}; const D = Date; const off = N - D.now();
    class F extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }
    globalThis.Date = F; })();`);
});
after(async () => {
  releasePlan?.();
  await browser?.close();
  await srv?.close();
});

test('DEFECT: after "Add all to my list" the holiday card offers the prices, and that opens the list planning', { skip: SKIP }, async () => {
  const page = browser.page;
  await page.viewport(1280, 900);
  await openApp(page, srv.origin, { storage: seedStorage({ zip: fx.zip, stores: fx.stores, list: [] }), hash: '#/compare' });
  await page.waitFor(`!!document.querySelector('[aria-label="Add all Thanksgiving items to my list"]')`, { what: 'the Thanksgiving card' });
  await page.eval(`document.querySelector('[aria-label="Add all Thanksgiving items to my list"]').click(); true`);
  await page.waitFor(`!!document.querySelector('[data-testid=price-occasion]')`, { what: 'the See prices button', timeout: 3000 });
  const label = await page.eval(`document.querySelector('[data-testid=price-occasion]').textContent.trim()`);
  assert.match(label, /^See prices for my list \(\d+ items\)$/);

  await page.eval(`document.querySelector('[data-testid=price-occasion]').click(); true`);
  await page.waitFor(`location.hash === '#/list' && !!document.querySelector('[data-testid=planning]')`, { what: 'the list, planning', timeout: 5000 });
  const note = await page.eval(`document.querySelector('[data-testid=planning]').textContent`);
  assert.match(note, /Pricing your list/);
  assert.match(note, /Asking \d+ stores? about \d+ items/);
  assert.equal(optimizeCalls, 1, 'the plan started without pressing Plan my trip');

  releasePlan();
  await page.waitFor(`!document.querySelector('[data-testid=planning]') && !!document.querySelector('.mtable')`, { what: 'the trip plan', timeout: 5000 });
});

test('control: the card offers "Add all" again once its items are no longer all on the list', { skip: SKIP }, async () => {
  const page = browser.page;
  await openApp(page, srv.origin, { storage: seedStorage({ zip: fx.zip, stores: fx.stores, list: [{ id: 'a', text: 'whole turkey', qty: 1, pinned: null, done: false, addedAt: NOW }] }), hash: '#/compare' });
  await page.waitFor(`!!document.querySelector('[aria-label="Add all Thanksgiving items to my list"]')`, { what: 'the Thanksgiving card' });
  assert.equal(await page.eval(`!!document.querySelector('[data-testid=price-occasion]')`), false);
});
