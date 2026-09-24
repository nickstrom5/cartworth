// tracker.db: the tracker's own SQLite file, next to (never inside) the product's cache.
//
//   runs          one row per capture run: when, which parser, what happened to each host
//   run_stores    the stores the directory found per ZIP per run, with basis, distance, address
//   captures      one row per (run, ZIP, term, store) ATTEMPT — including failures, stale answers
//                 that were refused, and hosts closed by a 429 — so a gap in the data is explained
//   observations  the kept detail rows (columns.js DETAIL_COLUMNS). Never deleted by the tracker.
//   exports       every CSV written, and whether it has reached Google Drive yet
//   parser_versions  what each parser_version was made of, and when it was first seen
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DETAIL_COLUMNS, NUMERIC, BOOLEAN } from './columns.js';

const colType = (c) => (NUMERIC.has(c) ? 'REAL' : BOOLEAN.has(c) ? 'INTEGER' : 'TEXT');

export function openTrackerDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY, label TEXT, date TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
      status TEXT NOT NULL, parser_version TEXT, zips TEXT, terms INTEGER, pid INTEGER,
      duration_ms INTEGER, requests_json TEXT, note TEXT
    );
    CREATE TABLE IF NOT EXISTS run_stores (
      run_id TEXT NOT NULL, zip TEXT NOT NULL, store_id TEXT NOT NULL, name TEXT, status TEXT, source TEXT,
      distance_mi REAL, address TEXT, price_note TEXT, PRIMARY KEY (run_id, zip, store_id)
    );
    CREATE TABLE IF NOT EXISTS captures (
      run_id TEXT NOT NULL, date TEXT NOT NULL, zip TEXT NOT NULL, term TEXT NOT NULL, store_id TEXT NOT NULL,
      status TEXT NOT NULL, error TEXT, results_total INTEGER, rows_kept INTEGER, not_kept INTEGER,
      captured_at TEXT, ms INTEGER, PRIMARY KEY (run_id, zip, term, store_id)
    );
    CREATE TABLE IF NOT EXISTS observations (
      ${DETAIL_COLUMNS.map((c) => `${c} ${colType(c)}`).join(',\n      ')},
      UNIQUE (run_id, zip, term, store_id, basis, product_id)
    );
    CREATE INDEX IF NOT EXISTS obs_sku ON observations (store_id, store_location_id, basis, product_id, date);
    CREATE INDEX IF NOT EXISTS obs_day ON observations (date, zip, term);
    CREATE TABLE IF NOT EXISTS exports (
      file TEXT PRIMARY KEY, kind TEXT NOT NULL, run_id TEXT, rows INTEGER, bytes INTEGER,
      written_at TEXT NOT NULL, mirrored_at TEXT, mirror_path TEXT
    );
    CREATE TABLE IF NOT EXISTS parser_versions (version TEXT PRIMARY KEY, files_json TEXT, first_seen TEXT);
  `);
  return db;
}

const toDb = (c, v) => {
  if (v == null) return null;
  if (BOOLEAN.has(c)) return v ? 1 : 0;
  if (NUMERIC.has(c)) return Number.isFinite(Number(v)) ? Number(v) : null;
  return String(v);
};
const fromDb = (c, v) => (v == null ? null : BOOLEAN.has(c) ? !!v : v);

export function rowFromDb(r) {
  const out = {};
  for (const c of DETAIL_COLUMNS) out[c] = fromDb(c, r[c]);
  return out;
}

export function makeStore(db) {
  const insObs = db.prepare(`INSERT OR IGNORE INTO observations (${DETAIL_COLUMNS.join(',')}) VALUES (${DETAIL_COLUMNS.map(() => '?').join(',')})`);
  const insCap = db.prepare(`INSERT OR REPLACE INTO captures (run_id, date, zip, term, store_id, status, error, results_total, rows_kept, not_kept, captured_at, ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insStore = db.prepare(`INSERT OR REPLACE INTO run_stores (run_id, zip, store_id, name, status, source, distance_mi, address, price_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = (fn) => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  return {
    db,
    startRun({ runId, label, date, startedAt, parserVersion, parserFiles, zips, terms }) {
      db.prepare('INSERT INTO runs (run_id, label, date, started_at, status, parser_version, zips, terms, pid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(runId, label, date, new Date(startedAt).toISOString(), 'running', parserVersion, zips.join(','), terms, process.pid);
      db.prepare('INSERT OR IGNORE INTO parser_versions (version, files_json, first_seen) VALUES (?, ?, ?)').run(parserVersion, JSON.stringify(parserFiles || {}), new Date(startedAt).toISOString());
    },
    finishRun({ runId, status, finishedAt, durationMs, requests, note }) {
      db.prepare('UPDATE runs SET status = ?, finished_at = ?, duration_ms = ?, requests_json = ?, note = ? WHERE run_id = ?')
        .run(status, new Date(finishedAt).toISOString(), durationMs, JSON.stringify(requests || {}), note || null, runId);
    },
    recordStores(runId, zip, stores) {
      tx(() => {
        for (const s of stores) insStore.run(runId, zip, s.id, s.name, s.status, s.source || null, s.distance ?? null, s.address ?? null, s.priceNote ?? null);
      });
    },
    /** Write one term's capture records and kept rows in one transaction. Returns rows actually inserted. */
    recordTerm(captures, rows) {
      return tx(() => {
        for (const c of captures) {
          insCap.run(c.run_id, c.date, c.zip, c.term, c.store_id, c.status, c.error ?? null, c.results_total ?? null, c.rows_kept ?? null, c.not_kept ?? null, c.captured_at ?? null, c.ms ?? null);
        }
        let n = 0;
        for (const r of rows) n += Number(insObs.run(...DETAIL_COLUMNS.map((c) => toDb(c, r[c]))).changes);
        return n;
      });
    },
    runsOn(date) {
      return db.prepare('SELECT * FROM runs WHERE date = ? ORDER BY started_at').all(date);
    },
    rowsForRun(runId) {
      return db.prepare('SELECT * FROM observations WHERE run_id = ? ORDER BY zip, term, store_id, is_store_best DESC, relevance DESC').all(runId).map(rowFromDb);
    },
    rowsForDate(date) {
      return db.prepare('SELECT * FROM observations WHERE date = ? ORDER BY run_id, zip, term, store_id, is_store_best DESC, relevance DESC').all(date).map(rowFromDb);
    },
    capturesForRun(runId) {
      return db.prepare('SELECT * FROM captures WHERE run_id = ?').all(runId);
    },
    storesForRun(runId) {
      return db.prepare('SELECT * FROM run_stores WHERE run_id = ?').all(runId);
    },
    recordExport({ file, kind, runId, rows, bytes }) {
      db.prepare('INSERT OR REPLACE INTO exports (file, kind, run_id, rows, bytes, written_at, mirrored_at, mirror_path) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)')
        .run(file, kind, runId, rows, bytes, new Date().toISOString());
    },
    pendingExports() {
      return db.prepare('SELECT * FROM exports WHERE mirrored_at IS NULL ORDER BY written_at').all();
    },
    markMirrored(file, mirrorPath) {
      db.prepare('UPDATE exports SET mirrored_at = ?, mirror_path = ? WHERE file = ?').run(new Date().toISOString(), mirrorPath, file);
    },
    close() {
      db.close();
    },
  };
}
