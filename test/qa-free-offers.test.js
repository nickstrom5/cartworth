// Free offers: detection must come from what the AD says, never from arithmetic.
//
// Two things make this harder than it looks.
//
// 1. "free" in a product NAME is almost always an ingredient claim. A live sample of Chicagoland
//    circulars produced gluten free pasta, fragrance free detergent, bleach free wipes, antibiotic
//    free chicken and a Walmart clothing line called Free Assembly, and not one genuine freebie.
//    Matching /free/ on names would fill a Freebies section with gluten-free pasta.
// 2. A computed price of $0.00 is never evidence of a freebie. It means the ad text and the listed
//    price describe different things, which is why parseDeal refuses to emit one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeal, freeOffer } from '../shared/deals.js';

const free = (text, base = null) => freeOffer(parseDeal(text, base), text);

test('an ad that states a free item is detected, with what it requires', () => {
  assert.equal(free('BUY 1 GET 1 FREE', 3.99).kind, 'bogo');
  assert.equal(free('Buy 2 Get 1 Free', 4.49).kind, 'bxgy');
  assert.equal(free('FREE').kind, 'outright');

  // Loyalty and digital-coupon freebies must say what you have to do first.
  const j4u = free('Free with your Just 4 U digital coupon');
  assert.equal(j4u.kind, 'outright');
  assert.equal(j4u.needs, 'coupon');

  const card = free('FREE with your store card');
  assert.equal(card.needs, 'card');
  assert.match(card.label, /card/i);
});

test('"free" as a product attribute is never a freebie', () => {
  for (const t of [
    'gluten free pasta', 'Bleach Free Wipes', "Free Assembly Women's Tee",
    'fragrance-free detergent', 'antibiotic free chicken', 'sugar free gum',
    'lactose free milk', 'cage free eggs', 'nut free granola', 'free range chicken',
    'BPA free bottles', 'free shipping on orders over $35',
  ]) {
    assert.equal(free(t), null, `"${t}" was treated as a free offer`);
  }
});

test('a coupon is free only when it MATCHES the price, not when it exceeds it', () => {
  // The reliable circular signal is a discount equal to the price (Flipp sets dollars_off ==
  // current_price for these).
  assert.equal(free('$3 OFF', 3.0).kind, 'coupon');
  assert.equal(free('$2.99 OFF', 2.99).kind, 'coupon');

  // A partial discount is obviously not free.
  assert.equal(free('$5 OFF', 15.0), null, 'a $5 coupon on a $15 item is not free');

  // And a discount that WILDLY exceeds the price is a mismatch, not a bonanza: the ad text and
  // the listed price are describing different things, usually different sizes. Same reasoning
  // that makes parseDeal refuse to compute a sale price there.
  assert.equal(free('$5 OFF', 3.0), null, 'treated an ad/price mismatch as a freebie');
});

test('a computed zero is never reported as free', () => {
  // "Save $5.00" on a $1.99 item: the ad and the price disagree, so there is no sale price at all
  // and certainly no freebie.
  const d = parseDeal('Save $5.00', 1.99);
  assert.equal(d.each, undefined, 'invented a sale price');
  assert.equal(freeOffer(d, ''), null, 'inferred a freebie from arithmetic');
  assert.equal(free('100% off', 3.49), null);
});

test('"N FOR" carries the total in the price field, not the text', () => {
  // Verified against cached Flipp details: pre "2 FOR" with current 5 means two for $5.
  assert.deepEqual(
    (({ kind, qty, total, each }) => ({ kind, qty, total, each }))(parseDeal('2 FOR', 5)),
    { kind: 'multi', qty: 2, total: 5, each: 2.5 },
  );
  assert.equal(parseDeal('10 FOR', 6).each, 0.6);
  assert.equal(parseDeal('4 for', 10).each, 2.5);
  // Without a price there is nothing to divide, so claim nothing.
  assert.equal(parseDeal('2 FOR', null), null);
  // "1 FOR" is not a multi-buy.
  assert.equal(parseDeal('1 FOR', 2), null);
});

test('a bare dollar-off parses', () => {
  const d = parseDeal('$5 OFF', 15);
  assert.equal(d.kind, 'save');
  assert.equal(d.save, 5);
  assert.equal(d.each, 10);
});

// ---------------------------------------------------------------------------
// False positives found in LIVE Walgreens and Fresh Thyme ads, not by inspection.
// "Buy 1 get 1 50% off" parses as a buy-x-get-y just like a real BOGO does, and
// every one of them was being labelled free. Store-reward promos were too.
// ---------------------------------------------------------------------------
test('live: a percentage BOGO is not a freebie', () => {
  assert.equal(free('Buy 1 get 1 50% off* with myWalgreens', 3.99), null);
  assert.equal(free('BUY 1 GET 1 50% off select items and sizes', 9.99), null);
  // ...but a real one still is.
  assert.equal(free('Buy 1 get 1 FREE*', 3.99).kind, 'bogo');
  assert.equal(free('Buy 2 get 1 FREE*', 5).label, 'Buy 2, get 1 free');
});

test('live: a store-rewards promo is not a freebie', () => {
  assert.equal(free('Earn $5 In-store rewards when you buy 3', 4.99), null);
});

test('the free label says what the shopper must do first', () => {
  assert.equal(free('Buy 1 get 1 FREE*', 3.99).needs, 'purchase');
  assert.equal(free('Free with your Just 4 U digital coupon').needs, 'coupon');
  assert.equal(free('FREE with your store card').needs, 'card');
});
