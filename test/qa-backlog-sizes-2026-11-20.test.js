// The open size groups from the 18-19 Nov review of every cached Thanksgiving answer (1,107 answers in
// 41 metro ZIPs), fixed and re-measured on 20 Nov 2026.
//
// - A row stated in one dimension whose URL slug states the other was left out of an answer in that
//   other dimension, however cheap: Walmart's two pie crusts at $1.36 ("2 ct", slug "...-16-oz") and
//   ALDI's at $1.88 were missing from pie crust in 26 of 32 ZIPs; Walmart's "12 oz" brown-and-serve
//   dozen (slug "...-12-ct") had no price per roll. The slug's figure is now a second unit price, an
//   estimate that never chooses the answer's dimension.
// - BJ's "Foxy Organic Celery Hearts", "4 each" at $2.59, was priced per heart and won celery in four ZIPs.
// - Canned solids stated in fl oz (Kroger's "Kroger Pumpkin, 29oz", Costco's Campbell's 12-pack) had
//   only a price per gallon in an answer by weight.
// - A whole turkey stated at 18 or 20 oz, a "1 ct" sweet potato under a per-lb slug, a bag of rolls
//   stated "1 each", reversed cream names and a bare "qt".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct, slugMeasure, slugPieces } from '../src/normalize.js';
import { bestPerStore, dominantDim, savingsClaim, standings } from '../shared/compare.js';
import { parseSize, coerceSolid } from '../shared/units.js';

let seq = 0;
const row = (storeId, name, sizeText, price, extra = {}) => makeProduct({ storeId, id: String(++seq), name, sizeText, price, soldBy: 'each', ...extra });
const perLb = (p) => (p.unit.weight ? Math.round(p.unit.weight.perBase * 1600) / 100 : null);
const url = (slug, store = 'walmart') => `https://www.instacart.com/products/${++seq}-${slug}?retailerSlug=${store}`;

test('DEFECT: a count-stated pie crust is priced by the weight its slug states', () => {
  const walmart = row('walmart', 'Great Value 2 Pack 9 Inch Deep Dish Pie Crusts', '2 ct', 1.36, { category: 'Pie Crusts', url: url('great-value-deep-dish-pie-crusts-16-oz') });
  assert.equal(walmart.dim, 'count');
  assert.equal(walmart.unit.count.perBase, 0.68);
  assert.equal(perLb(walmart), 1.36);
  assert.equal(walmart.unit.weight.est, true);
  assert.equal(walmart.unit.weight.slug, true);
  assert.equal(walmart.size, '2 ct · 16 oz');
  const aldi = row('aldi', 'Bake House Creations Pie Crusts - 2 Count', '2 ct', 1.88, { url: 'https://www.aldi.us/store/aldi/products/31794298-bake-house-creations-pie-crust-14-1-oz' });
  assert.equal(perLb(aldi), 2.13);
  // A three-digit decimal: Costco's "Pillsbury 9\" Pie Crusts, 8-count" is "...-56-400-oz", 56.4 oz.
  const costco = row('costco', 'Pillsbury 9" Pie Crusts, 8-count', 'each', 8.7, { url: url('pillsbury-pie-crusts-8-count-56-400-oz', 'costco') });
  assert.equal(costco.size, '8 ct · 56.4 oz');
  assert.equal(perLb(costco), 2.47);
});

test('DEFECT: a weight-stated dozen of rolls is priced per roll by the count its slug states', () => {
  const rolls = row('walmart', "Great Value Brown'n Serve Enriched Dinner Rolls", '12 oz', 1.05, { url: url('great-value-enriched-brown-n-serve-dinner-rolls-12-ct') });
  assert.equal(rolls.dim, 'weight');
  assert.equal(Math.round(rolls.unit.count.perBase * 1000) / 1000, 0.088);
  assert.equal(rolls.unit.count.slug, true);
  assert.equal(rolls.size, '12 oz · 12 ct');
});

test('control: the slug settles nothing when it is unclear, a pack, a turkey, produce or a conflict', () => {
  // A pound with a decimal may be a range ("3-5-lb"), so it is no weight at all.
  assert.equal(slugMeasure('https://www.instacart.com/products/1-hen-turkey-3-5-lb'), null);
  // Two figures that disagree.
  assert.equal(slugMeasure('https://www.instacart.com/products/1-crusts-12-oz-16-oz'), null);
  assert.equal(slugMeasure('https://www.instacart.com/products/1-crusts-12-oz-12-0-oz').base, 12);
  // A pack is not pieces; a count of one says nothing.
  assert.equal(slugPieces('https://www.instacart.com/products/1-rolls-4-pk'), null);
  assert.equal(slugPieces('https://www.instacart.com/products/1-rolls-1-ct'), null);
  assert.equal(slugPieces('https://www.instacart.com/products/1-rolls-12-ct'), 12);
  // A turkey is weighed at the till, and loose produce's "1 lb" is the catalogue's price per pound.
  assert.equal(row('foodcity', 'Butterball Frozen Whole Turkey', '1 each', 24.99, { url: url('butterball-frozen-whole-turkey-12-lb') }).unit.weight?.slug, undefined);
  assert.equal(row('kroger', 'Yellow Onion', '1 each', 0.89, { url: url('yellow-onion-1-lb') }).unit.weight?.slug, undefined);
  // A row stated by weight whose slug states a weight gains nothing.
  const crust = row('kroger', 'Kroger Deep Dish Pie Crust', '16 oz', 2.79, { url: url('kroger-deep-dish-pie-crust-16-oz') });
  assert.equal(crust.size, '16 oz');
  assert.deepEqual(Object.keys(crust.unit), ['weight']);
  // A row whose own figures disagree keeps no unit price at all.
  const mixed = row('kingsoopers', 'KRO TURKEY STUFFING MIX', '2 ct', 1.09, { url: url('kroger-sugar-cinnamon-mini-pretzel-20-oz') });
  assert.ok(mixed.sizeConflict);
  assert.deepEqual(mixed.unit, {});
});

test('DEFECT: the slug figure wins pie crust, as an estimate that changes no dimension and claims no percent', () => {
  const tj = row('traderjoes', 'Pie Crusts', '22 oz', 4.49);
  const kroger = row('kroger', 'Kroger Deep Dish Pie Crust', '16 oz', 2.99);
  const pills = row('target', 'Pillsbury Refrigerated Pie Crusts', '14.1 oz', 3.99);
  const walmart = row('walmart', 'Great Value 2 Pack 9 Inch Deep Dish Pie Crusts', '2 ct', 1.36, { url: url('great-value-deep-dish-pie-crusts-16-oz') });
  const best = bestPerStore('pie crust', { traderjoes: [tj], kroger: [kroger], target: [pills], walmart: [walmart] });
  assert.equal(best.dim, 'weight');
  assert.equal(best.stores.walmart.item.name, walmart.name);
  assert.equal(best.stores.walmart.unit.est, true);
  const rows = standings(best.stores);
  assert.equal(rows[0].storeId, 'walmart');
  const claim = savingsClaim(rows[0], rows[1]);
  assert.notEqual(claim?.kind, 'exact');
});

test('control: slug figures never choose the dimension', () => {
  // Three count-stated crusts with slug weights against two by weight: still by count, as before.
  const items = [
    row('a', 'Crusts 2 ct', '2 ct', 1.5, { url: url('crusts-16-oz') }),
    row('b', 'Crusts 2 ct', '2 ct', 1.6, { url: url('crusts-16-oz') }),
    row('c', 'Crusts 2 ct', '2 ct', 1.7, { url: url('crusts-16-oz') }),
    row('d', 'Crusts', '14.1 oz', 3.5),
    row('e', 'Crusts', '15 oz', 3.6),
  ];
  assert.equal(dominantDim(items), 'count');
});

test('DEFECT: a bag of celery hearts is one package, whatever it counts', () => {
  const bjs = row('bjs', 'Foxy Organic Organic Celery Hearts', '4 each', 2.59, { url: url('foxy-organic-organic-celery-hearts', 'bjs') });
  assert.equal(bjs.base, 1);
  assert.equal(bjs.unit.count.perBase, 2.59);
  assert.equal(bjs.size, '1 pack · 4 each');
  assert.equal(bjs.sizeSource, 'derived');
  // A bag stated by weight gets no price per heart from its slug's "2-ct" either.
  const bravo = row('bravo', 'Superior Celery Hearts', '20 oz', 2.18, { url: url('superior-celery-hearts-2-ct') });
  assert.equal(bravo.unit.count, undefined);
  // Control: a bunch is one bunch.
  assert.equal(row('aldi', 'Celery', '1 each', 0.95).unit.count.perBase, 0.95);
});

test('DEFECT: a canned solid stated in fl oz is its net weight', () => {
  const kroger = row('kroger', 'Kroger Pumpkin, 29oz', '29 fl oz', 2.99, { category: 'Canned Pumpkin' });
  assert.equal(kroger.dim, 'weight');
  assert.equal(perLb(kroger), 1.65);
  const vons = row('vons', 'O Organics Pumpkin, 100% Pure, Solid Pack', '15 fl oz', 2.99);
  assert.equal(vons.dim, 'weight');
  const soup = row('costco', "Campbell's, Cream of Mushroom Soup, 10.5 fl oz, 12-Count", 'each', 12.43, { category: 'Canned Soup' });
  assert.equal(soup.dim, 'weight');
  assert.equal(soup.base, 126);
  assert.equal(perLb(soup), 1.58);
  assert.equal(row('safeway', 'O Organics Green Beans, No Salt Added, Cut', '14.5 fl oz', 1.99, { category: 'Canned Green Beans' }).dim, 'weight');
});

test('control: drinks, desserts and other things with those words stay by volume', () => {
  const vol = (name, sizeText, category) => row('x', name, sizeText, 4.99, { category }).dim;
  assert.equal(vol('REBBL Protein, Spiced Pumpkin Pie', '12 fl oz', 'Protein Drinks'), 'volume');
  assert.equal(vol('Hood Pumpkin Eggnog', '32 fl oz', 'Eggnog'), 'volume');
  assert.equal(vol('Wegmans Pumpkin Pie Ice Cream, Limited Edition', '48 fl oz', 'Ice Cream Tubs'), 'volume');
  assert.equal(vol('Nestle Nestle Lite Cream', '7.6 fl oz', 'Condensed Milk'), 'volume');
  assert.equal(vol('Decoart Crafter\'s Acrylic Paint - Pure Pumpkin', '2 fl oz', 'Acrylic Paint'), 'volume');
  assert.equal(vol('Blue Point Mother Pumpkin', '12 fl oz', 'Other Ales'), 'volume');
  assert.equal(vol('W2GO Pumpkin Bisque', '24 fl oz', 'Prepared Soups'), 'volume');
  // Millilitres are left alone: 348 ml is the metric volume of a 14 oz can, not 11.8 oz of it.
  assert.equal(coerceSolid(parseSize('348 ml'), 'Ocean Spray Whole Cranberry Sauce Canned Cranberries').unit, 'ml');
});

test('DEFECT: cream named backwards or plainly, and a bare "qt", are volumes', () => {
  assert.equal(row('wholefoods', 'Cream Heavy Whipping', '32 oz', 12.99).dim, 'volume');
  assert.equal(row('bashas', 'Danzeisen Dairy Cream', '16 oz', 5.99).dim, 'volume');
  const weis = row('weis', 'Dairy Star Heavy Whipping Cream', 'qt', 6.69);
  assert.equal(weis.dim, 'volume');
  assert.equal(weis.base, 32);
  assert.deepEqual(parseSize('gal'), parseSize('1 gal'));
  // Controls: cream cheese is sold by weight; a bare "lb" is still a price per pound.
  assert.equal(row('x', 'Philadelphia Dairy Cream Cheese', '8 oz', 2.99).dim, 'weight');
  assert.equal(parseSize('lb').perWeight, true);
});

test('DEFECT: a whole turkey stated at a few ounces has no unit price', () => {
  const fairway = row('fairway', 'Maplecrest 10-12 Natural Turkey', '18 oz', 2.21, { category: 'Whole Turkey' });
  assert.ok(fairway.sizeConflict);
  assert.deepEqual(fairway.unit, {});
  assert.ok(row('weis', 'Weis Young Turkey', '20 oz', 10.39).sizeConflict);
});

test('control: "1 lb" is a price per pound, and a breast or ground turkey may weigh a pound', () => {
  const hen = row('stopandshop', 'Shady Brook Farms® Hen Turkey Frozen', '1 lb', 0.59, { category: 'Frozen Whole Turkey' });
  assert.equal(hen.sizeConflict, null);
  assert.equal(perLb(hen), 0.59);
  assert.equal(row('x', 'Boneless Turkey Breast Roast', '2 lb', 9.99).sizeConflict, null);
  assert.equal(row('x', 'Jennie-O Lean Ground Turkey', '16 oz', 4.99).sizeConflict, null);
});

test('DEFECT: a "1 ct" sweet potato under a per-lb slug gets no per-piece estimate', () => {
  const kroger = row('kroger', 'Sweet Potato', '1 ct', 0.99, { url: url('golden-sweet-potatoes-yams-per-lb', 'kroger') });
  assert.equal(kroger.unit.weight, undefined);
  // Control: without the slug it is one 0.6 lb potato, estimated.
  assert.equal(row('kroger', 'Sweet Potato', '1 ct', 0.99).unit.weight.est, true);
});

test('DEFECT: a bag of rolls stated "1 each" has no price per roll', () => {
  const ng = row('naturalgrocers', 'Natural Grocers Brand Products Organic Hawaiian Rolls', '1 each', 6.29);
  assert.equal(ng.unit.count, undefined);
  // Controls: a stated count stands, and a paper towel roll is not bread.
  assert.equal(row('x', "King's Hawaiian Original Hawaiian Sweet Rolls", '12 ct', 3.99).unit.count.perBase, 3.99 / 12);
  assert.equal(row('x', 'Bounty Paper Towels Double Rolls', '1 each', 2.99).unit.count.perBase, 2.99);
});

test('DEFECT: a club states one box or one pound of butter under a slug that weighs the pack', () => {
  const sams = row('samsclub', 'Member’s Mark Salted Sweet Cream Butter Sticks', '16 oz', 11.88, { category: 'Salted Butter', url: url('member-s-mark-salted-sweet-cream-butter-sticks-4-lb', 'sams-club') });
  assert.equal(sams.base, 64);
  assert.equal(perLb(sams), 2.97);
  assert.equal(sams.size, '4 × 16 oz');
  assert.equal(sams.sizeSource, 'derived');
  const kerrygold = row('bjs', 'Kerrygold Unsalted Pure Irish Butter', '4 oz', 17.19, { category: 'Unsalted Butter', url: url('kerrygold-unsalted-pure-irish-butter-24-oz', 'bjs') });
  assert.equal(perLb(kerrygold), 11.46);
  const wellsley = row('bjs', 'Wellsley Farms All Natural Salted Butter', '4 ct', 11.49, { category: 'Salted Butter', url: url('wellsley-farms-all-natural-salted-butter-1lb', 'bjs') });
  assert.equal(wellsley.base, 64);
  assert.equal(perLb(wellsley), 2.87);
});

test('control: the same shapes outside a club, or outside the butter aisle, are left as they were', () => {
  // At a supermarket "4 ea" under a 16 oz slug is four sticks, as before.
  const lucerne = row('jewel', 'Lucerne Salted Butter', '4 ea', 4.99, { category: 'Salted Butter', url: url('lucerne-butter-sweet-cream-salted-16-oz', 'jewel-osco') });
  assert.equal(lucerne.base, 16);
  assert.equal(perLb(lucerne), 4.99);
  // A club's chocolate whose slug lost its decimal point ("214-oz" for 21.4 oz) is not ten bags.
  const choc = row('costco', 'Ghirardelli Premium Chocolate Assortment Squares, 21.4 oz Bag', '21.4 oz', 15.91, { category: 'Chocolate Candies', url: url('ghirardelli-premium-chocolate-assortment-squares-214-oz', 'costco') });
  assert.equal(choc.base, 21.4);
  // ...and the slug dimension refuses three whole digits of ounces for the same reason.
  assert.equal(slugMeasure('https://www.instacart.com/products/1-crusts-141-oz'), null);
  assert.equal(slugMeasure('https://www.instacart.com/products/1-crusts-14-1-oz').base, 14.1);
});
