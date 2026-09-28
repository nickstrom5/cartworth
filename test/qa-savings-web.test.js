// QA: the website's savings lines say what shared/compare.js allows, and nothing more.
//
// The phone has rendered Compare.savingsClaim / TripPlanner.savingsClaim since round 2, but the
// website kept its own arithmetic: the Compare headline printed "N% less than the next-best store"
// over any two prices — a shelf price against an Instacart listing, or against a row badged "price
// looks wrong" — and the trip planner printed "Saves $X vs one store" over totals built from online
// and chain-wide listings. Both now go through the shared functions; these tests import the
// shipped view modules, not copies.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importPublic } from './helpers/browser-modules.js';

const { savingsLine } = await importPublic('js/views/compare.js');
const { planVsSingle } = await importPublic('js/views/list.js');

// A Compare-view row: product fields plus cmp (price per base unit) and cmpEst.
// As the Compare view builds them: the product (with its own `unit` map, keyed by dimension) plus
// cmp/cmpEst for the chosen dimension. The `unit` map is what hid the savings line in production:
// the first version of these tests left it out and passed while the live page showed nothing.
const row = (storeId, cmp, extra = {}) => ({ storeId, cmp, cmpEst: false, priceBasis: 'shelf', name: 'Butter', unit: { weight: { perBase: cmp, est: false } }, ...extra });
// Rendered html`` → its text, whatever shape htm produced.
const text = (v) => (v == null || v === false ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map(text).join('') : text(v.props?.children));

test('control: two shelf prices get the exact figure', () => {
  const s = savingsLine(row('aldi', 0.25), row('jewelosco', 0.3), 'lb');
  assert.match(s, /\(17%\) less than the next-best store/);
  assert.ok(!/\{/.test(s), `unfilled placeholder: ${s}`);
});

test('DEFECT: a shelf price is not "N% less" than an Instacart listing inside the markup', () => {
  // Jewel's butter: $4.49 on its own shelf, $4.99 on Instacart. 10% is inside the 20% online spread.
  const s = savingsLine(row('aldi', 4.49 / 16), row('jewelosco', 4.99 / 16, { priceBasis: 'online' }), 'lb');
  assert.ok(!/%/.test(s), `a precise claim across bases: ${s}`);
  assert.match(s, /About the same as .* \(online price\), so no saving is claimed/);
});

test('DEFECT: no savings line at all against a price the app flagged as wrong', () => {
  assert.equal(savingsLine(row('aldi', 0.2), row('festival', 1.6, { implausible: { direction: 'high' } }), 'lb'), null);
  assert.equal(savingsLine(row('aldi', 0.2), row('festival', 1.6, { sizeConflict: true }), 'lb'), null);
});

test('control: a winner far ahead of an online price says so, without a number', () => {
  const s = savingsLine(row('aldi', 0.1), row('jewelosco', 0.3, { priceBasis: 'online' }), 'lb');
  assert.equal(s.includes('%'), false);
  assert.match(s, /^Less than the next-best store/);
});

const plan = (total, bases, low = total, high = total) => ({ total, bases, low, high, missing: 0, stores: ['a'] });

test('control: two all-shelf plans get "Saves $X"', () => {
  assert.match(text(planVsSingle(plan(40, ['shelf']), plan(45.5, ['shelf']))), /Saves \$5\.50 vs one store/);
});

test('DEFECT: a plan with online prices does not promise a saving to the cent', () => {
  const t = text(planVsSingle(plan(40, ['online', 'shelf'], 40, 40), plan(42, ['shelf'], 42, 42)));
  assert.ok(!/\$/.test(t), `a dollar saving across bases: ${t}`);
  assert.match(t, /cheaper, but some prices are online/i);
  const close = text(planVsSingle(plan(40, ['online'], 32, 40), plan(41, ['online'], 32.8, 41)));
  assert.match(close, /about the same/i);
});

test('control: a plan that is not cheaper gets no line', () => {
  assert.equal(planVsSingle(plan(45, ['shelf']), plan(40, ['shelf'])), null);
});
