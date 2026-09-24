#!/usr/bin/env node
// Nationwide staple-price sampler.
//
//   node --disable-warning=ExperimentalWarning scripts/sampler/run.js [options]
//
//   --states IL,TX        only these states (default: all 51)
//   --items milk,eggs     only these staples (default: all)
//   --chains aldi,target  only these chains
//   --zips-per-state N    use only the first N ZIPs of each state (default: all, 1–2)
//   --max-stores N        at most N chains per ZIP, in order: Target, ALDI, Walmart, regionals
//   --extras              also price Whole Foods and Trader Joe's
//   --resume              continue the run recorded in stats/sampler-progress.json
//   --dry-run             print what would be queried, make no requests
//   --shops-only          resolve/verify stores for every ZIP+chain, run no searches
//   --delay MS            pause between store searches (default 1000)
//   --max-miles N         reject stores farther than this from the ZIP (default 40)
//   --no-aggregate        skip rebuilding stats.json at the end
//
// Politeness: one request at a time, ~1 s between searches, sessions and store lookups reused from
// the sampler's own cache, and the run stops cleanly after repeated HTTP 429s (resume with --resume).
import './env.js';
import fs from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { STATES, STATE_BY_CODE } from './states.js';
import { STAPLES, STAPLE_BY_ID, formatPrice } from './staples.js';
import { CHAINS, chainsForZip, shopConfig, chainName, MAX_MILES } from './retailers.js';
import { pickBest, compact, worthKeeping } from './match.js';
import {
  PROGRESS_FILE, SAMPLES_FILE, STATS_DIR, ARCHIVE_DIR,
  parseArgs, list, writeJSON, readJSON, readJSONL, weekOf, sleep, duration,
} from './util.js';

const LIMIT = 40;                       // results per search
const BACKOFF = [30_000, 60_000, 120_000];
const MAX_429 = 3;                      // consecutive 429s before stopping
const MAX_ERRORS = 8;                   // consecutive hard errors before stopping

const args = parseArgs(process.argv.slice(2), {
  booleans: ['resume', 'dryRun', 'extras', 'noAggregate', 'shopsOnly', 'help', 'quiet'],
});
if (args.help) {
  // The header comment above is the help text: print it up to the first line of code.
  const header = [];
  for (const line of fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1)) {
    if (!line.startsWith('//')) break;
    header.push(line.replace(/^\/\/ ?/, ''));
  }
  console.log(header.join('\n'));
  process.exit(0);
}

const log = (...a) => console.log(...a);

// ---------------- plan ----------------

function buildOptions(saved) {
  const o = {
    states: list(args.states) || saved?.states || null,
    items: list(args.items) || saved?.items || null,
    chains: list(args.chains) || saved?.chains || null,
    zipsPerState: +(args.zipsPerState ?? saved?.zipsPerState ?? 0) || 0,
    maxStores: +(args.maxStores ?? saved?.maxStores ?? 0) || 0,
    extras: args.extras ?? saved?.extras ?? false,
    delay: +(args.delay ?? saved?.delay ?? 1000),
    maxMiles: +(args.maxMiles ?? saved?.maxMiles ?? MAX_MILES),
  };
  if (o.states) o.states = o.states.map((s) => s.toUpperCase());
  return o;
}

function buildPlan(o) {
  const unknownState = (o.states || []).filter((c) => !STATE_BY_CODE[c]);
  if (unknownState.length) throw new Error(`Unknown state code(s): ${unknownState.join(', ')}`);
  const unknownItem = (o.items || []).filter((i) => !STAPLE_BY_ID[i]);
  if (unknownItem.length) throw new Error(`Unknown item id(s): ${unknownItem.join(', ')} (have: ${STAPLES.map((s) => s.id).join(', ')})`);

  const states = o.states ? STATES.filter((s) => o.states.includes(s.code)) : STATES;
  const items = o.items ? STAPLES.filter((s) => o.items.includes(s.id)) : STAPLES;
  const zips = [];
  for (const st of states) {
    for (const z of o.zipsPerState ? st.zips.slice(0, o.zipsPerState) : st.zips) {
      zips.push({
        state: st.code, stateName: st.name, zip: z.zip, city: z.city,
        chains: chainsForZip(z, { extras: o.extras, only: o.chains, maxStores: o.maxStores }),
      });
    }
  }
  return { states, items, zips };
}

function dryRun(plan, o) {
  let stores = 0;
  for (const z of plan.zips) {
    stores += z.chains.length;
    log(`${z.state} ${z.zip} ${z.city.padEnd(18)} ${z.chains.map(chainName).join(', ')}`);
  }
  const searches = stores * plan.items.length;
  log('');
  log(`${plan.states.length} states · ${plan.zips.length} ZIPs · ${stores} ZIP+chain pairs · ${plan.items.length} staples`);
  log(`items: ${plan.items.map((i) => i.id).join(', ')}`);
  log(`up to ${searches} searches (chains without a nearby store are skipped)`);
  log(`estimated ${duration(searches * (3500 + o.delay))} at ~${((3500 + o.delay) / 1000).toFixed(1)}s per search`);
}

// ---------------- state ----------------

function freshProgress(o, plan, runId) {
  return {
    version: 1,
    runId,
    weekOf: runId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    options: o,
    plan: { states: plan.states.length, zips: plan.zips.length, items: plan.items.map((i) => i.id) },
    counts: { ok: 0, nomatch: 0, empty: 0, error: 0, skipped: 0 },
    shops: {},
    done: [],
  };
}

/** Move samples from earlier weeks into stats/archive so samples.jsonl holds the current week. */
function archiveOldSamples(runId) {
  if (!fs.existsSync(SAMPLES_FILE)) return;
  const rows = readJSONL(SAMPLES_FILE);
  const old = rows.filter((r) => r.run !== runId);
  if (!old.length) return;
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const byRun = new Map();
  for (const r of old) {
    if (!byRun.has(r.run)) byRun.set(r.run, []);
    byRun.get(r.run).push(r);
  }
  // Candidate lists make a full run ~45 MB, so history is gzipped (~10x smaller).
  for (const [run, list] of byRun) {
    const file = `${ARCHIVE_DIR}/samples-${run}.jsonl.gz`;
    const text = list.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const prev = fs.existsSync(file) ? gunzipSync(fs.readFileSync(file)).toString('utf8') : '';
    fs.writeFileSync(file, gzipSync(Buffer.from(prev + text)));
  }
  const keep = rows.filter((r) => r.run === runId);
  fs.writeFileSync(SAMPLES_FILE, keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''));
  log(`Archived ${old.length} sample(s) from ${[...byRun.keys()].join(', ')} to stats/archive/`);
}

// ---------------- main ----------------

const saved = readJSON(PROGRESS_FILE);
const o = buildOptions(args.resume ? saved?.options : null);
let plan;
try {
  plan = buildPlan(o);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

if (args.dryRun) {
  dryRun(plan, o);
  process.exit(0);
}

fs.mkdirSync(STATS_DIR, { recursive: true });

let progress;
if (args.resume && saved) {
  progress = saved;
  progress.status = 'running';
  progress.options = o;
  log(`Resuming run ${progress.runId} — ${progress.done.length} task(s) already done.`);
} else {
  if (args.resume) log('No run to resume (stats/sampler-progress.json is missing) — starting a fresh one.');
  const runId = weekOf();
  archiveOldSamples(runId);
  progress = freshProgress(o, plan, runId);
  log(`Starting run ${progress.runId} (week of ${progress.weekOf}).`);
}
const done = new Set(progress.done);

const ic = await import('../../src/adapters/instacart.js');
const wholefoods = await import('../../src/adapters/wholefoods.js');
const traderjoes = await import('../../src/adapters/traderjoes.js');

let consecutive429 = 0;
let consecutiveErrors = 0;
let stopped = null;
const startedAt = Date.now();
const timings = [];

function saveProgress(status) {
  progress.done = [...done];
  progress.updatedAt = new Date().toISOString();
  if (status) progress.status = status;
  writeJSON(PROGRESS_FILE, progress);
}

function appendSample(rec) {
  fs.appendFileSync(SAMPLES_FILE, JSON.stringify(rec) + '\n');
}

/** Retry wrapper: backs off on 429s, retries transient network errors once, gives up otherwise. */
async function attempt(fn) {
  for (let i = 0; ; i++) {
    try {
      const out = await fn();
      consecutive429 = 0;
      return out;
    } catch (err) {
      const is429 = err.status === 429 || /\b429\b|rate[- ]limit/i.test(err.message || '');
      if (is429) {
        consecutive429 += 1;
        if (consecutive429 >= MAX_429) {
          const e = new Error('Rate limited repeatedly (HTTP 429)');
          e.code = 'RATE_LIMIT';
          throw e;
        }
        const wait = BACKOFF[Math.min(i, BACKOFF.length - 1)];
        log(`   rate limited — waiting ${Math.round(wait / 1000)}s (${consecutive429}/${MAX_429})`);
        await sleep(wait);
        continue;
      }
      if (i === 0 && (err.code === 'TIMEOUT' || err.code === 'NETWORK' || /fetch failed|ECONN|socket|timed out/i.test(err.message || ''))) {
        await sleep(5000);
        continue;
      }
      throw err;
    }
  }
}

/** Nearest store for a chain at a ZIP, or a reason it can't be sampled. Cached in the progress file. */
async function resolveStore(chainKey, zip) {
  const key = `${zip}|${chainKey}`;
  if (progress.shops[key]) return progress.shops[key];
  const chain = CHAINS[chainKey];
  let out;
  try {
    if (chain.type === 'instacart') {
      const shop = await attempt(() => ic.resolveShop(shopConfig(chainKey), zip));
      if (!shop || shop.none) out = { ok: false, reason: 'no store' };
      else if (shop.distance == null) out = { ok: false, reason: 'store address unknown' };
      else if (shop.distance > o.maxMiles) out = { ok: false, reason: `nearest store ${shop.distance} mi away` };
      else out = {
        ok: true,
        shopId: shop.shopId, name: shop.label || shop.name, address: shop.address,
        distance: shop.distance, serviceType: shop.serviceType, priceNote: shop.priceNote || null,
        basis: shop.serviceType === 'instore' || /no markup/i.test(shop.priceNote || '') ? 'shelf' : 'online',
      };
    } else {
      const store = chain.type === 'wholefoods' ? await attempt(() => wholefoods.resolveStore(zip)) : await attempt(() => traderjoes.resolveStore(zip));
      if (!store || store.none) out = { ok: false, reason: 'no store' };
      else if (store.distance == null || store.distance > o.maxMiles) out = { ok: false, reason: `nearest store ${store.distance ?? '?'} mi away` };
      else out = { ok: true, shopId: store.id, name: store.name, address: store.address, distance: store.distance, serviceType: 'instore', priceNote: null, basis: 'shelf' };
    }
  } catch (err) {
    if (err.code === 'RATE_LIMIT') throw err;
    // A lookup that failed for network reasons is not evidence the store doesn't exist, so it is
    // deliberately NOT remembered — the next run (or --resume) gets to try again.
    return { ok: false, reason: `lookup failed: ${err.message}`.slice(0, 120), transient: true };
  }
  progress.shops[key] = out;
  return out;
}

async function runSearch(chainKey, zip, staple) {
  const chain = CHAINS[chainKey];
  if (chain.type === 'instacart') return ic.search(shopConfig(chainKey), staple.query, zip, { limit: LIMIT });
  if (chain.type === 'wholefoods') return wholefoods.search(staple.query, zip, { limit: LIMIT });
  return traderjoes.search(staple.query, zip, { limit: LIMIT });
}

// ---- shops-only mode -------------------------------------------------------
if (args.shopsOnly) {
  for (const z of plan.zips) {
    for (const c of z.chains) {
      const s = await resolveStore(c, z.zip);
      log(`${z.state} ${z.zip} ${z.city.padEnd(16)} ${chainName(c).padEnd(20)} ${s.ok ? `${s.basis.padEnd(6)} ${s.distance} mi  ${s.name} — ${s.address}` : `— ${s.reason}`}`);
      saveProgress();
      await sleep(o.delay);
    }
  }
  saveProgress('shops-only');
  process.exit(0);
}

// ---- main sampling loop ----------------------------------------------------
const tasks = [];
for (const z of plan.zips) for (const c of z.chains) for (const item of plan.items) tasks.push({ z, c, item });
const todo = tasks.filter((t) => !done.has(`${t.z.zip}|${t.c}|${t.item.id}`));
log(`${plan.zips.length} ZIPs · ${plan.items.length} staples · ${tasks.length} tasks (${tasks.length - todo.length} already done)`);
log('');

let n = 0;
let lastShopKey = null;

outer:
for (const z of plan.zips) {
  for (const c of z.chains) {
    const chainTasks = todo.filter((t) => t.z.zip === z.zip && t.c === c);
    if (!chainTasks.length) continue;
    const shopKey = `${z.zip}|${c}`;

    let shop;
    try {
      shop = await resolveStore(c, z.zip);
    } catch (err) {
      stopped = err;
      break outer;
    }
    if (shopKey !== lastShopKey) {
      lastShopKey = shopKey;
      if (shop.ok) {
        log(`${z.state} ${z.zip} ${z.city} · ${chainName(c)} — ${shop.name} (${shop.distance} mi, ${shop.basis} prices)`);
        appendSample({ type: 'shop', run: progress.runId, at: new Date().toISOString(), state: z.state, zip: z.zip, city: z.city, chain: c, chainName: chainName(c), ...shop });
      } else {
        log(`${z.state} ${z.zip} ${z.city} · ${chainName(c)} — skipped: ${shop.reason}`);
        appendSample({ type: 'shop', run: progress.runId, at: new Date().toISOString(), state: z.state, zip: z.zip, city: z.city, chain: c, chainName: chainName(c), ok: false, reason: shop.reason });
      }
    }
    if (!shop.ok) {
      // Remember the skip so a resume doesn't look the store up again (unless it was a transient failure).
      if (!shop.transient) for (const t of chainTasks) done.add(`${t.z.zip}|${t.c}|${t.item.id}`);
      progress.counts.skipped += chainTasks.length;
      saveProgress();
      continue;
    }

    for (const staple of plan.items) {
      const key = `${z.zip}|${c}|${staple.id}`;
      if (done.has(key)) continue;
      n += 1;
      const t0 = Date.now();
      let rec = {
        type: 'sample', run: progress.runId, at: new Date().toISOString(),
        state: z.state, zip: z.zip, city: z.city, chain: c, chainName: chainName(c), parent: CHAINS[c].parent,
        basis: shop.basis, shopId: shop.shopId, shopName: shop.name, distance: shop.distance,
        item: staple.id, query: staple.query,
      };
      try {
        let res = await attempt(() => runSearch(c, z.zip, staple));
        // An empty result is nearly always a hiccup (the same store answers every other query), so
        // give it one more go before recording a gap.
        if (!res.items?.length) {
          await sleep(2000);
          res = await attempt(() => runSearch(c, z.zip, staple));
        }
        const items = res.items || [];
        const r = pickBest(staple, items, { basis: shop.basis });
        const kept = items.filter((p) => worthKeeping(staple, p)).map(compact);
        rec = {
          ...rec,
          status: r.pick ? 'ok' : items.length ? 'nomatch' : 'empty',
          ms: Date.now() - t0,
          results: items.length,
          pick: r.pick,
          rejected: r.pick ? undefined : r.rejected,
          candidates: kept,
        };
        progress.counts[rec.status] += 1;
        consecutiveErrors = 0;
        const label = r.pick
          ? `${formatPrice(staple, r.pick.unitPrice).padStart(10)}  ${`$${r.pick.price}`.padStart(7)} ${(r.pick.size || '').padEnd(9)} ${`${r.pick.brand ? r.pick.brand + ' ' : ''}${r.pick.name}`.slice(0, 52)}${r.pick.est ? ' ~est' : ''}${r.pick.onSale ? ' SALE' : ''}`
          : `  no match (${items.length} results)`;
        if (!args.quiet) log(`  [${String(n).padStart(4)}/${todo.length}] ${staple.id.padEnd(14)}${label}`);
      } catch (err) {
        if (err.code === 'RATE_LIMIT') {
          stopped = err;
          break outer;
        }
        consecutiveErrors += 1;
        rec = { ...rec, status: 'error', ms: Date.now() - t0, error: String(err.message || err).slice(0, 200) };
        progress.counts.error += 1;
        log(`  [${String(n).padStart(4)}/${todo.length}] ${staple.id.padEnd(14)}  ERROR ${rec.error}`);
        if (consecutiveErrors >= MAX_ERRORS) {
          stopped = new Error(`${consecutiveErrors} errors in a row — stopping`);
          appendSample(rec);
          done.add(key);
          saveProgress();
          break outer;
        }
      }
      appendSample(rec);
      done.add(key);
      timings.push(Date.now() - t0);
      saveProgress();
      await sleep(o.delay);
    }
  }
}

// ---- wrap up ---------------------------------------------------------------
const elapsed = Date.now() - startedAt;
// Count what's left of THIS plan (a resumed run's `done` set can cover tasks outside it).
const remaining = tasks.filter((t) => !done.has(`${t.z.zip}|${t.c}|${t.item.id}`)).length;
const finished = tasks.length - remaining;
if (stopped) {
  saveProgress(stopped.code === 'RATE_LIMIT' ? 'rate-limited' : 'stopped');
  log('');
  log(`Stopped: ${stopped.message}`);
  log(`${finished}/${tasks.length} tasks done. Resume with:  node --disable-warning=ExperimentalWarning scripts/sampler/run.js --resume`);
} else {
  progress.finishedAt = new Date().toISOString();
  saveProgress(remaining > 0 ? 'stopped' : 'done');
  log('');
  log(`Done in ${duration(elapsed)} — ${progress.counts.ok} priced, ${progress.counts.nomatch} no match, ${progress.counts.empty} empty, ${progress.counts.error} errors, ${progress.counts.skipped} skipped (no store).`);
}
if (timings.length) {
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  log(`Average search ${(avg / 1000).toFixed(1)}s (+${o.delay / 1000}s delay).`);
}

if (!args.noAggregate && progress.counts.ok > 0) {
  log('');
  const { aggregate } = await import('./aggregate.js');
  aggregate({ verbose: true });
}
process.exit(stopped ? 2 : 0);
