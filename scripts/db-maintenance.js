#!/usr/bin/env node
// Scheduled database maintenance for Cartworth.
//
// Cartworth's SQLite file was designed for one person on one laptop, where "never delete anything"
// is a reasonable policy. As a public service it is not: measured against the real recordProducts()
// path with 100 visitors a day, the observations table grows ~170,000 rows and ~43 MB a day, the
// cache another ~110 MB a day, and neither the write-ahead log nor the free list was ever
// reclaimed — so even deleting rows did not give the disk back.
//
// This is the thing to run on a schedule. Everything it does is slow and BLOCKING (node:sqlite is
// synchronous), which is exactly why none of it belongs in a request handler.
//
//   node scripts/db-maintenance.js                 prune, compact, checkpoint, vacuum
//   node scripts/db-maintenance.js --dry-run       report what it would do, change nothing
//   node scripts/db-maintenance.js --no-vacuum     skip the rebuild (fast; run it nightly instead)
//   node scripts/db-maintenance.js --no-compact    age-out only, leave the duplicate rows
//   node scripts/db-maintenance.js --check         add the full PRAGMA integrity_check (slow)
//   node scripts/db-maintenance.js --json          machine-readable output for a cron wrapper
//
// A weekly systemd timer or cron line is enough:
//   17 4 * * 0  cd /srv/cartworth && node scripts/db-maintenance.js --json >> /var/log/cartworth-db.log
//
// It is safe to run against a LIVE server — SQLite's own locking handles the concurrency and
// busy_timeout makes both sides wait rather than fail — but the VACUUM holds a write lock for as
// long as it takes to rebuild the file, during which every visitor's search blocks on its history
// write. Run it at a quiet hour, or with --no-vacuum during the day.
//
// Exit codes: 0 fine, 1 the database is unhealthy (degraded, or integrity_check failed).
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const opt = {
  dryRun: args.has('--dry-run') || args.has('-n'),
  vacuum: !args.has('--no-vacuum'),
  compact: !args.has('--no-compact'),
  check: args.has('--check'),
  json: args.has('--json'),
};
if (args.has('--help') || args.has('-h')) {
  console.log(String(await import('node:fs').then((fs) => fs.readFileSync(new URL(import.meta.url), 'utf8')))
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

const db = await import('../src/db.js');
const history = await import('../src/history.js');

const owner = `db-maintenance:${process.pid}:${Date.now()}`;
const report = { at: new Date().toISOString(), path: db.DB_PATH, retention: db.RETAIN, ...opt };

if (db.dbStatus.degraded) {
  // The server falls back to an in-memory database when the file is unusable so that prices keep
  // working. Maintenance has nothing to maintain in that case, and must say so loudly rather than
  // reporting a successful run against a database that is not the real one.
  report.ok = false;
  report.error = `database is degraded (in-memory fallback): ${db.dbStatus.reason}`;
  out(report);
  process.exit(1);
}

if (!db.takeMaintenanceLease(owner)) {
  // Another instance is already at it. Two simultaneous VACUUMs on one file is how a slow
  // maintenance run becomes a stuck one.
  report.ok = true;
  report.skipped = 'another process holds the maintenance lease';
  out(report);
  process.exit(0);
}

try {
  if (opt.check) report.integrity = db.integrityCheck();
  Object.assign(report, db.maintain({ vacuumFile: opt.vacuum, dryRun: opt.dryRun, compact: opt.compact }));
  if (!opt.dryRun && opt.compact) report.compaction = { ...db.lastCompaction };
  // The counts served by /api/state are memoized for a minute; after deleting rows the cached
  // number is stale HIGH, and this process may be the server itself in a one-box deploy.
  history.resetHistoryCounts();
  report.ok = report.integrity ? report.integrity.ok : true;
} finally {
  db.releaseMaintenanceLease(owner);
}

out(report);
process.exit(report.ok ? 0 : 1);

function mb(n) {
  return `${(n / 1048576).toFixed(1)} MB`;
}
function out(r) {
  if (opt.json) return console.log(JSON.stringify(r));
  console.log(`\nCartworth database maintenance — ${r.path}`);
  if (r.error) return console.error(`  FAILED: ${r.error}\n`);
  if (r.skipped) return console.log(`  skipped: ${r.skipped}\n`);
  if (r.dryRun) console.log('  (dry run — nothing was changed)');
  if (r.integrity) console.log(`  integrity_check: ${r.integrity.ok ? 'ok' : r.integrity.problems.join('; ')}`);
  console.log(`  rows      before -> after`);
  for (const t of Object.keys(r.before)) {
    if (t === 'bytes') continue;
    console.log(`    ${t.padEnd(14)} ${String(r.before[t]).padStart(10)} -> ${String(r.after[t]).padStart(10)}`);
  }
  console.log(`  removed: ${r.removed.observations} aged-out observations, ${r.removed.compacted} duplicate heartbeat rows, ` +
    `${r.removed.products} dead products, ${r.removed.cache} cache entries, ${r.removed.flippDetails} ad details`);
  console.log(`  file: ${mb(r.before.bytes)} -> ${mb(r.after.bytes)}  (reclaimed ${mb(r.reclaimedBytes)})`);
  if (r.compaction) {
    const c = r.compaction;
    // The number that says whether this was safe to run against a live server: how long the
    // longest single statement held the write lock. Visitors' history writes queue behind it, and
    // past busy_timeout they stop queueing and start failing.
    const hot = c.worstStatementMs > c.busyTimeoutMs / 2;
    console.log(`  compaction: ${c.statements} statements (${c.splitProducts} split across a product’s locations), ` +
      `longest held the write lock ${c.worstStatementMs} ms of ${c.busyTimeoutMs} ms busy_timeout${hot ? '  ← lower COMPACT_ROW_BUDGET' : ''}`);
  }
  if (r.vacuum && !r.vacuum.ok) console.log(`  vacuum failed: ${r.vacuum.error}`);
  if (r.checkpoint && !r.checkpoint.ok) console.log(`  checkpoint was blocked by an active reader — the WAL will be folded in on the next run`);
  console.log('');
}
