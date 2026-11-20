// The review of the 20 Nov backlog fixes: four reviewers ran the old and new code over every cached row
// (83,925 distinct) and over names the cache lacks, and found these. Each test is marked REVIEW.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct, slugMeasure, slugPieces } from '../src/normalize.js';
import { flagImplausible, unitFor } from '../shared/compare.js';
import { relevance, RELEVANT } from '../shared/match.js';

let seq = 0;
const row = (storeId, name, sizeText, price, extra = {}) => makeProduct({ storeId, id: String(++seq), name, sizeText, price, soldBy: 'each', ...extra });
const url = (slug, store = 'x') => `https://www.instacart.com/products/${++seq}-${slug}?retailerSlug=${store}`;
const perLb = (p) => (p.unit.weight ? Math.round(p.unit.weight.perBase * 1600) / 100 : null);
const yes = (q, p) => assert.ok(relevance(q, p) >= RELEVANT, `${p.name} should answer "${q}" (${relevance(q, p).toFixed(3)})`);
const no = (q, p) => assert.ok(relevance(q, p) < RELEVANT, `${p.name} should not answer "${q}" (${relevance(q, p).toFixed(3)})`);

test('REVIEW: the product id and a Whole Foods ASIN are not the slug\'s size', () => {
  const brioche = row('lundsbyerlys', 'L&B Brioche Dinner Rolls', '8 ct', 4.99, { url: 'https://www.instacart.com/products/57858643-l-b-brioche-dinner-rolls-8-ct?retailerSlug=lunds' });
  assert.equal(brioche.size, '8 ct');
  assert.equal(brioche.unit.volume, undefined);
  assert.equal(slugMeasure('https://www.instacart.com/products/75764907-lb-marshmallow-crispy-bar'), null);
  assert.equal(slugMeasure('https://www.wholefoodsmarket.com/product/mini-pecan-tart-3ct-b0fd3mlq6l'), null);
  // A real figure after the id is still read.
  assert.equal(slugMeasure('https://www.instacart.com/products/25403082-great-value-deep-dish-pie-crusts-16-oz').base, 16);
});

test('REVIEW: dropped decimals, "up to" and per-pound slugs settle nothing', () => {
  assert.equal(slugMeasure('https://www.instacart.com/products/1-true-goodness-organic-dark-brown-sugar-15-lb'), null);
  assert.equal(slugMeasure('https://www.instacart.com/products/1-okra-15-lbs'), null);
  assert.equal(slugMeasure('https://www.instacart.com/products/1-fresh-grown-large-pumpkins-up-to-19-pound-each'), null);
  assert.equal(slugMeasure('https://www.instacart.com/products/1-potatoes-5-lb').base, 80);
  const ham = row('samsclub', "Member's Mark Uncured Boneless Quarter Sliced Ham", '1 each', 5.81, { url: url('member-s-mark-ham-priced-per-pound-2232lb', 'sams-club') });
  assert.equal(ham.unit.weight, undefined);
  assert.equal(ham.size, '1 ea');
});

test('REVIEW: ranges, decimals, packs and restated ounces are not pieces', () => {
  assert.equal(slugPieces('https://www.instacart.com/products/1-shrimp-31-to-40-count-raw-tail-off-2-lb'), null);
  assert.equal(slugPieces('https://www.instacart.com/products/1-shrimp-16-20-ct'), null);
  assert.equal(slugPieces('https://www.instacart.com/products/1-freshness-guaranteed-apple-pie-3-50-ct'), null);
  assert.equal(slugPieces('https://www.instacart.com/products/1-rolls-12-ct-2-pack'), null);
  const cream = row('hannaford', 'Smiling Hill Farm Pure-Natural Heavy Cream', '1 pt', 5.99, { url: url('smiling-hill-farm-cream-heavy-16-each') });
  assert.equal(cream.unit.count, undefined);
  const grassland = row('walmart', 'Grassland rBST-free, Salted Sweet Cream Butter', '16 oz', 4.96, { url: url('grassland-butter-salted-16-ea') });
  assert.equal(grassland.unit.count, undefined);
  assert.equal(grassland.size, '16 oz');
});

test('REVIEW: the row\'s own count or weight wins over the catalogue\'s', () => {
  const meijer = row('meijer', 'Fresh From Meijer French Dinner Rolls 10 ct 14.1 oz', '14.1 oz', 4.99, { url: url('fresh-from-meijer-french-dinner-rolls-8-ct') });
  assert.equal(meijer.unit.count, undefined);
  const cocoa = row('aldi', 'Barissimo Milk Chocolate Hot Cocoa Mix - 8 Count', '11 oz', 2.79, { url: url('barissimo-milk-chocolate-hot-cocoa-mix-10-ct') });
  assert.equal(cocoa.unit.count, undefined);
  const pockets = row('costco', 'La Boulangerie Smoked Ham & Swiss Cheese Pockets, 25.4 oz', '4 ct', 16.78, { url: url('la-boulangerie-ham-swiss-pocket-8-count-25-4-oz', 'costco') });
  assert.equal(pockets.unit.count, undefined);
  // A weight just before the row's own count is one unit's.
  const cans = row('x', 'Cut Green Beans', '6 ct', 5.49, { url: url('cut-green-beans-15-oz-6-ct') });
  assert.equal(cans.unit.weight, undefined);
  // A size line that already names a measure.
  const goya = row('bjs', 'Goya Green Pigeon Peas', '8 pack, /15 oz', 9.99, { url: url('goya-green-pigeon-peas-15-oz', 'bjs') });
  assert.equal(goya.unit.weight?.slug, undefined);
});

test('REVIEW: a slug figure far under the stated ones is flagged, in a count answer too', () => {
  const stated = [['Rhodes Bake-N-Serv Dinner Rolls', '36 ct', 5.12], ["King's Hawaiian Rolls", '12 ct', 3.99], ['Bakery Dinner Rolls', '12 ct', 3.49], ['Pepperidge Farm Rolls', '12 ct', 3.79]]
    .map(([n, s, pr], i) => row(`s${i}`, n, s, pr));
  // A misread slug count: "...-dinner-rolls-120-ct" on a 12 oz bag at $1.98 is 1.65c a roll.
  const wrong = row('w', 'Dinner Rolls', '12 oz', 1.98, { url: url('dinner-rolls-120-ct') });
  // Walmart's real dozen at $1.05 is 8.75c a roll, about 0.3 of the stated median.
  const walmart = row('walmart', "Great Value Brown'n Serve Enriched Dinner Rolls", '12 oz', 1.05, { url: url('great-value-enriched-brown-n-serve-dinner-rolls-12-ct') });
  flagImplausible([...stated, wrong, walmart], 'count');
  assert.ok(wrong.implausible?.unconfirmed);
  assert.equal(walmart.implausible, undefined);
  for (const p of stated) assert.equal(p.implausible, undefined);
});

test('REVIEW: a slug figure takes the member price the row shows', () => {
  const muffins = row('wholefoods', 'Organic Grains English Muffins 6 Count', '13.2 oz', 5.41, { memberPrice: 4.87, memberLabel: 'Prime', url: url('organic-grains-english-muffins-6-ct') });
  assert.equal(Math.round(unitFor(muffins, 'count', { prime: true }).perBase * 1000) / 1000, 0.812);
  assert.equal(Math.round(unitFor(muffins, 'count', {}).perBase * 1000) / 1000, 0.902);
});

test('REVIEW: a bakery single under a plural name keeps its price per roll', () => {
  assert.equal(row('bashas', 'Bolillos Rolls', '1 each', 0.49).unit.count.perBase, 0.49);
  assert.equal(row('bashas', 'Kaiser Rolls', '1 each', 0.89).unit.count.perBase, 0.89);
  assert.equal(row('naturalgrocers', 'Natural Grocers Brand Products Organic Hawaiian Rolls', '1 each', 6.29).unit.count, undefined);
  assert.equal(row('jewel', 'Turkey Dinner With Pie & Rolls', '1 each', 86.99).unit.count.perBase, 86.99);
});

test('REVIEW: whipped toppings and creams named by the aisle stay by weight', () => {
  assert.equal(row('bjs', 'Reddi-wip Original Whipped Dairy Cream Topping', '30 oz', 12.39).dim, 'weight');
  assert.equal(row('x', 'So Delicious Non-Dairy Cream Topping', '9 oz', 3.99).dim, 'weight');
  assert.equal(row('x', 'Devon Cream Company Double Cream', '6 oz', 5.99, { category: 'Heavy Creams' }).dim, 'weight');
  assert.equal(row('wholefoods', 'Cream Heavy Whipping', '32 oz', 12.99).dim, 'volume');
});

test('REVIEW: seasonings, giblets, subs and a 1.02 lb listing are not whole birds under 4 lb', () => {
  assert.equal(row('x', 'Whole Turkey Seasoning', '3 oz', 4.99, { category: 'Spices' }).sizeConflict, null);
  assert.equal(row('x', 'Whole Turkey Brining Blend', '24 oz', 9.99).sizeConflict, null);
  assert.equal(row('x', 'Turkey Gizzards', '1.5 lb', 3.49, { category: 'Whole Turkey' }).sizeConflict, null);
  assert.equal(row('shoprite', 'Store Prepared Signature Turkey & Cheese, Whole Sub - Sold Cold', '18 oz', 12.47, { category: 'Prepared Sandwiches and Wraps' }).sizeConflict, null);
  assert.equal(row('x', 'Honeysuckle White Whole Turkey', '1.02 lb', 1.29, { category: 'Whole Turkey' }).sizeConflict, null);
  assert.ok(row('fairway', 'Maplecrest 10-12 Natural Turkey', '18 oz', 2.21, { category: 'Whole Turkey' }).sizeConflict);
});

test('REVIEW: a drink "can" is not a canned solid, and a packing medium is not a drink', () => {
  assert.equal(row('x', 'Monster Pumpkin Energy Can', '16 fl oz', 2.99, { category: 'Energy Drinks' }).dim, 'volume');
  assert.equal(row('x', 'Starbucks Pumpkin Cream Cold Brew Can', '11 fl oz', 3.49, { category: 'Cold Brew' }).dim, 'volume');
  assert.equal(row('x', 'Cutwater Pumpkin Pie Martini Cans', '12 fl oz', 3.99, { category: 'Canned Cocktails' }).dim, 'volume');
  assert.equal(row('x', "Bruce's Yams Cut Sweet Potatoes in Syrup", '29 fl oz', 3.29, { category: 'Canned Sweet Potatoes' }).dim, 'weight');
});

test('REVIEW: a "1 ct" sweet potato under a per-lb slug has no price per piece either', () => {
  const kroger = row('kroger', 'Sweet Potato', '1 ct', 0.99, { url: url('golden-sweet-potatoes-yams-per-lb', 'kroger') });
  assert.deepEqual(kroger.unit, {});
});

test('REVIEW: the sauce, bean and farina rules stay inside the searches they were written for', () => {
  const s = (name, category, dim = 'volume', base = 5) => ({ name, category, dim, base });
  yes('habanero sauce', s("Trader Joe's Habanero Hot Sauce", 'Salsa & Hot Sauce'));
  yes('sweet and sour sauce', s('Kikkoman Dipping Sauce, Sweet & Sour', 'Sweet and Sour Sauces', 'volume', 12));
  yes('bbq sauce', s('Horsetooth Hot Sauce BBQ Sauce, Hot Mess', 'Barbecue Sauces', 'volume', 12));
  yes('chocolate sauce', s("Hershey's Mocha Chocolate Sauce", 'Dessert Toppings', 'weight', 15));
  yes('refried beans', s('Goya Traditional Refried Pinto Beans', 'Canned Refried Beans', 'weight', 16));
  yes('cannellini beans', s('S&W Cannellini White Kidney Beans', 'Canned Cannelini Beans', 'weight', 15.5));
  yes('red beans', s('Goya Premium Red Kidney Beans', 'Canned Kidney Beans', 'weight', 15.5));
  yes('flour', s('Antimo Caputo Pizzeria Farina 00 Flour', 'Flour', 'weight', 35));
  yes('hot cereal', s("Bob's Red Mill Creamy Wheat Farina Hot Cereal", 'Hot Cereal', 'weight', 24));
  no('heavy cream', s('Sa Farina Cream', 'Heavy Cream', 'volume', 28));
  no('green beans', s('Del Monte Cut Green Beans & Peas', 'Canned Vegetables', 'weight', 14.5));
  no('green beans', s('Goya Green Lima Beans', 'Canned Lima Beans', 'weight', 15));
});

test('DEFECT: a product named "<food> with <the searched thing>" is the food', () => {
  const p = (name, category) => ({ name, category, dim: 'weight', base: 16 });
  no('butter', p('Sweet Corn With Butter', 'Prepared Vegetables'));
  no('butter', p('Brussels Sprouts Halves With Butter Sea Salt & Black Pepper Steam Bag', 'Green Brussels Sprouts'));
  no('cheese', p('Pickwell Farms Broccoli with Cheese', 'Frozen Broccoli'));
  no('marshmallows', p('Corona Sweet Cocoa With Marshmallows', 'Hot Cocoa Mix'));
  no('pecans', p('Blondie With Pecans', ''));
  no('brown sugar', p('AGV Okinawa Brown Eight Treasures Deluxe Congee With Brown Sugar', 'Other Oats'));
  // Controls: the thing itself, and a name where "with" adds to it.
  yes('gravy', p('Heinz Brown with Onions Gravy', 'Gravies'));
  yes('butter', p('Kerrygold Pure Irish Butter', 'Butter'));
  yes('green beans', p('String Beans with Garlic', 'Green Beans'));
});
