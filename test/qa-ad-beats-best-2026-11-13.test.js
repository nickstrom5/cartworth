// QA 13 Nov 2026, "whole turkey" in Chicago (60618): Cartworth's best price was 99¢/lb (Mariano's on
// Instacart, ALDI's shelf), while Mariano's weekly ad had Jennie-O frozen turkey at 58¢/lb with card
// (limit 5) and Butterball at 88¢/lb with a digital coupon. Ad prices only ever showed in the ads
// strip, as "$0.58" with no unit and no condition. Now:
//  - the strip reads the fine print of its best matches (src/search.js searchAds), so a per-pound
//    ad is known to be per pound;
//  - "With Card" / "WITH DIGITAL COUPON" in the item's own price text count as conditions (flipp.js);
//  - an ad per-pound price below every listing is said beside the best price, with its conditions
//    (adBeatsBest, adTerms); it is not ranked with the listings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adBeatsBest, adTerms } from '../shared/compare.js';
import { toDeal } from '../src/adapters/flipp.js';
import { relevance, RELEVANT } from '../shared/match.js';

const NOW = Date.parse('2026-11-13T18:00:00Z');
const BEST = { perBase: 0.99 / 16, dim: 'weight' };
const raw = (id, name, detail) => ({ id, flyerId: 8214817, name, brand: '', price: detail.current, validFrom: '2026-11-11T00:00:00', validTo: '2026-11-17T23:59:59', detail });
const jennie = toDeal(raw(1051467736, 'Jennie-O Turkey', { description: 'Frozen, Grade A,', pre: null, priceText: 'lb With Card', post: null, story: null, original: null, current: 0.58, disclaimer: 'Limit 5', dollarsOff: null, percentOff: null }), 'marianos', "Mariano's", NOW);
const butterball = toDeal(raw(1051468106, 'Butterball Turkey', { description: 'Frozen, Grade A, 10 lb and up', pre: null, priceText: 'lb WITH DIGITAL COUPON', post: null, story: null, original: null, current: 0.88, disclaimer: 'Price without digital coupon is up to $1.28 lb with card.', dollarsOff: null, percentOff: null }), 'marianos', "Mariano's", NOW);

test('DEFECT: an ad price whose condition is in its price text says so', () => {
  assert.equal(jennie.perLb, true);
  assert.equal(jennie.needsCard, true, '"lb With Card"');
  assert.equal(butterball.needsCoupon, true, '"lb WITH DIGITAL COUPON"');
  assert.deepEqual(adTerms(jennie), ['with card', 'limit 5']);
});

test('DEFECT: a per-pound ad price below every listing is the one to mention, cheapest first', () => {
  const a = adBeatsBest([{ ...butterball, score: 0.9 }, { ...jennie, score: 0.9 }], BEST);
  assert.equal(a.deal.name, 'Jennie-O Turkey');
  assert.equal(Math.round(a.perBase * 16 * 100) / 100, 0.58);
});

test('control: no callout for an ad that is not cheaper, not per pound, not a match, or next week', () => {
  assert.equal(adBeatsBest([{ ...jennie, score: 0.9, each: 1.29 }], BEST), null);
  assert.equal(adBeatsBest([{ ...jennie, score: 0.9, perLb: false }], BEST), null, '"$8.99" says nothing about weight');
  assert.equal(adBeatsBest([{ ...jennie, score: 0.45 }], BEST), null, 'strip-only matches (0.4-0.55) are not the product');
  assert.equal(adBeatsBest([{ ...jennie, score: 0.9, week: 'next' }], BEST), null);
  assert.equal(adBeatsBest([{ ...jennie, score: 0.9 }], { perBase: 0.03, dim: 'count' }), null, 'only weight compares to per lb');
});

test('DEFECT: a turkey sold as a bird answers "whole turkey" (Mariano\'s ad names no "whole")', () => {
  assert.ok(relevance('whole turkey', { name: 'Jennie-O Turkey Frozen, Grade A,' }) >= RELEVANT);
  assert.ok(relevance('whole turkey', { name: 'Butterball Turkey Frozen, Grade A, 10 lb and up' }) >= RELEVANT);
  assert.ok(relevance('whole turkey', { name: 'Fresh Hen Turkey' }) >= RELEVANT);
});

test('control: ground turkey, a breast, burgers and lunchmeat are still not a whole turkey', () => {
  for (const name of ['Jennie-O Ground Turkey Frozen', 'Frozen Turkey Breast', 'Butterball Fresh Turkey Burgers', 'Hillshire Farm Oven Roasted Turkey Lunchmeat', 'Jennie-O Turkey']) {
    assert.ok(relevance('whole turkey', { name }) < RELEVANT, name);
  }
});
