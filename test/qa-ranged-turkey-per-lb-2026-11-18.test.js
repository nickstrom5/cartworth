// Thanksgiving core list, Portland (18 Nov 2026): Fred Meyer's "Butterball Fresh Bone-In Turkey Breast,
// All Natural, 3-9 lbs., Serves 3-5" came as stated "6 lb", sold "each", $2.99. The $2.99 buys a
// pound; divided over the 6 lb it was the city's best turkey breast at $0.50/lb, "81% less than the
// next-best store". The QA cache held the same shape at Smith's ($0.08/lb), Giant ($0.02/lb) and
// Martin's. A turkey with a weight range in its name, 3 lb or more, priced "each" under what a bird
// costs (TURKEY_EACH_MIN) is a price per pound: it keeps its price and loses its unit price.
// And Salt Lake City: Costco's "Lehi Roller Mills Turkey Flour, 25 lbs" answered "turkey" at $0.64/lb.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '../src/normalize.js';
import { relevance, RELEVANT } from '../shared/match.js';

const row = (o) => makeProduct({ storeId: 'x', id: '1', soldBy: 'each', category: 'Turkey Breast', ...o });

test('DEFECT: a ranged turkey priced "each" under a bird\'s price is priced per lb', () => {
  for (const o of [
    { name: 'Butterball Fresh Bone-In Turkey Breast, All Natural, 3-9 lbs., Serves 3-5', sizeText: '6 lb', price: 2.99, url: 'https://www.instacart.com/products/16969820-butterball-whole-fresh-all-natural-with-ribs-back-portion-turkey-breast-1-ea?retailerSlug=fred-meyer' },
    { name: 'Jennie-O Whole Fresh Turkey (16-20 lb)', sizeText: '20 lb', price: 1.59, url: 'https://www.instacart.com/products/478281-jennie-o-whole-fresh-turkey-20-lb?retailerSlug=smiths' },
    { name: 'Shady Brook Farms® 24-26 Pound Frozen Turkey', sizeText: '1 each', price: 0.49, url: 'https://www.instacart.com/products/1-shady-brook-farms-24-26-pound-frozen-turkey-each?retailerSlug=giant' },
    { name: 'Frozen Whole Turkey 16-20 lb', sizeText: '1 each', price: 1.99, url: 'https://www.instacart.com/products/1-frozen-whole-turkey-16-20-lb-1-each?retailerSlug=martins' },
  ]) {
    const p = row(o);
    assert.equal(p.sizeConflict?.name, 'priced per lb', o.name);
    assert.equal(p.price, o.price);
    assert.equal(p.unit?.weight, undefined, `${o.name}: no unit price`);
  }
});

test('control: a real each price, a per-lb listing, a fixed weight and another food stand', () => {
  const each = row({ name: 'Kroger® Tender and Juicy Whole Frozen Turkey (14-16 lb) - Limit 5 at sale retail', sizeText: '1 each', price: 18.99, url: 'https://www.instacart.com/products/1-kroger-whole-frozen-turkey-14-16-lb-1-each' });
  assert.equal(each.sizeConflict, null);
  const perLb = row({ name: 'Jennie-O Basted Frozen Turkey Breast (4-9 lb)', sizeText: '9 lb', soldBy: 'lb', price: 2.69, url: 'https://www.instacart.com/products/20744266-jennie-o-basted-frozen-turkey-breast-9-lb' });
  assert.equal(perLb.sizeConflict, null);
  assert.equal(perLb.sizeSource, 'perLb');
  const fixed = row({ name: 'JENNIE-O OVEN READY Boneless Turkey Breast - 2.75 lb.', sizeText: '2.75 lb', price: 8.99, url: 'https://www.instacart.com/products/73495-jennie-o-oven-ready-boneless-turkey-breast-2-75-lb' });
  assert.equal(fixed.sizeConflict, null);
  const pumpkin = row({ name: 'Pumpkin (average weight 15-20lbs)', sizeText: '1 each', price: 6.89, category: 'Pumpkins', url: 'https://www.instacart.com/products/2784771-pumpkin-each' });
  assert.notEqual(pumpkin.sizeConflict?.name, 'priced per lb');
});

test('DEFECT: turkey flour is not turkey', () => {
  for (const q of ['turkey', 'whole turkey', 'fresh turkey']) {
    assert.ok(relevance(q, { name: 'Lehi Roller Mills Turkey Flour, 25 lbs', category: 'Bread Flour' }) < RELEVANT, q);
    assert.ok(relevance(q, { name: 'Lehi Roller Mills Turkey Flour, 25 lbs' }) < RELEVANT, `${q}, no aisle`);
  }
});

test('control: birds still answer turkey, and the flour answers its own name', () => {
  assert.ok(relevance('turkey', { name: 'Norbest Frozen Tom Turkey', category: 'Frozen Whole Turkey' }) >= RELEVANT);
  assert.ok(relevance('turkey', { name: 'Butterball Frozen Whole Turkey' }) >= RELEVANT);
  assert.ok(relevance('turkey flour', { name: 'Lehi Roller Mills Turkey Flour, 25 lbs', category: 'Bread Flour' }) >= RELEVANT);
});
