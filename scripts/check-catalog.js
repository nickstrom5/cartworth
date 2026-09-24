// Probes every chain in the catalog against a ZIP in a state it claims to operate in,
// so we never ship a guessed Instacart slug. Reports what each chain's price source said.
//
//   node scripts/check-catalog.js                      # every chain with a price source, one ZIP per state
//   node scripts/check-catalog.js aldi kroger          # just these chains
//   node scripts/check-catalog.js --zip 53211,53142    # every in-state priced chain at these ZIPs
//   node scripts/check-catalog.js --zip 53211 freshthyme --fresh   # skip the 3-day store cache
//
// What each answer means. The old script printed "ok" for all three of the first two, which is how a
// slug could be "verified" by a store in another part of the country:
//   local      a store of this chain serves the ZIP; distance and address are real. With --zip, a
//              local store further away than 25 miles is printed as `far` — it exists, but the
//              directory will not show it at the default radius.
//   CANON      no store of this chain serves the ZIP. Instacart answered with its "canonical"
//              storefront elsewhere (Publix answered Chicago with Atlanta). That proves the slug is
//              spelled right and nothing else; only a chain marked `chainWide` in shared/catalog.js
//              may be priced from it, and the directory treats every other chain's canonical answer
//              as "not here".
//   none       nothing under that slug for this ZIP
//   ERROR      we could not ask — never read as an absence
//
// Politeness (the owner's rule): one request at a time to each host, at least 700 ms apart, and
// the run stops at the first HTTP 429. This hits the same public endpoints a shopper's browser
// would.
import { CHAINS, CHAIN_BY_ID, chainsInState } from '../shared/catalog.js';
import * as instacart from '../src/adapters/instacart.js';
import * as wholefoods from '../src/adapters/wholefoods.js';
import * as traderjoes from '../src/adapters/traderjoes.js';
import { configureHost } from '../src/http.js';
import { geocodeZip } from '../src/geo.js';

// After the adapter imports, which set their own (faster, concurrent) limits for these hosts. Every
// retailer storefront the catalog prices from is listed from the catalog itself, so a chain added on
// its own domain (order.shopthepig.com, 23 Sep 2026) cannot be probed at a faster default.
for (const host of new Set(['www.instacart.com', 'www.wholefoodsmarket.com', 'www.traderjoes.com', 'api.zippopotam.us', ...CHAINS.filter((c) => c.price?.base).map((c) => new URL(c.price.base).host)])) {
  configureHost(host, { max: 1, gap: 700 });
}

// One densely-populated ZIP per state, so a chain that exists there should resolve.
const ZIP = {
  AL: '35242', AK: '99503', AZ: '85018', AR: '72223', CA: '90019', CO: '80211', CT: '06106',
  DE: '19803', DC: '20009', FL: '33176', GA: '30307', HI: '96814', ID: '83702', IL: '60618',
  IN: '46220', IA: '50312', KS: '66212', KY: '40205', LA: '70115', ME: '04102', MD: '21212',
  MA: '02139', MI: '48103', MN: '55408', MS: '39211', MO: '63116', MT: '59715', NE: '68144',
  NV: '89123', NH: '03060', NJ: '07030', NM: '87106', NY: '11215', NC: '27607', ND: '58103',
  OH: '43212', OK: '73120', OR: '97214', PA: '19119', RI: '02906', SC: '29205', SD: '57105',
  TN: '37212', TX: '78704', UT: '84105', VT: '05401', VA: '23226', WA: '98103', WV: '25304',
  WI: '53211', WY: '82001',
};
const NEAR_MILES = 25;

const argv = process.argv.slice(2);
const fresh = argv.includes('--fresh');
const zipArg = argv.find((a, i) => argv[i - 1] === '--zip');
const ids = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--zip');
const unknown = ids.filter((a) => !CHAIN_BY_ID[a]);
if (unknown.length) {
  console.error(`Unknown chain id(s): ${unknown.join(', ')}`);
  process.exit(2);
}
const picked = ids.length ? ids.map((a) => CHAIN_BY_ID[a]) : CHAINS;

function zipFor(chain) {
  const states = chain.states === 'US' ? ['IL'] : chain.states;
  for (const s of states) if (ZIP[s]) return { zip: ZIP[s], state: s };
  return { zip: '60618', state: 'IL' };
}

class RateLimited extends Error {}

async function probe(chain, zip, state) {
  const t0 = Date.now();
  const base = { zip, state, chainWide: !!chain.price?.chainWide };
  try {
    if (chain.price.type === 'instacart') {
      const shop = await instacart.resolveShop(chain.price, zip, { fresh });
      if (!shop || shop.none) return { ...base, status: 'none', ms: Date.now() - t0 };
      return {
        ...base,
        status: shop.canonical ? 'canonical' : 'local',
        ms: Date.now() - t0,
        service: shop.serviceType,
        name: shop.label || shop.name,
        address: shop.address,
        basis: shop.serviceType === 'instore' || /no markup/i.test(shop.priceNote || '') ? 'shelf' : 'online',
        distance: shop.distance,
      };
    }
    if (chain.price.type === 'wholefoods' || chain.price.type === 'traderjoes') {
      const s = await (chain.price.type === 'wholefoods' ? wholefoods : traderjoes).resolveStore(zip, { fresh });
      return s && !s.none
        ? { ...base, status: 'local', ms: Date.now() - t0, basis: 'shelf', name: s.name, address: s.address, distance: s.distance }
        : { ...base, status: 'none', ms: Date.now() - t0 };
    }
    return { ...base, status: 'skip', ms: 0 };
  } catch (err) {
    if (err.status === 429 || /\b429\b/.test(err.message || '')) throw new RateLimited(err.message);
    return { ...base, status: 'error', ms: Date.now() - t0, error: (err.message || String(err)).slice(0, 120) };
  }
}

function line(chain, r) {
  const far = r.status === 'local' && r.distance != null && r.distance > NEAR_MILES;
  const mark = far ? '  far ' : { local: ' local', canonical: ' CANON', none: '  none', error: ' ERROR', skip: '  skip' }[r.status];
  let detail = '';
  if (r.status === 'local') detail = `${r.basis.padEnd(6)} ${r.distance != null ? `${r.distance}mi`.padStart(8) : '   ?mi  '}  ${r.name || ''}${r.address ? ` — ${r.address}` : ''}`;
  else if (r.status === 'canonical') detail = `no store serves ${r.zip}; Instacart offered ${r.name}, ${r.distance ?? '?'} mi away${r.chainWide ? ' (chainWide: priced as national)' : ' (not chainWide: NOT priceable here)'}`;
  else if (r.status === 'error') detail = r.error;
  return `${mark} ${chain.id.padEnd(16)} ${r.state} ${r.zip} ${String(r.ms).padStart(6)}ms  ${detail}`;
}

async function main() {
  // Build the work list: (chain, zip) pairs.
  const work = [];
  if (zipArg) {
    for (const zip of zipArg.split(',').map((z) => z.trim()).filter(Boolean)) {
      const geo = await geocodeZip(zip);
      const inState = new Set(chainsInState(geo.state).map((c) => c.id));
      for (const c of picked) if (c.price && (ids.length || inState.has(c.id))) work.push({ chain: c, zip, state: geo.state });
    }
  } else {
    for (const c of picked) if (c.price) work.push({ chain: c, ...zipFor(c) });
  }
  console.log(`Probing ${work.length} chain/ZIP pairs, one at a time${fresh ? ' (fresh — bypassing the store cache)' : ''}…\n`);

  const results = [];
  for (const { chain, zip, state } of work) {
    const r = await probe(chain, zip, state);
    results.push({ chain, ...r });
    console.log(line(chain, r));
  }

  const by = (s) => results.filter((r) => r.status === s);
  const near = by('local').filter((r) => r.distance == null || r.distance <= NEAR_MILES);
  console.log(`\n${near.length} local within ${NEAR_MILES} mi · ${by('local').length - near.length} local but further · ${by('canonical').length} canonical only · ${by('none').length} no store · ${by('error').length} error`);
  if (zipArg) {
    for (const zip of [...new Set(results.map((r) => r.zip))]) {
      const here = results.filter((r) => r.zip === zip);
      const priceable = here.filter((r) => (r.status === 'local' && r.distance != null && r.distance <= NEAR_MILES) || (r.status === 'canonical' && r.chainWide));
      // A chain-wide listing only reaches the directory where Flipp also carries that chain's
      // circular for the ZIP (src/directory.js); this script does not ask Flipp, so it says so.
      console.log(`  ${zip}: ${priceable.length} priceable at ${NEAR_MILES} mi — ${priceable.map((r) => r.chain.id + (r.status === 'canonical' ? '(national, if it advertises here)' : '')).join(', ')}`);
    }
  }
  if (by('none').length) {
    console.log('\nNo store resolved (slug is probably wrong, or the chain is not on Instacart):');
    for (const r of by('none')) console.log(`  ${r.chain.id}  slug=${r.chain.price.slug ?? r.chain.price.type}  tried ${r.state} ${r.zip}`);
  }
  if (by('canonical').length) {
    console.log('\nOnly Instacart\'s out-of-area storefront answered (slug exists, no store near the ZIP):');
    for (const r of by('canonical')) console.log(`  ${r.chain.id}  ${r.state} ${r.zip}  -> ${r.name} (${r.distance ?? '?'} mi)${r.chainWide ? '  [chainWide]' : ''}`);
  }
  if (by('error').length) {
    console.log('\nErrors (no conclusion — re-run):');
    for (const r of by('error')) console.log(`  ${r.chain.id} ${r.zip}: ${r.error}`);
  }
  const shelf = near.filter((r) => r.basis === 'shelf');
  console.log(`\n${new Set(shelf.map((r) => r.chain.id)).size} chains give true shelf prices: ${[...new Set(shelf.map((r) => r.chain.id))].join(', ')}`);
}

main().catch((e) => {
  if (e instanceof RateLimited) {
    console.error(`\nStopped: HTTP 429 (${e.message}). Nothing further was requested.`);
    process.exit(3);
  }
  console.error(e);
  process.exit(1);
});
