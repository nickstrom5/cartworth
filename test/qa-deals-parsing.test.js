// QA: adversarial tests for shared/deals.js parseDeal and the "$X OFF (n)"
// coupon math in src/adapters/flipp.js toDeal.
//
// Tests labelled "DEFECT" assert correct behavior and currently FAIL.
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-pricing-logic node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { parseDeal, dealLabel } from '../shared/deals.js';

// flipp.js pulls in src/db.js, which creates a SQLite file under BASKET_DATA_DIR.
// Pin it to a scratch dir BEFORE importing so a bare `npm test` can never touch
// the user's real ./data directory.
process.env.BASKET_DATA_DIR ||= path.join(os.tmpdir(), 'cartworth-qa-pricing-logic');
const { toDeal } = await import('../src/adapters/flipp.js');

// An item shaped exactly as flipp searchItems() returns it: detail carries a
// sale story but NO dollarsOff, which is what selects the buggy fallback below.
const searchItem = (name, story, current) => ({
  id: `qa-${name}-${story}`, flyerId: 'f1', name, brand: '',
  price: current, image: null, validFrom: null, validTo: null,
  detail: { pre: null, post: null, story, original: null, current, description: null },
  externalCategory: 'Dairy',
});

// ---------------------------------------------------------------------------
// DEFECT 10: parseDeal drops a deal whose ONLY content is "must buy N".
// The return guard is `out.kind || out.needsCoupon || out.needsCard || out.limit`
// — mustBuy is set but not listed, so the whole object is thrown away and the
// shopper is shown a single-unit price with no must-buy qualifier.
// ---------------------------------------------------------------------------
test('DEFECT 10a: "must buy 2 or pay $3.49 ea" must not be discarded', () => {
  const d = parseDeal('must buy 2 or pay $3.49 ea', 2.99);
  assert.ok(d, 'parseDeal returned null — the must-buy requirement is silently lost');
  assert.equal(d.mustBuy, 2);
});

test('DEFECT 10b: "MUST BUY 4" alone must not be discarded', () => {
  const d = parseDeal('MUST BUY 4', 3.99);
  assert.ok(d, 'parseDeal returned null');
  assert.equal(d.mustBuy, 4);
});

// ---------------------------------------------------------------------------
// DEFECT 11: "when you buy N" is not recognized at all, so a price that is only
// valid at quantity N is shown as an unconditional shelf price.
// ---------------------------------------------------------------------------
test('DEFECT 11: "$3.99 ea when you buy 4" must carry the buy-4 requirement', () => {
  const d = parseDeal('$3.99 ea when you buy 4', 3.99);
  assert.ok(d, 'parseDeal returned null — "when you buy 4" is unparsed');
  assert.equal(d.mustBuy ?? d.qty, 4);
});

// ---------------------------------------------------------------------------
// DEFECT 12: "$1.00 off 2" / "$X OFF" without a slash-or-"for" is unparsed.
// ---------------------------------------------------------------------------
test('DEFECT 12: "$1.00 off 2" must parse as a $1.00-off-when-you-buy-2 coupon', () => {
  const d = parseDeal('$1.00 off 2', 3.49);
  assert.ok(d, 'parseDeal returned null');
  assert.equal(d.save, 1);
});

// ---------------------------------------------------------------------------
// DEFECT 13 (blocker): the "$X OFF (n)" coupon fallback in flipp.js toDeal
// strips every non-digit from the sale story, which GLUES the must-buy count
// onto the discount. "75¢ OFF (1)" becomes a $7.51 discount; "$2 OFF (2)"
// becomes $22 off. Reached whenever detail.dollarsOff is absent, which is
// always true for items coming from flipp searchItems().
//
// This replicates flipp.js lines 150-157 exactly.
// ---------------------------------------------------------------------------
test('DEFECT 13: "$X OFF (n)" coupon math glues the buy-count onto the discount', () => {
  const expected = [
    ['75¢ OFF (1)', 0.75],
    ['50¢ OFF (2)', 0.5],
    ['$2 OFF (2)', 2],
    ['$1 OFF (3)', 1],
    ['$3 OFF (4)', 3],
    ['$1.00 OFF (2)', 1],
    ['$1.50 OFF (1)', 1.5],
  ];
  const wrong = [];
  for (const [story, want] of expected) {
    const d = toDeal(searchItem('Oscar Mayer Bacon', story, want), 'jewel', 'Jewel-Osco');
    const got = d.deal?.save;
    if (!(Math.abs(got - want) <= 0.005)) wrong.push(`"${story}" -> save $${got}, shown as ${JSON.stringify(d.priceText)} (expected $${want})`);
  }
  assert.deepEqual(wrong, [], `coupon discounts parsed wrong:\n  ${wrong.join('\n  ')}`);
});

test('DEFECT 13b: toDeal renders the inflated discount straight onto the deal card', () => {
  const d = toDeal(searchItem('Kraft Shredded Cheese', '$2 OFF (2)', 2), 'jewel', 'Jewel-Osco');
  assert.equal(d.priceText, '$2 off when you buy 2', `deal card reads ${JSON.stringify(d.priceText)}`);
});

// ---------------------------------------------------------------------------
// DEFECT 10/11 again, this time through the real toDeal: the "Must buy N"
// warning badge (public/js/views/sales.js:221) never renders because
// toDeal sets `mustBuy: deal?.mustBuy || null` and parseDeal returned null.
// ---------------------------------------------------------------------------
test('DEFECT 10c: toDeal drops the must-buy requirement, so no warning badge renders', () => {
  const missing = [];
  for (const [story, want] of [['MUST BUY 2', 2], ['must buy 2 or pay $3.49 ea', 2], ['WHEN YOU BUY 4', 4], ['$3.99 EA WHEN YOU BUY 4', 4]]) {
    const d = toDeal(searchItem('Pepsi 12 Pack', story, 5.99), 'jewel', 'Jewel-Osco');
    if (d.mustBuy !== want) missing.push(`"${story}" -> mustBuy=${d.mustBuy} (expected ${want}), price shown as ${d.priceText} with no qualifier`);
  }
  assert.deepEqual(missing, [], `must-buy requirements lost:\n  ${missing.join('\n  ')}`);
});

test('control: toDeal does keep "LIMIT n"', () => {
  const d = toDeal(searchItem('Pepsi 12 Pack', 'LIMIT 2', 5.99), 'jewel', 'Jewel-Osco');
  assert.equal(d.limit, 2);
});

// ---------------------------------------------------------------------------
// DEFECT 14 (LATENT — no consumer reads parseDeal().each today; the UI reads
// toDeal's own `each` = price/qty. Verified by grepping public/ and server.js:
// only deal.kind, deal.pct, deal.limit and deal.mustBuy are consumed).
// A "save $X" larger than the price silently floors the effective price at
// exactly $0.00 rather than rejecting the deal as mis-parsed. If this field is
// ever wired into unit pricing, a $0.00 item wins every comparison it enters.
// ---------------------------------------------------------------------------
// Resolution note: the original test required a positive `each`. We chose the stricter and more
// honest contract instead — when the ad text and the listed price disagree (a "Save $5.00" story
// attached to a $1.99 price almost always describes a different size), we publish NO sale price
// rather than inventing one. `each` is therefore either a real positive price or undefined, and
// never 0. The defect guarded against is unchanged: a $0.00 would win every comparison it entered.
const eachIsSane = (d, label) => {
  assert.ok(d, `${label}: no deal parsed`);
  assert.ok(d.each === undefined || d.each > 0, `${label}: each = ${d.each}`);
  assert.notEqual(d.each, 0, `${label}: claims the item is free`);
};

test('DEFECT 14: a save larger than the price must not yield a $0.00 each', () => {
  for (const [txt, base] of [['Save $2.00', 1.99], ['Save $5.00', 1.99], ['save $3.49', 3.49]]) {
    eachIsSane(parseDeal(txt, base), `"${txt}" on $${base}`);
  }
  // A save that genuinely fits still produces a price.
  assert.equal(parseDeal('Save $1.00', 3.49).each, 2.49);
});

test('DEFECT 14b: "100% off" must not claim the item is free', () => {
  eachIsSane(parseDeal('100% off', 3.49), '100% off');
  assert.equal(parseDeal('25% off', 4.00).each, 3);
});

test('DEFECT 14c: "2 for $0" must not become a $0.00 each', () => {
  const d = parseDeal('2 for $0', null);
  assert.ok(d === null || d.each === undefined || d.each > 0, `each = ${d && d.each}`);
  assert.equal(parseDeal('2 for $5', null).each, 2.5);
});

// ---------------------------------------------------------------------------
// Correctly-handled cases — regression guards.
// ---------------------------------------------------------------------------
test('control: multi-buy "N for $X" / "N/$X"', () => {
  assert.deepEqual(pick(parseDeal('2 for $5', 3.49)), { kind: 'multi', qty: 2, total: 5, each: 2.5 });
  assert.deepEqual(pick(parseDeal('2/$5', 3.49)), { kind: 'multi', qty: 2, total: 5, each: 2.5 });
  assert.deepEqual(pick(parseDeal('10/$10')), { kind: 'multi', qty: 10, total: 10, each: 1 });
  assert.equal(dealLabel(parseDeal('3 for $12')), '3 for $12');
});

test('control: BOGO and buy-X-get-Y', () => {
  assert.equal(parseDeal('BOGO', 4.99).kind, 'bogo');
  assert.equal(parseDeal('Buy One Get One Free', 4.99).each, 2.5);
  assert.equal(parseDeal('B1G1', 4.99).pct, 50);
  const b2g1 = parseDeal('Buy 2 Get 1 Free', 4.99);
  assert.equal(b2g1.kind, 'bxgy');
  assert.equal(b2g1.qty, 3);
  assert.equal(parseDeal('Buy 2, Get 2 Free', 4.99).pct, 50);
  assert.equal(parseDeal('buy 2 get 1 50% off', 4.99).qty, 3);
});

test('control: limits, coupons and card prices are flagged', () => {
  assert.equal(parseDeal('limit 2', 3.49).limit, 2);
  assert.equal(parseDeal('2 for $5, limit 2', 3.49).limit, 2);
  assert.equal(parseDeal('with digital coupon', 3.49).needsCoupon, true);
  assert.equal(parseDeal('for U', 3.49).needsCoupon, true);
  assert.equal(parseDeal('with card', 3.49).needsCard, true);
  const combo = parseDeal('3 for $12 with digital coupon, limit 1', 4.99);
  assert.equal(combo.qty, 3);
  assert.equal(combo.needsCoupon, true);
  assert.equal(combo.limit, 1);
});

test('control: "save $X" and "% off" do the arithmetic right', () => {
  assert.equal(parseDeal('Save $1.00', 3.49).each, 2.49);
  assert.equal(parseDeal('Save $1.00 lb.', 4.99).per, 'lb');
  assert.equal(parseDeal('25% off', 4.0).each, 3.0);
  assert.equal(parseDeal('20 % off', 4.0).each, 3.2);
});

test('control: no deal text never throws and never returns a bogus kind', () => {
  for (const t of [null, undefined, '', '   ', 'Fresh Produce', '1/$5', '0/$5', '$5 for 2']) {
    const d = parseDeal(t, 3.49);
    assert.ok(d == null || d.kind !== 'multi', `${JSON.stringify(t)} -> ${JSON.stringify(d)}`);
  }
});

test('control: no parsed deal ever produces NaN or Infinity', () => {
  const texts = ['2 for $5', 'BOGO', 'Buy 2 Get 1 Free', '25% off', 'Save $1.00', '2 for $0', '100% off', 'Save $5.00'];
  for (const t of texts) {
    for (const base of [null, 0, 1.99, 4.99, NaN]) {
      const d = parseDeal(t, base);
      if (!d) continue;
      for (const k of ['each', 'total', 'save', 'pct', 'qty']) {
        if (d[k] == null) continue;
        assert.ok(Number.isFinite(d[k]), `parseDeal(${JSON.stringify(t)}, ${base}).${k} = ${d[k]}`);
      }
    }
  }
});

function pick(d) {
  return { kind: d.kind, qty: d.qty, total: d.total, each: d.each };
}
