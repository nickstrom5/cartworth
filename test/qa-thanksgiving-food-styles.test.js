// QA: Thanksgiving food styles (ops/coverage/thanksgiving-food-styles-2026-11-03.md). Regional,
// cultural and dietary dishes through scripts/price-audit.js's path in El Paso, Houston, Atlanta,
// New Orleans, Brooklyn, Honolulu and Minneapolis.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The same cases are in ios/Tests/CoreTests.swift (ThanksgivingFoodStylesTests), which holds the
// phone's matcher to the same answers. Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT, tokens } from '../shared/match.js';

const score = (q, name, extra = {}) => relevance(q, { name, ...extra });
const rejects = (q, name, extra = {}) => {
  const s = score(q, name, extra);
  assert.ok(s < RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} >= ${RELEVANT} (wrong product accepted)`);
};
const matches = (q, name, extra = {}) => {
  const s = score(q, name, extra);
  assert.ok(s >= RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} < ${RELEVANT} (real match rejected)`);
};

// ---------------------------------------------------------------------------
// Dietary searches. "vegan butter" could not match a plant butter: labels say "Plant Butter",
// "Plant-Based" or "Dairy Free", and a plant base was itself a penalty. The other way round,
// a plain "turkey" took a vegan roast the store filed under Turkey.
// ---------------------------------------------------------------------------
test('DEFECT: a vegan search is answered by plant-based and dairy-free labels', () => {
  matches('vegan butter', 'Country Crock Plant Butter with Olive Oil', { category: 'Butter & Margarine' });
  matches('vegan butter', "Miyoko's Creamery Plant Milk Butter Vegan");
  matches('vegan butter', 'Country Crock Dairy Free Butter Sticks');
  matches('plant based roast', 'Tofurky Plant-Based Roast & Gravy');
  matches('vegan roast', 'Field Roast Celebration Roast');
  matches('tofurky', 'Tofurky Plant-Based Roast & Gravy');
  matches('vegetarian gravy', 'Imagine Vegan Gravy');
});

test('control: a vegan search still refuses the animal food and the look-alikes', () => {
  rejects('vegan butter', 'Land O Lakes Salted Butter', { category: 'Butter' });
  rejects('vegan butter', 'Vegan Butter Cookies');
  rejects('vegan butter', 'Justin\'s Vegan Almond Butter');
  rejects('vegan butter', 'Vegan Coconut Butter');
  rejects('vegan gravy', 'McCormick Turkey Gravy Mix', { category: 'Gravy' });
  rejects('vegan gravy', 'Dairy Free Turkey Gravy');
  rejects('vegan cheese', 'Kraft Cheddar Cheese', { category: 'Cheese' });
  rejects('vegetarian stuffing', 'Stove Top Stuffing Chicken', { category: 'Stuffing' });
  rejects('plant based roast', 'Beef Chuck Roast', { category: 'Roast' });
  // Live, Houston: the maker's name is not the product. Field Roast's slices and frankfurters
  // answered "plant based roast"; its Celebration Roast, and the stuffed and flavoured roasts, are.
  rejects('plant based roast', 'Field Roast Plant-Based Slices, Creamy Original', { brand: 'Field Roast', category: 'Cheese Alternatives' });
  rejects('plant based roast', 'Classic Smoked Plant Based Frankfurter', { brand: 'Field Roast' });
  matches('plant based roast', 'Field Roast Celebration Roast', { brand: 'Field Roast' });
  matches('plant based roast', 'Hazelnut Cranberry Plant Based Roast');
  matches('plant based roast', 'Tofurky Stuffed Veggie Roast', { brand: 'Tofurky' });
  matches('field roast', 'Field Roast Plant-Based Slices, Creamy Original', { brand: 'Field Roast' });
});

test('DEFECT: a plain animal food is not answered by its vegan analogue', () => {
  rejects('turkey', 'Field Roast Celebration Roast Vegan', { category: 'Turkey' });
  rejects('turkey', 'Tofurky Plant-Based Roast', { category: 'Turkey' });
  rejects('butter', "Miyoko's Vegan Butter", { category: 'Butter' });
  rejects('butter', 'Country Crock Plant Butter', { category: 'Butter' });
  rejects('ham', 'Tofurky Plant-Based Deli Slices Hickory Smoked Ham Style');
});

test('control: vegetarian variants of foods without an animal at heart are untouched', () => {
  matches('baked beans', "Bush's Vegetarian Baked Beans");
  matches('stuffing', 'Vegan Herb Stuffing Mix', { category: 'Stuffing' });
  matches('gravy', 'Imagine Vegan Gravy', { category: 'Gravy' });
});

test('DEFECT: "gluten free" is one claim, not a "free" that "Fat Free" can half meet', () => {
  assert.ok(score('gluten free stuffing', 'Stove Top Fat Free Stuffing', { category: 'Stuffing' }) < score('gluten free stuffing', 'Stove Top Stuffing Mix for Turkey', { category: 'Stuffing' }) + 0.01);
  rejects('gluten free stuffing', 'Stove Top Fat Free Stuffing', { category: 'Stuffing' });
  rejects('gluten free pie crust', 'Pillsbury Pie Crust Sugar Free');
  matches('gluten free stuffing', "Aleia's Gluten-Free Stuffing");
  matches('gluten free pie crust', 'Wholly Gluten Free Pie Shells');
  assert.deepEqual(tokens('Gluten-Free Plant-Based Non-Dairy'), ['glutenfree', 'plant', 'dairyfree']);
});

test('control: certification qualifiers stay required', () => {
  rejects('halal turkey', 'Butterball Whole Turkey', { category: 'Whole Turkey' });
  rejects('kosher turkey', 'Butterball Whole Turkey', { category: 'Whole Turkey' });
  rejects('kosher turkey', 'Morton Kosher Salt');
  matches('halal turkey', 'Crescent Foods Halal Whole Turkey');
  matches('kosher turkey', 'Empire Kosher Whole Turkey');
});

test('DEFECT: a whole brand search is answered by the brand, a word of a brand is not', () => {
  matches('kerrygold', 'Pure Irish Butter', { brand: 'Kerrygold' });
  rejects('milk', 'Milk-Bone Original Dog Treats', { brand: 'Milk-Bone' });
});

// ---------------------------------------------------------------------------
// Regional names for the same product.
// ---------------------------------------------------------------------------
test('DEFECT: regional names find the product as it is labelled', () => {
  matches('cornbread dressing', 'Stove Top Cornbread Stuffing Mix');
  matches('chitterlings', "Aunt Bessie's Chitlins");
  matches('chitterlings', 'Pork Chitterlings');
  matches('prime rib', 'Beef Rib Roast Bone-In');
  matches('pernil', 'Pork Shoulder Picnic Bone-In');
  matches('japchae noodles', 'Ottogi Sweet Potato Glass Noodles');
  matches('canned yams', "Bruce's Cut Sweet Potatoes in Syrup");
  matches('canned yams', 'Princella Cut Yams in Light Syrup');
  matches('mac and cheese', 'Kraft Macaroni & Cheese Dinner');
  matches('tres leches', 'Tres Leches Cake');
  matches('andouille', 'Aidells Cajun Style Andouille Sausage');
  matches('tamales', 'Pork Tamales');
  matches('lumpia wrappers', 'Pamana Frozen Lumpia Wrapper', { category: 'Frozen Dumpling and Wonton Wraps' });
  matches('tamales', 'Frozen Pork Tamales');
  rejects('tamales', 'HOT TAMALES 4.25OZ TROPICAL HEAT BOX', { category: 'Chewy Candy' });
  rejects('tamales', 'HOT TAMALES 4.25OZ TROPICAL HEAT BOX');
  matches('tamales', 'Old Style Hot Tamales', { category: 'Prepared Tamales' });
  matches('tamales', "Mickey Brown's Hot Tamale", { category: 'Frozen Tamales' });
  matches('hot tamales candy', 'HOT TAMALES Fierce Cinnamon Chewy Candies', { category: 'Chewy Candy' });
  // Near misses in the live results, every one a real answer.
  matches('flan', 'Goya Coconut Flan', { category: 'Flan' });
  matches('flan', 'El Exquisito Sabor Vanilla Flan', { category: 'Flan' });
  matches('tres leches', '8" Strawberry Tres Leches Cake', { category: 'Standard Frosted Cakes' });
  matches('spiral ham', 'Smithfield Red Spiral Sliced Glazed Ham', { category: 'Ham Roast' });
  matches('spiral ham', 'Fully Cooked Spiral Sliced Uncured Half Ham');
  matches('andouille', 'Holmes Smokehouse Pecan Smoked Andouille Sausage', { category: 'Andouille Sausage' });
  matches('canned yams', 'Best Choice CUT SWEET POTATOES 40 OZ', { category: 'Other Canned Vegetables' });
  rejects('pecans', 'Pecan Smoked Bacon');
  rejects('rolls', 'Cinnamon Rolls');
});

test('control: the regional names do not swallow other products', () => {
  rejects('prime rib', 'Prime Rib Seasoning');
  rejects('stuffing', 'Ken\'s Italian Dressing');
  rejects('sweet potatoes', 'Chinese Yam');
  rejects('sweet potatoes', 'Mountain Yam (Nagaimo)');
  rejects('oysters', 'Oyster Crackers');
  rejects('oysters', 'Oyster Sauce');
  rejects('oysters', 'King Oyster Mushroom', { category: 'Mushrooms' });
  matches('oyster mushrooms', 'King Oyster Mushroom');
  rejects('smoked turkey wings', 'Smoked Turkey Necks');
  // Live, El Paso: tamale dough answered "tamales", a chuck roast "prime rib".
  rejects('tamales', 'Traditional Prepared Tamale Masa');
  rejects('prime rib', 'Boneless Choice Beef Chuck Cross Rib Roast');
  matches('tamale masa', 'Coarse-Ground Tamale Masa');
  matches('ribs', 'Pork Spare Ribs');
  // Live, Atlanta and New Orleans.
  rejects('prime rib', 'Boneless Pork Rib Roast', { category: 'Pork Roasts' });
  rejects('prime rib', 'Archer Full Size Beef Sticks with Prime Rib', { category: 'Meat Jerky' });
  matches('prime rib', 'Beef Ribeye Roast', { category: 'Ribeye Roasts' });
  matches('prime rib', 'Beef Standing Rib Roast');
  rejects('ribs', 'Beef Ribeye Steak');
  rejects('oysters', 'Tobagi Oyster Kimchi');
  for (const n of ['Great Value Ready-to-Heat 90-Second Long Grain & Wild Rice', 'Long Grain Brown & Wild Rice', 'RiceSelect Premium Royal Blend Whole Grain With Wild Rice']) rejects('wild rice', n, { category: 'Wild Rice' });
  matches('wild rice', 'Lundberg Family Farms Organic Wild Rice', { category: 'Wild Rice' });
  matches('wild rice blend', 'Lundberg Wild Blend Rice');
  rejects('wild rice', "Nature's Wild Sweet Rice", { category: 'Rice' });
  matches('long grain and wild rice', 'Great Value Ready-to-Heat 90-Second Long Grain & Wild Rice');
  matches('sweet potatoes', 'Garnet Yams');
  matches('italian dressing', "Ken's Italian Dressing");
});
