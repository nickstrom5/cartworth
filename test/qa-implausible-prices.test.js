// A wrong price is worse than no price. This product is sold on the number being trustworthy, so
// a confidently-wrong figure is the most damaging defect available.
//
// Every wrong price found in live data has been one of two shapes:
//   1. a case priced as one unit (warehouse clubs state one unit's size, charge for the case)
//   2. the searched word acting as a modifier of a different food ("butter popcorn")
// Both land an order of magnitude away from every other result for the same query, and because it
// is usually far BELOW, the wrong item wins "best price" and becomes the headline.
//
// The guard flags rather than hides: the item still appears, carrying the flag, so the UI can say
// the price looks wrong instead of pretending it is right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPerStore, flagImplausible, dominantDim } from '../shared/compare.js';
import { makeProduct } from '../src/normalize.js';

const item = (storeId, name, sizeText, price) => makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price });

// Six honest butter listings and one case-priced outlier.
const butter = {
  aldi: [item('aldi', 'Countryside Creamery Salted Butter', '16 oz', 3.15)],
  jewel: [item('jewel', 'Land O Lakes Salted Butter', '16 oz', 4.99)],
  marianos: [item('marianos', 'Kroger Salted Butter', '16 oz', 4.49)],
  traderjoes: [item('traderjoes', 'Butter Quarters, Salted', '16 oz', 2.99)],
  woodmans: [item('woodmans', 'Salted Butter Quarters', '16 oz', 2.99)],
  wholefoods: [item('wholefoods', '365 Salted Butter', '16 oz', 4.29)],
  // Sam's Club states one 4 oz stick's size but charges for the multi-pack.
  samsclub: [item('samsclub', 'Kerrygold Salted Irish Butter Sticks', '4 oz', 14.6)],
};

test('a case-priced outlier is flagged and never wins best price', () => {
  const { dim, stores } = bestPerStore('butter', butter, {});
  assert.equal(dim, 'weight');
  const sams = butter.samsclub[0];
  assert.ok(sams.implausible, 'the $58/lb listing was not flagged');
  assert.equal(sams.implausible.direction, 'high');
  assert.equal(stores.samsclub, undefined, "a price we cannot believe became a store's headline number");
  // Every honest store still reports a winner.
  for (const s of ['aldi', 'jewel', 'marianos', 'traderjoes', 'woodmans', 'wholefoods']) {
    assert.ok(stores[s], `${s} lost its best price`);
    assert.equal(stores[s].item.implausible, undefined);
  }
});

test('an implausibly CHEAP price is flagged too, because that is the one that misleads', () => {
  const withCheap = { ...butter, cheap: [item('cheap', 'Salted Butter', '16 oz', 0.12)] };
  const { stores } = bestPerStore('butter', withCheap, {});
  assert.ok(withCheap.cheap[0].implausible, 'a 25x-too-cheap butter was not flagged');
  assert.equal(withCheap.cheap[0].implausible.direction, 'low');
  assert.equal(stores.cheap, undefined, 'an unbelievable price won the comparison');
});

test('genuine variation is left alone', () => {
  // Organic against store brand is a real spread and must not be touched.
  const spread = {
    a: [item('a', 'Store Brand Salted Butter', '16 oz', 2.99)],
    b: [item('b', 'Organic Grass-Fed Salted Butter', '16 oz', 8.99)],
    c: [item('c', 'Salted Butter', '16 oz', 4.49)],
    d: [item('d', 'Irish Salted Butter', '8 oz', 4.99)],
    e: [item('e', 'Salted Butter Quarters', '16 oz', 3.49)],
  };
  bestPerStore('butter', spread, {});
  for (const k of Object.keys(spread)) {
    assert.equal(spread[k][0].implausible, undefined, `${k} was wrongly flagged: 3x spread is normal`);
  }
});

test('too few results to judge means nothing is flagged', () => {
  // With three results you cannot tell an outlier from a genuinely cheap store, so claim nothing.
  const three = [item('a', 'Salted Butter', '16 oz', 3.49), item('b', 'Salted Butter', '16 oz', 3.99), item('c', 'Salted Butter', '4 oz', 14.6)];
  flagImplausible(three, dominantDim(three), {});
  for (const p of three) assert.equal(p.implausible, undefined, 'flagged an outlier from too small a sample');
});

test('the flagged item is still returned, not hidden', () => {
  const { stores } = bestPerStore('butter', butter, {});
  // It lost the headline, but the object itself still carries its price and its flag so the UI can
  // show it and say why it looks wrong.
  const sams = butter.samsclub[0];
  assert.ok(sams.price > 0, 'the price was destroyed rather than flagged');
  assert.ok(sams.implausible.median > 0);
  assert.ok(Object.keys(stores).length >= 6);
});
