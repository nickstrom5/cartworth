// The iPhone app's Foundation-only core (matching, units, comparison, product parsing, catalog,
// sources, cache) compiled and its XCTests run with Swift on Linux (ios/linux/run-core-tests.sh).
// Runs when a Swift 6.1+ toolchain is available (SWIFT=<toolchain>/usr/bin, or `swift` on PATH);
// skipped otherwise. First run, 24 Sep 2026: 306 tests, after fixing a parity probe this session's
// holiday matrix had made wrong and a date test that assumed the machine's region was the US.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const swiftDir = process.env.SWIFT || '';
const found = spawnSync(swiftDir ? `${swiftDir}/swift` : 'swift', ['--version'], { encoding: 'utf8' });
// Linux only. A Mac has Xcode's Swift on PATH, but the script's GNU sed (`sed -i`, `sed '1i'`) does
// not run there, and Xcode runs these same suites with the rest (ops/appstore-testing.md, step 1).
const SKIP = process.platform !== 'linux' ? 'Linux only — on a Mac these XCTests run in Xcode'
  : found.status === 0 && /Swift version 6\.([1-9]|\d\d)/.test(found.stdout) ? false : 'no Swift 6.1+ toolchain (set SWIFT=<toolchain>/usr/bin) — iOS core tests not run';

test('iOS core XCTests pass on Linux', { skip: SKIP, timeout: 30 * 60_000 }, () => {
  const r = spawnSync(new URL('../ios/linux/run-core-tests.sh', import.meta.url).pathname, [], { encoding: 'utf8', env: process.env, timeout: 30 * 60_000 });
  const out = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, out.split('\n').filter((l) => /error:|Executed/.test(l)).slice(-20).join('\n'));
  assert.match(out, /Executed [1-9]\d* tests, with 0 failures/);
});
