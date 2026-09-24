// QA round 2: the numbers. Every DEFECT below put a wrong price, a wrong comparison or a claim the
// sources cannot support in front of a shopper, on the build round 1 shipped. Records are the real
// listings captured in the four-ZIP Thanksgiving sweep (60618, 60148, 53211, 53142) unless noted.
//
// Each test drives the production path — makeProduct -> bestPerStore -> savingsClaim, or the
// adapter's own record parser — rather than a helper on its own: round 1's helper tests stayed
// green while the helper was unhooked from the code that shipped.
//
// Run: BASKET_DATA_DIR=<scratch dir> node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '../src/normalize.js';
import { parseItem, dropStaleSizeFromName } from '../src/adapters/instacart.js';
import { bestPerStore, excludedCheaper, flagImplausible, judgePlausibility, savingsClaim, planSavingsClaim, referenceAmount, scoreItems, standings } from '../shared/compare.js';
import { RELEVANT } from '../shared/match.js';
import { parseSize } from '../shared/units.js';
import { priceItem } from '../src/list.js';

const item = (storeId, name, sizeText, price, extra = {}) => makeProduct({ storeId, id: `${storeId}-${name}-${sizeText}`, name, sizeText, price, ...extra });
const perLb = (p) => (p.unit.weight ? p.unit.weight.perBase * 16 : null);
const perGal = (p) => (p.unit.volume ? p.unit.volume.perBase * 128 : null);
const close = (a, b, tol = 0.01) => a != null && Math.abs(a - b) <= tol;
/** Stores ranked cheapest first, as the headline and the per-store chart show them. */
const ranked = (r) => Object.entries(r.stores).sort((a, b) => a[1].unit.perBase - b[1].unit.perBase);

// ---------------------------------------------------------------------------
// DEFECT P1: "Sara Lee Hawaiian Rolls, 12 ct, 15 oz" parsed as 12 x 15 oz = 180 oz. The bag is
// twelve rolls weighing 15 oz, so Woodman's $2.69 read 23.9c/lb (true $2.87) and Metro Market's
// $4.99 read 44.4c/lb (true $5.32) — the BEST PRICE at 53211 with "20.4c (46%) less" on top.
// ---------------------------------------------------------------------------
const DR = { category: 'Dinner Rolls' };
const ROLLS_53211 = () => ({
  woodmans: [
    item('woodmans', 'Sara Lee Hawaiian Rolls, 12 ct, 15 oz', '12 ct', 2.69, DR),
    item('woodmans', "Aunt Millie's Big & Fluffy Hawaiian Dinner Rolls", '17 oz', 3.79, DR),
  ],
  metromarket: [item('metromarket', 'Sara Lee Hawaiian Rolls, 12 ct, 15 oz', '12 ct', 4.99, { ...DR, priceBasis: 'online' })],
  meijer: [item('meijer', "Aunt Millie's Big & Fluffy Hawaiian Dinner Rolls", '17 oz', 3.99, { ...DR, priceBasis: 'online' })],
  aldi: [item('aldi', 'Specially Selected Brioche Rolls - 12 Pack', '16.9 oz', 4.19, DR)],
  traderjoes: [item('traderjoes', 'Dinner Rolls', '12 oz', 2.99, { category: 'Loaves, Rolls, Buns' })],
  wholefoods: [item('wholefoods', 'Brioche Dinner Rolls', '16.9 oz', 6.99)],
});

test('DEFECT P1: "12 ct, 15 oz" is twelve rolls in a 15 oz bag, not twelve 15 oz bags', () => {
  const [woodmans] = ROLLS_53211().woodmans;
  assert.equal(woodmans.base, 15, `sized ${woodmans.size}`);
  assert.ok(close(perLb(woodmans), 2.87), `$${perLb(woodmans)?.toFixed(3)}/lb`);
});

test('DEFECT P1: the rolls no longer take the dinner-rolls headline at 53211', () => {
  const r = bestPerStore('dinner rolls', ROLLS_53211(), { dim: 'weight' });
  const [[winner, best]] = ranked(r);
  assert.ok(best.unit.perBase * 16 > 1, `headline ${winner} at $${(best.unit.perBase * 16).toFixed(3)}/lb`);
  assert.ok(close(r.stores.metromarket.unit.perBase * 16, 5.32), 'Metro Market at its true $5.32/lb');
});

test('control: a count before a VOLUME is still a pack of containers', () => {
  const sunny = item('samsclub', 'SunnyD Tangy Original Orange Juice Drink, 24 Count, 6.75 FL OZ Bottles', '6.75 fl oz', 9.32);
  assert.equal(sunny.base, 162);
  const soda = item('x', 'Store Brand Cola, 12 ct, 12 fl oz', '', 5.99);
  assert.equal(soda.base, 144);
});

test('control: Costco states one loaf, so "2-count, 20 oz" is two loaves', () => {
  const bread = item('costco', 'Artesano the Original Bakery Bread, 2-count, 20 oz', '20 oz', 7.08);
  assert.equal(bread.base, 40);
  assert.equal(bread.sizeConflict, null);
});

test('DEFECT P1: "6-Pack, 5.63 LB" over a stated 15 oz is six cans that weigh 5.63 lb in all', () => {
  // Sam's Club. Read as a multipack it was 40c/lb; stripped as a "stale" clause it was $14.34/lb.
  const chili = item('samsclub', 'Hormel Chili with Beans 6-Pack, 5.63 LB', '15 oz', 13.44);
  assert.ok(close(perLb(chili), 2.39), `$${perLb(chili)?.toFixed(3)}/lb (${chili.size})`);
  assert.equal(dropStaleSizeFromName('Hormel Chili with Beans 6-Pack, 5.63 LB', '15 oz', 'https://www.instacart.com/products/1959264-hormel-chili-with-beans-15-oz?retailerSlug=sams-club'), 'Hormel Chili with Beans 6-Pack, 5.63 LB');
});

test('control: "pk" counts packages, so "12pk 12oz" is still a twelve-pack', () => {
  // The first round-2 cut read every count word before a weight as a piece count, and turned a
  // twelve-pack of 12 oz cans into one 12 oz package — 12x too dear. The iOS suite caught it.
  assert.equal(parseSize('12pk 12oz').base, 144);
  assert.equal(parseSize('12 pk / 12 fl oz').base, 144);
  assert.equal(item('x', 'Cola 12pk 12oz', '', 6.99).base, 144);
  assert.equal(item('x', 'Store Brand Diced Tomatoes, 6 cans, 14.5 oz', '', 5.99).base, 87);
});

test('control: "12-count 5.3 oz cups" names the cups, so each holds 5.3 oz', () => {
  assert.equal(item('x', 'Greek Yogurt', '12-count 5.3 oz cups', 9.99).base, 63.6);
});

// ---------------------------------------------------------------------------
// DEFECT P2: round 1 moved the too-cheap floor from 1/8 to 1/30 of the median. The rolls sat at
// 0.054 and 0.101 and went straight to the headline. A price that far under everything else must
// be vouched for — by the retailer stating its basis, or by another product — before it can win.
// ---------------------------------------------------------------------------
test('DEFECT P2: a far-too-cheap price built on a size we inferred cannot take the headline', () => {
  // The same shape as the rolls, with the multiplication written out so no parse fix hides it:
  // the size is read from the name (sizeSource 'name') and is 12x too big.
  const results = ROLLS_53211();
  results.woodmans = [item('woodmans', 'Hawaiian Dinner Rolls, 12 x 15 oz', '12 ct', 2.69, DR)];
  const r = bestPerStore('dinner rolls', results, { dim: 'weight' });
  const flagged = results.woodmans[0];
  assert.equal(flagged.sizeSource, 'name');
  assert.ok(flagged.implausible?.direction === 'low', `not flagged: $${perLb(flagged).toFixed(3)}/lb against peers at $3-7`);
  assert.ok(!r.stores.woodmans, 'a 12x-too-cheap price took the store\'s best');
});

test('control: a cheap price whose basis the retailer stated survives (Tony\'s drumsticks at 0.116)', () => {
  const results = {
    tonys: [item('tonys', "Tony's Fresh Market Turkey Drumsticks", '3.43 lb', 3.99)],
    a: [item('a', 'Deli Turkey Breast', 'per lb', 9.49, { soldBy: 'lb' })],
    b: [item('b', 'Oven Roasted Turkey Breast', 'per lb', 9.99, { soldBy: 'lb' })],
    c: [item('c', 'Turkey Breast Tenderloin', 'per lb', 10.49, { soldBy: 'lb' })],
    d: [item('d', 'Organic Turkey Breast', 'per lb', 11.99, { soldBy: 'lb' })],
  };
  const r = bestPerStore('turkey', results);
  assert.equal(results.tonys[0].implausible, undefined);
  assert.equal(ranked(r)[0][0], 'tonys');
});

test('control: an inferred-size bargain another product vouches for survives', () => {
  const results = {
    costco: [item('costco', 'Kirkland Signature Salted Butter, 16 oz, 4-count', 'each', 9.99)],
    aldi: [item('aldi', 'Countryside Creamery Butter', '16 oz', 2.69)],
    a: [item('a', 'Kerrygold Pure Irish Butter', '8 oz', 4.99)],
    b: [item('b', 'Plugra European Style Butter', '8 oz', 5.49)],
    c: [item('c', 'Vermont Creamery Cultured Butter', '8 oz', 6.99)],
    d: [item('d', 'Organic Valley Butter', '8 oz', 7.49)],
    e: [item('e', 'Isigny Ste Mere Butter', '8.8 oz', 9.99)],
    f: [item('f', 'Beurre Butter', '8 oz', 12.99)],
  };
  const r = bestPerStore('butter', results);
  assert.equal(results.costco[0].sizeSource, 'name');
  assert.equal(results.costco[0].implausible, undefined, 'a real case price vouched for by ALDI was called wrong');
  assert.ok(r.stores.costco);
});

// ---------------------------------------------------------------------------
// DEFECT P3 / P4: the savings line was computed across price bases the app itself says are not
// comparable, and against prices it badges as wrong. At 53142: ALDI's shelf $0.99 was "1% less
// than the next-best store, walmart" — a chain-wide listing with no address; turkey breast was
// "1% less than festivalfoods", an online price labelled "Prices vary from in-store".
// ---------------------------------------------------------------------------
const EVAP_53142 = () => ({
  aldi: [item('aldi', "Baker's Corner Evaporated Milk", '12 fl oz', 0.99)],
  walmart: [item('walmart', 'Great Value Evaporated Milk', '12 fl oz', 1.0, { priceBasis: 'national' })],
  picknsave: [item('picknsave', 'Carnation Evaporated Milk', '12 fl oz', 1.79, { priceBasis: 'online' })],
  woodmans: [item('woodmans', 'Food Club Evaporated Milk', '12 fl oz', 1.09)],
});

test('DEFECT P3: no percentage between a shelf price and a chain-wide one', () => {
  const r = bestPerStore('evaporated milk', EVAP_53142());
  const [[, best], [runnerId, runnerUp]] = ranked(r);
  assert.equal(runnerId, 'walmart');
  const claim = savingsClaim(best, runnerUp);
  assert.ok(claim, 'no line at all');
  assert.equal(claim.kind, 'close');
  assert.ok(!/%/.test(claim.text), claim.text);
  assert.match(claim.text, /chain-wide/);
});

test('DEFECT P3: no percentage between a shelf price and an online one inside its spread', () => {
  const results = {
    aldi: [item('aldi', 'Kirkwood Turkey Breast', '1 lb', 4.15)],
    festivalfoods: [item('festivalfoods', 'Festival Turkey Breast', '1 lb', 4.19, { priceBasis: 'online' })],
  };
  const r = bestPerStore('turkey breast', results);
  const claim = savingsClaim(ranked(r)[0][1], ranked(r)[1][1]);
  assert.equal(claim.kind, 'close');
  assert.equal(claim.pct, undefined);
});

test('control: two shelf prices still get an exact saving', () => {
  const r = bestPerStore('evaporated milk', { aldi: EVAP_53142().aldi, woodmans: EVAP_53142().woodmans });
  const claim = savingsClaim(ranked(r)[0][1], ranked(r)[1][1]);
  assert.equal(claim.kind, 'exact');
  assert.equal(claim.pct, 9);
  assert.equal(claim.text, '{amount}/{unit} (9%) less than the next-best store, {store}');
});

test('control: across bases, a gap wider than the spread is stated without a number', () => {
  const r = bestPerStore('evaporated milk', { aldi: EVAP_53142().aldi, picknsave: EVAP_53142().picknsave });
  const claim = savingsClaim(ranked(r)[0][1], ranked(r)[1][1]);
  assert.equal(claim.kind, 'ahead');
  assert.equal(claim.text, 'Less than the next-best store, {store} (online price)');
});

test('DEFECT P4: no saving is ever computed against a flagged price, on either side', () => {
  const winner = item('woodmans', 'Butterball Whole Turkey', 'per lb', 1.69, { soldBy: 'lb' });
  const deli = item('festivalfoods', 'Kretschmar Sundried Tomato Turkey', 'per lb', 14.49, { soldBy: 'lb' });
  deli.implausible = { ratio: 5.2, median: 2.79, direction: 'high' };
  assert.equal(savingsClaim({ item: winner, unit: winner.unit.weight }, { item: deli, unit: deli.unit.weight }), null);
  const conflicted = item('costco', 'Sweet Potatoes, 5 lbs', '10 lb', 8.07);
  assert.ok(conflicted.sizeConflict, 'precondition');
  assert.equal(savingsClaim({ ...conflicted, cmp: 0.05 }, { ...winner, cmp: 0.1 }), null);
});

test('DEFECT P3: a trip plan mixing online and chain-wide lines states no exact saving', () => {
  const cheaper = { total: 10.0, low: 8.9, high: 10.5, bases: ['national', 'shelf'] };
  const dearer = { total: 10.4, low: 9.6, high: 10.4, bases: ['online', 'shelf'] };
  assert.equal(planSavingsClaim(cheaper, dearer).kind, 'close');
  const shelf = planSavingsClaim({ total: 10, bases: ['shelf'] }, { total: 12.5, bases: ['shelf'] });
  assert.deepEqual(shelf, { kind: 'exact', amount: 2.5, text: 'saves {amount}' });
});

// ---------------------------------------------------------------------------
// DEFECT P5: the same Chomps sticks read $31.33/lb at Costco ("24 x 0.5 oz") and $223.68/lb at
// ALDI, whose name says "6 Count" over a stated 0.5 oz — one stick's size.
// ---------------------------------------------------------------------------
test('DEFECT P5: a size that cannot be the whole of N pieces withholds the unit price', () => {
  const aldi = item('aldi', 'Chomps Original Turkey Chomplings Mini Sticks - 6 Count', '0.5 oz', 6.99);
  assert.ok(aldi.sizeConflict, 'the count/size disagreement was not recorded');
  assert.equal(perLb(aldi), null, `still published at $${perLb(aldi)?.toFixed(2)}/lb`);
  const costco = item('costco', 'Chomps Chomplings Original Turkey Mini Sticks, 0.5 oz, 24-count', 'each', 23.5);
  assert.ok(close(perLb(costco), 31.33));
});

test('control: a whole-package size over a piece count keeps its unit price', () => {
  const butter = item('aldi', 'Countryside Creamery Sweet Cream Butter - 4 Sticks', '16 oz', 2.89);
  assert.equal(butter.sizeConflict, null);
  assert.ok(close(perLb(butter), 2.89));
  const minis = item('aldi', 'Mars Witch Mix Minis, 70 pc', '19.49 oz', 9.94);
  assert.equal(minis.sizeConflict, null);
});

// ---------------------------------------------------------------------------
// DEFECT P6: "Holds Up to 24 Pounds" is what an oven bag takes, not what it weighs. Read as two
// 24 lb packages the bags were the five cheapest per-pound rows of a 53211 whole-turkey search.
// ---------------------------------------------------------------------------
test('DEFECT P6: a capacity is not a weight', () => {
  const bags = item('woodmans', 'Reynolds Turkey Size Oven Bags, Holds Up to 24 Pounds, 2 Count', '2 ct', 2.49, { category: 'Oven Cooking Bags' });
  assert.equal(perLb(bags), null, `$${perLb(bags)}/lb`);
  assert.notEqual(bags.dim, 'weight');
});

// ---------------------------------------------------------------------------
// DEFECT P7: Bare Bones "Chicken Broth Pantry Pack" (instant broth, NET WT 2.12 oz) read $422/gal
// in a Chicago broth search whose broths sat near $10/gal.
// ---------------------------------------------------------------------------
test('DEFECT P7: a dry or concentrated broth is not priced per gallon', () => {
  for (const [name, size] of [['Chicken Broth Pantry Pack', '2.12 OZ'], ['Bare Bones Instant Chicken Bone Broth Sticks', '0.53 oz'], ['Chicken Broth Concentrate', '4.06 Oz']]) {
    const p = item('x', name, size, 6.99);
    assert.equal(perGal(p), null, `"${name}" at $${perGal(p)?.toFixed(2)}/gal`);
  }
});

test('control: ready-to-drink broth, and juice "from concentrate", stay liquids', () => {
  assert.equal(item('x', 'Organic Chicken Broth', '32 oz', 3.99).dim, 'volume');
  assert.equal(item('x', 'Apple Juice From Concentrate', '64 oz', 2.99).dim, 'volume');
});

// ---------------------------------------------------------------------------
// DEFECT P8: two 16.9 OZ Kettle & Fire bone broths at the same $8.79 landed in different
// dimensions because "Butter Chicken" contains 'butter'.
// ---------------------------------------------------------------------------
test('DEFECT P8: "Butter Chicken" bone broth compares with the other bone broths', () => {
  const classic = item('wholefoods', 'Organic Classic Chicken Bone Broth', '16.9 OZ', 8.79);
  const butter = item('wholefoods', 'Organic Butter Chicken Bone Broth', '16.9 OZ', 8.79);
  assert.equal(butter.dim, classic.dim);
  assert.equal(butter.dim, 'volume');
});

// ---------------------------------------------------------------------------
// DEFECT P9: dropStaleSizeFromName erased every name/size disagreement at the adapter, so
// sizeConflict could never fire again. Only a third witness — the retailer's slug — may settle it.
// ---------------------------------------------------------------------------
const SWEET_POTATO_URL = 'https://www.instacart.com/products/18848374-sweet-potatoes-10-lbs-10-lb?retailerSlug=costco';

test('DEFECT P9: a name/size disagreement nothing settles is recorded, and cannot win', () => {
  const p = item('costco', 'Sweet Potatoes, 5 lbs', '10 lb', 8.07, { url: 'https://www.instacart.com/products/1-sweet-potatoes?retailerSlug=costco' });
  assert.deepEqual(p.sizeConflict, { text: '10 lb', name: '5 lb' });
  assert.equal(dropStaleSizeFromName('Sweet Potatoes, 5 lbs', '10 lb', 'https://www.instacart.com/products/1-sweet-potatoes?retailerSlug=costco'), 'Sweet Potatoes, 5 lbs');
});

test('control: the Costco slug that says 10 lb twice settles it — no conflict, price from 10 lb', () => {
  const p = item('costco', 'Sweet Potatoes, 5 lbs', '10 lb', 8.07, { url: SWEET_POTATO_URL });
  assert.equal(p.sizeConflict, null);
  assert.ok(close(perLb(p), 0.807));
});

// A captured Costco record from the Instacart Items query, reduced to the fields parseItem reads.
const costcoRecord = (evergreenUrl) => ({
  id: 'items_1-18848374',
  productId: '18848374',
  name: 'Sweet Potatoes, 5 lbs',
  size: '10 lb',
  evergreenUrl,
  price: { viewSection: { itemCard: { priceString: '$8.07' } } },
  availability: { available: true },
});
const COSTCO = { storeId: 'costco', base: 'https://www.instacart.com', slug: 'costco' };

test('DEFECT P9/4: the Instacart adapter really drops a stale clause (the helper is wired)', () => {
  const p = parseItem(costcoRecord('18848374-sweet-potatoes-10-lbs-10-lb'), COSTCO, { serviceType: 'instore' }, 0, 1, false);
  assert.equal(p.name, 'Sweet Potatoes');
  assert.equal(p.sizeConflict, null);
});

test('DEFECT P9: ...and keeps it, with the conflict recorded, when the slug does not settle it', () => {
  const p = parseItem(costcoRecord('18848374-sweet-potatoes'), COSTCO, { serviceType: 'instore' }, 0, 1, false);
  assert.equal(p.name, 'Sweet Potatoes, 5 lbs');
  assert.ok(p.sizeConflict);
  assert.equal(perLb(p), null, 'a unit price was still published for a row whose sizes disagree');
});

test('DEFECT P9: two sizes that differ by a count the listing states are one unit and the pack', () => {
  // Costco: the slug says "4count"; stated 7.72 oz is one bowl, the name's 30.9 oz is the pack.
  const udon = item('costco', 'Pulmuone Teriyaki Stir-fry Udon, 30.9 oz', '7.72 oz', 10.81, { url: 'https://www.instacart.com/products/123231150-pulmuone-teriyaki-stirfry-udon-772-oz-4count-772-oz?retailerSlug=costco' });
  assert.ok(close(perLb(udon), 5.6), `$${perLb(udon)?.toFixed(2)}/lb (${udon.size})`);
  assert.equal(dropStaleSizeFromName('Pulmuone Teriyaki Stir-fry Udon, 30.9 oz', '7.72 oz', udon.url), 'Pulmuone Teriyaki Stir-fry Udon, 30.9 oz');
  // Sam's Club: "96 Oz. Twin Pack" over a stated 48 oz jar.
  const jif = item('samsclub', 'Jif Creamy Peanut Butter, 7g Protein (7% DV), 96 Oz. Twin Pack', '48 oz', 15.21);
  assert.ok(close(perLb(jif), 2.535), `$${perLb(jif)?.toFixed(3)}/lb (${jif.size})`);
  assert.equal(jif.sizeConflict, null);
});

test('control: an exact ratio with no count behind it is still a conflict', () => {
  // BELVITA "Pumpkin Spice 8.8 oz" over a stated 1.76 oz is exactly 5x, and says 5 nowhere.
  const p = item('woodmans', 'BELVITA Breakfast Biscuits, Pumpkin Spice 8.8 oz', '1.76 oz', 3.99);
  assert.ok(p.sizeConflict);
});

test('DEFECT P9: pack notation and weight ranges in a name are not a second size', () => {
  // Kroger "4/4 oz" is four 4 oz sticks, not a quarter of... 1 oz; the price is right at $3.99/lb.
  const butter = item('picknsave', 'Kroger 4/4 oz Elgin Stick of USDA Grade AA Salted Butter 1 lb', '1 lb', 3.99);
  assert.equal(butter.sizeConflict, null);
  assert.ok(close(perLb(butter), 3.99));
  // "4-10 Pounds" describes a variable-weight breast sold by the pound.
  const breast = item('petes', '4-10 Pounds HoKa Turkey Breast', '1 lb', 7.69);
  assert.equal(breast.sizeConflict, null);
});

// ---------------------------------------------------------------------------
// DEFECT P10: "in 100% Juice" and "in Pineapple Juice" were not recognised as packing media, so
// net-weight cans of fruit were quoted per gallon.
// ---------------------------------------------------------------------------
test('DEFECT P10: canned fruit "in 100% Juice" is a net-weight can', () => {
  for (const [name, size] of [['Sweet Harvest Peach Slices in 100% Juice', '15 oz'], ['Sweet Harvest Pineapple Chunks in Pineapple Juice', '20 oz'], ["Member's Mark Diced Tomatoes In Tomato Juice", '14.5 oz']]) {
    assert.equal(item('aldi', name, size, 1.55).dim, 'weight', name);
  }
  assert.equal(item('aldi', 'Del Monte Sliced Peaches in Light Syrup', '15.25 oz', 1.79).dim, 'weight');
});

test('control: juice itself is still a liquid', () => {
  assert.equal(item('aldi', 'Nature\'s Nectar Pineapple Juice', '46 oz', 2.49).dim, 'volume');
});

// ---------------------------------------------------------------------------
// DEFECT P11: sizeConflict read "12g Whole Grains" as the size of a box of cereal.
// ---------------------------------------------------------------------------
test('DEFECT P11: a nutrition claim is not a package size', () => {
  const loops = item('meijer', "Kellogg's Froot Loops With Marshmallows Breakfast Cereal 12g Whole Grains Family Size 16.2 oz", '16.2 oz', 3.99);
  assert.equal(loops.sizeConflict, null);
  assert.ok(close(perLb(loops), 3.94));
  const tarts = item('tonys', "Pop-Tarts Protein Boostin' Brown Sugar Cinnamon Toaster Pastries, 10g Protein", '14.3 oz', 3.49);
  assert.equal(tarts.sizeConflict, null);
});

test('control: a gram size that is a size is still read', () => {
  assert.equal(item('x', 'Active Dry Yeast, 7 g', '', 1.29).dim, 'weight');
});

// ---------------------------------------------------------------------------
// DEFECT P12: the trip planner. "chicken broth 32 oz" at Kenosha priced Costco's 6 x 32 fl oz case
// — 1.5 gal, $12.43 — into the trip total; "chicken broth 32 fl oz" matched nothing at all.
// ---------------------------------------------------------------------------
const BROTH_53142 = () => ({
  costco: [item('costco', 'Swanson Chicken Broth, 32 oz, 6-count', 'each', 12.43)],
  aldi: [item('aldi', "Chef's Cupboard Chicken Broth", '32 fl oz', 1.25)],
  woodmans: [item('woodmans', 'Food Club Chicken Broth', '32 oz', 1.79)],
  meijer: [item('meijer', 'Meijer Chicken Broth', '48 oz', 2.49)],
});
const STORES = ['costco', 'aldi', 'woodmans', 'meijer'];

test('DEFECT P12: "32 oz" of broth is costed as 32 fl oz, not the 192 fl oz case', () => {
  const r = priceItem({ id: 1, text: 'chicken broth 32 oz', qty: 1 }, BROTH_53142(), STORES);
  assert.deepEqual(r.ref, { base: 32, fromText: true });
  assert.ok(close(r.perStore.costco.cost, 2.07), `Costco costed at $${r.perStore.costco.cost}`);
});

test('DEFECT P12: spelling it "32 fl oz" or "1 qt" still finds the broth', () => {
  for (const text of ['chicken broth 32 fl oz', 'chicken broth 1 qt']) {
    const r = priceItem({ id: 1, text, qty: 1 }, BROTH_53142(), STORES);
    assert.equal(r.dim, 'volume', `${text}: matched nothing`);
    assert.equal(Object.keys(r.perStore).length, 4, `${text}: ${Object.keys(r.perStore)}`);
    assert.equal(r.ref.base, 32);
  }
});

test('control: a size that cannot be used is reported, not silently swapped', () => {
  const ref = referenceAmount('eggs 2 lb', [item('a', 'Large Eggs', '12 ct', 2.99)], 'count');
  assert.equal(ref.fromText, false);
  assert.equal(ref.unused, '2 lb');
});

// ---------------------------------------------------------------------------
// P13: the costed amount was the median of whatever came back, and neither UI printed it, so two
// devices costed "orange juice" at 46 and 50 fl oz. Decided in round 2: keep the amount a package a
// store actually sells (a fixed ladder moved 83 of 226 captured amounts to sizes no one sells) and
// print it beside every cost. What the shared code must guarantee is the first half.
// ---------------------------------------------------------------------------
test('control: with no size typed, the costed amount is a package the results contain', () => {
  const oj = (sizes) => sizes.map((s, i) => item(`s${i}`, 'Orange Juice', `${s} fl oz`, 3.99));
  for (const sizes of [[32, 46, 52, 59, 128], [32, 50, 52, 64, 128], [14.5, 14.5, 15, 28]]) {
    const ref = referenceAmount('orange juice', oj(sizes), 'volume');
    assert.ok(sizes.includes(ref.base), `costed ${ref.base} fl oz, which none of ${sizes} is`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT P14: Costco's 18" x 500' Kirkland roll at $55.97 was compared "per each" with ALDI's
// 75 ft roll at $3.95.
// ---------------------------------------------------------------------------
test('DEFECT P14: a roll with a stated length or area is not compared per each', () => {
  const results = {
    costco: [item('costco', 'Kirkland Signature Aluminum Foil, 18"W x 500\'L', 'each', 55.97)],
    cermak: [item('cermak', 'Essential Everyday 25 Sq Ft Aluminum Foil', '1 each', 3.99)],
    meijer: [item('meijer', 'Reynolds Everyday 200 Sq Ft Aluminum Foil', '1 each', 18.99)],
    aldi: [item('aldi', 'Boulder Aluminum Foil', '75 ft', 4.39)],
  };
  const r = bestPerStore('aluminum foil', results, { dim: 'count' });
  assert.deepEqual(Object.keys(r.stores), [], `compared per each: ${Object.keys(r.stores)}`);
  assert.equal(results.costco[0].price, 55.97, 'the package price itself is kept');
});

test('DEFECT P14: hardware that says "aluminum foil" is not an aluminum-foil match', () => {
  // Round 2's Milwaukee and Kenosha captures: Meijer's cheapest "aluminum foil" was a dryer-vent duct.
  const results = {
    woodmans: [item('woodmans', 'Simply Done Foil Sheets, Aluminum, Pre-Cut', '50 ct', 2.69)],
    meijer: [item('meijer', 'Waxman softtouch 4" x 8\' Flexible Aluminum Foil Duct', '1 each', 11.99, { priceBasis: 'online' }),
      item('meijer', 'Duck 1.88" HVAC Metal Repair Silver Aluminum Foil Tape', '1 each', 9.99, { priceBasis: 'online' })],
  };
  const r = bestPerStore('aluminum foil', results, { dim: 'count' });
  assert.deepEqual(Object.keys(r.stores), ['woodmans'], Object.values(r.stores).map((b) => b.item.name).join(' | '));
});

test('DEFECT P14: two rolls whose lengths nobody states are not compared per each either', () => {
  // 60618: Jewel's "Signature SELECT Aluminum Foil, 1 ea" at $2.99 against ALDI's "Boulder Heavy
  // Duty Aluminum Foil, 1 ea" at $3.95 — and pre-cut sheets at 10c a sheet against both, which made
  // "97% less than the next-best store, Jewel": a price per sheet set against a price per roll.
  const results = {
    marianos: [item('marianos', 'Kroger® Aluminum Pre-cut Foil Sheets', '50 ct', 4.99, { priceBasis: 'online' })],
    jewel: [item('jewel', 'Signature SELECT Aluminum Foil', '1 each', 2.99, { priceBasis: 'online' })],
    aldi: [item('aldi', 'Boulder Heavy Duty Aluminum Foil', '1 each', 3.95)],
  };
  const r = bestPerStore('aluminum foil', results, { dim: 'count' });
  assert.deepEqual(Object.keys(r.stores), ['marianos'], `compared per each: ${Object.keys(r.stores)}`);
  assert.equal(results.jewel[0].price, 2.99);
  // Countable things stay countable.
  assert.ok(item('x', 'Hefty EZ Foil Disposable Oven Liner Trays', '2 ct', 3.79).unit.count);
  assert.ok(item('x', 'Handi-foil Foilware', '1 each', 1.69).unit.count);
});

// ---------------------------------------------------------------------------
// DEFECT P15: the web judged plausibility over whatever the Show control listed; the phone and the
// shared code over the matches. The flag — and so the headline — moved with a list filter.
// ---------------------------------------------------------------------------
test('DEFECT P15: the plausibility pool does not move with the Show control', () => {
  const matches = [
    item('a', 'Apple Cider', '64 fl oz', 4.69), item('b', 'Apple Cider', '128 fl oz', 7.45),
    item('c', 'Honeycrisp Apple Cider', '64 fl oz', 5.99), item('d', 'Apple Cider', '64 fl oz', 4.99),
    // A case price with one bottle's size: $138/gal against a real cider median near $10.
    item('e', 'Organic Apple Cider', '12 fl oz', 12.99),
  ];
  const weak = ['Apple Cider Vinegar', 'Organic Apple Cider Vinegar', 'Apple Cider Vinaigrette', 'Hard Apple Cider', 'Apple Cider Cocktail'].map((n, i) => item(`w${i}`, n, '16 fl oz', 5.99));
  const verdicts = (list) => {
    const scored = scoreItems('apple cider', list.map((p) => ({ ...p })));
    judgePlausibility(scored, 'volume');
    return scored.filter((p) => p.score >= RELEVANT).map((p) => `${p.key}:${p.implausible ? 'flag' : 'ok'}`).sort().join(' ');
  };
  // "Matches" lists the matches; "Everything" lists the weak rows too. Same verdicts either way.
  assert.equal(verdicts([...matches, ...weak]), verdicts(matches));
  assert.match(verdicts(matches), /Organic Apple Cider-12 fl oz:flag/);
});

// ---------------------------------------------------------------------------
// The whole-corpus effect of this round's size rules is in the round-2 report; these pin that the
// Whole Foods pack fold round 1 added does not multiply a box that states its own weight.
// ---------------------------------------------------------------------------
test('DEFECT P1/WF: "Mini Apple Cider Muffin 12ct, 10.2 OZ" is twelve minis in 10.2 oz', async () => {
  const { toProduct } = await import('../src/adapters/wholefoods.js');
  const muffins = toProduct({ slug: 's', name: 'Mini Apple Cider Muffin 12ct, 10.2 OZ', regularPrice: 6.49 });
  assert.ok(close(perLb(muffins), 10.18), `$${perLb(muffins)?.toFixed(2)}/lb (${muffins.size})`);
  const bars = toProduct({ slug: 's', name: 'Pumpkin Pie Bars 6 Count, 9.6 OZ', regularPrice: 7.21 });
  assert.ok(close(perLb(bars), 12.02), `$${perLb(bars)?.toFixed(2)}/lb (${bars.size})`);
  const broth = toProduct({ slug: 's', name: 'Organic Chicken Broth 4pk, 8 FZ', regularPrice: 7.09 });
  assert.ok(close(perGal(broth), 28.36), 'a "4pk" is still four cartons');
});

test('guard: flagImplausible leaves a count comparison alone', () => {
  const foil = [item('a', 'Foil Sheets', '50 ct', 2.69), item('b', 'Foil', '1 ct', 5.99), item('c', 'Foil', '1 ct', 3.95), item('d', 'Foil', '1 ct', 13.83)];
  flagImplausible(foil, 'count');
  assert.ok(foil.every((p) => !p.implausible));
});

// ---------------------------------------------------------------------------
// DEFECT P17a — reported by the owner from Jewel-Osco's own app, in the store: Cartworth showed
// Jewel's butter at $7.99 while Jewel sells a pound of Lucerne for $4.49 (Instacart: $4.99). The
// Instacart listing states that pound as "4 each" — four sticks — so it had no price per pound and
// was dropped from the butter comparison without a word. Records are the captured Jewel listings
// (location 2682, 60618), reduced to the fields parseItem reads.
// ---------------------------------------------------------------------------
const JEWEL = { storeId: 'jewel', base: 'https://www.instacart.com', slug: 'jewel-osco' };
const icRecord = ({ id, name, size, slug, price, regular = null, category }) => ({
  id: `items_2682-${id}`, productId: String(id), name, size, evergreenUrl: `${id}-${slug}`,
  price: { viewSection: { itemCard: { priceString: `$${price.toFixed(2)}`, plainFullPriceString: regular ? `$${regular.toFixed(2)}` : null } } },
  availability: { available: true },
  viewSection: { trackingProperties: { product_category_name: category } },
});
const jewelButter = () => [
  icRecord({ id: 3142199, name: 'Lucerne Salted Butter', size: '4 each', slug: 'lucerne-butter-sweet-cream-salted-16-oz', price: 4.99, regular: 6.99, category: 'Salted Butter' }),
  icRecord({ id: 18301981, name: 'Lucerne Unsalted Butter', size: '4 ct', slug: 'lucerne-butter-sweet-cream-unsalted-4-ea', price: 4.99, regular: 6.99, category: 'Unsalted Butter' }),
  icRecord({ id: 2721623, name: 'Land O Lakes Butter, Salted', size: '1 lb', slug: 'land-o-lakes-butter-salted-4-ea', price: 7.99, category: 'Salted Butter' }),
  icRecord({ id: 30711, name: 'Challenge Butter, Salted', size: '16 oz', slug: 'challenge-butter-salted-16-oz', price: 7.99, category: 'Salted Butter' }),
  icRecord({ id: 45102, name: 'Kerrygold Butter, Pure Irish', size: '8 oz', slug: 'kerrygold-pure-irish-butter-8-oz', price: 7.99, category: 'Salted Butter' }),
].map((r, i, all) => parseItem(r, JEWEL, { serviceType: 'delivery', priceNote: 'Prices vary from in-store' }, i, all.length, false));

test("DEFECT P17a: Jewel's four-stick pound of Lucerne is priced per pound, and is Jewel's best butter", () => {
  const products = jewelButter();
  const lucerne = products[0];
  assert.equal(lucerne.base, 16, `sized ${lucerne.size}`);
  assert.equal(lucerne.size, '4 sticks · 16 oz');
  assert.ok(close(perLb(lucerne), 4.99), `$${perLb(lucerne)}/lb`);
  const r = bestPerStore('butter', { jewel: products });
  assert.equal(r.stores.jewel.item.name, 'Lucerne Salted Butter', `Jewel's best shown as ${r.stores.jewel.item.name} at $${r.stores.jewel.item.price}`);
  assert.ok(close(r.stores.jewel.unit.perBase * 16, 4.99));
});

test('DEFECT P17a: a cheaper item the comparison cannot include is named, not hidden', () => {
  // The unsalted box's slug says "4-ea": no weight anywhere in the listing, so no price per pound —
  // but it is still a $4.99 item beating the $7.99 shown as the store's best.
  const products = jewelButter().slice(1);
  const r = bestPerStore('butter', { jewel: products });
  assert.equal(r.stores.jewel.item.price, 7.99);
  const ex = excludedCheaper('butter', { jewel: products }, r);
  assert.equal(ex.jewel?.item.name, 'Lucerne Unsalted Butter', JSON.stringify(ex));
  assert.equal(ex.jewel.reason, 'count');
  assert.equal(ex.jewel.hasBest, true);
});

test('control: a stick count settles nothing without a weight that fits quarter-pound sticks', () => {
  const b = (name, size, slug, price) => item('x', name, size, price, { category: 'Salted Butter', url: `https://www.instacart.com/products/1-${slug}` });
  // Instacart's own per-ounce price says this "4 ct" 2-Pack is 2 lb; its slug says 1 lb.
  assert.equal(b('Land O Lakes Butter, Salted, 2-Pack', '4 ct', 'land-o-lakes-salted-butter-1-lb', 9.99).dim, 'count');
  // Four one-pound boxes.
  assert.equal(b('Member’s Mark Unsalted Sweet Cream Butter', '4 ct', 'member-s-mark-unsalted-sweet-cream-butter-4-ct', 12.21).dim, 'count');
  // Eight 2 oz half sticks are a pound; no quarter-pound reading fits "1-lb" over 8.
  assert.equal(b('Land O Lakes Butter, Salted, Half Sticks', '8 ct', 'land-o-lakes-butter-salted-half-sticks-1-lb', 5.99).dim, 'count');
  // Kerrygold's slug names ONE stick (4 oz): four of them are a pound.
  assert.equal(b('Kerrygold Unsalted Pure Irish Butter', '4 ct', 'kerrygold-unsalted-irish-butter-sticks-4-oz', 12.99).base, 16);
  // Plugra's slug writes 8 oz as "8-0-oz".
  assert.equal(b('Plugra Premium European Style Salted Butter', '2 each', 'plugra-butter-salted-extra-creamy-8-0-oz', 3.99).base, 8);
  // A slug naming both one stick and the box ("4-x-4-oz-1-lb") agrees with itself: a pound.
  assert.equal(b('Store Brand Unsalted Butter', '4 ct', 'store-brand-unsalted-butter-4-x-4-oz-1-lb', 4.49).base, 16);
  // ...but one weight the sticks cannot explain beside one they can settles nothing.
  assert.equal(b('Store Brand Salted Butter', '4 ct', 'store-brand-salted-butter-16-oz-2-lb', 4.49).dim, 'count');
  // Not butter: margarine sticks are not recovered, whatever the slug says.
  assert.equal(item('x', "I Can't Believe It's Not Butter Extra Creamy Sticks", '4 each', 6.79, { category: 'Non-Butter Oil Spreads', url: 'https://www.instacart.com/products/1-sticks-16-oz' }).dim, 'count');
});

test('control: a package price is never called cheaper than a price per pound', () => {
  // Festival lists "Butterball Frozen Turkey" at $2.89 "1 each" (53142): a price per pound with
  // the pound missing. Set against a bird sold by the pound, "$2.89 is cheaper" means nothing.
  const results = {
    festivalfoods: [
      item('festivalfoods', 'Honeysuckle White Fresh Whole Turkey', 'per lb', 3.49, { soldBy: 'lb', category: 'Whole Turkey' }),
      item('festivalfoods', 'Butterball Frozen Turkey', '1 each', 2.89, { category: 'Frozen Whole Turkey' }),
    ],
  };
  const r = bestPerStore('whole turkey', results, { dim: 'weight' });
  assert.equal(r.stores.festivalfoods.item.soldBy, 'lb', 'precondition');
  assert.equal(excludedCheaper('whole turkey', results, r).festivalfoods, undefined);
});

test('control: a store with no comparable item at all names its cheapest match', () => {
  const results = {
    aldi: [item('aldi', 'Countryside Creamery Butter', '16 oz', 3.49)],
    samsclub: [item('samsclub', 'Member’s Mark Unsalted Sweet Cream Butter', '4 ct', 12.21, { category: 'Unsalted Butter' })],
  };
  const r = bestPerStore('butter', results);
  assert.equal(r.stores.samsclub, undefined);
  const ex = excludedCheaper('butter', results, r);
  assert.equal(ex.samsclub?.item.price, 12.21);
  assert.equal(ex.samsclub.hasBest, false);
});

// ---------------------------------------------------------------------------
// DEFECT P17c: a store's "16 oz" carton of heavy cream is 16 fl oz. Read as a weight, Whole Foods'
// $4.09 pint, Tony's $3.29 pint and Costco's only heavy cream — Maola's quart at $4.84, the
// cheapest in Chicago — dropped out of a heavy-cream search that compares by volume.
// ---------------------------------------------------------------------------
test('DEFECT P17c: heavy cream stated in "oz" compares by volume with the other creams', () => {
  const results = {
    costco: [item('costco', 'Maola 40% Heavy Whipping Cream, 32 oz', '32 oz', 4.84, { category: 'Heavy Whipping Cream' })],
    wholefoods: [item('wholefoods', 'Organic Heavy Cream', '16 OZ', 4.09), item('wholefoods', 'Organic Grassfed Heavy Whipping Cream', '1 PT', 6.79)],
    jewel: [item('jewel', 'Lucerne Whipping Cream, Heavy', '32 fl oz', 7.99, { category: 'Heavy Whipping Cream', priceBasis: 'online' })],
    tonys: [item('tonys', 'Best Choice Heavy Whipping Cream 16 oz', '16 oz', 3.29, { category: 'Heavy Whipping Cream' })],
  };
  const r = bestPerStore('heavy cream', results);
  assert.equal(r.dim, 'volume');
  assert.ok(r.stores.costco, 'Costco missing from the comparison');
  assert.ok(close(r.stores.costco.unit.perBase * 128, 19.36), `Costco at $${(r.stores.costco.unit.perBase * 128).toFixed(2)}/gal`);
  assert.equal(r.stores.wholefoods.item.name, 'Organic Heavy Cream');
  assert.equal(ranked(r)[0][0], 'costco');
});

test('control: whipped cream and table cream are still sold by net weight', () => {
  assert.equal(item('x', 'Reddi-wip Whipped Light Cream, Original', '7 oz', 3.49, { category: 'Whipped Cream' }).dim, 'weight');
  assert.equal(item('x', 'Nestle Table Cream, Media Crema', '7.6 oz', 2.29, { category: 'Other Creams' }).dim, 'weight');
});

// ---------------------------------------------------------------------------
// DEFECT P17d: Instacart states a pack in its own unit line ("4 x 14.5 oz" beside a size of
// "14.5 oz") and we priced the pack from one can — basket staples at every Instacart-priced chain
// shown four to twelve times dearer than they are. Records are captured Instacart items reduced to
// the fields parseItem reads, with the unit line as captured.
// ---------------------------------------------------------------------------
const packRecord = ({ id, name, size, slug, price, pu }) => ({
  id: `items_1-${id}`, productId: String(id), name, size, evergreenUrl: `${id}-${slug}`,
  price: { viewSection: { itemCard: { priceString: `$${price.toFixed(2)}`, pricingUnitString: pu } } },
  availability: { available: true },
});
const MEIJER = { storeId: 'meijer', base: 'https://www.instacart.com', slug: 'meijer' };
const parsePack = (r) => parseItem(packRecord(r), MEIJER, { serviceType: 'delivery' }, 0, 1, false);

test('DEFECT P17d: a "4 Can Value Pack" is priced as four cans', () => {
  const p = parsePack({ id: 22363049, name: 'Del Monte Green Beans, Cut, 4 Can, Value Pack', size: '14.5 oz', slug: 'del-monte-green-beans-no-salt-added-cut-value-pack-14-5-oz', price: 6.99, pu: '4 x 14.5 oz' });
  assert.equal(p.base, 58, p.size);
  assert.ok(close(perLb(p), 1.93), `$${perLb(p)?.toFixed(2)}/lb`);
  assert.equal(p.sizeConflict, null);
});

test('DEFECT P17d: a pack the listing never names is not multiplied, and not priced from one can', () => {
  // Campbell's four-pack: the unit line says 4, nothing else in the listing does.
  const soup = parsePack({ id: 17315355, name: "Campbell's Cream of Mushroom Soup", size: '10.5 oz', slug: 'campbell-s-cream-of-mushroom-soup-10-5-oz', price: 7.99, pu: '4 x 10.5 oz' });
  assert.equal(perLb(soup), null, `still published at $${perLb(soup)?.toFixed(2)}/lb, four times its real price`);
  assert.ok(soup.sizeConflict);
  // A bag of six mini cucumbers that the unit line calls "6 x 14 oz": multiplied, it would read
  // 76c/lb, the direction that wins. "6-ct" counts cucumbers, not bags.
  const cukes = parsePack({ id: 26061852, name: "Farmer's Market Mini Cucumbers", size: '14 oz', slug: 'farmer-s-market-mini-cucumber-6-ct', price: 3.99, pu: '6 x 14 oz' });
  assert.notEqual(cukes.base, 84);
  assert.equal(perLb(cukes), null);
});

test('control: a unit line that only restates the size, or a price per pound, changes nothing', () => {
  const lol = parsePack({ id: 2721623, name: 'Land O Lakes Butter, Salted', size: '1 lb', slug: 'land-o-lakes-butter-salted-4-ea', price: 3.99, pu: '1 lb' });
  assert.ok(close(perLb(lol), 3.99));
  assert.equal(lol.sizeConflict, null);
  const potatoes = parsePack({ id: 1, name: 'Russet Potatoes', size: '1 lb', slug: 'russet-potatoes', price: 0.99, pu: '$0.99 / lb' });
  assert.equal(potatoes.soldBy, 'lb');
  assert.ok(close(perLb(potatoes), 0.99));
});

// ---------------------------------------------------------------------------
// DEFECT P17b: an Instacart price was ranked against shelf prices as if like-for-like, so Jewel (and
// every chain priced from Instacart) "lost" by margins inside Instacart's own markup. Measured the
// same week against Jewel's printed ad: Primo Taglio turkey breast $11.99/lb on Instacart, $9.99 on
// the shelf (20%); the owner's pound of Lucerne $4.99 against $4.49.
// ---------------------------------------------------------------------------
test('DEFECT P17b: a store inside Instacart\'s measured markup is "about the same", not beaten', () => {
  const results = {
    woodmans: [item('woodmans', 'Primo Taglio Turkey Breast', 'per lb', 10.09, { soldBy: 'lb' })],
    jewel: [item('jewel', 'Primo Taglio Oven Roasted Turkey Breast', 'per lb', 11.99, { soldBy: 'lb', priceBasis: 'online' })],
  };
  const r = bestPerStore('turkey breast', results);
  const rows = standings(r.stores);
  assert.deepEqual(rows.map((x) => [x.storeId, x.verdict]), [['woodmans', 'best'], ['jewel', 'close']]);
  // Jewel's own shelf that week was $9.99 — cheaper than the "winner". No saving may be claimed.
  const claim = savingsClaim(r.stores.woodmans, r.stores.jewel);
  assert.equal(claim.kind, 'close', claim.text);
  assert.equal(claim.text, 'About the same as {store} (online price), so no saving is claimed');
});

test('control: an online price beyond any measured markup is still called dearer', () => {
  const results = {
    aldi: [item('aldi', 'Countryside Creamery Butter', '16 oz', 3.49)],
    jewel: jewelButter(),
  };
  const r = bestPerStore('butter', results);
  const rows = standings(r.stores);
  assert.deepEqual(rows.map((x) => [x.storeId, x.verdict]), [['aldi', 'best'], ['jewel', 'dearer']]);
  assert.equal(savingsClaim(r.stores.aldi, r.stores.jewel).kind, 'ahead');
});

test('control: two online listings compare exactly, and the sentence says they are listings', () => {
  const a = item('jewel', 'Lucerne Salted Butter', '16 oz', 4.99, { priceBasis: 'online' });
  const b = item('marianos', 'Kroger Salted Butter', '16 oz', 5.49, { priceBasis: 'online' });
  const claim = savingsClaim({ item: a, unit: a.unit.weight }, { item: b, unit: b.unit.weight });
  assert.equal(claim.kind, 'exact');
  assert.equal(claim.text, '{amount}/{unit} (9%) less than the next-best store, {store} (both online prices)');
});

// ---------------------------------------------------------------------------
// DEFECT P21 (round-3 price check, 60618): "Tillamook Farmstyle Medium Cheddar Cheese Slices, 8oz,
// 9ct" at Sunset, stated "8 oz", $5.49, read as nine 8 oz packs: $1.22/lb, Chicago's cheddar
// headline. Nine slices in one 8 oz pack is $10.98/lb. See CONTAINER_IN_NAME_RE in shared/units.js.
// ---------------------------------------------------------------------------
test('DEFECT P21: nine cheese slices in an 8 oz pack are 8 oz, not nine packs', () => {
  const p = item('sunset', 'Tillamook Farmstyle Medium Cheddar Cheese Slices, 8oz, 9ct', '8 oz', 5.49, { priceBasis: 'online' });
  assert.equal(p.base, 8);
  assert.ok(close(perLb(p), 10.98), `$${perLb(p)}/lb`);
  const choc = item('costco', 'Ferrero Rocher, Milk Chocolate Hazelnut Candy, 21.2 oz, 48 Count', 'each', 22.38);
  assert.equal(choc.base, 21.2, '48 chocolates in 21.2 oz');
});

test('DEFECT P21: the slices no longer take the cheddar headline', () => {
  const r = bestPerStore('cheddar cheese', {
    sunset: [item('sunset', 'Tillamook Farmstyle Medium Cheddar Cheese Slices, 8oz, 9ct', '8 oz', 5.49, { priceBasis: 'online' })],
    aldi: [item('aldi', 'Happy Farms Deli Sliced Sharp Cheddar Cheese', '8 oz', 1.49)],
    woodmans: [item('woodmans', 'Westfield Farms Cheese, Sharp Cheddar', '8 oz', 1.79)],
  });
  assert.equal(ranked(r)[0][0], 'aldi');
});

test('control: a count after the size stays a pack when the name counts containers, the count is hyphenated, or the stated size is N x M', () => {
  assert.equal(item('x', 'Chobani Greek Yogurt Cups, 5.3 oz, 12 Count', '', 9.99).base, 63.6);
  assert.equal(item('target', 'Tillamook Medium Cheddar Cheese Snack Portions, 0.75oz, 10ct', '10 ct', 4.99).base, 7.5);
  assert.equal(item('costco', 'Kerrygold Pure Irish Butter, Salted, 8 oz, 4-count', 'each', 18.65).base, 32);
  assert.equal(item('walmart', 'Great Value Chunk Chicken Breast with Rib Meat in Water, 12.5 oz, 4 count', '50 oz', 9.97).base, 50);
  assert.equal(item('costco', 'Kirkland Signature, Organic Coconut Water, 11.1 fl oz, 12-count', '11.1 fl oz', 13.42).base, 133.2);
});
