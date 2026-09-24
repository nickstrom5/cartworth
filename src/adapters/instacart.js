// Instacart-powered storefronts (aldi.us, shopwoodmans.com) and the instacart.com marketplace.
//
// Flow: guest session (cookie) -> ShopCollectionScoped (nearest shop for a ZIP)
//       -> SearchResultsPlacements (ordered item ids) -> Items (prices).
// The site uses persisted GraphQL queries identified by sha256 hashes. We read the current
// hashes from the site's own "operation-hashes" manifest so we keep working after deploys,
// and fall back to known hashes if discovery fails.
import { request, CookieJar, HttpError } from '../http.js';

// Every host this adapter reads gets the owner's rule from src/http.js (DEFAULT_HOST_POLICY: one
// request in flight, 700 ms apart, stop on 429). The looser per-host limits that used to be set
// here were removed at the owner's decision (Sept 2026); long queues are handled by
// withStallTimeout, not by asking faster.
import { cached, invalidate, HOUR, DAY } from '../cache.js';
import { geocodeZip, miles } from '../geo.js';
import { getKV, setKV, delKV } from '../db.js';
import { makeProduct, money, settleByStatedCount, slugStates } from '../normalize.js';
import { parseSize, sizeFromName } from '../../shared/units.js';

const FALLBACK_HASHES = {
  SearchResultsPlacements: 'c127efb3fa85276388954593f2c1a27eb0775dd7b0964e39c949e7fd89c7ef19',
  Items: '396b053077ec2644bac71a1876c3bbdc86d72833f1dbb3f4da56c9a280864372',
  ShopCollectionScoped: 'f20693c3c551f0e0fbdcac9b2ca7aa6db50f9224a39967ba5ac767bb2b598f85',
  GetRetailerLocationAddress: 'b80a5ef08c6fe88df0b9a2e78a099dd6141345b213df0f9f517803674b6eee94',
  GetLastUserLocation: '6c76952dbbaf5fe8b79d2ae6dc96af8ccca133285868e7efb9a81ffe624e37e1',
  StoreInfoModalContentQuery: 'd22b42d094a216695f0fb045c4eb3ad6eb6d4dac16e632b98276163f34546ebf',
  HomepagePbiCreateGuestUserWithPostalCodeMutation: '60933aab54d6b3f2add1fec396506dae6ef9b6a1891effbdaf39db129e787446',
};

const SESSION_MAX_AGE = 5 * DAY;
const SHOP_CACHE_VERSION = 2;
const sessions = new Map(); // base -> { jar, created, hashes, zone }
const pendingSessions = new Map();

// ---------------- hash manifest discovery ----------------

function runtimeUrl(html) {
  const m = String(html).match(/https:\/\/[a-z0-9.-]+\/assets\/rspack\/runtime\.webpack_bundle-[0-9a-f]+-v3\.js/);
  return m ? m[0] : null;
}

async function discoverHashes(html, { fresh = false } = {}) {
  const rt = runtimeUrl(html);
  if (!rt) return {};
  return cached(`ic:manifest:${rt}`, 12 * HOUR, async () => {
    const runtime = (await request(rt, { okOnly: true, timeout: 15000 })).text;
    const idm = runtime.match(/(\d+):"operation-hashes"/);
    if (!idm) throw new Error('operation-hashes chunk not listed in runtime');
    const hm = runtime.match(new RegExp(`[,{]${idm[1]}:"([0-9a-f]{8,32})"`));
    if (!hm) throw new Error('operation-hashes chunk hash not found');
    const base = rt.slice(0, rt.lastIndexOf('/') + 1);
    const js = (await request(`${base}operation-hashes-${hm[1]}-v3.webpack_chunk.js`, { okOnly: true, timeout: 15000 })).text;
    const jm = js.match(/JSON\.parse\('([\s\S]*)'\)/);
    if (!jm) throw new Error('operation-hashes manifest not parseable');
    const map = JSON.parse(jm[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    if (!map.Items) throw new Error('manifest missing Items');
    return map;
  }, { fresh });
}

// ---------------- sessions ----------------

async function getSession(cfg, zip, { reset = false } = {}) {
  const key = cfg.base;
  const s = sessions.get(key);
  if (!reset && s && Date.now() - s.created < SESSION_MAX_AGE && s.jar.has('__Host-instacart_sid')) return s;
  if (pendingSessions.has(key)) return pendingSessions.get(key);
  const p = createSession(cfg, zip, { reset }).finally(() => pendingSessions.delete(key));
  pendingSessions.set(key, p);
  return p;
}

async function createSession(cfg, zip, { reset }) {
  const saved = reset ? null : getKV(`ic:session:${cfg.base}`);
  const reuse = saved && Date.now() - saved.created < SESSION_MAX_AGE;
  const jar = reuse ? CookieJar.from(saved.cookies) : new CookieJar();
  const storefront = `${cfg.base}/store/${cfg.slug}/storefront`;
  let res = await request(storefront, { jar, timeout: 20000, headers: { accept: 'text/html' } });
  let html = res.text;

  if (!jar.has('__Host-instacart_sid')) {
    if (cfg.guest !== 'postal') throw new Error('Store site did not start a guest session');
    // Landing page wants a ZIP before shopping (e.g. ShopWoodman's)
    const landing = await discoverHashes(html).catch(() => ({}));
    const hash = landing.HomepagePbiCreateGuestUserWithPostalCodeMutation || FALLBACK_HASHES.HomepagePbiCreateGuestUserWithPostalCodeMutation;
    const op = 'HomepagePbiCreateGuestUserWithPostalCodeMutation';
    const r = await request(`${cfg.base}/graphql?operationName=${op}`, {
      method: 'POST',
      jar,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationName: op, variables: { postalCode: zip }, extensions: { persistedQuery: { version: 1, sha256Hash: hash } } }),
      timeout: 20000,
    });
    if (!jar.has('__Host-instacart_sid')) {
      throw new Error(`Could not start a guest session (HTTP ${r.status})`);
    }
    res = await request(storefront, { jar, timeout: 20000, headers: { accept: 'text/html' } });
    html = res.text;
  }

  let discovered = {};
  try {
    discovered = await discoverHashes(html);
  } catch {
    discovered = {};
  }
  const session = { jar, created: reuse ? saved.created : Date.now(), hashes: { ...FALLBACK_HASHES, ...discovered }, zone: null, html };
  try {
    const loc = await gqlRaw(cfg, session, 'GetLastUserLocation', {});
    session.zone = loc?.data?.lastUserLocation?.zoneId || null;
  } catch {
    /* zone is best-effort */
  }
  delete session.html;
  sessions.set(cfg.base, session);
  setKV(`ic:session:${cfg.base}`, { cookies: jar.toJSON(), created: session.created });
  return session;
}

// ---------------- GraphQL ----------------

async function gqlRaw(cfg, session, op, variables) {
  const hash = session.hashes[op];
  if (!hash) throw new Error(`No hash known for ${op}`);
  const url = `${cfg.base}/graphql?operationName=${op}&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}`;
  const res = await request(url, { jar: session.jar, timeout: 20000, headers: { accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) {
    const e = new HttpError(`Session rejected (HTTP ${res.status})`, { status: res.status });
    e.code = 'AUTH';
    throw e;
  }
  if (res.status === 429) throw new HttpError('Rate limited by store site (HTTP 429) — try again in a minute', { status: 429 });
  const body = res.json();
  if (body?.errors?.length && !body.data) {
    const msg = body.errors.map((e) => e.message).join('; ');
    const e = new Error(msg);
    if (/PersistedQueryNotFound|PERSISTED_QUERY/i.test(msg + JSON.stringify(body.errors))) e.code = 'HASH';
    throw e;
  }
  return body;
}

async function gql(cfg, zip, op, variables) {
  let session = await getSession(cfg, zip);
  try {
    return (await gqlRaw(cfg, session, op, variables)).data;
  } catch (err) {
    if (err.code === 'AUTH') {
      session = await getSession(cfg, zip, { reset: true });
      return (await gqlRaw(cfg, session, op, variables)).data;
    }
    if (err.code === 'HASH') {
      // Site deployed new query hashes: rediscover and retry once
      invalidate('ic:manifest:');
      sessions.delete(cfg.base);
      delKV(`ic:session:${cfg.base}`);
      session = await getSession(cfg, zip, { reset: true });
      return (await gqlRaw(cfg, session, op, variables)).data;
    }
    throw err;
  }
}

// ---------------- store location ----------------

export async function resolveShop(cfg, zip, { fresh = false } = {}) {
  // Bump SHOP_CACHE_VERSION whenever the shape of the returned shop changes, otherwise entries
  // cached under the old shape silently lose new fields (a missing `canonical` reads as false,
  // which would label a chain-wide price as the shopper's local online price).
  return cached(`ic:shop:v${SHOP_CACHE_VERSION}:${cfg.base}:${cfg.slug}:${zip}`, 3 * DAY, async () => {
    const geo = await geocodeZip(zip);
    const coords = { latitude: geo.lat, longitude: geo.lng };
    const ask = (allowCanonicalFallback) =>
      gql(cfg, zip, 'ShopCollectionScoped', { retailerSlug: cfg.slug, postalCode: zip, coordinates: coords, addressId: null, allowCanonicalFallback });

    // Ask for a store that actually serves this ZIP first. Instacart's canonical fallback returns
    // one national storefront (Walmart always answers with the same store in Antioch, CA) whose
    // prices are not this shopper's prices, so we only accept it as a last resort and flag it.
    let canonical = false;
    let d = await ask(false);
    let shops = d?.shopCollection?.shops || [];
    if (!shops.length) {
      d = await ask(true);
      shops = d?.shopCollection?.shops || [];
      canonical = shops.length > 0;
    }
    if (!shops.length) return { none: true };
    let shop = null;
    for (const st of cfg.prefer || ['instore', 'pickup', 'delivery']) {
      shop = shops.find((s) => s.serviceType === st);
      if (shop) break;
    }
    shop = shop || shops[0];
    const out = {
      shopId: shop.id,
      serviceType: shop.serviceType,
      serviceTypes: [...new Set(shops.map((s) => s.serviceType))],
      retailerId: shop.retailerId,
      locationId: shop.retailerLocationId,
      name: shop.retailer?.name || cfg.slug,
      address: null,
      lat: null,
      lng: null,
      distance: null,
      priceNote: null,
      // true when Instacart couldn't find a store serving this ZIP and handed us a national
      // storefront instead. Those prices belong to some other store, not the shopper's.
      canonical,
    };
    try {
      const loc = await gql(cfg, zip, 'GetRetailerLocationAddress', { id: shop.retailerLocationId });
      const rl = loc?.retailerLocation;
      if (rl) {
        out.lat = rl.coordinates?.latitude ?? null;
        out.lng = rl.coordinates?.longitude ?? null;
        const a = rl.viewSection?.address;
        out.address = [a?.lineOneString, a?.lineTwoString].filter(Boolean).join(', ') || null;
        out.label = rl.viewSection?.locationDisplayNameString || null;
        out.distance = miles(geo, { lat: out.lat, lng: out.lng });
      }
    } catch {
      /* address is nice-to-have */
    }
    try {
      const info = await gql(cfg, zip, 'StoreInfoModalContentQuery', {
        shopId: shop.id, addressId: '0', postalCode: zip, coordinates: coords, retailerId: shop.retailerId, fetchReturnPolicy: false, skipFeeDisclosure: true,
      });
      out.priceNote = findString(info, 'priceTransparencyTextString');
    } catch {
      /* optional */
    }
    return out;
  }, { fresh });
}

function findString(obj, key) {
  let found = null;
  (function walk(o) {
    if (found || !o || typeof o !== 'object') return;
    if (typeof o[key] === 'string') {
      found = o[key];
      return;
    }
    for (const v of Object.values(o)) walk(v);
  })(obj);
  return found;
}

// ---------------- search ----------------

export async function search(cfg, query, zip, { limit = 40 } = {}) {
  const shop = await resolveShop(cfg, zip);
  if (!shop || shop.none) return { items: [], location: null, message: `No ${cfg.slug} store serves ZIP ${zip}` };
  // Instacart's canonical storefront is one store somewhere else in the country (Hy-Vee answered a
  // Milwaukee search from Lincoln, NE, 478.8 mi away). Only a chain that prices the same everywhere
  // (`chainWide` in shared/catalog.js: Walmart) may be priced from it, labelled 'national'; for any
  // other chain those are a stranger's prices, and there is nothing to show. (Handoff H2 from the
  // round-2 catalog fixer; the directory already refuses such chains, this closes a direct search.)
  if (shop.canonical && !cfg.chainWide) return { items: [], location: null, message: `No ${cfg.slug} store near ZIP ${zip}` };
  const session = await getSession(cfg, zip);
  const zone = session.zone || '974';
  const vars = {
    action: null, query, pageViewId: crypto.randomUUID(), elevatedProductId: null, searchSource: 'search', filters: [],
    disableReformulation: false, disableLlm: true, forceInspiration: false, orderBy: 'bestMatch', clusterId: null,
    includeDebugInfo: false, clusteringStrategy: null, contentManagementSearchParams: { itemGridColumnCount: 4 },
    shopId: shop.shopId, postalCode: zip, zoneId: zone, first: Math.min(limit, 60),
  };
  const d = await gql(cfg, zip, 'SearchResultsPlacements', vars);
  const placements = d?.searchResultsPlacements?.placements || [];
  const order = [];
  const seen = new Set();
  const byId = new Map();
  const sponsored = new Set();
  for (const p of placements) {
    const c = p?.content;
    if (!c || !/ItemGrid$/.test(c.__typename || '')) continue;
    for (const id of c.itemIds || []) {
      if (!seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    for (const it of c.items || []) if (it?.price) byId.set(it.id, it);
    for (const f of c.featuredProducts || []) if (f?.productId) sponsored.add(String(f.productId));
  }
  const ids = order.slice(0, limit);
  const missing = ids.filter((id) => !byId.has(id));
  for (let i = 0; i < missing.length; i += 40) {
    const chunk = missing.slice(i, i + 40);
    const r = await gql(cfg, zip, 'Items', { ids: chunk, shopId: shop.shopId, zoneId: zone, postalCode: zip });
    for (const it of r?.items || []) byId.set(it.id, it);
  }
  return { items: itemsInOrder(ids, byId, cfg, shop, sponsored), location: publicLocation(shop) };
}

/**
 * The search page's items, in Instacart's order, parsed. Exported for the adapter tests, which feed
 * it captured records: round 1's test of the zero-price rule re-implemented the predicate and
 * stayed green with the filter deleted.
 */
export function itemsInOrder(ids, byId, cfg, shop, sponsored = new Set()) {
  const items = [];
  ids.forEach((id, i) => {
    const x = byId.get(id);
    if (!x) return;
    const p = parseItem(x, cfg, shop, i, ids.length, sponsored.has(String(x.productId)));
    // 0 is "no price on this row", never a free product — see the note in traderjoes.js.
    if (p && p.price != null && p.price > 0) items.push(p);
  });
  return items;
}

function publicLocation(shop) {
  // A canonical storefront's address and distance are the storefront's, not the shopper's store:
  // Walmart's is "Walmart - 2697, 4893 Lone Tree Way, Antioch, CA", 1,801 mi from Milwaukee. The
  // prices are real chain-wide prices (priceBasis 'national'); the location is withheld and flagged
  // so the UI says "chain-wide" instead of printing a store the shopper cannot visit. (Handoff H2.)
  if (shop.canonical) return { name: null, address: null, distance: null, serviceType: shop.serviceType, priceNote: shop.priceNote, id: null, canonical: true };
  return {
    name: shop.label || shop.name,
    address: shop.address,
    distance: shop.distance,
    serviceType: shop.serviceType,
    priceNote: shop.priceNote,
    id: shop.shopId,
    canonical: false,
  };
}

function sectionsText(f) {
  if (!f?.sections) return null;
  return f.sections.map((s) => s.content || s.text || '').join('').trim() || null;
}

/** "$0.50/oz", "$3.49/gal", "$0.92 each" -> { price, unit }; null for anything else. */
function listedUnit(s) {
  const m = /^\s*\$\s*(\d+(?:\.\d+)?)\s*(?:\/\s*|\s+)(fl\.?\s*oz|oz|lbs?|gal|qt|l|ct|each|ea)\.?\s*$/i.exec(String(s || ''));
  return m ? { price: +m[1], unit: m[2].toLowerCase().replace(/\s+/g, ' ').replace('fl. oz', 'fl oz') } : null;
}

function parsePerUnit(s) {
  // "$0.49 / lb", "$8.99/lb", "About $3.98 each"
  if (!s) return null;
  const m = String(s).match(/\$\s*(\d+(?:\.\d+)?)\s*\/\s*([a-z ]+)/i);
  if (!m) return null;
  return { price: +m[1], unit: m[2].trim().toLowerCase() };
}

/**
 * Instacart carries the package size twice: once as the structured `size` attribute, which is the
 * number the unit price is computed from, and once glued onto the end of the retailer's own
 * product name. When a retailer renames an item and the attribute moves on, the two disagree —
 * Costco's sweet potatoes arrive as name "Sweet Potatoes, 5 lbs" with size "10 lb" (and an
 * evergreen slug of "sweet-potatoes-10-lbs-10-lb", which backs the attribute). Printing both puts
 * two contradictory sizes an inch apart on the same row, and the whole 80.7c/lb best-price
 * headline then rests on which of them the shopper happens to believe.
 *
 * Drop the stale clause from the NAME, never from the size: the size is what we priced from, so
 * this changes no arithmetic, it only stops the row asserting a second number we did not use.
 * Only a plain single-unit clause of the same dimension qualifies — a multipack clause
 * ("..., 2.82 oz, 6-count") carries more than the attribute does and pickSize in normalize.js
 * deliberately prefers it, so it has to survive untouched.
 *
 * ONLY when a third witness breaks the tie. Dropping the clause on every disagreement erased the
 * evidence that makeProduct's sizeConflict exists to record: with the name's "5 lbs" gone there was
 * nothing left to conflict with, so the guard that stops a self-contradicting row taking the best-
 * price headline could never fire again, for any product. Two numbers that disagree, with nothing
 * to say which is right, is exactly the case that guard is for. The retailer's own URL slug is that
 * third witness: Costco's is "sweet-potatoes-10-lbs-10-lb", which says 10 lb twice and 5 lb never,
 * so the name's clause is the stale one and may go. When the slug does not settle it the name is
 * left alone, the conflict is recorded, and the row is listed but never crowned.
 *
 * Nor is a clause stale when a pack count the listing states explains it: Sam's "Hormel Chili with
 * Beans 6-Pack, 5.63 LB" with a stated 15 oz is six 15 oz cans, which ARE 5.63 lb. Stripping
 * "5.63 LB" there threw away the only statement of the pack and priced the case per can, 6x too
 * dear; the same happened to Costco's four-count udon at 4x.
 */
export function dropStaleSizeFromName(name, sizeText, url = null) {
  const stated = parseSize(sizeText);
  if (!stated || stated.perWeight || stated.count > 1 || stated.dim === 'count' || !(stated.base > 0)) return name;
  const m = String(name || '').match(/^(.*?)[,(]\s*([^,()]{1,20}?)\s*\)?$/);
  if (!m || !m[1].trim()) return name;
  const tail = parseSize(m[2]);
  if (!tail || tail.perWeight || tail.count > 1 || tail.dim !== stated.dim || !(tail.base > 0)) return name;
  // Said twice and agreeing is not a contradiction; leave it exactly as the retailer wrote it.
  if (Math.abs(tail.base - stated.base) <= stated.base * 0.02) return name;
  const whole = sizeFromName(name);
  if (whole && (whole.count > 1 || whole.countFirst)) return name;
  // One unit and N of them, with N spelled out ("Pulmuone Teriyaki Stir-fry Udon, 30.9 oz", stated
  // 7.72 oz, slug "...-772-oz-4count-..."): not stale, the pack. See settleByStatedCount.
  if (settleByStatedCount(stated, tail, { name, url })) return name;
  if (!slugStates(url, stated) || slugStates(url, tail)) return name;
  return m[1].trim().replace(/[,\s]+$/, '');
}

// Exported for the adapter tests, which drive a captured Instacart item record through the exact
// path search() uses — a helper tested on its own passed while it was unhooked from here.
export function parseItem(x, cfg, shop, rank, total, sponsored) {
  const pv = x.price?.viewSection || {};
  const card = pv.itemCard || {};
  const badge = pv.badge || {};
  const priceStr = card.priceString || '';
  const suffix = card.priceSuffixString || '';
  const isEst = /est/i.test(priceStr + ' ' + suffix);
  let price = money(priceStr);
  let soldBy = 'each';
  let estEach = null;
  let estPkg = null;
  const per = parsePerUnit(card.pricingUnitString) || parsePerUnit(card.pricePerUnitString);
  if (per && /^(lb|lbs|pound)$/.test(per.unit)) {
    soldBy = 'lb';
    if (isEst && /each/i.test(priceStr + suffix)) estEach = price;
    else if (isEst) estPkg = price;
    else if (/per lb/i.test(x.size || '')) estPkg = null;
    price = per.price;
  }
  let regular = money(card.plainFullPriceString || card.fullPriceString);
  if (soldBy === 'lb' && regular) {
    const pkg = estPkg || estEach;
    regular = pkg ? Math.round(regular * (per.price / pkg) * 100) / 100 : null;
  }
  const loyalty = money(sectionsText(card.loyaltyPriceStringFormatted));
  const nonLoyalty = money(sectionsText(card.nonLoyaltyPriceStringFormatted));
  let memberPrice = null;
  let memberLabel = null;
  if (loyalty && nonLoyalty && loyalty < nonLoyalty) {
    // Card price shown separately from the everyday price
    memberPrice = loyalty;
    memberLabel = card.loyaltyProgramSmallLabelString || card.loyaltyProgramLabelString || 'Card price';
    if (!regular || regular < nonLoyalty) regular = regular || null;
    price = nonLoyalty;
  }
  const tp = x.viewSection?.trackingProperties || {};
  const saleInd = tp.on_sale_ind || {};
  const promos = [];
  if (badge.offerLabelString && !/^\d+% off$/i.test(badge.offerLabelString)) promos.push(badge.offerLabelString);
  for (const ip of pv.itemPromotions || []) if (ip?.offerLabelString) promos.push(ip.offerLabelString);
  if (saleInd.buy_one_get_one && !promos.some((p) => /buy 1|bogo/i.test(p))) promos.push('Buy 1, get 1 free');
  const img = x.viewSection?.itemImage;
  const image = img?.templateUrl ? img.templateUrl.replace('{width=}x{height=}', '240x240') : img?.url || null;
  const slugUrl = x.evergreenUrl ? encodeURI(x.evergreenUrl) : null;
  const url = slugUrl
    ? cfg.base.includes('www.instacart.com')
      ? `https://www.instacart.com/products/${slugUrl}?retailerSlug=${cfg.slug}`
      : `${cfg.base}/store/${cfg.slug}/products/${slugUrl}`
    : `${cfg.base}/store/${cfg.slug}/s?k=${encodeURIComponent(x.name || '')}`;
  const tags = [...(x.tags || [])];
  if ((tp.element_details?.item_tags || []).includes('store_brand') && !tags.includes('storeBrand')) tags.push('storeBrand');
  if (/organic/i.test(x.name || '')) tags.push('organic');
  return makeProduct({
    locationId: shop.locationId ?? null,
    storeId: cfg.storeId,
    id: x.productId || x.id,
    name: dropStaleSizeFromName(x.name, x.size, x.evergreenUrl),
    brand: x.brandName,
    sizeText: x.size,
    // Instacart's own unit line: "4 x 14.5 oz" when the price buys four (see listingPack).
    packText: card.pricingUnitString || null,
    // Instacart's own unit price ("$0.50/oz"), a check on the stated size (unitLineConflict).
    listedUnit: soldBy === 'lb' ? null : listedUnit(card.pricePerUnitString) || listedUnit(pv.itemDetails?.pricePerUnitString) || listedUnit(card.pricingUnitString),
    price,
    regularPrice: regular,
    memberPrice,
    memberLabel,
    soldBy,
    estEach,
    estPkg,
    onSale: !!saleInd.on_sale || !!regular,
    promo: [...new Set(promos)].join(' · ') || null,
    image,
    url,
    stock: x.availability?.stockLevel || null,
    available: x.availability?.available !== false,
    category: tp.product_category_name || null,
    tags,
    sponsored,
    rank,
    total,
    // 'national' means Instacart had no store serving this ZIP and answered with its chain-wide
    // storefront, so the price is real but belongs to another store. Never call that a shelf price.
    priceBasis: shop.canonical ? 'national' : shop.serviceType === 'instore' || /no markup/i.test(shop.priceNote || '') ? 'shelf' : 'online',
  });
}

export function resetSessions() {
  sessions.clear();
}
