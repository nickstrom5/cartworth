// QA: which stores a shopper is shown, and whether the distance and price basis attached to each
// one are true. Covers shared/catalog.js (which chains exist, how a weekly-ad merchant maps to a
// chain, which chains may be priced chain-wide) and src/directory.js (which of them are "near you").
//
// Convention, matching the other QA files here:
//   "DEFECT xx: …"  reproduces a real defect seen live on 23 Sep 2026 (round-2 items C1–C5) and
//                   asserts the CORRECT behaviour.
//   "control: …"    a neighbouring property that holds and must keep holding.
//
// Every test runs the production path end to end — directory() → the Flipp list → chainForName →
// each chain's price-source probe → the radius → assembly → counts, or searchStore() → the Instacart
// adapter → the result the browser receives — against answers recorded live from Flipp and Instacart
// on 23 Sep 2026 at the four test ZIPs. Those answers are seeded into the cache; the network is
// switched off, so an unseeded lookup fails loudly instead of quietly asking a retailer.
//
// The tests marked `todo` pin changes that belong in files this suite's owner does not own
// (src/search.js, src/adapters/instacart.js). They fail today, which is the point: they are the
// contract for those handoffs, and whoever applies them removes the `todo`.
//
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = process.env.BASKET_DATA_DIR || '/tmp/cartworth-qa-catalog';
process.env.BASKET_DATA_DIR ||= SCRATCH;
fs.mkdirSync(SCRATCH, { recursive: true });
// A database file of our own. This suite seeds cache rows for real ZIPs (60618, 53211…), and the
// other suites run in parallel processes against the same BASKET_DATA_DIR; they must never read
// our fixtures, and we must never read theirs.
const DB_FILE = path.join(SCRATCH, `qa-catalog-directory.${process.pid}.db`);
process.env.BASKET_DB = DB_FILE;
process.on('exit', () => {
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true });
});

// ---------------------------------------------------------------------------
// The network is off. The only thing that answers is a tiny fake Instacart used by the search
// tests, and only while `fakeInstacart` is set.
// ---------------------------------------------------------------------------
const network = [];
let fakeInstacart = null; // { items: [...] } while a search test runs
globalThis.fetch = async (input) => {
  const url = String(input?.url ?? input);
  network.push(url);
  const u = new URL(url);
  if (fakeInstacart && u.host === 'www.instacart.com') {
    if (/\/store\/[^/]+\/storefront$/.test(u.pathname)) return new Response('<html><body>storefront</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const op = u.searchParams.get('operationName');
    if (op === 'GetLastUserLocation') return Response.json({ data: { lastUserLocation: { zoneId: '974' } } });
    if (op === 'SearchResultsPlacements') {
      return Response.json({ data: { searchResultsPlacements: { placements: [{ content: { __typename: 'ItemGrid', itemIds: fakeInstacart.items.map((i) => i.id), items: fakeInstacart.items, featuredProducts: [] } }] } } });
    }
  }
  throw new TypeError(`network is disabled in this suite: ${url}`);
};

const { cacheSet, setKV } = await import('../src/db.js');
const { invalidate } = await import('../src/cache.js');
const { directory, countsFor, outsideRadius, UNRESOLVED_RETRY_MS, STATUS } = await import('../src/directory.js');
const { CHAINS, CHAIN_BY_ID, chainForName } = await import('../shared/catalog.js');
const { searchStore } = await import('../src/search.js');
const { contextFrom } = await import('../src/context.js');

// The adapters' cache keys carry a version that is private to them. Read it rather than copy it, so
// a bump there shows up here as a clear failure instead of a silent network attempt.
const SHOP_V = /const SHOP_CACHE_VERSION = (\d+)/.exec(fs.readFileSync(path.join(ROOT, 'src/adapters/instacart.js'), 'utf8'))?.[1];
if (!SHOP_V) throw new Error('src/adapters/instacart.js no longer declares SHOP_CACHE_VERSION — update this suite’s seeding');

const DAY = 86400000;
const HOUR = 3600000;

// ---------------------------------------------------------------------------
// Fixtures: recorded live on Wed 23 Sep 2026.
// ---------------------------------------------------------------------------
const GEO = {
  60618: { zip: '60618', lat: 41.9464, lng: -87.7042, city: 'Chicago', state: 'IL' },
  53211: { zip: '53211', lat: 43.082, lng: -87.8895, city: 'Milwaukee', state: 'WI' },
  53142: { zip: '53142', lat: 42.556, lng: -87.8705, city: 'Kenosha', state: 'WI' },
  99723: { zip: '99723', lat: 71.2346, lng: -156.8174, city: 'Barrow', state: 'AK' },
};

// [merchant, Flipp categories]
const G = ['All Flyers', 'Groceries'];
const FLYERS = {
  60618: [['Publix Liquors', ['All Flyers', 'Specialty']], ['Walmart', G], ['Jewel-Osco', G], ['Target', G], ['Health Mart Pharmacy', ['All Flyers', 'Pharmacy']]],
  53211: [
    ['ALDI', G], ['Cermak Fresh Market', G], ['Costco', G], ['Dollar General', G], ['Family Dollar', G], ['Festival Foods', G],
    ['Fresh Thyme Market', G], ['Health Mart Pharmacy', ['All Flyers', 'Pharmacy']], ['Hy-Vee', G], ['Meijer', G], ["Metcalfe's", G],
    ['Pick N Save', G], ['Restaurant Depot', G], ["Sam's Club", ['All Flyers']], ['Target', G], ['Walmart', G], ["Woodman's Food Market", G],
    ['Home Depot', ['All Flyers']],
  ],
  53142: [
    ['ALDI', G], ['Costco', G], ['Dollar General', G], ['Family Dollar', G], ['Festival Foods', G], ['Fresh Thyme Market', G],
    ["Heinen's Grocery Store", G], ['Hy-Vee', G], ['Jewel-Osco', G], ["Mariano's", G], ['Meijer', G], ['Pick N Save', G],
    ["Sam's Club", ['All Flyers']], ['Target', G], ["Tony's Fresh Market", G], ['Walmart', G], ["Woodman's Food Market", G],
  ],
  99723: [['Alaska Commercial', G], ['Costco', G], ["Sam's Club", ['All Flyers']]],
};

// slug -> [label, address, distance, serviceType, priceNote, canonical, retailer name]
const SHOPS = {
  53211: {
    aldi: ['ALDI - OAK 19 - Milwaukee', '225 East Capitol Drive, Milwaukee, WI 53212', 1.1, 'instore', 'Prices vary from in-store', false, 'ALDI'],
    'woodmans-food-markets': ['39 - Menomonee Falls', 'W124 N8145 HWY 145, MENOMONEE FALLS, WI 53051', 10.6, 'instore', 'Prices vary from in-store', false, "Woodman's Food Markets"],
    walmart: ['Walmart - 2697', '4893 Lone Tree Way, Antioch, CA 94531', 1801.1, 'delivery', 'No markups', true, 'Walmart'],
    costco: ['Costco  - Menomonee Falls Warehouse', 'W162 N9235 Pershing Avenue, Menomonee Falls, WI 53051', 13.2, 'delivery', 'Prices vary from in-store', false, 'Costco'],
    'sams-club': ["Sam's Club - 6324", '8050 N 124TH STREET, Milwaukee, WI 53224', 10.4, 'delivery', 'Prices vary from in-store', false, "Sam's Club"],
    'pick-n-save': ["(534-00882) Pick 'n Save - 1100 E Garfield Ave", '1100 E Garfield Ave, Milwaukee, WI 53212', 1.6, 'pickup', 'Prices vary from in-store', false, "Pick 'n Save"],
    'metro-market': ['(534-00893) Metro Market - 4075 North Oakland Avenue', '4075 North Oakland Avenue, Shorewood, WI 53211', 0.6, 'pickup', 'Prices vary from in-store', false, 'Metro Market'],
    meijer: ['Meijer - 277', '11111 W Burleigh St, Wauwatosa, WI 53222', 8.2, 'delivery', 'Prices vary from in-store', false, 'Meijer'],
    'hy-vee': ['1388 - Lincoln, NE #4', '6001 Village Dr, Lincoln, NE 68516', 478.8, 'delivery', 'No markups', true, 'Hy-Vee'],
    schnucks: ['269 - Godfrey', '2712 Godfrey, Godfrey, IL 62035', 311.5, 'delivery', 'No markups', true, 'Schnucks'],
    'festival-foods': ['West Allis', '11111 W Greenfield Ave, West Allis, WI 53214', 9.4, 'delivery', 'Prices vary from in-store', false, 'Festival Foods'],
    'the-fresh-market': ['Destin', '4495 Commons Drive West, Destin, FL 32541', 880.7, 'delivery', 'Prices vary from in-store', true, 'The Fresh Market'],
    'cermak-fresh-market': ['Cermak Produce #4', '2701 W North Ave, Chicago, IL 60647', 81.6, 'delivery', 'Prices vary from in-store', true, 'Cermak Produce Fresh Market'],
    'fresh-thyme-farmers-market': ['701 MKE', '470 East Pleasant, Milwaukee, WI 53202', 2.3, 'pickup', 'Prices vary from in-store', false, 'Fresh Thyme Market'],
    // order.shopthepig.com, Piggly Wiggly Midwest's own Instacart storefront (15:55, 23 Sep).
    shopthepig: ['Piggly Wiggly - Oklahoma Ave - Milwaukee', '123 W Oklahoma Ave, Milwaukee, WI 53207', 6.7, 'instore', 'No markups', false, 'Piggly Wiggly'],
  },
  53142: {
    aldi: ['ALDI - OAK 96 - Kenosha - Int. of 75th & Green Bay', '6404 75th Street, Kenosha, WI 53142', 1.1, 'instore', 'Prices vary from in-store', false, 'ALDI'],
    'woodmans-food-markets': ['27 - Kenosha', '7145 118TH AVENUE, KENOSHA, WI 53142', 4.1, 'instore', 'Prices vary from in-store', false, "Woodman's Food Markets"],
    walmart: ['Walmart - 2697', '4893 Lone Tree Way, Antioch, CA 94531', 1802.6, 'delivery', 'No markups', true, 'Walmart'],
    costco: ['Costco - Pleasant Prairie Warehouse', '7707 94th Ave, Pleasant Prairie, WI 53158', 2.5, 'delivery', 'Prices vary from in-store', false, 'Costco'],
    'sams-club': ["Sam's Club - 6331", '3300 Brumback Blvd, Kenosha, WI 53144', 3.6, 'delivery', 'Prices vary from in-store', false, "Sam's Club"],
    'pick-n-save': ["(534-00874) Pick 'n Save - 5710 75th Street", '5710 75th Street, Kenosha, WI 53142', 0.9, 'pickup', 'Prices vary from in-store', false, "Pick 'n Save"],
    'metro-market': ['(534-00887) Metro Market - 4279 S 76th Street', '4279 S 76th Street, Greenfield, WI 53220', 29.3, 'pickup', 'Prices vary from in-store', false, 'Metro Market'],
    meijer: ['Meijer - 284', '7701 Green Bay Rd, Kenosha, WI 53142', 0.9, 'delivery', 'Prices vary from in-store', false, 'Meijer'],
    'hy-vee': ['1388 - Lincoln, NE #4', '6001 Village Dr, Lincoln, NE 68516', 470.6, 'delivery', 'No markups', true, 'Hy-Vee'],
    schnucks: ['269 - Godfrey', '2712 Godfrey, Godfrey, IL 62035', 278.9, 'delivery', 'No markups', true, 'Schnucks'],
    'festival-foods': ['Kenosha', '3207 80th St., Kenosha, WI 53142', 1.2, 'delivery', 'Prices vary from in-store', false, 'Festival Foods'],
    'the-fresh-market': ['Lake Forest', '850 N Western Avenue, Lake Forest, IL 60045', 20.8, 'pickup', 'Prices vary from in-store', false, 'The Fresh Market'],
    'jewel-osco': ['Jewel-Osco - 3421', '1400 21st Street, Zion, IL 60099', 7.1, 'pickup', 'Prices vary from in-store', false, 'Jewel-Osco'],
    marianos: ["(531-00502) Mariano's - 1720 North Milwaukee Avenue", '1720 North Milwaukee Avenue, Vernon Hills, IL 60061', 21.1, 'pickup', 'Prices vary from in-store', false, "Mariano's"],
    'tonys-fresh-market': ['Waukegan', '1700 N Lewis Ave, Waukegan, IL 60085', 11.9, 'pickup', 'No markups', false, "Tony's Fresh Market"],
    'fresh-thyme-farmers-market': ['704 KEN', '7100 Green Bay Road, Kenosha, WI 53142', 1.4, 'pickup', 'Prices vary from in-store', false, 'Fresh Thyme Market'],
    shopthepig: ['Piggly Wiggly - Pershing Blvd - Kenosha', '7600 Pershing Blvd, Kenosha, WI 53142', 0.8, 'instore', 'No markups', false, 'Piggly Wiggly'],
  },
  60618: {
    walmart: ['Walmart - 2697', '4893 Lone Tree Way, Antioch, CA 94531', 1812.6, 'delivery', 'No markups', true, 'Walmart'],
    // What Instacart answered when the old directory asked about Publix for a Chicago ZIP.
    publix: ['Publix #783 - Publix at East Lake', '2235 Glenwood Ave SE, Atlanta, GA 30316', 596.4, 'delivery', 'Prices vary from in-store', true, 'Publix'],
    // Piggly Wiggly Midwest's own storefront offers in-store shopping at any ZIP: for Chicago it
    // answered with its Kenosha store, NOT flagged canonical (15:59, 23 Sep).
    shopthepig: ['Piggly Wiggly - Pershing Blvd - Kenosha', '7600 Pershing Blvd, Kenosha, WI 53142', 43.5, 'instore', 'No markups', false, 'Piggly Wiggly'],
  },
  99723: {
    walmart: ['Walmart - 2697', '4893 Lone Tree Way, Antioch, CA 94531', 2612.3, 'delivery', 'No markups', true, 'Walmart'],
    costco: ['San Francisco', '450 10th St, San Francisco, CA 94103', 2614.4, 'delivery', 'Prices vary from in-store', true, 'Costco'],
    'sams-club': ["Sam's Club - 8130", '5170 S. Cleveland Ave., Ft. Meyers, FL 33907', 4152.6, 'delivery', 'Prices vary from in-store', true, "Sam's Club"],
  },
};

const WFM = {
  53211: { id: '10197', name: 'Whole Foods Milwaukee', address: '2305 N Prospect Ave, Milwaukee, WI', distance: 1.5 },
  53142: { id: '10680', name: 'Whole Foods Vernon Hills', address: '851 N. Milwaukee Avenue, Vernon Hills, IL', distance: 22.1 },
};
const TJ = {
  53211: { id: '711', name: 'Trader Joe’s Glendale', address: '5600 N Port Washington Rd, Milwaukee, WI', distance: 2.9 },
  53142: { id: '704', name: 'Trader Joe’s Libertyville', address: '1600 S Milwaukee Ave, Libertyville, IL', distance: 21.2 },
};

function shopFrom([label, address, distance, serviceType, priceNote, canonical, name], i) {
  return {
    shopId: String(1000 + i), serviceType, serviceTypes: [serviceType], retailerId: '1', locationId: String(5000 + i),
    name, label, address, lat: null, lng: null, distance, priceNote, canonical,
  };
}
const shopKey = (price, zip) => `ic:shop:v${SHOP_V}:${price.base}:${price.slug}:${zip}`;

/**
 * Put one ZIP's recorded world into the cache: its coordinates, its Flipp list, and an answer for
 * every Instacart chain in the catalog — the recorded one where we have it, otherwise "no store"
 * (which is what Instacart said for every other chain). `skip` leaves chains unanswered, so their
 * probe fails the way a timeout does.
 */
function seedZip(zip, { skip = [], shops = SHOPS[zip] || {}, flyers = FLYERS[zip] || [] } = {}) {
  // Replace, never merely add: the cache keeps an in-memory copy in front of the database, and an
  // earlier test's answer for the same key would otherwise win.
  const put = (key, value, ttl) => {
    invalidate(key);
    if (value !== undefined) cacheSet(key, value, ttl);
  };
  put(`geo:zip:${zip}`, GEO[zip], 365 * DAY);
  put(`flipp:v2:flyers:${zip}`, flyers.map(([merchant, categories], i) => ({
    id: 9000 + i, merchant, storeId: null, name: 'Weekly Ad', validFrom: '2026-09-17T00:00:00-04:00', validTo: '2026-09-29T23:59:59-04:00', categories,
  })), 3 * HOUR);
  let i = 0;
  for (const c of CHAINS) {
    if (c.price?.type !== 'instacart') continue;
    const rec = shops[c.price.slug];
    put(shopKey(c.price, zip), skip.includes(c.id) ? undefined : rec ? shopFrom(rec, i++) : { none: true }, 3 * DAY);
  }
  put(`wfm:store:${zip}`, skip.includes('wholefoods') ? undefined : WFM[zip] || { none: true }, 7 * DAY);
  put(`tj:store:${zip}`, skip.includes('traderjoes') ? undefined : TJ[zip] || { none: true }, 7 * DAY);
}

const byId = (dir) => Object.fromEntries(dir.chains.map((c) => [c.id, c]));
const noNetwork = (before, why) => assert.deepEqual(network.slice(before), [], `${why}: the suite tried to reach ${network.slice(before).join(', ')}`);

// ---------------------------------------------------------------------------
// C4 — a liquor-store circular made Publix a Chicago store.
// ---------------------------------------------------------------------------

test('DEFECT C4a: "Publix Liquors" — the Southeast liquor chain’s circular Flipp carries for 60618 — is not Publix', () => {
  assert.equal(chainForName('Publix Liquors'), null);
  assert.equal(chainForName('Hy-Vee Wine & Spirits'), null, 'same shape: a chain name plus another line of business');
});

test('control: the chain’s own weekly-ad name, and names that only add grocery words, still map to it', () => {
  assert.equal(chainForName('Publix')?.id, 'publix');
  assert.equal(chainForName('Cermak Produce')?.id, 'cermak');
  assert.equal(chainForName("Woodman's Food Market")?.id, 'woodmans');
  assert.equal(chainForName('Pick N Save')?.id, 'picknsave');
  assert.equal(chainForName('Health Mart Pharmacy'), null, 'the earlier H Mart fix still holds');
  // The non-grocery rule may only ever reject an EXTENSION of a name. Every ads name and alias in
  // the catalog must still map to a chain — if one ever contained "pharmacy", "gas" or "wine",
  // this is where it would show up.
  const lost = [];
  for (const c of CHAINS) for (const n of [...(c.ads || []), ...c.aliases]) if (!chainForName(n)) lost.push(`${c.id}: ${n}`);
  assert.deepEqual(lost, [], 'a chain’s own name no longer maps to any chain');
});

test('DEFECT C4b: the Chicago 60618 directory does not list Publix, which has no Illinois stores', async () => {
  seedZip('60618');
  const n = network.length;
  const dir = await directory('60618', { maxMiles: 25, fresh: true });
  noNetwork(n, 'every answer was seeded');
  const c = byId(dir);
  assert.equal(c.publix, undefined, `Publix listed as ${c.publix?.status} — before the fix it was "weekly ad only" (the liquor ad), and once its probe landed, "national" with Atlanta prices`);
  assert.equal(c.walmart?.status, STATUS.national, 'control: Walmart, with a real Walmart circular here, is still listed');
});

// ---------------------------------------------------------------------------
// C2 — a canonical storefront is not a store near you, and says nothing about one.
// ---------------------------------------------------------------------------

test('DEFECT C2a: a canonical Instacart answer is not a Milwaukee store unless the chain prices chain-wide', async () => {
  seedZip('53211');
  const dir = await directory('53211', { maxMiles: 25, fresh: true });
  const c = byId(dir);
  // Hy-Vee (Lincoln NE) and Cermak (one Chicago store, 81.6 mi) advertise here, so they keep their
  // weekly ad — but neither is priced. Schnucks (Godfrey IL) and The Fresh Market (Destin FL) have
  // no circular here either, so they are not "near you" in any sense.
  assert.equal(c.hyvee?.status, STATUS.adsOnly, `Hy-Vee: ${c.hyvee?.status}`);
  assert.equal(c.cermak?.status, STATUS.adsOnly, `Cermak: ${c.cermak?.status}`);
  assert.equal(c.schnucks, undefined, `Schnucks listed as ${c.schnucks?.status}`);
  assert.equal(c.freshmarket, undefined, `The Fresh Market listed as ${c.freshmarket?.status}`);
  const national = dir.chains.filter((x) => x.status === STATUS.national).map((x) => x.id);
  assert.deepEqual(national, ['walmart'], 'only the chain-wide listing is national');
});

test('control: the directory’s chain-wide listing carries the chain and nothing that locates a store', async () => {
  seedZip('53211');
  const dir = await directory('53211', { maxMiles: 25, fresh: true });
  const w = byId(dir).walmart;
  assert.equal(w.status, STATUS.national);
  assert.equal(w.address, null);
  assert.equal(w.distance, null);
  const json = JSON.stringify(dir);
  assert.ok(!/Antioch|Lone Tree|1801/.test(json), 'the canonical storefront leaked into the directory');
});

// ---------------------------------------------------------------------------
// C5 — "N chains within 25 miles" must be a count of stores within 25 miles, and must not move
// because one probe was slow.
// ---------------------------------------------------------------------------

test('DEFECT C5a: "within N miles" counts only stores located inside the radius; the chain-wide listing is counted apart', async () => {
  seedZip('53211');
  const dir = await directory('53211', { maxMiles: 25, fresh: true });
  assert.ok(dir.counts, 'the directory reports no counts, so every screen counts for itself');
  const nearby = dir.chains.filter((x) => x.status === STATUS.shelf || x.status === STATUS.online);
  for (const x of nearby) assert.ok(x.distance != null && x.distance <= 25, `${x.id} is counted as nearby at ${x.distance} mi`);
  // Recorded 23 Sep: ALDI, Whole Foods, Trader Joe's, Woodman's, Piggly Wiggly (shelf); Metro Market,
  // Pick 'n Save, Fresh Thyme, Meijer, Festival, Sam's Club, Costco (online). Round 1's "15 chains
  // within 25 miles" also counted Walmart, Hy-Vee, Cermak, Schnucks and The Fresh Market.
  assert.deepEqual(dir.counts, { nearby: 12, national: 1, adsOnly: 5, unresolved: 0 });
  assert.deepEqual(countsFor(dir.chains, dir.unresolved), dir.counts);
});

test('DEFECT C5b: a chain-wide listing with no circular here is not a store near you (Walmart, Barrow AK)', async () => {
  seedZip('99723');
  const dir = await directory('99723', { maxMiles: 25, fresh: true });
  const c = byId(dir);
  // Recorded: Walmart, Costco and Sam's Club all answered Barrow with canonical storefronts in
  // Antioch CA, San Francisco and Fort Myers. Barrow has none of the three.
  assert.equal(c.walmart, undefined, `Walmart listed as ${c.walmart?.status} with no Walmart circular and no store`);
  assert.notEqual(c.costco?.status, STATUS.national, 'Costco is not chain-wide');
  assert.notEqual(c.samsclub?.status, STATUS.national, 'Sam’s Club is not chain-wide');
  assert.equal(dir.counts.nearby + dir.counts.national, 0);
});

test('DEFECT C5c: a probe that fails is reported, and the build is retried instead of kept for three days', async () => {
  // The Fresh Market at Lake Forest IL (20.8 mi) has no circular at 53142, so when its probe timed
  // out it vanished without a trace — and the build was cached for three days.
  seedZip('53142', { skip: ['freshmarket'] });
  const first = await directory('53142', { maxMiles: 25, fresh: true });
  assert.equal(byId(first).freshmarket, undefined);
  assert.deepEqual(first.unresolved, ['freshmarket'], 'the failed probe is not reported');
  assert.equal(first.counts.unresolved, 1);

  // Meanwhile the slow request finishes and caches its answer, as the adapter does after our timeout.
  cacheSet(shopKey(CHAIN_BY_ID.freshmarket.price, '53142'), shopFrom(SHOPS[53142]['the-fresh-market'], 99), 3 * DAY);
  first.builtAt -= UNRESOLVED_RETRY_MS + 1000; // …and the retry window passes.

  const n = network.length;
  const again = await directory('53142', { maxMiles: 25 });
  noNetwork(n, 'the retry is answered from the cache');
  assert.equal(byId(again).freshmarket?.status, STATUS.online, 'the incomplete build was served again instead of being rebuilt');
  assert.equal(byId(again).freshmarket?.distance, 20.8);
  assert.deepEqual(again.unresolved, []);
});

test('control: a complete build is not rebuilt inside its three days', async () => {
  seedZip('53142');
  const a = await directory('53142', { maxMiles: 40, fresh: true });
  a.builtAt -= UNRESOLVED_RETRY_MS + 1000;
  const b = await directory('53142', { maxMiles: 40 });
  assert.equal(b, a, 'a complete build was rebuilt — that is a full re-probe of every chain');
});

test('DEFECT C5d: a local store whose location could not be read is not counted inside the radius (constructed case)', async () => {
  // Not seen live — every shop resolved on 23 Sep had a distance — but "within 25 miles" is a claim
  // about distance, and the old code counted a store with no distance as inside any radius.
  const rec = [...SHOPS[53211]['festival-foods']];
  rec[1] = null;
  rec[2] = null;
  seedZip('53211', { shops: { ...SHOPS[53211], 'festival-foods': rec } });
  const dir = await directory('53211', { maxMiles: 15, fresh: true });
  const f = byId(dir).festivalfoods;
  assert.notEqual(f?.status, STATUS.online, 'a store with no distance was counted as within 15 miles');
  assert.ok(dir.unresolved.includes('festivalfoods'), 'and it is reported, so it is retried');
  seedZip('53211'); // restore for later tests
});

test('DEFECT C5e: a directory built under the old rule is not served from the cache', async () => {
  // The 60618 build as the old code cached it at 14:05 on 23 Sep, a minute after the first build:
  // Publix, Hy-Vee, Cub, Dierbergs and Schnucks "national". Cached for three days, stale for thirty.
  seedZip('60618');
  const old = {
    zip: '60618', city: 'Chicago', state: 'IL', maxMiles: 15, otherMerchants: [], adsError: null, builtAt: Date.now(),
    chains: ['publix', 'hyvee', 'cub', 'dierbergs', 'schnucks', 'walmart'].map((id) => ({ id, name: CHAIN_BY_ID[id].name, short: CHAIN_BY_ID[id].short, status: 'national', hasAds: id !== 'cub', distance: null, address: null, note: null, priceNote: null, error: null })),
  };
  cacheSet('dir:v1:60618:15', old, 3 * DAY);
  const dir = await directory('60618', { maxMiles: 15 });
  assert.equal(byId(dir).publix, undefined, 'the old build — Publix priced from Atlanta for a Chicago shopper — was served');
  assert.ok(dir.counts, 'an old-shape build was served');
});

test('DEFECT C5f: a store located near Kenosha is still counted in a week its circular does not reach the ZIP', async () => {
  // Jewel-Osco (Zion IL, 7.1 mi), Tony's (Waukegan, 11.9 mi) and Mariano's (Vernon Hills, 21.1 mi)
  // are not Wisconsin chains, so they are asked about 53142 only when Flipp carries their weekly ad
  // there. On 23 Sep it did. Flipp's list changes day to day; the stores do not.
  seedZip('53142');
  const withAds = await directory('53142', { maxMiles: 25, fresh: true });
  assert.equal(withAds.counts.nearby, 15);
  const outOfState = ['Jewel-Osco', "Mariano's", "Tony's Fresh Market"];
  seedZip('53142', { flyers: FLYERS[53142].filter(([m]) => !outOfState.includes(m)) });
  const n = network.length;
  const week2 = await directory('53142', { maxMiles: 25, fresh: true });
  noNetwork(n, 'a remembered chain is answered from the store cache');
  const c = byId(week2);
  for (const [id, miles] of [['jewel', 7.1], ['tonys', 11.9], ['marianos', 21.1]]) {
    assert.equal(c[id]?.distance, miles, `${id} dropped out of "within 25 miles" because its circular did not reach 53142 this week (status ${c[id]?.status})`);
  }
  assert.equal(week2.counts.nearby, 15, `the count moved from 15 to ${week2.counts.nearby} with no store opening or closing`);
  assert.equal(c.jewel.hasAds, false, 'and it no longer claims a weekly ad here');
  seedZip('53142'); // restore
});

test('control: a remembered chain is only asked, never assumed — gone from its source, it is gone from the directory', async () => {
  seedZip('53142');
  await directory('53142', { maxMiles: 25, fresh: true }); // remembers Jewel at 7.1 mi
  const shops = { ...SHOPS[53142] };
  delete shops['jewel-osco']; // Instacart now says no Jewel serves 53142
  seedZip('53142', { shops, flyers: FLYERS[53142].filter(([m]) => m !== 'Jewel-Osco') });
  const dir = await directory('53142', { maxMiles: 25, fresh: true });
  assert.equal(byId(dir).jewel, undefined, `Jewel kept as ${byId(dir).jewel?.status} on memory alone`);
  seedZip('53142'); // restore
});

// ---------------------------------------------------------------------------
// C1 — the radius.
// ---------------------------------------------------------------------------

test('control: at 10 miles, the Milwaukee directory prices nothing further than 10 miles', async () => {
  seedZip('53211');
  const dir = await directory('53211', { maxMiles: 10, fresh: true });
  const c = byId(dir);
  // Costco 13.2, Woodman's 10.6, Sam's Club 10.4: all advertise here, so all stay as weekly ads —
  // still showing their true distance, which is what tells the shopper why they are not priced.
  for (const id of ['costco', 'woodmans', 'samsclub']) assert.equal(c[id]?.status, STATUS.adsOnly, `${id}: ${c[id]?.status}`);
  const priced = dir.chains.filter((x) => x.status === STATUS.shelf || x.status === STATUS.online);
  for (const x of priced) assert.ok(x.distance != null && x.distance <= 10, `${x.id} priced at ${x.distance} mi`);
  assert.equal(dir.counts.nearby, priced.length);
});

test('control: outsideRadius is "known and further", never "unknown"', () => {
  assert.equal(outsideRadius(13.2, 10), true);
  assert.equal(outsideRadius(10, 10), false, 'exactly on the radius is inside it');
  assert.equal(outsideRadius(null, 10), false);
  assert.equal(outsideRadius(undefined, 10), false);
});

// ---------------------------------------------------------------------------
// C3 — Wisconsin coverage.
// ---------------------------------------------------------------------------

test('DEFECT C3: Fresh Thyme is priced in Milwaukee and Kenosha, from its own local stores', async () => {
  for (const [zip, miles] of [['53211', 2.3], ['53142', 1.4]]) {
    seedZip(zip);
    const dir = await directory(zip, { maxMiles: 25, fresh: true });
    const f = byId(dir).freshthyme;
    assert.equal(f?.status, STATUS.online, `${zip}: Fresh Thyme is ${f?.status}`);
    assert.equal(f.distance, miles);
    assert.equal(f.hasAds, true, 'and it keeps its weekly ad');
  }
});

test('DEFECT C3b: Piggly Wiggly is priced in Milwaukee and Kenosha from Piggly Wiggly Midwest’s own store site', async () => {
  // Round 1 found it `price: none`, and the marketplace's 'piggly-wiggly' is the Southern chain
  // (canonical, 844-878 mi). The Wisconsin stores sell through order.shopthepig.com.
  for (const [zip, miles] of [['53211', 6.7], ['53142', 0.8]]) {
    seedZip(zip);
    const dir = await directory(zip, { maxMiles: 25, fresh: true });
    const p = byId(dir).piggly;
    assert.equal(p?.status, STATUS.shelf, `${zip}: Piggly Wiggly is ${p?.status}`);
    assert.equal(p.distance, miles);
    assert.equal(p.hasAds, false, 'no Piggly Wiggly circular reached these ZIPs that week — it is found by its price source alone');
  }
});

test('control: Piggly Wiggly’s Kenosha store, offered to a Chicago shopper as if local, is 43.5 mi away and not near 60618', async () => {
  seedZip('60618');
  const dir = await directory('60618', { maxMiles: 25, fresh: true });
  assert.equal(byId(dir).piggly, undefined, `Piggly Wiggly listed as ${byId(dir).piggly?.status} at ${byId(dir).piggly?.distance} mi`);
});

test('control: Metro Market is absent at Kenosha 53142 because its nearest store is 29.3 mi away, and present at 40 miles', async () => {
  seedZip('53142');
  const at25 = await directory('53142', { maxMiles: 25, fresh: true });
  assert.equal(byId(at25).metromarket, undefined);
  const at40 = await directory('53142', { maxMiles: 40, fresh: true });
  assert.equal(byId(at40).metromarket?.distance, 29.3);
});

// ---------------------------------------------------------------------------
// The search side. These belong to src/search.js and src/adapters/instacart.js (handoffs H1, H2).
// ---------------------------------------------------------------------------

const BUTTER = {
  id: 'items_1-1', productId: '1', legacyId: '1', name: 'Land O Lakes Salted Butter', size: '16 oz', brandName: 'Land O Lakes',
  price: { viewSection: { itemCard: { priceString: '$5.49' } } }, availability: { available: true }, viewSection: { trackingProperties: {} }, tags: [],
};

async function search(storeId, qs, { fresh = true } = {}) {
  setKV('ic:session:https://www.instacart.com', { cookies: { '__Host-instacart_sid': 'qa' }, created: Date.now() });
  fakeInstacart = { items: [BUTTER] };
  try {
    return await searchStore(storeId, 'butter', contextFrom(new URL(`http://x/api/search?${qs}&stores=${storeId}`)), { fresh });
  } finally {
    fakeInstacart = null;
  }
}

test('DEFECT: saved prices served when the store is skipped say when the store answered', async () => {
  seedZip('53211');
  const before = Date.now();
  const first = await search('costco', 'zip=53211&miles=25');
  const after = Date.now();
  assert.equal(first.status, 'ok', first.error || first.message);
  assert.equal(first.savedAt, null, 'a fresh answer is not stale and carries no saved age');
  // An hour later the 20-minute cache has expired and the guard sheds the lookup (src/guard.js),
  // so the saved answer is served. Its savedAt is when the store answered, not when the copy was
  // served. Nothing in this lookup reaches a retailer, so moving the clock for it is safe.
  const ctx = contextFrom(new URL('http://x/api/search?zip=53211&miles=25&stores=costco'));
  Object.defineProperty(ctx, 'admitCold', { value: () => false, enumerable: false });
  const realNow = Date.now;
  let r;
  try {
    Date.now = () => realNow() + 3600_000;
    r = await searchStore('costco', 'butter', ctx);
  } finally {
    Date.now = realNow;
  }
  assert.equal(r.status, 'ok');
  assert.match(r.stale, /busy/);
  assert.ok(r.savedAt >= before && r.savedAt <= after, `savedAt ${r.savedAt} is not when the store answered (${before}..${after})`);
});

test('DEFECT: saved prices served because the store failed say when the store answered', async () => {
  seedZip('53211');
  const before = Date.now();
  const first = await search('costco', 'zip=53211&miles=25');
  const after = Date.now();
  assert.equal(first.status, 'ok', first.error || first.message);
  // The store is asked again (fresh) and fails: fakeInstacart is off, so Instacart errors. The clock
  // is left alone here, because this lookup does reach the (fake) network and its politeness spacing.
  await new Promise((res) => setTimeout(res, 20));
  const r = await searchStore('costco', 'butter', contextFrom(new URL('http://x/api/search?zip=53211&miles=25&stores=costco')), { fresh: true });
  assert.equal(r.status, 'ok', r.error || r.message);
  assert.ok(r.stale, 'saved prices served after a failure are marked stale');
  assert.ok(r.savedAt >= before && r.savedAt <= after, `savedAt ${r.savedAt} is not when the store answered (${before}..${after})`);
});

// Trip plans and watches use the same saved copies. Two days on, with every lookup shed, a plan and
// a watch are both priced from the copy saved now: they must say so, and neither may write that
// days-old price into the price history (or a watch's own history) as if it were seen today.
async function shedTwoDaysOn(fn) {
  seedZip('53211');
  const first = await search('costco', 'zip=53211&miles=25');
  assert.equal(first.status, 'ok', first.error || first.message);
  const ctx = contextFrom(new URL('http://x/api/search?zip=53211&miles=25&stores=costco'));
  Object.defineProperty(ctx, 'admitCold', { value: () => false, enumerable: false });
  const realNow = Date.now;
  const later = realNow() + 2 * 86400_000;
  try {
    Date.now = () => later; // frozen is safe here: nothing in a shed lookup waits on the clock
    return { out: await fn(ctx), key: first.items[0].key, later };
  } finally {
    Date.now = realNow;
  }
}

test('DEFECT: a trip plan priced from saved prices says when they were saved, and records no history', async () => {
  const { optimize } = await import('../src/list.js');
  const { productHistory } = await import('../src/history.js');
  const { out, key, later } = await shedTwoDaysOn((ctx) => optimize([{ id: 1, text: 'butter' }], ctx));
  const cell = out.items[0].perStore.costco;
  assert.ok(cell, JSON.stringify(out.items[0]));
  assert.ok(cell.savedAt > 0 && cell.savedAt < later - 86400_000, `savedAt ${cell.savedAt}`);
  assert.ok(!productHistory(key).series.some((pt) => pt.t >= later), 'a saved price was recorded as seen two days later');
});

test('DEFECT: a watch checked from saved prices marks them saved and adds no reading', async () => {
  const { checkWatch } = await import('../src/watch.js');
  const { productHistory } = await import('../src/history.js');
  const { out, key, later } = await shedTwoDaysOn((ctx) => checkWatch({ query: 'butter' }, ctx));
  assert.ok(!productHistory(key).series.some((pt) => pt.t >= later), 'a saved price was recorded as seen two days later');
  assert.ok(out.result.stores.costco, JSON.stringify(out.result));
  assert.ok(out.result.stores.costco.savedAt > 0 && out.result.stores.costco.savedAt < later - 86400_000);
  assert.deepEqual(out.points, [], 'a saved price became a new watch reading');
});

test('control: a watch checked live adds its reading and carries no saved time', async () => {
  const { checkWatch } = await import('../src/watch.js');
  seedZip('53211');
  setKV('ic:session:https://www.instacart.com', { cookies: { '__Host-instacart_sid': 'qa' }, created: Date.now() });
  fakeInstacart = { items: [BUTTER] };
  let out;
  try {
    out = await checkWatch({ query: 'butter' }, contextFrom(new URL('http://x/api/search?zip=53211&miles=25&stores=costco')), { fresh: true });
  } finally {
    fakeInstacart = null;
  }
  assert.equal(out.points.length, 1);
  assert.equal('savedAt' in out.result.stores.costco, false);
});

test('DEFECT C1: /api/search at a 10-mile radius does not price Costco’s warehouse 13.2 miles away', async () => {
  seedZip('53211');
  const r = await search('costco', 'zip=53211&miles=10');
  assert.equal(r.items.length, 0, `${r.items.length} Costco prices at 13.2 mi for a 10-mile radius`);
  assert.equal(r.status, 'tooFar');
});

test('control: the same search at 25 miles prices Costco', async () => {
  seedZip('53211');
  const r = await search('costco', 'zip=53211&miles=25');
  assert.equal(r.status, 'ok', r.error || r.message);
  assert.equal(r.items.length, 1);
  assert.equal(r.location.distance, 13.2);
});

test('DEFECT C2c: a Walmart search result carries no Antioch CA address and no 1,801-mile distance', async () => {
  seedZip('53211');
  const r = await search('walmart', 'zip=53211&miles=25');
  assert.equal(r.status, 'ok', r.error || r.message);
  assert.equal(r.items[0].priceBasis, 'national');
  assert.equal(r.location.address, null, `address ${r.location.address}`);
  assert.equal(r.location.distance, null, `distance ${r.location.distance}`);
  assert.equal(r.location.canonical, true, 'the browser reads this flag (public/js/views/compare.js localLocation)');
  assert.ok(!/Antioch|2697/.test(JSON.stringify(r.location)), JSON.stringify(r.location));
});

test('DEFECT C2d: a chain that is not chain-wide is never priced from its canonical storefront (Hy-Vee, Lincoln NE, for Milwaukee)', async () => {
  seedZip('53211');
  const r = await search('hyvee', 'zip=53211&miles=25');
  assert.equal(r.items.length, 0, `${r.items.length} Hy-Vee prices from a store 478.8 mi away, labelled "national"`);
});

// Found by running the first draft of H1 + H2 live (15:40, 23 Sep): they passed every test above,
// which all search `fresh`, and failed the first real search. The search cache key carries no
// radius and outlives a deploy (SQLite, 20 minutes; up to three days stale when Instacart errors),
// so a Walmart answer cached by today's code — Antioch's address and 1801.1 mi still attached — was
// served to the new code, whose radius check then threw away Walmart's real chain-wide prices and
// told a Milwaukee shopper "The nearest Walmart is 1801.1 mi away, outside your 10-mile radius".
// That is the C2 defect again, worse. The fix is the src/search.js CACHE_VERSION bump that has to
// ship with H2, plus H1 never applying the radius to a chain-wide result.
const WALMART_CACHED_V6 = {
  // Recorded from /api/search?q=butter&zip=53211&miles=10 on this code at 15:38, 23 Sep 2026.
  items: [{
    key: 'walmart:20636412', storeId: 'walmart', locationId: '87833', id: '20636412', name: 'Great Value Salted Butter Sticks', brand: 'Great Value',
    size: '16 oz', sizeText: '16 oz', sizeConflict: null, dim: 'weight', base: 16, soldBy: 'each', price: 3.06, regularPrice: null, memberPrice: null,
    memberLabel: null, memberUnit: null, estPkg: null, onSale: false, pctOff: null, promo: null, saleEnds: null, unit: { weight: { perBase: 0.19125, est: false } },
    image: null, url: 'https://www.instacart.com/products/20636412-great-value-butter-salted-sweet-cream-4-ct?retailerSlug=walmart', stock: 'highlyInStock',
    available: true, category: 'Salted Butter', tags: ['storeBrand'], sponsored: false, rank: 0, total: 1, priceBasis: 'national',
  }],
  location: { name: 'Walmart - 2697', address: '4893 Lone Tree Way, Antioch, CA 94531', distance: 1801.1, serviceType: 'delivery', priceNote: 'No markups', id: '90203' },
};

test('DEFECT C2e: a Walmart answer cached before the fix is neither served with Antioch attached nor dropped as "1801.1 mi away"', async () => {
  seedZip('53211');
  const key = 'search:v6:walmart:instacart:53211:butter';
  invalidate(key);
  cacheSet(key, WALMART_CACHED_V6, 20 * 60000);
  const r = await search('walmart', 'zip=53211&miles=10', { fresh: false });
  assert.notEqual(r.status, 'tooFar', `Walmart's chain-wide prices were dropped: "${r.message}"`);
  assert.equal(r.status, 'ok', r.error || r.message);
  assert.ok(r.items.length > 0 && r.items.every((p) => p.priceBasis === 'national'), 'Walmart’s chain-wide prices are still priced, as national');
  assert.ok(!/Antioch|Lone Tree|1801/.test(JSON.stringify(r.location)), `served with the canonical storefront attached: ${JSON.stringify(r.location)}`);
});

// DEFECT: a geocode made by the Nominatim fallback before the fix carries the state's NAME and is
// cached for a year. Read as-is it matched no chain's state list, so Metro Market — 0.6 mi away,
// fully priced, no circular this week — was never asked.
test('DEFECT: a cached geocode that names its state ("Wisconsin") still finds the in-state chains', async () => {
  seedZip('53211');
  invalidate('geo:zip:53211');
  cacheSet('geo:zip:53211', { ...GEO[53211], state: 'Wisconsin' }, 365 * DAY);
  invalidate('dir:');
  const c = byId(await directory('53211', { maxMiles: 25, fresh: true }));
  assert.ok([STATUS.shelf, STATUS.online].includes(c.metromarket?.status), `Metro Market: ${c.metromarket?.status}`);
});
