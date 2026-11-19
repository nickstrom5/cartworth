// Thanksgiving core list, Albuquerque (18 Nov 2026): Smith's listed "Butterball Fresh Premium Young
// Turkey" by the pound at $0.10 (and "Butterball Turkey, Young, Premium" at the same), beside its
// other fresh Butterball at $1.99/lb. It was the city's best "whole turkey" and "fresh turkey", "90%
// less than the next-best store". The same rows in Salt Lake City were caught only because the
// median there was high enough for the 1/30 floor. Of 35,389 cached rows sold by the pound, the three
// at 10c or less are all placeholders (these two and Natural Grocers' 9c/lb bell pepper); the next,
// El Super's 25c/lb yellow onions, is real. A price per pound of 10c or less is flagged whatever
// the others cost, and is kept out of the median they are judged by.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '../src/normalize.js';
import { bestPerStore, standings, flagImplausible, PER_LB_PLACEHOLDER } from '../shared/compare.js';

let seq = 0;
const lb = (storeId, name, price, extra = {}) => makeProduct({ storeId, id: String(++seq), name, sizeText: '1 each', soldBy: 'lb', price, category: 'Whole Turkey', url: `https://x/products/${seq}-per-lb`, ...extra });
const each = (storeId, name, sizeText, price, extra = {}) => makeProduct({ storeId, id: String(++seq), name, sizeText, soldBy: 'each', price, url: `https://x/products/${seq}-each`, ...extra });

const albuquerque = () => ({
  smiths: [
    lb('smiths', 'Butterball Fresh Premium Young Turkey', 0.1, { estEach: 1.3 }),
    lb('smiths', 'Butterball Turkey, Young, Premium', 0.1, { estEach: 1.8 }),
    lb('smiths', 'Butterball Whole Fresh Turkey', 1.99),
    lb('smiths', 'Kroger Tender and Juicy Whole Frozen Turkey (10-14 lb)', 0.99, { category: 'Frozen Whole Turkey' }),
  ],
  marketstreet: [lb('marketstreet', 'Honeysuckle White Frozen Whole Turkey 16-20 lb', 0.99, { category: 'Frozen Whole Turkey' })],
  costco: [lb('costco', 'Fresh Tom Turkey', 1.23)],
  sprouts: [lb('sprouts', 'Sprouts Fresh Whole Turkey', 2.49)],
});

test('DEFECT: a turkey at 10c a pound is a placeholder, never the best price', () => {
  assert.equal(PER_LB_PLACEHOLDER, 0.1);
  for (const q of ['whole turkey', 'fresh turkey', 'turkey']) {
    const results = albuquerque();
    const best = bestPerStore(q, results, { prefs: { cardPrices: true } });
    const rows = standings(best.stores);
    assert.ok(best.stores[rows[0].storeId].item.price >= 0.99, `${q}: best is ${best.stores[rows[0].storeId].item.name}`);
    assert.ok(best.stores.smiths.item.price >= 0.99, `${q}: Smith's answer is a real price`);
    for (const p of results.smiths.slice(0, 2)) {
      assert.equal(p.implausible?.placeholder, true, p.name);
      assert.equal(p.implausible.direction, 'low');
    }
  }
});

test('DEFECT: a placeholder is flagged with nothing to compare it with, and by the piece too', () => {
  // Two rows: too few for a median, flagged all the same.
  const two = { smiths: [lb('smiths', 'Butterball Fresh Premium Young Turkey', 0.1), lb('smiths', 'Butterball Whole Fresh Turkey', 1.99)] };
  const best = bestPerStore('whole turkey', two);
  assert.equal(best.stores.smiths.item.price, 1.99);
  assert.equal(two.smiths[0].implausible?.placeholder, true);
  // Natural Grocers' bell pepper at 9c/lb carried an estimated 3c each; peppers compare by the piece.
  const peppers = {
    naturalgrocers: [lb('naturalgrocers', 'Green Bell Pepper', 0.09, { estEach: 0.03, category: 'Green Bell Peppers' })],
    kroger: [each('kroger', 'Green Bell Pepper', '1 each', 0.89, { category: 'Green Bell Peppers' })],
    aldi: [each('aldi', 'Green Bell Peppers', '3 ct', 2.29, { category: 'Green Bell Peppers' })],
  };
  const b = bestPerStore('green bell pepper', peppers);
  assert.equal(b.stores.naturalgrocers, undefined, 'the placeholder is not a store answer');
  assert.equal(peppers.naturalgrocers[0].implausible?.placeholder, true);
});

test('REVIEW: a placeholder as a card price, or as a pound for a dime, is flagged too', () => {
  const card = () => ({ ...albuquerque(), smiths: [lb('smiths', 'Butterball Fresh Premium Young Turkey', 1.99, { memberPrice: 0.1, memberLabel: 'Card price' }), lb('smiths', 'Butterball Whole Fresh Turkey', 1.99)] });
  let r = card();
  let best = bestPerStore('whole turkey', r, { prefs: { cardPrices: true } });
  assert.equal(r.smiths[0].implausible?.placeholder, true);
  assert.ok(best.stores[standings(best.stores)[0].storeId].item.price >= 0.99);
  // With card prices off the row is priced at its list price, which is real.
  r = card();
  best = bestPerStore('whole turkey', r, { prefs: { cardPrices: false } });
  assert.equal(r.smiths[0].implausible, undefined);
  const pound = { ...albuquerque(), smiths: [each('smiths', 'Butterball Fresh Premium Young Turkey', '1 lb', 0.1, { category: 'Whole Turkey' }), lb('smiths', 'Butterball Whole Fresh Turkey', 1.99)] };
  best = bestPerStore('whole turkey', pound, { prefs: { cardPrices: true } });
  assert.equal(pound.smiths[0].implausible?.placeholder, true);
  assert.equal(best.stores.smiths.item.price, 1.99);
  // A dime for a lime is a price: only a pound or more, or a price by the pound, is a placeholder.
  assert.equal(flagImplausible([each('x', 'Limes', '1 each', 0.1, { category: 'Limes' })], 'count')[0].implausible, undefined);
});

test('control: real prices by the pound stand, and the placeholder does not move their median', () => {
  // A 37c/lb doorbuster among dearer birds.
  const birds = { giant: [lb('giant', 'Shady Brook Farms Young Turkey All Natural Frozen', 0.37)], aldi: [lb('aldi', 'Butterball Frozen Whole Turkey', 0.79)], publix: [lb('publix', 'Publix Whole Turkey', 0.65)], wholefoods: [lb('wholefoods', 'Whole Turkey: 12-14 lbs', 3.49)], sprouts: [lb('sprouts', 'Sprouts Fresh Whole Turkey', 2.49)] };
  const b = bestPerStore('whole turkey', birds);
  assert.equal(standings(b.stores)[0].storeId, 'giant');
  assert.equal(birds.giant[0].implausible, undefined);
  // El Super's 25c/lb onions are real.
  const onions = { elsuper: [lb('elsuper', 'Yellow Onion', 0.25, { category: 'Yellow Onions' })], aldi: [each('aldi', 'Fresh Yellow Onions', '3 lb', 2.39, { category: 'Yellow Onions' })], kroger: [lb('kroger', 'Yellow Onion', 1.19, { category: 'Yellow Onions' })], walmart: [each('walmart', 'Yellow Onions', '3 lb', 2.94, { category: 'Yellow Onions' })] };
  const o = bestPerStore('onions', onions);
  assert.equal(standings(o.stores)[0].storeId, 'elsuper');
  assert.equal(onions.elsuper[0].implausible, undefined);
  // Eleven cents a pound is not ten.
  assert.equal(flagImplausible([lb('x', 'Cabbage', 0.11, { category: 'Cabbage' })], 'weight')[0].implausible, undefined);
  // The median the others are judged by leaves the placeholder out: four real rows at $1 with a
  // placeholder beside them are all still fine.
  const rows = [lb('a', 'Whole Turkey', 0.1), lb('b', 'Whole Turkey', 1), lb('c', 'Whole Turkey', 1), lb('d', 'Whole Turkey', 1), lb('e', 'Whole Turkey', 1)];
  flagImplausible(rows, 'weight');
  assert.deepEqual(rows.map((p) => !!p.implausible), [true, false, false, false, false]);
  assert.equal(rows[0].implausible.ratio, 0.1);
});
