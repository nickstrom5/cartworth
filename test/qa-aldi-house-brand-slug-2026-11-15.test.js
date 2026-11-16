// Thanksgiving core list, Birmingham (15 Nov 2026): ALDI's "ALDI Evaporated Milk", 12 fl oz at
// 79-95¢, had the listing URL ".../18647623-baker-s-corner-vitamin-d-added-12-fl-oz". ALDI renames its
// house brands "ALDI <product>" on Instacart and the slug keeps the brand (Baker's Corner), so not one
// word agreed and slugProductConflict called it another product's listing. The row lost its unit
// price in 8 of the 13 states with an ALDI that the runs had priced, and evaporated milk went to organic cans at $2.88. A
// slug that is only a house brand and label words names no product, so it contradicts nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct, slugProductConflict } from '../src/normalize.js';

const ALDI = 'https://www.aldi.us/store/aldi/products/18647623-baker-s-corner-vitamin-d-added-12-fl-oz';

test('DEFECT: a house brand and label words in the slug is not another product', () => {
  assert.equal(slugProductConflict('ALDI Evaporated Milk', ALDI), null);
  const p = makeProduct({ storeId: 'aldi', id: '18647623', name: 'ALDI Evaporated Milk', size: '12 fl oz', sizeText: '12 oz', price: 0.79, url: ALDI, category: 'Evaporated Milk' });
  assert.equal(p.sizeConflict, null);
  assert.ok(p.unit.volume, 'priced per volume');
});

test('control: a slug naming a different product is still a conflict, house brand or not', () => {
  assert.ok(slugProductConflict('KRO TURKEY STUFFING MIX', 'https://x/products/19275341-kroger-sugar-cinnamon-mini-pretzel-20-oz'));
  assert.ok(slugProductConflict('Merry Moments Trees Scrubbing Dishcloths', 'https://x/products/1-hazelnut-spread'));
  assert.ok(slugProductConflict('ALDI Evaporated Milk', 'https://x/products/1-baker-s-corner-chocolate-almond-bark-24-oz'));
  assert.ok(slugProductConflict('ALDI Evaporated Milk', 'https://x/products/1-friendly-farms-organic-hazelnut-creamer-32-fl-oz'));
});
