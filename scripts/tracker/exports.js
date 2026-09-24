// CSV files: written locally first, then mirrored into Google Drive for desktop's folder.
//
// Drive is the transport to the Sheet: Google Drive for desktop uploads whatever lands in
// ~/Library/CloudStorage/GoogleDrive-<account>/My Drive, and the Apps Script importer reads
// My Drive/Cartworth/price-tracker/incoming/. No API keys, no service account, no public endpoint.
//
//   <data>/exports/daily/YYYY-MM-DD.csv        full detail for the day, regenerated from tracker.db
//                                               after every run that day, mirrored to daily/
//   <data>/exports/incoming/prices_…_nN.csv    curated Sheet rows for one run, mirrored ONCE to
//   <data>/exports/incoming/summary_…_nN.csv   incoming/ (the importer moves it to imported/)
//
// Local-first means a run while Drive is signed out or not running loses nothing: the file waits
// in tracker.db's `exports` table and goes out on the next run. Files are written under a
// .partial name and renamed, so neither Drive nor the importer ever sees half a file; the row
// count in the file name (…_n1834.csv) lets the importer refuse a file that synced short.
import fs from 'node:fs';
import path from 'node:path';

export function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.partial`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
  return Buffer.byteLength(content);
}

/** File names the importer (marketing/sheets/Code.gs CW_classifyFile) understands. */
export function incomingName(kind, date, runId, n) {
  return `${kind}_${date}_r${runId}_n${n}.csv`;
}

/**
 * Where the tracker's Drive folder is, or null when Drive is not available.
 * An explicit dir (smoke tests, a different account) is created; the default one is only used
 * when Google Drive for desktop has mounted "My Drive" — the tracker never invents that folder,
 * because a directory it created there would look like Drive while syncing nothing.
 */
export function resolveDriveDir({ explicit = null, driveRoot, subdir }) {
  if (explicit) {
    fs.mkdirSync(explicit, { recursive: true });
    return explicit;
  }
  if (!driveRoot || !fs.existsSync(driveRoot)) return null;
  return path.join(driveRoot, ...subdir);
}

/** Copy every pending export into Drive. Returns { mirrored: [...], pending: [...], error }. */
export function mirrorExports(store, exportsDir, driveDir) {
  const out = { mirrored: [], pending: [], error: null };
  const pending = store.pendingExports();
  if (!driveDir) {
    out.pending = pending.map((p) => p.file);
    return out;
  }
  for (const p of pending) {
    const src = path.join(exportsDir, p.file);
    const dest = path.join(driveDir, p.file);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, `${dest}.partial`);
      fs.renameSync(`${dest}.partial`, dest);
      store.markMirrored(p.file, dest);
      out.mirrored.push(p.file);
    } catch (err) {
      out.error = `${p.file}: ${err.message}`;
      out.pending.push(p.file);
    }
  }
  // The two folders the tracker writes to. imported/, archive/ and rejected/ belong to the Sheet's
  // script, which creates them in Drive itself; creating them here too could race it into two
  // same-named folders (Drive allows duplicates).
  for (const d of ['daily', 'incoming']) {
    try {
      fs.mkdirSync(path.join(driveDir, d), { recursive: true });
    } catch {
      /* reported through out.error on the next copy if it matters */
    }
  }
  return out;
}
