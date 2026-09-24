// Whole Foods Market: nearest store by ZIP, store-level product search, weekly sales flyer.
import { request, CookieJar } from '../http.js';

// Every host this adapter reads gets the owner's rule from src/http.js (DEFAULT_HOST_POLICY: one
// request in flight, 700 ms apart, stop on 429). The looser per-host limits that used to be set
// here were removed at the owner's decision (Sept 2026); long queues are handled by
// withStallTimeout, not by asking faster.
import { cached, HOUR, DAY } from '../cache.js';
import { geocodeZip, miles } from '../geo.js';
import { makeProduct, titleCase } from '../normalize.js';
import { parseSize } from '../../shared/units.js';
import { saleDay, wallClock } from '../../shared/deals.js';

const BASE = 'https://www.wholefoodsmarket.com';
const round2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
let jar = new CookieJar();
let csrf = null;
let csrfAt = 0;

async function getCsrf() {
  if (csrf && Date.now() - csrfAt < 30 * 60 * 1000) return csrf;
  jar = new CookieJar();
  const r = await request(`${BASE}/api/csrf`, { jar, timeout: 12000, okOnly: true });
  csrf = r.json().token;
  csrfAt = Date.now();
  return csrf;
}

export async function resolveStore(zip, { fresh = false } = {}) {
  return cached(`wfm:store:${zip}`, 7 * DAY, async () => {
    const token = await getCsrf();
    const r = await request(`${BASE}/api/wwos/location/store/closest`, {
      method: 'POST',
      jar,
      headers: { 'content-type': 'application/json', 'x-amzn-csrf': token },
      body: JSON.stringify({ zipCode: zip }),
      timeout: 12000,
      okOnly: true,
    });
    const d = r.json();
    const id = d.pickupStoreCode || d.storeCode;
    if (!id) return { none: true };
    const s = (await request(`${BASE}/api/stores/${id}/summary`, { timeout: 12000, okOnly: true })).json();
    const geo = await geocodeZip(zip);
    const a = s.primaryLocation?.address || {};
    const lat = s.primaryLocation?.latitude;
    const lng = s.primaryLocation?.longitude;
    return {
      id: String(s.storeId || id),
      name: `Whole Foods ${s.displayName || ''}`.trim(),
      address: [a.STREET_ADDRESS_LINE1, [a.CITY, a.STATE].filter(Boolean).join(', ')].filter(Boolean).join(', '),
      lat, lng,
      distance: miles(geo, { lat, lng }),
      prime: !!s.storePrimeEligibility,
      folder: s.folder,
    };
  }, { fresh });
}

// A pack count left dangling at the end of the name half: "... 4pk", "... 8 Count", "... 6pk Cans".
const PACK_TAIL = /(?:^|[\s(,])(\d{1,2})\s*-?\s*(pk|pks|pack|packs|ct|count|cans?|bottles?|boxes|pouches)\b(?:\s+(?:cans?|bottles?|boxes|pouches|packs?|sticks?|bars?))?[\s.)]*$/i;

function splitNameSize(name) {
  // "Organic Whole Milk, 64 FZ" -> ["Organic Whole Milk", "64 FZ"]
  const m = String(name || '').match(/^(.*),\s*([\d.\/]+\s*[A-Za-z. ]{1,8})$/);
  if (!m) return [name, ''];
  const head = m[1];
  const sizeText = m[2];

  // Whole Foods states the size of ONE unit and leaves the pack count behind in the name:
  // "Organic Chicken Broth 4pk, 8 FZ" is 32 fl oz of broth, not 8. Splitting the two apart
  // destroys the multiplier — the name half then parses as a bare count, the stated 8 FZ wins in
  // pickSize, and the shopper is shown $113.44 a gallon for $7.09 of broth. Turkey sticks were
  // 8x out the same way ($261/lb for a $32.68/lb pack).
  //
  // So fold the count back into the SIZE string ("4 x 8 FZ") rather than the name: shared/units.js
  // already parses that shape, the name still reads "4pk" for the shopper, and nothing downstream
  // has to know Whole Foods formats its titles this way. Only fold onto a real measurement — a
  // stated "50 CT" is already the whole package and must be left alone.
  //
  // And only when the word says PACKAGES. "Whole Foods states one unit's size" is true of its
  // "Npk" titles and false of its "N Count" / "N Pack" ones, where the size is the box: "Mini Apple
  // Cider Muffin 12ct, 10.2 OZ" is twelve minis weighing 10.2 oz, and folding it priced them at
  // 81c/lb against a true $10.18. Every Whole Foods title with a pack tail in the captured results
  // was classified by hand: all 8 "pk" / "... Cans" titles are packs of units (ciders, sparkling
  // water, Pacific broth 4pk, canned green beans 4pk), and 7 of the 8 "Count" / "ct" / "Pack"
  // titles state the whole box (Larabar "Pumpkin Pie Bars 6 Count, 9.6 OZ", Ethel's "Pecan Dandy
  // Bar 4 Count", Yasso "4 Count, 14 FZ", Bobo's "Oat Bites 10ct, 13 OZ", instant oatmeal "8 Pack",
  // Serenity Kids "4 Pack" pouches) — the old fold made those 4x to 12x too CHEAP, the direction
  // that wins. The eighth, Chomps "Original Turkey Sticks 8 Count, 1.15 OZ", is a pack of sticks;
  // unfolded it no longer prices at all (makeProduct records the count/size disagreement and
  // withholds the per-pound figure) rather than risk the other seven.
  const pack = head.match(PACK_TAIL);
  const size = parseSize(sizeText);
  const packagesWord = pack && (/^(?:pk|pks)$/i.test(pack[2]) || /\b(?:cans?|bottles?|boxes)\b/i.test(pack[0]));
  if (pack && packagesWord && +pack[1] > 1 && size && !size.perWeight && size.count === 1 && size.dim !== 'count') {
    return [head, `${pack[1]} x ${sizeText}`];
  }
  return [head, sizeText];
}

/**
 * One search record -> one normalized product. Split out from search() so the price arithmetic
 * (multi-buys, multipacks) can be exercised against captured records without touching the network.
 */
export function toProduct(r, { storeId = null, rank = 0, total = 1, now = Date.now() } = {}) {
  const [name, sizeText] = splitNameSize(r.name);
  // Sale dates are calendar days written as UTC ("2026-12-24T23:59:59Z" is the whole of Christmas
  // Eve, not 5:59 pm Central): read them as wall-clock times, as the weekly ads are.
  const saleStart = wallClock(r.saleStartDate);
  const saleEnd = wallClock(r.saleEndDate);
  const saleActive = r.salePrice != null && (!saleEnd || Date.parse(saleEnd) >= now) && (!saleStart || Date.parse(saleStart) <= now + 12 * HOUR);
  const regular = r.regularPrice ?? null;

  // A multi-buy arrives as the TOTAL, not the each price: "2 for $7.78" is salePrice 7.78 with
  // saleMultiple 2, and one package costs $3.89. Reading salePrice as the each price made the
  // "sale" $7.78 — 56% ABOVE the $4.99 regular price Whole Foods states on the same record —
  // and the promo line then multiplied it a second time into "2 for $15.56". Divide by the
  // multiple so `price` is always what one package costs, and build the promo from the raw
  // total so the two can never disagree.
  const saleMultiple = saleActive && r.saleMultiple > 1 ? r.saleMultiple : 1;
  const primeMultiple = saleActive && r.primeMultiple > 1 ? r.primeMultiple : 1;
  let sale = saleActive ? round2(r.salePrice / saleMultiple) : null;
  let prime = saleActive && r.incrementalSalePrice != null ? round2(r.incrementalSalePrice / primeMultiple) : null;
  // If the sale is still not cheaper than the regular price we have misread the offer. Showing
  // it anyway would put a number on screen we cannot stand behind, so fall back to the regular
  // price and drop the sale framing entirely.
  const saleSane = sale != null && (regular == null || sale <= regular + 0.004);
  if (!saleSane) {
    sale = null;
    prime = null;
  }
  const byLb = /\/\s*lb|per lb|\blb\b/i.test(r.uom || '') || (!sizeText && /\bper lb\b/i.test(r.name));
  const promo = [];
  if (sale != null && saleMultiple > 1) promo.push(`${saleMultiple} for $${r.salePrice.toFixed(2)}`);
  if (prime != null && primeMultiple > 1) promo.push(`Prime: ${primeMultiple} for $${r.incrementalSalePrice.toFixed(2)}`);
  return makeProduct({
    locationId: storeId,
    storeId: 'wholefoods',
    id: r.slug,
    name,
    brand: r.brand ? titleCase(r.brand) : '',
    sizeText: byLb ? 'per lb' : sizeText,
    price: sale ?? regular,
    regularPrice: sale != null ? regular : null,
    memberPrice: prime,
    memberLabel: 'Prime',
    soldBy: byLb ? 'lb' : 'each',
    onSale: sale != null,
    promo: promo.join(' · ') || null,
    saleEnds: saleActive ? saleEnd : null,
    image: r.imageThumbnail || null,
    url: `${BASE}/product/${r.slug}`,
    tags: [r.isLocal ? 'local' : null, /organic/i.test(r.name) ? 'organic' : null, /365/i.test(r.brand || '') ? 'storeBrand' : null].filter(Boolean),
    rank,
    total,
    priceBasis: 'shelf',
  });
}

export async function search(query, zip, { limit = 40 } = {}) {
  const store = await resolveStore(zip);
  if (!store || store.none) return { items: [], location: null, message: `No Whole Foods near ${zip}` };
  const url = `${BASE}/api/search?text=${encodeURIComponent(query)}&store=${store.id}&limit=${Math.min(limit, 60)}&offset=0`;
  const d = (await request(url, { timeout: 15000, okOnly: true })).json();
  const results = d.results || [];
  const now = Date.now();
  const items = results
    .map((r, i) => toProduct(r, { storeId: store.id, rank: i, total: results.length, now }))
    // A price of 0 is a price we do not have, not a free product: dropping it is the only honest
    // option, because rendering it puts "$0.00" at the top of a cheapest-first list.
    .filter((p) => p.price != null && p.price > 0);
  return { items, location: { name: store.name, address: store.address, distance: store.distance, id: store.id, priceNote: 'Store shelf prices; Prime price shown separately' } };
}

/** One promotion from the sales page's embedded data, as a sale item. */
export function saleItem(p, storeId) {
  return {
    id: `wfm-${p.promotionId}`,
    storeId: 'wholefoods',
    name: [p.originBrandName, p.productName].filter(Boolean).join(' '),
    brand: p.originBrandName || '',
    description: [p.packageSize, p.headline && p.headline !== p.productName ? p.headline : null].filter(Boolean).join(' · '),
    priceText: p.salePrice || '',
    regularText: p.regularPrice || '',
    memberText: p.primePrice || '',
    image: p.productImage || null,
    validFrom: saleDay(p.startDate),
    validTo: saleDay(p.endDate, { end: true }),
    url: `${BASE}/sales-flyer?store-id=${storeId}`,
    disclaimer: p.description || '',
    rank: p.rank ?? null,
    tier: p.tier || null,
  };
}

/** Weekly sales flyer promotions for the store. */
export async function sales(zip) {
  const store = await resolveStore(zip);
  if (!store || store.none) return { store: null, items: [] };
  return cached(`wfm:sales:v2:${store.id}`, 6 * HOUR, async () => {
    const html = (await request(`${BASE}/sales-flyer?store-id=${store.id}`, { timeout: 15000, okOnly: true, headers: { accept: 'text/html' } })).text;
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('Whole Foods sales flyer format changed');
    const pp = JSON.parse(m[1])?.props?.pageProps || {};
    const items = (pp.promotions || []).map((p) => saleItem(p, store.id));
    return { store: { id: store.id, name: store.name }, items };
  });
}
