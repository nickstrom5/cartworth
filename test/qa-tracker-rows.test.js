// QA: what the price tracker keeps, and how it marks it (scripts/tracker/rows.js, core.js, trackerdb.js).
//
// The governing rule is "never publish a wrong price". The tracker's share of that: keep the
// retailer's own numbers, never silently drop a row it thinks is wrong (keep it, MARK it), never
// record yesterday's cached answer as today's price, stamp the parser that produced every derived
// number, and make the basis impossible to misread. Products here are built with the product's
// real makeProduct (src/normalize.js) and priced by the real shared/compare.js; the store searches
// are fakes, so nothing touches the network or the product database.
//
// Run: node --disable-warning=ExperimentalWarning --test test/qa-tracker-rows.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeProduct } from '../src/normalize.js';
import { buildTermRows, curatedRow, basisOf } from '../scripts/tracker/rows.js';
import { runCapture } from '../scripts/tracker/core.js';
import { openTrackerDb, makeStore } from '../scripts/tracker/trackerdb.js';
import { parserVersion, parserFiles } from '../scripts/tracker/version.js';
import { REPO_ROOT } from '../scripts/tracker/config.js';

const PV = 'pv-under-test';
const item = (storeId, id, name, sizeText, price, extra = {}) =>
  makeProduct({ storeId, id, name, sizeText, price, locationId: `loc-${storeId}`, priceBasis: extra.basis || 'online', rank: extra.rank ?? 0, total: 10, ...extra });

/** Butter at three stores, with one of every kind of row the tracker must keep AND mark. */
function butterResults() {
  const at = Date.parse('2026-09-24T11:31:00Z');
  return {
    jewel: {
      capturedAt: at,
      location: { id: 'shop-1', priceNote: 'Prices are higher than in-store' },
      items: [
        item('jewel', 'lucerne-1lb', 'Lucerne Butter Salted 1 lb', '4 ea', 4.99, { brand: 'Lucerne', rank: 0 }),
        item('jewel', 'lol-1lb', 'Land O Lakes Salted Butter', '1 lb', 7.99, { brand: 'Land O Lakes', rank: 1 }),
        // The same product listed twice under two item ids: one row, not two.
        item('jewel', 'lol-1lb', 'Land O Lakes Salted Butter', '1 lb', 7.99, { brand: 'Land O Lakes', rank: 2 }),
        // A different food that shares the word: low relevance, kept and marked.
        item('jewel', 'pb-16', 'Jif Creamy Peanut Butter', '16 oz', 3.49, { rank: 3 }),
        // Name and stated size disagree 2x: kept, marked, never the store's answer.
        item('jewel', 'conflict', 'Kerrygold Pure Irish Butter, 2 lb', '1 lb', 4.29, { brand: 'Kerrygold', rank: 4 }),
      ],
    },
    aldi: {
      capturedAt: at,
      location: { id: 'aldi-1' },
      items: [
        item('aldi', 'cc-16', 'Countryside Creamery Salted Butter', '16 oz', 3.79, { basis: 'shelf', rank: 0 }),
        // A case priced as one unit: far above every peer, flagged implausible, kept and marked.
        item('aldi', 'cc-case', 'Countryside Creamery Butter Quarters', '16 oz', 39.99, { basis: 'shelf', rank: 1 }),
      ],
    },
    marianos: {
      capturedAt: at,
      location: { id: 'mar-1' },
      items: [item('marianos', 'kroger-16', 'Kroger Salted Butter', '16 oz', 4.49, { rank: 0 }), item('marianos', 'lol-1lb', 'Land O Lakes Salted Butter', '1 lb', 6.49, { rank: 1 })],
    },
  };
}
const STORES = [
  { id: 'jewel', name: 'Jewel-Osco', source: 'instacart', status: 'online', distance: 0.3, address: '3572 N Elston Ave' },
  { id: 'aldi', name: 'ALDI', source: 'instacart', status: 'shelf', distance: 0.6 },
  { id: 'marianos', name: 'Mariano’s', source: 'instacart', status: 'online', distance: 0.8 },
];
const build = (over = {}) => buildTermRows({ term: 'butter', zip: '60618', date: '2026-09-24', runId: '20260924T063000', parserVersion: PV, stores: STORES, results: butterResults(), ...over });
const find = (rows, sid, pid) => rows.filter((r) => r.store_id === sid && r.product_id === pid);

test('flagged rows are kept and MARKED, never dropped, and never become the curated answer', () => {
  const { rows } = build();
  const [caseRow] = find(rows, 'aldi', 'cc-case');
  assert.ok(caseRow, 'the implausible $39.99 butter is still in the detail rows');
  assert.equal(caseRow.implausible, true);
  assert.equal(caseRow.implausible_direction, 'high');
  assert.match(caseRow.flags, /implausible-high/);
  assert.equal(caseRow.is_store_best, false);

  const [pb] = find(rows, 'jewel', 'pb-16');
  assert.ok(pb, 'the low-relevance peanut butter is kept');
  assert.equal(pb.low_relevance, true);
  assert.match(pb.flags, /low-relevance/);
  assert.equal(pb.is_store_best, false);

  const [conflict] = find(rows, 'jewel', 'conflict');
  assert.ok(conflict, 'the size-conflict row is kept');
  assert.equal(conflict.size_conflict, true);
  assert.match(conflict.flags, /size-conflict/);
  assert.equal(conflict.unit_price, null, 'no unit price is claimed for a row whose own sizes disagree');
  assert.equal(conflict.is_store_best, false, 'the cheapest-looking Jewel row is not crowned while its sizes disagree');

  const curated = rows.filter((r) => r.is_store_best);
  assert.deepEqual(curated.map((r) => `${r.store_id}:${r.product_id}`).sort(), ['aldi:cc-16', 'jewel:lucerne-1lb', 'marianos:kroger-16']);
  for (const r of curated) assert.equal(r.flags.includes('implausible') || r.flags.includes('size-conflict') || r.flags.includes('low-relevance'), false);
});

test('parser_version is stamped on every row, and changes when any parser file changes', () => {
  const { rows } = build();
  assert.ok(rows.length >= 8);
  for (const r of rows) assert.equal(r.parser_version, PV, `${r.store_id}:${r.product_id} carries parser_version`);
  for (const r of rows.filter((x) => x.is_store_best)) assert.equal(curatedRow(r).parser_version, PV, 'and so does its Sheet row');
  assert.throws(() => build({ parserVersion: null }), /parserVersion/, 'rows cannot be built without one');

  // The fingerprint follows file CONTENT: copy the parser files, change one byte in one, and the version changes.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-pv-'));
  try {
    for (const rel of parserFiles(REPO_ROOT)) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, rel), path.join(tmp, rel));
    }
    const a = parserVersion(tmp);
    assert.equal(a.version, parserVersion(tmp).version, 'stable for identical files');
    assert.match(a.version, /^pv-[0-9a-f]{10}$/);
    fs.appendFileSync(path.join(tmp, 'shared', 'units.js'), '\n// a parser fix\n');
    const b = parserVersion(tmp);
    assert.notEqual(b.version, a.version, 'a change to shared/units.js is a new parser_version');
    assert.notEqual(b.files['shared/units.js'], a.files['shared/units.js']);
    fs.appendFileSync(path.join(tmp, 'src', 'adapters', 'instacart.js'), '\n// an adapter fix\n');
    assert.notEqual(parserVersion(tmp).version, b.version, 'so is a change to an adapter');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('dedupe: one row per product per store, and writing the same rows twice adds nothing to tracker.db', () => {
  const { rows } = build();
  assert.equal(find(rows, 'jewel', 'lol-1lb').length, 1, 'a product listed twice at one store is one row');
  assert.equal(find(rows, 'marianos', 'lol-1lb').length, 1, 'the same product at another store is its own row');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-tdb-'));
  try {
    const store = makeStore(openTrackerDb(path.join(tmp, 'tracker.db')));
    assert.equal(store.recordTerm([], rows), rows.length);
    assert.equal(store.recordTerm([], rows), 0, 'the second write inserts nothing');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n, rows.length);
    store.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("Jewel's Instacart listing is recorded as online-instacart in the detail row, the Sheet row and the summary — never as a shelf price", () => {
  assert.equal(basisOf({ priceBasis: 'online' }, 'instacart'), 'online-instacart');
  assert.equal(basisOf({ priceBasis: 'shelf' }, 'instacart'), 'shelf');
  assert.equal(basisOf({ priceBasis: 'national' }, 'instacart'), 'national');
  const { rows } = build();
  const jewel = rows.filter((r) => r.store_id === 'jewel');
  for (const r of jewel) assert.equal(r.basis, 'online-instacart');
  const lucerne = find(rows, 'jewel', 'lucerne-1lb')[0];
  assert.equal(lucerne.size_listed, '4 ea', 'the size exactly as listed, even when the parser reads the name instead');
  assert.equal(lucerne.price, 4.99);
  assert.equal(lucerne.price_note, 'Prices are higher than in-store');
  assert.equal(curatedRow(lucerne).basis, 'online-instacart');
  assert.equal(find(rows, 'aldi', 'cc-16')[0].basis, 'shelf');
});

/** A fake product pipeline for runCapture. */
function fakeDeps({ stale = new Set(), ads = [] } = {}) {
  const asked = [];
  return {
    asked,
    deps: {
      directory: async (zip) => ({
        zip,
        city: 'Chicago',
        state: 'IL',
        chains: [...STORES.map((s) => ({ ...s })), { id: 'target', name: 'Target', status: 'adsOnly' }],
        unresolved: [],
      }),
      sourceFor: (id) => (id === 'target' ? null : { type: 'instacart', base: id === 'aldi' ? 'https://www.aldi.us' : 'https://www.instacart.com' }),
      searchStore: async (id, term) => {
        asked.push(`${id}:${term}`);
        const r = butterResults()[id];
        if (stale.has(id)) return { storeId: id, status: 'ok', items: r.items, location: r.location, stale: 'Could not reach the store site (network)' };
        return { storeId: id, status: r.items.length ? 'ok' : 'empty', items: r.items, location: r.location };
      },
      searchAds: async () => ads,
    },
  };
}

test('a stale cached answer is refused, not recorded as today\'s price; a closed host is not asked; weekly ads stay out of the Sheet', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-core-'));
  try {
    const store = makeStore(openTrackerDb(path.join(tmp, 'tracker.db')));
    const ads = [
      { storeId: 'jewel', flippId: 91, flyerId: 7, name: 'Land O Lakes Butter', price: 3.99, qty: 1, perLb: false, priceText: '$3.99', needsCard: true, validFrom: '2026-09-23', validTo: '2026-09-29', score: 0.9, week: 'current' },
      { storeId: 'target', flippId: 92, flyerId: 8, name: 'Good & Gather Butter', price: 3.49, qty: 1, perLb: false, priceText: '$3.49', validFrom: '2026-09-21', validTo: '2026-09-27', score: 0.9, week: 'current' },
    ];
    const { deps, asked } = fakeDeps({ stale: new Set(['marianos']), ads });
    // www.aldi.us has said 429 earlier in this run.
    const limiter = { isClosed: (h) => h === 'www.aldi.us', closedHosts: () => ({ 'www.aldi.us': { reason: 'rate-limited' } }) };
    const out = await runCapture({ deps, store, limiter, zips: ['60618'], terms: [{ term: 'butter' }], date: '2026-09-24', runId: 'R1', parserVersion: PV });
    assert.ok(!asked.includes('aldi:butter'), 'a closed host is not asked again');
    const caps = Object.fromEntries(store.capturesForRun('R1').map((c) => [c.store_id, c]));
    assert.equal(caps.aldi.status, 'host-closed');
    assert.equal(caps.marianos.status, 'stale-refused');
    assert.equal(caps.jewel.status, 'ok');
    const rows = store.rowsForRun('R1');
    assert.equal(rows.filter((r) => r.store_id === 'marianos').length, 0, 'nothing from the stale answer was recorded');
    assert.ok(rows.filter((r) => r.store_id === 'jewel' && r.basis === 'online-instacart').length >= 3);
    for (const r of rows) assert.equal(r.parser_version, PV);
    const adRows = rows.filter((r) => r.basis === 'weekly-ad');
    assert.equal(adRows.length, 2, 'weekly-ad rows are kept in the detail');
    assert.ok(adRows.every((r) => !r.is_store_best && r.unit_price == null), 'but never curated and never given a unit price');
    assert.equal(adRows.find((r) => r.store_id === 'jewel').card_label, 'card required');
    const summary = Object.fromEntries(out.summaryRows.map((r) => [r.store_id, r]));
    assert.equal(summary.jewel.basis, 'online-instacart');
    assert.equal(summary.marianos.terms_failed, 1);
    assert.match(summary.marianos.note, /stale-refused/);
    assert.equal(summary.target.basis, 'weekly-ad');
    store.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
