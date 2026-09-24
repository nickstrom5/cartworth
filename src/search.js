// Runs a product search across stores. Each store is independent: one slow or broken site never
// blocks the others. Results are cached briefly so repeat searches are instant.
import * as instacart from './adapters/instacart.js';
import * as wholefoods from './adapters/wholefoods.js';
import * as traderjoes from './adapters/traderjoes.js';
import * as kroger from './adapters/kroger.js';
import * as flipp from './adapters/flipp.js';
import { cached, peek, peekStale, MIN } from './cache.js';
import { STORE_BY_ID, storeForMerchant } from '../shared/stores.js';
import { normalize, relevance } from '../shared/match.js';
import { storeZip, snapRadius } from './context.js';
import { outsideRadius, sourceHosts } from './directory.js';
import { withStallTimeout } from './http.js';
import { recordProducts, historyStats } from './history.js';

const STORE_TIMEOUT = 35000;
// Bump when adapter parsing changes so cached results from older parsing are ignored.
// v6: Whole Foods multi-buys are divided by their multiple and multipack sizes keep their pack
// count; Instacart drops a product-name size clause that contradicts the stated size; a price of
// 0 is dropped everywhere. Every one of those changes a PRICE, so serving a v5 entry would show
// the old wrong number for up to three days.
// v7: a canonical (chain-wide) storefront's location is withheld (instacart.js publicLocation), so
// a v6 entry still carries Walmart's Antioch, CA address and its 1,801-mile distance — which the
// radius check below would then read as "too far" and throw Walmart's real chain-wide prices away.
// v8: "M oz, N ct" is the package unless the name counts containers (shared/units.js), and a row
// whose own Instacart unit line contradicts its size is a sizeConflict (normalize.js
// unitLineConflict). Both change a headline price, so v7 entries must not be served.
// v9: Whole Foods sale dates are calendar days (shared/deals.js wallClock); a v8 entry dropped a
// sale price at 7 pm Central on the sale's last day and showed the regular price instead; and
// eggnog and buttermilk are liquids (shared/units.js), compared per gallon, not per pound; and the
// Christmas- and St. Patrick's-run matcher fixes (Ocean Spray, candy canes, holiday decor, flavoured
// waters, corned beef hash, baby vegetables) change which listing wins.
// v10: a size found only at the END of an Instacart slug is the stated size repeating itself, not
// confirmation (normalize.js slugConfirms); a v9 entry priced a half gallon as 2 gal, $1.50/gal.
// v11: juice-flavoured drinks (SunnyD citrus punch) are not juice, and "from concentrate" juice is.
// v12: "<thing> a la <style>" is a prepared dish (Chicken a la King is not chicken).
// v13: a "Dried/Frozen Bananas" category no longer makes a snack the shopper's bananas; -ade drinks
// are not juice.
// v14: supplements named after a food (apple pectin tablets) are not the food.
const CACHE_VERSION = 14;
const health = {}; // storeId -> { ok, at, ms, error } — PROCESS-WIDE and served publicly

/**
 * Strip anything visitor-identifying out of an error before it reaches the SHARED health object.
 *
 * `health` is process-wide and is served to everybody by /api/state and /api/health, so whatever
 * lands in it is public. Adapter errors quote their input, and the input includes the ZIP: one
 * visitor's bad ZIP appeared verbatim in every other visitor's response. Nothing here needs the
 * ZIP to be useful, so it never goes in.
 */
function publicError(message) {
  return String(message || '')
    .replace(/\b\d{5}(?:-\d{4})?\b/g, 'that ZIP')
    // Quoted echoes of whatever the visitor typed, e.g. "QAZIP" is not a 5-digit US ZIP code.
    .replace(/["\u201c\u2018'][^"\u201d\u2019']{0,64}["\u201d\u2019']/g, 'that value')
    .slice(0, 160);
}


export function sourceFor(storeId, settings) {
  const store = STORE_BY_ID[storeId];
  if (!store) return null;
  // kroger.available: keys present, and (for the server's own keys) today's API budget not spent.
  if (store.alt?.type === 'kroger' && kroger.available(settings)) return { type: 'kroger', chain: store.alt.chain };
  return store.price || null;
}

/**
 * How many results a store is asked for, snapped UP to a few rungs. The answer depends on it, so it
 * is part of the cache key: without it one visitor's resultsPerStore=8&fresh=1 cut the cached answer
 * to 8 items for everybody for 20 minutes (the security review). Rungs, not every value from 8 to 60,
 * so it cannot multiply the lookups one query costs by more than four.
 */
const RESULT_RUNGS = [12, 24, 36, 60];
export function resultLimit(settings) {
  const n = Number(settings?.resultsPerStore) || 36;
  return RESULT_RUNGS.find((r) => r >= n) ?? RESULT_RUNGS[RESULT_RUNGS.length - 1];
}

export function cacheKey(storeId, src, zip, query, limit = 36) {
  // The default keeps its old key, so the cache survives this change.
  return `search:v${CACHE_VERSION}:${storeId}:${src.type}:${zip}:${normalize(query)}${limit === 36 ? '' : `:n${limit}`}`;
}

async function runAdapter(storeId, src, query, zip, settings) {
  const limit = resultLimit(settings);
  switch (src.type) {
    case 'instacart':
      return instacart.search({ ...src, storeId }, query, zip, { limit });
    case 'wholefoods':
      return wholefoods.search(query, zip, { limit });
    case 'traderjoes':
      return traderjoes.search(query, zip, { limit });
    case 'kroger':
      return kroger.search(settings, storeId, query, zip, { limit, chain: src.chain });
    default:
      throw new Error(`Unknown source ${src.type}`);
  }
}


/** Search one store. Returns { storeId, status, items, location, ms, cached, error }. */
export async function searchStore(storeId, query, settings, { fresh = false } = {}) {
  const src = sourceFor(storeId, settings);
  if (!src) return { storeId, status: 'unsupported', items: [], message: STORE_BY_ID[storeId]?.note || 'No price source' };
  const zip = storeZip(settings, storeId);
  if (!zip) return { storeId, status: 'error', items: [], error: 'Set your ZIP code first' };
  const key = cacheKey(storeId, src, zip, query, resultLimit(settings));
  const wasCached = !fresh && peek(key) !== undefined;
  const t0 = Date.now();
  let staleErr = null;
  let shedStale = null;
  // A lookup that would reach the retailer is asked for first (src/guard.js admitCold): shed when
  // the store's queue is long or this visitor is out of new lookups. Then the last saved answer is
  // served, marked stale, or the store says it is busy. No request goes out either way.
  // Kroger's terms allow keeping its content only as long as its cache headers say, so a Kroger
  // answer is never served past its TTL: no saved-price fallback for it, here or on error below.
  const maxStaleMs = src.type === 'kroger' ? 0 : 3 * 24 * 60 * MIN;
  if (!wasCached && settings.admitCold && !settings.admitCold(sourceHosts(src))) {
    const saved = maxStaleMs ? peekStale(key, maxStaleMs) : undefined;
    if (saved === undefined) {
      return { storeId, status: 'busy', items: [], source: src.type, message: `Cartworth is busy, so ${STORE_BY_ID[storeId].name} was not asked just now. Try again in a minute.` };
    }
    shedStale = 'Saved prices: Cartworth is busy, so this store was not asked again just now.';
  }
  try {
    // STORE_TIMEOUT is how long the store's site may go without answering anything, not how long
    // this search may take: at one request in flight per host, a store near the back of a trip
    // plan's queue waits its turn. See withStallTimeout in src/http.js.
    const r = shedStale
      ? peekStale(key, maxStaleMs)
      : await withStallTimeout(
        cached(key, (v) => (v?.cacheTtlMs != null ? Math.min(20 * MIN, v.cacheTtlMs) : 20 * MIN), () => runAdapter(storeId, src, query, zip, settings), { fresh, staleOnError: maxStaleMs > 0, maxStaleMs, onStale: (e) => (staleErr = e) }),
        STORE_TIMEOUT,
        sourceHosts(src),
        { label: STORE_BY_ID[storeId].name },
      );
    const ms = Date.now() - t0;
    health[storeId] = staleErr
      ? { ok: false, at: Date.now(), ms, error: publicError(staleErr.message), source: src.type }
      : { ok: true, at: Date.now(), ms: wasCached ? health[storeId]?.ms ?? ms : ms, error: null, source: src.type };
    const base = { storeId, ms, cached: wasCached || !!shedStale, source: src.type, stale: shedStale || (staleErr ? friendlyError(staleErr) : null) };
    // Chain-wide prices (priceBasis 'national') come from a storefront somewhere else in the
    // country. They carry no location the shopper could visit, and the radius does not apply to
    // them: the directory decided the chain belongs in this search, and the badge says what the
    // price is. Belt and braces for any adapter or cache entry that still carries one.
    const national = !!r.location?.canonical || (r.items.length > 0 && r.items.every((p) => p.priceBasis === 'national'));
    const location = national && r.location ? { ...r.location, name: null, address: null, distance: null, id: null, canonical: true } : r.location;
    // Handoff H1: the radius the shopper chose is the radius prices come from. The directory
    // applies it when it lists stores, but a search re-resolves each store on its own, so
    // /api/search?zip=53211&miles=10 priced Costco's Menomonee Falls warehouse 13.2 mi away. Same
    // definition as discovery (directory.js outsideRadius), on the same snapped radius.
    const radius = snapRadius(settings.maxMiles);
    if (!national && outsideRadius(location?.distance, radius)) {
      return { ...base, status: 'tooFar', items: [], location, message: `The nearest ${STORE_BY_ID[storeId].name} is ${location.distance} mi away, outside your ${radius}-mile radius` };
    }
    // 'blocked': the store refuses automated lookups (see traderjoes.js); not an error to retry.
    return { ...base, status: r.blocked ? 'blocked' : r.items.length ? 'ok' : 'empty', items: r.items, location, message: r.message || null };
  } catch (err) {
    // Refused before it left (http.js requestScope): the store is fine, Cartworth is busy.
    if (err.busy) return { storeId, status: 'busy', items: [], source: src.type, message: `Cartworth is busy, so ${STORE_BY_ID[storeId].name} was not asked just now. Try again in a minute.` };
    health[storeId] = { ok: false, at: Date.now(), ms: Date.now() - t0, error: publicError(err.message), source: src.type };
    return { storeId, status: 'error', items: [], error: friendlyError(err), ms: Date.now() - t0, source: src.type };
  }
}

function friendlyError(err) {
  const m = err.message || String(err);
  if (err.code === 'TIMEOUT') return m;
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|NETWORK|fetch failed/i.test(m)) return 'Could not reach the store site (network)';
  if (/429/.test(m)) return 'The store site is rate-limiting us — wait a minute and retry';
  return m.length > 180 ? m.slice(0, 177) + '…' : m;
}

export function getHealth() {
  return health;
}

/** Attach price-history stats, then record the new observations. */
export function withHistory(items) {
  const stats = historyStats(items);
  recordProducts(items);
  return items.map((p) => (stats[p.key] ? { ...p, hist: stats[p.key] } : p));
}

/** Weekly-ad items matching a query, for enabled stores. */
export async function searchAds(query, settings) {
  const enabled = new Set(settings.stores);
  const raw = await flipp.searchItems(query, settings.zip);
  const now = Date.now();
  const out = [];
  for (const r of raw) {
    const storeId = storeForMerchant(r.merchant);
    if (!storeId || !enabled.has(storeId)) continue;
    const d = flipp.toDeal(r, storeId, r.merchant, now);
    if (d.validTo && Date.parse(d.validTo) < now) continue;
    d.score = relevance(query, { name: `${d.name} ${d.description || ''}` });
    if (d.score < 0.4) continue;
    out.push(d);
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Recent searches used to be kept in a `searches` table here. They are a record of what one person
// looked for, so they now live only in that person's browser (public/js/store.js) and the server
// never sees a history of them.
