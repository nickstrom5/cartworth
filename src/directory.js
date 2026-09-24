// Finds which grocery chains actually exist near a ZIP, anywhere in the US.
//
// Two signals, no guessing:
//   1. Flipp tells us which merchants publish a weekly circular for that postal code. A merchant
//      with a flyer for your ZIP has stores near you — that is the discovery step.
//   2. For each candidate chain we then ask its own price source to resolve a store for the ZIP.
//      That confirms the store exists, gives its address and distance, and tells us whether we
//      get true shelf prices or an online/delivery listing.
//
// A chain is only kept if one of those two actually answered. Nothing here is inferred from the
// chain list alone — the catalog's `states` field is a cost filter that decides who to ASK,
// never who to show.
//
// "Answered" has to mean answered ABOUT THIS ZIP. Instacart never says "no store here": it hands
// back a canonical storefront somewhere else in the country, and that answer is not evidence of a
// store near anyone (see `chainWide` in shared/catalog.js for what it did to Chicago and Milwaukee).
import { CHAINS, CHAIN_BY_ID, ALWAYS_PROBE, chainForName, chainsInState } from '../shared/catalog.js';
import * as instacart from './adapters/instacart.js';
import * as wholefoods from './adapters/wholefoods.js';
import * as traderjoes from './adapters/traderjoes.js';
import * as flipp from './adapters/flipp.js';
import * as kroger from './adapters/kroger.js';
import { cached, peek, DAY, MIN } from './cache.js';
import { cacheGetStale } from './db.js';
import { withStallTimeout } from './http.js';
import { geocodeZip, stateCode } from './geo.js';

// Chains whose weekly ad we read from their OWN site rather than from Flipp's flyer list.
// `hasAds` below is derived from Flipp, so without this Whole Foods was reported as having no
// circular while the Sales screen listed 45 Whole Foods deals for the very same ZIP — two screens
// contradicting each other about the same store. src/deals.js is the other half of this pair
// (getDeals appends wholefoods.sales); if a chain is added to one, add it to the other.
const OWN_SALES_FEED = new Set(['wholefoods']);

const PROBE_CONCURRENCY = 4;
// How long a retailer may go without answering ANYTHING before every lookup queued on it fails
// (http.js withStallTimeout). It must outlast the slowest single request the adapters allow, or one
// slow-but-permitted Instacart storefront load (up to 20 s) could fail every chain queued behind
// it. (In the Charlotte, Dallas and St. Louis audits all Instacart chains went unresolved at once;
// a re-run showed Instacart rate-limiting too, so this was at most part of it.)
export const PROBE_TIMEOUT = 25000;

// How long a build with an unanswered probe is trusted before it is rebuilt. See directory().
export const UNRESOLVED_RETRY_MS = 10 * MIN;
// Bump when what a build MEANS changes; directory() rebuilds anything older. See directory().
const BUILD_VERSION = 2;

/** How a chain near you can be priced. */
export const STATUS = {
  shelf: 'shelf', // live in-store shelf prices at the store nearest you
  online: 'online', // your local store's online/delivery listing, which can run above the shelf
  // A chain-wide listing not tied to your store (Walmart on Instacart). Only a `chainWide` chain
  // that also advertises into this ZIP gets it — see probe() and build().
  national: 'national',
  adsOnly: 'adsOnly', // weekly circular only
  none: 'none',
};

/**
 * Is a resolved store further away than the shopper's radius?
 *
 * This is THE definition of "too far", and it is exported so that pricing uses the same one as
 * discovery. The radius used to exist only here, at discovery time: the search, the trip planner
 * and the watchlist re-resolve each store and never looked at the radius again, so
 * /api/search?zip=53211&miles=10 priced Costco's Menomonee Falls warehouse, 13.2 mi away — while
 * public/js/store.js promises "we never show a store on screen that is further away than the
 * radius they chose". Pass the SNAPPED radius (server.js snapRadius), the one the directory was
 * built with, or the two can disagree about a store between rungs.
 *
 * A store with no known distance is not "known to be too far"; national (chain-wide) results carry
 * no distance by design. Discovery is stricter than this about unknown distances — see probe().
 */
export function outsideRadius(distance, maxMiles) {
  return distance != null && Number.isFinite(Number(distance)) && Number.isFinite(Number(maxMiles)) && Number(distance) > Number(maxMiles);
}

/**
 * The hosts a price source talks to, for withStallTimeout. A probe or a search is only "timed out"
 * when these stop answering; waiting in their queue is not the retailer being slow.
 */
export function sourceHosts(src) {
  if (!src) return [];
  switch (src.type) {
    case 'instacart': return [new URL(src.base).host];
    case 'wholefoods': return ['www.wholefoodsmarket.com'];
    case 'traderjoes': return ['www.traderjoes.com', 'alphaapi.brandify.com'];
    case 'kroger': return ['api.kroger.com'];
    default: return [];
  }
}

/**
 * The server's own Kroger keys (ops/kroger-launch.md), when set. City Market and Baker's are Kroger
 * banners with no Instacart listing: with these keys they are located and priced through the Kroger
 * API; without them they stay weekly-ad only.
 */
function serverKroger() {
  const clientId = String(process.env.KROGER_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.KROGER_CLIENT_SECRET || '').trim();
  return clientId && clientSecret ? { kroger: { clientId, clientSecret, server: true } } : null;
}
function krogerOnly(chain) {
  if (chain?.price || chain?.alt?.type !== 'kroger') return false;
  const k = serverKroger();
  return !!k && kroger.available(k);
}
export const priceable = (c) => !!c?.price || krogerOnly(c);

const withTimeout = (p, ms, src) => withStallTimeout(p, ms, sourceHosts(src), { label: 'The store locator' });

/** Ask one chain's own price source whether it serves this ZIP. */
async function probe(chain, zip, geo, maxMiles) {
  const out = {
    id: chain.id,
    name: chain.name,
    short: chain.short,
    status: STATUS.none,
    distance: null,
    address: null,
    note: chain.note || null,
    priceNote: null,
  };
  const viaKroger = krogerOnly(chain);
  if (!chain.price && !viaKroger) return out;
  try {
    if (viaKroger) {
      const s = await withTimeout(kroger.resolveStore(serverKroger(), zip, chain.alt.chain), PROBE_TIMEOUT, { type: 'kroger' });
      if (!s || s.none) return out;
      out.status = STATUS.shelf;
      out.distance = s.distance ?? null;
      out.address = s.address ?? null;
      out.priceNote = 'Exact store prices (Kroger API)';
    } else if (chain.price.type === 'instacart') {
      const shop = await withTimeout(instacart.resolveShop(chain.price, zip), PROBE_TIMEOUT, chain.price);
      if (!shop || shop.none) return out;
      if (shop.canonical) {
        // Instacart's canonical storefront: no store of this chain serves this ZIP, so Instacart
        // offered one somewhere else. For every chain but a `chainWide` one that is the end of it —
        // the answer is "not here". Reading it as "national prices" listed Publix, Hy-Vee, Cub,
        // Dierbergs, Schnucks and Save A Lot as priceable Chicago stores, priced from Atlanta,
        // Lincoln NE, Minneapolis and St. Louis-area storefronts.
        if (!chain.price.chainWide) {
          out.canonicalOnly = true;
          return out;
        }
        // A chain-wide listing is real, but it belongs to the chain, not to a store near the
        // shopper. It carries the chain's name and nothing that locates a store: the canonical
        // storefront's address and distance (Walmart #2697, Antioch CA, 1,801 mi from Milwaukee)
        // are true of Antioch and false of anything the shopper could visit.
        out.status = STATUS.national;
        out.priceNote = shop.priceNote ?? null;
        out.serviceType = shop.serviceType;
        out.canonical = true;
        return out;
      }
      const shelf = shop.serviceType === 'instore' || /no markup/i.test(shop.priceNote || '');
      out.status = shelf ? STATUS.shelf : STATUS.online;
      out.distance = shop.distance ?? null;
      out.address = shop.address ?? null;
      out.priceNote = shop.priceNote ?? null;
      out.serviceType = shop.serviceType;
      out.canonical = false;
    } else if (chain.price.type === 'wholefoods') {
      const s = await withTimeout(wholefoods.resolveStore(zip), PROBE_TIMEOUT, chain.price);
      if (!s || s.none) return out;
      out.status = STATUS.shelf;
      out.distance = s.distance ?? null;
      out.address = s.address ?? null;
    } else if (chain.price.type === 'traderjoes') {
      const s = await withTimeout(traderjoes.resolveStore(zip), PROBE_TIMEOUT, chain.price);
      if (!s || s.none) return out;
      out.status = STATUS.shelf;
      out.distance = s.distance ?? null;
      out.address = s.address ?? null;
    }
  } catch (err) {
    out.error = (err.message || String(err)).slice(0, 120);
    // Not an answer. A probe that timed out used to fall through as "none", which silently dropped
    // the chain from a build that was then cached for three days. The same ZIP, rebuilt a minute
    // later from a warm cache, went from 23 chains to 30 (60618, 23 Sep 2026): the slow probes
    // had finished in the background. build() records these and directory() rebuilds soon.
    out.unresolved = true;
  }
  if (out.status === STATUS.shelf || out.status === STATUS.online) {
    if (out.distance == null) {
      // A local store we could not place. "Within N miles" is a claim about distance, so a store
      // without one cannot be counted inside the radius; it is retried like a failed probe rather
      // than shown with a distance nobody measured.
      out.status = STATUS.none;
      out.unresolved = true;
      out.error = out.error || 'store location unavailable';
    } else if (outsideRadius(out.distance, maxMiles)) {
      // A store that resolved but sits outside the search radius is not "near you".
      out.status = STATUS.none;
      out.tooFar = true;
    }
  }
  return out;
}

async function pool(items, worker, concurrency) {
  const queue = [...items];
  const out = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) out.push(await worker(queue.shift()));
    }),
  );
  return out;
}

/**
 * Chains an earlier build for this ZIP and radius found LOCATED inside the radius.
 *
 * The catalog's `states` list decides who to ask, and a chain from another state is only asked when
 * Flipp carries its circular for this postal code that week. At a border ZIP that made the count
 * depend on Flipp: at Kenosha 53142 on 23 Sep, Jewel-Osco (7.1 mi, Zion IL), Tony's (11.9 mi,
 * Waukegan) and Mariano's (21.1 mi, Vernon Hills) were "within 25 miles" only because their weekly
 * ads reached 53142 — and Flipp's list for a ZIP changes day to day (60618's "Publix Liquors" ad ran
 * 17–23 Sep). A week without the Jewel flyer would have printed three fewer chains near a shopper
 * whose stores had not moved.
 *
 * So a chain once located near this ZIP is asked again, whatever Flipp says this week. This is a
 * rule about who to ASK, like `states`, never about who to show: the probe is still the evidence,
 * and a store that has closed or moved out of range comes back none or too far and is dropped. It
 * costs nothing new — those answers sit in the adapters' own store cache.
 */
function previouslyNearby(key) {
  const prev = peek(key) ?? cacheGetStale(key, 30 * DAY);
  if (!Array.isArray(prev?.chains)) return [];
  return prev.chains.filter((c) => c.status === STATUS.shelf || c.status === STATUS.online).map((c) => c.id);
}

async function build(zip, { maxMiles, remembered = [] }) {
  const geo = await geocodeZip(zip);
  // stateCode: a geocode cached before the Nominatim fix may still carry the state's name.
  const state = geo.state ? stateCode({ state: geo.state }) : '';

  // 1. Who publishes a circular for this ZIP? Flipp carries hardware stores, pharmacies and
  //    department stores too, so only grocery flyers count towards "stores near you".
  let merchants = [];
  let groceryMerchants = new Set();
  let adsError = null;
  try {
    const flyers = await flipp.flyers(zip);
    for (const f of flyers) {
      if (!f.merchant) continue;
      merchants.push(f.merchant);
      if ((f.categories || []).includes('Groceries')) groceryMerchants.add(f.merchant);
    }
    merchants = [...new Set(merchants)];
  } catch (err) {
    adsError = err.message || String(err);
  }
  const adChainIds = new Set();
  const unknownMerchants = [];
  for (const m of merchants) {
    const c = chainForName(m);
    // A known chain counts however Flipp filed it; an unknown merchant only counts as a
    // grocery store we're missing if Flipp says it sells groceries.
    if (c) adChainIds.add(c.id);
    else if (groceryMerchants.has(m)) unknownMerchants.push(m);
  }

  // 2. Who do we ask about prices? Chains with a flyer here, the national chains that often have
  //    no flyer, and chains in this state that could never be discovered via Flipp (no circular).
  const inState = new Set(chainsInState(state).map((c) => c.id));
  const candidates = new Set();
  for (const id of adChainIds) candidates.add(id);
  for (const id of ALWAYS_PROBE) if (inState.has(id)) candidates.add(id);
  // Every in-state chain we have a price source for, whether or not Flipp carried its circular
  // this week. Gating this on "has no ads name" meant Metro Market — 0.6 mi from 53211, fully
  // priceable, and the nearest grocer a Milwaukee shopper has — was never asked at all, purely
  // because it HAS an ads name and Flipp happened to publish no Metro Market flyer that week.
  // Discovery of a store we can price must not hinge on a circular existing.
  for (const c of CHAINS) if (inState.has(c.id) && priceable(c)) candidates.add(c.id);
  // And every chain an earlier build located inside this radius (see previouslyNearby).
  for (const id of remembered) if (priceable(CHAIN_BY_ID[id])) candidates.add(id);

  // Ask everyone in that set who has a price source. The state list stays what the header says it
  // is — a cost filter on who to ASK, which is what keeps `candidates` small — but it must not
  // VETO a chain Flipp says advertises into this postal code. At a border ZIP it did exactly that:
  // Kenosha 53142 priced a Whole Foods 22.1 mi away in Vernon Hills IL (Whole Foods is also a
  // Wisconsin chain) while refusing to price a Jewel-Osco 7.1 mi away in Zion IL (Jewel is not).
  // Distance is the honest filter, and probe() already applies it: anything past maxMiles comes
  // back status none and falls through to ads-only below, exactly as before.
  const toProbe = [...candidates].filter((id) => priceable(CHAIN_BY_ID[id]));

  const probed = await pool(toProbe, (id) => probe(CHAIN_BY_ID[id], zip, geo, maxMiles), PROBE_CONCURRENCY);
  const byId = Object.fromEntries(probed.map((p) => [p.id, p]));

  // 3. Assemble. A chain is included if it priced OR it has a circular for this ZIP.
  const chains = [];
  const unresolved = [];
  for (const id of new Set([...toProbe, ...adChainIds])) {
    const chain = CHAIN_BY_ID[id];
    if (!chain) continue;
    const p = byId[id];
    if (p?.unresolved) unresolved.push(id);
    const hasAds = adChainIds.has(id) || (OWN_SALES_FEED.has(id) && !!p && p.status !== STATUS.none);
    let status = p && p.status !== STATUS.none ? p.status : hasAds ? STATUS.adsOnly : STATUS.none;
    // A chain-wide listing says nothing about where the chain's stores are — Walmart's answers
    // Barrow AK exactly as it answers Milwaukee. The only evidence that one is near this ZIP is a
    // circular Flipp publishes for it, so a national listing without one is not a store near you.
    if (status === STATUS.national && !hasAds) status = STATUS.none;
    if (status === STATUS.none) continue;
    chains.push({
      id,
      name: chain.name,
      short: chain.short,
      status,
      hasAds,
      distance: p?.distance ?? null,
      address: p?.address ?? null,
      note: chain.note || null,
      priceNote: p?.priceNote ?? null,
      error: p?.error ?? null,
    });
  }

  const rank = { shelf: 0, online: 1, national: 2, adsOnly: 3 };
  chains.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    const da = a.distance ?? 999;
    const db = b.distance ?? 999;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  return {
    version: BUILD_VERSION,
    zip,
    city: geo.city,
    state,
    maxMiles,
    chains,
    counts: countsFor(chains, unresolved),
    // Chains we asked and could not get an answer from (timeout, network, no location). They are
    // not in `chains` as priced stores, so every count above may be low by this many until the
    // retry in directory() lands. Say so rather than print a confident number.
    unresolved: unresolved.sort(),
    // Merchants with a flyer here that we don't have a price source for. Useful for knowing what
    // we're missing in a region, and shown to the user so the list doesn't look arbitrary.
    otherMerchants: unknownMerchants.sort(),
    adsError,
    builtAt: Date.now(),
  };
}

/**
 * The numbers behind the "N chains within X miles" line, computed once here so the website, the
 * app and the scripts cannot each count differently.
 *
 *   nearby    shelf + online: a store we located, inside the radius. The only chains that can
 *             honestly be called "within X miles".
 *   national  a chain-wide listing (Walmart). Real prices, a chain that advertises here, but no
 *             store and no distance — so it is never part of "within X miles".
 *   adsOnly   weekly circular only.
 *   unresolved  asked, no answer yet; the other counts may be low by up to this many.
 *
 * Round 1 could not agree whether Milwaukee had 19 or 20 chains, and the site printed "15 chains
 * within 25 miles" for a list that included Schnucks and The Fresh Market, whose nearest stores
 * are in Godfrey IL and Destin FL.
 */
export function countsFor(chains, unresolved = []) {
  const n = (s) => chains.filter((c) => c.status === s).length;
  return {
    nearby: n(STATUS.shelf) + n(STATUS.online),
    national: n(STATUS.national),
    adsOnly: n(STATUS.adsOnly),
    unresolved: unresolved.length,
  };
}

/**
 * Chains near a ZIP. Cached for 3 days — store footprints don't move.
 *
 * Except when the build is incomplete. A probe that timed out is not an answer, and caching the
 * gap for three days is how one slow minute at Instacart became three days of a missing store.
 * The adapters keep going after our timeout and cache what they find, so a rebuild a few minutes
 * later is nearly free — every answered probe comes straight from its own cache, and only the
 * chains that failed are asked again.
 *
 * A build from before BUILD_VERSION is rebuilt the same way. Version 2 stopped reading a canonical
 * Instacart answer as a "national" store (see probe()) and added `counts` and `unresolved`; a
 * version-1 entry would go on listing Publix as a Chicago store for up to three days (thirty,
 * stale). The version lives in the payload rather than the key so that the key stays one entry
 * per ZIP per offered radius (test/qa-search-radius.test.js pins that shape).
 */
export async function directory(zip, { maxMiles = 25, fresh = false } = {}) {
  const key = `dir:v1:${zip}:${maxMiles}`;
  const run = () => build(zip, { maxMiles, remembered: previouslyNearby(key) });
  const dir = await cached(key, 3 * DAY, run, { fresh, maxStaleMs: 30 * DAY });
  if (fresh) return dir;
  const outdated = dir?.version !== BUILD_VERSION;
  const incomplete = dir?.unresolved?.length > 0 && Date.now() - dir.builtAt > UNRESOLVED_RETRY_MS;
  if (outdated || incomplete) return cached(key, 3 * DAY, run, { fresh: true, maxStaleMs: 30 * DAY });
  return dir;
}

/** The store ids we'd turn on by default for a ZIP: everything that gives live prices, nearest first. */
export function defaultStoreIds(dir, limit = 8) {
  const priced = dir.chains.filter((c) => c.status === STATUS.shelf || c.status === STATUS.online || c.status === STATUS.national);
  return priced.slice(0, limit).map((c) => c.id);
}
