// QA: the tracker's hand-off into Google Drive (scripts/tracker/exports.js).
//
// Drive for desktop is the transport: a file written under My Drive syncs to the owner's Drive,
// and the Sheet's importer moves each file out of incoming/ once it has read it. So the tracker
// must (1) lose nothing while Drive is unavailable, (2) never leave a half-written file where Drive
// or the importer can see it, and (3) never copy a file into incoming/ a second time after the
// importer has taken it — that would be imported again. Local folders stand in for Drive here.
//
// Run: node --disable-warning=ExperimentalWarning --test test/qa-tracker-exports.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeAtomic, mirrorExports, incomingName } from '../scripts/tracker/exports.js';
import { openTrackerDb, makeStore } from '../scripts/tracker/trackerdb.js';

test('exports wait while Drive is away, go out once, and are never re-sent after the importer has moved them', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-exports-'));
  try {
    const store = makeStore(openTrackerDb(path.join(tmp, 'tracker.db')));
    const exportsDir = path.join(tmp, 'exports');
    const drive = path.join(tmp, 'My Drive', 'Cartworth', 'price-tracker');
    const rel = path.join('incoming', incomingName('prices', '2026-09-24', '20260924T063000', 1));
    const daily = path.join('daily', '2026-09-24.csv');
    const record = (file, body, kind) => store.recordExport({ file, kind, runId: 'R', rows: 1, bytes: writeAtomic(path.join(exportsDir, file), body) });
    record(rel, 'key\r\nk1\r\n', 'prices');
    record(daily, 'a\r\n1\r\n', 'daily');
    assert.equal(fs.existsSync(path.join(exportsDir, `${rel}.partial`)), false, 'no .partial left behind locally');

    // 1. Drive not mounted: nothing is lost, everything waits.
    const away = mirrorExports(store, exportsDir, null);
    assert.deepEqual(away.mirrored, []);
    assert.deepEqual(away.pending.sort(), [daily, rel].sort());

    // 2. Drive back: both go out, whole, under their final names.
    const back = mirrorExports(store, exportsDir, drive);
    assert.deepEqual(back.mirrored.sort(), [daily, rel].sort());
    assert.equal(fs.readFileSync(path.join(drive, rel), 'utf8'), 'key\r\nk1\r\n');
    assert.deepEqual(fs.readdirSync(path.join(drive, 'incoming')).filter((f) => f.endsWith('.partial')), []);

    // 3. The importer takes the file out of incoming/. The next run must not put it back.
    fs.mkdirSync(path.join(drive, 'imported'));
    fs.renameSync(path.join(drive, rel), path.join(drive, 'imported', path.basename(rel)));
    const next = mirrorExports(store, exportsDir, drive);
    assert.deepEqual(next.mirrored, [], 'nothing re-sent');
    assert.deepEqual(fs.readdirSync(path.join(drive, 'incoming')), [], 'incoming/ stays empty: the file cannot be imported twice');

    // 4. A later run the same day regenerates the day's detail file, and that one does go out again.
    record(daily, 'a\r\n1\r\n2\r\n', 'daily');
    assert.deepEqual(mirrorExports(store, exportsDir, drive).mirrored, [daily]);
    assert.equal(fs.readFileSync(path.join(drive, daily), 'utf8'), 'a\r\n1\r\n2\r\n');
    store.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
