// QA: a multi-buy weekly-ad deal is priced per unit, and its percent off is worked out per unit.
//
// Found during App Store screenshot capture on 2026-10-20. Fresh Thyme ZIP 60618, Flipp item
// 1045842565 "Chobani Greek, Less Sugar, No Sugar or Flip Yogurt" 4.5-5.3 oz is "10 for $10.00":
// the search result has price 10 and no pre_price_text; the item's own detail has pre_price_text
// "10 for" and original_price 18.9, the regular price of all ten. The deal read 95% off (one cup
// at $1.00 against $18.90), and a search hit was shown as one cup for $10.00 with no "10 for".
// ios/Tests/CoreTests.swift FlippMultiBuyTermsTests holds the same values.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.BASKET_DATA_DIR ||= path.join(os.tmpdir(), 'cartworth-qa-multibuy-terms');
const { toDeal } = await import('../src/adapters/flipp.js');
const { importPublic } = await import('./helpers/browser-modules.js');
const { termsPending } = await importPublic('js/views/sales.js');

const NAME = 'Chobani Greek, Less Sugar, No Sugar or Flip Yogurt';
const item = (detail) => ({ id: 1045842565, flyerId: 7001, name: NAME, brand: '', price: 10, image: null, validFrom: null, validTo: null, detail });
const itemDetail = (extra = {}) => ({ description: '4.5-5.3 oz', pre: '10 for', priceText: null, post: null, story: null, original: 18.9, current: 10, disclaimer: null, dollarsOff: null, percentOff: null, ...extra });

test('DEFECT: a bundle regular price is read per unit, so "10 for $10.00" with original 18.90 is 47% off, not 95%', () => {
  const d = toDeal(item(itemDetail()), 'freshthyme', 'Fresh Thyme');
  assert.equal(d.priceText, '10 for $10.00');
  assert.equal(d.qty, 10);
  assert.equal(d.each, 1);
  assert.equal(d.regular, 1.89);
  assert.equal(d.pctOff, 47);
});

test('DEFECT: the ad\'s "save up to $8.90" agrees with the percent off', () => {
  const d = toDeal(item(itemDetail({ story: 'SAVE UP TO $8.90' })), 'freshthyme', 'Fresh Thyme');
  assert.equal(d.pctOff, 47);
  assert.equal(Math.round((d.regular - d.each) * d.qty * 100) / 100, 8.9);
  assert.equal(d.pctOff, Math.round((8.9 / 18.9) * 100));
});

test('DEFECT: a bare "10 for" is ten for $10.00, not ten for $1.00', () => {
  const d = toDeal(item(itemDetail()), 'freshthyme', 'Fresh Thyme');
  assert.equal(d.deal.kind, 'multi');
  assert.equal(d.deal.total, 10);
  assert.equal(d.deal.each, 1);
});

test('DEFECT: a search hit with no pre_price_text is not shown as one item\'s price', () => {
  const searchDetail = { pre: null, post: null, story: null, original: 18.9, current: 10, description: null, partial: true };
  const d = toDeal(item(searchDetail), 'freshthyme', 'Fresh Thyme');
  assert.equal(d.enriched, false);
  assert.equal(termsPending({ ...d, source: 'flipp' }), true);
});

test('control: a unit regular price on a multi-buy is left alone ("2 for $5.00", reg $3.49)', () => {
  const d = toDeal(item(itemDetail({ pre: '2 for', current: 5, original: 3.49 })), 'jewel', 'Jewel-Osco');
  assert.equal(d.regular, 3.49);
  assert.equal(d.each, 2.5);
  assert.equal(d.pctOff, 28);
});

test('control: a single-item sale keeps its regular price and percent off', () => {
  const d = toDeal(item(itemDetail({ pre: null, current: 3, original: 4 })), 'jewel', 'Jewel-Osco');
  assert.equal(d.qty, 1);
  assert.equal(d.regular, 4);
  assert.equal(d.pctOff, 25);
});

test('control: a search hit that carries its multiplier counts as enriched', () => {
  const d = toDeal(item({ pre: '10 for', post: null, story: null, original: 18.9, current: 10, description: null, partial: false }), 'freshthyme', 'Fresh Thyme');
  assert.equal(d.enriched, true);
  assert.equal(d.priceText, '10 for $10.00');
});
