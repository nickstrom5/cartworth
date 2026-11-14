// Thanksgiving core list, last six states (14 Nov 2026): a whole turkey listed "1 ea" at $5.19-$5.79
// was read as one bird, spread over the typical 14 lb, and won "whole turkey" at 37-41¢/lb in four of
// six states: Kowalski's "KWL Organic Fresh Whole Turkey" $5.49 (Minneapolis), Bravo's "Jennie-O
// Frozen Whole Young Turkey" $5.19 (Queens), Weis' "David Elliot Frozen Kosher Turkey" $5.79
// (Philadelphia), Metropolitan Market's "Free Range Brined Turkey" $5.29 (Seattle). No store sells
// an organic bird for $5.49: these are prices per pound under an "each" label. TURKEY_EACH_MIN rose
// from $5 to $10; a bird sold whole costs that and more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '../src/normalize.js';
import { relevance, RELEVANT } from '../shared/match.js';

const item = (storeId, name, sizeText, price) => makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price });

test('DEFECT: a whole turkey "1 ea" at $5-$6 is not priced as a 14 lb bird', () => {
  for (const [store, name, price] of [
    ['kowalskis', 'KWL Organic Fresh Whole Turkey', 5.49],
    ['bravo', 'Jennie-O Frozen Whole Young Turkey', 5.19],
    ['weis', 'David Elliot Frozen Kosher Whole Turkey', 5.79],
    ['metropolitanmarket', 'Metropolitan Market Free Range Brined Whole Turkey', 5.29],
  ]) {
    assert.equal(item(store, name, '1 ea', price).unit.weight, undefined, `${name} $${price}`);
  }
});

test('control: a bird priced whole at $10 and up is still estimated per pound', () => {
  const marcs = item('marcs', 'Butterball Whole Turkey', '1 ea', 10.19);
  assert.equal(Math.round(marcs.unit.weight.perBase * 16 * 100) / 100, 0.73);
  assert.equal(marcs.unit.weight.est, true);
  assert.ok(item('x', 'Jennie-O Frozen Whole Turkey', '1 each', 12.99).unit.weight);
});

// Same run: Bravo's "Lady Linda Pecan Twirls" (a pastry, 99¢) was Queens' best "pecans", and Whole
// Foods' "Organic Raisin Pecan Sliced" (a bread) Seattle's. Neither store gave an aisle.
test('DEFECT: a pastry or bread named for the nut is not the nut', () => {
  assert.ok(relevance('pecans', { name: 'Lady Linda Pecan Twirls' }) < RELEVANT);
  assert.ok(relevance('pecans', { name: 'Organic Raisin Pecan Sliced' }) < RELEVANT);
});

test('control: chopped, halved and sliced nuts still match, and so does the baked good asked for', () => {
  for (const [q, name] of [['pecans', 'Fisher Chopped Pecans'], ['pecans', 'Kirkland Signature Pecan Halves, 2 lbs'], ['almonds', 'Blue Diamond Sliced Almonds'], ['pecan pie', 'Mrs Smiths Pecan Pie'], ['pecan cookies', 'Pecan Sandies Cookies']]) {
    assert.ok(relevance(q, { name }) >= RELEVANT, `${q}: ${name}`);
  }
});
