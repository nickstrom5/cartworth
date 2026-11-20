// Every distinct cached row whose product (size, dimension, unit prices, size conflict) differs between
// two code trees, after both rebuild it from the cached feed fields (renormalize in rescore-lib.mjs).
//
// A size rule reaches every row with the same shape, in every search. This lists each one it changes,
// so a rule can be judged on all of them before it is kept. Offline: no store is asked.
//
//   git archive origin/main shared src ops/coverage/rescore-lib.mjs package.json | tar -x -C <base>
//   node --max-old-space-size=8192 ops/coverage/product-diff.mjs <newRoot> <base> cache.tsv out.tsv [--q "pie crust"]
//
// Output columns: store, query (the first it was seen under), name, category, sizeText, price, url, and
// the two signatures "size|dim|units|conflict", units written "weight:<per oz>" with "e" for an
// estimate and "s" for a figure read from the slug.
import fs from 'node:fs';
import path from 'node:path';

const [newRoot, baseRoot, tsv, out, ...rest] = process.argv.slice(2);
if (!out) { console.error('usage: product-diff.mjs <newRoot> <baseRoot> <cache.tsv> <out.tsv> [--q "<query>"]'); process.exit(1); }
const onlyQ = rest.includes('--q') ? rest[rest.indexOf('--q') + 1] : null;
const N = await import(path.resolve(newRoot, 'ops/coverage/rescore-lib.mjs'));
const B = await import(path.resolve(baseRoot, 'ops/coverage/rescore-lib.mjs'));
const { groups } = await N.readGroups(tsv, onlyQ ? (z, q) => q === onlyQ : undefined);
const fmtUnits = (u) => Object.entries(u || {}).map(([d, x]) => `${d}:${x.perBase.toPrecision(4)}${x.est ? 'e' : ''}${x.slug ? 's' : ''}`).sort().join(',');
const sig = (p) => `${p.size}|${p.dim}|${fmtUnits(p.unit)}|${p.sizeConflict ? `conflict(${p.sizeConflict.text} vs ${p.sizeConflict.name})` : ''}`;
const seen = new Set();
const rows = [];
for (const [k, byStore] of groups) {
  const q = k.split('\t')[1];
  for (const [storeId, items] of Object.entries(byStore)) {
    for (const it of items) {
      const key = `${storeId}|${it.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = sig(B.renormalize(it)), b = sig(N.renormalize(it));
      if (a !== b) rows.push([storeId, q, it.name, it.category || '', it.sizeText || '', it.price, it.url || '', a, b].join('\t'));
    }
  }
}
fs.writeFileSync(out, rows.join('\n') + '\n');
console.error(`distinct rows: ${seen.size}; changed: ${rows.length}; written to ${out}`);
