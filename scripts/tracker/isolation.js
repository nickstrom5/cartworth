// Keep the tracker away from the product's database.
//
// src/db.js opens its SQLite file AT IMPORT TIME, at $BASKET_DB, else $BASKET_DATA_DIR/basket.db,
// else <repo>/data/basket.db. Round 1 migrated the repo database by starting the product once
// without BASKET_DATA_DIR. So this module runs BEFORE any product module is imported (capture.js
// imports src/ dynamically, after calling prepareIsolation), and it:
//
//   * always sets BOTH variables, so an inherited BASKET_DB can never point the product at a
//     file the tracker did not choose;
//   * refuses a data directory that is, or is inside, <repo>/data, comparing real paths so a
//     symlink or /tmp -> /private/tmp spelling cannot sneak past;
//   * and, after the import, confirms the product really opened the file we chose
//     (assertProductDb) before a single request is sent.
//
// test/qa-tracker-isolation.test.js runs a whole capture from a COPY of the tree with a sentinel
// data/basket.db and checks the sentinel is never opened, so it can prove this without risking the
// real file.
import fs from 'node:fs';
import path from 'node:path';
import { REPO_DB, defaultDataDir } from './config.js';

/** Resolve symlinks on the longest existing prefix of `p`, so paths that do not exist yet compare correctly. */
export function canonical(p) {
  let head = path.resolve(p);
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(p);
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export class IsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IsolationError';
    this.code = 'ISOLATION';
  }
}

/**
 * Choose the tracker's data directory and point the product at a cache file inside it.
 * Mutates `env` (process.env by default). Throws IsolationError rather than ever returning a path
 * inside the repository's data directory.
 */
export function prepareIsolation({ env = process.env, dataDir = null, home, repoDb = REPO_DB } = {}) {
  const chosen = dataDir || env.BASKET_DATA_DIR || defaultDataDir(home);
  const dir = canonical(chosen);
  const repoData = canonical(path.dirname(repoDb));
  const productDb = path.join(dir, 'product-cache.db');
  const trackerDb = path.join(dir, 'tracker.db');
  if (inside(dir, repoData)) {
    throw new IsolationError(`Refusing to run: data directory ${dir} is inside the product's data directory ${repoData}. The tracker must never open ${repoDb}.`);
  }
  for (const f of [productDb, trackerDb]) {
    if (canonical(f) === canonical(repoDb)) throw new IsolationError(`Refusing to run: ${f} is the product database.`);
  }
  env.BASKET_DATA_DIR = dir;
  env.BASKET_DB = productDb;
  fs.mkdirSync(dir, { recursive: true });
  return { dataDir: dir, productDb, trackerDb };
}

/** After importing src/db.js: the product must have opened exactly the file we chose. */
export function assertProductDb(dbPath, expected, repoDb = REPO_DB) {
  const got = canonical(dbPath);
  if (got === canonical(repoDb)) throw new IsolationError(`The product opened ${repoDb} despite BASKET_DB — aborting before any request.`);
  if (got !== canonical(expected)) throw new IsolationError(`The product opened ${got}, expected ${expected} — aborting before any request.`);
  return got;
}
