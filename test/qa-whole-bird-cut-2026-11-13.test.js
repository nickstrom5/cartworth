// Thanksgiving core list, 13 Nov 2026 (Phoenix 85016): Costco's "Fresh Hen Turkey" (Foster Farms, a
// whole bird, $1.23/lb), which Instacart files under Turkey Breast, was the runner-up "turkey breast"
// at 0.88: the aisle supplied "breast". A whole chicken filed under Chicken Breast did the same for
// "chicken breast". When the shopper names a cut, a name that says it is the whole bird and names no
// cut is another purchase, whatever its aisle (shared/match.js wholeBirdForCut; Match.swift mirrors it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';

const cut = RELEVANT ?? 0.55;

test('DEFECT: a whole hen turkey filed under Turkey Breast is not a "turkey breast"', () => {
  assert.ok(relevance('turkey breast', { name: 'Fresh Hen Turkey', category: 'Turkey Breast' }) < cut);
});

test('DEFECT: a whole chicken filed under Chicken Breast is not a "chicken breast"', () => {
  assert.ok(relevance('chicken breast', { name: 'Whole Chicken', category: 'Chicken Breast' }) < cut);
});

test('control: real breasts, a whole breast and whole wings still match their cut', () => {
  for (const [q, name] of [
    ['turkey breast', 'Kirkwood Bone-In Turkey Breasts'],
    ['turkey breast', 'Jennie-O 11.0 to 13.0 Pound Frozen Bone-In Turkey Breast'],
    ['turkey breast', 'Butterball Whole Turkey Breast'],
    ['chicken breast', 'Boneless Skinless Chicken Breasts'],
    ['chicken wings', 'Whole Chicken Wings'],
  ]) assert.ok(relevance(q, { name }) >= cut, `${q}: ${name}`);
});

test('control: a whole bird still answers a search for the bird', () => {
  assert.ok(relevance('turkey', { name: 'Butterball Whole Turkey' }) >= cut);
  assert.ok(relevance('whole chicken', { name: 'Whole Chicken', category: 'Chicken Breast' }) >= cut);
});

// Same run, Phoenix: Bashas' "Durham-Ellis Pecan Co. Orange Slices" (Gummy Candies, 12 oz $4.49) was
// the best "pecans" at 0.72, the nut word coming from the maker's name. The candy-aisle rule for nut
// searches knew "candy" but not "candies".
test('DEFECT: a gummy candy from a pecan company is not "pecans"', () => {
  assert.ok(relevance('pecans', { name: 'Durham-ellis Pecan Co. Orange Slices', category: 'Gummy Candies' }) < cut);
});

test('control: pecans in a baking or nut aisle still match', () => {
  assert.ok(relevance('pecans', { name: 'Southern Grove Chopped Pecans', category: 'Nuts' }) >= cut);
  assert.ok(relevance('pecans', { name: 'Durham-Ellis Pecan Co. Pecan Halves', category: 'Baking Nuts' }) >= cut);
});

// Same run, 12 more states: Pete's "Medium Knob Onions" (one bunch, 9¢) was Chicago's cheapest
// "onions", and "Filled Milk" (vegetable fat for butterfat) the runner-up "evaporated milk" in New
// Orleans and Phoenix.
test('DEFECT: knob onions are not onions, and filled milk is not evaporated milk', () => {
  assert.ok(relevance('onions', { name: 'Medium Knob Onions' }) < cut);
  assert.ok(relevance('evaporated milk', { name: 'Jans Enterprises Evaporated Filled Milk' }) < cut);
});

test('control: yellow onions, evaporated milk, and either one asked for by name still match', () => {
  assert.ok(relevance('onions', { name: 'Fresh Yellow Onions' }) >= cut);
  assert.ok(relevance('evaporated milk', { name: 'Great Value Evaporated Milk' }) >= cut);
  assert.ok(relevance('knob onions', { name: 'Medium Knob Onions' }) >= cut);
  assert.ok(relevance('filled milk', { name: 'Always Save FILLED MILK' }) >= cut);
});
