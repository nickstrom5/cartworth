// QA: the stats the owner will post (scripts/tracker/stats.js) compare only what is comparable.
//
// A savings claim between two prices the app itself says are not comparable counts as a wrong
// price. So: nothing is compared across bases (shelf / online-instacart / national / weekly-ad), a
// SKU is followed only at one store location, a parser change inside a series is flagged, and a
// basket total exists only for stores that have every item in the same basis, each item costed
// at the same amount everywhere.
//
// Run: node --disable-warning=ExperimentalWarning --test test/qa-tracker-stats.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { skuChanges, cheapestByDay, identicalSpread, basketTotals, CrossBasisError } from '../scripts/tracker/stats.js';

const row = (o) => ({
  date: '2026-09-24', captured_at: `${o.date || '2026-09-24'}T11:30:00.000Z`, zip: '60618', term: 'butter', store_location_id: `loc-${o.store_id}`,
  source: 'instacart', brand: null, size_listed: '1 lb', size_parsed: '16 oz', price_per: 'package', regular_price: null, on_sale: false,
  unit: 'lb', unit_price_est: false, is_store_best: true, parser_version: 'pv-a', ...o,
});

test('cheapest store is decided inside one basis only; --basis all is refused', () => {
  const rows = [
    row({ store: 'ALDI', store_id: 'aldi', basis: 'shelf', product_id: 'a', product: 'Countryside Butter', price: 3.79, unit_price: 3.79 }),
    row({ store: 'Jewel-Osco', store_id: 'jewel', basis: 'online-instacart', product_id: 'j', product: 'Lucerne Butter', price: 4.99, unit_price: 4.99 }),
    row({ store: 'Mariano’s', store_id: 'marianos', basis: 'online-instacart', product_id: 'm', product: 'Kroger Butter', price: 4.49, unit_price: 4.49 }),
    row({ store: 'Walmart', store_id: 'walmart', basis: 'national', product_id: 'w', product: 'Great Value Butter', price: 3.5, unit_price: 3.5 }),
  ];
  const { days } = cheapestByDay(rows);
  const by = Object.fromEntries(days.map((d) => [d.basis, d]));
  assert.deepEqual(Object.keys(by).sort(), ['national', 'online-instacart', 'shelf'], 'one answer per basis');
  assert.equal(by.shelf.winner.store_id, 'aldi', 'the chain-wide Walmart listing does not "beat" the ALDI shelf');
  assert.equal(by.shelf.runnerUp, null);
  assert.equal(by['online-instacart'].winner.store_id, 'marianos');
  assert.equal(by['online-instacart'].runnerUp.store_id, 'jewel');
  assert.equal(by['online-instacart'].gapPct, 10);
  for (const d of days) assert.ok([d.winner, d.runnerUp].filter(Boolean).every((r) => r.basis === d.basis));
  assert.throws(() => cheapestByDay(rows, { basis: 'all' }), CrossBasisError);
  assert.throws(() => identicalSpread(rows, { basis: 'all' }), CrossBasisError);
});

test('a same-SKU change is followed at ONE store location and basis, and a parser change inside it is flagged', () => {
  const rows = [
    row({ date: '2026-09-24', store: 'Jewel-Osco', store_id: 'jewel', store_location_id: 'lombard', zip: '60148', basis: 'online-instacart', product_id: 'lucerne', product: 'Lucerne Butter', price: 5.99 }),
    row({ date: '2026-10-01', store: 'Jewel-Osco', store_id: 'jewel', store_location_id: 'lombard', zip: '60148', basis: 'online-instacart', product_id: 'lucerne', product: 'Lucerne Butter', price: 6.49, parser_version: 'pv-b' }),
    // The same SKU at a different Jewel, cheaper, later: not part of Lombard's series.
    row({ date: '2026-10-02', store: 'Jewel-Osco', store_id: 'jewel', store_location_id: 'chicago-elston', zip: '60618', basis: 'online-instacart', product_id: 'lucerne', product: 'Lucerne Butter', price: 4.99 }),
    // A weekly-ad row for the "same" item is not a SKU observation.
    row({ date: '2026-10-02', store: 'Jewel-Osco', store_id: 'jewel', store_location_id: 'lombard', zip: '60148', basis: 'weekly-ad', product_id: 'lucerne', product: 'Lucerne Butter', price: 2.99 }),
  ];
  const { changes } = skuChanges(rows, { days: 28, endDate: '2026-10-02' });
  assert.equal(changes.length, 1);
  const c = changes[0];
  assert.equal(c.store_location_id, 'lombard');
  assert.equal(c.basis, 'online-instacart');
  assert.deepEqual([c.from.price, c.to.price, c.change, c.pct], [5.99, 6.49, 0.5, 8.3]);
  assert.equal(c.kind, 'regular price changed');
  assert.equal(c.parser_changed, true, 'the series crosses pv-a -> pv-b and says so');
  assert.equal(c.trend_ok, false, 'seven days is a change, not yet a trend');
  assert.equal(skuChanges(rows.slice(0, 1), { days: 28 }).changes.length, 0, 'one day of history shows no change at all');
});

test('the identical product at different stores is compared only within one basis', () => {
  const rows = [
    row({ store: 'Jewel-Osco', store_id: 'jewel', basis: 'online-instacart', product_id: 'lol-1lb', product: 'Land O Lakes Salted Butter', price: 7.99, is_store_best: false }),
    row({ store: 'Mariano’s', store_id: 'marianos', basis: 'online-instacart', product_id: 'lol-1lb', product: 'Land O Lakes Salted Butter', price: 6.49, is_store_best: false }),
    row({ store: 'ALDI', store_id: 'aldi', basis: 'shelf', product_id: 'lol-1lb', product: 'Land O Lakes Salted Butter', price: 5.29, is_store_best: false }),
  ];
  const { items } = identicalSpread(rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].basis, 'online-instacart');
  assert.deepEqual([items[0].low.store_id, items[0].high.store_id, items[0].spread], ['marianos', 'jewel', 1.5]);
  assert.equal(items[0].stores.length, 2, 'the ALDI shelf price is not in an online-instacart comparison');
});

test('a basket total exists only for stores with every item in the basis, each item costed at the same amount', () => {
  const terms = ['butter', 'milk'];
  const B = 'online-instacart';
  const rows = [
    row({ store: 'A', store_id: 'a', basis: B, term: 'butter', product_id: 'a1', product: 'A butter', size_listed: '1 lb', size_parsed: '16 oz', price: 4, unit_price: 4, unit: 'lb' }),
    row({ store: 'B', store_id: 'b', basis: B, term: 'butter', product_id: 'b1', product: 'B butter', size_listed: '2 lb', size_parsed: '32 oz', price: 7, unit_price: 3.5, unit: 'lb' }),
    row({ store: 'C', store_id: 'c', basis: B, term: 'butter', product_id: 'c1', product: 'C butter', size_listed: '1 lb', size_parsed: '16 oz', price: 1, unit_price: 1, unit: 'lb' }),
    row({ store: 'A', store_id: 'a', basis: B, term: 'milk', product_id: 'a2', product: 'A milk', size_listed: '1 gal', size_parsed: '1 gal', price: 3.5, unit_price: 3.5, unit: 'gal' }),
    row({ store: 'B', store_id: 'b', basis: B, term: 'milk', product_id: 'b2', product: 'B milk', size_listed: '64 fl oz', size_parsed: '64 fl oz', price: 2, unit_price: 4, unit: 'gal' }),
    // A shelf store with both items: a different basket, never in this one.
    row({ store: 'S', store_id: 's', basis: 'shelf', term: 'butter', product_id: 's1', product: 'S butter', price: 0.5, unit_price: 0.5, unit: 'lb' }),
    row({ store: 'S', store_id: 's', basis: 'shelf', term: 'milk', product_id: 's2', product: 'S milk', size_parsed: '1 gal', price: 0.5, unit_price: 0.5, unit: 'gal' }),
  ];
  const b = basketTotals(rows, { zip: '60618', basis: B, terms });
  assert.deepEqual(b.complete.map((s) => [s.store_id, s.total]), [['b', 11], ['a', 11.5]], 'costed at 2 lb of butter and 1 gal of milk everywhere');
  assert.deepEqual(b.incomplete, [{ store: 'C', missing: ['milk'] }], 'the store missing milk is left out and named, not totalled');
  assert.ok(!b.complete.some((s) => s.store_id === 's'));
  // By package prices A would look cheaper (4 + 3.50 = 7.50 against 7 + 2 = 9); like for like it is not.
  assert.throws(() => basketTotals(rows, { zip: '60618', basis: 'all', terms }), CrossBasisError);
});
