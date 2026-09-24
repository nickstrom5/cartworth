// Small helpers shared by run.js, aggregate.js and facts.js (no network, no src/ imports).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const BASKET_DIR = path.resolve(SAMPLER_DIR, '..', '..');
export const STATS_DIR = process.env.SAMPLER_STATS_DIR || path.join(BASKET_DIR, 'stats');
export const SAMPLES_FILE = path.join(STATS_DIR, 'samples.jsonl');
export const PROGRESS_FILE = path.join(STATS_DIR, 'sampler-progress.json');
export const STATS_FILE = path.join(STATS_DIR, 'stats.json');
export const PICKS_FILE = path.join(STATS_DIR, 'store-picks.json');
export const LOG_FILE = path.join(STATS_DIR, 'aggregate-log.json');
export const ARCHIVE_DIR = path.join(STATS_DIR, 'archive');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal flag parser: --flag, --key value, --key=value. */
export function parseArgs(argv, { booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (eq > 0) out[key] = a.slice(eq + 1);
    else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

export function list(v) {
  if (v == null || v === true) return null;
  const arr = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

/** Write JSON atomically (tmp file + rename) so an interrupted run never leaves a torn file. */
export function writeJSON(file, data, { pretty = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
  fs.renameSync(tmp, file);
}

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Read a JSONL file, skipping blank or torn lines (e.g. from a killed process). */
export function readJSONL(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  let bad = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      bad += 1;
    }
  }
  if (bad) console.warn(`  (skipped ${bad} unreadable line${bad > 1 ? 's' : ''} in ${path.basename(file)})`);
  return out;
}

/** Monday (local time) of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return ymd(x);
}

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Prices below $1 (per-oz items) keep 3 decimals so they stay distinguishable. */
export const roundPrice = (n) => (n == null || !Number.isFinite(n) ? null : n < 1 ? Math.round(n * 1000) / 1000 : Math.round(n * 100) / 100);

export function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
