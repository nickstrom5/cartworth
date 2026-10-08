// The first screen ships as static HTML in public/index.html, so a first-time visitor sees it before
// the app's ~25 modules arrive (Lighthouse, 7 Oct 2026: 84% of a 3.4 s mobile LCP was waiting for
// them). That copy must stay exactly what Onboarding renders, or the swap moves the page; and a
// returning visitor, who goes straight to their stores, must never see it.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SKIP, startAppServer, launchBrowser, openApp, seedStorage } from './helpers/browser.js';

const INDEX = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const api = { 'GET /api/state': { version: 2, app: 'cartworth', stateless: true, catalog: { storeCount: 0, coreStoreIds: [], stores: [] }, defaults: {}, limits: {}, counts: { products: 0, observations: 0 }, health: {} } };
// What may differ: the static field is disabled until the app is live, the live one has autofocus.
const norm = (h) => h.replace(/<input([^>]*) disabled=""/, '<input$1').replace(/ autofocus=""/g, '').replace(/ class=""/g, '').replace(/\s+/g, ' ').trim();

let srv;
let browser;
before(async () => {
  if (SKIP) return;
  srv = await startAppServer({ api });
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

test('index.html carries the first screen, and its ZIP field is disabled until the app is live', () => {
  const main = INDEX.match(/<main class="shell-new">([\s\S]*?)<\/main>/);
  assert.ok(main, 'no static first screen in index.html');
  assert.match(main[1], /<h1>Find the best grocery prices near you<\/h1>/);
  assert.match(main[1], /<input class="input" disabled=""/);
  assert.doesNotMatch(INDEX, /<script>(?!<\/script>)/, 'no inline script (the host CSP is script-src self)');
});

test('the static first screen is exactly what the app renders for a first visit', { skip: SKIP }, async () => {
  const { page } = browser;
  await page.viewport(390, 844);
  await openApp(page, srv.origin, { storage: {}, hash: '' });
  await page.waitFor(`!!document.querySelector('.onboard h1') && !document.querySelector('.shell-new')`, { what: 'live onboarding' });
  const live = await page.eval(`document.querySelector('main').innerHTML`);
  const shipped = INDEX.match(/<main class="shell-new">([\s\S]*?)<\/main>/)[1];
  assert.equal(norm(shipped), norm(live));
});

test('a returning visitor never sees the welcome screen, on any painted frame', { skip: SKIP }, async () => {
  const { page } = browser;
  await page.viewport(390, 844);
  // A same-origin page first, so the saved ZIP is in place before index.html is parsed.
  await openApp(page, srv.origin, { storage: seedStorage({ zip: '60618', stores: ['aldi'] }), hash: '#/compare' });
  await page.waitFor(`!!document.querySelector('main') && !document.querySelector('.shell-new, .shell-returning')`, { what: 'the app took over' });
  assert.equal(await page.eval(`'returning' in document.documentElement.dataset`), true, 'theme-boot.js marks a returning visitor');
  assert.equal(await page.eval(`!!document.querySelector('.onboard')`), false, 'no onboarding for a saved ZIP');
});

test('app.css hides the welcome for a returning visitor and shows "Loading" instead', () => {
  const css = fs.readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.shell-returning,\s*\[data-returning\] \.shell-new \{\s*display: none;/);
  assert.match(css, /\[data-returning\] \.shell-returning \{\s*display: block;/);
  const boot = fs.readFileSync(new URL('../public/js/theme-boot.js', import.meta.url), 'utf8');
  assert.match(boot, /cartworth:v1:settings[\s\S]*\.zip\) document\.documentElement\.dataset\.returning/);
});
