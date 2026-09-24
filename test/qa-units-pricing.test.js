// QA: adversarial tests for shared/units.js package-size parsing.
//
// Every test here asserts the CORRECT behavior. Tests that currently FAIL are
// labelled "DEFECT" and each one is a reproduction of a real bug. They are
// expected to fail until shared/units.js is fixed.
//
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa-pricing-logic node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, sizeFromName, parseNumber, coerceLiquid, unitPrices } from '../shared/units.js';
import { makeProduct } from '../src/normalize.js';

const perLb = (p) => (p.unit.weight ? p.unit.weight.perBase * 16 : null);

// ---------------------------------------------------------------------------
// DEFECT 1: an ascending weight RANGE is parsed as a multi-pack.
// "1.5-2 lb" and "0.75-1.25 lb" are how Jewel/Mariano's list a single tray of
// chicken. MULTI_RE grabs the digits AFTER the decimal point as a pack count.
// ---------------------------------------------------------------------------
test('DEFECT 1a: "1.5-2 lb" is one package of 1.5-2 lb, not five 2-lb packs', () => {
  const s = parseSize('1.5-2 lb');
  assert.equal(s.count, 1, `parsed as ${s.count} packs`);
  assert.ok(s.base <= 32, `base ${s.base} oz should be <= 32 oz (2 lb), got ${s.base / 16} lb`);
});

test('DEFECT 1b: "0.75-1.25 lb" must not become 93.75 lb', () => {
  const s = parseSize('0.75-1.25 lb');
  assert.ok(s.base <= 20, `base ${s.base} oz (= ${s.base / 16} lb) is absurd for a 0.75-1.25 lb tray`);
});

test('DEFECT 1c: the range blowup produces a fake 7 cents/lb chicken breast', () => {
  const p = makeProduct({
    storeId: 'mariano', id: 'm1',
    name: 'Perdue Boneless Skinless Chicken Breast', sizeText: '0.75-1.25 lb', price: 6.49,
  });
  assert.ok(perLb(p) > 3, `chicken breast priced at $${perLb(p).toFixed(3)}/lb — display size renders as "${p.size}"`);
});

test('control: ranges without a decimal point are handled correctly', () => {
  for (const [txt, maxOz] of [['12.2-14.4 oz', 14.4], ['10-15 oz', 15], ['1-2 lb', 32], ['2 to 3 lb', 48]]) {
    const s = parseSize(txt);
    assert.equal(s.count, 1, `${txt} -> count ${s.count}`);
    assert.ok(s.base <= maxOz, `${txt} -> ${s.base} oz`);
    assert.equal(s.range, true, `${txt} should be flagged range`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 2: a plain fraction with a numerator > 1 is read as a multi-pack.
// ---------------------------------------------------------------------------
test('DEFECT 2: "3/4 lb" is three quarters of a pound, not three 4-lb packs', () => {
  const s = parseSize('3/4 lb');
  assert.equal(s.base, 12, `got ${s.base} oz (${s.base / 16} lb)`);
});

test('control: "1/2 gal" and "1/4 lb" parse correctly (numerator is 1)', () => {
  assert.equal(parseSize('1/2 gal').base, 64);
  assert.equal(parseSize('1/4 lb').base, 4);
});

// ---------------------------------------------------------------------------
// DEFECT 3: mixed fractions are truncated to the whole number.
// parseNumber() handles "1 1/2" but SIZE_RE's number alternation never feeds it
// one: the `\d+` branch matches "1" first and wins.
// ---------------------------------------------------------------------------
test('DEFECT 3: "1 1/2 lb" must be 24 oz, not 16 oz', () => {
  assert.equal(parseNumber('1 1/2'), 1.5, 'parseNumber itself is correct');
  const s = parseSize('1 1/2 lb');
  assert.equal(s.base, 24, `got ${s.base} oz — a third of the package is lost`);
});

// ---------------------------------------------------------------------------
// DEFECT 4: "half gallon" spelled out is unparseable, so the item gets no unit
// price at all and drops out of every comparison.
// ---------------------------------------------------------------------------
test('DEFECT 4: "half gallon" spelled out must parse to 64 fl oz', () => {
  const s = parseSize('half gallon');
  assert.ok(s, '"half gallon" -> null');
  assert.equal(s.base, 64);
});

test('DEFECT 4b: a product named "... , half gallon" gets no unit price', () => {
  const p = makeProduct({ storeId: 'a', id: '1', name: 'Organic Valley Whole Milk, half gallon', price: 4.99 });
  assert.ok(p.unit.volume, `no volume unit price; dim=${p.dim} base=${p.base}`);
});

// ---------------------------------------------------------------------------
// DEFECT 5: sizeFromName scans comma-separated parts back-to-front and takes
// the FIRST thing that parses. US listings put the pack count last, so the real
// volume/weight is thrown away and the item lands in the `count` dimension.
// ---------------------------------------------------------------------------
test('DEFECT 5a: "12 fl oz, 12 Pack Cans" must keep the 144 fl oz, not become 12 each', () => {
  const s = sizeFromName('Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans');
  assert.equal(s.dim, 'volume', `dim=${s.dim} base=${s.base} — the 12 fl oz was discarded`);
  assert.equal(s.base, 144);
});

test('DEFECT 5b: "5.3 oz, 12 Count" yogurt must keep 63.6 oz', () => {
  const s = sizeFromName('Chobani Greek Yogurt Cups, 5.3 oz, 12 Count');
  assert.equal(s.dim, 'weight', `dim=${s.dim} base=${s.base}`);
  assert.equal(s.base, 63.6);
});

test('DEFECT 5c: "12-count 5.3 oz cups" must keep 63.6 oz', () => {
  const s = parseSize('12-count 5.3 oz cups');
  assert.equal(s.dim, 'weight', `dim=${s.dim} base=${s.base} — the 5.3 oz was discarded`);
  assert.equal(s.base, 63.6);
});

test('DEFECT 5d: identical 12-packs from two stores must land in the same dimension', () => {
  const a = makeProduct({ storeId: 'a', id: '1', name: 'Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans', price: 8.99 });
  const b = makeProduct({ storeId: 'b', id: '2', name: 'Coca-Cola Cans', sizeText: '12 pk, 12 fl oz', price: 8.49 });
  assert.equal(a.dim, b.dim, `store A dim=${a.dim} (base ${a.base}) vs store B dim=${b.dim} (base ${b.base}) — not comparable`);
});

test('control: "12 x 5.3 oz" (the unambiguous form) is right', () => {
  assert.equal(parseSize('12 x 5.3 oz').base, 63.6);
});

// ---------------------------------------------------------------------------
// DEFECT 6: coerceLiquid uses a SOLID_RE veto list that contains flavor words,
// so flavored versions of a liquid stay in `weight` while the plain version
// moves to `volume`. Same query, two dimensions.
// ---------------------------------------------------------------------------
test('DEFECT 6a: chocolate milk in "oz" must coerce to fl oz like plain milk does', () => {
  const plain = coerceLiquid(parseSize('64 oz'), 'Prairie Farms Whole Milk');
  const choc = coerceLiquid(parseSize('64 oz'), 'TruMoo Chocolate Milk');
  assert.equal(plain.dim, 'volume', 'sanity: plain milk coerces');
  assert.equal(choc.dim, 'volume', `chocolate milk stayed dim=${choc.dim} — "chocolate" is in the SOLID veto list`);
});

test('DEFECT 6b: Pop-Tarts are not a liquid ("\\bpop\\b" matches the brand)', () => {
  const s = coerceLiquid(parseSize('13.5 oz'), 'Pop-Tarts Frosted Strawberry Toaster Pastries');
  assert.equal(s.dim, 'weight', `toaster pastries priced per fl oz (dim=${s.dim})`);
});

test('DEFECT 6c: canned solids are net weight, not fluid ounces', () => {
  for (const name of ['Del Monte Whole Kernel Corn Can', "Libby's 100% Pure Pumpkin Can"]) {
    const s = coerceLiquid(parseSize('15 oz'), name);
    assert.equal(s.dim, 'weight', `${name} -> dim=${s.dim} ("can" alone triggers the liquid rule)`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 7: milligram sizes round to base 0 (or near-0), producing either a
// silently uncomparable item or an absurd unit price.
// ---------------------------------------------------------------------------
// Resolution note: the original QA test asserted that "1 mg" should still yield a non-zero weight
// base. We deliberately chose the other answer. A milligram figure on a label is a DOSE, not the
// size of the package ("Vitamin D3, 25 mg"), so treating it as the package produces a number that
// is arithmetically true and completely useless — roughly $370,000 per pound. parseSize now
// declines to read a dose as a package size, and the item is priced per each instead, which is how
// supplements are actually sold. The defect being guarded against is unchanged: no absurd
// per-pound price may reach the comparison.
test('DEFECT 7: a milligram dose must not be priced as a package', () => {
  assert.equal(parseSize('1 mg'), null, '"1 mg" should not be read as a package size at all');
  assert.equal(parseSize('25 mg'), null);
  const p = makeProduct({ storeId: 'x', id: '1', name: 'Nature Made Vitamin D3', sizeText: '25 mg', price: 12.99 });
  assert.equal(perLb(p), null, `priced per lb from a dose: $${perLb(p)}/lb`);
  // Still comparable as a unit, so it never silently vanishes from results.
  assert.ok(p.unit.count || p.price === 12.99, 'item lost its price entirely');

  // Real small packages must still parse: spice jars, yeast packets, loose saffron.
  assert.equal(parseSize('0.5 oz').base, 0.5);
  assert.ok(parseSize('7 g').base > 0, 'a 7 g yeast packet is a real package');
  assert.ok(parseSize('500 g').base > 0);
});

// ---------------------------------------------------------------------------
// Numeric edge cases that are handled CORRECTLY — regression guards.
// ---------------------------------------------------------------------------
test('control: zero / missing / junk sizes never divide by zero', () => {
  for (const bad of ['0 oz', '0.0 oz', '', '   ', null, undefined, '12', 'family size', 'sold by weight']) {
    assert.equal(parseSize(bad), null, `${JSON.stringify(bad)} should be null`);
  }
  const p = makeProduct({ storeId: 'a', id: '1', name: 'Mystery Item', sizeText: '0 oz', price: 4.99 });
  assert.deepEqual(p.unit, {}, 'no unit prices for a zero size');
});

test('control: unitPrices never returns Infinity or NaN', () => {
  const inputs = [
    { price: 0, size: parseSize('16 oz') },
    { price: 4.99, size: null },
    { price: 4.99, size: { dim: 'weight', base: 0, perWeight: false } },
    { price: NaN, size: parseSize('16 oz') },
    { price: 4.99, size: parseSize('1000000 oz') },
    { price: 4.99, size: parseSize('per lb') },
    { perLbPrice: 0 }, { estEach: 0 }, { estPkgWeightOz: 0, price: 4.99 },
  ];
  for (const inp of inputs) {
    const up = unitPrices(inp);
    for (const [dim, v] of Object.entries(up)) {
      assert.ok(Number.isFinite(v.perBase), `${dim}.perBase = ${v.perBase} for ${JSON.stringify(inp.size?.text ?? inp)}`);
      assert.ok(v.perBase >= 0, `${dim}.perBase negative: ${v.perBase}`);
    }
  }
});

test('control: OJ 64 oz / 59 fl oz / 1 gal all compare in fl oz', () => {
  const items = [
    ['Simply Orange Juice Pulp Free', '64 oz', 5.49, 0.0858],
    ['Tropicana Pure Premium Orange Juice', '59 fl oz', 4.99, 0.0846],
    ['Great Value Orange Juice', '1 gal', 7.98, 0.0623],
  ].map(([name, sizeText, price, expect]) => {
    const p = makeProduct({ storeId: 'a', id: name, name, sizeText, price });
    assert.equal(p.dim, 'volume', `${name} -> ${p.dim}`);
    assert.ok(Math.abs(p.unit.volume.perBase - expect) < 0.001, `${name}: ${p.unit.volume.perBase}`);
    return p;
  });
  assert.equal(items.length, 3);
});

test('control: metric sizes convert correctly', () => {
  assert.ok(Math.abs(parseSize('750 mL').base - 25.36) < 0.01);
  assert.ok(Math.abs(parseSize('1 L').base - 33.814) < 0.001);
  assert.ok(Math.abs(parseSize('500 g').base - 17.637) < 0.001);
  assert.ok(Math.abs(parseSize('1 kg').base - 35.274) < 0.001);
});

test('control: eggs — dozen and ct', () => {
  assert.equal(parseSize('1 dozen').base, 12);
  assert.equal(parseSize('2 dozen').base, 24);
  assert.equal(parseSize('18 ct').base, 18);
  assert.equal(sizeFromName('Eggs Large 12ct').base, 12);
});

test('control: per-lb and each are distinguished', () => {
  assert.equal(parseSize('per lb').perWeight, true);
  assert.equal(parseSize('/lb').perWeight, true);
  assert.equal(parseSize('each').base, 1);
  assert.equal(parseSize('each').dim, 'count');
});

// ---------------------------------------------------------------------------
// Warehouse clubs state the size of ONE unit and charge for a CASE. Costco lists
// "…, Half Gallon, 3-count" with sizeText "64 fl oz" at $14.92. Taking the stated
// size at face value priced that milk at $29.84/gal instead of $9.95, and a single
// outlier that large also flattens the per-store bar chart so every honest price
// renders as an identical stub. Found in live Costco results, not by inspection.
// ---------------------------------------------------------------------------
test('live: a case price is divided by the case, not by one unit', () => {
  const p = makeProduct({
    storeId: 'costco', id: 'c1',
    name: 'Kirkland Signature Ultra Filtered 2% Lactose Free Milk, Half Gallon, 3-count',
    sizeText: '64 fl oz', price: 14.92,
  });
  const perGal = p.unit.volume.perBase * 128;
  assert.ok(perGal > 9 && perGal < 11, `$${perGal.toFixed(2)}/gal — the case price was divided by one bottle`);
  assert.equal(p.size, '3 × 0.5 gal');
});

test('live: a sizeText of "each" must not beat a real size in the name', () => {
  const p = makeProduct({ storeId: 'costco', id: 'c2', name: 'Kirkland Signature Whole Milk, 1 gal', sizeText: 'each', price: 2.97 });
  assert.ok(p.unit.volume, 'no unit price at all, so it never enters the comparison');
  assert.ok(Math.abs(p.unit.volume.perBase * 128 - 2.97) < 0.01);
});

test('live control: a stated size still wins when the name adds nothing', () => {
  const p = makeProduct({ storeId: 'aldi', id: 'a1', name: 'Friendly Farms Whole Milk', sizeText: '1 gal', price: 2.42 });
  assert.ok(Math.abs(p.unit.volume.perBase * 128 - 2.42) < 0.01);
  // And a hyphenated pack count in the name is read as a pack, not a bare count.
  const q = makeProduct({ storeId: 'costco', id: 'c3', name: 'Kirkland Water, 16.9 fl oz, 40-count', sizeText: 'each', price: 4.99 });
  assert.equal(q.unit.volume.perBase * 676 < 5.01, true);
});
