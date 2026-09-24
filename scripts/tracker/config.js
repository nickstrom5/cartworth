// Cartworth price tracker: the fixed facts of a daily capture. Nothing in here touches the network,
// the product database or the disk; it is safe to import from anywhere, including tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRACKER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TRACKER_DIR, '..', '..');
// The product's own database. The tracker must never open it (see isolation.js).
export const REPO_DB = path.join(REPO_ROOT, 'data', 'basket.db');

/** The four test ZIPs: Chicago, Lombard IL, Milwaukee WI, Kenosha WI. */
export const ZIPS = ['60618', '60148', '53211', '53142'];
export const MAX_MILES = 25;
/** Detail rows kept per (term, store): the top N by relevance, plus that store's best if it is not among them. */
export const ROWS_PER_STORE = 5;
/** How many results each store search asks for. The product's own default, so relevance and plausibility see the pool the app sees. */
export const RESULTS_PER_STORE = 36;

/** The price anyone can pay: no loyalty card, no paid membership. Card and Prime prices are kept in their own columns. */
export const PREFS = Object.freeze({ cardPrices: false, prime: false });

export const TERMS_FILE = path.join(TRACKER_DIR, 'terms.txt');

export function defaultDataDir(home = os.homedir()) {
  return path.join(home, 'Library', 'Application Support', 'Cartworth', 'tracker');
}

/** The Google Drive for desktop mount for the owner's account ("My Drive" inside it). */
export function defaultDriveRoot(home = os.homedir()) {
  return path.join(home, 'Library', 'CloudStorage', 'GoogleDrive-nickstrom5@gmail.com', 'My Drive');
}

/** Where the tracker's files go inside My Drive. The Apps Script importer looks for exactly this path. */
export const DRIVE_SUBDIR = ['Cartworth', 'price-tracker'];

/**
 * Read the editable term list. Returns [{ term, tags }], de-duplicated case- and space-insensitively,
 * in first-seen order; a term listed under two sections keeps both tags.
 */
export function readTerms(file = TERMS_FILE) {
  return parseTerms(fs.readFileSync(file, 'utf8'));
}

export function parseTerms(text) {
  const out = [];
  const byKey = new Map();
  let tag = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[([a-z0-9 _-]+)\]$/i);
    if (sec) {
      tag = sec[1].trim().toLowerCase();
      continue;
    }
    const term = line.replace(/\s+/g, ' ').toLowerCase();
    let entry = byKey.get(term);
    if (!entry) {
      entry = { term, tags: [] };
      byKey.set(term, entry);
      out.push(entry);
    }
    if (tag && !entry.tags.includes(tag)) entry.tags.push(tag);
  }
  return out;
}

/** Local calendar date (the Mac's time zone) as YYYY-MM-DD. */
export function localDate(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A run id that sorts by time and is safe in a file name: 20260924T063002. */
export function runIdFor(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
