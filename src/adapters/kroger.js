// Official Kroger Public API (https://developer.kroger.com) for Mariano's exact store prices.
// Requires a free client id/secret (Settings). Uses the client_credentials grant, product.compact scope.
import { createHash } from 'node:crypto';
import { request, requestScope } from '../http.js';

// Every host this adapter reads gets the owner's rule from src/http.js (DEFAULT_HOST_POLICY: one
// request in flight, 700 ms apart, stop on 429). The looser per-host limits that used to be set
// here were removed at the owner's decision (Sept 2026); long queues are handled by
// withStallTimeout, not by asking faster.
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

// The public API's daily limits (developer.kroger.com, public tier): about 10,000 product calls and
// 1,600 location calls a day per application. A visitor's own keys carry their own limits; the
// server's keys are shared by every visitor, so they get a budget a little under Kroger's, and once
// it is spent the store is priced from Instacart again until the next UTC day.
const BUDGET = { products: +process.env.KROGER_DAILY_PRODUCTS || 9000, locations: +process.env.KROGER_DAILY_LOCATIONS || 1400 };
const usage = { day: '', products: 0, locations: 0 };
function today() {
  const d = new Date().toISOString().slice(0, 10);
  if (usage.day !== d) Object.assign(usage, { day: d, products: 0, locations: 0 });
  return usage;
}
function spend(settings, path) {
  if (!settings?.kroger?.server) return;
  visitorOk(true);
  const u = today();
  if (path.startsWith('/locations')) u.locations += 1;
  else if (path.startsWith('/products')) u.products += 1;
}
// Each visitor's share of the server's keys per hour, so one visitor walking ZIPs cannot spend the
// day's location budget in minutes and switch Kroger prices off for everyone (the security review).
const PER_VISITOR_HOURLY = +process.env.KROGER_PER_VISITOR_HOURLY || 150;
const visitorUse = new Map(); // visitor -> { hour, n }
function visitorOk(spendOne = false) {
  const v = requestScope.getStore()?.visitor;
  if (!v) return true;
  const hour = Math.floor(Date.now() / 3_600_000);
  let e = visitorUse.get(v);
  if (!e || e.hour !== hour) {
    if (visitorUse.size > 5000) visitorUse.clear();
    e = { hour, n: 0 };
    visitorUse.set(v, e);
  }
  if (spendOne) e.n += 1;
  return e.n < PER_VISITOR_HOURLY;
}

// A visitor's own keys are used only once Kroger has accepted them: a made-up id/secret pair
// otherwise switched the source to Kroger and was served Kroger results cached from someone else's
// search, and sent Kroger a failed token request on every cache miss. Known answers are kept per
// credential hash (a rejection for 10 minutes).
const validated = new Map(); // credential hash -> { ok, at }
function validity(ctx) {
  const v = validated.get(credentialKey(ctx.kroger.clientId, ctx.kroger.clientSecret));
  if (!v) return undefined;
  if (!v.ok && Date.now() - v.at > 10 * 60_000) return undefined;
  return v.ok;
}
/** Make sure a visitor's keys have been tried once (a token request), before a search uses them. */
export async function ensureValidated(ctx) {
  if (!hasKeys(ctx) || ctx.kroger.server || validity(ctx) !== undefined) return;
  try {
    await getToken(ctx);
  } catch {
    // recorded by getToken
  }
}

/** Keys present and usable: a visitor's accepted by Kroger; the server's within today's budget and this visitor's share. */
export function available(ctx) {
  if (!hasKeys(ctx)) return false;
  if (!ctx.kroger.server) return validity(ctx) === true;
  const u = today();
  return u.products < BUDGET.products && u.locations < BUDGET.locations && visitorOk();
}
export function krogerUsage() {
  return { ...today(), budget: { ...BUDGET } };
}
/** Tests only: a small budget, so spending it does not take 9,000 calls. */
export function _setBudgetForTests(b) {
  Object.assign(BUDGET, b);
  Object.assign(usage, { day: '', products: 0, locations: 0 });
  visitorUse.clear();
}

/**
 * How long an answer may be kept, from Kroger's own Cache-Control (their terms: cache content only
 * as long as the cache headers allow). no-store/no-cache: not at all. max-age: that long. Absent:
 * null, and the caller's default applies.
 */
export function ttlFromCacheControl(value) {
  const v = String(value || '').toLowerCase();
  if (!v) return null;
  if (/\bno-store\b|\bno-cache\b|\bprivate\b/.test(v)) return 0;
  const m = /(?:^|,)\s*max-age\s*=\s*(\d+)/.exec(v);
  return m ? +m[1] * 1000 : null;
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
  if (r.status === 400 || r.status === 401) {
    validated.set(secretHash, { ok: false, at: Date.now() });
    throw Object.assign(new Error('Kroger API rejected the client ID/secret — check them in Settings'), { status: 400 });
  }
  if (!r.ok) throw Object.assign(new Error(`Kroger token error (HTTP ${r.status})`), { status: 502 });
  const d = r.json();
  rememberToken(secretHash, d.access_token, (d.expires_in || 1800) * 1000);
  validated.set(secretHash, { ok: true, at: Date.now() });
  return d.access_token;
}

async function api(settings, path, { withTtl = false } = {}) {
  const t = await getToken(settings);
  spend(settings, path);
  let r = await request(`${API}${path}`, { headers: { authorization: `Bearer ${t}` }, timeout: 15000 });
  if (r.status === 401) {
    const t2 = await getToken(settings, { force: true });
    spend(settings, path);
    r = await request(`${API}${path}`, { headers: { authorization: `Bearer ${t2}` }, timeout: 15000, okOnly: true });
  }
  // Kroger's own error text is not shown to shoppers or logged with a body (it can echo the query).
  if (!r.ok) throw Object.assign(new Error(`Kroger API HTTP ${r.status}`), { status: r.status === 429 ? 503 : 502 });
  const body = r.json();
  return withTtl ? { body, ttlMs: ttlFromCacheControl(r.headers?.get?.('cache-control')) } : body;
}

// Each Kroger banner's own site, for product links. Every search used to link to marianos.com, so
// a Pick 'n Save shopper's "Open at Pick 'n Save" went to Mariano's.
const SITES = {
  KROGER: 'https://www.kroger.com', RALPHS: 'https://www.ralphs.com', FRED_MEYER: 'https://www.fredmeyer.com',
  KING_SOOPERS: 'https://www.kingsoopers.com', FRYS: 'https://www.frysfood.com', SMITHS: 'https://www.smithsfoodanddrug.com',
  QFC: 'https://www.qfc.com', DILLONS: 'https://www.dillons.com', HARRIS_TEETER: 'https://www.harristeeter.com',
  MARIANOS: 'https://www.marianos.com', PICK_N_SAVE: 'https://www.picknsave.com', METRO_MARKET: 'https://www.metromarket.net',
  FOOD_4_LESS: 'https://www.food4less.com', GERBES: 'https://www.gerbes.com', JAYC: 'https://www.jaycfoods.com',
  CITY_MARKET: 'https://www.citymarket.com', BAKERS: 'https://www.bakersplus.com',
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
  // The API needs a term of at least 3 characters; "oj" would come back as a 400.
  const term = query.trim().slice(0, 80);
  if (term.length < 3) return { items: [], location: null, message: 'Kroger’s search needs at least 3 letters' };
  const { body: d, ttlMs } = await api(settings, `/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(store.id)}&filter.limit=${Math.min(limit, 50)}`, { withTtl: true });
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
  return { items, cacheTtlMs: ttlMs, location: { name: store.name, address: store.address, distance: store.distance, id: store.id, priceNote: 'Exact store prices from the Kroger API (card prices shown as sale)' } };
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
