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

// ---------------------------------------------------------------------------
// DEFECT 9: light cream answered "heavy cream". BJ's "Wellsley Farms Light Cream" ($14.36/gal) and
// Stew Leonard's "Byrne Dairy Ultra Pasteurized Light Cream", both filed under Heavy Creams, were
// Newark's two best heavy cream, ahead of ALDI's heavy whipping cream at $17.40/gal. And a canned
// "One-Pie Pumpkin" and Fresh Market's per-lb "Organic Sugar Pie Pumpkin" answered "pumpkin pie".
// ---------------------------------------------------------------------------
test('DEFECT 9: cream of another fat is not heavy cream', () => {
  rejects('heavy cream', 'Wellsley Farms Light Cream', { category: 'Heavy Creams' });
  rejects('heavy cream', 'Byrne Dairy Ultra Pasteurized Light Cream', { category: 'Heavy Creams' });
  rejects('light cream', 'Heavy Whipping Cream');
  matches('heavy cream', 'Friendly Farms Heavy Whipping Cream', { category: 'Heavy Whipping Cream' });
  matches('heavy cream', 'Great Value Whipping Cream, Heavy', { category: 'Heavy Whipping Cream' });
  matches('light cream', 'Wellsley Farms Light Cream');
  rejects('pumpkin pie', 'One-Pie Pumpkin', { category: 'Canned Pumpkin' });
  rejects('pumpkin pie', 'Organic Sugar Pie Pumpkin', { soldBy: 'lb', category: 'Pumpkin' });
  matches('pumpkin pie', "Member's Mark Pumpkin Pie", { category: 'Pumpkin Pie' });
});

// ---------------------------------------------------------------------------
// DEFECT 10 (Charlotte, partial: only ALDI, Whole Foods and Trader Joe's answered before Instacart's
// 429): ALDI's "Chef's Cupboard Turkey Stuffing" was the best "fresh turkey"; 6 oz packs of sliced
// "Organic Oven Roasted Turkey Breast" (Trader Joe's) and "Ultra Thin Oven Roasted Turkey Breast"
// (Whole Foods) answered "turkey breast"; Trader Joe's "Garlic Shiitake Green Beans", in Entrées &
// Sides, answered "green beans".
// ---------------------------------------------------------------------------
test('DEFECT 10: stuffing, sliced roast breast and a prepared side are not what was asked for', () => {
  for (const q of ['turkey', 'fresh turkey', 'whole turkey']) rejects(q, "Chef's Cupboard Turkey Stuffing", { category: 'Boxed Stuffing' });
  rejects('turkey breast', 'Organic Oven Roasted Turkey Breast', { category: 'Chicken & Turkey' });
  rejects('turkey breast', 'Ultra Thin Oven Roasted Turkey Breast');
  rejects('green beans', 'Garlic Shiitake Green Beans', { category: 'Entrées & Sides' });
  matches('stuffing', "Chef's Cupboard Turkey Stuffing", { category: 'Boxed Stuffing' });
  matches('stuffing mix', "Chef's Cupboard Turkey Stuffing", { category: 'Boxed Stuffing' });
  matches('turkey lunch meat', 'Hillshire Farm Ultra Thin Honey Roasted Turkey Lunch Meat');
  matches('oven roasted turkey breast', 'Organic Oven Roasted Turkey Breast', { category: 'Chicken & Turkey' });
  matches('turkey breast', 'Butterball Boneless Turkey Breast Roast', { category: 'Frozen Turkey Breast' });
  matches('green beans', 'Happy Harvest Cut Green Beans', { category: 'Canned Green Beans' });
  matches('baked beans', "Bush's Original Baked Beans", { category: 'Canned Beans & Sides' });
});

// ---------------------------------------------------------------------------
// DEFECT 11 (Milwaukee, partial): Piggly Wiggly's "Butterball Natural Roast Gold Turkey", $6.49/lb
// in Turkey Breast, answered "fresh turkey": the aisle named the part the name did not. Woodman's
// "Chinese Celery" (a leaf vegetable of its own) answered "celery".
// ---------------------------------------------------------------------------
test('DEFECT 11: the aisle names the part, and Chinese celery is not celery', () => {
  rejects('fresh turkey', 'Butterball Natural Roast Gold Turkey', { category: 'Turkey Breast' });
  rejects('turkey', 'Butterball Natural Roast Gold Turkey', { category: 'Frozen Turkey Breast' });
  matches('turkey breast', 'Butterball Natural Roast Gold Turkey', { category: 'Turkey Breast' });
  matches('turkey', 'Jennie-O Less Than 14 Pounds Turkey', { category: 'Whole Turkey' });
  matches('turkey', 'Butterball Frozen Whole Turkey', { category: 'Whole Turkeys & Turkey Breasts' });
  rejects('celery', 'Chinese Celery', { category: 'Celery' });
  matches('chinese celery', 'Chinese Celery');
  matches('celery', 'Dole Celery', { category: 'Celery' });
});

// ---------------------------------------------------------------------------
// DEFECT 12 (Dallas, partial): ALDI's "Boulder Oven Turkey Bag 2ct" (Oven Cooking Bags) was the only
// answer to "fresh turkey"; Trader Joe's "Sweetened Whipped Heavy Cream" (13 fl oz, an aerosol)
// answered "heavy cream"; its "Candied Pecans" (5 oz, $15.97/lb) answered "pecans".
// ---------------------------------------------------------------------------
test('DEFECT 12: an oven bag, whipped cream and candied pecans', () => {
  rejects('fresh turkey', 'Boulder Oven Turkey Bag 2ct', { category: 'Oven Cooking Bags' });
  rejects('turkey', 'Boulder Oven Turkey Bag 2ct');
  rejects('heavy cream', 'Sweetened Whipped Heavy Cream', { category: 'Milk & Cream' });
  rejects('pecans', 'Candied Pecans', { category: 'Nuts, Dried Fruits, Seeds' });
  matches('heavy cream', 'Organic Heavy Cream');
  matches('heavy cream', 'Heavy Whipping Cream');
  matches('whipped cream', 'Whipped Heavy Cream');
  matches('candied pecans', 'Candied Pecans');
  matches('pecans', 'Southern Grove Chopped Pecans', { category: 'Pecans' });
  matches('pecans', 'Pecan Halves');
});

test('DEFECT 12 (Salt Lake City, partial): snack pecans are not baking pecans', () => {
  rejects('pecans', 'Sweet & Spicy Pecans', { category: 'Nuts, Dried Fruits, Seeds' });
  rejects('pecans', 'Honey Glazed Pecans');
  rejects('walnuts', 'Candied Walnuts');
  matches('pecans', 'Diamond Pecan Halves', { category: 'Pecans' });
  matches('walnuts', 'Chopped Walnuts');
  matches('honey roasted peanuts', 'Planters Honey Roasted Peanuts');
  matches('peanut butter', 'Jif Creamy Peanut Butter');
});

test('DEFECT 13 (Salt Lake City, Portland, partial): Whole Foods deli turkey by the pound is not a bird', () => {
  rejects('turkey', 'No Salt Turkey', { soldBy: 'lb' });
  rejects('turkey', 'Peppered Turkey', { soldBy: 'lb' });
  rejects('turkey breast', 'In House Herb Turkey Breast', { soldBy: 'lb' });
  matches('deli turkey', 'Peppered Turkey', { category: 'Deli Turkey' });
  matches('turkey', 'Honeysuckle White Frozen Whole Turkey', { category: 'Frozen Whole Turkey' });
  matches('turkey', 'Jennie-O Frozen Prime Young Turkey', { soldBy: 'lb', category: 'Frozen Whole Turkey' });
});

test('DEFECT 14 (Anchorage, partial): a turkey brine is a seasoning', () => {
  rejects('fresh turkey', 'Rodelle Gourmet Turkey Brine, 25 oz', { category: 'Other Seasoning Mixes' });
  rejects('turkey', 'Williams Sonoma Turkey Brining Blend');
  matches('turkey brine', 'Rodelle Gourmet Turkey Brine, 25 oz');
  matches('fresh turkey', 'Jennie-O Oven Ready Whole Turkey', { category: 'Whole Turkey' });
});

// ---------------------------------------------------------------------------
// DEFECT 15 (Honolulu): Walmart's "Great Value Pearl Onions", 12 ct in Frozen Onions at $1.98, was
// the best onions at an estimated $0.33/lb: a frozen bag, its weight guessed as twelve onions.
// ---------------------------------------------------------------------------
test('DEFECT 15: frozen pearl onions are not onions', () => {
  rejects('onions', 'Great Value Pearl Onions', { category: 'Frozen Onions' });
  assert.deepEqual(best('onions', {
    walmart: [item('walmart', 'Great Value Pearl Onions', '12 ct', 1.98, { category: 'Frozen Onions' }),
      item('walmart', 'Yellow Onions, 3 lb Bag', '3 lb', 2.97, { category: 'Yellow Onions' })],
  }), { walmart: 'Yellow Onions, 3 lb Bag' });
  rejects('celery', 'Frozen Diced Celery');
  matches('frozen onions', 'Great Value Pearl Onions', { category: 'Frozen Onions' });
  matches('green beans', 'Frozen Cut Green Beans', { category: 'Frozen Green Beans' });
  matches('onions', 'Red Onion Bag', { category: 'Red Onions' });
});

// ---------------------------------------------------------------------------
// DEFECT 16 (Manchester NH, Newark): a per-lb "Celery Stalk" was ranked by Instacart's "each (est.)"
// figure, which prices one rib: Hannaford's at $3.39/lb came to $0.47 each and Weis's at $6.89/lb to
// $0.62, each the best celery in its ZIP, against bunches at $1.50 to $2.23.
// ---------------------------------------------------------------------------
test('DEFECT 16: per-lb celery gets no price per bunch', () => {
  const stalk = item('hannaford', 'Celery Stalk', '1 each', 3.39, { soldBy: 'lb', estEach: 0.47, category: 'Celery' });
  assert.equal(stalk.unit.count, undefined);
  assert.equal(stalk.unit.weight.perBase, 3.39 / 16);
  const { stores } = bestPerStore('celery', {
    hannaford: [stalk],
    pricerite: [item('pricerite', 'Celery', '1 ea', 2.23, { category: 'Celery' })],
  }, { dim: 'count' });
  assert.deepEqual(Object.keys(stores), ['pricerite']);
  // A banana's estimate is one banana and stays.
  assert.equal(item('kroger', 'Bananas', '1 each', 0.59, { soldBy: 'lb', estEach: 0.2 }).unit.count.perBase, 0.2);
});

// ---------------------------------------------------------------------------
// DEFECT 17 (Greenville SC): "fresh turkey" was answered by The Fresh Market's "The Turkey Trot (Half
// Panini)" in Prepared Sandwiches and Wraps, and Sprouts' "Turkey Carnitas" in Prepared Turkey; Food
// Lion's "Diamond In Shell Pecans" (16 oz, weighed with the shells) ranked against shelled pecans.
// ---------------------------------------------------------------------------
test('DEFECT 17: a turkey sandwich and in-shell pecans', () => {
  rejects('fresh turkey', 'The Fresh Market The Turkey Trot (Half Panini)', { category: 'Prepared Sandwiches and Wraps' });
  rejects('fresh turkey', 'Sprouts Turkey Carnitas', { category: 'Prepared Turkey' });
  rejects('turkey', 'Sprouts Turkey Carnitas', { category: 'Prepared Turkey' });
  rejects('pecans', 'Diamond In Shell Pecans', { category: 'Pecans' });
  matches('in shell pecans', 'Diamond In Shell Pecans', { category: 'Pecans' });
  matches('turkey sandwich', 'Turkey Club Sandwich', { category: 'Prepared Sandwiches and Wraps' });
  matches('fresh turkey', 'Sprouts Fresh Whole Turkey', { category: 'Whole Turkey' });
});

// ---------------------------------------------------------------------------
// DEFECT 18 (Las Vegas): Albertsons' and Vons' "Signature SELECT Pastry Shells, Mini Phyllo", 15 ct
// in Frozen Pie Crusts, was the best pie crust at $0.40 a shell (the pie-shell fix above let them in);
// "Onions Shallots" ($0.59/lb, Shallots) answered "onions"; El Super's "Pecan Brazo Gitano", a cake
// roll in Other Cakes, answered "pecans".
// ---------------------------------------------------------------------------
test('DEFECT 18: phyllo cups, shallots and a pecan cake', () => {
  rejects('pie crust', 'Signature SELECT Pastry Shells, Mini Phyllo', { category: 'Frozen Pie Crusts' });
  rejects('pie crust', 'Signature SELECT Phyllo Mini Pastry Shells', { category: 'Frozen Pie Crusts' });
  rejects('pie crust', 'Tart Shells', { category: 'Frozen Pie Crusts' });
  matches('pie crust', 'ALDI Deep Dish Pie Crusts - 2 Pack', { category: 'Frozen Pie Crusts' });
  matches('phyllo shells', 'Athens Phyllo Shells');
  rejects('onions', 'Onions Shallots', { category: 'Shallots', soldBy: 'lb' });
  matches('onions', 'Yellow Onion', { category: 'Yellow Onions', soldBy: 'lb' });
  matches('shallots', 'Onions Shallots', { category: 'Shallots' });
  rejects('pecans', 'Pecan Brazo Gitano', { category: 'Other Cakes' });
  matches('pecans', 'Private Selection Shelled Pecans', { category: 'Pecans' });
});

test('DEFECT 17 (Virginia Beach, partial): an herb blend for turkey is not a turkey', () => {
  rejects('fresh turkey', 'Infinite Herbs Turkey Blend Rosemary + Sage + Thyme', { category: 'Other Seasoning Mixes' });
  matches('turkey seasoning', 'McCormick Turkey Seasoning', { category: 'Spices & Seasonings' });
  matches('fresh turkey', 'Wegmans Fresh Young Turkey, 10-14 lb.', { category: 'Whole Turkey' });
});

// ---------------------------------------------------------------------------
// DEFECT 19 (Charlotte, complete): Ingles' "Fresh Hen & Turkey", 1 ea at $3.59 in Whole Turkey, was
// the "fresh turkey" headline at $3.59 a bird: a per-pound price on a bird sold "each" with no weight.
// ---------------------------------------------------------------------------
test('DEFECT 19: a whole turkey "1 ea" with no weight gets no price per bird', () => {
  const ingles = item('ingles', 'Fresh Hen & Turkey', '1 ea', 3.59, { category: 'Whole Turkey' });
  assert.equal(ingles.unit.count, undefined);
  assert.equal(relevance('fresh turkey', ingles) >= RELEVANT, true, 'still listed as a match');
  assert.deepEqual(best('fresh turkey', { ingles: [ingles] }), {});
  // A bird with its weight stated is priced by weight; a per-lb bird by the pound; breasts and parts
  // sold each keep their price.
  assert.ok(item('x', 'Butterball Whole Turkey', '12 lb', 15.99, { category: 'Whole Turkey' }).unit.weight);
  assert.ok(item('x', 'Wegmans Fresh Young Turkey', 'per lb', 2.99, { soldBy: 'lb', category: 'Whole Turkey' }).unit.weight);
  assert.ok(item('x', 'Turkey Necks', '1 ea', 3.99, { category: 'Whole Turkey' }).unit.count);
  assert.ok(item('x', 'Turkey Cookie Cutter', '1 ea', 2.99).unit.count);
});

// ---------------------------------------------------------------------------
// DEFECT 20 (Newark rerun, with the fixes above): Key Food's "Organic Heirloom Brown Turkey Fig Tree",
// 8 oz of figs, answered "fresh turkey" once the turkey wings stopped; H Mart's "HAITAI Baked Sweet
// Potato" 5 ct, in Prepared Potatoes, took the bungeo-pang's place in "sweet potatoes".
// ---------------------------------------------------------------------------
test('DEFECT 20: Brown Turkey figs and baked sweet potatoes from the prepared aisle', () => {
  rejects('fresh turkey', 'Organic Heirloom Brown Turkey Fig Tree', { category: 'Figs' });
  rejects('turkey', 'Brown Turkey Figs');
  matches('brown turkey figs', 'Brown Turkey Figs');
  rejects('sweet potatoes', 'HAITAI Baked Sweet Potato', { category: 'Prepared Potatoes' });
  matches('sweet potatoes', 'SWEET POTATO', { category: 'Sweet Potatoes' });
  matches('celery', 'Celery Sticks', { category: 'Prepared Vegetables' });
});
