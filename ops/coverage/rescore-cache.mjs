// Re-score every cached search with today's code, offline: no request leaves this Mac.
//
// The QA cache (BASKET_DATA_DIR/basket.db) keeps each store's answer as the adapter returned it,
// normalised by the code of the day it was fetched. A rule added since (a size conflict, a
// compound) does not reach those rows until they expire. This rebuilds each row's feed fields,
// runs makeProduct again, then the production comparison (bestPerStore -> standings ->
// savingsClaim, as scripts/price-audit.js does) for every ZIP and query in the cache, and writes
// one line per answer: the winner, the next two stores, the claim, and whether the winner differs
// from the one the cached rows give. Instacart's unit line and pack line are not cached, so what
// they decided is carried over from the cached row (see renormalize in rescore-lib.mjs).
//
//   sqlite3 <dir>/basket.db "select key || char(9) || value from cache where key like 'search:v20:%'" > cache.tsv
//   node ops/coverage/rescore-cache.mjs --in cache.tsv --out answers.jsonl
//   node ops/coverage/rescore-cache.mjs --in cache.tsv --show 97206 "turkey breast"   # one answer in full
import fs from 'node:fs';
import { readGroups, renormalizeAll, answer, perShow, money } from './rescore-lib.mjs';
import { relevance, RELEVANT } from '../../shared/match.js';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i < 0 ? dflt : argv[i + 1]; };
const IN = opt('--in', null);
const OUT = opt('--out', 'rescore.jsonl');
const showAt = argv.indexOf('--show');
const SHOW_ZIP = showAt < 0 ? null : argv[showAt + 1];
const SHOW_Q = showAt < 0 ? null : argv[showAt + 2];

const row = (b, r, dim, q) => ({
  storeId: r.storeId, shown: perShow(r.perBase, dim, q), perBase: r.perBase, basis: r.basis, est: r.est,
  name: b.item.name, size: b.item.size, sizeText: b.item.sizeText, sizeSource: b.item.sizeSource, price: b.item.price,
  memberPrice: b.item.memberPrice, soldBy: b.item.soldBy, category: b.item.category ?? null,
  score: +(b.item.score ?? 0).toFixed(3), url: b.item.url, ...(b.item.carried ? { carried: b.item.carried } : {}),
});

const { groups, entries } = await readGroups(IN || process.stdin, SHOW_ZIP ? (z, q) => z === SHOW_ZIP && q === SHOW_Q : undefined);

if (SHOW_ZIP) {
  // Every store's best row, then every relevant candidate with its unit price, flags and score.
  const byStore = groups.get(`${SHOW_ZIP}\t${SHOW_Q}`);
  if (!byStore) { console.log('not in the cache'); process.exit(1); }
  const fresh = renormalizeAll(byStore);
  const a = answer(SHOW_Q, fresh);
  const dim = a.best.dim;
  console.log(`== ${SHOW_ZIP} "${SHOW_Q}" compared by ${dim}; claim: ${a.claim?.text || '-'}`);
  for (const r of a.rows) {
    const b = a.best.stores[r.storeId];
    console.log(`  ${r.verdict.padEnd(7)} ${perShow(r.perBase, dim, SHOW_Q).padEnd(11)} ${r.storeId.padEnd(16)} [${r.basis}${r.est ? ' est' : ''}] "${b.item.name}" ${b.item.size || ''} ${money(b.item.price)} src=${b.item.sizeSource} cat=${b.item.category} score=${(b.item.score ?? 0).toFixed(2)}${b.item.carried ? ` (${b.item.carried})` : ''}`);
  }
  for (const [id, e] of Object.entries(a.excluded)) console.log(`  EXCLUDED-CHEAPER ${id} "${e.item.name}" ${money(e.item.price)} (${e.reason})`);
  console.log('  -- candidates (relevance >= RELEVANT), cheapest first per store --');
  for (const [id, items] of Object.entries(fresh)) {
    const c = items.map((p) => ({ p, s: relevance(SHOW_Q, p) })).filter((x) => x.s >= RELEVANT)
      .map((x) => ({ ...x, u: x.p.unit?.[dim]?.perBase })).sort((x, y) => (x.u ?? Infinity) - (y.u ?? Infinity)).slice(0, 6);
    for (const { p, s, u } of c) {
      const flags = [p.sizeConflict ? `CONFLICT(${p.sizeConflict.text} vs ${p.sizeConflict.name})` : '', p.implausible ? `IMPLAUSIBLE-${p.implausible.direction}` : '', p.carried || ''].filter(Boolean).join(' ');
      console.log(`  ${id.padEnd(16)} ${perShow(u, dim, SHOW_Q).padEnd(11)} "${p.name}" size=${p.size} text=${p.sizeText} ${money(p.price)} soldBy=${p.soldBy} src=${p.sizeSource} cat=${p.category} score=${s.toFixed(2)} ${flags}\n${' '.repeat(19)}${p.url}`);
    }
  }
  process.exit(0);
}

const out = fs.createWriteStream(OUT);
let changed = 0;
for (const [k, cachedByStore] of groups) {
  const [zip, q] = k.split('\t');
  const fresh = renormalizeAll(cachedByStore);
  const now = answer(q, fresh);
  const then = answer(q, cachedByStore);
  const dim = now.best.dim;
  const stores = now.rows.map((r) => row(now.best.stores[r.storeId], r, dim, q));
  const per = now.rows.map((r) => r.perBase).filter((x) => x > 0).sort((a, b) => a - b);
  const median = per.length ? per[Math.floor(per.length / 2)] : null;
  const thenTop = then.rows[0] && then.best.stores[then.rows[0].storeId];
  const nowTop = now.rows[0] && now.best.stores[now.rows[0].storeId];
  const moved = (thenTop?.item.key || null) !== (nowTop?.item.key || null);
  if (moved) changed += 1;
  out.write(JSON.stringify({
    zip, q, dim, pricedStores: now.rows.length, claim: now.claim?.text || null,
    topVsMedian: stores[0] && median ? +(stores[0].perBase / median).toFixed(3) : null,
    topVsSecond: stores[0] && stores[1] ? +(stores[0].perBase / stores[1].perBase).toFixed(3) : null,
    stores,
    changedSinceCached: moved ? { was: thenTop ? `${thenTop.item.storeId} "${thenTop.item.name}" ${thenTop.item.size || ''} ${money(thenTop.item.price)}` : null } : null,
    excludedCheaper: Object.entries(now.excluded).map(([id, e]) => `${id} "${e.item.name}" ${money(e.item.price)} (${e.reason})`),
  }) + '\n');
}
out.end();
console.log(`${entries} cached searches, ${groups.size} answers, ${changed} with a different winner than the cached rows give; wrote ${OUT}`);
