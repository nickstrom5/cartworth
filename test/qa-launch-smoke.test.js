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

// The modulepreload list in public/index.html must be exactly the app's import graph: a missing
// module brings back the one-level-at-a-time chain, and a stale one is a wasted download.
import fs from 'node:fs';
import path from 'node:path';
test('index.html preloads exactly the modules the app imports', () => {
  const ROOT = new URL('..', import.meta.url).pathname;
  const file = (u) => path.join(ROOT, u.startsWith('/shared/') ? `shared/${u.slice(8)}` : `public${u}`);
  const seen = new Set();
  const walk = (u) => {
    if (seen.has(u)) return;
    seen.add(u);
    const src = fs.readFileSync(file(u), 'utf8');
    for (const m of src.matchAll(/^\s*import\s(?:[^;]*?from\s+)?["']([^"']+)["']/gm)) {
      walk(m[1].startsWith('/') ? m[1] : path.posix.normalize(path.posix.join(path.posix.dirname(u), m[1])));
    }
  };
  walk('/js/main.js');
  seen.delete('/js/main.js');
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...preloaded].sort(), [...seen].sort());
});

// BASKET_OFFLINE=1 must stop every outbound request before it is sent: the load test depends on it
// (a network with a transparent proxy let the first load test reach Instacart).
test('BASKET_OFFLINE=1 refuses outbound requests without sending them', async () => {
  const { request } = await import('../src/http.js');
  const realFetch = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async () => { sent += 1; return new Response('{}'); };
  process.env.BASKET_OFFLINE = '1';
  try {
    await assert.rejects(request('https://www.instacart.com/'), (e) => e.code === 'OFFLINE');
    assert.equal(sent, 0);
  } finally {
    delete process.env.BASKET_OFFLINE;
    globalThis.fetch = realFetch;
  }
});
