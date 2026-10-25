// QA: the third Halloween pass (ops/coverage/halloween-qa-2026-10-24.md), bugs 1 to 4. The
// Halloween list in 8 new regions, 19 Halloween food styles in 4 ZIPs, and the live app at phone
// size. Each DEFECT is a name, price or line the run published.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The name-only pumpkin cases are also in test/fixtures/holiday-matrix.json, which drives the iOS
// HolidayMatrixTests. Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { relevance, RELEVANT } from '../shared/match.js';
import { bestPerStore, perLbAside, scoreItems, dominantDim } from '../shared/compare.js';
import { featured, whenText, DAY_AFTER, occasions } from '../shared/seasonal.js';
import { makeProduct } from '../src/normalize.js';
import { importPublic } from './helpers/browser-modules.js';

const score = (q, name, extra = {}) => relevance(q, { name, ...extra });
const rejects = (q, name, extra = {}) => {
  const s = score(q, name, extra);
  assert.ok(s < RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} >= ${RELEVANT} (wrong product accepted)`);
};
const matches = (q, name, extra = {}) => {
  const s = score(q, name, extra);
  assert.ok(s >= RELEVANT, `"${q}" vs "${name}" scored ${s.toFixed(3)} < ${RELEVANT} (real match rejected)`);
};
const item = (storeId, name, sizeText, price, extra = {}) =>
  makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price, ...extra });

// ---------------------------------------------------------------------------
// Bug 1: "pumpkin" matched non-food. ALDI's cheapest pumpkin in Phoenix was a $3.39 vinyl
// tablecloth; Fry's (Phoenix) and ALDI (Minneapolis) best picks were an eye mask and an ice mold;
// the Phoenix list also showed scratch art, baking pans, a carving light, a balloon, a glow wand and
// a pumpkin porter. A pumpkin search now asks for evidence of a whole pumpkin, and party goods,
// kitchen tools and costume pieces are trapped for every search.
// ---------------------------------------------------------------------------
const NON_FOOD = [
  ['Kirkton House Pumpkins Vinyl Tablecloth - 52" X 70"', { category: 'Seasonal' }],
  ['Klein International Glow Fun Pumpkin Eye Mask', { sizeText: '3 ct' }],
  ['The Halloween Collection Pumpkin Ice Mold', {}],
  ['Bendon Pumpkins Halloween Scratch Art', {}],
  ['Crofton Pumpkin Silicone Baking Pans', {}],
  ['Pumpkin Masters 3 in 1 Light', {}],
  ['PPI Spooky Pumpkin Balloon', {}],
  ['Klein International Glow Pumpkin Wand', {}],
  ['Pumpkin Porter 6pk', {}],
];

test('DEFECT 1: party goods, kitchen tools and a porter are not pumpkins', () => {
  for (const [n, extra] of NON_FOOD) rejects('pumpkin', n, extra);
  // As made products, with the size the stores returned.
  assert.ok(relevance('pumpkin', item('aldi', 'Kirkton House Pumpkins Vinyl Tablecloth - 52" X 70"', '1 ea', 3.39)) < RELEVANT);
  assert.ok(relevance('pumpkin', item('frys', 'Klein International Glow Fun Pumpkin Eye Mask', '3 ct', 4.99)) < RELEVANT);
});

test('DEFECT 1: Phoenix ALDI has no pumpkin in this result, not a tablecloth', () => {
  const { stores } = bestPerStore('pumpkin', {
    aldi: [item('aldi', 'Kirkton House Pumpkins Vinyl Tablecloth - 52" X 70"', '1 ea', 3.39), item('aldi', 'The Halloween Collection Pumpkin Ice Mold', '1 ea', 2.99)],
    frys: [item('frys', 'Klein International Glow Fun Pumpkin Eye Mask', '3 ct', 4.99), item('frys', 'Large Carving Pumpkin', '1 ea', 5.99)],
  });
  assert.deepEqual(Object.keys(stores), ['frys']);
  assert.equal(stores.frys.item.name, 'Large Carving Pumpkin');
});

test('DEFECT 1: the non-food trap works for other searches too', () => {
  rejects('caramel apples', 'Caramel Apple Silicone Candy Mold');
  rejects('halloween candy', 'Halloween Candy Corn Tablecloth');
  rejects('candy corn', 'Candy Corn Costume');
  rejects('apple cider', 'Apple Cider Scented Wax Melts');
});

test('control: whole pumpkins still answer "pumpkin", by name, aisle, weight or per lb', () => {
  for (const n of ['Pie Pumpkin', 'Sugar Pie Pumpkin', 'Large Carving Pumpkin', 'Pumpkin', 'Jumbo Pumpkin', 'Halloween Pumpkins',
    "Rent's Due Ranch Local Organic |Jack-O-Lantern Pumpkins", 'Heirloom Pumpkins, Each, Assorted Colors', 'Carving Pumpkin Large',
    'Orange Pumpkin Medium - Weight Between 10-15 Lb', 'Regular Pumpkins Bin']) matches('pumpkin', n);
  // A name with a variety after "pumpkin" is still a pumpkin when the aisle or the scale says so.
  matches('pumpkin', 'Pumpkin Cinderella', { category: 'Produce' });
  matches('pumpkin', 'Pumpkin Howden', { soldBy: 'lb' });
  assert.ok(relevance('pumpkin', item('frys', 'Pumpkin', '13 lb', 7.99)) >= RELEVANT);
});

test('control: asking for the thing finds it, and staples with the trap words are untouched', () => {
  matches('cake pans', 'Wilton Cake Pans');
  matches('balloons', 'PPI Spooky Halloween Balloons');
  matches('candy molds', 'Wilton Candy Molds');
  matches('candles', 'Birthday Candles');
  matches('light cream', 'Light Cream');
  matches('tuna', 'Light Tuna in Water');
  matches('pan de muerto', 'Pan de Muerto');
  matches('halloween candy', 'Halloween Candy Wands');
  matches('salad kit', 'Caesar Salad Kit');
});

// ---------------------------------------------------------------------------
// Bug 2: Phoenix's cheapest real pumpkins were left out of the per-each "Best price": Bashas'
// "Pumpkin" at $0.44/lb, El Super's at $0.33/lb and Fry's "Pumpkin" 13 lb at $7.99 lost to a $2.19
// small pumpkin. A per-lb pumpkin has no honest price per pumpkin (DEFECT 4 of the first run), so it
// is named on the headline rather than given an invented one; a whole pumpkin with a fixed price and
// a stated weight is one pumpkin at that price.
// ---------------------------------------------------------------------------
const phoenix = () => ({
  bashas: [item('bashas', 'Pumpkin', '1 each', 0.44, { soldBy: 'lb', category: 'Pumpkin' })],
  elsuper: [item('elsuper', 'Pumpkin', '1 each', 0.33, { soldBy: 'lb', estEach: 0.66, category: 'Pumpkin' })],
  frys: [item('frys', 'Pumpkin', '13 lb', 7.99, { category: 'Pumpkin' })],
  sprouts: [item('sprouts', 'Lolita Pumpkin', '1 ea', 2.19, { category: 'Pumpkin' })],
  walmart: [item('walmart', 'Large Carving Pumpkin', '1 ea', 4.97, { category: 'Pumpkin' })],
});

test('DEFECT 2: Fry\'s 13 lb pumpkin at $7.99 is one pumpkin at $7.99', () => {
  const p = item('frys', 'Pumpkin', '13 lb', 7.99, { category: 'Pumpkin' });
  assert.equal(p.unit.count?.perBase, 7.99);
  assert.equal(p.unit.count.est, false);
  const { stores } = bestPerStore('pumpkin', phoenix(), { dim: 'count' });
  assert.equal(stores.frys?.unit.perBase, 7.99);
});

test('DEFECT 2: the per-each headline names the per-lb pumpkins it cannot rank', () => {
  const all = scoreItems('pumpkin', Object.values(phoenix()).flat());
  const dim = dominantDim(all.filter((p) => p.score >= RELEVANT));
  assert.equal(dim, 'count');
  const aside = perLbAside(all, dim);
  assert.deepEqual(aside.map((a) => [a.storeId, a.perLb]), [['elsuper', 0.33], ['bashas', 0.44]]);
  // Still no invented per-pumpkin price for them.
  for (const a of aside) assert.equal(a.item.unit.count, undefined);
});

test('DEFECT 2: the web card says so in words', async () => {
  const { perLbLine } = await importPublic('js/views/compare.js');
  const line = perLbLine([{ storeId: 'elsuper', perLb: 0.33 }, { storeId: 'bashas', perLb: 0.44 }], 'each');
  assert.match(line, /^Sold by the lb, so not ranked per /);
  assert.match(line, /\$0\.33\/lb/);
  assert.match(line, /\$0\.44\/lb/);
  assert.match(line, /Listed below\.$/);
});

test('control: nothing to name when the comparison is by weight, or produce has an each estimate', () => {
  const all = scoreItems('pumpkin', Object.values(phoenix()).flat());
  assert.deepEqual(perLbAside(all, 'weight'), []);
  const bananas = scoreItems('bananas', [item('kroger', 'Bananas', '1 each', 0.59, { soldBy: 'lb', estEach: 0.2 }), item('aldi', 'Bananas', '1 ea', 0.25)]);
  assert.deepEqual(perLbAside(bananas, 'count'), []);
  // A can and a bag of seeds are not weighed whole pumpkins.
  assert.equal(item('walmart', 'Great Value Pumpkin', '15 oz', 1.0).unit.count, undefined);
  assert.equal(item('x', 'Pumpkin Seeds', '2 lb', 9.99).unit.count, undefined);
});

// ---------------------------------------------------------------------------
// Bug 3: weekly-ad cards said "· terms loading" (compare screen) and "checking ad terms…" (deals
// screen) for minutes. Terms are fetched when a deal is opened, so nothing was loading.
// ---------------------------------------------------------------------------
const flippDeal = (extra = {}) => ({ id: 'flipp-1', source: 'flipp', flippId: 1, storeId: 'frys', name: 'Halloween Candy', price: 7, qty: 1, each: 7, priceText: '$7.00', enriched: false, validTo: null, ...extra });
const text = (v) => (v == null || v === false ? '' : typeof v === 'string' || typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(text).join('') : text(v.props?.children));

test('DEFECT 3: ad cards say to open them for terms, not that terms are loading', async () => {
  const { DealCard, DealCardMini } = await importPublic('js/views/sales.js');
  const mini = text(DealCardMini({ deal: flippDeal() }));
  assert.match(mini, /open for terms/);
  assert.doesNotMatch(mini, /loading/);
  const card = text(DealCard({ d: flippDeal() }));
  assert.match(card, /open for ad terms/);
  assert.doesNotMatch(card, /checking/);
  assert.doesNotMatch(text(DealCardMini({ deal: flippDeal({ enriched: true }) })), /open for terms/);
});

test('DEFECT 3: the iPhone deals card uses the same words', () => {
  const swift = fs.readFileSync(new URL('../ios/App/UI/Deals/DealsView.swift', import.meta.url), 'utf8');
  assert.match(swift, /Text\("open for ad terms"\)/);
  assert.doesNotMatch(swift, /checking ad terms/);
});

// ---------------------------------------------------------------------------
// Bug 4: the Halloween card says candy is "50% off on Nov 1" and vanished at midnight on 31 Oct.
// ---------------------------------------------------------------------------
test('DEFECT 4: Halloween is still featured on Nov 1, with the after-Halloween line', () => {
  for (const hour of [0, 12, 23]) {
    const [first] = featured(new Date(2026, 10, 1, hour, 30));
    assert.equal(first?.name, 'Halloween', `Nov 1 ${hour}:30`);
    assert.equal(first.daysAway, -1);
    assert.equal(whenText(first.daysAway), 'was yesterday');
    assert.equal(first.blurb, DAY_AFTER.halloween);
    assert.match(first.blurb, /50% off today/);
  }
});

test('control: Halloween timing before and after, and no other occasion lingers', () => {
  const oct31 = featured(new Date(2026, 9, 31, 12));
  assert.equal(oct31[0].name, 'Halloween');
  assert.equal(whenText(oct31[0].daysAway), 'is today');
  assert.match(oct31[0].blurb, /50% off on Nov 1/);
  assert.ok(!featured(new Date(2026, 10, 2, 0, 5)).some((o) => o.name === 'Halloween'), 'gone on Nov 2');
  // Nov 1 still shows the next occasion beside it.
  assert.deepEqual(featured(new Date(2026, 10, 1, 12)).map((o) => o.name), ['Halloween', 'Diwali']);
  // The day after any other occasion features nothing extra.
  for (const o of occasions(2026)) {
    if (DAY_AFTER[o.id.replace(/-\d{4}$/, '')]) continue;
    const next = new Date(o.date.getFullYear(), o.date.getMonth(), o.date.getDate() + 1, 12);
    assert.ok(!featured(next).some((f) => f.id === o.id), `${o.name} lingered`);
  }
  // New Year's Day is still featured on Jan 1 and gone on Jan 2.
  assert.equal(featured(new Date(2027, 0, 1, 12))[0].name, 'New Year’s');
  assert.ok(!featured(new Date(2027, 0, 2, 12)).some((o) => o.name === 'New Year’s'));
});

test('DEFECT 4: the phone has the same after-Halloween line', () => {
  const swift = fs.readFileSync(new URL('../ios/App/Services/Seasonal.swift', import.meta.url), 'utf8');
  const m = /static let dayAfter: \[String: String\] = \[([^\]]*)\]/.exec(swift);
  const table = Object.fromEntries([...m[1].matchAll(/"([a-z]+)": "([^"]+)"/g)].map((x) => [x[1], x[2]]));
  assert.deepEqual(table, DAY_AFTER);
});
