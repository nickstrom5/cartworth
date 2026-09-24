// Builds the nearby-store directory for a spread of real ZIPs — dense city, suburb, small town,
// rural, and the places that break naive assumptions (Alaska, Hawaii, Puerto Rico) — and prints
// what each one found. This is the nationwide smoke test: if a ZIP comes back with nothing
// priceable, the app is useless there and we want to know before a user does.
//
//   node scripts/check-directory.js
//   node scripts/check-directory.js 60010 99801
//   node scripts/check-directory.js --miles 10 53211
//
// Every build is `fresh`, so this re-asks Flipp and re-runs every probe the store cache cannot
// answer. Politeness (the owner's rule): one request at a time to each retailer host, at least
// 700 ms apart. The server's own adapters allow more; this script does not.
import { directory, defaultStoreIds } from '../src/directory.js';
import { configureHost } from '../src/http.js';
import { CHAINS } from '../shared/catalog.js';

// Every retailer storefront the catalog prices from, read from the catalog so a chain added on its
// own domain (order.shopthepig.com, 23 Sep 2026) is held to the same limit as the rest.
for (const host of new Set(['www.instacart.com', 'www.wholefoodsmarket.com', 'www.traderjoes.com', 'backflipp.wishabi.com', 'api.zippopotam.us', ...CHAINS.filter((c) => c.price?.base).map((c) => new URL(c.price.base).host)])) {
  configureHost(host, { max: 1, gap: 700 });
}

const PLACES = [
  ['60618', 'Chicago IL', 'dense city'],
  ['60010', 'Barrington IL', 'affluent suburb'],
  ['10024', 'Manhattan NY', 'dense city, few big-box'],
  ['90019', 'Los Angeles CA', 'dense city'],
  ['77008', 'Houston TX', 'sprawl'],
  ['30307', 'Atlanta GA', 'south metro'],
  ['98103', 'Seattle WA', 'northwest metro'],
  ['80211', 'Denver CO', 'mountain metro'],
  ['33176', 'Miami FL', 'south FL'],
  ['02139', 'Cambridge MA', 'northeast metro'],
  ['19119', 'Philadelphia PA', 'northeast metro'],
  ['84105', 'Salt Lake City UT', 'mountain west'],
  ['68144', 'Omaha NE', 'plains metro'],
  ['37212', 'Nashville TN', 'south metro'],
  ['59715', 'Bozeman MT', 'small mountain town'],
  ['57701', 'Rapid City SD', 'small plains city'],
  ['04101', 'Portland ME', 'small northeast city'],
  ['88220', 'Carlsbad NM', 'rural southwest'],
  ['67601', 'Hays KS', 'rural plains'],
  ['99801', 'Juneau AK', 'Alaska'],
  ['96814', 'Honolulu HI', 'Hawaii'],
  ['00926', 'San Juan PR', 'Puerto Rico'],
];

const argv = process.argv.slice(2);
const milesArg = argv.find((a, i) => argv[i - 1] === '--miles');
const MILES = milesArg ? Number(milesArg) : 25;
const args = argv.filter((a, i) => a !== '--miles' && argv[i - 1] !== '--miles');
const places = args.length ? args.map((z) => [z, z, 'requested']) : PLACES;

const S = { shelf: 'shelf', online: 'online', national: 'natl', adsOnly: 'ads' };

async function main() {
  const problems = [];
  for (const [zip, label, kind] of places) {
    process.stdout.write(`\n${label} (${zip}) — ${kind}\n`);
    const t0 = Date.now();
    let dir;
    try {
      dir = await directory(zip, { maxMiles: MILES, fresh: true });
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      problems.push([label, `directory failed: ${err.message}`]);
      continue;
    }
    const priced = dir.chains.filter((c) => c.status === 'shelf' || c.status === 'online' || c.status === 'national');
    const local = dir.chains.filter((c) => c.status === 'shelf' || c.status === 'online');
    const shelf = dir.chains.filter((c) => c.status === 'shelf');
    const ads = dir.chains.filter((c) => c.status === 'adsOnly');
    const k = dir.counts;

    // `counts` is what the site's "N chains within X miles" line is built from; print it as-is so
    // this script and the screen can never disagree. A national listing is never "within X miles".
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s · ${k.nearby} within ${dir.maxMiles} mi (${shelf.length} shelf) · ${k.national} chain-wide · ${k.adsOnly} ads-only · ${dir.otherMerchants.length} unknown merchants${k.unresolved ? ` · ${k.unresolved} UNRESOLVED: ${dir.unresolved.join(', ')}` : ''}`);
    for (const c of priced) {
      console.log(`    ${S[c.status].padEnd(6)} ${c.short.padEnd(22)} ${c.distance != null ? `${c.distance}mi`.padStart(7) : '      -'}  ${c.address || ''}`);
    }
    if (ads.length) console.log(`    ads only: ${ads.map((c) => (c.distance != null ? `${c.short} (${c.distance} mi)` : c.short)).join(', ')}`);
    if (dir.adsError) console.log(`    weekly ads unavailable: ${dir.adsError}`);
    if (dir.otherMerchants.length) console.log(`    not in catalog: ${dir.otherMerchants.slice(0, 14).join(', ')}${dir.otherMerchants.length > 14 ? ` (+${dir.otherMerchants.length - 14})` : ''}`);

    if (k.unresolved) problems.push([label, `${k.unresolved} probe(s) unanswered (${dir.unresolved.join(', ')}) — counts may be low; the server rebuilds this ZIP within minutes`]);
    if (!priced.length) problems.push([label, 'NO priceable store — app would be empty here']);
    else if (local.length === 0) problems.push([label, `${priced.length} priced, but none tied to a local store (chain-wide listings only)`]);
    else if (local.length < 3) problems.push([label, `only ${local.length} local store(s) — comparison is thin`]);
    if (!shelf.length && local.length) problems.push([label, 'no true shelf prices, only online listings']);
    console.log(`    default selection: ${defaultStoreIds(dir).join(', ') || '(none)'}`);
  }

  console.log('\n──────────────────────────────────────────');
  if (!problems.length) console.log('No coverage problems.');
  else {
    console.log(`${problems.length} coverage problem(s):`);
    for (const [where, what] of problems) console.log(`  ${where}: ${what}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
