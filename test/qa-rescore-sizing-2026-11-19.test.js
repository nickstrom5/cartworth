// Every cached Thanksgiving answer re-scored (1,107 answers, 18-19 Nov 2026): the size defects that
// changed what a shopper saw.
//
// - "N count, M oz" with a stated size of M is N of them only at a warehouse club. Meijer's
//   "Ready-to-Bake Pie Crusts 2 Count 15 oz" (stated 15 oz) read as 30 oz and was the best pie crust
//   in Louisville, Indianapolis, Columbus and Detroit; Dierbergs' "Split Top Dinner Rolls 16 ct - 20
//   oz" read $0.22/lb. Every supermarket weight of this shape in the cache is one package.
// - Meijer's "Salted Butter Sticks 8 oz 2 ct" read as two 8 oz packs ($2.69/lb, named in four
//   cities' butter claims); a "#10 Can" as ten cans; Costco's "16-count, 2-pack" rolls as two rolls
//   and "7.5 lbs, 60-count" as 450 lb.
// - Trader Joe's "Turkey Gravy" (aisle "Dressing & Seasoning") read as fluid ounces, so Trader Joe's
//   had no gravy in 30 ZIPs and would have won 22.
// - Canned fried onions and dinner rolls weighed as fresh onions, avocados and garlic; a carton
//   grade ("Russet Potato 80 ct") as 80 potatoes; a $7 bag stated "1 each" as one sweet potato; a
//   jumbo onion as half a pound.
// - A slug that says "yams" for sweet potatoes or "shell" for a crust called another product.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct, slugProductConflict } from '../src/normalize.js';

let seq = 0;
const row = (storeId, name, sizeText, price, extra = {}) => makeProduct({ storeId, id: String(++seq), name, sizeText, price, soldBy: 'each', ...extra });
const perLb = (p) => (p.unit.weight ? Math.round(p.unit.weight.perBase * 1600) / 100 : null);

test('DEFECT: at a supermarket "N count, M oz" stated as M is one package', () => {
  const crust = row('meijer', 'Meijer Ready-to-Bake Pie Crusts 2 Count 15 oz', '15 oz', 3.99, { category: 'Pie Crusts', url: 'https://www.instacart.com/products/20604919-meijer-ready-to-bake-pie-crusts-2-ct' });
  assert.equal(crust.base, 15);
  assert.equal(perLb(crust), 4.26);
  assert.equal(crust.sizeConflict, null);
  assert.equal(row('dierbergs', 'Dierbergs Bakehouse Bread Split Top Dinner Rolls 16 ct - 20 oz', '20 oz', 4.49).base, 20);
  assert.equal(row('meijer', 'Fresh From Meijer French Dinner Rolls 10 ct 14.1 oz', '14.1 oz', 4.99).base, 14.1);
  assert.equal(row('walmart', 'Keebler Ready Crust Mini Graham Cracker Pie Crusts, Premade Pie Crusts For Baking And No-Bake, 6 ct, 4 oz', '4 oz', 2.97).base, 4);
  assert.equal(row('kroger', 'Butterball Frozen Turkey Burgers, Original Seasoned, 1/3 lb Patties, 6 Count/2 lbs', '32 oz', 12.99).base, 32);
});

test('control: a club states one unit, a drink is labelled per can, and a stated total is the pack', () => {
  const loaves = row('costco', 'Artesano the Original Bakery Bread, 2-count, 20 oz', '20 oz', 7.08);
  assert.equal(loaves.base, 40);
  assert.equal(row('bjs', 'Wellsley Farms Blueberry Muffins, 6 ct./6 oz.', '6 oz', 9.79).base, 36);
  // ...unless the club's name says the weight is the package.
  assert.equal(row('bjs', "Gorton's Pub Style Whole Fish Fillets, Wild Caught Cod, Frozen, 10 Count, 32.5 Ounce Package", '32.5 oz', 25.39).base, 32.5);
  const cider = row('aldi', 'Wicked Grove Pumpkin Hard Cider - 6 Count, 12 fl oz Cans', '12 fl oz', 7.99);
  assert.equal(cider.dim, 'volume');
  assert.equal(cider.base, 72);
  assert.equal(row('aldi', 'Nature\'s Nectar Apple Juice 6 Pack, 8 fl oz Bottles', '48 fl oz', 2.19).base, 48);
  // Six cans that are 5.63 lb in all, stated as one can (Sam's): the name's weight is the total.
  assert.equal(row('samsclub', 'Hormel Chili with Beans 6-Pack, 5.63 LB', '15 oz', 8.98).base, 90);
});

test('DEFECT: butter sticks, a #10 can and Costco\'s roll names', () => {
  const half = row('meijer', 'Meijer Salted Butter Sticks 8 oz 2 ct', '8 oz', 2.69, { category: 'Salted Butter' });
  assert.equal(half.base, 8);
  assert.equal(perLb(half), 5.38);
  const can = row('smartfinal', 'Ocean Spray Whole Cranberry Sauce, Canned Side Dish, #10 Can, 117oz', '117 oz', 11.99);
  assert.equal(can.base, 117);
  assert.equal(perLb(can), 1.64);
  const hawaiian = row('costco', "King's Hawaiian, Hawaiian Sweet Rolls, 16-count, 2-pack", 'each', 8.32);
  assert.equal(hawaiian.dim, 'count');
  assert.equal(hawaiian.base, 32);
  assert.equal(hawaiian.unit.count.perBase, 0.26);
  const sixty = row('costco', 'Kirkland Signature Dinner Rolls, 7.5 lbs, 60-count', 'each', 11.99);
  assert.equal(sixty.base, 120);
  assert.equal(perLb(sixty), 1.6);
});

test('control: real packs of sticks, cups and club multipacks keep the pack reading', () => {
  assert.equal(row('x', 'Kerrygold Pure Irish Butter Sticks, Salted, 4 oz, 4 ct', '4 ct', 4.99).base, 16);
  assert.equal(row('costco', 'Kerrygold Pure Irish Butter, Salted, 8 oz, 4-count', 'each', 13.99).base, 32);
  assert.equal(row('x', 'Chobani Greek Yogurt Cups, 5.3 oz, 12 Count', '12 ct', 9.98).base, 63.6);
  assert.equal(row('costco', 'Kirkland Signature Organic Sugar, 10 lbs, 2-count', 'each', 15.99).base, 320);
  assert.equal(row('x', 'Coca-Cola, 12 fl oz, 12 Pack Cans', '12 x 12 fl oz', 7.99).base, 144);
});

test('DEFECT: gravy, rolls and croutons are sold by weight, whatever the aisle is called', () => {
  const gravy = row('traderjoes', 'Turkey Gravy', '17.6 Oz', 1.69, { category: 'Dressing & Seasoning' });
  assert.equal(gravy.dim, 'weight');
  assert.equal(perLb(gravy), 1.54);
  assert.equal(row('rosauers', 'Franz Milk Rolls', '14 oz', 3.39, { category: 'Dinner Rolls' }).dim, 'weight');
  assert.equal(row('naturalgrocers', "Olivia's Croutons Cornbread Dressing", '12 oz', 8.99, { category: 'Boxed Stuffing' }).dim, 'weight');
  // Liquids stated in oz are still liquids.
  assert.equal(row('x', 'Hidden Valley Ranch Dressing', '16 oz', 3.99, { category: 'Salad Dressings' }).dim, 'volume');
  assert.equal(row('x', 'Whole Milk', '64 oz', 2.99, { category: 'Milk' }).dim, 'volume');
});

test('DEFECT: a produce word in a packaged food, a carton grade and a bag are not one loose piece', () => {
  for (const [name, sizeText, price] of [
    ['Simple Truth Organic® Crispy French Fried Onions', '1 each', 3.99],
    ['The Fresh Market Avocado Rolls', '6 ct', 3.99],
    ['Cub White Onion Dinner Rolls', '12 ct', 3.99],
    ['Best Choice Garlic Dinner Rolls', '6 ct', 2.79],
    ['Russet Potato 80 ct', '1 each', 7.99],
    ['Sweet Potato (Yam)', '1 each', 6.98],
  ]) assert.equal(row('x', name, sizeText, price).unit.weight, undefined, `${name}: no price per pound`);
  const jumbo = row('traderjoes', 'Jumbo Yellow Onions', '1 Each', 0.99, { category: 'Veggies' });
  assert.equal(jumbo.unit.weight.est, true);
  assert.equal(perLb(jumbo), 1.1);
});

test('control: one loose piece of produce is still estimated', () => {
  assert.equal(perLb(row('x', 'Yellow Onion', '1 each', 0.89)), 1.78);
  assert.equal(perLb(row('foodlion', 'Sweet Potato (Yam)', '1 each', 0.29)), 0.48);
  assert.equal(perLb(row('x', 'Hass Avocados, 4 ct', '4 ct', 5.99)), 3.74);
  assert.equal(perLb(row('x', 'Russet Potato', '1 each', 0.99)), 1.8);
});

// An adversarial review of this change (19 Nov 2026) ran makeProduct from both code trees over all
// 107,504 distinct cached rows and read the 533 listings that changed. These are the holes it found.
test('REVIEW: club piece counts, drinks stated in oz, and sauces named after bread', () => {
  // Ten or more of 24 oz or more are pieces, well under the 100 lb ceiling the first cut used.
  const buns = row('costco', "Nature's Own Butter Hamburger Buns, 32 oz, 16-count", 'each', 5.46);
  assert.equal(buns.base, 32);
  assert.equal(perLb(buns), 2.73);
  assert.equal(row('costco', 'Caribbean Food Delights Jamaican Style Curry Chicken Patties, 50 oz, 10-count', 'each', 14.92).base, 50);
  assert.equal(row('costco', 'Orion Bungo Choco Mochi, 36.83 oz, 36-count', '36.83 oz', 12.4).base, 36.83);
  // ...and the clubs' real multipacks stay packs.
  assert.equal(row('costco', 'Butter, Salted, Block, 1 lb, 30-count', 'each', 64.68).base, 480);
  assert.equal(row('costco', 'Golden Fry Crispy French Fries, 5 lbs, 6-count', 'each', 24.99).base, 480);
  assert.equal(row('costco', 'Caribbean Food Delights Jamaican Spicy Beef Patties, 5 oz, 10-count', 'each', 14.92).base, 50);
  // A drink keeps the pack reading when its size is written "oz", and so does a name that counts cans.
  const broth = row('x', 'Swanson Chicken Broth 6 Pack 14.5 oz', '14.5 oz', 6.99);
  assert.equal(broth.dim, 'volume');
  assert.equal(broth.base, 87);
  assert.equal(row('x', 'Carnation Evaporated Milk 4 ct 12 oz', '12 oz', 6.49).base, 48);
  assert.equal(row('x', 'StarKist Chunk Light Tuna in Water 4 ct 5 oz Cans', '5 oz', 5.49).base, 20);
  // A sauce or a creamer named after bread or gravy is still poured; the aisle's name is not the product's.
  assert.equal(row('99ranch', 'Flying Horse Spring Roll Sweet Chili Sauce', '32 oz', 4.79, { category: 'Chili Sauces' }).dim, 'volume');
  assert.equal(row('keyfood', 'Michael’s of Brooklyn Home Style Gravy Sauce', '32 oz', 6.99, { category: 'Tomato Based Sauces' }).dim, 'volume');
  assert.equal(row('safeway', 'International Delight Cinnabon Classic Cinnamon Roll Coffee Creamer', '32 oz', 4.99, { category: 'Coffee Creamers' }).dim, 'volume');
  assert.equal(row('x', 'Heinz HomeStyle Turkey Gravy', '12 oz', 2.49, { category: 'Gravies & Sauces' }).dim, 'weight');
});

test('REVIEW: an accent in the name is not another product', () => {
  assert.equal(slugProductConflict('De Mi País Seafood Cream Flavor', 'https://www.instacart.com/products/51525569-de-mi-pais-crema-de-mariscos?retailerSlug=key-food'), null);
});

test('DEFECT: a slug in the trade\'s other word is the same product', () => {
  assert.equal(slugProductConflict('Orange Sweet Potatoes', 'https://www.instacart.com/products/3256-yams-jewel-per-lb?retailerSlug=sprouts'), null);
  assert.equal(slugProductConflict('Marie Callender\'s Deep Dish Pie Crusts', 'https://www.instacart.com/products/77-marie-callenders-frozen-pie-shell-16-oz?retailerSlug=grocery-outlet'), null);
  assert.equal(slugProductConflict('Frozen Pastry Crusts', 'https://www.instacart.com/products/77-deep-dish-shells-16-oz'), null);
  // Another product is still another product.
  assert.ok(slugProductConflict('KRO TURKEY STUFFING MIX', 'https://x/products/19275341-kroger-sugar-cinnamon-mini-pretzel-20-oz'));
  assert.ok(slugProductConflict('Russet Potatoes', 'https://x/products/1-yams-jewel-per-lb'));
});
