// Official Kroger Public API (https://developer.kroger.com) for Mariano's exact store prices.
// Requires a free client id/secret (Settings). Uses the client_credentials grant, product.compact scope.
import { createHash } from 'node:crypto';
import { request, configureHost } from '../http.js';

// A licensed API with a published daily quota, so keep well clear of it.
configureHost('api.kroger.com', { max: 2, gap: 200 });
import { cached, DAY } from '../cache.js';
import { geocodeZip, miles } from '../geo.js';
import { makeProduct } from '../normalize.js';

const API = 'https://api.kroger.com/v1';

// Access tokens, in memory only, keyed by a hash of the FULL credential pair.
//
// The keys belong to the visitor and arrive with each request; we never write either of them to
// disk. Caching the short-lived token per client id matters for politeness: with one shared slot,
// two visitors with different keys would evict each other and mint a fresh token on every single
// search, which is more traffic to Kroger than the single-user build ever made. The client secret
// is not kept here — a refresh uses the secret from the request that needs it.
const tokens = new Map(); // credential hash -> { token, exp }

/**
 * Key the token cache by the whole credential pair, never by the client id alone.
 *
 * Two visitors can present the same client id with different secrets (one of them simply wrong, or
 * rotated). Keyed by id alone, the second visitor is handed the first visitor's access token, which
 * is somebody else's credential. Hashed so the secret is not held in memory as plaintext in a
 * long-lived map.
 */
function credentialKey(clientId, clientSecret) {
  return createHash('sha256').update(`${clientId}\u0000${clientSecret}`).digest('hex').slice(0, 32);
}
const MAX_TOKENS = 200;

export function hasKeys(ctx) {
  return !!(ctx?.kroger?.clientId && ctx?.kroger?.clientSecret);
}

function rememberToken(secretHash, token, ttlMs) {
  if (tokens.size >= MAX_TOKENS) tokens.delete(tokens.keys().next().value);
  tokens.set(secretHash, { token, exp: Date.now() + ttlMs });
}

async function getToken(settings, { force = false } = {}) {
  const { clientId, clientSecret } = settings.kroger;
  if (!clientId || !clientSecret) throw new Error('No Kroger keys supplied');
  const secretHash = credentialKey(clientId, clientSecret);
  const hit = tokens.get(secretHash);
  if (!force && hit && Date.now() < hit.exp - 60_000) return hit.token;
  const r = await request(`${API}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials&scope=product.compact',
    timeout: 15000,
  });
  // A wrong key is the visitor's problem, not a server fault: tag it 400 so it is answered, not logged.
  if (r.status === 400 || r.status === 401) throw Object.assign(new Error('Kroger API rejected the client ID/secret — check them in Settings'), { status: 400 });
  if (!r.ok) throw Object.assign(new Error(`Kroger token error (HTTP ${r.status})`), { status: 502 });
  const d = r.json();
  rememberToken(secretHash, d.access_token, (d.expires_in || 1800) * 1000);
  return d.access_token;
}

async function api(settings, path) {
  const t = await getToken(settings);
  const r = await request(`${API}${path}`, { headers: { authorization: `Bearer ${t}` }, timeout: 15000 });
  if (r.status === 401) {
    const t2 = await getToken(settings, { force: true });
    const r2 = await request(`${API}${path}`, { headers: { authorization: `Bearer ${t2}` }, timeout: 15000, okOnly: true });
    return r2.json();
  }
  if (!r.ok) throw new Error(`Kroger API HTTP ${r.status}: ${r.text.slice(0, 160)}`);
  return r.json();
}

// Each Kroger banner's own site, for product links. Every search used to link to marianos.com, so
// a Pick 'n Save shopper's "Open at Pick 'n Save" went to Mariano's.
const SITES = {
  KROGER: 'https://www.kroger.com', RALPHS: 'https://www.ralphs.com', FRED_MEYER: 'https://www.fredmeyer.com',
  KING_SOOPERS: 'https://www.kingsoopers.com', FRYS: 'https://www.frysfood.com', SMITHS: 'https://www.smithsfoodanddrug.com',
  QFC: 'https://www.qfc.com', DILLONS: 'https://www.dillons.com', HARRIS_TEETER: 'https://www.harristeeter.com',
  MARIANOS: 'https://www.marianos.com', PICK_N_SAVE: 'https://www.picknsave.com', METRO_MARKET: 'https://www.metromarket.net',
};
export const siteFor = (chain) => SITES[chain] || 'https://www.kroger.com';

/**
 * Does a Kroger location's `chain` belong to the banner we asked for? The catalog names banners
 * like "PICK_N_SAVE" and "FRED_MEYER"; the API's own spelling is not documented for every banner
 * and cannot be checked without keys, so compare letters only, either way round ("PICKNSAVE",
 * "FRED" for Fred Meyer). Only used on the fallback path, after an exact chain filter found nothing.
 */
export function sameBanner(apiChain, chain) {
  const a = String(apiChain || '').toUpperCase().replace(/[^A-Z]/g, '');
  const b = String(chain || '').toUpperCase().replace(/[^A-Z]/g, '');
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

export async function resolveStore(settings, zip, chain = 'MARIANOS', { fresh = false } = {}) {
  // Cache key deliberately has no client id in it. Which Kroger store is nearest a ZIP does not
  // depend on whose API key asked, so sharing the answer is both correct and one fewer call to
  // Kroger per visitor — and it keeps visitor-supplied credential material out of the cache table.
  return cached(`kroger:store:${chain}:${zip}`, 7 * DAY, async () => {
    let d = await api(settings, `/locations?filter.zipCode.near=${zip}&filter.radiusInMiles=50&filter.limit=10&filter.chain=${encodeURIComponent(chain)}`);
    let list = d.data || [];
    if (!list.length) {
      d = await api(settings, `/locations?filter.zipCode.near=${zip}&filter.radiusInMiles=50&filter.limit=50`);
      list = (d.data || []).filter((l) => sameBanner(l.chain, chain));
    }
    if (!list.length) return { none: true };
    const geo = await geocodeZip(zip);
    const stores = list.map((l) => ({
      id: l.locationId,
      name: l.name || chain,
      address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
      lat: l.geolocation?.latitude,
      lng: l.geolocation?.longitude,
      distance: miles(geo, { lat: l.geolocation?.latitude, lng: l.geolocation?.longitude }),
    }));
    stores.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    return stores[0];
  }, { fresh });
}

export async function search(settings, storeId, query, zip, { limit = 40, chain = 'MARIANOS', site = siteFor(chain) } = {}) {
  const store = await resolveStore(settings, zip, chain);
  if (!store || store.none) return { items: [], location: null, message: `No ${chain} store near ${zip}` };
  const d = await api(settings, `/products?filter.term=${encodeURIComponent(query.slice(0, 80))}&filter.locationId=${store.id}&filter.limit=${Math.min(limit, 50)}`);
  const list = d.data || [];
  const items = [];
  list.forEach((p, i) => {
    const it = p.items?.[0];
    if (!it?.price) return;
    const byWeight = String(it.soldBy || '').toUpperCase() === 'WEIGHT';
    const regular = it.price.regular || null;
    const promo = it.price.promo && it.price.promo > 0 && it.price.promo < regular ? it.price.promo : null;
    const img = (p.images || []).find((x) => x.featured) || (p.images || [])[0];
    const size = (img?.sizes || []).find((s) => s.size === 'medium') || (img?.sizes || [])[0];
    items.push(makeProduct({
      locationId: store.id ?? null,
      storeId,
      id: p.productId,
      name: p.description,
      brand: p.brand,
      sizeText: byWeight ? 'per lb' : it.size,
      soldBy: byWeight ? 'lb' : 'each',
      price: promo ?? regular,
      regularPrice: promo ? regular : null,
      onSale: !!promo,
      promo: promo ? 'Card price' : null,
      image: size?.url || null,
      url: p.productPageURI ? `${site}${p.productPageURI}` : `${site}/search?query=${encodeURIComponent(p.description)}`,
      stock: it.inventory?.stockLevel || null,
      category: (p.categories || [])[0] || null,
      tags: [/^(kroger|simple truth|private selection|roundy)/i.test(p.brand || '') ? 'storeBrand' : null, /organic/i.test(p.description) ? 'organic' : null].filter(Boolean),
      rank: i,
      total: list.length,
      priceBasis: 'shelf',
    }));
  });
  return { items, location: { name: store.name, address: store.address, distance: store.distance, id: store.id, priceNote: 'Exact store prices from the Kroger API (card prices shown as sale)' } };
}

export async function testKeys(settings, zip) {
  await getToken(settings, { force: true });
  // Mariano's is Chicago only: a Milwaukee shopper testing good keys was told there was no store.
  // Try the banners the catalog prices through this API in the Midwest, nearest first found.
  for (const chain of ['MARIANOS', 'PICK_N_SAVE', 'METRO_MARKET', 'KROGER']) {
    const s = await resolveStore(settings, zip, chain);
    if (s && !s.none) return { ok: true, store: s };
  }
  return { ok: true, store: null };
}
