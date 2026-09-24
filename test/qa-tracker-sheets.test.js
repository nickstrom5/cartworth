// QA: the CSV hand-off from the tracker to the Google Sheet.
//
// The tracker writes CSVs (scripts/tracker/csv.js); the owner's Sheet imports them with
// marketing/sheets/Code.gs, which only runs inside Google. This file runs THAT file — the one the
// owner pastes, not a copy of its logic — under Node's vm, and tests its pure part: the CSV
// reader, the file-name check, the dedupe, the monthly routing and the cell conversion. The parts
// that call SpreadsheetApp, DriveApp, ScriptApp and LockService cannot run here and are untested.
//
// Run: node --disable-warning=ExperimentalWarning --test test/qa-tracker-sheets.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { csvField, toCsv } from '../scripts/tracker/csv.js';
import { PRICE_COLUMNS, SUMMARY_COLUMNS, priceKey } from '../scripts/tracker/columns.js';
import { incomingName } from '../scripts/tracker/exports.js';
import { buildTermRows, curatedRow } from '../scripts/tracker/rows.js';
import { makeProduct } from '../src/normalize.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gs = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(REPO, 'marketing', 'sheets', 'Code.gs'), 'utf8'), gs, { filename: 'Code.gs' });
const plain = (x) => JSON.parse(JSON.stringify(x)); // arrays from the vm realm -> this realm

test('the Sheet script and the tracker agree on every column, in order', () => {
  assert.deepEqual(plain(gs.CW_COLUMNS.prices), PRICE_COLUMNS);
  assert.deepEqual(plain(gs.CW_COLUMNS.daily_summary), SUMMARY_COLUMNS);
});

const NASTY = [
  'Butter, Salted, 4 ct',
  'Kerrygold "Pure Irish" Butter',
  'Reynolds Wrap 18" x 500\' Heavy Duty',
  'Line one\nLine two',
  'Windows\r\nline break',
  'Lone\rCR',
  ' leading space',
  'trailing space ',
  '=HYPERLINK("http://evil.example","click")',
  'Crème fraîche, ½ cup — “smart quotes”',
  '"',
  ',',
  '',
];

test('CSV escaping: commas, quotes, line breaks and edge spaces survive the trip from the tracker to the Sheet exactly', () => {
  // The format itself, pinned: quote when needed, double inner quotes, leave plain text alone.
  assert.equal(csvField('Butter, Salted'), '"Butter, Salted"');
  assert.equal(csvField('Kerrygold "Pure Irish"'), '"Kerrygold ""Pure Irish"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField(' x'), '" x"');
  assert.equal(csvField('Lucerne Butter'), 'Lucerne Butter');
  assert.equal(csvField(4.99), '4.99');
  assert.equal(csvField(true), 'TRUE');
  assert.equal(csvField(null), '');
  // Every nasty value, in every column position, round-trips through the Sheet's own reader.
  const columns = ['a', 'b', 'c'];
  const rows = NASTY.map((v, i) => ({ a: v, b: `${i}`, c: NASTY[(i + 3) % NASTY.length] }));
  const text = toCsv(columns, rows);
  const parsed = plain(gs.CW_parseCsv(text));
  assert.deepEqual(parsed[0], columns);
  assert.equal(parsed.length, rows.length + 1, 'no row was split or merged by an embedded line break');
  parsed.slice(1).forEach((r, i) => assert.deepEqual(r, [rows[i].a, rows[i].b, rows[i].c], `row ${i} (${JSON.stringify(rows[i].a)})`));
  // A file cut off inside a quoted field is an error, not a short row.
  assert.throws(() => gs.CW_parseCsv('a,b\r\n"cut off'), /quoted field/);
  // A BOM (Excel re-saves) does not corrupt the first column name.
  assert.deepEqual(plain(gs.CW_parseCsv('\ufeffkey,date\r\n1,2\r\n')), [['key', 'date'], ['1', '2']]);
});

/** The importer's logic against an in-memory tab: parse, validate, dedupe, append. */
function importInto(tab, name, text) {
  const info = gs.CW_classifyFile(name);
  assert.ok(info, `${name} is recognised`);
  const table = gs.CW_parseCsv(text);
  const v = gs.CW_validate(info, table);
  assert.equal(v.ok, true, v.error);
  const d = gs.CW_dedupe(tab.map((r) => r[0]), table.slice(1), 0);
  tab.push(...plain(d.fresh));
  return { added: d.fresh.length, dupes: d.dupes };
}

function curatedCsv() {
  const item = (storeId, id, name, sizeText, price) => makeProduct({ storeId, id, name, sizeText, price, locationId: `loc-${storeId}`, priceBasis: 'online', rank: 0, total: 3 });
  const results = {
    jewel: { capturedAt: Date.parse('2026-09-24T11:31:00Z'), items: [item('jewel', 'lucerne-1lb', 'Lucerne Butter, Salted "Sweet Cream", 1 lb', '4 ea', 4.99)] },
    marianos: { capturedAt: Date.parse('2026-09-24T11:31:05Z'), items: [item('marianos', 'kroger-16', 'Kroger Salted Butter', '16 oz', 4.49)] },
  };
  const stores = [{ id: 'jewel', name: 'Jewel-Osco', source: 'instacart' }, { id: 'marianos', name: 'Mariano’s', source: 'instacart' }];
  const { rows } = buildTermRows({ term: 'butter', zip: '60618', date: '2026-09-24', runId: '20260924T063000', parserVersion: 'pv-x', stores, results });
  const curated = rows.filter((r) => r.is_store_best).map(curatedRow);
  return { curated, text: toCsv(PRICE_COLUMNS, curated), name: incomingName('prices', '2026-09-24', '20260924T063000', curated.length) };
}

test('dedupe: importing the same file twice, or overlapping runs, never duplicates a row', () => {
  const { curated, text, name } = curatedCsv();
  assert.equal(curated.length, 2);
  const tab = [];
  assert.deepEqual(importInto(tab, name, text), { added: 2, dupes: 0 });
  assert.deepEqual(importInto(tab, name, text), { added: 0, dupes: 2 }, 'the hourly trigger running twice adds nothing');
  // A second run the same day (a manual re-run): same keys are skipped, a new store is added.
  const extra = { ...curated[0], store: 'ALDI', store_id: 'aldi', basis: 'shelf', run_id: '20260924T090000' };
  extra.key = priceKey(extra);
  const second = [...curated.map((r) => ({ ...r, run_id: '20260924T090000' })), extra];
  assert.deepEqual(importInto(tab, incomingName('prices', '2026-09-24', '20260924T090000', second.length), toCsv(PRICE_COLUMNS, second)), { added: 1, dupes: 2 });
  assert.equal(tab.length, 3);
  assert.equal(new Set(tab.map((r) => r[0])).size, 3, 'every key once');
  // Duplicate keys inside one file collapse too.
  const dup = gs.CW_dedupe([], [['k1', 'a'], ['k1', 'b'], ['k2', 'c']], 0);
  assert.equal(dup.fresh.length, 2);
  assert.equal(dup.dupes, 1);
});

test("file names and completeness: a half-synced or foreign file is not imported", () => {
  const { text, name } = curatedCsv();
  assert.deepEqual(plain(gs.CW_classifyFile(name)), { tab: 'prices', date: '2026-09-24', runId: '20260924T063000', rows: 2 });
  assert.equal(gs.CW_classifyFile('summary_2026-09-24_r20260924T063000_n7.csv').tab, 'daily_summary');
  for (const bad of [`${name}.partial`, 'prices_2026-09-24.csv', 'notes.csv', 'Prices_2026-09-24_r20260924T063000_n2.csv']) assert.equal(gs.CW_classifyFile(bad), null, bad);
  const info = gs.CW_classifyFile(name);
  const table = gs.CW_parseCsv(text);
  const short = gs.CW_validate(info, table.slice(0, 2));
  assert.equal(short.ok, false, 'one row where the name says two: still syncing');
  assert.match(short.error, /still syncing/);
  const wrongHeader = gs.CW_validate(info, [table[0].slice(1), ...table.slice(1)]);
  assert.equal(wrongHeader.ok, false);
  assert.match(wrongHeader.error, /header/);
  assert.equal(gs.CW_validate(gs.CW_classifyFile(name.replace('_n2', '_n3')), table).ok, false);
});

test('tab routing: prices go to the current month, roll over at a new month, and late rows go to their archive', () => {
  const header = PRICE_COLUMNS;
  const row = (date) => header.map((c) => (c === 'date' ? date : c === 'key' ? `${date}|k` : ''));
  assert.equal(gs.CW_periodOf('2026-09-30'), '2026-09');
  assert.equal(gs.CW_periodOf('2026-10-01'), '2026-10');
  assert.deepEqual(plain(gs.CW_route('daily_summary', SUMMARY_COLUMNS, [['x']], '2026-09')).map((g) => g.target), ['current']);
  const first = plain(gs.CW_route('prices', header, [row('2026-09-24')], null));
  assert.deepEqual(first.map((g) => [g.target, g.period]), [['current', '2026-09']], 'an empty tab takes the first month it sees');
  const mixed = plain(gs.CW_route('prices', header, [row('2026-10-01'), row('2026-09-30'), row('2026-08-31'), row('2026-10-02')], '2026-09'));
  assert.deepEqual(mixed.map((g) => [g.target, g.period, g.rows.length]), [['archive', '2026-08', 1], ['current', '2026-09', 1], ['rollover', '2026-10', 2]]);
});

test('cells: a product name can never become a formula, and ZIPs and ids keep their digits', () => {
  const header = ['key', 'date', 'zip', 'product', 'price', 'on_sale', 'product_id', 'promo', 'unit_price_est'];
  const [cells] = plain(gs.CW_toCells('prices', header, [['2026-09-24|01234|butter|jewel', '2026-09-24', '01234', '=HYPERLINK("http://x","y")', '4.99', 'TRUE', '12345678901234567890', '+1 free', 'FALSE']]));
  assert.deepEqual(cells, ['2026-09-24|01234|butter|jewel', '2026-09-24', "'01234", '\'=HYPERLINK("http://x","y")', 4.99, true, "'12345678901234567890", "'+1 free", false]);
  const [blank] = plain(gs.CW_toCells('prices', ['price', 'on_sale', 'product'], [['', '', '']]));
  assert.deepEqual(blank, ['', '', ''], 'an empty field stays empty — never 0 and never FALSE');
});
