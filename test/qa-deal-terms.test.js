// QA: a weekly-ad price is never shown as one item's price before its terms are known.
//
// Found by the Apple-device review of the iPhone app, and true of the website too: Flipp's flyer
// list carries a deal's number without its qualifier, so "2/$7" arrives as $7.00 and "$3.99/lb"
// as $3.99. The terms come later, one item at a time (the "Reading deal details… 165/1748" line).
// In the Christmas run's Chicago data, 58 of 428 enriched deals (14%) were multi-buys.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importPublic } from './helpers/browser-modules.js';

const { DealCard, termsPending } = await importPublic('js/views/sales.js');
const text = (v) => (v == null || v === false ? '' : typeof v === 'string' || typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(text).join('') : text(v.props?.children));

const deal = (extra = {}) => ({ id: 'flipp-1', source: 'flipp', flippId: 1, storeId: 'marianos', name: "Kellogg's Cereal", price: 7, qty: 1, each: 7, priceText: '$7.00', enriched: false, validTo: null, ...extra });

test('DEFECT: an un-enriched Flipp price says its terms are still loading', () => {
  assert.equal(termsPending(deal()), true);
  assert.match(text(DealCard({ d: deal() })), /checking ad terms/);
});

test('control: an enriched multi-buy, a Whole Foods sale and a price-less story are not marked', () => {
  const enriched = deal({ enriched: true, qty: 2, each: 3.5, priceText: '2 for $7.00' });
  assert.equal(termsPending(enriched), false);
  assert.doesNotMatch(text(DealCard({ d: enriched })), /checking ad terms/);
  assert.equal(termsPending(deal({ source: 'wholefoods' })), false);
  assert.equal(termsPending(deal({ price: null, priceText: 'BOGO' })), false);
});

import { parseDeal, offerBadge } from '../shared/deals.js';

test('DEFECT: a buy-some-get-some card shows the offer, not "50% off" / "33% off"', () => {
  const bogo = deal({ enriched: true, pctOff: 50, deal: parseDeal('Buy 1 Get 1 Free', 4.99), priceText: '$4.99' });
  const t = text(DealCard({ d: bogo }));
  assert.match(t, /Buy 1 get 1 free/);
  assert.doesNotMatch(t, /50% off/);
  const b2g1 = deal({ enriched: true, pctOff: 33, deal: parseDeal('Buy 2, Get 1 Free', 3.49), priceText: '$3.49' });
  assert.match(text(DealCard({ d: b2g1 })), /Buy 2 get 1 free/);
  assert.doesNotMatch(text(DealCard({ d: b2g1 })), /33% off/);
});

test('control: a plain percentage deal keeps its "% off" badge', () => {
  assert.equal(offerBadge(parseDeal('30% off', 5)), null);
  assert.match(text(DealCard({ d: deal({ enriched: true, pctOff: 30, deal: parseDeal('30% off', 5) }) })), /30% off/);
  assert.equal(offerBadge(parseDeal('Buy 1 Get 1 50% Off', 4)), 'Buy 1 get 1 deal');
});
