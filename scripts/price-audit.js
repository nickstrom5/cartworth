// The final price check: what the "Best price" headline says, for every staple, at every ZIP.
//
// Runs the production path the website and the phone share — directory -> searchStore ->
// bestPerStore -> savingsClaim — and writes every answer, with the runner-up, the price basis and
// anything flagged, so a person can read each one against the retailer's own page. It does not
// judge; scripts/check-prices.js hunts outliers, this records the headline.
//
// Every request goes through src/http.js: one in flight per host, 700 ms apart, stop on 429.
//
//   BASKET_DATA_DIR=<scratch> node scripts/price-audit.js --out audit.json [--zips 60618,53211] [q1 q2 ...]
//
// In a cloud session, add NODE_USE_ENV_PROXY=1: Node's fetch ignores HTTPS_PROXY without it, and
// its direct connections are refused ("Host not in allowlist") even for allowed retailer hosts.
import fs from 'node:fs';
import { searchStore } from '../src/search.js';
import { directory, STATUS } from '../src/directory.js';
import { contextFrom } from '../src/context.js';
import { bestPerStore, savingsClaim, standings, excludedCheaper } from '../shared/compare.js';
import { DISPLAY_UNITS } from '../shared/units.js';
import { cached, DAY } from '../src/cache.js';

// ZIP centroids for the four audit ZIPs (the same figures the directory tests use; Lombard added).
// Seeded so an audit does not depend on the geocoders being reachable: a cloud session's network
// allowlist may admit the retailers and not zippopotam.us or Nominatim.
const GEO = {
  60618: { zip: '60618', lat: 41.9464, lng: -87.7042, city: 'Chicago', state: 'IL' },
  60148: { zip: '60148', lat: 41.8739, lng: -88.0185, city: 'Lombard', state: 'IL' },
  53211: { zip: '53211', lat: 43.082, lng: -87.8895, city: 'Milwaukee', state: 'WI' },
  53142: { zip: '53142', lat: 42.556, lng: -87.8705, city: 'Kenosha', state: 'WI' },
};

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const OUT = opt('--out', 'price-audit.json');
const ZIPS = opt('--zips', '60618,60148,53211,53142').split(',');
const MILES = +opt('--miles', '25');
const QUERIES = argv.length ? argv : [
  'milk', 'eggs', 'butter', 'bread', 'bananas', 'chicken breast', 'ground beef', 'cheddar cheese',
  'orange juice', 'coffee', 'rice', 'peanut butter', 'greek yogurt', 'dinner rolls',
];
const SHOW = { weight: 'lb', volume: 'gal', count: 'ct' };

const money = (n) => (n == null ? '-' : `$${n.toFixed(2)}`);
const perShow = (perBase, dim, q) => {
  const unit = dim === 'count' && /\beggs?\b/.test(q) ? 'dozen' : SHOW[dim];
  return `${money(perBase * DISPLAY_UNITS[unit].factor)}/${unit}`;
};

async function main() {
  if (!process.env.BASKET_DATA_DIR) throw new Error('set BASKET_DATA_DIR to a scratch folder');
  const report = [];
  for (const zip of ZIPS) {
    if (GEO[zip]) await cached(`geo:zip:${zip}`, 365 * DAY, async () => GEO[zip]);
    const dir = await directory(zip, { maxMiles: MILES });
    const stores = dir.chains.filter((c) => [STATUS.shelf, STATUS.online, STATUS.national].includes(c.status)).map((c) => c.id);
    console.log(`\n== ${zip} ${dir.city || ''}: ${stores.length} priced stores (${stores.join(', ')}); unresolved: ${dir.unresolved.join(', ') || 'none'}`);
    const ctx = contextFrom(new URL(`http://x/api/search?zip=${zip}&miles=${MILES}&stores=${stores.join(',')}`));
    for (const q of QUERIES) {
      const results = {};
      const status = {};
      for (const id of stores) {
        const r = await searchStore(id, q, ctx);
        results[id] = r.items || [];
        status[id] = r.status + (r.error ? `: ${r.error}` : r.message && r.status !== 'ok' ? `: ${r.message}` : '');
      }
      const best = bestPerStore(q, results, { prefs: { cardPrices: true } });
      const rows = standings(best.stores);
      const top = rows[0] && best.stores[rows[0].storeId];
      const second = rows[1] && best.stores[rows[1].storeId];
      const claim = top && second ? savingsClaim(top, second) : null;
      const flagged = Object.values(results).flat().filter((p) => p.implausible || p.sizeConflict)
        .map((p) => `${p.storeId} "${p.name}" ${p.size || ''} ${money(p.price)} ${p.implausible ? `implausible-${p.implausible.direction}` : 'sizeConflict'}`);
      const excluded = excludedCheaper(q, results, best.stores);
      const entry = {
        zip, q, dim: best.dim,
        stores: rows.map((r) => {
          const b = best.stores[r.storeId];
          return {
            storeId: r.storeId, verdict: r.verdict, basis: r.basis, est: r.est, perBase: r.perBase, shown: perShow(r.perBase, best.dim, q),
            name: b.item.name, size: b.item.size, sizeText: b.item.sizeText, sizeSource: b.item.sizeSource, price: b.item.price,
            memberPrice: b.item.memberPrice, soldBy: b.item.soldBy, url: b.item.url, score: +b.item.score.toFixed(3),
          };
        }),
        claim: claim?.text || null, flagged, status,
        excluded: Object.entries(excluded).map(([id, e]) => `${id} "${e.item.name}" ${money(e.item.price)} (${e.reason})`),
      };
      report.push(entry);
      const w = entry.stores[0];
      console.log(`${zip} ${q.padEnd(15)} ${w ? `${w.shown.padEnd(12)} ${w.storeId} [${w.basis}${w.est ? ' est' : ''}] "${w.name}" ${w.size || w.sizeText || ''} ${money(w.price)}` : 'NO ANSWER'}${claim ? ` | ${claim.text}` : ''}`);
      fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
    }
  }
  console.log(`\nwrote ${report.length} answers to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
