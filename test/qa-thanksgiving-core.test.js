// QA: the Thanksgiving core dinner list (ops/coverage/thanksgiving-core-qa-2026-11-03.md). A
// 27-item list (`holiday-matrix.mjs --holiday thanksgiving-core`) in 13 states. Each DEFECT is a
// name, price or rejection the run published, or one the run's offline probe of the same list found.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The name-only cases are also in test/fixtures/holiday-matrix.json, which drives the iOS
// HolidayMatrixTests; the cases that need a size or an aisle are in ThanksgivingCoreTests
// (ios/Tests/CoreTests.swift). Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';
import { bestPerStore } from '../shared/compare.js';
import { makeProduct } from '../src/normalize.js';

const score = (q, name, extra = {}) => relevance(q, { name, ...extra });
const rejects = (q, name, extra = {}) => {
  const s = score(q, name, extra);
  assert.ok(s < RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} >= ${RELEVANT} (wrong product accepted)`);
};
const matches = (q, name, extra = {}) => {
  const s = score(q, name, extra);
  assert.ok(s >= RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} < ${RELEVANT} (real match rejected)`);
};
const item = (storeId, name, sizeText, price, extra = {}) =>
  makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price, ...extra });
const best = (q, results) => {
  const { stores } = bestPerStore(q, results);
  return Object.fromEntries(Object.entries(stores).map(([id, b]) => [id, b.item.name]));
};

// ---------------------------------------------------------------------------
// DEFECT 1: "turkey" with no part named was answered by other parts. In Newark, Walmart's "FESTIVE
// Ground Turkey" and ALDI's "Kirkwood Ground Turkey" answered "turkey" and "frozen turkey", Food
// Bazaar's "TURKEY WING CUT UP" "turkey" and its "Turkey Neck" "fresh turkey"; ACME's deli "Herb
// Roasted Turkey Breast" was the best "turkey breast".
// ---------------------------------------------------------------------------
test('DEFECT 1: ground turkey, wings, necks, deli slices and bacon are not "turkey"', () => {
  for (const q of ['turkey', 'whole turkey', 'frozen turkey', 'fresh turkey']) {
    for (const n of ['FESTIVE Ground Turkey with MST Frozen- 1lb, 16 OZ', 'Kirkwood Ground Turkey', 'TURKEY WING CUT UP', 'Turkey Neck',
      'Jennie-O Turkey Bacon', 'Oscar Mayer Deli Fresh Oven Roasted Turkey Breast', 'Hillshire Farm Turkey Kielbasa', 'Smoked Turkey Legs',
      'Honeysuckle White Whole Turkey Breast', 'Frozen Turkey Burgers']) rejects(q, n);
  }
  rejects('turkey', 'Herb Roasted Turkey Breast', { category: 'Deli Turkey' });
  rejects('turkey breast', 'Herb Roasted Turkey Breast', { category: 'Deli Turkey' });
  rejects('turkey breast', 'Hillshire Farm Ultra Thin Sliced Oven Roasted Turkey Breast Lunch Meat');
  rejects('turkey breast', 'Turkey Breast Tenderloins');
});

test('DEFECT 1: Newark\'s "turkey" is the bird', () => {
  const lb = { soldBy: 'lb' };
  assert.deepEqual(best('turkey', {
    walmart: [item('walmart', 'FESTIVE Ground Turkey with MST Frozen- 1lb, 16 OZ', '16 oz', 1.98, { category: 'Other Frozen Turkey' }),
      item('walmart', 'Shady Brook Farms Frozen Whole Turkey', 'per lb', 0.97, { ...lb, category: 'Frozen Whole Turkey' })],
    foodbazaar: [item('foodbazaar', 'TURKEY WING CUT UP', 'per lb', 3.49, { ...lb, category: 'Turkey Wing' })],
  }), { walmart: 'Shady Brook Farms Frozen Whole Turkey' });
});

test('control: a bird is a bird, and asking for the part finds it', () => {
  for (const q of ['turkey', 'whole turkey']) {
    for (const n of ['Butterball Frozen Whole Turkey 10-16 lb', 'Shady Brook Farms Frozen Whole Turkey', 'Butterball Whole Turkey with Neck and Giblets']) matches(q, n);
    matches(q, 'Butterball Frozen Turkey Hen', { category: 'Frozen Whole Turkey' });
    matches(q, '10-16 Grade A Turkey', { category: 'Frozen Whole Turkey' });
    matches(q, 'Wegmans Fresh Young Turkey, 10-14 lb.', { category: 'Whole Turkey' });
  }
  matches('turkey breast', 'Butterball Frozen Turkey Breast');
  matches('turkey breast', 'Butterball All-Natural Fresh Turkey Breast With Ribs & Back Portion');
  matches('turkey breast', 'Butterball Frozen Boneless Turkey Breast Roast with Gravy Packet');
  matches('ground turkey', 'Kirkwood Ground Turkey');
  matches('turkey wings', 'TURKEY WING CUT UP');
  matches('turkey necks', 'Turkey Neck');
  matches('turkey bacon', 'Jennie-O Turkey Bacon');
  matches('deli turkey', 'Herb Roasted Turkey Breast', { category: 'Deli Turkey' });
  matches('sliced turkey breast', 'Hillshire Farm Ultra Thin Sliced Oven Roasted Turkey Breast Lunch Meat');
  matches('turkey lunch meat', 'Oscar Mayer Deli Fresh Oven Roasted Turkey Breast');
});

// ---------------------------------------------------------------------------
// DEFECT 2: "fresh" is a stop word, so "fresh turkey" was "turkey": Walmart's "Shady Brook Farms
// Frozen Whole Turkey", $0.84/lb, was Newark's best fresh turkey, against Wegmans' fresh bird at
// $2.99/lb.
// ---------------------------------------------------------------------------
test('DEFECT 2: a frozen bird is not a fresh turkey', () => {
  rejects('fresh turkey', 'Shady Brook Farms Frozen Whole Turkey', { category: 'Frozen Whole Turkey' });
  rejects('fresh turkey', 'Butterball Whole Turkey', { category: 'Frozen Whole Turkey' });
  rejects('fresh green beans', 'Frozen Cut Green Beans');
  matches('fresh turkey', 'Wegmans Fresh Young Turkey, 10-14 lb.', { category: 'Whole Turkey' });
  matches('fresh turkey', 'Butterball Fresh Whole Turkey');
  matches('frozen turkey', 'Shady Brook Farms Frozen Whole Turkey', { category: 'Frozen Whole Turkey' });
  matches('turkey', 'Shady Brook Farms Frozen Whole Turkey', { category: 'Frozen Whole Turkey' });
});

// ---------------------------------------------------------------------------
// DEFECT 3: "canned pumpkin" rejected every can. The whole-pumpkin rules (for a pumpkin to carve)
// read "canned pumpkin" as a pumpkin search, and no can says "canned": Libby's "100% Pure Pumpkin"
// scored 0.06. Walmart's "Great Value Pumpkin", 15 oz, also missed "pumpkin puree", the app's own
// Thanksgiving list item.
// ---------------------------------------------------------------------------
test('DEFECT 3: a can of pumpkin answers "canned pumpkin" and "pumpkin puree"', () => {
  for (const q of ['canned pumpkin', 'pumpkin puree']) {
    matches(q, "Libby's 100% Pure Pumpkin");
    assert.ok(relevance(q, item('walmart', 'Great Value Pumpkin', '15 oz', 1.0)) >= RELEVANT, q);
    assert.ok(relevance(q, item('aldi', 'Baker\'s Corner 100% Pure Pumpkin', '15 oz', 1.29)) >= RELEVANT, q);
  }
  matches('canned pumpkin', 'Pumpkin', { category: 'Canned Vegetables' });
  matches('canned pumpkin', 'Organic Pumpkin Puree');
});

test('control: a pumpkin to carve, pie mix, spice and seeds are not canned pumpkin', () => {
  for (const q of ['canned pumpkin', 'pumpkin puree']) {
    rejects(q, "Libby's Easy Pumpkin Pie Mix");
    rejects(q, 'McCormick Pumpkin Pie Spice');
    rejects(q, 'Pumpkin Seeds');
    assert.ok(relevance(q, item('x', 'Pie Pumpkin', '1 each', 1.29, { soldBy: 'lb', category: 'Produce' })) < RELEVANT, q);
    assert.ok(relevance(q, item('x', 'Large Carving Pumpkin', '1 ea', 4.99, { category: 'Pumpkins' })) < RELEVANT, q);
  }
  // ...and a bare "pumpkin" is still not a can.
  assert.ok(relevance('pumpkin', item('walmart', 'Great Value Pumpkin', '15 oz', 1.0)) < RELEVANT);
});

// ---------------------------------------------------------------------------
// DEFECT 4: real Thanksgiving staples scored under the cut. Campbell's Condensed Cream of Mushroom
// Soup (0.51: 'condensed' is a plant-base word for milk), every turkey gravy (0.37: 'turkey' is a
// trap), stuffing that does not say "mix" (0.28), pie shells (0.28) and PET evaporated milk (0.37:
// 'pet' is a trap).
// ---------------------------------------------------------------------------
test('DEFECT 4: condensed soup, turkey gravy, stuffing, pie shells and PET milk answer their searches', () => {
  matches('cream of mushroom soup', "Campbell's Condensed Cream of Mushroom Soup");
  matches('gravy', 'Heinz HomeStyle Turkey Gravy');
  matches('gravy', "Kinder's Roasted Turkey Gravy");
  matches('gravy', 'Campbell\'s Chicken Gravy');
  matches('stuffing mix', 'Pepperidge Farm Herb Seasoned Classic Stuffing');
  matches('stuffing mix', 'Kraft Stove Top Stuffing Mix for Chicken');
  matches('pie crust', "Marie Callender's Deep Dish Pie Shells");
  matches('evaporated milk', 'Pet Evaporated Milk');
});

test('control: the traps those words guarded still hold', () => {
  rejects('cream of mushroom soup', "Campbell's Condensed Cream of Chicken Soup");
  rejects('milk', 'Carnation Evaporated Milk');
  rejects('milk', 'Eagle Brand Sweetened Condensed Milk');
  rejects('gravy', 'Biscuits and Gravy');
  rejects('gravy', 'Gravy Train Dog Food');
  rejects('turkey', 'Butterball Turkey Gravy');
  rejects('evaporated milk', 'Eagle Brand Sweetened Condensed Milk');
  rejects('dog food', 'Pet Evaporated Milk');
  rejects('pie crust', 'Pie Crust Cookies');
});

// ---------------------------------------------------------------------------
// DEFECT 5: Thanksgiving table and kitchen goods answered food searches: a turkey centerpiece
// (0.92 for "turkey"), a gravy boat (0.92 for "gravy"), a pie crust shield (0.92 for "pie crust"),
// turkey-size oven bags and a roasting rack.
// ---------------------------------------------------------------------------
test('DEFECT 5: a centerpiece, a gravy boat and a pie shield are not food', () => {
  rejects('turkey', 'Turkey Centerpiece');
  rejects('turkey', 'Reynolds Kitchens Turkey Size Oven Bags');
  rejects('turkey', 'Turkey Roasting Rack');
  rejects('turkey', 'Turkey Baster');
  rejects('gravy', 'Gravy Boat');
  rejects('pie crust', 'Pie Crust Shield');
  matches('gravy boat', 'Gravy Boat');
  matches('turkey oven bags', 'Reynolds Kitchens Turkey Size Oven Bags');
});

// ---------------------------------------------------------------------------
// DEFECT 6: a pie pumpkin answered "pumpkin pie" (0.80), and Jewel's per-lb "Pumpkin Pie" was
// Chicago's best pumpkin pie at $0.99 (Halloween QA, 24 Oct): no bakery sells a pie by the pound.
// ---------------------------------------------------------------------------
test('DEFECT 6: the produce is not the pie', () => {
  rejects('pumpkin pie', 'Pie Pumpkin');
  rejects('pumpkin pie', 'Sugar Pie Pumpkin');
  rejects('pumpkin pie', 'Pumpkin Pie', { soldBy: 'lb' });
  matches('pumpkin pie', "Marie Callender's Pumpkin Pie");
  matches('pumpkin pie', 'Pumpkin Pie 8 Inch');
  matches('pie pumpkin', 'Sugar Pie Pumpkin');
});

// ---------------------------------------------------------------------------
// DEFECT 7: a whole pie answered "pie crust". Mrs. Smith's "Original Flaky Crust Dutch Apple Pie",
// 37 oz in Frozen Pies at $7.99-$8.99, was the best pie crust at Stop & Shop, Weis, ACME and Kings
// (Newark), ahead of Pillsbury's crusts at $3.46. And pie shells, which are pastry, were refused.
// ---------------------------------------------------------------------------
test('DEFECT 7: a pie is not a pie crust', () => {
  rejects('pie crust', "Mrs. Smith's Original Flaky Crust Dutch Apple Pie", { category: 'Frozen Pies' });
  rejects('pie crust', "Mrs. Smith's Original Flaky Crust Apple Pie");
  rejects('pie crust', 'Deep Dish Pumpkin Pie', { category: 'Frozen Pies' });
  matches('pie crust', "Marie Callender's Pastry Pie Shells", { category: 'Frozen Pie Crusts' });
  matches('pie crust', 'Pillsbury Premade Refrigerated Pie Crusts', { category: 'Pie Dough' });
  matches('pie crust', 'Pillsbury Pie Crust Dough', { category: 'Pie Dough' });
  assert.deepEqual(best('pie crust', {
    stopandshop: [item('stopandshop', "Mrs. Smith's Original Flaky Crust Dutch Apple Pie", '37 oz', 7.99, { category: 'Frozen Pies' }),
      item('stopandshop', 'Pillsbury Premade Refrigerated Pie Crusts', '14.1 oz', 4.49, { category: 'Pie Dough' })],
  }), { stopandshop: 'Pillsbury Premade Refrigerated Pie Crusts' });
});

// ---------------------------------------------------------------------------
// DEFECT 8: a frozen pastry answered "sweet potatoes". Pulmuone's "Sweet Potato Bungeo Pang", in
// Frozen Asian Meals and stated 12.7 lb at $9.59 (it is a bag of fish-shaped pastries), was the
// second-best sweet potatoes in Newark at 99 Ranch ($0.76/lb) and H Mart ($0.94/lb).
// ---------------------------------------------------------------------------
test('DEFECT 8: a meal or dessert aisle does not answer a produce search', () => {
  rejects('sweet potatoes', 'Pulmuone Foods Sweet Potato Bungeo Pang', { category: 'Frozen Asian Meals' });
  rejects('sweet potatoes', 'Sweet Potato Pie', { category: 'Bakery Desserts' });
  rejects('onions', 'Onion Rings', { category: 'Frozen Snacks' });
  matches('sweet potatoes', 'Jumbo Sweet Potato (Yam)', { category: 'Sweet Potatoes' });
  matches('sweet potatoes', 'Sweet Potatoes', { category: 'Produce' });
  matches('green beans', 'Frozen Cut Green Beans', { category: 'Frozen Green Beans' });
  matches('celery', 'Celery Hearts', { category: 'Fresh Vegetables' });
});
