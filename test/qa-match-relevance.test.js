// QA: adversarial tests for shared/match.js relevance scoring (RELEVANT = 0.55).
//
// Tests labelled "DEFECT" assert correct behavior and currently FAIL.
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-pricing-logic node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';

const score = (q, name, brand = '') => relevance(q, { name, brand });
const rejects = (q, name, brand = '') => {
  const s = score(q, name, brand);
  assert.ok(s < RELEVANT, `"${q}" vs "${brand} ${name}".trim() scored ${s.toFixed(3)} >= ${RELEVANT} (trap accepted)`);
};
const matches = (q, name, brand = '') => {
  const s = score(q, name, brand);
  assert.ok(s >= RELEVANT, `"${q}" vs "${brand} ${name}".trim() scored ${s.toFixed(3)} < ${RELEVANT} (real match rejected)`);
};

// ---------------------------------------------------------------------------
// DEFECT 8: the trap penalty only looks at words AFTER the head noun.
// A qualifier BEFORE the head noun ("peanut butter", "cream cheese",
// "butter lettuce") changes the product entirely and is never penalized.
// All three of these are named in the product's own spec as traps that must fail.
// ---------------------------------------------------------------------------
test('DEFECT 8a: "peanut butter" must not match a search for "butter"', () => {
  rejects('butter', 'Jif Creamy Peanut Butter', 'Jif');
});

test('DEFECT 8b: "butter lettuce" must not match a search for "butter"', () => {
  rejects('butter', 'Organic Butter Lettuce', 'Earthbound');
});

test('DEFECT 8c: "cream cheese" must not match a search for "cheese"', () => {
  rejects('cheese', 'Philadelphia Original Cream Cheese', 'Philadelphia');
});

test('DEFECT 8d: more pre-head traps found by the same gap', () => {
  rejects('cheese', 'Kraft Macaroni & Cheese Dinner', 'Kraft');
  rejects('beef', 'Better Than Bouillon Beef Base', 'Better Than Bouillon');
  rejects('beef', 'Hormel Beef Chili with Beans', 'Hormel');
});

// ---------------------------------------------------------------------------
// DEFECT 9: MILD words ("frozen", "dried", ...) are only penalized when they
// appear BEFORE the head noun, so the same product scores differently
// depending on word order — and frozen concentrate (which dilutes 1:3) is
// compared per fl oz against ready-to-drink juice.
// ---------------------------------------------------------------------------
test('DEFECT 9: frozen juice concentrate must not match "orange juice" at full score', () => {
  const after = score('orange juice', 'Orange Juice Concentrate Frozen', 'Minute Maid');
  const before = score('orange juice', 'Frozen Orange Juice Concentrate', 'Minute Maid');
  assert.ok(
    Math.abs(after - before) < 0.05,
    `word order changes the score: "...Concentrate Frozen"=${after.toFixed(3)} vs "Frozen Orange Juice..."=${before.toFixed(3)}`
  );
  assert.ok(after < RELEVANT, `concentrate scored ${after.toFixed(3)} — it is not comparable per fl oz with RTD juice`);
});

// ---------------------------------------------------------------------------
// Traps that DO fail correctly — regression guards so a fix for the above
// does not regress them.
// ---------------------------------------------------------------------------
test('control: known traps still rejected', () => {
  rejects('milk', "Hershey's Milk Chocolate Bar", "Hershey's");
  rejects('milk', 'TruMoo Chocolate Milk', 'TruMoo');
  rejects('milk', 'Chobani Greek Yogurt made with Whole Milk', 'Chobani');
  rejects('milk', 'Milk-Bone Original Dog Treats', 'Milk-Bone');
  rejects('milk', 'Thai Kitchen Coconut Milk', 'Thai Kitchen');
  rejects('chicken', 'Swanson Chicken Broth', 'Swanson');
  rejects('beef', "Jack Link's Beef Jerky Original", "Jack Link's");
});

test('control: new traps that are correctly rejected', () => {
  rejects('milk', 'Silk Almond Milk Unsweetened', 'Silk');
  rejects('milk', 'Nesquik Strawberry Milk', 'Nesquik');
  rejects('milk', 'Carnation Evaporated Milk', 'Carnation');
  rejects('milk', 'Eagle Brand Sweetened Condensed Milk', 'Eagle Brand');
  rejects('butter', 'Butterball Turkey Breast', 'Butterball');
  rejects('butter', 'Kodiak Buttermilk Power Cakes Flapjack Mix', 'Kodiak');
  rejects('butter', 'Butter Flavored Cooking Spray', 'Pam');
  rejects('cheese', 'Cheez-It Baked Snack Crackers', 'Cheez-It');
  rejects('cheese', 'Cheetos Crunchy Cheese Flavored Snacks', 'Cheetos');
  rejects('chicken', 'Tyson Chicken Nuggets Frozen', 'Tyson');
  rejects('chicken', 'Banquet Chicken Pot Pie', 'Banquet');
  rejects('eggs', 'Eggo Homestyle Waffles', 'Eggo');
  rejects('eggs', 'Barilla Egg Noodles', 'Barilla');
  rejects('eggs', 'Cadbury Creme Eggs Candy', 'Cadbury');
  rejects('bread', 'Progresso Italian Style Bread Crumbs', 'Progresso');
  rejects('bread', 'Pepperidge Farm Banana Bread');
  rejects('rice', 'Rice Krispies Cereal', "Kellogg's");
  rejects('water', 'Gatorade Thirst Quencher', 'Gatorade');
  rejects('coffee', 'Coffee mate French Vanilla Creamer', 'Coffee mate');
  rejects('tomatoes', "Hunt's Tomato Sauce", "Hunt's");
  rejects('potatoes', "Lay's Classic Potato Chips", "Lay's");
  rejects('apples', "Mott's Apple Sauce Cups", "Mott's");
  rejects('onions', 'Funyuns Onion Flavored Rings', 'Funyuns');
  rejects('salmon', 'Purina Fancy Feast Salmon Cat Food', 'Purina');
  rejects('bacon', 'Bacon Bits Salad Topping', 'Hormel');
  rejects('sugar', 'Sugar Free Red Bull Energy Drink', 'Red Bull');
  rejects('flour', "Bob's Red Mill Almond Flour", "Bob's Red Mill");
  rejects('yogurt', 'Yoplait Original Strawberry Yogurt', 'Yoplait');
});

test('control: real matches are accepted (no false negatives found)', () => {
  matches('milk', 'Whole Milk', 'Prairie Farms');
  matches('milk', 'Organic Valley Whole Milk, Half Gallon', 'Organic Valley');
  matches('milk', 'Fairlife 2% Reduced Fat Ultra-Filtered Milk', 'Fairlife');
  matches('milk', 'Lactaid Lactose Free Whole Milk', 'Lactaid');
  matches('butter', 'Land O Lakes Salted Butter Sticks', 'Land O Lakes');
  matches('butter', 'Kerrygold Pure Irish Butter', 'Kerrygold');
  matches('cheese', 'Tillamook Medium Cheddar Cheese Block', 'Tillamook');
  matches('cheese', 'Kraft Shredded Mozzarella Cheese', 'Kraft');
  matches('chicken', 'Boneless Skinless Chicken Breast', 'Perdue');
  matches('chicken breast', 'Boneless Skinless Chicken Breasts Value Pack', 'Tyson');
  matches('beef', 'Ground Beef 80/20', 'Open Nature');
  matches('ground beef', 'Ground Beef Chuck 80% Lean');
  matches('eggs', 'Large Grade A Eggs, 12 ct', 'Lucerne');
  matches('eggs', "Eggland's Best Cage Free Large White Eggs", "Eggland's Best");
  matches('orange juice', 'Tropicana Pure Premium Orange Juice No Pulp', 'Tropicana');
  matches('bananas', 'Bananas');
  matches('greek yogurt', 'Chobani Non-Fat Greek Yogurt Plain', 'Chobani');
  matches('rice', "Uncle Ben's Ready Rice Original", "Uncle Ben's");
  matches('water', 'Poland Spring Natural Spring Water', 'Poland Spring');
  matches('coffee', 'Starbucks Pike Place Roast Ground Coffee', 'Starbucks');
  matches('tomatoes', 'Roma Tomatoes');
  matches('potatoes', 'Russet Potatoes 5 lb Bag');
  matches('apples', 'Honeycrisp Apples');
  matches('onions', 'Yellow Onions 3 lb');
  matches('salmon', 'Salmon Fillet Atlantic Fresh');
  matches('bacon', 'Oscar Mayer Center Cut Bacon', 'Oscar Mayer');
  matches('sugar', 'Domino Granulated Sugar', 'Domino');
  matches('flour', 'Gold Medal All Purpose Flour', 'Gold Medal');
  matches('yogurt', 'Stonyfield Organic Whole Milk Plain Yogurt', 'Stonyfield');
  matches('half and half', 'Land O Lakes Half & Half', 'Land O Lakes');
  matches('heavy cream', 'Heavy Whipping Cream', 'Horizon');
  matches('sour cream', 'Daisy Pure & Natural Sour Cream', 'Daisy');
  matches('cream cheese', 'Philadelphia Original Cream Cheese', 'Philadelphia');
  matches('peanut butter', 'Jif Creamy Peanut Butter', 'Jif');
  matches('toilet paper', 'Charmin Ultra Soft Toilet Paper', 'Charmin');
  matches('paper towels', 'Bounty Select-A-Size Paper Towels', 'Bounty');
});

// ---------------------------------------------------------------------------
// Traps found in LIVE results after the pre-head fix landed, not by inspection.
// Margarine is marketed as "Tastes Like Butter", and a prepared side dish can
// carry the query word as an adjective ("Buttery Mashed Potatoes").
// ---------------------------------------------------------------------------
test('live: margarine sold as "Tastes Like Butter" is not butter', () => {
  rejects('butter', 'Best Choice Tastes Like Butter', 'Best Choice');
  rejects('butter', 'Countryside Creamery Tastes Like Butter!', 'Countryside Creamery');
});

test('live: a buttery side dish is not butter', () => {
  rejects('butter', "Chef's Cupboard Buttery Mashed Potatoes with Real Butter", "Chef's Cupboard");
});

test('live control: real butter still scores as a match', () => {
  for (const n of ['Land O Lakes Salted Butter Quarters', 'Butter Quarters, Salted', 'Old World Creamery Unsalted Butter', 'Kerrygold Pure Irish Butter']) {
    assert.ok(score('butter', n, '') >= RELEVANT, `${n} was rejected`);
  }
  // And asking for the imitation on purpose still finds it.
  assert.ok(score('margarine', 'Best Choice Tastes Like Butter Margarine', 'Best Choice') > 0.3, 'margarine search broke');
});

// ---------------------------------------------------------------------------
// Outliers found in LIVE Sam's Club and Costco results. Each of these scored a
// full 0.920 for "butter" and then produced an absurd per-pound price that set
// the scale of the per-store chart, flattening every honest price into a stub.
// The cause was a conflated list: `popcorn`, `danish` and `shrimp` were in the
// SOLID_RE list in shared/units.js (which decides fluid-vs-weight ounces) but
// never in TRAPS here, so nothing penalised them.
// ---------------------------------------------------------------------------
test('live: the searched word as a modifier of a different food is rejected', () => {
  rejects('butter', 'Banneton Bakery All Butter Danish Twist', 'Banneton Bakery');
  rejects('butter', 'Kirkland Signature Garlic Butter Shrimp, 2 lbs', 'Kirkland Signature');
  rejects('butter', 'ACT II Butter Lovers Microwave Popcorn', 'ACT II');
  rejects('milk', 'Milk Chocolate Almonds', 'Kirkland');
  rejects('chicken', 'Chicken Flavored Ramen Noodle Soup', 'Maruchan');
});

test('live control: searching FOR those foods still finds them', () => {
  // Every trap is guarded by "not in the query", so adding real product nouns
  // must not make those products unfindable.
  for (const [q, n] of [
    ['popcorn', 'Skinny Pop Popcorn'],
    ['shrimp', 'Kirkland Raw Shrimp'],
    ['bacon', 'Oscar Mayer Center Cut Bacon'],
    ['salmon', 'Atlantic Salmon Fillet'],
    ['chicken breast', 'Perdue Boneless Skinless Chicken Breast'],
    ['almonds', 'Blue Diamond Whole Almonds'],
  ]) {
    assert.ok(score(q, n, '') >= RELEVANT, `${q} -> ${n} was rejected`);
  }
});

test('live control: real butter is untouched', () => {
  for (const n of ['Land O Lakes Salted Butter', 'Butter Quarters, Salted', 'Kerrygold Salted Irish Butter Sticks', 'Vital Farms Pasture-Raised Salted Butter']) {
    assert.ok(score('butter', n, '') >= RELEVANT, `${n} was rejected`);
  }
});

// ---------------------------------------------------------------------------
// Single-serve and concentrated forms, found in a live Cermak / Tony's / Whole
// Foods sweep at 16x to 59x the median unit price. A K-Cup box cannot be
// compared per pound with ground coffee, and a wellness shot is not a carton of
// juice. Same conflated-list cause as popcorn: `pod` and `k-cups` were in the
// fluid-vs-weight list in shared/units.js but never in TRAPS here.
// ---------------------------------------------------------------------------
test('live: single-serve and concentrated forms do not match the plain query', () => {
  rejects('coffee', 'Dunkin Original Blend Medium Roast Coffee, Keurig K-Cup Pods', 'Dunkin');
  rejects('coffee', 'Single Origin Kilimanjaro Instant Coffee', "Trader Joe's");
  rejects('coffee', 'Starbucks Coffee Capsules', 'Starbucks');
  rejects('orange juice', 'Orange Juice Shot', 'Whole Foods');
});

test('live control: asking for those forms on purpose still finds them', () => {
  for (const [q, n] of [
    ['coffee pods', 'Starbucks Coffee Pods'],
    ['instant coffee', 'Nescafe Instant Coffee'],
  ]) {
    assert.ok(score(q, n, '') >= RELEVANT, `${q} -> ${n} was rejected`);
  }
  // And the plain product is untouched.
  for (const n of ['Folgers Classic Roast Ground Coffee', 'Maxwell House Original Ground Coffee']) {
    assert.ok(score('coffee', n, '') >= RELEVANT, `${n} was rejected`);
  }
  assert.ok(score('orange juice', 'Tropicana No Pulp Orange Juice', 'Tropicana') >= RELEVANT);
  assert.ok(score('butter', 'Kerrygold Salted Irish Butter Sticks', 'Kerrygold') >= RELEVANT);
});

// ---------------------------------------------------------------------------
// Non-food sharing a food word, found in a live Austin (78704) sweep at 9x to
// 18x the median: "Body Butter" skincare against a butter search, a belly balm,
// a tallow elixir. Also prepared forms that are not the raw ingredient.
// ---------------------------------------------------------------------------
test('live: skincare and other non-food do not match a food query', () => {
  rejects('butter', 'Moo Elixir The Body Butter Tallow-Based Skincare', 'Moo Elixir');
  rejects('butter', 'Barker Wellness Co Body Butter', 'Barker Wellness');
  rejects('eggs', 'Meadowgreek Cage-free Hard-boiled Eggs', 'Meadowgreek');
});

test('live control: "pan" and "skillet" are NOT traps, because they name real foods', () => {
  // Adding them made a pizza search reject DiGiorno. Cookware is left to the plausibility guard,
  // which judges the unit price instead of guessing from the name.
  assert.ok(score('pizza', 'DiGiorno Rising Crust Pan Pizza', 'DiGiorno') >= RELEVANT);
  assert.ok(score('pizza', 'Red Baron Classic Crust Pepperoni Pizza', 'Red Baron') >= RELEVANT);
});

test('live control: the food itself is untouched by the non-food traps', () => {
  for (const [q, n] of [
    ['butter', 'Land O Lakes Salted Butter'],
    ['eggs', "Eggland's Best Large White Eggs"],
    ['milk', 'Prairie Farms Whole Milk'],
  ]) {
    assert.ok(score(q, n, '') >= RELEVANT, `${q} -> ${n} was rejected`);
  }
  // And asking for the non-food on purpose still works, via the not-in-query guard.
  assert.ok(score('body wash', 'Dove Body Wash', 'Dove') >= RELEVANT);
});
