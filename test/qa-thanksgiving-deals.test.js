// QA: Thanksgiving pricing, weekly ads and the occasion card (3 Nov 2026). The report is
// ops/coverage/thanksgiving-deals-2026-11-03.md; the numbering matches its bugs. The same cases run
// on the phone in ios/Tests/ThanksgivingPricingTests.swift (ThanksgivingDealsTests).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { wholeFoodsSale, parseDeal, freeOffer } from '../shared/deals.js';
import { wholeTurkey, TYPICAL_TURKEY_LB } from '../shared/units.js';
import { bestPerStore, excludedCheaper, savingsClaim } from '../shared/compare.js';
import { featured, whenText, DAY_AFTER, occasions } from '../shared/seasonal.js';
import { makeProduct } from '../src/normalize.js';
import { toDeal } from '../src/adapters/flipp.js';

const item = (storeId, name, sizeText, price, extra = {}) =>
  makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price, ...extra });

// ---------------------------------------------------------------------------
// Bug 1: "$1 off", Reg. $16.99 was a $1.00 sale price and "94% off" (Pizzolato Spumante, Whole
// Foods Lakeview, live flyer).
// ---------------------------------------------------------------------------
test('BUG 1: a dollar-off Whole Foods sale is the regular price less the amount, and its percent', () => {
  assert.deepEqual(wholeFoodsSale('$1 off', '$16.99'), { price: 15.99, qty: 1, each: 15.99, regular: 16.99, pctOff: 6 });
  assert.equal(wholeFoodsSale('$3 off', '$11.99').pctOff, 25);
  assert.equal(wholeFoodsSale('50¢ off', '$4.99').price, 4.49);
  // No fixed regular price: no price and no percent, rather than a guess.
  assert.deepEqual(wholeFoodsSale('$1 off', '$9.99 to $19.99'), { price: null, qty: 1, each: null, regular: null, pctOff: null });
  assert.equal(wholeFoodsSale('$1 off', 'Regular prices vary').pctOff, null);
});

test('BUG 2: "4 for $5.56" is four for that total, not one item at $5.56', () => {
  assert.deepEqual(wholeFoodsSale('2 for $6.67', '$3.49'), { price: 6.67, qty: 2, each: 3.34, regular: 3.49, pctOff: 4 });
  const avocados = wholeFoodsSale('4 for $5.56', '$1.09');
  assert.equal(avocados.qty, 4);
  assert.equal(avocados.each, 1.39);
  assert.equal(avocados.pctOff, null, 'dearer than the regular price is not a discount');
});

test('control: the other Whole Foods shapes are unchanged', () => {
  assert.deepEqual(wholeFoodsSale('$4.43 ea', '$5.49'), { price: 4.43, qty: 1, each: 4.43, regular: 5.49, pctOff: 19 });
  assert.deepEqual(wholeFoodsSale('$3.32/lb', '$3.99/lb'), { price: 3.32, qty: 1, each: 3.32, regular: 3.99, pctOff: 17 });
  assert.deepEqual(wholeFoodsSale('22% off', '$8.49 to $36.99'), { price: null, qty: 1, each: null, regular: null, pctOff: 22 });
  assert.equal(wholeFoodsSale('16% off', 'Regular prices vary').pctOff, 16);
  assert.equal(wholeFoodsSale('$6.66 ea', 'Regular prices vary').price, 6.66);
  assert.equal(wholeFoodsSale('', '$7.99 to $14.99').price, null);
});

test('BUG 1: the deals service uses it (no first-dollar read of the sale line left)', () => {
  const src = fs.readFileSync(new URL('../src/deals.js', import.meta.url), 'utf8');
  assert.match(src, /wholeFoodsSale\(p\.priceText, p\.regularText\)/);
  assert.doesNotMatch(src, /money\(p\.priceText\)/);
  const swift = fs.readFileSync(new URL('../ios/App/Services/DealsModel.swift', import.meta.url), 'utf8');
  assert.match(swift, /WholeFoodsSale\.parse\(p\.priceText, p\.regularText\)/);
  assert.doesNotMatch(swift, /ProductFactory\.money\(p\.priceText\)/);
});

// ---------------------------------------------------------------------------
// Bug 3: a whole turkey sold per bird with no weight had no price per pound and dropped out of a
// turkey search, which compares by the pound.
// ---------------------------------------------------------------------------
const market = () => ({
  jewel: [item('jewel', 'Signature Farms Frozen Whole Turkey', 'per lb', 0.79, { soldBy: 'lb', category: 'Whole Turkey' })],
  aldi: [item('aldi', 'Butterball Frozen Whole Turkey', 'per lb', 1.19, { soldBy: 'lb', category: 'Whole Turkey' })],
  target: [item('target', 'Good & Gather Frozen Whole Turkey', '1 ea', 12.99, { category: 'Whole Turkey' })],
  fry: [item('fry', 'Kroger Frozen Whole Turkey', '14 lb', 9.66, { category: 'Whole Turkey' })],
});

test('BUG 3: a per-bird turkey gets an estimated price per pound and is ranked', () => {
  const r = market();
  const t = r.target[0];
  assert.ok(t.unit.weight?.est, 'estimated, never exact');
  assert.ok(Math.abs(t.unit.weight.perBase * 16 - 12.99 / TYPICAL_TURKEY_LB) < 1e-9);
  for (const q of ['turkey', 'whole turkey', 'frozen turkey']) {
    const best = bestPerStore(q, r);
    assert.equal(best.dim, 'weight', q);
    assert.ok(best.stores.target, `${q}: the per-bird turkey is in the comparison`);
    assert.deepEqual(Object.keys(excludedCheaper(q, r, best)), [], `${q}: nothing left out`);
  }
});

test('BUG 3: a per-pound bird gets an estimated price per bird, labelled as one', () => {
  const [p] = market().jewel;
  assert.equal(p.estBird, 11.06);
  assert.equal(p.estPkg, null, 'never a register price (excludedCheaper reads estPkg)');
  const own = item('x', 'Butterball Whole Turkey', 'per lb', 1.49, { soldBy: 'lb', estPkg: 20.11 });
  assert.equal(own.estPkg, 20.11, "the retailer's own estimate wins");
  assert.equal(own.estBird, null);
  const view = fs.readFileSync(new URL('../public/js/views/compare.js', import.meta.url), 'utf8');
  assert.match(view, /lb bird \(est\.\)/);
});

test('BUG 3: an estimate never gives an exact saving', () => {
  const best = bestPerStore('whole turkey', {
    target: [item('target', 'Good & Gather Frozen Whole Turkey', '1 ea', 9.99, { category: 'Whole Turkey' })],
    aldi: [item('aldi', 'Butterball Frozen Whole Turkey', 'per lb', 1.19, { soldBy: 'lb', category: 'Whole Turkey' })],
  });
  const [a, b] = ['target', 'aldi'].map((id) => ({ storeId: id, ...best.stores[id] }));
  const claim = savingsClaim(a, b);
  assert.notEqual(claim?.kind, 'exact');
});

test('control: only a whole bird at a believable per-bird price is estimated', () => {
  // A per-pound price under an "each" label stays unranked (Festival's $2.89 Butterball).
  assert.equal(item('festival', 'Butterball Frozen Turkey', '1 ea', 2.89, { category: 'Whole Turkey' }).unit.weight, undefined);
  for (const name of ['Jennie-O Turkey Breast Roast', 'Ground Turkey', 'Butterball Turkey Breast Whole', 'Oven Roasted Turkey Deli', 'Whole Paws Turkey Dog Food', 'Reynolds Turkey Size Oven Bags', 'Turkey Drumsticks', 'Boneless Whole Turkey Roast']) {
    assert.equal(wholeTurkey(name, 'Whole Turkey'), false, name);
  }
  for (const [name, cat] of [['Honeysuckle White Whole Frozen Young Turkey', ''], ['Jennie-O Natural Hen Turkey', ''], ['Fresh Turkeys', 'Whole Turkey'], ['Butterball Whole Smoked Turkey', '']]) {
    assert.equal(wholeTurkey(name, cat), true, name);
  }
  // A stated weight is used as given, not replaced by the typical one.
  const fry = item('fry', 'Kroger Frozen Whole Turkey', '14 lb', 9.66);
  assert.equal(fry.unit.weight.est, false);
  assert.equal(item('x', 'Jennie-O Frozen Whole Turkey 10-16 lbs', '1 each', 14.99).unit.weight.perBase, 14.99 / 160, 'a range keeps its low end');
});

// ---------------------------------------------------------------------------
// Bug 4: a spend threshold was read nowhere, so "$0.59/lb with $25 purchase" showed as a bare
// $0.59/lb; "LIMIT ONE" was not a limit.
// ---------------------------------------------------------------------------
test('BUG 4: loss-leader terms: spend threshold, limit in words, with card', () => {
  assert.equal(parseDeal('$0.59/lb with $25 purchase').minSpend, 25);
  assert.deepEqual(
    (({ limit, minSpend }) => ({ limit, minSpend }))(parseDeal('59¢ lb with additional $25 purchase, limit 1')),
    { limit: 1, minSpend: 25 },
  );
  const card = parseDeal('$0.49 lb. with card and $35 purchase. Limit 1.');
  assert.equal(card.needsCard, true);
  assert.equal(card.minSpend, 35);
  assert.equal(parseDeal('Limit one turkey with any $50 or more purchase').minSpend, 50);
  assert.equal(parseDeal('Free Turkey when you spend $100, limit 1').minSpend, 100);
  assert.equal(parseDeal('w/ $35 purch.').minSpend, 35);
  assert.equal(parseDeal('LIMIT ONE PER HOUSEHOLD').limit, 1);
  assert.equal(parseDeal('Limit 2 per household').limit, 2);
  // Not spend thresholds.
  assert.equal(parseDeal('Save $5 with $5 mail-in rebate')?.minSpend, undefined);
  assert.equal(parseDeal('Buy 2 and $5 off'), null);
  const sales = fs.readFileSync(new URL('../public/js/views/sales.js', import.meta.url), 'utf8');
  assert.match(sales, /With \$\$\{[^}]+\} purchase/);
});

test('BUG 4: a spend threshold in Flipp\'s post-price text reaches the deal (Food City, Atlanta)', () => {
  const raw = { id: 1, flyerId: 2, merchant: 'FoodCity', name: 'WAYS TO SAVE ON FROZEN BUTTERBALL TURKEY', price: 0.96,
    detail: { pre: 'Only', post: '*PER LB with an additional $50 purchase.', story: null, original: null, current: 0.96 } };
  const d = toDeal(raw, 'foodcity', 'FoodCity');
  assert.equal(d.priceText, '$0.96/lb');
  assert.equal(d.minSpend, 50);
});

test('control: multi-buys and dollar-off parse as before', () => {
  assert.deepEqual((({ kind, qty, each }) => ({ kind, qty, each }))(parseDeal('10 for $10')), { kind: 'multi', qty: 10, each: 1 });
  assert.deepEqual((({ kind, qty, each }) => ({ kind, qty, each }))(parseDeal('2/$5')), { kind: 'multi', qty: 2, each: 2.5 });
  assert.equal(parseDeal('10 for', 10).total, 10);
  assert.equal(parseDeal('5/$5 when you buy 5').mustBuy, 5);
  assert.equal(parseDeal('$1 off', 16.99).each, 15.99);
});

test('BUG 5: a points turkey is not free with nothing to buy', () => {
  const f = freeOffer(parseDeal('FREE turkey with 1,500 points'), 'FREE turkey with 1,500 points');
  assert.equal(f.noPurchase, false);
  assert.equal(f.needs, 'points');
  assert.equal(f.label, 'Free with rewards points');
  const spend = freeOffer(parseDeal('Free Turkey when you spend $100, limit 1'), 'Free Turkey when you spend $100, limit 1');
  assert.equal(spend.label, 'Free with a $100 purchase');
  assert.equal(spend.noPurchase, false);
});

// ---------------------------------------------------------------------------
// Bug 6: the Thanksgiving card disappeared at midnight, on Black Friday, when leftover birds are
// marked down. It now stays the day after with that line, like Halloween.
// ---------------------------------------------------------------------------
const tg = (now) => featured(now).find((o) => o.name === 'Thanksgiving');

test('BUG 6: Thanksgiving window: 5 Nov to 27 Nov 2026, the last day with the after line', () => {
  assert.equal(tg(new Date(2026, 10, 4, 23, 59)), undefined, 'not yet on Nov 4');
  assert.equal(whenText(tg(new Date(2026, 10, 5, 0, 1)).daysAway), 'in 21 days');
  assert.equal(whenText(tg(new Date(2026, 10, 21, 12)).daysAway), 'in 5 days', 'Friendsgiving Saturday');
  assert.equal(whenText(tg(new Date(2026, 10, 25, 23, 59)).daysAway), 'is tomorrow');
  const day = tg(new Date(2026, 10, 26, 12));
  assert.equal(whenText(day.daysAway), 'is today');
  assert.match(day.blurb, /under \$1\/lb/);
  for (const h of [0, 12, 23]) {
    const after = tg(new Date(2026, 10, 27, h, 30));
    assert.equal(after?.dayAfter, true, `Nov 27 ${h}:30`);
    assert.equal(whenText(after.daysAway), 'was yesterday');
    assert.equal(after.blurb, DAY_AFTER.thanksgiving);
  }
  assert.equal(tg(new Date(2026, 10, 28, 0, 5)), undefined, 'gone on Nov 28');
  assert.deepEqual(featured(new Date(2026, 10, 27, 12)).map((o) => o.name), ['Thanksgiving', 'Hanukkah']);
  const swift = fs.readFileSync(new URL('../ios/App/Services/Seasonal.swift', import.meta.url), 'utf8');
  assert.ok(swift.includes(`"thanksgiving": "${DAY_AFTER.thanksgiving}"`));
});

test('control: Canadian Thanksgiving (12 Oct 2026) shows nothing, and 2027 moves with the calendar', () => {
  for (let d = 5; d <= 14; d++) assert.ok(!featured(new Date(2026, 9, d, 12)).some((o) => /thanksgiving/i.test(o.name)), `Oct ${d}`);
  assert.equal(occasions(2027).find((o) => o.name === 'Thanksgiving').date.getDate(), 25);
  assert.equal(occasions(2028).find((o) => o.name === 'Thanksgiving').date.getDate(), 23);
});

test('control: the countdown is the same calendar count in every US time zone', () => {
  const script = `import('${new URL('../shared/seasonal.js', import.meta.url).href}').then(({ featured, whenText }) => {
    const at = (d, h, m) => featured(new Date(2026, 10, d, h, m)).filter((o) => o.name === 'Thanksgiving').map((o) => whenText(o.daysAway)).join('') || '-';
    console.log([at(4, 23, 59), at(5, 0, 1), at(25, 23, 59), at(26, 0, 1), at(27, 23, 59), at(28, 0, 1)].join('|'));
  })`;
  for (const tz of ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC']) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { ...process.env, TZ: tz } });
    assert.equal(r.stdout.trim(), '-|in 21 days|is tomorrow|is today|was yesterday|-', tz);
  }
});
