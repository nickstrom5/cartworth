// QA: the Thanksgiving basket sweep across Chicago (60618), Lombard (60148), Milwaukee (53211)
// and Kenosha (53142). Every defect below was found by running real searches and reading the
// output, not by a test failing, and every one put a wrong number in front of a shopper.
//
// The numbering matches the sweep's finding numbers.
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-pricing-logic node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT, singular } from '../shared/match.js';
import { bestPerStore, flagImplausible } from '../shared/compare.js';
import { coerceLiquid, parseSize, produceWeightLb } from '../shared/units.js';
import { makeProduct } from '../src/normalize.js';
import { chainForName } from '../shared/catalog.js';

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
const perLb = (p) => (p.unit.weight ? p.unit.weight.perBase * 16 : null);

// ---------------------------------------------------------------------------
// DEFECT 1: Sam's Club states ONE stick's size and charges for the six-pack. The pack count
// exists only in the product URL, so butter that costs $9.73/lb was published at $58.40/lb and
// became the baseline of an "87% less" savings claim. 6x is under the plausibility guard's reach.
// ---------------------------------------------------------------------------
test('DEFECT 1: a pack count stated only in the URL is not thrown away', () => {
  const p = item('samsclub', 'Kerrygold Salted Irish Butter Sticks', '4 oz', 14.6, {
    url: 'https://www.instacart.com/products/76160768-kerrygold-salted-butter-sticks-4-oz-6-pk?retailerSlug=sams-club',
  });
  assert.equal(p.base, 24, '6 x 4 oz is 24 oz');
  assert.ok(Math.abs(perLb(p) - 9.73) < 0.01, `expected $9.73/lb, got $${perLb(p).toFixed(2)}/lb`);
  assert.equal(p.size, '6 × 4 oz', 'the shopper must be able to see the pack that was applied');
});

test('control: a slug pack count alone is NOT enough to multiply a size', () => {
  // In the four-ZIP sweep 115 listings carried a bare "-N-ct" in the slug and in most of them the
  // stated size was already the pack TOTAL. Inventing a size is a wrong price with no outlier to
  // catch it, so the slug must spell out the measurement and the count together.
  const rolls = item('picknsave', 'Private Selection Hawaiian Dinner Rolls', '16 oz', 3.79, {
    url: 'https://www.instacart.com/products/12345-private-selection-hawaiian-dinner-rolls-12-ct?retailerSlug=pick-n-save',
  });
  assert.equal(rolls.base, 16, 'a 16 oz bag of rolls was multiplied into 12 lb of bread');

  const boules = item('traderjoes', 'Sourdough Boules', '14 Oz', 2.99, { url: 'https://x/079708-boules-sourdough-2-pk' });
  assert.equal(boules.base, 14);
});

// ---------------------------------------------------------------------------
// DEFECT 2: "Sweet Cream Butter" is the standard US label for plain butter, but 'cream' is a trap
// so that "cream cheese" does not score as cheese. Every plain butter scored 0.40 and lost to
// spreadable blends at 0.97, overstating Costco's cheapest butter by 100% and ALDI's by 42%.
// ---------------------------------------------------------------------------
test('DEFECT 2: "sweet cream butter" is butter', () => {
  matches('butter', 'Countryside Creamery Sweet Cream Butter - 4 Sticks');
  matches('butter', 'Kirkland Signature Salted Sweet Cream Butter, 16 oz, 4-count');
  matches('butter', 'Land O Lakes Salted Sweet Cream Butter');
  matches('butter', 'Dutch Farms Sweet Cream Butter');
});

test('DEFECT 2: the cheapest butter at each store is the actually cheapest butter', () => {
  const results = {
    costco: [
      item('costco', 'Kirkland Signature Salted Sweet Cream Butter, 4-count', '64 oz', 11.81),
      item('costco', 'Kirkland Signature Mixed Butter', '27 oz', 9.94),
    ],
    aldi: [
      item('aldi', 'Countryside Creamery Sweet Cream Butter - 4 Sticks', '16 oz', 2.89),
      item('aldi', 'Countryside Creamery Light Spreadable Butter', '15 oz', 3.85),
    ],
    jewel: [item('jewel', 'Land O Lakes Salted Butter', '16 oz', 4.99)],
    tonys: [item('tonys', 'Salted Butter Quarters', '16 oz', 2.49)],
  };
  const { stores } = bestPerStore('butter', results);
  assert.match(stores.costco.item.name, /Sweet Cream Butter/, 'Costco was shown at 2x its real cheapest butter');
  assert.match(stores.aldi.item.name, /Sweet Cream Butter - 4 Sticks/, 'ALDI was shown at 1.4x its real cheapest butter');
});

test('control: "cream cheese" is still not cheese and "ice cream" is still not butter', () => {
  rejects('cheese', 'Philadelphia Cream Cheese');
  rejects('butter', 'Sweet Cream Ice Cream');
});

// ---------------------------------------------------------------------------
// DEFECT 4: the retailer's trading name fed the relevance score. "365 By Whole Foods Market"
// supplied the word "whole" to every one of its products, so "whole turkey" in Milwaukee
// headlined $5.99/lb ground turkey while Woodman's $1.69/lb birds sat hidden.
// ---------------------------------------------------------------------------
test('DEFECT 4: a retailer trading name does not supply query words', () => {
  rejects('whole turkey', 'Dark Ground Turkey', { brand: '365 By Whole Foods Market' });
  assert.equal(
    score('whole turkey', 'Dark Ground Turkey', { brand: '365 By Whole Foods Market' }).toFixed(3),
    score('whole turkey', 'Dark Ground Turkey', { brand: '365' }).toFixed(3),
    'the brand still changed the score, so the leak is only narrowed'
  );
});

test('control: a brand that genuinely identifies the product still counts', () => {
  matches('kerrygold butter', 'Salted Irish Butter Sticks', { brand: 'Kerrygold' });
  matches('whole milk', 'Organic Whole Milk', { brand: '365 By Whole Foods Market' });
});

// ---------------------------------------------------------------------------
// DEFECT 5 / 8: a product the retailer filed under exactly the searched phrase could not reach
// the threshold. Category hits were worth 0.6 of a name hit, and the MILD word 'frozen' cost
// another 42%, so every category-only and every frozen whole bird landed in the 0.30-0.52 band.
// Kenosha's $1.89/lb shelf-price birds were hidden behind a $2.99/lb online price.
// ---------------------------------------------------------------------------
test('DEFECT 5: a product whose category IS the search phrase is a match', () => {
  matches('whole turkey', 'Jennie-O Less Than 14 Pounds Turkey', { category: 'Whole Turkey' });
  matches('whole turkey', 'Fresh Turkeys', { category: 'Whole Turkey' });
  matches('whole turkey', 'Jennie-O Natural Hen Turkey', { category: 'Whole Turkey' });
});

test('DEFECT 8: a FROZEN whole turkey is a whole turkey', () => {
  matches('whole turkey', 'Jennie-O Whole Frozen Turkey', { category: 'Frozen Whole Turkey' });
  matches('whole turkey', 'Honeysuckle White Whole Frozen Young Turkey', { category: 'Whole Turkey' });
  matches('whole turkey', 'Jennie-O 14-Pound & Up Frozen Turkey', { category: 'Whole Turkey' });
});

test('DEFECT 5/8: Kenosha\'s cheapest whole turkey is the shelf price, not the online one', () => {
  const results = {
    woodmans: [
      item('woodmans', 'Jennie-O Less Than 14 Pounds Turkey', 'per lb', 1.89, { soldBy: 'lb', category: 'Whole Turkey' }),
      item('woodmans', 'Butterball Whole Smoked Turkey', 'per lb', 2.89, { soldBy: 'lb', category: 'Whole Turkey' }),
    ],
    meijer: [item('meijer', 'Butterball Premium Large Young Whole Turkey', 'per lb', 2.99, { soldBy: 'lb', priceBasis: 'online' })],
    aldi: [item('aldi', 'Butterball Frozen Whole Turkey', 'per lb', 2.19, { soldBy: 'lb', category: 'Whole Turkey' })],
    jewel: [item('jewel', 'Signature Farms Whole Turkey', 'per lb', 2.49, { soldBy: 'lb', category: 'Whole Turkey' })],
  };
  const { stores } = bestPerStore('whole turkey', results);
  assert.ok(stores.woodmans, "Woodman's was reported as having no relevant match");
  const cheapest = Object.entries(stores).sort((a, b) => a[1].unit.perBase - b[1].unit.perBase)[0];
  assert.equal(cheapest[0], 'woodmans');
  assert.ok(Math.abs(cheapest[1].unit.perBase * 16 - 1.89) < 0.01);
});

test('control: an exact-category match does not forgive a different commodity', () => {
  // 'dried' is not a storage state: dried cranberries are a different food from fresh ones.
  rejects('fresh cranberries', 'Best Choice Dried Cranberries', { category: 'Dried Cranberries' });
  rejects('milk', 'Almond Breeze Almond Milk', { category: 'Milk' });
  rejects('milk', 'Nesquik Chocolate Milk', { category: 'Milk' });
  // Nor does a category that also names a different food count as covering the query.
  rejects('butter', 'Organic Apricot Preserves', { category: 'Nut Butters & Fruit Spreads' });
  rejects('turkey', 'Organic Free Range Boneless Skinless Thighs', { category: 'Chicken & Turkey' });
});

// ---------------------------------------------------------------------------
// DEFECT 9 / 14: singular('cookies') returned 'cooky', a token in neither TRAPS nor FLAVOR, so
// every cookie product escaped the penalty its singular form receives. A 13 oz box of shortbread
// became ALDI's cheapest pecans at $2.77/lb against real chopped pecans at $7.18/lb, in all four
// ZIPs, and "Oatmeal Cranberry Cookies" became the cheapest fresh cranberries.
// ---------------------------------------------------------------------------
test('DEFECT 9: -ies plurals of -ie nouns stem to the -ie form', () => {
  assert.equal(singular('cookies'), 'cookie');
  assert.equal(singular('brownies'), 'brownie');
  assert.equal(singular('smoothies'), 'smoothie');
});

test('control: -ies plurals of -y nouns are unchanged', () => {
  assert.equal(singular('berries'), 'berry');
  assert.equal(singular('candies'), 'candy');
  assert.equal(singular('pastries'), 'pastry');
  assert.equal(singular('anchovies'), 'anchovy');
  assert.equal(singular('groceries'), 'grocery');
});

test('DEFECT 9: a box of cookies is not the cheapest pecans or cranberries', () => {
  rejects('pecans', "Benton's Pecan Shortbread Cookies", { category: 'Packaged Cookies' });
  rejects('fresh cranberries', 'Bake Shop Oatmeal Cranberry Cookies - 10 Count');
  matches('pecans', 'Southern Grove Chopped Pecans');
});

// ---------------------------------------------------------------------------
// DEFECT 15 / 21: 'bean' was not a trap noun, so a can of "Brown Sugar & Hickory Baked Beans"
// covered both words of "brown sugar" and became the cheapest brown sugar at ALDI, Mariano's and
// Meijer — and then the trip planner put baked beans on the shopping list.
// ---------------------------------------------------------------------------
test('DEFECT 15: a can of baked beans is not brown sugar', () => {
  rejects('brown sugar', "Dakota's Pride Brown Sugar & Hickory Baked Beans");
  rejects('brown sugar', 'Kroger® Brown Sugar Hickory Baked Beans');
  rejects('brown sugar', 'Meijer Brown Sugar Hickory Baked Beans');
  matches('brown sugar', 'Simply Nature Organic Light Brown Sugar Pouch');
  matches('brown sugar', "Baker's Corner Light Brown Sugar");
});

test('control: adding "bean" as a trap does not break a green bean search', () => {
  // A trap is skipped whenever the shopper typed it.
  matches('green beans', 'Del Monte Blue Lake Cut Green Beans');
  matches('green beans', 'Kroger® Frozen Green Beans Italian Cut', { category: 'Frozen Green Beans' });
  matches('baked beans', "Bush's Best Original Baked Beans");
});

// ---------------------------------------------------------------------------
// DEFECT 6 / 26: products that merely contain the search word as a modifier won BEST PRICE —
// instant noodles as "yams", hard cider as "apple cider", a hair treatment as "heavy cream", a
// children's book as "turkey" and a steel water bottle as "marshmallows".
// ---------------------------------------------------------------------------
test('DEFECT 6: a packet of Tom Yam noodles is not a yam', () => {
  rejects('yams', 'Mama Bean Vermicelli Tom Yam', { category: 'Vermicelli Noodles' });
  matches('yams', 'Food Club Yams, Cut');
});

test('DEFECT 26: alcohol does not answer a grocery search', () => {
  rejects('apple cider', 'Right Bee Cider Hard Apple Cider, Clementine');
  rejects('apple cider', "Blake's Hard Cider Co. American Imperial Apple Hard Cider");
  matches('apple cider', 'Riveridge Cider 100% Apple Cider Blend');
  // ...but asking for it on purpose still works, via the not-in-query guard.
  matches('hard cider', 'Right Bee Cider Hard Apple Cider');
});

test('DEFECT 26: cosmetics, books and cookware do not answer a grocery search', () => {
  rejects('heavy cream', 'Redken All Soft Heavy Cream Treatment');
  rejects('apple cider', 'Rosemary Apple Cider Scalp Detox Tonic');
  rejects('turkey', 'Turkey in Disguise (Hardcover) - Adam Wallace');
  rejects('marshmallows', 'Owala Shy Marshmallow 24 Oz Slider Stainless Steel Bottle with Handle');
  rejects('fresh cranberries', "Member's Mark Cranberry Orange Walnut Boule");
  rejects('pumpkin pie', 'McCormick Pumpkin Pie Spice');
  matches('heavy cream', 'Horizon Organic Heavy Whipping Cream');
  matches('pumpkin pie', 'Edwards Pumpkin Pie');
  matches('pumpkin pie spice', 'McCormick Pumpkin Pie Spice');
});

// ---------------------------------------------------------------------------
// DEFECT 11 / 12: these are the scores ios/App/Core/Match.swift must reproduce. The iOS matcher
// had no imitation rule at all and was missing eight trap words, so the phone crowned margarine
// as the cheapest butter and a can of Whole Paws dog food as the cheapest whole turkey while the
// website rejected both. The mirrored assertions live in ios/Tests/ThanksgivingPricingTests.swift.
// ---------------------------------------------------------------------------
test('DEFECT 11: margarine does not win a butter search (the score iOS must match)', () => {
  assert.ok(Math.abs(score('butter', 'Best Choice Tastes Like Butter') - 0.276) < 0.001);
  rejects('butter', 'Imitation Butter Spread');
  rejects('cheese', 'Cheese-Style Shreds');
});

test('control: asking for the imitation on purpose still finds it', () => {
  matches('margarine', 'Tastes Like Margarine Sticks');
  matches('butter margarine', 'Best Choice Tastes Like Butter Margarine');
  matches('plant based spread', 'Tastes Like Dairy Plant Based Spread');
});

test('DEFECT 12: dog food does not win a whole turkey search (the score iOS must match)', () => {
  const s = score('whole turkey', 'Turkey, Sweet Potatoes Cranberries Recipe in Gravy', { brand: 'Whole Paws' });
  assert.ok(s < RELEVANT, `dog food scored ${s.toFixed(3)}`);
  rejects('butter', 'Buttery Mashed Potatoes');
  rejects('potatoes', 'Potato Gratin Dinner Kit');
  rejects('rice', 'Rice Pilaf Mix');
});

// ---------------------------------------------------------------------------
// DEFECT 7: "Health Mart Pharmacy" mapped to H Mart, because the alias "h mart" was allowed to
// start mid-word inside "healt|h mart". Milwaukee and Kenosha shoppers were offered a Korean
// grocery chain with no Wisconsin stores, and a drug-store circular was published as its ad.
// ---------------------------------------------------------------------------
test('DEFECT 7: a chain alias may not start in the middle of a word', () => {
  assert.equal(chainForName('Health Mart Pharmacy'), null, 'a pharmacy franchise was mapped to a grocery chain');
  assert.equal(chainForName('Health Mart'), null);
  assert.equal(chainForName('H Mart')?.id, 'hmart');
});

test('control: punctuation still counts as a word boundary', () => {
  assert.equal(chainForName('Jewel-Osco')?.id, 'jewel');
  assert.equal(chainForName("Pick 'n Save")?.id, 'picknsave');
  assert.equal(chainForName("Woodman's Food Market")?.id, 'woodmans');
  assert.equal(chainForName('Whole Foods Market')?.id, 'wholefoods');
  assert.equal(chainForName('Fresh Thyme Market')?.id, 'freshthyme');
});

// ---------------------------------------------------------------------------
// DEFECT 10: the 8x guard suppressed genuine Thanksgiving loss-leaders. Measured against the live
// turkey distribution, a correctly-formed bird was flagged at $0.37, $0.49 and $0.99/lb in all
// four ZIPs. Every one of the guard's 10 low-side flags in the sweep was a false positive.
// ---------------------------------------------------------------------------
// A "turkey" search is dominated by deli and ground turkey, so the median in the live sweep sat
// between $8.87 and $10.30/lb in the four ZIPs — which is what put the old 1/8 suppression floor
// at $1.11-$1.29/lb, squarely inside the range a supermarket sells a Thanksgiving bird for.
const turkeyMarket = () => ({
  a: [item('a', 'Deli Turkey Breast', 'per lb', 9.49, { soldBy: 'lb' })],
  b: [item('b', 'Oven Roasted Turkey Breast', 'per lb', 9.99, { soldBy: 'lb' })],
  c: [item('c', 'Ground Turkey', 'per lb', 5.99, { soldBy: 'lb' })],
  d: [item('d', 'Turkey Breast Tenderloin', 'per lb', 8.99, { soldBy: 'lb' })],
  e: [item('e', 'Organic Turkey Breast', 'per lb', 11.99, { soldBy: 'lb' })],
  f: [item('f', 'Turkey Pastrami', 'per lb', 12.99, { soldBy: 'lb' })],
});

test('DEFECT 10: a real holiday loss-leader survives the plausibility guard', () => {
  for (const price of [0.37, 0.49, 0.99]) {
    const results = turkeyMarket();
    results.doorbuster = [item('doorbuster', 'Honeysuckle White Frozen Whole Turkey', 'per lb', price, { soldBy: 'lb', category: 'Whole Turkey' })];
    const { stores } = bestPerStore('turkey', results);
    assert.ok(stores.doorbuster, `a genuine $${price.toFixed(2)}/lb bird was suppressed as "price looks wrong"`);
  }
});

test('control: a packaged doorbuster with the weight on the label survives too', () => {
  // 37c/lb as a 12 lb bird at $4.44 with its weight in the retailer's own size field. The second
  // low-side signal only doubts sizes WE inferred; this one the retailer stated.
  const results = turkeyMarket();
  results.doorbuster = [item('doorbuster', 'Honeysuckle White Frozen Whole Turkey', '12 lb', 4.44, { category: 'Whole Turkey' })];
  const { stores } = bestPerStore('turkey', results);
  assert.ok(stores.doorbuster, 'a genuine 37c/lb packaged bird was suppressed');
  // The same bird with its weight only in the name is not stated by the retailer: it may be listed,
  // but it cannot be the headline until something vouches for it.
  const inferred = turkeyMarket();
  inferred.doorbuster = [item('doorbuster', 'Honeysuckle White Frozen Whole Turkey, 12 lb', 'each', 4.44, { category: 'Whole Turkey' })];
  assert.ok(!bestPerStore('turkey', inferred).stores.doorbuster);
});

test('control: a price that no grocery can be is still refused', () => {
  const results = turkeyMarket();
  results.broken = [item('broken', 'Whole Turkey', 'per lb', 0.02, { soldBy: 'lb', category: 'Whole Turkey' })];
  const { stores } = bestPerStore('turkey', results);
  assert.ok(!stores.broken, 'an impossible price became the headline');
});

// ---------------------------------------------------------------------------
// DEFECT 17: warehouse-club case prices sat between 5.7x and 6.7x the median and slipped under
// the 8x cut, so Sam's Club evaporated milk was presented as $13.31 for one 12 fl oz can.
// ---------------------------------------------------------------------------
// Round 1's fixture put Sam's at 8.37x the median, which the OLD 8x cut already caught, so the
// test passed with the threshold reverted. These sit where the fix is needed: 5.7x to 6.7x.
test('DEFECT 17: a case price quoted as one unit is caught', () => {
  for (const samsPrice of [9.06, 9.86, 10.6]) {
    const results = {
      aldi: [item('aldi', 'Baker\'s Corner Evaporated Milk', '12 fl oz', 0.99)],
      jewel: [item('jewel', 'Carnation Evaporated Milk', '12 fl oz', 1.79)],
      tonys: [item('tonys', 'Carnation Evaporated Milk', '12 fl oz', 1.59)],
      meijer: [item('meijer', 'Meijer Evaporated Milk', '12 fl oz', 1.29)],
      samsclub: [item('samsclub', 'Carnation Evaporated Milk', '12 fl oz', samsPrice)],
    };
    const { stores } = bestPerStore('evaporated milk', results);
    const ratio = results.samsclub[0].unit.volume.perBase / results.tonys[0].unit.volume.perBase;
    assert.ok(ratio > 5.6 && ratio < 6.8, `fixture drifted to ${ratio.toFixed(2)}x`);
    assert.ok(!stores.samsclub, `$${samsPrice} for one 12 fl oz can (${ratio.toFixed(1)}x the median) was presented as a real price`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 18: correct per-sheet foil prices were badged "price looks wrong". The count dimension
// counts PACKAGES, so a 50-sheet box sits far from a median made of single rolls; distance from
// that median says nothing about whether the price is right.
// ---------------------------------------------------------------------------
test('DEFECT 18: a correct per-sheet price is not called wrong', () => {
  const foil = [
    item('woodmans', 'Simply Done Foil Sheets, Aluminum, Pre-Cut', '50 ct', 2.69),
    item('picknsave', 'Kroger Aluminum Pre-Cut Foil Sheets', '50 ct', 3.99),
    item('meijer', 'Meijer Aluminum Foil', '1 ct', 5.99),
    item('aldi', 'Boulder Aluminum Foil', '1 ct', 3.95),
    item('samsclub', 'Members Mark Heavy Duty Foil 2pk', '1 ct', 13.83),
    item('costco', 'Kirkland Signature Aluminum Foil', '1 ct', 55.97),
  ];
  flagImplausible(foil, 'count');
  for (const p of foil) {
    assert.equal(p.implausible, undefined, `"${p.name}" was told its correct price looks wrong`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 19 / 28: Costco lists "Sweet Potatoes, 5 lbs" with a stated size of 10 lb. The app kept
// the sizeText silently — the reading that halves the unit price and wins the best-price badge.
// ---------------------------------------------------------------------------
test('DEFECT 19: a row whose name and size contradict each other is recorded', () => {
  const p = item('costco', 'Sweet Potatoes, 5 lbs', '10 lb', 8.07);
  assert.deepEqual(p.sizeConflict, { text: '10 lb', name: '5 lb' });
});

// Round 2: the retailer's slug is the third witness that settles it. Costco's says 10 lb twice and
// 5 lb never, so this exact row is NOT a conflict — the sweet-potato case stays fixed — while any
// row with no such witness is recorded as above.
test('control: a slug that names the stated size settles the contradiction', () => {
  const p = item('costco', 'Sweet Potatoes, 5 lbs', '10 lb', 8.07, {
    url: 'https://www.instacart.com/products/18848374-sweet-potatoes-10-lbs-10-lb?retailerSlug=costco',
  });
  assert.equal(p.sizeConflict, null);
});

test('DEFECT 19: a contradictory row cannot win best price', () => {
  const results = {
    costco: [item('costco', 'Sweet Potatoes, 5 lbs', '10 lb', 8.07)],
    woodmans: [item('woodmans', 'Sweet Potato (Yam)', 'per lb', 0.99, { soldBy: 'lb' })],
    aldi: [item('aldi', 'Sweet Potatoes', '3 lb', 3.49)],
    jewel: [item('jewel', 'Sweet Potatoes', 'per lb', 1.29, { soldBy: 'lb' })],
  };
  const { stores } = bestPerStore('sweet potatoes', results);
  assert.ok(!stores.costco, 'a row contradicting itself by 2x took the best-price badge');
  const cheapest = Object.entries(stores).sort((a, b) => a[1].unit.perBase - b[1].unit.perBase)[0];
  assert.equal(cheapest[0], 'woodmans');
});

test('control: a size pickSize deliberately resolves is not a conflict', () => {
  // The name states a multipack the sizeText does not; pickSize already knows which is which.
  const milk = item('costco', 'Kirkland Ultra Filtered 2% Lactose Free Milk, Half Gallon, 3-count', '64 fl oz', 14.92);
  assert.equal(milk.sizeConflict, null);
  const eggs = item('costco', 'Kirkland Signature Eggs, Large, 24-count', '1 ea', 4.71);
  assert.equal(eggs.sizeConflict, null);
});

// ---------------------------------------------------------------------------
// DEFECT 23: produceWeightLb matched a produce word anywhere in the name and invented a
// per-pound figure from it — $1.15/lb for instant noodles, $1.66/lb for a box of mochi whose
// honest figure is $12.78/lb, and $25.98/lb for a bag of onions priced as one onion.
// ---------------------------------------------------------------------------
test('DEFECT 23: no per-pound estimate is invented for things that are not one piece of produce', () => {
  assert.equal(produceWeightLb('Mama Bean Vermicelli Tom Yam'), null);
  assert.equal(produceWeightLb('Sweety Mochi, Ube Purple Yam'), null);
  assert.equal(produceWeightLb('Yellow Onion Bag'), null);
  assert.equal(produceWeightLb("Bruce's Yams Cut Sweet Potatoes In Syrup"), null);
});

test('control: loose produce still gets its estimate', () => {
  assert.equal(produceWeightLb('Bananas'), 0.33);
  assert.equal(produceWeightLb('Avocado'), 0.4);
  assert.equal(produceWeightLb('Sweet Potato'), 0.6);
  assert.equal(produceWeightLb('Roma Tomatoes'), 0.15);
});

// ---------------------------------------------------------------------------
// DEFECT 24: coerceLiquid sent identical cans into different dimensions depending on whether the
// label said "in Syrup", and priced net-weight cans per gallon. Two 40 oz cans of the same cut
// sweet potato at the same $4.99 on one shelf compared as $2.00/lb and $15.97/gal.
// ---------------------------------------------------------------------------
// Round 1's three names were all decided by SOLID_RE ('yams', 'sweet potato') before the packing
// medium rule was ever consulted, so it passed with that rule deleted. None of these carries a
// solid word: only the packing medium keeps them out of the per-gallon comparison.
test('DEFECT 24: a packing medium does not make a can a liquid', () => {
  for (const [size, name] of [
    ['15.25 oz', 'Del Monte Sliced Peaches in Light Syrup'],
    ['15 oz', 'Sweet Harvest Peach Slices in 100% Juice'],
    ['20 oz', 'Sweet Harvest Pineapple Chunks in Pineapple Juice'],
    ['15 oz', 'Meijer Red Tart Pitted Cherries In Water'],
  ]) {
    assert.equal(coerceLiquid(parseSize(size), name).dim, 'weight', name);
  }
});

test('DEFECT 24: net-weight cans are not priced per gallon', () => {
  assert.equal(coerceLiquid(parseSize('14 oz'), "Baker's Corner Jellied Cranberry Sauce").dim, 'weight');
  assert.equal(coerceLiquid(parseSize('10.5 oz'), "Chef's Cupboard Condensed Cream of Mushroom Soup").dim, 'weight');
  assert.equal(coerceLiquid(parseSize('24 oz'), 'Specially Selected Assorted Soups').dim, 'weight');
});

test('control: things really sold in fluid ounces stay in volume', () => {
  const s32 = parseSize('32 oz');
  for (const n of ["Chef's Cupboard Chicken Broth", 'Swanson Beef Stock', 'Simply Orange Juice', 'Horizon Organic Whole Milk']) {
    assert.equal(coerceLiquid(s32, n).dim, 'volume', `${n} stopped being a liquid`);
  }
  assert.equal(coerceLiquid(parseSize('12 oz'), 'Coca-Cola Cans').dim, 'volume');
  assert.equal(coerceLiquid(parseSize('5 oz'), 'StarKist Chunk Light Tuna in Water').dim, 'weight');
});

// ---------------------------------------------------------------------------
// DEFECT 22: the web judged plausibility over every raw result and iOS over the relevant subset,
// so the two apps disagreed about which prices were wrong on 49 items across 21 query groups.
// Both now judge against the matches, which is also what the Compare view already did.
// ---------------------------------------------------------------------------
// Round 1's noise landed one each side of the median, so the median was the same with or without
// it and the test passed with the fix reverted. Here all the noise is dear, same dimension, and
// enough of it to move a median taken over everything the store returned: judged that way, the
// case price sits at 2.9x and passes; judged against the matches it is 13.9x and is caught.
test('DEFECT 22: plausibility is judged against matches, not against everything the store returned', () => {
  const noise = ['Apple Cider Vinegar', 'Organic Apple Cider Vinegar', 'Apple Cider Vinaigrette', 'Hard Apple Cider', 'Apple Cider Cocktail Mixer'];
  const results = {
    a: [item('a', '100% Apple Cider', '64 fl oz', 4.69)],
    b: [item('b', 'Apple Cider', '128 fl oz', 7.45)],
    c: [item('c', 'Honeycrisp Apple Cider', '64 fl oz', 5.99)],
    d: [item('d', 'Apple Cider', '64 fl oz', 4.99)],
    // A case price with one bottle's size: $138/gal against a real cider median near $10.
    e: [item('e', 'Organic Apple Cider', '12 fl oz', 12.99)],
    // Noise the store returned that is NOT a match; it must not move the median.
    f: noise.map((n) => item('f', n, '16 fl oz', 5.99)),
  };
  for (const p of results.f) assert.ok(relevance('apple cider', p) < RELEVANT, `precondition: "${p.name}" is not a match`);
  const { stores } = bestPerStore('apple cider', results);
  assert.ok(!stores.e, 'a 6x overstatement was presented as a real price');
  for (const s of ['a', 'b', 'c', 'd']) assert.ok(stores[s], `${s} lost a correct price`);
});
