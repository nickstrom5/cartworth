// State x holiday audit: every state's largest-metro ZIP runs one holiday's full shopping list
// through the production path (scripts/price-audit.js: directory -> searchStore -> bestPerStore ->
// savingsClaim). Holidays rotate through the states, so every holiday is priced in two or three
// states and every state prices a full list. Running every holiday in every state would be about
// 10,000 store searches, far past the owner's request limit.
//
// One output file per state; a state whose file exists is skipped, so the run can be stopped and
// resumed. Politeness is src/http.js's: one request in flight per host, 700 ms apart, stop on 429.
//
//   BASKET_DATA_DIR=<scratch> NODE_USE_ENV_PROXY=1 node ops/coverage/holiday-matrix.mjs --out <dir> [--only TX,CA]
//   node ops/coverage/holiday-matrix.mjs --plan          # print the assignment and exit
//   ... --holiday thanksgiving --only TX,CA,IL           # one holiday's list in the chosen states
//
// The run stops at the first state where any retailer refused us (429), so a refusal is never
// carried into the next state (ops/coverage/refusals.mjs).
import { refusedStores } from './refusals.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OCCASIONS } from '../../shared/seasonal.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i < 0 ? dflt : argv[i + 1]; };
const OUT = path.resolve(opt('--out', path.join(HERE, 'holiday-matrix')));
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const HOLIDAY = opt('--holiday', null);

// The sweep's metro ZIP for every state and DC.
const metros = fs.readFileSync(path.join(HERE, 'flipp-2026-09-24.jsonl'), 'utf8').trim().split('\n')
  .map((l) => JSON.parse(l)).filter((r) => String(r.kind).startsWith('metro'))
  .sort((a, b) => a.st.localeCompare(b.st));

export const PLAN = metros.map((m, i) => {
  const o = HOLIDAY ? OCCASIONS.find((x) => x.id === HOLIDAY) : OCCASIONS[i % OCCASIONS.length];
  if (!o) throw new Error(`no holiday "${HOLIDAY}": ${OCCASIONS.map((x) => x.id).join(', ')}`);
  return { state: m.st, zip: m.zip, place: String(m.kind).replace(/^metro \(|\)$/g, ''), holiday: o.id, items: o.list };
});

if (argv.includes('--plan')) {
  for (const p of PLAN.filter((x) => !ONLY || ONLY.has(x.state))) console.log(`${p.state} ${p.zip} ${p.place.padEnd(16)} ${p.holiday.padEnd(13)} ${p.items.join(', ')}`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
for (const p of PLAN) {
  if (ONLY && !ONLY.has(p.state)) continue;
  const file = path.join(OUT, `${p.state}-${p.holiday}.json`);
  if (fs.existsSync(file)) continue;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts/price-audit.js'), '--out', file, '--zips', p.zip, ...p.items], { encoding: 'utf8', env: process.env });
  const log = `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter((l) => !/Warning|trace-warnings/.test(l)).join('\n');
  fs.writeFileSync(path.join(OUT, `${p.state}-${p.holiday}.log`), log);
  console.log(`== ${p.state} ${p.zip} ${p.holiday} (${Math.round((Date.now() - t0) / 1000)}s, exit ${r.status})`);
  console.log(log.trim());
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const refused = refusedStores(rows);
  if (refused.length) {
    console.log(`\nSTOPPED: refused (429) at ${p.state} by ${refused.join(', ')}. Not asking again until the retailer's wait is over.`);
    process.exit(2);
  }
}
