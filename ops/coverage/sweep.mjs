// Nationwide coverage sweep (see ops/coverage/README.md). Usage:
//   SWEEP_DIR=/tmp/cartworth-sweep BASKET_DATA_DIR=/tmp/cartworth-sweep/data node ops/coverage/sweep.mjs [--plan]
//   FOCUS=CA:rural,TX:town ... limits the run to those state:kind pairs.
// Nationwide coverage sweep: the real directory() for 3 ZIPs per state + DC, politely.
import fs from 'node:fs';
import { directory, defaultStoreIds } from '../../src/directory.js';
import { configureHost, stats } from '../../src/http.js';
import { CHAINS } from '../../shared/catalog.js';
import { STATES } from '../../scripts/sampler/states.js';

for (const host of new Set(['www.instacart.com', 'www.wholefoodsmarket.com', 'www.traderjoes.com', 'backflipp.wishabi.com', 'api.zippopotam.us', ...CHAINS.filter((c) => c.price?.base).map((c) => new URL(c.price.base).host)])) {
  configureHost(host, { max: 1, gap: 700 });
}
// Stricter than the owner's rule for Instacart: a sweep asks ~20 chains per ZIP back to back.
configureHost('www.instacart.com', { max: 1, gap: 4000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coolingUntil = () => Math.max(0, ...Object.values(stats.limited).map((l) => l.until || 0));

const DIR = process.env.SWEEP_DIR || '/tmp/cartworth-sweep'; // holds 2024_Gaz_zcta_national.txt (Census ZCTA gazetteer) and the output
const OUT = `${DIR}/sweep.jsonl`;

// USPS 3-digit prefix -> state.
const R = [['005','005','NY'],['006','009','PR'],['010','027','MA'],['028','029','RI'],['030','038','NH'],['039','049','ME'],['050','059','VT'],['060','069','CT'],['070','089','NJ'],['100','149','NY'],['150','196','PA'],['197','199','DE'],['200','205','DC'],['206','219','MD'],['220','246','VA'],['247','268','WV'],['270','289','NC'],['290','299','SC'],['300','319','GA'],['320','349','FL'],['350','369','AL'],['370','385','TN'],['386','397','MS'],['398','399','GA'],['400','427','KY'],['430','459','OH'],['460','479','IN'],['480','499','MI'],['500','528','IA'],['530','549','WI'],['550','567','MN'],['569','569','DC'],['570','577','SD'],['580','588','ND'],['590','599','MT'],['600','629','IL'],['630','658','MO'],['660','679','KS'],['680','693','NE'],['700','715','LA'],['716','729','AR'],['730','749','OK'],['750','799','TX'],['800','816','CO'],['820','831','WY'],['832','838','ID'],['840','847','UT'],['850','865','AZ'],['870','884','NM'],['885','885','TX'],['889','898','NV'],['900','961','CA'],['967','968','HI'],['970','979','OR'],['980','994','WA'],['995','999','AK']];
const stateOf = (z) => { const p = z.slice(0, 3); const r = R.find(([a, b]) => p >= a && p <= b); return r ? r[2] : null; };

const rows = fs.readFileSync(`${DIR}/2024_Gaz_zcta_national.txt`, 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t').map((x) => x.trim()));
const byState = {};
for (const [zip, , , sqmi] of rows) { const st = stateOf(zip); if (!st || st === 'PR') continue; (byState[st] ||= []).push({ zip, sqmi: +sqmi }); }

const plan = [];
const metro = Object.fromEntries(STATES.map((s) => [s.code, s.zips[0]]));
for (const st of Object.keys(byState).sort()) {
  const list = byState[st].sort((a, b) => a.sqmi - b.sqmi);
  const pick = (q) => list[Math.min(list.length - 1, Math.floor(list.length * q))].zip;
  const m = metro[st]?.zip;
  const seen = new Set();
  for (const [zip, kind] of [[m, `metro (${metro[st]?.city})`], [pick(0.5), 'town'], [pick(0.92), 'rural']]) {
    if (!zip || seen.has(zip)) continue;
    seen.add(zip);
    plan.push({ st, zip, kind });
  }
}
const FOCUS = process.env.FOCUS ? process.env.FOCUS.split(',') : null;
if (FOCUS) { const keep = plan.filter((p) => FOCUS.includes(`${p.st}:${p.kind.split(' ')[0]}`)); plan.length = 0; plan.push(...keep); }
if (process.argv.includes('--plan')) { console.log(plan.length, JSON.stringify(plan.slice(0, 12))); process.exit(0); }

const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.pass}:${r.zip}`; }) : []);
function summarize(p, dir, pass, ms) {
  const c = dir.chains;
  return {
    pass, st: p.st, zip: p.zip, kind: p.kind, city: dir.city, ms,
    counts: dir.counts, unresolved: dir.unresolved,
    shelf: c.filter((x) => x.status === 'shelf').map((x) => `${x.short} ${x.distance}mi`),
    online: c.filter((x) => x.status === 'online').map((x) => `${x.short} ${x.distance}mi`),
    national: c.filter((x) => x.status === 'national').map((x) => x.short),
    ads: c.filter((x) => x.status === 'adsOnly').map((x) => x.short),
    other: dir.otherMerchants.length, adsError: dir.adsError || null,
    defaults: defaultStoreIds(dir),
  };
}
async function run(pass, list) {
  for (const p of list) {
    if (done.has(`${pass}:${p.zip}`)) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
    const hitsBefore = Object.values(stats.limited).reduce((n, l) => n + l.count, 0);
    const wait = coolingUntil() - Date.now();
    if (wait > 0) { console.log(`  429 cooldown: waiting ${Math.ceil(wait / 1000)}s`); await sleep(wait + 5000); }
    const t = Date.now();
    let rec;
    try {
      const dir = await directory(p.zip, { maxMiles: 25, fresh: true });
      rec = summarize(p, dir, pass, Date.now() - t);
    } catch (e) {
      rec = { pass, st: p.st, zip: p.zip, kind: p.kind, error: e.message, ms: Date.now() - t };
    }
    const hits = Object.values(stats.limited).reduce((n, l) => n + l.count, 0);
    if (hits > hitsBefore) { console.log(`  ${p.zip}: rate-limited during the build (${JSON.stringify(stats.limited)}), redoing`); continue; }
    fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
    console.log(pass, p.st, p.zip, p.kind, rec.error || `${rec.counts.nearby} near (${rec.shelf.length} shelf) · ${rec.counts.national} natl · ${rec.counts.adsOnly} ads · unresolved ${rec.counts.unresolved}`);
    break;
    }
    await sleep(5000);
  }
}
await run(1, plan);
// Second pass for incomplete builds: answered probes now come from cache.
const first = fs.readFileSync(OUT, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.pass === 1);
const again = plan.filter((p) => first.find((r) => r.zip === p.zip && (r.error || r.counts?.unresolved)));
console.log(`second pass: ${again.length}`);
await run(2, again);
console.log('DONE');
