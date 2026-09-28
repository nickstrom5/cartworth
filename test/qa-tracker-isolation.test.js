// QA: a tracker run never opens the product's database.
//
// src/db.js opens <repo>/data/basket.db AT IMPORT TIME unless BASKET_DB or BASKET_DATA_DIR says
// otherwise, and round 1 migrated the real file exactly that way. Proving the tracker is safe
// cannot be done against the real file — a failing test would damage it — so each case here runs
// the real capture.js from a COPY of the tree (package.json, src/, shared/, scripts/tracker/) whose
// data/basket.db is a sentinel, in a child process with HOME pointed at a temp folder and fetch
// stubbed to fail (no network). The child reports every file it has open at exit (lsof), and the
// sentinel's bytes and its -wal/-shm neighbours are checked afterwards.
//
// Run: node --disable-warning=ExperimentalWarning --test test/qa-tracker-isolation.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function md5(f) {
  return crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
}

/** A throwaway copy of just what a capture imports, with a sentinel data/basket.db. */
function makeWorld() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cw-tracker-iso-')));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(repo, 'package.json'));
  for (const d of ['src', 'shared', path.join('scripts', 'tracker')]) fs.cpSync(path.join(REPO, d), path.join(repo, d), { recursive: true });
  fs.mkdirSync(path.join(repo, 'data'));
  const sentinel = path.join(repo, 'data', 'basket.db');
  const s = new DatabaseSync(sentinel);
  s.exec("CREATE TABLE sentinel (note TEXT); INSERT INTO sentinel VALUES ('the product database: a tracker run must never open this')");
  s.close();
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const preload = path.join(root, 'preload.mjs');
  const lsofOut = path.join(root, 'open-files.txt');
  fs.writeFileSync(
    preload,
    `import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
globalThis.fetch = async () => { throw new TypeError('fetch failed (network disabled in this test)'); };
process.on('exit', () => {
  try { fs.writeFileSync(${JSON.stringify(lsofOut)}, execFileSync('/usr/sbin/lsof', ['-n', '-P', '-p', String(process.pid)], { encoding: 'utf8' })); }
  catch (e) { fs.writeFileSync(${JSON.stringify(lsofOut)}, 'LSOF FAILED ' + e.message); }
});
`,
  );
  return { root, repo, sentinel, home, preload, lsofOut, before: md5(sentinel) };
}

function capture(world, { env = {}, args = [] } = {}) {
  const childEnv = { ...process.env, HOME: world.home, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete childEnv[k];
  return spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '--import', world.preload, path.join(world.repo, 'scripts', 'tracker', 'capture.js'), '--zips', '60618', '--terms', 'butter', '--no-drive', '--no-ads', '--directory-retry-ms', '0', ...args],
    { cwd: world.repo, env: childEnv, encoding: 'utf8', timeout: 60000 },
  );
}

const HAS_LSOF = fs.existsSync('/usr/sbin/lsof');

function assertSentinelUntouched(world) {
  assert.equal(md5(world.sentinel), world.before, 'the sentinel data/basket.db changed');
  for (const side of ['-wal', '-shm', '-journal']) assert.equal(fs.existsSync(world.sentinel + side), false, `data/basket.db${side} appeared: something opened the sentinel`);
}

test('a capture with no BASKET_DATA_DIR, and an inherited BASKET_DB aimed at the product database, never opens it', () => {
  const w = makeWorld();
  try {
    // The worst inherited environment: BASKET_DATA_DIR unset (the product would default to
    // <repo>/data) and BASKET_DB pointing straight at the product database.
    const r = capture(w, { env: { BASKET_DATA_DIR: undefined, BASKET_DB: w.sentinel } });
    // The sentinel first: a run that opened it and then noticed (assertProductDb aborts with exit
    // 2) has already done the damage.
    assertSentinelUntouched(w);
    assert.equal(r.status, 0, `capture exited ${r.status}\n${r.stdout}\n${r.stderr}`);
    const dataDir = path.join(w.home, 'Library', 'Application Support', 'Cartworth', 'tracker');
    // The open-file listing needs macOS's /usr/sbin/lsof (the tracker only runs on the Mac). Where
    // it is missing (Linux CI, cloud sessions) the sentinel and run-record checks still hold.
    if (HAS_LSOF) {
      const open = fs.readFileSync(w.lsofOut, 'utf8');
      assert.ok(!open.startsWith('LSOF FAILED'), open);
      assert.ok(!open.includes(w.sentinel), `the capture process had ${w.sentinel} open:\n${open.split('\n').filter((l) => l.includes('.db')).join('\n')}`);
      assert.ok(open.includes(path.join(dataDir, 'product-cache.db')), 'the product cache was opened in the tracker data dir');
      assert.ok(open.includes(path.join(dataDir, 'tracker.db')), 'tracker.db was opened in the tracker data dir');
    }
    const t = new DatabaseSync(path.join(dataDir, 'tracker.db'), { readOnly: true });
    const runs = t.prepare('SELECT status FROM runs').all();
    t.close();
    assert.equal(runs.length, 1, 'the run was recorded in the tracker database');
  } finally {
    fs.rmSync(w.root, { recursive: true, force: true });
  }
});

test('a data dir that is, is inside, or symlinks into the product data dir is refused before anything opens', () => {
  const w = makeWorld();
  try {
    const link = path.join(w.root, 'sneaky');
    fs.symlinkSync(path.join(w.repo, 'data'), link);
    const cases = [
      { env: { BASKET_DATA_DIR: path.join(w.repo, 'data') } },
      { env: { BASKET_DATA_DIR: path.join(w.repo, 'data', 'tracker') } },
      { env: { BASKET_DATA_DIR: undefined }, args: ['--data-dir', path.join(link, 'x')] },
    ];
    for (const c of cases) {
      const r = capture(w, c);
      assertSentinelUntouched(w);
      assert.equal(r.status, 2, `expected a refusal (exit 2) for ${JSON.stringify(c)}; got ${r.status}\n${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /Refusing to run/);
      assert.deepEqual(fs.readdirSync(path.join(w.repo, 'data')), ['basket.db'], 'nothing new was created in the product data dir');
    }
  } finally {
    fs.rmSync(w.root, { recursive: true, force: true });
  }
});
