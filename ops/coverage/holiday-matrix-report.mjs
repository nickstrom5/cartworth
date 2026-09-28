// Summarises a holiday-matrix run (ops/coverage/holiday-matrix.mjs): every state's winners, with the
// ones worth a person's look marked. It does not judge prices; it points at them.
//
//   node ops/coverage/holiday-matrix-report.mjs <out dir> [--suspects]
//
//   !  no answer for an item on the holiday's list
//   ?  the winner is under a third of the other stores' median for the item (too cheap to trust
//      without a look), or its name shares no word with the search
import fs from 'node:fs';
import path from 'node:path';
import { queryTokens, tokens } from '../../shared/match.js';

const dir = process.argv[2];
const suspectsOnly = process.argv.includes('--suspects');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const [state, holiday] = path.basename(f, '.json').split('-');
  const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const lines = [];
  for (const r of rows) {
    const best = r.stores?.find((s) => s.verdict === 'best') || r.stores?.[0];
    if (!best) { lines.push(`  ! ${r.q.padEnd(20)} NO ANSWER`); continue; }
    const others = r.stores.filter((s) => s !== best && s.perBase > 0).map((s) => s.perBase);
    const med = median(others);
    const q = new Set(queryTokens(r.q).map((w) => w.replace(/s$/, '')));
    const shares = tokens(best.name).some((w) => q.has(w.replace(/s$/, '')));
    const cheap = med && best.perBase < med / 3;
    const mark = cheap || !shares ? '?' : ' ';
    if (suspectsOnly && mark === ' ') continue;
    lines.push(`  ${mark} ${r.q.padEnd(20)} ${String(best.shown).padEnd(12)} ${best.storeId} [${best.basis}] "${best.name}" ${best.size ?? ''} $${best.price}${best.category ? ` {${best.category}}` : ''}${cheap ? ` (median of others ${(med / best.perBase).toFixed(1)}x)` : ''}`);
  }
  if (lines.length) console.log(`${state} ${holiday}\n${lines.join('\n')}`);
}
