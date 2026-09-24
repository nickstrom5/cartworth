// QA: the search radius.
//
// The radius decides which stores exist as far as the app is concerned, so it is visitor input on
// two counts: it is clamped like every other input (src/context.js), and it is then narrowed to
// the radii the products actually offer (server.js snapRadius / public/js/store.js snapRadius).
// The second pass is as much about the retailers as about the visitor — src/directory.js caches a
// build per radius value, so every distinct radius is a full re-probe of the same chains.
//
// Convention, matching the other QA files here:
//   "control: …"  asserts a property that HOLDS today and must keep holding.
//
// Nothing here touches the network.
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-radius node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.BASKET_DATA_DIR || '/tmp/cartworth-qa-radius';
process.env.BASKET_DATA_DIR ||= SCRATCH;
fs.mkdirSync(SCRATCH, { recursive: true });

const { contextFrom, DEFAULTS, LIMITS } = await import('../src/context.js');
// server.js only binds a port when it is started directly, so importing it here is safe.
const server = await import('../server.js');

const urlFor = (qs = '') => new URL(`http://x/api/directory${qs}`);

// The browser store is an ES module written for the browser: same shim the isolation suite uses.
let harnessSeq = 0;
async function loadBrowserStore() {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/store.js'), 'utf8');
  const hooks = 'data:text/javascript,' + encodeURIComponent('export const useEffect=()=>{};export const useReducer=()=>[0,()=>{}];');
  const units = pathToFileURL(path.join(ROOT, 'shared/units.js')).href;
  const patched = src.replace("from 'preact/hooks'", `from '${hooks}'`).replace("from '/shared/units.js'", `from '${units}'`);
  assert.ok(patched.includes(hooks) && patched.includes(units), 'store.js imports changed — update this harness');
  const file = path.join(SCRATCH, `store.radius.${process.pid}.${harnessSeq++}.mjs`);
  fs.writeFileSync(file, patched);
  globalThis.localStorage = undefined; // exercise the in-memory fallback; storage is not the subject here
  return import(pathToFileURL(file).href);
}

// ---------------------------------------------------------------------------
// 1. One ladder, three products.
// ---------------------------------------------------------------------------

test('control: the web control offers exactly the radii the iPhone picker offers', async () => {
  const S = await loadBrowserStore();
  assert.deepEqual(S.RADIUS_MILES, [5, 10, 15, 25, 40]);
  assert.deepEqual(server.RADIUS_MILES, S.RADIUS_MILES, 'the server accepts a different ladder than the browser offers');

  // The iPhone picker, read out of the Swift source. If someone adds a rung on one side only, the
  // two products stop meaning the same thing by "near you", which is exactly the bug this pins.
  const swift = fs.readFileSync(path.join(ROOT, 'ios/App/UI/Settings/SettingsView.swift'), 'utf8');
  const picker = swift.match(/ForEach\(\[([0-9.,\s]+)\], id: \\\.self\) \{ r in Text\("\\\(Int\(r\)\) miles"\)/);
  assert.ok(picker, 'could not find the iPhone radius picker — update this test if the view moved');
  const ios = picker[1].split(',').map((s) => Number(s.trim()));
  assert.deepEqual(ios, S.RADIUS_MILES, 'the iPhone picker and the web control offer different radii');
});

test('control: every radius the control offers survives the server’s own input clamp untouched', async () => {
  const S = await loadBrowserStore();
  for (const m of S.RADIUS_MILES) {
    const ctx = contextFrom(urlFor(`?zip=60010&miles=${m}`));
    assert.equal(ctx.maxMiles, m, `${m} miles must reach the directory as ${m}`);
    assert.equal(server.snapRadius(ctx.maxMiles), m, `${m} miles must not be snapped to something else`);
  }
  // …and the default the browser starts from is one of them.
  assert.ok(S.RADIUS_MILES.includes(S.SETTINGS_DEFAULTS.maxMiles));
  assert.ok(server.RADIUS_MILES.includes(DEFAULTS.maxMiles));
});

// ---------------------------------------------------------------------------
// 2. Sanitisation: nothing a visitor can send produces a radius off the ladder.
// ---------------------------------------------------------------------------

const JUNK = [
  undefined, null, '', ' ', 'banana', '25abc', {}, [], [25], NaN, Infinity, -Infinity,
  -1, -9999, 0, 0.1, 1, 3, 4.9, 5, 5.5, 7, 10, 12, 15, 24, 25, 26, 39, 40, 41, 50, 1e9, '10', '40.7', true, false,
];

test('control: snapRadius always returns one of the offered radii, for anything at all', async () => {
  const S = await loadBrowserStore();
  for (const fn of [S.snapRadius, server.snapRadius]) {
    for (const v of JUNK) {
      let out;
      assert.doesNotThrow(() => {
        out = fn(v);
      }, `snapRadius(${JSON.stringify(v)}) threw — a malformed radius must never become a 500`);
      assert.ok(S.RADIUS_MILES.includes(out), `snapRadius(${JSON.stringify(v)}) = ${out}, which is not one of ${S.RADIUS_MILES.join('/')}`);
    }
  }
});

test('control: the browser and the server snap identically, so the client knows what it asked for', async () => {
  const S = await loadBrowserStore();
  for (const v of JUNK) {
    assert.equal(S.snapRadius(v), server.snapRadius(v), `snapRadius(${JSON.stringify(v)}) differs between browser and server`);
  }
});

test('control: an in-between radius snaps DOWN, so no store further away than asked is ever shown', async () => {
  const S = await loadBrowserStore();
  for (const [asked, expected] of [[7, 5], [12, 10], [24, 15], [26, 25], [39, 25], [40.7, 40]]) {
    assert.equal(S.snapRadius(asked), expected, `${asked} miles must not widen the search`);
    assert.ok(S.snapRadius(asked) <= asked, `${asked} miles widened to ${S.snapRadius(asked)}`);
  }
  // The two ends are the product's own limits, not a guess: below 5 there is nothing narrower to
  // offer, and above 40 nothing wider.
  assert.equal(S.snapRadius(0), 5);
  assert.equal(S.snapRadius(-9999), 5);
  assert.equal(S.snapRadius(1e9), 40);
  // Unreadable input falls back to the shared default rather than to the widest search.
  assert.equal(S.snapRadius('banana'), DEFAULTS.maxMiles);
  assert.notEqual(S.snapRadius('banana'), 40, 'junk must never buy the widest, most expensive search');
});

test('control: a malformed radius is still a 400 from the clamp, never a 500 and never another visitor’s problem', () => {
  for (const qs of ['?zip=60010&miles=banana', '?zip=60010&maxMiles=%7B%7D']) {
    let err = null;
    try {
      contextFrom(urlFor(qs));
    } catch (e) {
      err = e;
    }
    assert.ok(err, `${qs} should have been rejected`);
    assert.equal(err.status, 400, `${qs} must be a 400, got ${err.status}`);
    assert.match(err.message, /number/i);
  }
  // A visitor sending an absurd radius does not get an absurd search, and does not disturb the
  // next request either.
  const wild = contextFrom(urlFor('?zip=60010&miles=9999'));
  assert.equal(wild.maxMiles, LIMITS.maxMiles.max);
  assert.equal(server.snapRadius(wild.maxMiles), 40);
  assert.equal(contextFrom(urlFor('?zip=60010')).maxMiles, DEFAULTS.maxMiles, 'the next visitor inherits nothing');
});

// ---------------------------------------------------------------------------
// 3. Persistence: the radius is saved with the rest of this visitor's settings.
// ---------------------------------------------------------------------------

test('control: the radius persists with the other settings and is re-sanitised on the way back in', async () => {
  const S = await loadBrowserStore();
  S.hydrate();
  for (const m of S.RADIUS_MILES) {
    S.saveSettings({ maxMiles: m });
    assert.equal(S.getState().settings.maxMiles, m, `${m} miles must survive a save`);
    assert.equal(S.snapRadius(S.getState().settings.maxMiles), m);
  }
  // Stored junk (an old export, a hand-edited key, another tab) must not reach the directory as-is.
  for (const v of ['banana', null, 9999, -4, 37]) {
    S.saveSettings({ maxMiles: v });
    const stored = S.getState().settings.maxMiles;
    assert.ok(Number.isFinite(stored), `a saved radius must always be a number, got ${stored}`);
    assert.ok(stored >= LIMITS.maxMiles.min && stored <= LIMITS.maxMiles.max, `${stored} is outside what the server accepts`);
    assert.ok(S.RADIUS_MILES.includes(S.snapRadius(stored)), `${stored} does not snap onto the ladder`);
  }
});

test('control: the radius the browser SENDS is always one of the offered radii, whatever is stored', async () => {
  // contextParams is the one place the radius leaves the browser. Read it as source rather than
  // importing actions.js, which pulls in the whole app: what matters is that it cannot send the
  // raw stored number.
  const actions = fs.readFileSync(path.join(ROOT, 'public/js/actions.js'), 'utf8');
  assert.match(actions, /p\.set\('miles', String\(snapRadius\(/, "contextParams must snap the radius before sending it");
  assert.match(actions, /maxMiles: snapRadius\(/, 'contextBody must snap the radius before sending it');
  assert.ok(!/p\.set\('miles', String\(s\.maxMiles/.test(actions), 'contextParams still sends the raw stored radius');
});

test('control: changing the radius re-runs store discovery and drops stores that fell outside it', () => {
  const actions = fs.readFileSync(path.join(ROOT, 'public/js/actions.js'), 'utf8');
  assert.match(actions, /const radiusChanged =/, 'saveSettings must notice a radius change');
  assert.match(actions, /snapRadius\(settings\.maxMiles\) !== snapRadius\(before\.maxMiles\)/, 'two radii on the same rung must not re-probe');
  const branch = actions.slice(actions.indexOf('} else if (radiusChanged) {'), actions.indexOf('} else if (patch.stores'));
  assert.ok(branch.length > 0, 'the radius branch of saveSettings is gone');
  assert.match(branch, /loadDirectory\(\)/, 'a radius change must re-run store discovery');
  assert.ok(!/loadDirectory\(true\)/.test(branch), 'a radius change must not bypass the cache — each radius already has its own entry');
  // A store that falls outside the radius does not leave the directory — if it has a circular for
  // this ZIP it comes back as weekly-ad-only — so "still listed" is not the test for keeping it on.
  assert.match(branch, /if \(!c\) return false;/, 'a store that is no longer near you must be switched off');
  assert.match(branch, /c\.status !== 'adsOnly' \|\| wasAdsOnly\.has\(id\)/, 'a store that is now too far to price must stop being price-checked');
  assert.match(branch, /const wasAdsOnly =/, 'narrowing must not undo a deliberate choice to keep an ad-only chain on');
});

// ---------------------------------------------------------------------------
// 4. Politeness: a visitor cannot multiply our outbound traffic by walking the radius.
// ---------------------------------------------------------------------------

test('control: the directory cache key can take only as many values as there are offered radii', async () => {
  const dir = fs.readFileSync(path.join(ROOT, 'src/directory.js'), 'utf8');
  assert.match(dir, /`dir:v1:\$\{zip\}:\$\{maxMiles\}`/, 'the directory cache key no longer includes the radius — re-check this test');

  // Every radius that can reach directory() has been through snapRadius first, so the key space per
  // ZIP is the ladder, not the whole clamp range. Without that, miles=3..50 is 48 distinct full
  // re-probes of the same chains from one visitor, inside the per-IP budget in src/guard.js.
  const reachable = new Set();
  for (let m = LIMITS.maxMiles.min; m <= LIMITS.maxMiles.max; m++) reachable.add(server.snapRadius(contextFrom(urlFor(`?zip=60010&miles=${m}`)).maxMiles));
  assert.deepEqual([...reachable].sort((a, b) => a - b), server.RADIUS_MILES);
  assert.equal(reachable.size, 5, `one ZIP can be made to build ${reachable.size} directories instead of 5`);

  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(srv, /directory\(zip, \{ maxMiles: snapRadius\(ctx\.maxMiles\)/, '/api/directory must snap before it builds');
});

test('control: the directory response reports the radius that was applied, not the one that was asked for', () => {
  const dir = fs.readFileSync(path.join(ROOT, 'src/directory.js'), 'utf8');
  // build() puts the radius it filtered distances with into the response, and server.js spreads
  // that straight through. That is what the Settings view displays, so the number on screen is the
  // number that was used even when the request asked for something else.
  assert.match(dir, /^\s*maxMiles,$/m, 'the directory build no longer echoes the radius it used');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(srv, /return \{ \.\.\.dir, radiusOptions: RADIUS_MILES/, '/api/directory must pass the build’s own radius through');

  const settings = fs.readFileSync(path.join(ROOT, 'public/js/views/settings.js'), 'utf8');
  assert.match(settings, /directory\?\.maxMiles \?\? radius/, 'Settings must show the radius the server applied');
});
