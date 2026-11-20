// Two re-scored answer files (rescore-cache.mjs output), compared answer by answer.
//
//   node ops/coverage/rescore-diff.mjs base.jsonl new.jsonl [--q "pie crust"] [--list 40] [--all]
//
// Prints, per query, how many answers change their winning store, only the winning row, their
// dimension, or only a runner-up, claim or count of stores priced; then each changed answer, winner
// before and after (--all lists the runner-up changes too).
import fs from 'node:fs';

const [baseFile, newFile, ...rest] = process.argv.slice(2);
if (!newFile) { console.error('usage: rescore-diff.mjs <base.jsonl> <new.jsonl> [--q "<query>"] [--list N] [--all]'); process.exit(1); }
const opt = (n, d) => { const i = rest.indexOf(n); return i < 0 ? d : rest[i + 1]; };
const onlyQ = opt('--q', null);
const LIST = +opt('--list', 40);
const ALL = rest.includes('--all');
const read = (f) => new Map(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((a) => [`${a.zip}\t${a.q}`, a]));
const A = read(baseFile), B = read(newFile);
const w = (a) => (a?.stores?.[0] ? `${a.stores[0].storeId} ${a.stores[0].shown} "${a.stores[0].name}"${a.stores[0].size ? ` [${a.stores[0].size}]` : ''}` : '(none)');
const top = (a) => (a?.stores || []).slice(0, 3).map((s) => `${s.storeId}:${s.shown}`).join(' | ');
const byQ = new Map();
const changed = [];
for (const [k, a] of A) {
  const b = B.get(k);
  if (!b || (onlyQ && a.q !== onlyQ)) continue;
  const winnerStore = a.stores?.[0]?.storeId !== b.stores?.[0]?.storeId;
  const winner = winnerStore || a.stores?.[0]?.name !== b.stores?.[0]?.name || a.stores?.[0]?.shown !== b.stores?.[0]?.shown;
  const dim = a.dim !== b.dim;
  const other = !winner && (top(a) !== top(b) || a.claim !== b.claim || a.pricedStores !== b.pricedStores);
  const c = byQ.get(a.q) || { winnerStore: 0, winnerRow: 0, dim: 0, other: 0 };
  if (winnerStore) c.winnerStore += 1; else if (winner) c.winnerRow += 1;
  if (dim) c.dim += 1;
  if (other) c.other += 1;
  byQ.set(a.q, c);
  if (winner || dim || (ALL && other)) changed.push({ k, a, b, dim });
}
const tot = { winnerStore: 0, winnerRow: 0, dim: 0, other: 0 };
for (const [q, c] of [...byQ].sort((x, y) => (y[1].winnerStore + y[1].winnerRow) - (x[1].winnerStore + x[1].winnerRow))) {
  for (const key of Object.keys(tot)) tot[key] += c[key];
  if (c.winnerStore || c.winnerRow || c.dim || c.other) console.log(`${q.padEnd(28)} winner store ${c.winnerStore}, winner row ${c.winnerRow}, dim ${c.dim}, other ${c.other}`);
}
console.log(`TOTAL over ${A.size} answers: winner store ${tot.winnerStore}, winner row only ${tot.winnerRow}, dimension ${tot.dim}, runner-up/claim/count ${tot.other}\n`);
for (const { k, a, b, dim } of changed.slice(0, LIST)) {
  console.log(`${k.replace('\t', '  ')}${dim ? `  DIM ${a.dim}->${b.dim}` : ''}`);
  console.log(`   was: ${w(a)}   | ${a.claim || ''}`);
  console.log(`   now: ${w(b)}   | ${b.claim || ''}`);
}
if (changed.length > LIST) console.log(`... ${changed.length - LIST} more`);
