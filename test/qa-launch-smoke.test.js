// Launch readiness: the production smoke test (scripts/smoke.js, offline mode) runs with the suite.
// It starts a server the way it runs in public (all interfaces, behind one proxy hop, a health
// token) on a scratch data directory and checks headers, revalidation, refusals, the public health
// answer and a graceful SIGTERM. Written in the launch review, where it found that `npm run smoke`
// pointed at a file that did not exist, that a restart cut off every search in progress, and that
// static files had no validator, so every visit re-downloaded every asset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('scripts/smoke.js passes against a fresh production-mode server', () => {
  const r = spawnSync(process.execPath, [new URL('../scripts/smoke.js', import.meta.url).pathname], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
