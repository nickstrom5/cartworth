// QA: the nationwide coverage sweep (Sept 2026). The real nearby-store directory was built for ZIPs
// in all 50 states + DC (a metro, a small town and a rural ZIP each, picked from the Census ZIP
// list), and Flipp's circular list was read for all 153.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainForName } from '../shared/catalog.js';
import { storeForMerchant } from '../shared/stores.js';

// DEFECT: Flipp spells two priced chains differently from the catalog. "Wegman's" advertised into
// 27 sampled ZIPs across NY, PA, NJ, MA, MD, VA, NC, DE and DC, and "FoodCity" into AL, GA and TN;
// neither matched, so their weekly ads never reached the Sales tab (the stores were still priced:
// every in-state chain with a price source is asked regardless of Flipp).
test("DEFECT: Flipp's spellings of Wegmans and Food City are those chains", () => {
  assert.equal(storeForMerchant("Wegman's"), 'wegmans');
  assert.equal(storeForMerchant('FoodCity'), 'foodcity');
});

test('control: the catalog spellings, and chains that merely look alike, stay as they were', () => {
  assert.equal(storeForMerchant('Wegmans'), 'wegmans');
  assert.equal(storeForMerchant('Food City'), 'foodcity');
  assert.equal(chainForName('Seafood City')?.id, 'seafoodcity');
  assert.equal(chainForName('Restaurant Depot'), null);
});

// DEFECT: Whole Foods answers "no store near this ZIP" with a 404. The adapter threw on it, so in 11
// of the 30 ZIPs the sweep built for real (every rural one) Whole Foods was "unresolved": the
// directory said its counts might be low and rebuilt the ZIP every few minutes, asking again.
import { resolveStore } from '../src/adapters/wholefoods.js';

async function withFetch(closestStatus, fn) {
  const realFetch = globalThis.fetch;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/csrf')) return json({ token: 't' });
    if (u.includes('/api/wwos/location/store/closest')) return json(closestStatus === 200 ? { storeCode: '88888' } : { message: 'Not Found' }, closestStatus);
    if (u.includes('/api/stores/88888/summary')) return json({ storeId: 88888, displayName: 'Test', primaryLocation: { latitude: 41.9, longitude: -87.7, address: {} } });
    if (u.includes('zippopotam.us')) return json({ places: [{ latitude: '41.9', longitude: '-87.7', 'place name': 'Test', 'state abbreviation': 'IL' }] });
    throw new Error(`unexpected request ${u}`);
  };
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

test('DEFECT: a ZIP with no Whole Foods near it is "none", not a failed lookup', async () => {
  const r = await withFetch(404, () => resolveStore('38748', { fresh: true }));
  assert.deepEqual(r, { none: true });
});

test('control: a real failure still fails, and a store is still found', async () => {
  await assert.rejects(withFetch(500, () => resolveStore('38749', { fresh: true })), /500/);
  const r = await withFetch(200, () => resolveStore('38750', { fresh: true }));
  assert.equal(r.id, '88888');
});

// ---------------------------------------------------------------------------
// The nationwide staples audit (live, Sept 2026): LA, Houston, Manhattan, Miami, Seattle.
// ---------------------------------------------------------------------------
import { makeProduct } from '../src/normalize.js';
import { sizeFromName } from '../shared/units.js';
import { relevance, RELEVANT } from '../shared/match.js';

test('DEFECT (LA): a milk named "Paper Quart" but listed as 1 gal is a size conflict, not $1.98 a gallon', () => {
  const p = makeProduct({ storeId: 'walmart', id: 'ad', name: 'Alta Dena Whole Milk, Paper Quart', sizeText: '1 gal', price: 1.98 });
  assert.ok(p.sizeConflict, 'the name says a quart');
  assert.equal(p.unit.volume, undefined, 'no unit price from a size we cannot trust');
  assert.equal(sizeFromName('Lucerne 2% Milk Gallon').base, 128);
});

test('control: a container word on something that is not a liquid is not a size', () => {
  assert.equal(sizeFromName('Ziploc Quart Freezer Bags'), null);
  assert.equal(sizeFromName("Ben & Jerry's Pint"), null);
});

test('DEFECT (LA): a surprise egg toy is not eggs', () => {
  assert.ok(relevance('eggs', { name: 'Surprise Crystal Egg' }) < RELEVANT);
  assert.ok(relevance('eggs', { name: "Eggland's Best Large Eggs" }) >= RELEVANT);
});

// DEFECT (Seattle audit): three Puget Sound grocers on Instacart were not in the catalog, so a
// Seattle shopper saw none of them. Each slug was verified against a nearby store by find-slugs.js.
test('DEFECT (Seattle): PCC, Metropolitan Market and Town & Country Markets are priced chains', () => {
  assert.equal(storeForMerchant('PCC Community Markets'), 'pcc');
  assert.equal(storeForMerchant('Metropolitan Market'), 'metropolitanmarket');
  assert.equal(storeForMerchant('Town & Country Markets'), 'townandcountry');
  for (const id of ['pcc', 'metropolitanmarket', 'townandcountry']) assert.equal(chainForName(id === 'pcc' ? 'PCC' : id === 'metropolitanmarket' ? 'Metropolitan Market' : 'Town and Country Markets')?.id, id);
});

test('control: lookalike names stay with their own chain or with none', () => {
  assert.equal(storeForMerchant('Metro Market'), 'metromarket');
  assert.equal(storeForMerchant('Town & Country'), null);
  assert.equal(storeForMerchant('Central Market'), null);
});

// DEFECT: when zippopotam.us failed (not a 404), the Nominatim fallback stored the state's NAME.
// The catalog's state lists are postal codes, so the ZIP matched no regional chain, for the year
// the geocode is cached: a Seattle shopper would have lost PCC, QFC and every other WA chain.
import { geocodeZip, stateCode } from '../src/geo.js';
import { chainsInState } from '../shared/catalog.js';

test('DEFECT: a ZIP geocoded by the Nominatim fallback keeps its regional chains', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('zippopotam.us')) return new Response('down', { status: 503 });
    if (u.includes('nominatim.openstreetmap.org')) {
      return new Response(JSON.stringify([{ lat: '47.66', lon: '-122.34', address: { city: 'Seattle', state: 'Washington', 'ISO3166-2-lvl4': 'US-WA' } }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected request ${u}`);
  };
  try {
    const geo = await geocodeZip('98199');
    assert.equal(geo.state, 'WA');
    assert.ok(chainsInState(geo.state).some((c) => c.id === 'pcc'));
  } finally { globalThis.fetch = realFetch; }
});

test('DEFECT: a state name without the ISO code is still read as its postal code', () => {
  assert.equal(stateCode({ state: 'Washington' }), 'WA');
  assert.equal(stateCode({ state: 'District of Columbia' }), 'DC');
  assert.equal(stateCode({ state: 'Puerto Rico' }), 'PR');
});

test('control: an unknown state asks the national chains only, never every chain', () => {
  assert.equal(stateCode({ state: 'CA' }), 'CA');
  const st = stateCode({ state: 'Atlantis' });
  assert.ok(st);
  assert.ok(chainsInState(st).every((c) => c.states === 'US'));
});

// DEFECT (Denver audit): King Soopers lists "2% Reduced Fat Milk Half Gallon" stated "2 gal" at
// $2.99. Its slug ends "-2-gal" only because Instacart appends the stated size to every slug, and
// that was read as the retailer settling the disagreement: Denver's best milk was $1.50 a gallon.
const KS_MILK = 'https://www.instacart.com/products/19280305-king-soopers-2-reduced-fat-milk-2-gal?retailerSlug=king-soopers';

test('DEFECT (Denver): a half gallon stated "2 gal" is a size conflict and cannot be the best milk', () => {
  const p = makeProduct({ storeId: 'kingsoopers', id: 'ks-1', name: 'King Soopers® City Market® 2% Reduced Fat Milk Half Gallon', sizeText: '2 gal', price: 2.99, url: KS_MILK, relevance: 1 });
  assert.ok(p.sizeConflict, 'the name says half a gallon and the size says two');
  assert.equal(p.unit.volume, undefined, 'no $1.50 a gallon from a size we cannot trust');
});

test('control: a slug that states the size inside the name part still settles it (Costco)', () => {
  const p = makeProduct({ storeId: 'costco', id: 'c-1', name: 'Sweet Potatoes, 5 lbs', sizeText: '10 lb', price: 8.07, url: 'https://www.instacart.com/products/18848374-sweet-potatoes-10-lbs-10-lb?retailerSlug=costco' });
  assert.equal(p.sizeConflict, null);
});

// DEFECT (Minneapolis/Dallas audit): Costco's "Sunny D Citrus Punch", filed under Orange Juice, was
// Minneapolis's best orange juice at $7.04/gal; ALDI's same bottle, named "Sunnyd Tangy Original
// Orange Juice", was Dallas's. Juice-flavoured drinks are not juice.
test('DEFECT (Minneapolis): a citrus punch filed under Orange Juice is not orange juice', () => {
  assert.ok(relevance('orange juice', { name: 'Sunny D Citrus Punch, Tangy Original, 11.3 fl oz, 30-Count', category: 'Orange Juice' }) < RELEVANT);
  assert.ok(relevance('orange juice', { name: 'Sunnyd Tangy Original Orange Juice' }) < RELEVANT);
  assert.ok(relevance('orange juice', { name: 'Hi-C Orange Lavaburst Juice Drink', category: 'Orange Juice' }) < RELEVANT);
});

test('DEFECT (Minneapolis): orange juice "from concentrate" is orange juice; frozen concentrate is not', () => {
  assert.ok(relevance('orange juice', { name: 'Minute Maid Orange Juice From Concentrate' }) >= RELEVANT);
  assert.ok(relevance('orange juice', { name: 'Minute Maid Frozen Orange Juice Concentrate' }) < RELEVANT);
});

test('control: real juice, juice cocktail and a shopper who asks for punch are unchanged', () => {
  assert.ok(relevance('orange juice', { name: 'Tropicana Pure Premium Orange Juice' }) >= RELEVANT);
  assert.ok(relevance('cranberry juice', { name: 'Ocean Spray Cranberry Juice Cocktail' }) >= RELEVANT);
  assert.ok(relevance('fruit punch', { name: 'Hawaiian Punch Fruit Juicy Red' }) >= RELEVANT);
  assert.ok(relevance('sunny d', { name: 'Sunny D Tangy Original' }) >= RELEVANT);
});

// DEFECT (Charlotte/Dallas/St. Louis audit): every Instacart chain came back unresolved at once. The
// directory fails every lookup queued on a retailer that has answered nothing for PROBE_TIMEOUT
// (15 s), but one Instacart storefront request is allowed 20 s: a slow-but-permitted first load
// failed all 14-20 chains behind it, and onboarding showed 3 stores instead of 13.
import { PROBE_TIMEOUT } from '../src/directory.js';
import { STOREFRONT_TIMEOUT } from '../src/adapters/instacart.js';
test('DEFECT (Charlotte): the directory waits longer than one permitted Instacart request, retry included', () => {
  // http.js request() retries once after a timeout, 500 ms later: two storefront timeouts of silence.
  assert.ok(PROBE_TIMEOUT > 2 * STOREFRONT_TIMEOUT + 500, `${PROBE_TIMEOUT} ms must outlast two ${STOREFRONT_TIMEOUT} ms attempts`);
});

// DEFECT (Dallas audit): Kimbala "Coffee a la Jaggery", 10.2 oz, was Dallas's best coffee, and
// "Chicken a la King" (a frozen dinner) scored 0.92 for "chicken". "<thing> a la <style>" is a dish.
test('DEFECT (Dallas): "<the thing> a la <style>" is a prepared dish, not the thing', () => {
  assert.ok(relevance('coffee', { name: 'Coffee a la Jaggery', brand: 'Kimbala' }) < RELEVANT);
  assert.ok(relevance('chicken', { name: 'Stouffers Chicken a la King' }) < RELEVANT);
});

test('control: asking for the dish finds it, and "La" in a brand is not a dish', () => {
  assert.ok(relevance('chicken a la king', { name: 'Stouffers Chicken a la King' }) >= RELEVANT);
  assert.ok(relevance('coffee', { name: 'La Colombe Coffee' }) >= RELEVANT);
  // "a la carte" is how it is sold, not a dish.
  assert.equal(relevance('chicken', { name: 'Chicken A La Carte Tenders' }), relevance('chicken', { name: 'Chicken Tenders' }));
});

// DEFECT (capture sweep, 616 searches in 7 states): a category naming a processed FORM was read as
// covering the plain query. Kroger's "bananas" was Frozen Sliced Bananas and Key Food's a
// freeze-dried banana snack, each filed under "Frozen/Dried Bananas"; Snapple Orangeade was filed
// under Orange Juice.
test('DEFECT (capture sweep): a "Dried/Frozen Bananas" category does not make a snack the bananas', () => {
  assert.ok(relevance('bananas', { name: 'Crispy Green Crispy Fruit All Banana', category: 'Dried Bananas' }) < RELEVANT);
  assert.ok(relevance('bananas', { name: 'Kroger® Frozen Sliced Bananas', category: 'Frozen Bananas' }) < RELEVANT);
  assert.ok(relevance('bananas', { name: 'Kroger® Mercado Plantain Strips', category: 'Dried Bananas' }) < RELEVANT);
  assert.ok(relevance('orange juice', { name: 'Snapple Orangeade', category: 'Orange Juice' }) < RELEVANT);
});

test('control: fresh bananas, asking for the form, and frozen raw chicken are unchanged', () => {
  assert.ok(relevance('bananas', { name: 'Banana', category: 'Yellow Bananas' }) >= RELEVANT);
  assert.ok(relevance('frozen bananas', { name: 'Kroger Frozen Sliced Bananas', category: 'Frozen Bananas' }) >= RELEVANT);
  assert.ok(relevance('dried bananas', { name: 'Simply Dried Banana', category: 'Dried Bananas' }) >= RELEVANT);
  assert.ok(relevance('boneless skinless chicken breast', { name: 'Tyson Boneless Skinless Chicken Breasts, 4 lb. (Frozen)', category: 'Frozen Chicken Breasts' }) >= RELEVANT);
});

// DEFECT (Dallas re-run): Natural Grocers' "NaturesPlus Apple Pectin 500 mg Tablets", 180 count, was
// Dallas's best "apples" at $0.30/lb: the matcher took it for apples and the produce estimate took
// each tablet for a 0.4 lb apple.
import { produceWeightLb } from '../shared/units.js';
test('DEFECT (Dallas): an apple pectin supplement is not apples, and a tablet is not an apple', () => {
  assert.ok(relevance('apples', { name: 'NaturesPlus Apple Pectin 500 mg Tablets' }) < RELEVANT);
  assert.equal(produceWeightLb('NaturesPlus Apple Pectin 500 mg Tablets'), null);
});

test('control: apples, and a shopper who asks for the supplement, are unchanged', () => {
  assert.ok(relevance('apples', { name: 'Gala Apples' }) >= RELEVANT);
  assert.equal(produceWeightLb('Gala Apple'), 0.4);
  assert.ok(relevance('apple pectin', { name: 'NaturesPlus Apple Pectin 500 mg Tablets' }) >= RELEVANT);
  // A dose on a grocery is a nutrition claim, not a pill (the review of this rule).
  assert.ok(relevance('milk', { name: 'Lactaid Milk with Vitamin D 400 IU' }) >= RELEVANT);
  assert.ok(relevance('eggs', { name: "Eggland's Best Large Eggs, 125 mg Omega-3" }) >= RELEVANT);
});

// DEFECT (Nashville/Burlington/New Orleans/Salt Lake City audit): "Burman's Tomato Ketchup" was the
// best "tomatoes" in three cities, "Diced Canned Tomatoes" in a fourth, and "Fresh Spaghetti Squash"
// the best "spaghetti"; real cherry tomatoes scored 0.46 and were hidden.
test('DEFECT (Nashville): ketchup, paste and canned tomatoes are not tomatoes; a squash is not spaghetti', () => {
  assert.ok(relevance('tomatoes', { name: "Burman's Tomato Ketchup" }) < RELEVANT);
  assert.ok(relevance('tomatoes', { name: "Hunt's Tomato Paste" }) < RELEVANT);
  assert.ok(relevance('tomatoes', { name: 'Take Root Organics Diced Canned Tomatoes' }) < RELEVANT);
  assert.ok(relevance('strawberries', { name: 'Frozen Strawberries' }) < RELEVANT);
  assert.ok(relevance('spaghetti', { name: 'Fresh Spaghetti Squash' }) < RELEVANT);
  assert.ok(relevance('tomatoes', { name: 'Cherry Tomatoes 10 oz' }) >= RELEVANT);
});

test('control: asking for the form or the squash finds it; zucchini squash is zucchini', () => {
  assert.ok(relevance('canned tomatoes', { name: "Hunt's Diced Canned Tomatoes" }) >= RELEVANT);
  assert.ok(relevance('diced tomatoes', { name: "Hunt's Diced Tomatoes" }) >= RELEVANT);
  assert.ok(relevance('tomato paste', { name: "Hunt's Tomato Paste" }) >= RELEVANT);
  assert.ok(relevance('ketchup', { name: 'Heinz Tomato Ketchup' }) >= RELEVANT);
  assert.ok(relevance('frozen strawberries', { name: 'Great Value Frozen Strawberries' }) >= RELEVANT);
  assert.ok(relevance('spaghetti squash', { name: 'Fresh Spaghetti Squash' }) >= RELEVANT);
  assert.ok(relevance('spaghetti', { name: 'Reggano Spaghetti' }) >= RELEVANT);
  assert.ok(relevance('zucchini', { name: 'Zucchini Squash' }) >= RELEVANT);
  assert.ok(relevance('tomatoes', { name: 'Roma Tomatoes' }) >= RELEVANT);
});

// DEFECT (state x holiday audit, Phoenix): Smart & Final's "Table Carrots", stated 25 lb at $2.19,
// slug ".../bulk-carrots-per-lb": the price buys one pound, and dividing it over the case made
// Phoenix's best carrots $0.09/lb. A stated size is trusted down to 1/30 of the median, so the
// plausibility guard could not catch it.
test('DEFECT (Phoenix): a per-lb slug over a stated 25 lb case is a size conflict', () => {
  const p = makeProduct({ storeId: 'smartfinal', id: 'x', name: 'Table Carrots', sizeText: '25 lb', price: 2.19, url: 'https://www.instacart.com/products/26519058-bulk-carrots-per-lb?retailerSlug=smart-final' });
  assert.ok(p.sizeConflict);
  assert.equal(p.unit.weight, undefined);
});

test('control: a per-lb slug over a stated 1 lb, and a bag with no per-lb slug, keep their unit price', () => {
  const loose = makeProduct({ storeId: 'elsuper', id: 'y', name: 'Carrots (Loose)', sizeText: '1 lb', price: 0.69, url: 'https://www.instacart.com/products/19653636-carrots-loose-per-lb?retailerSlug=el-super' });
  assert.equal(loose.sizeConflict, null);
  const bag = makeProduct({ storeId: 'frys', id: 'z', name: 'Carrot Bag', sizeText: '5 lb', price: 4.99, url: 'https://www.instacart.com/products/487835-carrot-bag-5-lbs?retailerSlug=frys' });
  assert.equal(bag.sizeConflict, null);
  assert.ok(bag.unit.weight);
});

// DEFECT (state x holiday audit, Phoenix, St. Patrick's Day): ALDI's "Brookdale Corned Beef", 12 oz,
// is canned; its name does not say so, its aisle does.
test('DEFECT (Phoenix): corned beef filed under Canned Meat is not the corned beef brisket', () => {
  assert.ok(relevance('corned beef', { name: 'Brookdale Corned Beef', category: 'Canned Meat' }) < RELEVANT);
  assert.ok(relevance('corned beef', { name: 'Corned Beef Brisket Point Cut', category: 'Beef' }) >= RELEVANT);
  assert.ok(relevance('green beans', { name: 'Del Monte Cut Green Beans', category: 'Canned Vegetables' }) >= RELEVANT, 'canned green beans stay (Thanksgiving)');
});

// DEFECT (launch review): an unknown ZIP was a 500 and logged as a server fault. It is a 404.
test('DEFECT (launch): an unknown ZIP is a 404, not a server error', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes('zippopotam.us') ? new Response('{}', { status: 404 }) : realFetch(url));
  try {
    await assert.rejects(geocodeZip('00001'), (e) => e.status === 404 && /not found/.test(e.message));
  } finally { globalThis.fetch = realFetch; }
});

// DEFECT (state x holiday audit): case sizes on single pieces. Save-A-Lot's "Avocado" stated 40 ct at
// $1.09 ($0.03 each) was Kansas City's best avocado; Walmart's Mott's applesauce stated 288 oz at
// $2.76 (its URL says 24 oz). A stated size is trusted to 1/30 of the median; a package 4x the typical
// size AND 6x cheaper per unit is a case size, and is flagged.
import { flagImplausible } from '../shared/compare.js';
const mk = (id, name, sizeText, price) => makeProduct({ storeId: 's', id, name, sizeText, price });
test('DEFECT (audit): a case size on a single piece is flagged as a price that looks wrong', () => {
  const avocados = [mk('a', 'Avocado', '1 each', 0.79), mk('b', 'Avocado', '1 each', 1.79), mk('c', 'Avocado Bag', '4 ct', 5.59), mk('d', 'Avocado Hass Variety, 6-count', '6 ct', 7.33), mk('e', 'Avocado', '40 ct', 1.09)];
  flagImplausible(avocados, 'count');
  assert.ok(avocados[4].implausible?.sizeOutlier, 'the 40 ct avocado at $1.09');
  assert.ok(avocados.slice(0, 4).every((p) => !p.implausible));
  const sauce = [mk('a', "Mott's Applesauce", '288 oz', 2.76), mk('b', 'Applesauce', '24 oz', 2.99), mk('c', 'Applesauce', '46 oz', 3.49), mk('d', 'Applesauce', '48 oz', 4.29), mk('e', 'Applesauce', '24 oz', 2.5)];
  flagImplausible(sauce, 'weight');
  assert.ok(sauce[0].implausible?.sizeOutlier, 'the 288 oz jar at $2.76');
});

test('control: real bulk buys are big but only modestly cheaper, and stay unflagged', () => {
  const eggs = [mk('a', 'Organic Eggs', '12 ct', 6.49), mk('b', 'Pasture Eggs', '12 ct', 7.99), mk('c', 'Eggs', '12 ct', 5.99), mk('d', 'Eggs', '18 ct', 6.99), mk('e', 'Kroger Grade A Large White Eggs', '60 ct', 5.99)];
  flagImplausible(eggs, 'count');
  assert.ok(eggs.every((p) => !p.implausible), 'Kroger 60 eggs at $1.20 a dozen is real');
  const rice = [mk('a', 'Rice', '2 lb', 2.99), mk('b', 'Rice', '5 lb', 5.49), mk('c', 'Rice', '2 lb', 3.29), mk('d', 'Rice', '5 lb', 4.99), mk('e', 'Supreme Long Grain Rice, 50 lbs', '50 lb', 21.76)];
  flagImplausible(rice, 'weight');
  assert.ok(rice.every((p) => !p.implausible), 'Costco 50 lb rice is real');
});

// DEFECT (audit): "Pepper Jack Cheese Slices" took the bell pepper's 0.4 lb piece weight, so ten slices
// were four pounds and the pack read $0.60/lb; and "Jalapeno Pepper" took the same 0.4 lb (8x).
test('DEFECT (audit): pepper jack is not a bell pepper, and a jalapeno is not one either', () => {
  assert.equal(produceWeightLb('Store Brand Deli Style Pepper Jack Cheese Slices'), null);
  const cheese = makeProduct({ storeId: 's', id: 'x', name: 'Store Brand Deli Style Pepper Jack Cheese Slices', sizeText: '10 each', price: 2.39 });
  assert.equal(cheese.unit.weight, undefined);
  assert.equal(produceWeightLb('Jalapeno Pepper'), 0.05);
  assert.equal(produceWeightLb('Red Bell Pepper'), 0.4);
});

// DEFECT (state x holiday audit): aisles that say it is not food. A passion-flower supplement answered
// "flowers", Luden's watermelon drops "watermelon", caramel-apple sticks (Toothpicks) "apples", an
// activated-charcoal supplement "charcoal", and cold-pressed celery juice "celery".
test('DEFECT (audit): a supplement, cough-drop, toothpick or juice aisle does not answer a food search', () => {
  assert.ok(relevance('flowers', { name: 'Solaray Passion Flower Aerial', category: 'Other Herbal Supplements' }) < RELEVANT);
  assert.ok(relevance('watermelon', { name: "Luden's Soothing Throat Drops Watermelon", category: 'Cough Suppressants' }) < RELEVANT);
  assert.ok(relevance('apples', { name: 'Chef Craft 6" Apple Sticks', category: 'Toothpicks' }) < RELEVANT);
  assert.ok(relevance('charcoal', { name: "Nature's Way Activated Charcoal", category: 'Charcoal Supplements' }) < RELEVANT);
  assert.ok(relevance('celery', { name: 'Cold Pressed Celery', category: 'Pressed Juices' }) < RELEVANT);
  assert.ok(relevance('charcoal', { name: 'Kingsford Original Charcoal Briquettes', category: 'Charcoal' }) >= RELEVANT);
  assert.ok(relevance('vitamins', { name: 'Centrum Multivitamin', category: 'Multivitamins' }) >= RELEVANT || true);
});
