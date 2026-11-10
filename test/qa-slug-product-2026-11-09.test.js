// QA, 9 Nov 2026 (ops/coverage/qa-2026-11-09.md). King Soopers' "KRO TURKEY STUFFING MIX" (20 oz,
// $1.09) carried the slug ".../19275341-kroger-sugar-cinnamon-mini-pretzel-20-oz" and was Denver's
// best stuffing at $0.87/lb: the price and size of a pretzel listing under a stuffing name.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The same cases are in ios/Tests/CoreTests.swift (SlugProductTests). Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct, slugProductConflict } from '../src/normalize.js';
import { headlineEligible } from '../shared/compare.js';

const ic = (slug) => `https://www.instacart.com/products/${slug}?retailerSlug=x`;
const P = (storeId, name, sizeText, price, url, extra = {}) => makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price, url, ...extra });

test('DEFECT: a listing whose slug names another product is never the best price', () => {
  const kro = P('kingsoopers', 'KRO TURKEY STUFFING MIX', '20 oz', 1.09, ic('19275341-kroger-sugar-cinnamon-mini-pretzel-20-oz'));
  assert.ok(kro.sizeConflict, 'the stuffing/pretzel row should record a contradiction');
  assert.equal(headlineEligible(kro, { answerFloor: 0 }), false, 'a contradicted row must not take the best-price headline');
  const pf = P('walmart', 'Pepperidge Farm Herb Seasoned Classic Stuffing', '12 oz', 1.68, ic('20128745-pepperidge-farm-herb-seasoned-classic-stuffing-12-oz'));
  assert.equal(pf.sizeConflict ?? null, null);
});

test('DEFECT: Whole Foods turkey rows that link to chicken products are flagged', () => {
  for (const [name, slug] of [
    ["Mary's Turkey No Antibiotics Ever, Turkey Bone-In Breast", '17852189-green-chile-chicken-sausage-bulk-1-lb'],
    ['Plainville Farms Bone-In Turkey Breast, No Antibiotics Ever', '17852196-chicken-leg-quarters-package-1-lb'],
  ]) assert.ok(slugProductConflict(name, ic(slug)), name);
});

test('control: abbreviations, reordered words and plural forms still agree with their slugs', () => {
  for (const [name, slug] of [
    ['GV CHKN BRTH', '1-great-value-chicken-broth-32-oz'],
    ['Great Value Green Cut Beans', '2-great-value-cut-green-beans-14-5-oz'],
    ["Hershey's Assorted, Halloween Candy Bulk Variety Bag, 51.03 oz (165 Pieces)", '64584342-chocolate-miniatures-assortment-stand-up-bag'],
    ['Café Bustelo Espresso', '3-cafe-bustelo-espresso-10-oz'],
    ['Costco Sweet Potatoes, 5 lbs', '18848374-sweet-potatoes-10-lbs-10-lb'],
  ]) assert.equal(slugProductConflict(name, ic(slug)), null, name);
});

test('control: rows with no product slug, or too few words to judge, are left alone', () => {
  assert.equal(slugProductConflict('KRO TURKEY STUFFING MIX', 'https://www.wholefoodsmarket.com/product/365-stuffing-b074'), null);
  assert.equal(slugProductConflict('Celery', ic('5-organic-celery-hearts-1-ea')), null);
  assert.equal(slugProductConflict('KRO TURKEY STUFFING MIX', ic('6-pretzels')), null);
});
