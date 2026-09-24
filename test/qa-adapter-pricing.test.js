// QA: adversarial tests for the ADAPTER-level price arithmetic — the step between what a retailer
// sends us and the normalized product the comparison runs on.
//
// Every test asserts the CORRECT behavior. Tests labelled "DEFECT n" reproduce a real bug found by
// sweeping the Thanksgiving basket across Chicago, Lombard, Milwaukee and Kenosha; "control" tests
// pin down the neighbouring cases that must NOT change.
//
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { toProduct, search as wholeFoodsSearch } from '../src/adapters/wholefoods.js';
import { dropStaleSizeFromName, parseItem, itemsInOrder } from '../src/adapters/instacart.js';
import { search as traderJoesSearch } from '../src/adapters/traderjoes.js';

const perLb = (p) => (p.unit.weight ? p.unit.weight.perBase * 16 : null);
const perGal = (p) => (p.unit.volume ? p.unit.volume.perBase * 128 : null);
const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// DEFECT 1: a Whole Foods multi-buy is the TOTAL for N packages, not the each
// price. Reading salePrice as the each price made "2 for $7.78" render as $7.78
// each — 56% ABOVE the $4.99 regular price on the very same record — and the
// promo line then multiplied it a second time into "2 for $15.56".
// Captured live at ZIP 60618, 2026-09-23.
// ---------------------------------------------------------------------------
const BLACKBERRIES = {
  slug: 'organic-blackberries',
  name: 'Organic Blackberries',
  regularPrice: 4.99,
  salePrice: 7.78,
  saleMultiple: 2,
  incrementalSalePrice: 7,
  primeMultiple: 2,
  saleStartDate: '2026-09-23T00:00:00Z',
  saleEndDate: '2026-10-06T23:59:59Z',
};
const AT = Date.parse('2026-09-25T12:00:00Z');

test('DEFECT 1a: a "2 for $7.78" multi-buy prices ONE package at $3.89, not $7.78', () => {
  const p = toProduct(BLACKBERRIES, { now: AT });
  assert.equal(p.price, 3.89, `one package priced at $${p.price}`);
});

test('DEFECT 1b: the member price is divided by its own multiple too', () => {
  const p = toProduct(BLACKBERRIES, { now: AT });
  assert.equal(p.memberPrice, 3.5, `Prime price $${p.memberPrice}`);
});

test('DEFECT 1c: a sale price must never come out ABOVE the regular price on the same record', () => {
  const p = toProduct(BLACKBERRIES, { now: AT });
  assert.ok(p.price < BLACKBERRIES.regularPrice, `$${p.price} vs regular $${BLACKBERRIES.regularPrice}`);
  assert.equal(p.regularPrice, 4.99, 'the regular price survives, so the saving is shown');
});

test('DEFECT 1d: the promo line quotes the retailer’s own total, never total x multiple', () => {
  const p = toProduct(BLACKBERRIES, { now: AT });
  assert.equal(p.promo, '2 for $7.78 · Prime: 2 for $7.00');
});

test('DEFECT 1e: the promo total and the each price always agree', () => {
  const p = toProduct(BLACKBERRIES, { now: AT });
  const [, qty, total] = p.promo.match(/^(\d+) for \$([\d.]+)/);
  assert.ok(close(+total / +qty, p.price), `${p.promo} does not divide to $${p.price}`);
});

test('control: a plain sale (no saleMultiple) is still taken at face value', () => {
  const p = toProduct(
    { slug: 'gummies', name: 'Blackberry Zen Restful Sleep Gummies, 50 CT', regularPrice: 15.99, salePrice: 13.67, incrementalSalePrice: 12.3, saleEndDate: '2026-10-06T23:59:59Z' },
    { now: AT },
  );
  assert.equal(p.price, 13.67);
  assert.equal(p.memberPrice, 12.3);
  assert.equal(p.promo, null);
});

test('control: an expired sale falls back to the regular price', () => {
  const p = toProduct({ ...BLACKBERRIES, saleEndDate: '2026-09-01T00:00:00Z' }, { now: AT });
  assert.equal(p.price, 4.99);
  assert.equal(p.onSale, false);
});

test('control: a "sale" that is not actually cheaper is dropped rather than shown', () => {
  // If we ever misread the offer again, the shopper must see the regular price, not a number we
  // cannot stand behind.
  const p = toProduct({ ...BLACKBERRIES, saleMultiple: 1, primeMultiple: 1 }, { now: AT });
  assert.equal(p.price, 4.99, 'fell back to regular');
  assert.equal(p.onSale, false);
  assert.equal(p.promo, null);
});

// ---------------------------------------------------------------------------
// DEFECT 2: Whole Foods states the size of ONE unit and leaves the pack count in
// the product name. Splitting name from size threw the multiplier away, so the
// stated single-unit size won in pickSize and the pack was priced per bottle.
// All six of these are real records from the Thanksgiving sweep.
// ---------------------------------------------------------------------------
const PACKS = [
  // [record name, price, unit fn, expected per gal/lb, how many times too high it used to be]
  ['Organic Chicken Broth 4pk, 8 FZ', 7.09, perGal, 28.36, 4],
  ['American Apple Cider 6pk Cans, 12 FZ', 12.99, perGal, 23.09, 6],
  ['Organic Apple Cider 4pk Cans, 14.9 FZ', 14.99, perGal, 32.19, 4],
  ['Apple Variety Pack Cider 9pk Cans, 12 FZ', 18.99, perGal, 22.51, 9],
  ['Organic No Salt Added Cut Green Beans 4pk, 14.5 OZ', 6.99, perLb, 1.93, 4],
];

for (const [name, price, unit, expected, factor] of PACKS) {
  test(`DEFECT 2: "${name}" is priced per PACK, not per unit (was ${factor}x high)`, () => {
    const p = toProduct({ slug: 's', name, regularPrice: price }, { now: AT });
    const got = unit(p);
    assert.ok(got != null, `no unit price at all; size rendered as "${p.size}"`);
    assert.ok(close(got, expected, 0.05), `got ${got.toFixed(2)}, expected ${expected} (size "${p.size}")`);
  });
}

// Round 2: "Npk" folds, "N Count" does not. The same fold multiplied seven Whole Foods boxes that
// state their OWN weight — "Mini Apple Cider Muffin 12ct, 10.2 OZ", "Pumpkin Pie Bars 6 Count,
// 9.6 OZ", Yasso "4 Count, 14 FZ" — 4x to 12x too cheap. The one real pack among the "Count" titles,
// Chomps' turkey sticks, is now withheld rather than priced: its stated 1.15 oz cannot be eight
// sticks, so makeProduct records the disagreement and publishes no per-pound figure at all.
test('DEFECT 2: "Original Turkey Sticks 8 Count, 1.15 OZ" is no longer published at $261/lb', () => {
  const p = toProduct({ slug: 's', name: 'Original Turkey Sticks 8 Count, 1.15 OZ', regularPrice: 18.79 }, { now: AT });
  assert.equal(perLb(p), null, `published at $${perLb(p)?.toFixed(2)}/lb`);
  assert.deepEqual(p.sizeConflict, { text: '1.15 oz', name: '8 ct' });
  assert.equal(p.price, 18.79, 'the package price is still shown');
});

test('control: a stated COUNT is already the whole package and must be left alone', () => {
  // "Pepperoni Turkey Sticks, 8 count" states 8 each; we do not know what one weighs, and
  // inventing "8 x 8 count" would be worse than saying nothing.
  const p = toProduct({ slug: 's', name: 'Pepperoni Turkey Sticks, 8 count', regularPrice: 19.99 }, { now: AT });
  assert.equal(p.size, '8 ct');
  assert.ok(close(p.unit.count.perBase, 19.99 / 8));
});

test('control: a single-unit item keeps its stated size untouched', () => {
  const p = toProduct({ slug: 's', name: 'Organic Whole Milk, 64 FZ', regularPrice: 5.49 }, { now: AT });
  assert.equal(p.size, '64 fl oz');
  assert.ok(close(p.unit.volume.perBase, 5.49 / 64));
});

test('control: a per-lb item is not given a package size', () => {
  const p = toProduct({ slug: 's', name: 'Green Beans with Cracked Pepper & Sea Salt', regularPrice: 9.99, uom: '/lb' }, { now: AT });
  assert.equal(p.soldBy, 'lb');
  assert.ok(close(perLb(p), 9.99));
});

// ---------------------------------------------------------------------------
// DEFECT 3: a price of 0 is a price we do not have, not a free product. Trader
// Joe's answers price_range.minimum_price = 0 for rows it has no price for, and
// money(0) renders "$0.00", which then sorts first in a cheapest-first list.
// ---------------------------------------------------------------------------
// Round 1's version of this test re-implemented the filter's predicate and asserted it, so it
// passed with the filter deleted. This one runs Whole Foods' real search() against a stubbed
// network, so it fails the moment the filter stops filtering.
test('DEFECT 3: a 0 price is dropped from Whole Foods results, not shown as $0.00', async () => {
  const realFetch = globalThis.fetch;
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/csrf')) return json({ token: 't' });
    if (u.includes('/api/wwos/location/store/closest')) return json({ storeCode: '99999' });
    if (u.includes('/api/stores/99999/summary')) return json({ storeId: 99999, displayName: 'Test', primaryLocation: { latitude: 41.9, longitude: -87.7, address: {} } });
    if (u.includes('zippopotam.us')) return json({ places: [{ latitude: '41.9', longitude: '-87.7', 'place name': 'Chicago', 'state abbreviation': 'IL' }] });
    if (u.includes('/api/search')) return json({ results: [
      { slug: 'free', name: 'Mystery Item, 12 OZ', regularPrice: 0 },
      { slug: 'real', name: 'Organic Whole Milk, 64 FZ', regularPrice: 5.49 },
    ] });
    throw new Error(`unexpected request ${u}`);
  };
  try {
    // A ZIP no other test uses, so the store lookup cannot come from another test's cache.
    const r = await wholeFoodsSearch('mystery', '00601');
    assert.deepEqual(r.items.map((p) => p.name), ['Organic Whole Milk'], 'a 0-priced row survived search()');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('DEFECT 3: a 0 price is dropped from Trader Joe\'s results, not shown as $0.00', async () => {
  // Trader Joe's is where the zero came from: price_range.minimum_price = 0 on rows it has no price for.
  const realFetch = globalThis.fetch;
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('brandify.com')) return json({ response: { collection: [{ clientkey: '9999', name: 'Test (9999)', address1: '1 Main St', city: 'Test', state: 'PR', latitude: '18.18', longitude: '-66.9' }] } });
    if (u.includes('zippopotam.us')) return json({ places: [{ latitude: '18.18', longitude: '-66.9', 'place name': 'Adjuntas', 'state abbreviation': 'PR' }] });
    if (u.includes('traderjoes.com/api/graphql')) return json({ data: { products: { items: [
      { sku: '1', item_title: 'Mystery Item', sales_size: '12', sales_uom_description: 'Oz', price_range: { minimum_price: { final_price: { value: 0 } } } },
      { sku: '2', item_title: 'Organic Whole Milk', sales_size: '64', sales_uom_description: 'Fl Oz', price_range: { minimum_price: { final_price: { value: 4.49 } } } },
    ] } } });
    throw new Error(`unexpected request ${u}`);
  };
  try {
    const r = await traderJoesSearch('mystery', '00601');
    assert.deepEqual(r.items.map((p) => p.name), ['Organic Whole Milk'], 'a 0-priced row survived search()');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('DEFECT 3: a 0 price is dropped from an Instacart results page, not shown as $0.00', () => {
  const rec = (id, name, priceString) => ({ id, productId: id, name, size: '12 oz', price: { viewSection: { itemCard: { priceString } } }, availability: { available: true } });
  const byId = new Map([['a', rec('a', 'Mystery Item', '$0.00')], ['b', rec('b', 'Real Item', '$2.49')]]);
  const items = itemsInOrder(['a', 'b'], byId, { storeId: 'jewel', base: 'https://www.instacart.com', slug: 'jewel-osco' }, { serviceType: 'delivery' });
  assert.deepEqual(items.map((p) => p.name), ['Real Item']);
});

// ---------------------------------------------------------------------------
// DEFECT 4: Instacart carries the package size twice — as a structured `size`
// attribute (which the unit price is computed from) and glued onto the product
// name. Costco's sweet potatoes arrive as "Sweet Potatoes, 5 lbs" with size
// "10 lb", so the row printed two contradictory sizes and the 80.7c/lb headline
// rested on which one you believed.
// ---------------------------------------------------------------------------
// Round 2: only when the retailer's own slug says which size is right. Stripping every
// disagreement erased the evidence sizeConflict needs, so that guard could never fire again.
const SWEET_POTATO_SLUG = '18848374-sweet-potatoes-10-lbs-10-lb';
test('DEFECT 4: a name whose size clause contradicts the stated size loses the clause', () => {
  assert.equal(dropStaleSizeFromName('Sweet Potatoes, 5 lbs', '10 lb', SWEET_POTATO_SLUG), 'Sweet Potatoes');
  // ...and search() really does it: the Instacart record parser is where the helper is wired.
  const record = { productId: '18848374', name: 'Sweet Potatoes, 5 lbs', size: '10 lb', evergreenUrl: SWEET_POTATO_SLUG, price: { viewSection: { itemCard: { priceString: '$8.07' } } } };
  const p = parseItem(record, { storeId: 'costco', base: 'https://www.instacart.com', slug: 'costco' }, { serviceType: 'instore' }, 0, 1, false);
  assert.equal(p.name, 'Sweet Potatoes', 'the adapter did not use the helper');
});

test('control: with no slug to settle it, the clause stays and the conflict is recorded', () => {
  assert.equal(dropStaleSizeFromName('Sweet Potatoes, 5 lbs', '10 lb'), 'Sweet Potatoes, 5 lbs');
});

test('control: a name that AGREES with the stated size is left exactly as written', () => {
  assert.equal(dropStaleSizeFromName('Baking Potatoes, 10 lbs', '10 lb'), 'Baking Potatoes, 10 lbs');
  assert.equal(dropStaleSizeFromName('Gold Potatoes, 10 lbs', '10 lb'), 'Gold Potatoes, 10 lbs');
});

test('control: a MULTIPACK clause is richer than the attribute and must survive', () => {
  // pickSize in normalize.js deliberately prefers this over the bare "each".
  const n = 'The SnakYard Organic Sweet Potato Sticks, 2.82 oz, 6-count';
  assert.equal(dropStaleSizeFromName(n, 'each'), n);
  assert.equal(dropStaleSizeFromName(n, '17 oz'), n);
});

test('control: a different dimension is not a contradiction', () => {
  assert.equal(dropStaleSizeFromName('Super Sweet Corn, 8-count', '8 ct'), 'Super Sweet Corn, 8-count');
  assert.equal(dropStaleSizeFromName('Sweet Potatoes, Organic', '3 lb'), 'Sweet Potatoes, Organic');
});

test('control: nothing is stripped when there is no stated size to compare against', () => {
  assert.equal(dropStaleSizeFromName('Sweet Potatoes, 5 lbs', ''), 'Sweet Potatoes, 5 lbs');
  assert.equal(dropStaleSizeFromName('Sweet Potatoes, 5 lbs', 'per lb'), 'Sweet Potatoes, 5 lbs');
});

test('control: the whole name is never emptied', () => {
  assert.equal(dropStaleSizeFromName('5 lbs', '10 lb'), '5 lbs');
});

// ---------------------------------------------------------------------------
// live: the shape of the whole basket. A pack price must never exceed the price
// of the same brand's single unit per unit of measure by a wide margin — that is
// the signature every multipack defect leaves behind.
// ---------------------------------------------------------------------------
test('live: a 12-pack is cheaper per fl oz than the single it is made of', () => {
  const sgl = toProduct({ slug: 'a', name: 'Blackberry Lemonade Sparkling Water Sgl, 12 FZ', regularPrice: 1.09 }, { now: AT });
  const pk = toProduct({ slug: 'b', name: 'Blackberry Lemonade Sparkling Water 12pk, 12 FZ', regularPrice: 7.79 }, { now: AT });
  assert.ok(pk.unit.volume.perBase < sgl.unit.volume.perBase, `12pk ${pk.unit.volume.perBase} vs single ${sgl.unit.volume.perBase}`);
});
