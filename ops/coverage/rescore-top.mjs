// Reads a rescore answers file (ops/coverage/rescore-cache.mjs --out) and prints, for one query or
// several, every ZIP's ranked stores on a line each: what a reviewer needs to spot a wrong winner.
//
//   node ops/coverage/rescore-top.mjs --in answers.jsonl --q "turkey breast"            # every ZIP, top 4 stores
//   node ops/coverage/rescore-top.mjs --in answers.jsonl --q "celery,onions" --n 6      # two queries, top 6
//   node ops/coverage/rescore-top.mjs --in answers.jsonl --q "butter" --zip 21218 --n 99
//   node ops/coverage/rescore-top.mjs --in answers.jsonl --winners                      # one line per answer: the winner only
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i < 0 ? dflt : argv[i + 1]; };
const IN = opt('--in', 'rescore.jsonl');
const QS = opt('--q', '') ? new Set(opt('--q', '').split(',').map((s) => s.trim())) : null;
const ZIPS = opt('--zip', '') ? new Set(opt('--zip', '').split(',')) : null;
const N = +opt('--n', '4');
const WINNERS = argv.includes('--winners');

const answers = fs.readFileSync(IN, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((a) => (!QS || QS.has(a.q)) && (!ZIPS || ZIPS.has(a.zip)))
  .sort((a, b) => a.q.localeCompare(b.q) || a.zip.localeCompare(b.zip));
const line = (s) => `${s.shown.padEnd(11)} ${s.storeId.padEnd(15)} "${s.name}" size=${s.size} text=${s.sizeText} $${s.price}${s.memberPrice != null ? ` member $${s.memberPrice}` : ''} ${s.soldBy} src=${s.sizeSource} [${s.basis}${s.est ? ' est' : ''}] cat=${s.category} score=${s.score}${s.carried ? ` (${s.carried})` : ''}`;
for (const a of answers) {
  if (WINNERS) {
    console.log(`${a.zip} ${a.q.padEnd(27)} ${a.stores[0] ? line(a.stores[0]) : 'NO ANSWER'} | vsMedian=${a.topVsMedian} vsSecond=${a.topVsSecond} | ${a.claim || 'no claim'}`);
    continue;
  }
  console.log(`== ${a.zip} "${a.q}" by ${a.dim}, ${a.pricedStores} stores priced; best/median=${a.topVsMedian} best/second=${a.topVsSecond}; claim: ${a.claim || 'none'}${a.changedSinceCached ? `; winner differs from the cached rows (was ${a.changedSinceCached.was})` : ''}`);
  for (const s of a.stores.slice(0, N)) console.log(`   ${line(s)}`);
  for (const e of a.excludedCheaper || []) console.log(`   set aside, cheaper at the register: ${e}`);
}
console.log(`${answers.length} answers`);
