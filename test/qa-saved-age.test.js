// QA: a saved price served because a store did not answer must say how old it is. "stale" alone
// let a three-day-old price read like today's. searchStore stamps savedAt when the store answers;
// a stale result carries it, and a fresh one does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The behaviour (a saved answer carries savedAt from the time the store answered) is tested in
// qa-catalog-directory.test.js, which has the Instacart harness.

test('DEFECT: the web store chip shows the saved age instead of a bare "stale"', () => {
  const src = fs.readFileSync(new URL('../public/js/views/compare.js', import.meta.url), 'utf8');
  assert.match(src, /saved \$\{ago\(r\.savedAt\)\}/);
});

test('DEFECT: the iPhone app carries the saved time to its store chip', () => {
  const search = fs.readFileSync(new URL('../ios/App/Services/PriceSearch.swift', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../ios/App/UI/Search/SearchView.swift', import.meta.url), 'utf8');
  assert.match(search, /savedAt: r\.storedAt/);
  assert.match(fs.readFileSync(new URL('../ios/App/Networking/Cache.swift', import.meta.url), 'utf8'), /staleError: error, fromCache: true, storedAt: e\.stored/);
  assert.match(view, /TimelineView\(\.periodic/, 'the age must keep up while results stay on screen');
  assert.match(view, /r\.savedAt/);
});

test('DEFECT: the search endpoint does not record a saved copy as a new price observation', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /search\.withHistory\(r\.items, \{ record: !r\.stale \}\)/);
});

// The browser store, loaded the way qa-search-radius.test.js loads it.
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
async function loadBrowserStore() {
  const root = new URL('..', import.meta.url).pathname;
  const src = fs.readFileSync(path.join(root, 'public/js/store.js'), 'utf8');
  const hooks = 'data:text/javascript,' + encodeURIComponent('export const useEffect=()=>{};export const useReducer=()=>[0,()=>{}];');
  const units = pathToFileURL(path.join(root, 'shared/units.js')).href;
  const patched = src.replace("from '/vendor/preact-hooks.mjs'", `from '${hooks}'`).replace("from '/shared/units.js'", `from '${units}'`);
  assert.ok(patched.includes(hooks) && patched.includes(units), 'store.js imports changed — update this harness');
  const dir = fs.mkdtempSync(path.join(process.env.BASKET_DATA_DIR || os.tmpdir(), 'saved-age-'));
  const file = path.join(dir, 'store.mjs');
  fs.writeFileSync(file, patched);
  globalThis.localStorage = undefined;
  return import(pathToFileURL(file).href);
}

const watchWith = (store) => ({
  id: 'w1', label: 'butter', displayUnit: 'lb', target: 5,
  // Five separate earlier checks, all dearer than today's best.
  points: [1, 2, 3, 4, 5].map((t) => ({ storeId: 'costco', unit: 0.4, t })),
  result: { best: { storeId: 'costco', storeName: 'Costco', unitPerBase: 0.2 }, stores: { costco: store } },
});

test('DEFECT: a watch alert from a saved price says so, and never claims the lowest price seen', async () => {
  const S = await loadBrowserStore();
  const saved = S.decorateWatch(watchWith({ unitPerBase: 0.2, savedAt: Date.UTC(2026, 9, 14, 12) }));
  assert.equal(saved.alert?.kind, 'target');
  assert.match(saved.alert.message, /saved price/);
  const noTarget = S.decorateWatch({ ...watchWith({ unitPerBase: 0.2, savedAt: 0 }), target: null });
  assert.equal(noTarget.alert, null, 'a saved price is not a new low');
});

test('control: a live best price can still be the lowest seen', async () => {
  const S = await loadBrowserStore();
  const live = S.decorateWatch({ ...watchWith({ unitPerBase: 0.2 }), target: null });
  assert.equal(live.alert?.kind, 'low');
  assert.doesNotMatch(live.alert.message, /saved/);
});

test('DEFECT: the iPhone app keeps saved prices out of history, watch readings and notifications', () => {
  const read = (p) => fs.readFileSync(new URL(`../ios/App/${p}`, import.meta.url), 'utf8');
  const history = read('Persistence/HistoryStore.swift');
  assert.match(history, /func statsThenRecord\(_ products: \[Product\], record: Bool = true\)/);
  assert.match(history, /if record, changed \|\|/);
  assert.match(read('Services/SearchModel.swift'), /statsThenRecord\(r\.items, record: r\.stale == nil\)/);
  const watch = read('Services/WatchService.swift');
  assert.match(watch, /statsThenRecord\(r\.items, record: r\.stale == nil\)/);
  assert.match(watch, /if saved\[storeId\] == nil \{ context\.insert\(WatchPoint\(/);
  assert.match(watch, /let lowest = b\.savedAt == nil &&/);
  assert.match(watch, /savedAt: saved\[sid\]\)\)/, 'trip plan lines carry the saved time');
  assert.match(read('Services/BackgroundRefresh.swift'), /if \(st\.atTarget \|\| st\.lowest\), !fromSaved,/);
  assert.match(read('UI/Tracking/TrackingView.swift'), /SavedNote\(date: saved\)/);
  assert.match(read('UI/Lists/ListsView.swift'), /SavedNote\(date: saved\)/);
});
