// Thanksgiving core list, Portland (18 Nov 2026): Fred Meyer's "JENNIE-O® All Natural** Tequila Lime
// Flavor Turkey Breast Tenderloin, 24 OZ" was read as 24 fl oz because of "tequila", so it was priced
// per gallon and left the per-pound turkey comparison. The same happened to "Milk Chocolate Pecan
// Patties" and Oscar Mayer's "Chopped Ham & Water Product ... Lunch Meat".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '../src/normalize.js';

const dim = (name, sizeText) => makeProduct({ storeId: 'x', id: '1', name, sizeText, price: 4.99, soldBy: 'each' }).dim;

test('DEFECT: meat named after a drink is sold by weight', () => {
  assert.equal(dim('JENNIE-O® All Natural** Tequila Lime Flavor Turkey Breast Tenderloin, 24 OZ', '1 each'), 'weight');
  assert.equal(dim('Jennie-O Tequila Lime Boneless Turkey Tenderloin', '24 oz'), 'weight');
  assert.equal(dim('BULK FOODS Milk Chocolate Pecan Caramel Patties', '8 oz'), 'weight');
  assert.equal(dim('Oscar Mayer Chopped Ham & Water Product Sliced Deli Sandwich Lunch Meat', '16 oz'), 'weight');
});

test('control: drinks, broth and cream stated in oz are still liquids', () => {
  assert.equal(dim('Swanson Turkey Broth', '32 oz'), 'volume');
  assert.equal(dim('Organic Heavy Cream, 16 OZ', '16 oz'), 'volume');
  assert.equal(dim('Whole Milk', '64 oz'), 'volume');
});
