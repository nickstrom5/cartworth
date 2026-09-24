// QA: what the app actually DOES, in a real browser.
//
// qa-app-a11y.test.js checks what can be checked from the source (contrast maths, tokens). Three
// of its "behavioural" tests were source greps, and a verifier proved they pinned nothing:
// commenting out `el.inert = true`, the setDocumentTitle() call, or the footnote's onlineStores
// clause left all 31 green. Those three live here now as behaviour tests, alongside the rest of
// the round-2 web fixes, each asserting on what a shopper would see or be able to do:
//
//   DEFECT 12  the product dialog makes the page behind it inert and keeps Tab inside
//   DEFECT 34  each route gives the tab its own title
//   DEFECT 10  the trip footnote names the online and national stores in THIS plan
//   W1         a link to Instacart says Instacart, not the store's name (results, sheet, trip, watchlist)
//   W2         the price-history chart labels its own peak
//   W2b        the watchlist chart never labels a gridline with a price it is not at
//   W3         320 / 375 / 390 px: no sideways scroll and no clipped price, any Show setting, both themes
//   W5         online prices say where they come from — on the row, and in words on the product sheet
//              (the owner's "Jewel butter $7.99 here, less in Jewel's app" report)
//   W6         the page boots under the static host's own CSP, unmodified (no inline script at all)
//   W10        every trip-plan cost states the quantity it is for
//   W11        a chain-wide (national) price is not captioned with a faraway store's address
//
// The page is the shipped public/ code in headless Chrome (test/helpers/browser.js). /api is
// answered from test/fixtures/app-behaviour.json — real responses captured at ZIP 53211 and a real
// 60148 trip plan — so no test here can reach a retailer. Without Chrome the tests are SKIPPED,
// never passed.
//
// Run: node --test test/
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, startAppServer, launchBrowser, openApp, seedStorage } from './helpers/browser.js';
import { STORE_BY_ID } from '../shared/stores.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/app-behaviour.json'), 'utf8'));

// A price history whose peak the round-1 axis left above its top label (ticks 5.5 and 6 only).
const DAY = 86400e3;
const HISTORY = [5.46, 5.55, 5.79, 6.05, 5.99, 5.49].map((price, i) => ({ t: Date.now() - (6 - i) * 3 * DAY, price, onSale: false, regular: null, promo: null }));

function api(overrides = {}) {
  return {
    'GET /api/state': { version: 2, app: 'cartworth', stateless: true, catalog: { storeCount: 119, coreStoreIds: [], stores: [] }, defaults: {}, limits: {}, counts: { products: 0, observations: 0 }, health: {} },
    'GET /api/directory': fx.directory,
    'GET /api/locations': {},
    'GET /api/deals': { deals: [], flyers: [] },
    'GET /api/search': (req, url) => {
      const q = url.searchParams.get('q');
      const asked = (url.searchParams.get('stores') || '').split(',').filter(Boolean);
      const results = fx.search[q] || [];
      const events = [['start', { query: q, stores: asked, zip: fx.zip }]];
      for (const id of asked) events.push(['store', results.find((r) => r.storeId === id) || { storeId: id, status: 'empty', items: [] }]);
      events.push(['ads', { deals: [] }], ['done', { ms: 5 }]);
      return { sse: events };
    },
    'GET /api/history/*': { series: HISTORY, locations: 1, locationsExact: true, mixed: false },
    'POST /api/list/optimize': fx.plan,
    ...overrides,
  };
}

let srv;
let browser;
let page;
before(async () => {
  if (SKIP) return;
  srv = await startAppServer({ api: api() });
  browser = await launchBrowser();
  page = browser.page;
});
after(async () => {
  await browser?.close();
  await srv?.close();
});
// Each test starts from a browser that answers. A hung renderer (seen only under extreme machine
// load) must fail at most the test it hung in, not every test after it.
beforeEach(async () => {
  if (SKIP || (await page.responsive())) return;
  await browser.close();
  browser = await launchBrowser();
  page = browser.page;
});

const STORAGE = () => seedStorage({ zip: fx.zip, stores: fx.stores });

/** Run a search through the app's own search box route and wait for every store to answer. */
async function search(q, { width = 1280, height = 900, dark = false } = {}) {
  await page.viewport(width, height, { dark });
  await openApp(page, srv.origin, { storage: STORAGE(), hash: `#/compare?q=${encodeURIComponent(q)}` });
  await page.waitFor(`document.querySelectorAll('.prow').length > 0 && !document.querySelector('.status-strip .spinner')`, { what: `results for ${q}` });
}

const clickText = (selector, text) =>
  page.eval(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);

/** Open the product sheet for the first row from `storeName`. */
async function openProductFrom(storeName) {
  const ok = await page.eval(`(() => {
    const row = [...document.querySelectorAll('.prow')].find((r) => r.querySelector('.store-tag')?.textContent.trim() === ${JSON.stringify(storeName)});
    if (!row) return false;
    row.querySelector('.pname').click();
    return true;
  })()`);
  assert.ok(ok, `no result row from ${storeName}`);
  // Wait for the dialog to take focus, not just to exist: its Escape/Tab handler and the inert
  // page are set up by an effect that runs just after the dialog paints, and a key pressed in that
  // gap fell on nothing (the W1 test timed out closing its second dialog on exactly that race).
  await page.waitFor(`!!document.querySelector('.modal')?.contains(document.activeElement)`, { what: 'the product dialog to open and take focus' });
}
async function closeDialog() {
  await page.key('Escape');
  await page.waitFor(`!document.querySelector('.modal')`, { what: 'the dialog to close' });
}

// ---------------------------------------------------------------------------
// DEFECT 12: the modal is modal.
// ---------------------------------------------------------------------------
test('DEFECT 12: while the product dialog is open the page behind it is inert, and Tab never leaves the dialog', { skip: SKIP }, async () => {
  await search('brown sugar');
  await openProductFrom('ALDI');
  // The dialog marks the page inert from an effect, which runs just after the dialog paints.
  await page.waitFor(`document.querySelector('.topbar')?.inert === true`, { what: 'the dialog to take over the page', timeout: 3000 }).catch(() => {});
  const inert = await page.eval(`(() => {
    const backdrop = document.querySelector('.backdrop');
    return [...backdrop.parentElement.children].filter((el) => el !== backdrop).map((el) => ({ cls: el.className || el.tagName, inert: el.inert }));
  })()`);
  const behind = inert.filter((e) => !String(e.cls).includes('toasts'));
  assert.ok(behind.length >= 2, `expected the header and main behind the dialog, found ${JSON.stringify(inert)}`);
  for (const e of behind) assert.equal(e.inert, true, `"${e.cls}" behind the dialog is not inert — a screen reader can still walk into it`);

  // Real Tab and Shift+Tab presses, dispatched by the browser: focus must stay in the dialog.
  for (const shift of [false, true]) {
    for (let i = 0; i < 14; i++) {
      await page.key('Tab', { shift });
      const inside = await page.eval(`document.querySelector('.modal').contains(document.activeElement)`);
      assert.ok(inside, `${shift ? 'Shift+' : ''}Tab #${i + 1} moved focus out of the dialog to ${await page.eval(`document.activeElement.outerHTML.slice(0, 80)`)}`);
    }
  }
  await closeDialog();
  const after = await page.eval(`[...document.querySelector('#app').children].some((el) => el.inert)`);
  assert.equal(after, false, 'closing the dialog gives the page back');
});

// ---------------------------------------------------------------------------
// DEFECT 34: each route titles the tab.
// ---------------------------------------------------------------------------
test('DEFECT 34: each route and each search gives the document its own title (SC 2.4.2)', { skip: SKIP }, async () => {
  await search('brown sugar');
  assert.equal(await page.eval('document.title'), 'brown sugar — Cartworth');
  for (const [hash, title] of [['#/settings', 'Settings — Cartworth'], ['#/list', 'List — Cartworth'], ['#/watch', 'Watchlist — Cartworth'], ['#/sales', 'Sales — Cartworth']]) {
    await page.eval(`location.hash = ${JSON.stringify(hash)}`);
    await page.waitFor(`document.title === ${JSON.stringify(title)}`, { what: `title "${title}" on ${hash}`, timeout: 4000 });
  }
});

// ---------------------------------------------------------------------------
// W1: link labels name the destination.
// ---------------------------------------------------------------------------
test('DEFECT (W1): a link that goes to Instacart says "Instacart", never the store’s name', { skip: SKIP }, async () => {
  await search('brown sugar');
  const links = await page.eval(`[...document.querySelectorAll('.prow .pactions a[href]')].map((a) => ({ host: new URL(a.href).hostname, title: a.title, store: a.closest('.prow').querySelector('.store-tag')?.textContent.trim() }))`);
  assert.ok(links.some((l) => /instacart\.com$/.test(l.host)), 'fixture has Instacart links');
  for (const l of links) {
    if (/(^|\.)instacart\.com$/.test(l.host)) assert.equal(l.title, 'Open on Instacart', `${l.store}'s row link goes to ${l.host} but says "${l.title}"`);
    else assert.equal(l.title, `Open at ${l.store}`, `${l.store}'s own site (${l.host}) is labelled "${l.title}"`);
  }
  await openProductFrom('Walmart');
  const walmart = await page.eval(`(() => { const a = document.querySelector('.modal a.btn-primary'); return { text: a.textContent.trim(), host: new URL(a.href).hostname }; })()`);
  assert.equal(walmart.host, 'www.instacart.com');
  assert.equal(walmart.text, 'Open on Instacart', `the Walmart sheet's button goes to Instacart but reads "${walmart.text}"`);
  await closeDialog();
  await openProductFrom('ALDI');
  const aldi = await page.eval(`(() => { const a = document.querySelector('.modal a.btn-primary'); return { text: a.textContent.trim(), host: new URL(a.href).hostname }; })()`);
  assert.equal(aldi.host, 'www.aldi.us');
  assert.equal(aldi.text, 'Open at ALDI', 'control: a store’s own site is still named for the store');
  await closeDialog();
});

// ---------------------------------------------------------------------------
// W5: provenance in the words, not just the badge.
// ---------------------------------------------------------------------------
test('DEFECT (W5): an online or national price says it came from Instacart', { skip: SKIP }, async () => {
  await search('brown sugar');
  // Every row whose price is not a shelf price, read from the fixture rather than from the badges,
  // so a row that lost its badge altogether cannot slip past.
  const expected = fx.search['brown sugar'].flatMap((r) => r.items.filter((i) => i.priceBasis !== 'shelf').map((i) => `${STORE_BY_ID[r.storeId].short}|${i.name}`));
  const rows = await page.eval(`[...document.querySelectorAll('.prow')].map((r) => ({ name: r.querySelector('.store-tag')?.textContent.trim() + '|' + r.querySelector('.pname').textContent.trim(), badges: [...r.querySelectorAll('.pmeta .badge-outline')].map((b) => [b.textContent.trim(), b.title]) }))`);
  const nonShelf = rows.filter((r) => expected.includes(r.name));
  assert.ok(nonShelf.length >= 6, `the fixture's online and national rows are rendered (${nonShelf.length})`);
  for (const r of nonShelf) {
    const basis = r.badges.find(([t]) => /^(Instacart|national)$/.test(t));
    assert.ok(basis, `"${r.name}" is not a shelf price but its row carries no basis badge: ${JSON.stringify(r.badges)}`);
    assert.match(basis[1], /Instacart/, `the "${basis[0]}" badge's explanation does not say where the price is from: "${basis[1]}"`);
  }
  // On a phone the title never shows, so an online price must say Instacart in the visible text.
  assert.ok(nonShelf.some((r) => r.badges.some(([t]) => t === 'Instacart')), 'an online row says "Instacart" on its face');
  assert.ok(nonShelf.some((r) => r.badges.some(([t]) => t === 'national')), 'control: the national row keeps its own word');

  // The product sheet says it in a sentence, quoting Instacart's own note for that storefront.
  await openProductFrom('Pick ’n Save');
  const online = await page.eval(`document.querySelector('.modal .provenance')?.textContent.trim() || null`);
  assert.match(online || '', /Pick ’n Save’s price on Instacart/, `the online sheet says: ${online}`);
  assert.match(online, /“Prices vary from in-store\.”/, 'and quotes the storefront’s own disclosure');
  await closeDialog();
  await openProductFrom('Walmart');
  const national = await page.eval(`document.querySelector('.modal .provenance')?.textContent.trim() || null`);
  assert.match(national || '', /Instacart’s chain-wide price for Walmart/, `the national sheet says: ${national}`);
  assert.doesNotMatch(national, /No markups/, 'the far-away storefront’s note is not presented as this shopper’s');
  await closeDialog();
  await openProductFrom('ALDI');
  assert.equal(await page.eval(`document.querySelector('.modal .provenance')`), null, 'control: a shelf price carries no caveat');
  await closeDialog();
  await page.eval(`location.hash = '#/settings'`);
  const row = `[...document.querySelectorAll('.srow')].find((r) => /Meijer/.test(r.textContent) && r.querySelector('.muted span[title]'))`;
  await page.waitFor(`!!${row}`, { what: 'Meijer in the settings store list' });
  const meijer = await page.eval(`(() => { const s = ${row}.querySelector('.muted span[title]'); return { text: s.textContent.trim(), title: s.title }; })()`);
  assert.match(meijer.text, /Instacart/, `Settings calls Meijer’s prices "${meijer.text}"`);
  assert.match(meijer.title, /Instacart/);
});

// ---------------------------------------------------------------------------
// W11: a chain-wide price has no "near you" store.
// ---------------------------------------------------------------------------
test('DEFECT (W11): a national-basis store is not captioned with the faraway storefront’s address or distance', { skip: SKIP }, async () => {
  await search('brown sugar');
  const strip = await page.eval(`Object.fromEntries([...document.querySelectorAll('.status-strip .sstat')].map((s) => [s.querySelector('b')?.textContent.trim(), s.title]))`);
  // The fixture is the real response: Walmart's canonical storefront is 4893 Lone Tree Way, Antioch, CA.
  assert.ok(fx.search['brown sugar'].find((r) => r.storeId === 'walmart').location.address.includes('Antioch'), 'fixture carries the canonical address');
  // Nothing of the Antioch storefront: not its address, distance, store number or its own note.
  assert.doesNotMatch(strip.Walmart, /Antioch|Lone Tree|mi away|2697|No markups/, `Walmart's status says: "${strip.Walmart}"`);
  assert.match(strip.Walmart, /Chain-wide/);
  assert.match(strip.ALDI, /mi away/, 'control: a real local store still shows its distance');
  assert.match(strip.ALDI, /Milwaukee/, 'control: and its address');

  await clickText('.seg button', 'By store');
  const heads = await page.eval(`[...document.querySelectorAll('.store-card-head')].map((h) => h.textContent.replace(/\\s+/g, ' ').trim())`);
  const walmart = heads.find((h) => h.startsWith('Walmart'));
  const aldi = heads.find((h) => h.startsWith('ALDI'));
  assert.ok(walmart && aldi, `store cards: ${JSON.stringify(heads)}`);
  assert.doesNotMatch(walmart, /\d mi\b/, `the By-store card says "${walmart}"`);
  assert.match(aldi, /\d mi\b/, 'control: a local store’s card keeps its distance');
  await clickText('.seg button', 'All');
});

// ---------------------------------------------------------------------------
// W2: the chart, rendered.
// ---------------------------------------------------------------------------
test('DEFECT (W2): the price-history chart has a labelled gridline at or above its highest price', { skip: SKIP }, async () => {
  await search('brown sugar');
  await openProductFrom('ALDI');
  await page.waitFor(`document.querySelectorAll('.modal svg text[text-anchor="end"]').length >= 2`, { what: 'the history chart' });
  const labels = await page.eval(`[...document.querySelectorAll('.modal svg text[text-anchor="end"]')].map((t) => t.textContent.trim()).filter((l) => /^\\$/.test(l))`);
  const values = labels.map((l) => Number(l.replace(/[$,]/g, ''))).filter(Number.isFinite);
  const peak = Math.max(...HISTORY.map((h) => h.price));
  assert.ok(Math.max(...values) >= peak, `peak $${peak} but the top label is ${labels[labels.length - 1]} (labels ${labels.join(', ')})`);
  assert.ok(Math.min(...values) <= Math.min(...HISTORY.map((h) => h.price)), `the lowest price is below the bottom label (${labels.join(', ')})`);
  await closeDialog();
});

test('DEFECT (W2b): the watchlist’s unit-price chart labels every gridline with the value it is at', { skip: SKIP }, async () => {
  // Three checks of butter at ALDI, $2.3143-$2.3264/lb. Asked for the finest "nice" axis, this
  // range gets half-cent gridlines, and unitPrice prints them to the cent: "$2.31, $2.31, $2.32,
  // $2.33, $2.33" — two gridlines labelled with prices they are not at. (Found while fixing W2:
  // 14% of tight random unit-price series did this.)
  const perLb = [2.3143, 2.3264, 2.3179];
  const watch = {
    id: 'w-butter', query: 'butter', label: 'butter', include: [], exclude: [], dim: 'weight', displayUnit: 'lb', target: null,
    createdAt: Date.now() - 9 * DAY, lastChecked: Date.now(), lastError: null,
    result: {
      dim: 'weight',
      stores: {
        aldi: { name: 'Countryside Creamery Butter', size: '16 oz', price: 2.31, unitPerBase: 2.3143 / 16, priceBasis: 'shelf', url: 'https://www.aldi.us/store/aldi/products/18647723-countryside-creamery-butter-16-oz' },
        meijer: { name: 'Meijer Salted Butter', size: '16 oz', price: 3.49, unitPerBase: 3.49 / 16, priceBasis: 'online', url: 'https://www.instacart.com/products/123-meijer-salted-butter-16-oz?retailerSlug=meijer' },
      },
    },
    points: perLb.map((v, i) => ({ t: Date.now() - (3 - i) * 2 * DAY, storeId: 'aldi', unit: v / 16, name: 'Butter' })),
  };
  await page.viewport(1280, 900);
  await openApp(page, srv.origin, { storage: { ...STORAGE(), 'cartworth:v1:watches': JSON.stringify([watch]) }, hash: '#/watch' });
  await page.waitFor(`[...document.querySelectorAll('.watch-grid button')].some((b) => b.textContent.trim() === 'History')`, { what: 'the watch card' });
  await clickText('.watch-grid button', 'History');
  await page.waitFor(`document.querySelectorAll('.watch-grid svg text[text-anchor="end"]').length >= 2`, { what: 'the watch history chart' });
  const labels = await page.eval(`[...document.querySelectorAll('.watch-grid svg text[text-anchor="end"]')].map((t) => t.textContent.trim()).filter((l) => /^\\$|¢$/.test(l))`);
  const values = labels.map((l) => (l.endsWith('¢') ? Number(l.slice(0, -1)) / 100 : Number(l.slice(1))));
  assert.equal(new Set(labels).size, labels.length, `two gridlines share a label: ${labels.join(', ')}`);
  const steps = values.slice(1).map((v, i) => +(v - values[i]).toFixed(6));
  assert.ok(steps.every((d) => d === steps[0] && d > 0), `the labels are not evenly spaced, so some name a price their gridline is not at: ${labels.join(', ')}`);
  assert.ok(values[values.length - 1] >= Math.max(...perLb) && values[0] <= Math.min(...perLb), `the data is not inside the labelled range: ${labels.join(', ')}`);
  // W1 on this screen too: the product links in the watch card name where they go.
  const links = await page.eval(`[...document.querySelectorAll('.wtable a[href]')].map((a) => [new URL(a.href).hostname, a.title])`);
  assert.deepEqual(links.sort(), [['www.aldi.us', 'Open at ALDI'], ['www.instacart.com', 'Open on Instacart']]);
});

// ---------------------------------------------------------------------------
// W3: reflow at phone widths, and no clipped price anywhere.
// ---------------------------------------------------------------------------
const REFLOW_CHECK = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const bad = [];
  if (de.scrollWidth > vw) bad.push('page scrolls sideways: ' + de.scrollWidth + ' > ' + vw);
  const inScroller = (el) => !!el.closest('.chips.scroll, .mtable-wrap, .ads-strip, .status-strip');
  // A price line whose text is wider than its own box is clipped or spilling, whatever its markup.
  for (const el of document.querySelectorAll('.pkg, .unit-big')) {
    if (!el.getBoundingClientRect().width || inScroller(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) bad.push((el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 40) + '" is wider than its box (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
  }
  // A control label cut to "Close mat…" is the ellipsis safety net in app.css firing: the control
  // no longer fits its row and needs a real fix, not a shorter label nobody chose.
  for (const el of document.querySelectorAll('.seg button')) {
    if (el.getBoundingClientRect().width && el.scrollWidth > el.clientWidth + 0.5) bad.push('control label "' + el.textContent.trim() + '" is cut off');
  }
  for (const el of document.querySelectorAll('.unit-big, .pkg, .pkg .nw, .pkg .was, .hero-value, .bar-val, .plan-total, .tabs .tab')) {
    const r = el.getBoundingClientRect();
    if (!r.width || inScroller(el)) continue;
    const what = (el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 40) + '"';
    if (r.right > vw + 0.5 || r.left < -0.5) bad.push(what + ' runs off the screen (' + r.left.toFixed(1) + '..' + r.right.toFixed(1) + ')');
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (!/(hidden|clip)/.test(getComputedStyle(a).overflowX)) continue;
      const ar = a.getBoundingClientRect();
      if (r.right > ar.right + 0.5 || r.left < ar.left - 0.5) { bad.push(what + ' is cut off by .' + String(a.className).split(' ')[0]); break; }
    }
  }
  return bad;
})()`;

test('DEFECT 16b (W3): at 320, 375 and 390 px nothing scrolls sideways and no price is clipped — every Show setting, both layouts, both themes', { skip: SKIP }, async () => {
  const failures = [];
  for (const dark of [false, true]) {
    for (const width of [320, 375, 390]) {
      await search('whole turkey', { width, height: 700, dark });
      for (const layout of ['All', 'By store']) {
        await clickText('.seg button', layout);
        for (const show of ['Close matches', 'Matches', 'Everything']) {
          await clickText('.seg button', show);
          await page.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
          for (const b of await page.eval(REFLOW_CHECK)) failures.push(`${width}px ${dark ? 'dark' : 'light'} ${layout} / ${show}: ${b}`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 12).join('\n'));
  // The row that overflowed in round 1 must actually be on screen for this to mean anything.
  await clickText('.seg button', 'All');
  await clickText('.seg button', 'Everything');
  assert.ok(await page.eval(`[...document.querySelectorAll('.pkg')].some((p) => /10\\.85\\/pkg/.test(p.textContent))`), 'the $1.69/lb · ~$10.85/pkg row is rendered');
});

// ---------------------------------------------------------------------------
// DEFECT 10 + W10: the trip plan.
// ---------------------------------------------------------------------------
const LIST = fx.plan.items.map((i) => ({ id: i.id, text: i.text, qty: i.qty, done: false, addedAt: Date.now() }));
async function planTrip(planOverride) {
  if (planOverride) {
    await srv.close();
    srv = await startAppServer({ api: api({ 'POST /api/list/optimize': planOverride }) });
  }
  await page.viewport(1280, 900);
  await openApp(page, srv.origin, { storage: seedStorage({ zip: fx.zip, stores: fx.stores, list: LIST }), hash: '#/list' });
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => /Plan my trip/.test(b.textContent))`, { what: 'the Plan my trip button' });
  await page.eval(`[...document.querySelectorAll('button')].find((b) => /Plan my trip/.test(b.textContent)).click()`);
  await page.waitFor(`!!document.querySelector('.footer-note') && !!document.querySelector('.mtable')`, { what: 'the trip plan' });
}

test('DEFECT 10: the trip footnote names the online-priced stores in THIS plan', { skip: SKIP }, async () => {
  await planTrip();
  const note = await page.eval(`document.querySelector('.footer-note').textContent.replace(/\\s+/g, ' ')`);
  assert.match(note, /Online \(Instacart\) prices — Jewel, Mariano’s and Pete’s — can run higher than the shelf\./, note);
  assert.doesNotMatch(note, /publishes one chain-wide price/, 'no national store in this plan, so no national sentence');
});

test('DEFECT 10b: a national-basis column is named in the footnote too', { skip: SKIP }, async () => {
  // The same captured plan with Pete's column relabelled as a chain-wide listing — the only
  // synthetic edit in this file, to reach the footnote's national clause.
  const plan = structuredClone(fx.plan);
  for (const i of plan.items) if (i.perStore.petes) i.perStore.petes.product.priceBasis = 'national';
  try {
    await planTrip(plan);
    const note = await page.eval(`document.querySelector('.footer-note').textContent.replace(/\\s+/g, ' ')`);
    assert.match(note, /Pete’s publishes one chain-wide price rather than your local store’s/, note);
    assert.match(note, /Online \(Instacart\) prices — Jewel and Mariano’s —/, note);
  } finally {
    await srv.close();
    srv = await startAppServer({ api: api() });
  }
});

test('DEFECT (W10): every trip-plan cost states the quantity it is for', { skip: SKIP }, async () => {
  await planTrip();
  // Independently derived from the fixture's reference amounts (base units: oz / fl oz).
  const expected = { turkey: '10 oz', 'cranberry sauce': '14 fl oz', butter: '8 oz', 'chicken broth': '32 fl oz', 'apple cider': '0.5 gal' };
  const rows = await page.eval(`[...document.querySelectorAll('.litem')].map((r) => [r.querySelector('.ltext > div').textContent.trim(), r.querySelector('.ltext').textContent.replace(/\\s+/g, ' ')])`);
  for (const [text, line] of rows) {
    assert.ok(expected[text], `unexpected list row ${text}`);
    assert.match(line, new RegExp(`cheapest: .*\\$\\d+\\.\\d\\d for ${expected[text].replace('.', '\\.')}`), `the list row for ${text} gives a cost without its quantity: "${line}"`);
  }
  const trip = await page.eval(`[...document.querySelectorAll('.trip-store li')].map((li) => [li.querySelector('.grow > div').textContent.trim(), li.querySelector('.num').textContent.replace(/\\s+/g, ' ').trim()])`);
  assert.equal(trip.length, Object.keys(expected).length);
  for (const [text, cost] of trip) assert.match(cost, new RegExp(`^\\$\\d+\\.\\d\\d.*for ${expected[text].replace('.', '\\.')}$`), `where-to-buy line for ${text}: "${cost}"`);
  // W1 again, on this screen: a product link that goes to Instacart does not claim to be the store.
  // The cherry-pick plan buys turkey at Tony's, whose link is an Instacart page.
  await page.eval(`[...document.querySelectorAll('.plan-card')].find((b) => /Cherry-pick/.test(b.textContent)).click()`);
  await page.waitFor(`[...document.querySelectorAll('.trip-store a[href]')].some((a) => /instacart\\.com$/.test(new URL(a.href).hostname))`, { what: 'an Instacart link in the cherry-pick plan' });
  const links = await page.eval(`[...document.querySelectorAll('.trip-store a[href]')].map((a) => ({ host: new URL(a.href).hostname, title: a.title, store: a.closest('.trip-store').querySelector('.trip-store-head').textContent.trim() }))`);
  for (const l of links) {
    if (/instacart\.com$/.test(l.host)) assert.equal(l.title, 'Open on Instacart', `a ${l.store} link to ${l.host} says "${l.title}"`);
    else assert.match(l.title, /^Open at /, `control: ${l.store}'s own site (${l.host}) is named for the store: "${l.title}"`);
  }
  const matrix = await page.eval(`[...document.querySelectorAll('.mtable tbody tr td:first-child')].map((td) => td.textContent.replace(/\\s+/g, ' ').trim())`);
  for (const cell of matrix) {
    const text = Object.keys(expected).find((t) => cell.startsWith(t));
    assert.ok(cell.includes(`(${expected[text]}, a typical size)`), `matrix row "${cell}" does not say the amount was inferred`);
  }
});

// ---------------------------------------------------------------------------
// W6: under the static host's Content-Security-Policy.
// ---------------------------------------------------------------------------
test('DEFECT (W6): the app boots and applies the saved theme under the static host’s own CSP, unmodified', { skip: SKIP }, async () => {
  // The policy exactly as site/_headers ships it: script-src 'self', no 'unsafe-inline', no hash.
  const headers = fs.readFileSync(path.join(ROOT, 'site/_headers'), 'utf8');
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1]?.trim();
  assert.ok(csp && /script-src 'self'/.test(csp) && !/unsafe-inline'[^;]*;?\s*$|script-src[^;]*unsafe-inline/.test(csp), `site/_headers still carries the strict policy this test applies: ${csp}`);
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[0]);
  assert.deepEqual(inline, [], 'index.html carries an inline script, which that policy blocks');
  const cspSrv = await startAppServer({ api: api(), headers: { 'content-security-policy': csp } });
  try {
    await page.viewport(1280, 900);
    const errorsBefore = page.consoleErrors.length;
    await openApp(page, cspSrv.origin, { storage: { ...STORAGE(), 'cartworth:v1:pref:theme': JSON.stringify('dark') }, hash: '#/compare' });
    await page.waitFor(`!document.querySelector('.boot') && !!document.querySelector('.topbar')`, { what: `the app to boot under "${csp}"` });
    assert.equal(await page.eval('document.documentElement.dataset.theme || null'), 'dark', 'the saved dark theme was not applied on load');
    const violations = page.consoleErrors.slice(errorsBefore).filter((e) => /Content Security Policy/i.test(e));
    assert.deepEqual(violations, []);
  } finally {
    await cspSrv.close();
  }
});

test('DEFECT (W6b): the theme a visitor picked is applied again on the next load', { skip: SKIP }, async () => {
  await page.viewport(1280, 900, { dark: false });
  await openApp(page, srv.origin, { storage: STORAGE(), hash: '#/compare' });
  await page.waitFor(`!!document.querySelector('.top-actions button[aria-label^="Theme"]')`, { what: 'the theme toggle' });
  // Click through the real toggle, which is what writes the preference, until it reaches dark
  // (light -> dark since the Sprout default became light).
  for (let i = 0; i < 3 && (await page.eval('document.documentElement.dataset.theme || null')) !== 'dark'; i++) {
    await page.eval(`document.querySelector('.top-actions button[aria-label^="Theme"]').click()`);
  }
  assert.equal(await page.eval('document.documentElement.dataset.theme'), 'dark');
  await page.reload();
  await page.waitFor(`!!document.querySelector('.topbar')`, { what: 'reload' });
  assert.equal(await page.eval('document.documentElement.dataset.theme || null'), 'dark', 'the theme picked before the reload was lost');
});

test('DEFECT (Christmas run): a listing whose size and name disagree says so on the row', { skip: SKIP }, async () => {
  // Jewel's live row for "sparkling cider": the listing says 750 ml, its name and URL say a case of
  // 12, and it costs $48.99. The server flagged it (sizeConflict), but the row showed "750 ml · $48.99"
  // with nothing to say the price was not for one bottle.
  // Served here as Pick 'n Save, a store in this fixture's ZIP; the row is otherwise Jewel's.
  const row = (items) => ({ storeId: 'picknsave', status: 'ok', items, location: { name: "Pick 'n Save", distance: 1.2 } });
  const conflicted = { id: 'j1', storeId: 'picknsave', name: "Martinelli's Gold Medal Sparkling Apple Cider", size: '750 ml', sizeText: '750 ml', price: 48.99, unit: {}, priceBasis: 'online', score: 0.9, sizeConflict: { text: '750 ml', name: '12 × 750 ml' }, url: 'https://www.instacart.com/products/3350910?retailerSlug=jewel-osco' };
  const plain = { ...conflicted, id: 'j2', name: "Martinelli's Sparkling Cider", size: '25.4 fl oz', sizeText: '25.4 fl oz', price: 4.69, unit: { volume: { perBase: 4.69 / 25.4, est: false } }, sizeConflict: null };
  await srv.close();
  srv = await startAppServer({ api: api({ 'GET /api/search': (req, url) => {
    const asked = (url.searchParams.get('stores') || '').split(',').filter(Boolean);
    const events = [['start', { query: 'sparkling cider', stores: asked, zip: fx.zip }]];
    for (const id of asked) events.push(['store', id === 'picknsave' ? row([plain, conflicted]) : { storeId: id, status: 'empty', items: [] }]);
    events.push(['ads', { deals: [] }], ['done', { ms: 5 }]);
    return { sse: events };
  } }) });
  await search('sparkling cider');
  const badges = await page.eval(`[...document.querySelectorAll('.prow')].map((r) => [r.querySelector('.pname')?.textContent.trim(), [...r.querySelectorAll('.badge')].map((b) => b.textContent.trim())])`);
  const gold = badges.find(([n]) => /Gold Medal/.test(n));
  const ok = badges.find(([n]) => n === "Martinelli's Sparkling Cider");
  assert.ok(gold, `no Gold Medal row: ${JSON.stringify(badges)}`);
  assert.ok(gold[1].includes('size unclear'), `the case-priced row is not marked: ${JSON.stringify(gold)}`);
  assert.ok(ok && !ok[1].includes('size unclear'), `control: a clean row is not marked: ${JSON.stringify(ok)}`);
  await srv.close();
  srv = await startAppServer({ api: api() });
});

test('DEFECT (nationwide sweep): a chain-wide price is not counted as a store found within the radius', { skip: SKIP }, async () => {
  // Vredenburgh AL (36481), live: no store located within 25 miles, Walmart's chain-wide listing, and
  // four weekly ads. Onboarding said "found 1 store it can price ... within 25 miles".
  const rural = {
    ...fx.directory, zip: '36481', city: 'Vredenburgh', state: 'AL', otherMerchants: [],
    chains: [
      { id: 'walmart', name: 'Walmart', short: 'Walmart', status: 'national', hasAds: true, distance: null, address: null },
      { id: 'dollargeneral', name: 'Dollar General', short: 'Dollar General', status: 'adsOnly', hasAds: true, distance: 9.8, address: null },
    ],
  };
  await srv.close();
  srv = await startAppServer({ api: api({ 'GET /api/directory': rural }) });
  await page.viewport(390, 844);
  await openApp(page, srv.origin, { storage: {}, hash: '#/' });
  await page.waitFor(`!!document.querySelector('input[aria-label="Your ZIP code"]')`, { what: 'the ZIP step' });
  await page.eval(`(() => { const i = document.querySelector('input[aria-label="Your ZIP code"]'); i.value = '36481'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await page.eval(`(() => { document.querySelector('.onboard form').requestSubmit(); return true; })()`);
  await page.waitFor(`/Cartworth found/.test(document.body.innerText)`, { what: 'the store summary' });
  const t = await page.eval(`document.querySelector('.onboard').innerText.replace(/\\s+/g, ' ')`);
  assert.match(t, /found 0 stores it can price/, t);
  assert.match(t, /plus chain-wide prices from Walmart/, t);
  await srv.close();
  srv = await startAppServer({ api: api() });
});
