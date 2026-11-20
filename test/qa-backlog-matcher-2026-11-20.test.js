// The open look-alike groups from the 18-19 Nov review of every cached Thanksgiving answer, fixed and
// re-measured on 20 Nov 2026 (every distinct cached item, 36,853 of them, scored by main and by this
// change: every verdict that changed is a refusal of one of these).
//
// - Bravo's "Sa Strawberry Cranberry Sauce" at $0.79/lb headlined "cranberry sauce" in Queens over its
//   plain can; horseradish, chipotle, apple and dipping sauces scored as cranberry sauce.
// - Gummy pumpkins, bakery pies, porridge, energy sticks, paint and baby food were stores' canned pumpkin.
// - Lima, mung and black beans and vegetable blends answered "green beans".
// - Bravo files "Sa Farina Cream" (a wheat cereal) under Heavy Cream.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';

const yes = (q, p) => assert.ok(relevance(q, p) >= RELEVANT, `${p.name} should answer "${q}" (${relevance(q, p).toFixed(3)})`);
const no = (q, p) => assert.ok(relevance(q, p) < RELEVANT, `${p.name} should not answer "${q}" (${relevance(q, p).toFixed(3)})`);
const can = (name, category, base = 15) => ({ name, category, dim: 'weight', base });

test('DEFECT: a second fruit, or another sauce, is not cranberry sauce', () => {
  no('cranberry sauce', can('Sa Strawberry Cranberry Sauce', 'Canned Cranberries', 16));
  no('cranberry sauce', can('Ocean Spray Cran Raspberry Cranberry Sauce', 'Canned Cranberries', 14));
  no('cranberry sauce', can('Stonewall Kitchen Horseradish Sauce, Cranberry', 'Horseradish Sauce', 12));
  no('cranberry sauce', can('Bell-View Cranberry Horseradish Sauce', 'Horseradish Sauce', 16));
  no('cranberry sauce', can("B.Bob's Foods Cranberry Chipotle Sauce", 'Other Sauces', 14.75));
  no('cranberry sauce', { name: "Mott's Apple Sauce, Cranberry Raspberry", category: 'Fruit Juice Blends', dim: 'volume', base: 15.6 });
  no('cranberry sauce', can('Ocean Spray Crushed Cranberry Orange Fruit Dipping Sauce', 'Fruit Juice Blends', 12));
});

test('control: plain, whole berry and jellied cranberry sauce, and flavoured sauces of other kinds', () => {
  yes('cranberry sauce', can('Super A Cranberry Sauce', 'Canned Cranberries', 16));
  yes('cranberry sauce', can('Ocean Spray Whole Berry Cranberry Sauce', 'Cranberry Sauce', 14));
  yes('cranberry sauce', can('Ocean Spray Jellied Cranberry Sauce', 'Canned Fruit', 14));
  yes('hot sauce', { name: 'Mango Habanero Hot Sauce', category: 'Hot Sauce', dim: 'volume', base: 5 });
  yes('bbq sauce', { name: 'Sweet Baby Ray\'s Honey Barbecue Sauce', category: 'BBQ Sauce', dim: 'weight', base: 18 });
});

test('DEFECT: candy, pies, porridge and paint are not canned pumpkin', () => {
  no('canned pumpkin', can('Zachary Pumpkins, Mello Creme', 'Gummy Candies', 16));
  no('canned pumpkin', can('Table Talk Pie, Pumpkin', 'Pumpkin Pie', 22));
  no('canned pumpkin', can('Table Talk Pies Inc. Classic Pumpkin 8-inch Pie', '', 22));
  no('canned pumpkin', can('Jinga Pumpkin Porridge', 'Quick Oats', 17.6));
  no('canned pumpkin', can('99 Pumpkin Energy Sticks', 'Snack Bites', 6.35));
  no('canned pumpkin', can('Pumpkin Croquette', '', 15.51));
  no('canned pumpkin', can('Pumpkin Tree Fruit & Vegetable Puree, Organic, Apple, Carrot & Pumpkin', 'Baby Food Purees', 4));
  no('canned pumpkin', can('Noosa Pumpkin Yoghurt, 8 oz', 'Traditional Yogurt', 8));
  no('canned pumpkin', can('Market District Pie Pumpkin', 'Pumpkin Pie', 24));
});

test('control: every can of pumpkin still answers, whatever its label', () => {
  yes('canned pumpkin', can("Libby's 100% Pure Pumpkin", 'Canned Pumpkin & Pie Filling'));
  yes('canned pumpkin', can('Great Value Pumpkin', 'Canned Vegetables'));
  yes('canned pumpkin', can('Weis Quality 100% Pure Pumpkin', 'Pie Filling'));
  // A pie pumpkin is the variety: Festal's can of it in Pie Fillings.
  yes('canned pumpkin', can('Festal Golden Pie Pumpkin', 'Pie Fillings'));
  yes('pumpkin puree', can("Farmer's Market Foods Organic Pumpkin Puree", ''));
});

test('DEFECT: another bean, or a blend of vegetables, is not green beans', () => {
  no('green beans', can('Goya Green Lima Beans', 'Canned Lima Beans'));
  no('green beans', can('Asian Taste Green Mung Bean', 'Dried Mung Beans', 14));
  no('green beans', can("Nature's Black Bean Inside Green", 'Dried Black Beans', 64));
  no('green beans', can('Green Valley Pinto Beans', 'Canned Pinto Beans'));
  no('green beans', can('Sultan Premium Green Fava Beans', 'Other Frozen Vegetables', 14));
  no('green beans', can("Member's Mark Mixed Vegetables A Blend Of Carrots Corn Green Beans And Peas", 'Frozen Mixed Vegetables', 72));
  no('green beans', can('Eat Smart Green Beans & Carrots', 'Green Beans', 12));
  no('green beans', can('Glory Foods Seasoned Southern Style Green Beans With Potatoes', 'Green Beans', 27));
});

test('control: green beans by any name, seasoned or not, and every bean for "beans"', () => {
  yes('green beans', can('Del Monte BLUE LAKE Cut Green Beans, Canned Vegetables', 'Canned Green Beans', 14.5));
  yes('green beans', can('Birds Eye Steamfresh Cut Green Beans, Frozen Vegetables', 'Frozen Green Beans', 10));
  yes('green beans', { name: 'Organic Snap Green Beans', category: 'Fresh Vegetables', soldBy: 'lb', dim: 'weight' });
  yes('green beans', can('Green Beans with Cracked Pepper & Sea Salt', '', 12));
  yes('green beans', can('Glory Foods Reduced Sodium Southern Style Green Beans with Garlic, Onion & Sea Salt', 'Canned Green Beans', 14.5));
  yes('green beans', can('String Beans with Garlic', 'Green Beans', 12));
  yes('beans', can('Goya Black Beans', 'Canned Beans', 15.5));
  yes('black beans', can('Goya Black Beans', 'Canned Beans', 15.5));
  yes('lima beans', can('Goya Green Lima Beans', 'Canned Lima Beans'));
});

test('DEFECT: farina filed under heavy cream is not cream', () => {
  no('heavy cream', { name: 'Sa Farina Cream', category: 'Heavy Cream', dim: 'volume', base: 28 });
  yes('heavy cream', { name: 'White Rose Heavy Cream', category: 'Heavy Cream', dim: 'volume', base: 8 });
});
