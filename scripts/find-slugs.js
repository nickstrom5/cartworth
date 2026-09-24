// For chains whose Instacart slug didn't resolve, try plausible variants against a ZIP where the
// chain definitely operates, and report which one actually works. Guessing a slug into the catalog
// would ship a store that silently never returns prices, so we confirm each one first.
//
//   node scripts/find-slugs.js                     # every chain below
//   node scripts/find-slugs.js sendiks piggly      # just these
//
// What counts as "works" — three answers that used to be reported as one:
//   local      Instacart resolved a store of this chain that serves the ZIP, with an address and a
//              distance. This is the only answer that verifies a slug.
//   canonical  The slug exists on Instacart, but no store of it serves this ZIP, so Instacart handed
//              back one storefront somewhere else in the country. That proves the slug is spelled
//              right and NOTHING about the chain near this ZIP. This script used to call it "ok",
//              which is how a slug could be "verified" by a store 500 miles away.
//   none       Instacart has nothing under that slug.
//   error      We could not ask (network, timeout, rate limit). The old script swallowed errors as
//              "not found" and then recommended `price: null` — i.e. a flaky minute could delete a
//              working price source. An error is now reported as an error and never as an absence.
//
// A candidate is either a slug on the instacart.com marketplace, or { base, slug, guest } for a
// retailer's OWN storefront on Instacart's platform (Storefront Pro) — shopwoodmans.com and aldi.us
// are two already in the catalog. Some chains are only there: Piggly Wiggly Midwest's "Order
// online" goes to order.shopthepig.com/store/shopthepig/storefront, while the marketplace's
// 'piggly-wiggly' is the Southern chain. Found by reading the chain's own homepage, once.
//
// Politeness (the owner's rule, not a suggestion): one request at a time to each host, at least
// 700 ms apart, and the run stops at the first HTTP 429 instead of trying the next slug.
import * as instacart from '../src/adapters/instacart.js';
import { configureHost } from '../src/http.js';

const IC = 'https://www.instacart.com';
const PREFER = ['instore', 'pickup', 'delivery'];

// chain id -> [[ZIPs where it operates], ...candidates]
// Every ZIP listed must be one the chain really serves: a slug is only verified by a LOCAL answer.
// Put a chain's own storefront first when it has one: the first local answer ends the search.
const CANDIDATES = {
  dollargeneral: [['37212'], 'dollar-general', 'dollar-general-store'],
  frys: [['85018'], 'frys-food', 'frys', 'frys-food-and-drug', 'frys-marketplace'],
  smiths: [['84105'], 'smiths', 'smiths-food-drug', 'smiths-marketplace', 'smiths-food-and-drug-centers'],
  harristeeter: [['27607'], 'harris-teeter', 'harristeeter', 'harris-teeter-supermarket'],
  food4less: [['90019'], 'food-4-less', 'foods-co', 'food4less', 'food-4-less-california'],
  citymarket: [['80211'], 'city-market', 'city-market-co', 'citymarket'],
  bakersplus: [['68144'], 'bakers-plus', 'bakers', 'bakers-supermarkets'],
  jayc: [['46220'], 'jay-c', 'jayc', 'jay-c-food-store'],
  starmarket: [['02139'], 'star-market', 'star-markets', 'starmarket'],
  shaws: [['04102'], 'shaws', 'shaws-supermarket', 'shaws-supermarkets'],
  carrs: [['99503'], 'carrs', 'carrs-safeway', 'carrs-quality-center'],
  giant: [['21212'], 'giant-food', 'giant', 'giant-food-stores', 'giantfood'],
  pricerite: [['06106'], 'price-rite', 'price-rite-marketplace', 'pricerite'],
  tops: [['14213'], 'tops', 'tops-friendly-markets', 'tops-markets'],
  harveys: [['31021'], 'harveys', 'harveys-supermarket', 'harveys-supermarkets'],
  ingles: [['28801'], 'ingles', 'ingles-markets', 'ingles-market'],
  dierbergs: [['63116'], 'dierbergs', 'dierbergs-markets', 'dierbergs-market'],
  cub: [['55408'], 'cub', 'cub-foods', 'cub-pharmacy'],
  coborns: [['56301'], 'coborns', 'coborns-delivers', 'coborns-grocery'],
  // Wisconsin. Milwaukee (53211) and Kenosha (53142) are the two WI ZIPs the owner tests with.
  sendiks: [['53211', '53142'], 'sendiks-food-market', 'sendiks', 'sendiks-fresh2go', 'sendiks-food-markets', 'sendik-s-food-market'],
  // Checked 23 Sep 2026: the marketplace slugs below are 'none', or 'canonical' 844-878 mi away (the
  // Southern Piggly Wiggly). The Wisconsin stores' own online ordering is the storefront first.
  piggly: [['53211', '53142'], { base: 'https://order.shopthepig.com', slug: 'shopthepig', guest: 'implicit' }, { base: 'https://order.shopthepig.com', slug: 'shopthepig', guest: 'postal' },
    'piggly-wiggly-midwest', 'piggly-wiggly', 'pigglywiggly', 'piggly-wiggly-wi', 'piggly-wiggly-wisconsin'],
  freshthyme: [['53211', '53142'], 'fresh-thyme', 'fresh-thyme-market', 'fresh-thyme-farmers-market', 'freshthyme', 'fresh-thyme-markets'],
  saveolot: [['63116'], 'save-a-lot', 'savealot', 'save-alot'],
  savemart: [['95350'], 'save-mart', 'savemart', 'save-mart-supermarkets'],
  lowesfoods: [['27607'], 'lowes-foods', 'lowesfoods', 'lowes-food'],
  rosauers: [['99201'], 'rosauers', 'rosauers-supermarkets', 'rosauers-food-drug'],
  wakefern: [['10024'], 'fairway', 'fairway-market', 'fairway-markets'],
  foodtown: [['11215'], 'foodtown', 'food-town', 'foodtown-supermarkets'],
  northgate: [['90019'], 'northgate-market', 'northgate-gonzalez', 'northgate-gonzalez-markets', 'northgate-markets'],
  cardenas: [['92503'], 'cardenas-markets', 'cardenas-market', 'cardenas'],
  sedanos: [['33176'], 'sedanos-supermarkets', 'sedanos', 'sedanos-supermarket'],
  patel: [['60618'], 'patel-brothers', 'patel-bros', 'patelbrothers'],
  seafoodcity: [['90019'], 'seafood-city', 'seafood-city-supermarket', 'seafoodcity'],
};

// After the adapter import, which sets its own (faster, concurrent) limits for these hosts.
for (const host of new Set(['www.instacart.com', 'www.aldi.us', 'shopwoodmans.com', ...Object.values(CANDIDATES).flatMap(([, ...c]) => c.map((x) => new URL(x.base || IC).host))])) {
  configureHost(host, { max: 1, gap: 700 });
}

class RateLimited extends Error {}

/** A candidate as the adapter's price-source config, and as the catalog line that would use it. */
function sourceOf(c) {
  const cfg = typeof c === 'string' ? { base: IC, slug: c, guest: 'implicit' } : { base: c.base, slug: c.slug, guest: c.guest || 'implicit' };
  const own = cfg.base !== IC;
  return { ...cfg, label: own ? `${new URL(cfg.base).host}/${cfg.slug} (${cfg.guest})` : cfg.slug, catalog: own ? `ic('${cfg.slug}', '${cfg.base}', '${cfg.guest}')` : `ic('${cfg.slug}')` };
}

async function tryOne(candidate, zip) {
  const src = sourceOf(candidate);
  const slug = src.label;
  try {
    const shop = await instacart.resolveShop({ type: 'instacart', base: src.base, slug: src.slug, prefer: PREFER, guest: src.guest }, zip);
    if (!shop || shop.none) return { kind: 'none', slug, zip };
    return {
      kind: shop.canonical ? 'canonical' : 'local',
      slug,
      zip,
      name: shop.label || shop.name,
      address: shop.address,
      service: shop.serviceType,
      distance: shop.distance,
      basis: shop.serviceType === 'instore' || /no markup/i.test(shop.priceNote || '') ? 'shelf' : 'online',
    };
  } catch (err) {
    if (err.status === 429 || /\b429\b/.test(err.message || '')) throw new RateLimited(err.message);
    return { kind: 'error', slug, zip, error: (err.message || String(err)).slice(0, 120) };
  }
}

function describe(r) {
  if (r.kind === 'local') return `local     ${r.zip} ${r.slug.padEnd(28)} ${r.basis.padEnd(6)} ${`${r.distance ?? '?'}mi`.padStart(7)}  ${r.name} — ${r.address || '(no address)'}`;
  if (r.kind === 'canonical') return `canonical ${r.zip} ${r.slug.padEnd(28)} slug exists; no store serves this ZIP (Instacart offered ${r.name}, ${r.distance ?? '?'} mi away)`;
  if (r.kind === 'error') return `ERROR     ${r.zip} ${r.slug.padEnd(28)} ${r.error}`;
  return `none      ${r.zip} ${r.slug}`;
}

async function main() {
  const wanted = process.argv.slice(2);
  const entries = Object.entries(CANDIDATES).filter(([id]) => !wanted.length || wanted.includes(id));
  if (wanted.length && entries.length !== wanted.length) {
    console.error(`Unknown chain(s): ${wanted.filter((w) => !CANDIDATES[w]).join(', ')}`);
    process.exit(2);
  }
  const verdict = {};
  for (const [id, [zips, ...slugs]] of entries) {
    console.log(`\n${id}`);
    const tried = [];
    let found = null;
    for (const candidate of slugs) {
      const slug = sourceOf(candidate).label;
      // A slug that Instacart has never heard of is `none` at every ZIP, so one ZIP is enough to
      // rule it out; a slug that exists is then checked at every ZIP given, because a chain that
      // resolves locally in Milwaukee may not in Kenosha, and the catalog has to say so honestly.
      const first = await tryOne(candidate, zips[0]);
      tried.push(first);
      console.log(`  ${describe(first)}`);
      if (first.kind === 'none') continue;
      for (const zip of zips.slice(1)) {
        const r = await tryOne(candidate, zip);
        tried.push(r);
        console.log(`  ${describe(r)}`);
      }
      if (tried.some((r) => r.slug === slug && r.kind === 'local')) {
        found = { label: slug, catalog: sourceOf(candidate).catalog };
        break;
      }
    }
    verdict[id] = { found, tried };
  }

  const ok = Object.entries(verdict).filter(([, v]) => v.found);
  const errored = Object.entries(verdict).filter(([, v]) => !v.found && v.tried.some((r) => r.kind === 'error'));
  const canonicalOnly = Object.entries(verdict).filter(([, v]) => !v.found && !v.tried.some((r) => r.kind === 'error') && v.tried.some((r) => r.kind === 'canonical'));
  const absent = Object.entries(verdict).filter(([, v]) => v.tried.every((r) => r.kind === 'none'));

  console.log(`\n${ok.length} verified by a local store · ${canonicalOnly.length} exist on Instacart but no local store · ${absent.length} not on Instacart · ${errored.length} could not be checked`);
  if (ok.length) {
    console.log('\nCatalog patch (verified by a LOCAL store at these ZIPs):');
    for (const [id, v] of ok) {
      const locals = v.tried.filter((r) => r.slug === v.found.label && r.kind === 'local').map((r) => `${r.zip} ${r.distance ?? '?'}mi`);
      console.log(`  ${id}: ${v.found.catalog}   // ${locals.join(', ')}`);
    }
  }
  if (canonicalOnly.length) console.log(`\nSlug exists but no store near the test ZIP(s) — do NOT add on this evidence: ${canonicalOnly.map(([id]) => id).join(', ')}`);
  if (absent.length) console.log(`\nNot on Instacart under any slug tried — keep price: null (weekly ad only): ${absent.map(([id]) => id).join(', ')}`);
  if (errored.length) console.log(`\nCould not be checked (errors) — no conclusion, re-run later: ${errored.map(([id]) => id).join(', ')}`);
}

main().catch((e) => {
  if (e instanceof RateLimited) {
    console.error(`\nStopped: Instacart answered HTTP 429 (${e.message}). Nothing further was requested.`);
    process.exit(3);
  }
  console.error(e);
  process.exit(1);
});
