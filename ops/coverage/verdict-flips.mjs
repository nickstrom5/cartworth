// Every distinct cached item scored by two code trees' matcher: lists each verdict that changes.
//
// A matcher change that looks local reaches every search that shares a word with it. Scoring every
// item the QA cache holds (about 37,000 distinct names) against the cache's own 27 queries, and any
// others named, shows each admission and refusal the change makes. Offline: no store is asked.
//
//   git archive origin/main shared src ops/coverage/rescore-lib.mjs package.json | tar -x -C <base>
//   node --max-old-space-size=8192 ops/coverage/verdict-flips.mjs <newRoot> <base> cache.tsv out.tsv [queries.json]
//
// queries.json is a JSON array of searches; without it, each item is scored for the searches it was
// cached under plus a Thanksgiving list. OWN_ONLY=1 scores each item for its own searches only.
// Output, one line per flip: query, ADMIT|REFUSE, old score, new score, name, category, brand, soldBy,
// rows, stores, own|cross (whether the item was cached under that query).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [newRoot, baseRoot, tsv, out, extraFile] = process.argv.slice(2);
if (!out) { console.error('usage: verdict-flips.mjs <newRoot> <baseRoot> <cache.tsv> <out.tsv> [queries.json]'); process.exit(1); }
const N = await import(path.resolve(newRoot, 'shared/match.js'));
const B = await import(path.resolve(baseRoot, 'shared/match.js'));
const CUT = N.RELEVANT;
const QUERIES = extraFile ? JSON.parse(fs.readFileSync(extraFile, 'utf8')) : ['milk', 'turkey', 'turkey breast', 'stuffing mix', 'gravy', 'pie crust', 'dinner rolls', 'pecans', 'butter', 'heavy cream', 'celery', 'brown sugar', 'pumpkin pie', 'onions', 'french fried onions', 'whole berry cranberry sauce', 'cranberry sauce'];
const ownOnly = process.env.OWN_ONLY === '1';

const items = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(tsv), crlfDelay: Infinity });
for await (const line of rl) {
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const q = line.slice(0, tab).split(':').slice(5).join(':');
  let j;
  try { j = JSON.parse(line.slice(tab + 1)); } catch { continue; }
  for (const it of j.items || []) {
    const k = `${it.name}|${it.category || ''}|${it.brand || ''}|${it.soldBy || ''}`;
    let e = items.get(k);
    if (!e) { e = { item: it, n: 0, ownQ: new Set(), stores: new Set() }; items.set(k, e); }
    e.n += 1; e.ownQ.add(q); e.stores.add(it.storeId);
  }
}
console.error(`distinct items: ${items.size}`);
const rows = [];
let changed = 0;
for (const e of items.values()) {
  const qs = ownOnly ? [...e.ownQ] : [...new Set([...e.ownQ, ...QUERIES])];
  for (const q of qs) {
    const a = B.relevance(q, e.item), b = N.relevance(q, e.item);
    if (a !== b) changed += 1;
    if ((a >= CUT) !== (b >= CUT)) {
      rows.push([q, b >= CUT ? 'ADMIT' : 'REFUSE', a.toFixed(3), b.toFixed(3), e.item.name, e.item.category || '', e.item.brand || '', e.item.soldBy || '', e.n, [...e.stores].slice(0, 4).join(','), e.ownQ.has(q) ? 'own' : 'cross'].join('\t'));
    }
  }
}
rows.sort();
fs.writeFileSync(out, rows.join('\n') + '\n');
console.error(`score changes: ${changed}; verdict flips: ${rows.length}`);
