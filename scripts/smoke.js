// Pre-launch and post-deploy smoke test for the Cartworth server.
//
//   npm run smoke                              # starts a fresh server (scratch data dir), tests it, stops it
//   npm run smoke -- --url https://app.example # tests a deployed instance (read-only; nothing is stopped)
//   npm run smoke -- --live                    # also builds one real store directory and runs one search
//
// Without --live it makes no request to any retailer. It checks what a public deployment must get
// right: security headers on pages and API answers, cache revalidation, refusal of malformed and
// cross-origin requests, the public health answer, and (for the server it started) a clean stop on
// SIGTERM. Exit status 0 when everything passed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const urlArg = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null;
const LIVE = argv.includes('--live');
const LIVE_ZIP = argv.includes('--zip') ? argv[argv.indexOf('--zip') + 1] : '60618';

let failures = 0;
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${what}${!cond && detail ? `  — ${detail}` : ''}`);
  if (!cond) failures += 1;
};

async function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer() {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartworth-smoke-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server.js')], {
    // As it runs in public: every interface, one trusted proxy hop, a health token for the monitor.
    env: { ...process.env, PORT: String(port), HOST: '0.0.0.0', BASKET_TRUST_PROXY: '1', BASKET_HEALTH_TOKEN: HEALTH_TOKEN, BASKET_DATA_DIR: dataDir, BASKET_SHUTDOWN_GRACE_MS: '3000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return { base, child, dataDir, log: () => log }; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${log}`);
}

const HEALTH_TOKEN = 'smoke-health-token';
const PAGE_HEADERS = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security'];

async function checks(base) {
  console.log(`\nPages (${base})`);
  const home = await fetch(`${base}/`);
  const html = await home.text();
  ok(home.status === 200 && /text\/html/.test(home.headers.get('content-type')), 'GET / is the app', `${home.status}`);
  ok(/<script[^>]+src=/.test(html), 'the page loads its script');
  for (const h of PAGE_HEADERS) ok(!!home.headers.get(h), `page header ${h}`);
  ok(!/unsafe-eval/.test(home.headers.get('content-security-policy') || ''), 'CSP has no unsafe-eval');
  const etag = home.headers.get('etag');
  ok(!!etag, 'pages carry an ETag');
  if (etag) ok((await fetch(`${base}/`, { headers: { 'if-none-match': etag } })).status === 304, 'an unchanged page revalidates as 304');
  for (const src of [...html.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|mjs))/g)].map((m) => m[1]).slice(0, 8)) {
    const r = await fetch(`${base}${src}`);
    ok(r.status === 200, `asset ${src}`, `${r.status}`);
  }
  const head = await fetch(`${base}/`, { method: 'HEAD' });
  ok(head.status === 200 && (await head.text()) === '', 'HEAD / answers with no body');
  ok((await fetch(`${base}/compare/deep-link`)).status === 200, 'a deep link serves the app');
  ok((await fetch(`${base}/nope.png`)).status === 404, 'a missing file is 404');
  ok([400, 403, 404].includes((await fetch(`${base}/%`)).status), 'a malformed path is refused');
  for (const bad of ['/..%2f..%2fserver.js', '/..%2F..%2Fpackage.json', '/%2e%2e/%2e%2e/etc/passwd']) {
    const r = await fetch(`${base}${bad}`);
    const body = await r.text();
    ok(!/"name": "basket"|createServer|root:x:0/.test(body), `no path traversal: ${bad}`, `${r.status}`);
  }
  ok((await fetch(`${base}/`, { method: 'POST' })).status === 405, 'POST to a page is 405');

  console.log('\nAPI');
  // Through a proxy, as a visitor: nothing but ok.
  const health = await fetch(`${base}/api/health`, { headers: { 'x-forwarded-for': '203.0.113.9' } });
  const hj = await health.json();
  ok(health.status === 200 && hj.ok === true, '/api/health is ok', JSON.stringify(hj).slice(0, 120));
  ok(Object.keys(hj).length === 1, 'the public health answer reveals nothing but ok', Object.keys(hj).join(','));
  if (!urlArg) {
    const op = await (await fetch(`${base}/api/health`, { headers: { 'x-forwarded-for': '203.0.113.9', 'x-health-token': HEALTH_TOKEN } })).json();
    ok('uptimeMs' in op && 'guard' in op, 'the health token shows the monitor its details');
  }
  const state = await fetch(`${base}/api/state`);
  ok(state.status === 200 && /application\/json/.test(state.headers.get('content-type')), '/api/state answers JSON');
  ok(state.headers.get('x-content-type-options') === 'nosniff', 'API answers are nosniff');
  ok(state.headers.get('cache-control') === 'no-store', 'API answers are not cached');
  ok((await fetch(`${base}/api/nope`)).status === 404, 'an unknown endpoint is 404');
  const noZip = await fetch(`${base}/api/directory`);
  ok(noZip.status >= 400 && noZip.status < 500, 'a request without a ZIP is a 4xx, not a crash', `${noZip.status}`);
  const badZip = await fetch(`${base}/api/directory?zip=ABCDE`);
  const bz = await badZip.text();
  ok(badZip.status >= 400 && badZip.status < 500 && !/ABCDE/.test(bz), 'a bad ZIP is refused without echoing it', `${badZip.status} ${bz.slice(0, 80)}`);
  const xo = await fetch(`${base}/api/watch/check`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  ok(xo.status === 403, 'a cross-origin POST is refused', `${xo.status}`);
  const big = await fetch(`${base}/api/list/optimize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(3 * 1024 * 1024) }).catch((e) => ({ status: 0, e }));
  ok(big.status >= 400 && big.status < 500 || big.status === 0, 'a 3 MB body is refused', `${big.status}`);

  if (LIVE) {
    console.log(`\nLive (ZIP ${LIVE_ZIP}; this asks real retailers, politely)`);
    const t0 = Date.now();
    const dir = await fetch(`${base}/api/directory?zip=${LIVE_ZIP}&miles=25`);
    const dj = await dir.json();
    const priced = (dj.chains || []).filter((c) => ['shelf', 'online', 'national'].includes(c.status));
    ok(dir.status === 200 && priced.length > 0, `store directory: ${priced.length} priced stores in ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(dj).slice(0, 160));
    const stores = (dj.suggested || []).slice(0, 4).join(',');
    const t1 = Date.now();
    const res = await fetch(`${base}/api/search?zip=${LIVE_ZIP}&miles=25&stores=${stores}&q=milk`, { headers: { accept: 'text/event-stream' } });
    const text = await res.text();
    const storesAnswered = (text.match(/^event: store$/gm) || []).length;
    const priced2 = [...text.matchAll(/^event: store\ndata: (.*)$/gm)].map((m) => JSON.parse(m[1])).filter((r) => r.items?.length).length;
    ok(res.status === 200 && /event: done/.test(text), `search streamed to the end in ${Math.round((Date.now() - t1) / 1000)}s`);
    ok(storesAnswered > 0 && priced2 > 0, `search: ${priced2} of ${storesAnswered} stores returned milk`);
  }
}

const target = urlArg ? { base: urlArg.replace(/\/$/, '') } : await startServer();
try {
  await checks(target.base);
} catch (err) {
  ok(false, 'smoke test ran to the end', err.stack || String(err));
}
if (target.child) {
  console.log('\nLifecycle');
  // A search in flight when the stop arrives must still be answered (graceful drain).
  // A request still arriving when the stop comes (headers half sent, like a slow phone): a graceful
  // server answers it; one that exits at once resets the connection.
  const port = new URL(target.base).port;
  const sock = net.connect(+port, '127.0.0.1');
  await new Promise((r) => sock.on('connect', r));
  sock.write('GET /api/state HTTP/1.1\r\nHost: 127.0.0.1\r\n');
  let reply = '';
  sock.on('data', (d) => (reply += d));
  const pending = new Promise((resolve) => sock.on('close', () => resolve(Number((/^HTTP\/1\.1 (\d+)/.exec(reply) || [])[1] || 0))));
  sock.on('error', () => {});
  await new Promise((r) => setTimeout(r, 50));
  const t0 = Date.now();
  target.child.kill('SIGTERM');
  setTimeout(() => sock.write('Connection: close\r\n\r\n'), 100);
  const code = await new Promise((r) => target.child.on('exit', (c) => r(c)));
  ok(code === 0, `SIGTERM stops cleanly (exit ${code}, ${Date.now() - t0} ms)`);
  ok((await pending) === 200, 'a request in flight at SIGTERM is still answered');
  ok(fs.existsSync(path.join(target.dataDir, 'basket.db')) || fs.readdirSync(target.dataDir).some((f) => f.endsWith('.db')), 'the database was written to the data directory');
  if (failures) console.log(`\nserver log:\n${target.log()}`);
  fs.rmSync(target.dataDir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
