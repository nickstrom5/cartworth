// QA: end-to-end tests for shared/compare.js bestPerStore — the function that
// answers "which store is cheapest for X". These show the user-visible damage
// caused by the unit and relevance defects.
//
// Tests labelled "DEFECT" assert correct behavior and currently FAIL.
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-pricing-logic node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPerStore, dominantDim, referenceAmount } from '../shared/compare.js';
import { makeProduct } from '../src/normalize.js';

const P = (storeId, id, name, sizeText, price) => makeProduct({ storeId, id, name, sizeText, price });
const perLb = (u) => u.perBase * 16;

// ---------------------------------------------------------------------------
// DEFECT 15: "cheapest butter" recommends the store whose only cheap item is
// PEANUT butter. (Root cause: DEFECT 8a in match.js.)
// ---------------------------------------------------------------------------
test('DEFECT 15: "butter" must not pick peanut butter as a store\'s best butter', () => {
  const r = bestPerStore('butter', {
    jewel: [P('jewel', 'j1', 'Land O Lakes Salted Butter Sticks', '16 oz', 4.99)],
    mariano: [
      P('mariano', 'm1', 'Jif Creamy Peanut Butter', '40 oz', 7.99),
      P('mariano', 'm2', 'Challenge Unsalted Butter', '16 oz', 5.49),
    ],
  });
  const pick = r.stores.mariano.item.name;
  assert.ok(
    !/peanut/i.test(pick),
    `best "butter" at mariano = "${pick}" at $${perLb(r.stores.mariano.unit).toFixed(2)}/lb, ` +
      `beating jewel's real butter at $${perLb(r.stores.jewel.unit).toFixed(2)}/lb`
  );
});

// ---------------------------------------------------------------------------
// DEFECT 16: "cheapest cheese" recommends cream cheese over cheddar.
// (Root cause: DEFECT 8c in match.js.)
// ---------------------------------------------------------------------------
test('DEFECT 16: "cheese" must not pick cream cheese as a store\'s best cheese', () => {
  const r = bestPerStore('cheese', {
    jewel: [P('jewel', 'j1', 'Tillamook Medium Cheddar Cheese Block', '8 oz', 3.99)],
    mariano: [
      P('mariano', 'm1', 'Philadelphia Original Cream Cheese', '8 oz', 2.49),
      P('mariano', 'm2', 'Kraft Sharp Cheddar Cheese Block', '8 oz', 4.29),
    ],
  });
  const pick = r.stores.mariano.item.name;
  assert.ok(!/cream cheese/i.test(pick), `best "cheese" at mariano = "${pick}"`);
});

// ---------------------------------------------------------------------------
// DEFECT 17 (blocker): the "0.75-1.25 lb" range blowup (DEFECT 1) makes a
// store look 75x cheaper for chicken breast.
// ---------------------------------------------------------------------------
test('DEFECT 17: a weight-range package must not produce a 7-cent-per-pound chicken breast', () => {
  const r = bestPerStore('chicken breast', {
    jewel: [P('jewel', 'j1', 'Tyson Boneless Skinless Chicken Breast', '2.5 lb', 12.99)],
    mariano: [P('mariano', 'm1', 'Perdue Boneless Skinless Chicken Breast', '0.75-1.25 lb', 6.49)],
  });
  const m = perLb(r.stores.mariano.unit);
  const j = perLb(r.stores.jewel.unit);
  assert.ok(
    m > j / 3,
    `mariano $${m.toFixed(3)}/lb vs jewel $${j.toFixed(2)}/lb — the app would claim mariano is ${(j / m).toFixed(0)}x cheaper ` +
      `(size shown to the user: "${r.stores.mariano.item.size}")`
  );
});

// ---------------------------------------------------------------------------
// DEFECT 18: dimension split. The same 12-pack listed two different ways lands
// in `count` at one store and `volume` at another; dominantDim picks one and
// the other store is dropped from the comparison with no explanation.
// (Root cause: DEFECT 5 in units.js.)
// ---------------------------------------------------------------------------
test('DEFECT 18: a store must not vanish from the comparison over listing style', () => {
  const byStore = {
    jewel: [makeProduct({ storeId: 'jewel', id: 'j1', name: 'Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans', price: 8.99 })],
    mariano: [makeProduct({ storeId: 'mariano', id: 'm1', name: 'Coca-Cola Cans', sizeText: '12 pk, 12 fl oz', price: 8.49 })],
    aldi: [makeProduct({ storeId: 'aldi', id: 'a1', name: 'Coca-Cola Classic Soda', sizeText: '2 L', price: 2.79 })],
  };
  const r = bestPerStore('coca cola', byStore);
  const dropped = Object.keys(byStore).filter((s) => !r.stores[s]);
  assert.deepEqual(
    dropped, [],
    `dominantDim=${r.dim}; dropped ${dropped.join(', ')} ` +
      `(dims: ${Object.entries(byStore).map(([s, [p]]) => `${s}=${p.dim}/${p.base}`).join(' ')})`
  );
});

// ---------------------------------------------------------------------------
// Correctly-handled behavior — regression guards.
// ---------------------------------------------------------------------------
test('control: bestPerStore picks the genuinely lowest unit price', () => {
  const r = bestPerStore('orange juice', {
    jewel: [
      P('jewel', 'j1', 'Tropicana Pure Premium Orange Juice', '59 fl oz', 4.99),
      P('jewel', 'j2', 'Great Value Orange Juice', '1 gal', 7.98),
    ],
    mariano: [P('mariano', 'm1', "Florida's Natural Orange Juice", '52 fl oz', 4.49)],
  });
  assert.equal(r.dim, 'volume');
  assert.equal(r.stores.jewel.item.id, 'j2', 'the gallon is cheapest per fl oz');
  assert.ok(r.stores.jewel.unit.perBase < r.stores.mariano.unit.perBase);
});

test('control: bestPerStore never emits a zero, negative, NaN or Infinite unit price', () => {
  const r = bestPerStore('milk', {
    a: [
      P('a', '1', 'Prairie Farms Whole Milk', '1 gal', 3.49),
      P('a', '2', 'Broken Listing Whole Milk', '0 oz', 2.99),
      P('a', '3', 'Free Whole Milk', '1 gal', 0),
    ],
    b: [P('b', '1', 'Kemps Whole Milk', 'half gallon', 2.49)],
  });
  for (const [store, best] of Object.entries(r.stores)) {
    assert.ok(Number.isFinite(best.unit.perBase), `${store}: perBase=${best.unit.perBase}`);
    assert.ok(best.unit.perBase > 0, `${store}: perBase=${best.unit.perBase} for "${best.item.name}"`);
  }
});

test('control: dominantDim and referenceAmount handle empty input', () => {
  assert.equal(dominantDim([]), null);
  assert.deepEqual(bestPerStore('milk', {}), { dim: null, stores: {} });
  assert.deepEqual(bestPerStore('milk', { a: [] }), { dim: null, stores: {} });
  assert.equal(referenceAmount('milk', [], 'volume').base, 16);
  assert.equal(referenceAmount('milk', [], 'count').base, 1);
  assert.equal(referenceAmount('milk 1 gal', [], 'volume').base, 128);
});
