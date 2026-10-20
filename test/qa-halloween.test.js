// QA: the Halloween list (halloween candy, pumpkin, apple cider, caramel apples) run through
// ops/coverage/holiday-matrix.mjs on 2026-10-19/20 in CO, FL, LA, MA, OH, PA, TX and WA. Apple
// cider was right everywhere. Each DEFECT below is a best price the run published, with the product
// name, category and size the store returned.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The name-only cases are also in test/fixtures/holiday-matrix.json, which drives the iOS
// HolidayMatrixTests. Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';
import { bestPerStore } from '../shared/compare.js';
import { makeProduct } from '../src/normalize.js';

const rejects = (q, name, category = null) => {
  const s = relevance(q, { name, category });
  assert.ok(s < RELEVANT, `"${q}" vs "${name}" (${category}) scored ${s.toFixed(3)} >= ${RELEVANT} (wrong product accepted)`);
};
const matches = (q, name, category = null) => {
  const s = relevance(q, { name, category });
  assert.ok(s >= RELEVANT, `"${q}" vs "${name}" (${category}) scored ${s.toFixed(3)} < ${RELEVANT} (real match rejected)`);
};
const item = (storeId, name, sizeText, price, extra = {}) =>
  makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price, ...extra });

// ---------------------------------------------------------------------------
// DEFECT 1: a can of pie filling answered "caramel apples". Meijer (Columbus, 43214) at $3.99 and
// Food Lion (Philadelphia, 19147) at $3.59 headlined "Lucky Leaf Caramel Apple Fruit Filling" 21 oz,
// filed under Pie Fillings, as the cheapest caramel apples.
// ---------------------------------------------------------------------------
test('DEFECT 1: Lucky Leaf Caramel Apple Fruit Filling is not caramel apples', () => {
  rejects('caramel apples', 'Lucky Leaf Caramel Apple Fruit Filling');
  rejects('caramel apples', 'Lucky Leaf Caramel Apple Fruit Filling', 'Pie Fillings');
});

test('DEFECT 1: the Columbus headline is a caramel apple, not the filling', () => {
  const { stores } = bestPerStore('caramel apples', {
    meijer: [item('meijer', 'Lucky Leaf Caramel Apple Fruit Filling', '21 oz', 3.99, { category: 'Pie Fillings' })],
    freshthyme: [item('freshthyme', 'Affy Tapple Plain Caramel Apples', '3 ct', 3.79)],
  });
  assert.equal(stores.meijer, undefined, 'Meijer has no caramel apple in this result');
  assert.ok(stores.freshthyme);
});

test('control: caramel apples still find caramel apples', () => {
  for (const n of ['Caramel Apples', 'Tastee Caramel Apples', 'Affy Tapple Plain Caramel Apples', "Kroger® Caramel Apples with Peanuts", 'Daffy Farms Red Caramel Apple']) matches('caramel apples', n);
});

test('control: pie filling is still found when it is what was asked for', () => {
  matches('pumpkin pie filling', 'Comstock Pumpkin Pie Filling');
  matches('apple pie filling', 'Comstock Apple Pie Filling');
});

// ---------------------------------------------------------------------------
// DEFECT 2: marshmallows answered "halloween candy". Rouses (New Orleans, 70115) at $1.96 and
// ShopRite (Philadelphia) at $2.03 headlined "Jet-Puffed Candy Corn Shaped Halloween Fall
// Marshmallows" 8 oz. They are marshmallows shaped like candy corn, not a bag of candy.
// ---------------------------------------------------------------------------
test('DEFECT 2: Jet-Puffed Candy Corn Shaped Halloween Fall Marshmallows are not halloween candy', () => {
  rejects('halloween candy', 'Jet-Puffed Candy Corn Shaped Halloween Fall Marshmallows');
  rejects('halloween candy', 'Jet-Puffed Candy Corn Shaped Halloween Fall Marshmallows', 'Marshmallows');
});

test('control: halloween candy and marshmallows still find themselves', () => {
  for (const n of ['Mars & Chocolate Halloween Candy Variety Bulk', "Child's Play Individually Wrapped Assorted Halloween Candy", 'Mondelez Halloween Monster Parts Candy Bag']) matches('halloween candy', n);
  matches('marshmallows', 'Jet-Puffed Marshmallows');
  matches('marshmallows', 'Kraft Jet-Puffed Halloween Marshmallows', 'Marshmallows');
  matches('sweet potatoes', 'Sweet Potatoes with Marshmallows', 'Sweet Potatoes');
});

// ---------------------------------------------------------------------------
// DEFECT 3: "pumpkin" on the Halloween list means a pumpkin to carve. Rouses' "Licensed LSU Tigers
// Pumpkin", 8 ct for $11.59, category Pumpkin, scored 0.954 and was New Orleans's best price at
// $1.45 a pumpkin. Every other state's headline was a mini decorative pumpkin (Trader Joe's "Lil'
// Tiger Stripe Pumpkin" $1.49, Giant Eagle's "Mini Pumpkin" $0.99, Sprouts' "Wee B Little Mini
// Orange Pumpkin" $1.00), priced per pumpkin against carving pumpkins at $4 to $9. And gift bags,
// a pail, LED decor, a children's book and a 12 inch pumpkin pie all scored above 0.8.
// ---------------------------------------------------------------------------
test('DEFECT 3: Licensed LSU Tigers Pumpkin is not a pumpkin to carve', () => {
  rejects('pumpkin', 'Licensed LSU Tigers Pumpkin');
  rejects('pumpkin', 'Licensed LSU Tigers Pumpkin', 'Pumpkin');
});

test('DEFECT 3: mini and ornamental pumpkins do not answer "pumpkin"', () => {
  for (const [n, c] of [
    ["Lil' Tiger Stripe Pumpkin", 'Veggies'], ["Pamper'd Lil'tiger Stripe Pumpkins", null], ['Mini Pumpkin', 'Pumpkin'],
    ['Wee B Little Mini Orange Pumpkin', 'Pumpkin'], ['Wee B Little Little Wee Bee Pumpkins', null], ['PUMPKIN JACK BE LITTLE', null],
    ['Lolita Ornamental Pumpkin', null], ['Pumpkin Patch Pals Tango Orange Ornamental Pumpkin', null], ['White Miniature Pumpkins', null],
    ['Orange Pumpkin Small/Mini - Weight Between 4-5 Lb', 'Pumpkin'], ["Kercher's Sunrise Orchards Fall Pumpkin Decor", null],
  ]) rejects('pumpkin', n, c);
});

test('DEFECT 3: decor, bags, books and pies are not pumpkins', () => {
  rejects('pumpkin', 'American Greetings Large Halloween Gift Bag, White Background with Orange Pumpkins, Gray Ghosts & Charcoal Striped Top', 'Party Gift Bags');
  rejects('pumpkin', 'Meijer Corporate Seasonal Hot Pink Halloween Pumpkin Pail', 'Halloween Decor');
  rejects('pumpkin', 'SYLVANIA LED Battery-Operated Ghost Pumpkin Bat', 'Halloween Decor');
  rejects('pumpkin', 'Far East Brokers and Consultants Pumpkin Bucket, Purple');
  rejects('pumpkin', 'Ten Little Pumpkins Book');
  rejects('pumpkin', 'Wellsley Farms 12 Inch Pumpkin Pie', 'Pumpkin Pie');
});

test('DEFECT 3: New Orleans prices a pumpkin, not the LSU pack', () => {
  const { stores } = bestPerStore('pumpkin', {
    rouses: [item('rouses', 'Licensed LSU Tigers Pumpkin', '8 ct', 11.59, { category: 'Pumpkin' })],
    aldi: [item('aldi', 'Pumpkin', '1 ea', 3.95, { category: 'Pumpkin' })],
    traderjoes: [item('traderjoes', "Lil' Tiger Stripe Pumpkin", '1 Each', 1.49, { category: 'Veggies' })],
  });
  assert.deepEqual(Object.keys(stores), ['aldi']);
});

test('control: carving, pie and heirloom pumpkins still answer "pumpkin"', () => {
  for (const [n, c] of [
    ['Pumpkin', 'Pumpkin'], ['Jumbo Pumpkin', null], ['Halloween Pumpkins', null], ['Organic Pumpkin', null],
    ["Rent's Due Ranch Local Organic |Jack-O-Lantern Pumpkins", null], ['Regular Pumpkins Bin', 'Pumpkin'],
    ['Heirloom Pumpkins, Each, Assorted Colors', null], ['Wegmans Heirloom Pumpkin', 'Pumpkin'], ['Sugar Pie Pumpkin', null],
    ['Pie Pumpkin', null], ['Carving Pumpkin Large', null],
  ]) matches('pumpkin', n, c);
  // Asking for the small ones finds them.
  matches('mini pumpkins', 'Mini Pumpkin', 'Pumpkin');
  matches('mini pumpkins', 'Wee B Little Mini Orange Pumpkin');
  // Thanksgiving's pumpkin searches are untouched.
  matches('pumpkin puree', "Libby's 100% Pure Pumpkin");
  matches('pumpkin pie', 'Wellsley Farms 12 Inch Pumpkin Pie', 'Pumpkin Pie');
});

// ---------------------------------------------------------------------------
// DEFECT 4: a pumpkin sold by the pound has no honest per-pumpkin price. Grocery Outlet (Seattle,
// 98103) sold "Small White Pumpkin" at $0.99/lb and Instacart's "each (est.)" figure of $0.26 made
// it the best pumpkin at $0.26 a pumpkin: a quarter-pound pumpkin. The same run's estimates put
// Key Food's per-lb "Pumpkin" at 10 lb, Safeway's "Heirloom Pumpkin" at 1 lb, and Star Market's
// "Orange Pumpkin Small/Mini - Weight Between 4-5 Lb" at 1.5 lb, against its own label. A pumpkin
// weighs anything from a quarter pound to twenty-five, so a per-lb pumpkin keeps its per-lb price
// and is not ranked per pumpkin.
// ---------------------------------------------------------------------------
const perLbPumpkin = (storeId, name, price, estEach) =>
  item(storeId, name, '1 each', price, { soldBy: 'lb', estEach, category: 'Pumpkin' });

test('DEFECT 4: a per-lb pumpkin has no per-pumpkin price', () => {
  const p = perLbPumpkin('groceryoutlet', 'Small White Pumpkin', 0.99, 0.26);
  assert.equal(p.unit.count, undefined, `published $${p.unit.count?.perBase}/ct for a $0.99/lb pumpkin`);
  assert.ok(Math.abs(p.unit.weight.perBase * 16 - 0.99) < 1e-9, 'its per-lb price stands');
  assert.equal(perLbPumpkin('starmarket', 'Orange Pumpkin Small/Mini - Weight Between 4-5 Lb', 1.99, 2.98).unit.count, undefined);
  assert.equal(perLbPumpkin('safeway', 'Heirloom Pumpkin', 1.59, 1.59).unit.count, undefined);
});

test('DEFECT 4: Seattle\'s best pumpkin is not a $0.26 estimate', () => {
  const { stores } = bestPerStore('pumpkin', {
    groceryoutlet: [perLbPumpkin('groceryoutlet', 'Small White Pumpkin', 0.99, 0.26)],
    pcc: [item('pcc', "Rent's Due Ranch Local Organic |Jack-O-Lantern Pumpkins", '1 ea', 0.69, { category: 'Pumpkin' })],
    costco: [item('costco', 'Heirloom Pumpkins, Each, Assorted Colors', '1 ea', 8.7)],
  }, { dim: 'count' });
  assert.equal(stores.groceryoutlet, undefined);
  assert.equal(stores.pcc.unit.perBase, 0.69);
});

test('control: other per-lb produce keeps its each estimate', () => {
  const bananas = item('kroger', 'Bananas', '1 each', 0.59, { soldBy: 'lb', estEach: 0.2 });
  assert.equal(bananas.unit.count.perBase, 0.2);
  assert.equal(bananas.unit.count.est, true);
  const onion = item('kroger', 'Yellow Onion', '1 each', 1.0, { soldBy: 'lb' });
  assert.equal(onion.unit.count.perBase, 0.5);
});
