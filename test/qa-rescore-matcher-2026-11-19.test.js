// Every cached Thanksgiving answer re-scored (1,107 answers: 27 items in 41 metro ZIPs, 18-19 Nov
// 2026) and read by 13 reviewers. These are the matcher defects that changed what a shopper saw.
//
// Hidden real products (a label word read as another product):
// - Kroger's "Tender and Juicy Whole Frozen Turkey", $0.99/lb, scored 0.40 ('tender') at 16 Kroger
//   banners: Smith's would have been Salt Lake City's best turkey, not Harmons at $1.09 "11% less".
// - ALDI's "Real Chicken Broth Stuffing Mix", 6 oz at 78c, scored 0.37 ('broth') in all 27 ALDI
//   answers; Walmart was shown "14% less than ALDI" where ALDI was the cheaper.
// - "Evaporated Milk Vitamin D" and every "Vitamin D Whole Milk" scored 0.40 ('vitamin').
// - "Bone In" without a hyphen scored 0.12; "Beef Flavored" gravy 0.20; "Graham Cracker" and "All
//   Butter" crusts 0.35-0.40; Costco's "All Butter Dinner Rolls" 0.40; "Dry Toasted" pecans 0.44.
// - Alternate trade names: "Whole Cranberry Sauce", "Crispy Fried Onions", "Brown & Serve Rolls",
//   and a bakery's "Pie, Pumpkin".
// Look-alikes that won or backed a claim:
// - Sam's Club tater tots as Cheyenne's best butter; Bisto gravy granules as Portland's and
//   Washington's best gravy; turnover shells as Providence's best pie crust; table cream as
//   Cheyenne's best heavy cream; "Celery Cabbage" and "Zulka Sugar, Pure Cane" as named runners-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';

const yes = (q, name, category) => assert.ok(relevance(q, { name, category }) >= RELEVANT, `"${q}" should find "${name}" (${relevance(q, { name, category }).toFixed(2)})`);
const no = (q, name, category) => assert.ok(relevance(q, { name, category }) < RELEVANT, `"${q}" should not find "${name}" (${relevance(q, { name, category }).toFixed(2)})`);

test('DEFECT: a label phrase does not hide the store brand', () => {
  for (const q of ['whole turkey', 'frozen turkey', 'turkey']) yes(q, 'Kroger® Tender and Juicy Whole Frozen Turkey (10-14 lb) - Limit 5 at sale retail', 'Frozen Whole Turkey');
  yes('turkey', 'Jennie-O Tender & Juicy Young Turkey', 'Whole Turkey');
  yes('whole turkey', 'Jennie-O 16/20 Pound Ts Frozen Broth Basted Turkey', 'Frozen Whole Turkey');
  yes('evaporated milk', 'Carnation Evaporated Milk Vitamin D', 'Evaporated Milk');
  yes('evaporated milk', 'Carnation Vitamin D Added Evaporated Milk', 'Evaporated Milk');
  yes('milk', 'Kroger Vitamin D Whole Milk', 'Milk');
  yes('milk', 'Great Value Whole Vitamin D Milk, Gallon, 128 fl oz', 'Milk');
  yes('stuffing mix', "Chef's Cupboard Real Chicken Broth Stuffing Mix", 'Boxed Stuffing');
  yes('stuffing mix', "Chef's Cupboard Cornbread Flavor Stuffing Mix", 'Boxed Stuffing');
  yes('stuffing mix', 'Kroger® Chicken Flavored Stuffing Mix', 'Boxed Stuffing');
  yes('gravy', 'Food Lion Gravy, Beef Flavored, Homestyle', 'Gravies');
  yes('gravy', 'Great Value Homestyle Beef Flavored Gravy', 'Gravies');
  yes('gravy', 'Food Club Homestyle Chicken Flavored Gravy', 'Gravies');
  yes('pie crust', "Baker's Corner Graham Cracker Crust", 'Pie Crusts');
  yes('pie crust', 'Bettergoods All Butter Pie Crusts', 'Frozen Pie Crusts');
  yes('pie crust', 'Jus-Rol Rich and Buttery Pie Crust', 'Pie Dough');
  yes('dinner rolls', 'All Butter Dinner Rolls, 24-count', 'Dinner Rolls');
  yes('pecans', 'Pecan Pieces Dry Toasted Unsalted', 'Nuts');
  yes('turkey breast', 'Jennie-O Bone In Turkey Breast', 'Turkey Breast');
  yes('chicken thighs', 'Bone In Skin On Chicken Thighs', 'Chicken Thighs');
});

test('DEFECT: the trade\'s other name for the product is the product', () => {
  yes('whole berry cranberry sauce', 'Ocean Spray Whole Cranberry Sauce, Canned Side Dish', 'Canned Cranberries');
  yes('whole berry cranberry sauce', 'Best Choice Whole Cranberry Sauce', 'Canned Cranberries');
  yes('whole berry cranberry sauce', 'Meijer Canned Cranberry Sauce Whole 14 oz', 'Canned Cranberries');
  yes('french fried onions', 'Kirkland Signature Crispy Fried Onions', 'Crispy Fried Onions');
  yes('french fried onions', 'Tasty Joy Crispy Fried Onions', 'Crispy Fried Onions');
  yes('french fried onions', 'Essential Everyday Fried Onions, Crispy', 'Crispy Fried Onions');
  yes('dinner rolls', "Nature's Grain Brown & Serve Roll", 'Rolls');
  yes('dinner rolls', 'Great Value Brown & Serve Rolls', 'Rolls');
  yes('pumpkin pie', 'Publix Bakery Pie, Pumpkin', 'Pumpkin Pie');
  yes('pumpkin pie', 'Table Talk Pie, Pumpkin', 'Pies');
  yes('pumpkin pie', 'Fresh From Meijer Pie Pumpkin 8 in', 'Pumpkin Pie');
});

// Every "Stew Leonard's ..." product scored 0.40 because 'stew' is a look-alike word, so the chain
// had no ranked turkey, butter, milk or heavy cream; "Hotel Bar" and "Danish Creamery" butter,
// "Turkey Hill" and "Fry's" milk, "Wonder Bread" rolls and "Le Sauce & Co." gravy the same way. A
// word of the maker's name is forgiven when the store filed the product under what was searched.
// Measured over all 36,853 distinct cached items: 143 verdicts change, every one an admit.
test('DEFECT: a word of the maker\'s name is not a look-alike in the aisle that was searched', () => {
  const has = (q, name, category, brand) => assert.ok(relevance(q, { name, category, brand }) >= RELEVANT, `"${q}" should find "${name}" (${relevance(q, { name, category, brand }).toFixed(2)})`);
  has('turkey', "Stew Leonard's 14-16 Lb Fresh Turkey", 'Whole Turkey', "Stew Leonard's");
  has('whole turkey', "Stew's Naked 14-18 Lb Free Range Turkey", 'Whole Turkey', "Stew's Naked");
  has('butter', 'Hotel Bar Salted Butter', 'Salted Butter', 'Hotel Bar');
  has('butter', 'Danish Creamery Butter, Premium, Sea Salted, 4 Sticks', 'Salted Butter', 'Danish Creamery');
  has('butter', 'Rumiano Cheese Company Unsalted Butter', 'Unsalted Butter', 'Rumiano Cheese Company');
  has('milk', 'Turkey Hill Whole Milk', 'Plain Milk', 'Turkey Hill');
  has('milk', "Fry's 2% Milk", 'Plain Milk', "Fry's");
  has('dinner rolls', 'Wonder Bread Dinner Rolls, Classic, Extra Soft', 'Dinner Rolls', 'Wonder Bread');
  has('gravy', 'Le Sauce & Co. Gourmet Roasted Chicken Gravy', 'Gravies', 'Le Sauce & Co.');
  has('heavy cream', 'C.F. Burger Creamery Heavy Whipping Cream', 'Heavy Whipping Cream', 'C.F. Burger Creamery');
  has('pie crust', 'Pet-Ritz Regular Pie Crusts', 'Pie Crusts', 'Pet-Ritz');
  has('baby food', 'Happy Tot Organics Stage 4 Super Foods Baby Food Pouch, 4.22 oz', 'Baby Food', 'Happy Tot');
});

test('control: a maker\'s name that says what it makes still does, outside the searched aisle', () => {
  const hasNot = (q, name, category, brand) => assert.ok(relevance(q, { name, category, brand }) < RELEVANT, `"${q}" should not find "${name}" (${relevance(q, { name, category, brand }).toFixed(2)})`);
  hasNot('milk', 'Twrl Milk Tea Brown Sugar Chewy Cafe-Style Boba', 'Bottled Milk Tea', 'Twrl Milk Tea');
  hasNot('brown sugar', 'Twrl Milk Tea Brown Sugar Chewy Cafe-Style Boba', 'Bottled Milk Tea', 'Twrl Milk Tea');
  hasNot('milk', 'Meyenberg Goat Milk Certified Humane, Easy to Digest, 100% Pure', 'Plain Milk', 'Meyenberg Goat Milk');
  hasNot('marshmallows', "Kellogg's Rice Krispies Treats Crispy Marshmallow Squares, Original", 'Other Packaged Treats', "Kellogg's Rice Krispies Treats");
  hasNot('butter', "Stew Leonard's Broccoli with Garlic Butter Steam Bag", 'Frozen Broccoli', "Stew Leonard's");
  hasNot('butter', 'Barker Wellness Co Tattoo Butter', 'Stretch Mark and Scar Treatment', 'Barker Wellness Co');
  hasNot('onions', 'Badia Spices Onion, Flakes', 'Dried Onion', 'Badia Spices');
  hasNot('pecans', 'Mary Sue Candies Pecan Nougat Egg', 'Pecans', 'Mary Sue Candies');
  hasNot('canned pumpkin', 'Two Bite Pumpkin Tarts, Original', 'Tarts', 'Two Bite');
  hasNot('butter', "Kinder's Garlic Butter Restaurant-Style Crispy Tots", 'Frozen Tater Tots', "Kinder's");
});

// An adversarial review of this change (19 Nov 2026) ran both code trees over all 36,853 distinct
// cached items and read every verdict that flipped. These are the wrong flips it found.
test('REVIEW: the first cut of these fixes went too far in six places', () => {
  // The squash and a can of pumpkin are filed under the pie aisles too: the aisle alone is not a pie.
  no('pumpkin pie', 'PIE PUMPKIN', 'Pumpkin Pie');
  no('pumpkin pie', 'Organic Pie Pumpkin', 'Pumpkin Pie');
  no('pumpkin pie', 'Painted Pie Pumpkin', 'Pumpkin Pie');
  no('pumpkin pie', 'Festal Golden Pie Pumpkin', 'Pie Fillings');
  // "Delights" in a maker's name is not a confection.
  assert.ok(relevance('pecans', { name: 'Northwest Delights Organic Pecans', category: 'Pecans', brand: 'Northwest Delights' }) >= RELEVANT);
  assert.ok(relevance('almonds', { name: "California's Natural Delight Sliced Almonds, 32 oz", category: 'Almonds', brand: "California's Natural Delight" }) >= RELEVANT);
  no('pecans', "Thompson's Bakery Pecan Delights", 'Pecans');
  // The vitamin label does not hide the base, and the words still answer a vitamin search.
  no('milk', 'Weis Quality Evaporated Vitamin D Milk', 'Evaporated Milk');
  no('milk', 'Carnation Evaporated Milk Vitamin D', 'Evaporated Milk');
  yes('vitamin', 'Spring Valley Vitamin D 25 mcg Softgels', 'Vitamin D');
  yes('vitamins', "Nature's Bounty Vitamin D 25 mcg Softgels", 'Vitamins & Supplements');
  yes('milk', 'Horizon Organic Whole Milk Vitamins A & D', 'Milk');
  // Roll butter is butter.
  no('rolls', 'Minerva Dairy Amish Roll Butter, Sea Salt, 2 lb', 'Butter');
  yes('butter', 'Minerva Dairy Amish Roll Butter, Sea Salt, 2 lb', 'Butter');
});

test('DEFECT: look-alikes that won or backed a claim are refused', () => {
  no('butter', "Kinder's Garlic Butter Restaurant-Style Crispy Tots", 'Frozen Tater Tots');
  no('butter', 'Bauducco All Butter Panettone', 'Panettone');
  no('butter', 'Fig Butter', 'Nut Butters & Fruit Spreads');
  no('gravy', 'Bisto Gravy Granules for Beef', 'Gravy Mix');
  no('gravy', 'Bisto Beef Reduced Salt Gravy Granules', 'Gravies');
  no('pie crust', 'Kikuet Plantillas Turnover Shells', 'Frozen Pie Crusts');
  no('pie crust', 'Specialty Bakers Dessert Shells', 'Frozen Pie Crusts');
  no('heavy cream', 'Lucerne Cream, Table', 'Heavy Creams');
  no('heavy cream', 'Nestle Table Cream', 'Heavy Creams');
  no('celery', 'Celery Cabbage', 'Napa Cabbage');
  no('brown sugar', 'Zulka Sugar, Pure Cane', 'Brown Sugars');
  no('brown sugar', 'Sugar in the Raw Organic Cane Sugar, 6 lbs', 'Brown Sugars');
  no('brown sugar', 'Piloncillo', 'Brown Sugars');
  no('turkey breast', 'Bravo Pavo Especias', 'Turkey Breast');
  no('pecans', 'Give & Go Pecan Crostatas', 'Pecans');
  no('pecans', 'The Fresh Market Pecan-Crusted Cod', 'Fish');
  no('pecans', 'Collin Street Bakery Pecan Fruitcake', 'Pecans');
  no('pecans', 'R.M. Palmer Company Pecan Divinity', 'Pecans');
  no('pecans', 'DeLallo Orange Pecan Biscotti', 'Biscotti');
  no('pecans', 'Bazzini Pecan Supreme', 'Trail Mix');
});

test('control: the words still do their work where they name another product', () => {
  // Tenders, broth and supplements are not the bird, the stuffing or the milk.
  no('turkey', 'Perdue Turkey Tenders', 'Turkey');
  no('turkey', 'Swanson Turkey Broth', 'Broth');
  no('stuffing mix', 'Swanson Chicken Broth', 'Broth');
  no('milk', 'Nature Made Vitamin D3 1000 IU Softgels', 'Vitamins');
  no('milk', "Nature's Bounty Vitamin D 2000 IU Tablets", 'Vitamins');
  yes('vitamin d', "Nature's Bounty Vitamin D 2000 IU Tablets", 'Vitamins');
  // A dry mix is still not gravy, a pie is not its crust, crackers are not a crust.
  no('gravy', 'McCormick Brown Gravy Mix', 'Gravy Mix');
  yes('gravy', 'Heinz HomeStyle Turkey Gravy', 'Gravies');
  no('pie crust', "Mrs. Smith's Original Flaky Crust Dutch Apple Pie", 'Frozen Pies');
  no('pie crust', 'Honey Maid Graham Crackers', 'Graham Crackers');
  yes('pie crust', 'Pillsbury Pie Crusts', 'Pie Dough');
  // Snack nuts, light cream, the squash, onion rings.
  no('pecans', 'Dry Roasted Pecans, Salted', 'Snack Nuts');
  yes('pecans', 'Fisher Pecan Halves', 'Pecans');
  no('heavy cream', 'Wellsley Farms Light Cream', 'Heavy Creams');
  yes('heavy cream', 'Horizon Organic Heavy Whipping Cream', 'Heavy Creams');
  no('pumpkin pie', 'Pie Pumpkin', 'Pumpkins');
  no('french fried onions', 'Crispy Fried Onion Rings', 'Frozen Appetizers');
  no('whole berry cranberry sauce', 'Ocean Spray Jellied Cranberry Sauce', 'Canned Cranberries');
  no('jellied cranberry sauce', 'Ocean Spray Whole Cranberry Sauce', 'Canned Cranberries');
  // Brown sugar that says so, celery, butter, and a pork steak with the bone in.
  yes('brown sugar', 'Domino Light Brown Sugar, Pure Cane', 'Brown Sugars');
  yes('brown sugar', 'Zulka Brown Pure Cane Sugar', 'Brown Sugars');
  yes('celery', 'Signature SELECT Celery Hearts', 'Celery');
  yes('butter', 'Land O Lakes Salted Butter', 'Salted Butter');
  no('steak', 'Bone-In Butt Pork Shoulder Steak', 'Pork');
  yes('steak', 'Bone In Ribeye Steak', 'Beef');
  // Kept hidden on purpose: un-hiding corn bread stuffing would headline Walmart's chain-wide 50c
  // price for a 12 oz Pepperidge Farm bag in six cities, a fifth of its shelf price elsewhere.
  no('stuffing mix', 'Pepperidge Farm Corn Bread Classic Stuffing', 'Boxed Stuffing');
});
