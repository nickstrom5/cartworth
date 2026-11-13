// QA 13 Nov 2026, "stuffing" in Chicago (60618): the "In this week's ads" strip showed ALDI's
// "CHEF'S CUPBOARD Assorted Stuffing", $0.79, twice. Flipp's search returned two page items from
// the same flyer (8221120): the circular printed the deal on two pages. The Deals tab already kept
// one (dedupeDeals); the strip did not. Most searches that day had one such pair (turkey,
// cranberry sauce, butter). The strip also now leaves out next week's circular, as the iPhone does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adsFromHits } from '../src/search.js';

const NOW = Date.parse('2026-11-13T18:00:00Z');
const hit = (id, over = {}) => ({
  id, flyerId: 8221120, merchant: 'ALDI', name: "CHEF'S CUPBOARD Assorted Stuffing", brand: '', price: 0.79,
  image: null, validFrom: '2026-11-11T05:00:00', validTo: '2026-11-18T04:59:59',
  detail: { pre: null, post: null, story: null, original: null, current: 0.79, description: null, partial: true },
  ...over,
});
const ALL = new Set(['aldi', 'jewel', 'marianos']);

test('DEFECT: a deal printed on two pages of one circular is one card in the ads strip', () => {
  const ads = adsFromHits('stuffing', [hit(1052601127), hit(1052600563)], ALL, NOW);
  assert.equal(ads.length, 1);
  assert.equal(ads[0].name, "CHEF'S CUPBOARD Assorted Stuffing");
});

test('control: the same item at another price or another store stays a card of its own', () => {
  const ads = adsFromHits('stuffing', [
    hit(1), hit(2, { price: 0.99, detail: { ...hit(2).detail, current: 0.99 } }),
    hit(3, { merchant: "Mariano's" }),
  ], ALL, NOW);
  assert.equal(ads.length, 3);
});

test("DEFECT: next week's circular is not in this week's ads strip", () => {
  const ads = adsFromHits('stuffing', [hit(1, { validFrom: '2026-11-18T05:00:00', validTo: '2026-11-25T04:59:59' })], ALL, NOW);
  assert.deepEqual(ads, []);
});

test('control: expired, irrelevant and other-store hits are still left out; the best match comes first', () => {
  const ads = adsFromHits('stuffing', [
    hit(1, { validTo: '2026-11-10T04:59:59' }),
    hit(2, { name: 'Clancy’s Pretzels' }),
    hit(3, { merchant: 'Walgreens' }),
    hit(4, { name: 'Pepperidge Farm Herb Seasoned Stuffing Mix' }),
    hit(5, { name: 'Stuffing' }),
  ], ALL, NOW);
  assert.deepEqual(ads.map((d) => d.name).sort(), ['Pepperidge Farm Herb Seasoned Stuffing Mix', 'Stuffing']);
  assert.ok(ads[0].score >= ads[1].score, 'sorted by relevance');
});
