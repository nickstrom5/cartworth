// QA, 9 Nov 2026 (ops/coverage/qa-2026-11-09.md). A "milk" search showed "Rouses Coconut Milk"
// (a 13.5 oz can, 2 for $4) in the weekly-ad strip: it scored 0.51, under RELEVANT for results but
// over the strip's 0.4 cut (src/search.js searchAds). The other way round, "oat milk" rejected
// Oatly, the best-known oat milk, because Oatly is on the vegan-brand list.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The same cases are in ios/Tests/CoreTests.swift (PlantMilkTests). Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';

const AD_CUT = 0.4; // src/search.js searchAds
const score = (q, name) => relevance(q, { name });

test('DEFECT: a plant or canned base right before "milk" is not milk, even for the weekly-ad strip', () => {
  for (const name of ['Rouses Coconut Milk', 'Chaokoh, Coconut Milk', 'Nestlé Carnation Evaporated Milk', 'Chef\'s Quality Evaporated Milk', 'Oatly Original Oatmilk']) {
    const s = score('milk', name);
    assert.ok(s < AD_CUT, `"milk" vs "${name}" scored ${s.toFixed(3)} >= ${AD_CUT}`);
  }
});

test('DEFECT: "oat milk" finds Oatly and one-word "Oatmilk" labels', () => {
  for (const name of ['Oatly Oat Milk', 'Oatly Original Oatmilk', 'Planet Oat Oatmilk Original']) {
    const s = score('oat milk', name);
    assert.ok(s >= RELEVANT, `"oat milk" vs "${name}" scored ${s.toFixed(3)} < ${RELEVANT}`);
  }
});

test('control: the named base still finds its own product, and plain milk is still milk', () => {
  for (const [q, name] of [['coconut milk', 'Rouses Coconut Milk'], ['evaporated milk', 'Carnation Evaporated Milk'], ['almond milk', 'Silk Unsweetened Almond Milk'], ['milk', 'Great Value 2% Reduced Fat Milk'], ['milk', 'Lucerne Whole Milk']]) {
    const s = score(q, name);
    assert.ok(s >= RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} < ${RELEVANT}`);
  }
});

test('control: ad items in the 0.4-0.55 band that are real matches stay in the strip', () => {
  for (const [q, name] of [['eggs', 'OrgaNick Pastures Organic Corn & Soy Feed Free Eggs'], ['green beans', 'James Farm Frozen Cut Green Beans'], ['dinner rolls', 'Rhodes Dinner or Cinnamon Rolls']]) {
    const s = score(q, name);
    assert.ok(s >= AD_CUT, `"${q}" vs "${name}" scored ${s.toFixed(3)} < ${AD_CUT}`);
  }
});

test('control: a plain "milk" or "butter" search still refuses plant analogues', () => {
  for (const [q, name] of [['milk', 'Oatly Oat Milk'], ['milk', 'Silk Almond Milk'], ['butter', 'Earth Balance Plant Butter']]) {
    const s = score(q, name);
    assert.ok(s < RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} >= ${RELEVANT}`);
  }
});
