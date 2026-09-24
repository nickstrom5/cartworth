// Load test: many shoppers at once, each doing what a real visit does — the page, the app state, the
// store directory for their ZIP, and a few streamed searches — for a fixed time. Reports latency
// percentiles, errors, 429s, shed ("busy") stores and, for a server it started, memory.
//
// Retailers must not feel a load test. The server it starts runs with BASKET_OFFLINE=1 (src/http.js
// refuses every outbound request) on a copy of a database whose cache already holds the ZIPs and
// queries (e.g. a price audit's), so every lookup is answered from the cache or saved prices.
// With --url, the server is yours: start it with BASKET_OFFLINE=1.
//
//   node scripts/load-test.mjs --db <copy of basket.db> --zips 99503,35209 --queries milk,eggs \
//        [--visitors 200] [--seconds 60]
//   node scripts/load-test.mjs --url https://staging.example --zips ... --queries ...   (a server you run)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const VISITORS = +arg('--visitors', 200);
const SECONDS = +arg('--seconds', 60);
const ZIPS = arg('--zips', '60618').split(',');
const QUERIES = arg('--queries', 'milk').split(',');
const DB = arg('--db', null);
let base = arg('--url', null);

let child = null;
let peakRss = 0;
if (!base) {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port: p } = s.address(); s.close(() => r(p)); }); });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartworth-load-'));
  if (DB) for (const ext of ['', '-wal']) if (fs.existsSync(DB + ext)) fs.copyFileSync(DB + ext, path.join(dataDir, `basket.db${ext}`));
  // BASKET_OFFLINE: this server sends nothing to any retailer (src/http.js). Dropping the proxy
  // variables is not enough: behind a transparent proxy requests still get out.
  const env = { ...process.env, BASKET_OFFLINE: '1' };
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server.js')], {
    env: { ...env, PORT: String(port), HOST: '127.0.0.1', BASKET_TRUST_PROXY: '1', BASKET_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  setInterval(() => {
    try {
      const rss = +fs.readFileSync(`/proc/${child.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] * 1024;
      peakRss = Math.max(peakRss, rss);
    } catch {}
  }, 500).unref();
}

const agent = new http.Agent({ keepAlive: true, maxSockets: VISITORS * 2 });
const stats = {};
const note = (kind, ms, status) => {
  const s = (stats[kind] ||= { n: 0, ms: [], status: {} });
  s.n += 1;
  s.ms.push(ms);
  s.status[status] = (s.status[status] || 0) + 1;
};
function get(pathname, ip) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const req = http.get(`${base}${pathname}`, { agent, headers: { 'x-forwarded-for': ip, 'accept-encoding': 'gzip, br' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body, ms: performance.now() - t0 }));
    });
    req.on('error', (e) => resolve({ status: `ERR ${e.code}`, body: '', ms: performance.now() - t0 }));
    req.setTimeout(120_000, () => req.destroy(new Error('timeout')));
  });
}

let shed = 0;
let storesAnswered = 0;
const deadline = Date.now() + SECONDS * 1000;
async function visitor(i) {
  const ip = `198.51.${(i >> 8) & 255}.${i & 255}`;
  const zip = ZIPS[i % ZIPS.length];
  while (Date.now() < deadline) {
    for (const [kind, p] of [['page', '/'], ['script', '/js/main.js'], ['state', '/api/state']]) { const r = await get(p, ip); note(kind, r.ms, r.status); }
    const d = await get(`/api/directory?zip=${zip}&miles=25`, ip);
    note('directory', d.ms, d.status);
    let stores = '';
    try { stores = (JSON.parse(d.body).suggested || []).slice(0, 8).join(','); } catch {}
    for (let k = 0; k < 3 && Date.now() < deadline; k++) {
      const q = QUERIES[(i + k) % QUERIES.length];
      const s = await get(`/api/search?zip=${zip}&miles=25&stores=${stores}&q=${encodeURIComponent(q)}`, ip);
      note('search', s.ms, s.status);
      for (const m of s.body.matchAll(/^event: store\ndata: (.*)$/gm)) { storesAnswered += 1; if (/"status":"busy"/.test(m[1])) shed += 1; }
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500)); // a person reading results
    }
  }
}

console.log(`${VISITORS} visitors for ${SECONDS}s against ${base} (ZIPs ${ZIPS.join(', ')})`);
const t0 = Date.now();
await Promise.all(Array.from({ length: VISITORS }, (_, i) => visitor(i)));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
let bad = 0;
for (const [kind, s] of Object.entries(stats)) {
  const errs = Object.entries(s.status).filter(([k]) => !/^2|^304$/.test(k)).map(([k, v]) => `${k}×${v}`);
  bad += errs.filter((e) => !/^429/.test(e)).length;
  console.log(`${kind.padEnd(10)} ${String(s.n).padStart(6)} req  p50 ${pct(s.ms, 0.5).toFixed(0).padStart(5)} ms  p95 ${pct(s.ms, 0.95).toFixed(0).padStart(5)} ms  p99 ${pct(s.ms, 0.99).toFixed(0).padStart(5)} ms  ${errs.join(' ') || 'all ok'}`);
}
const total = Object.values(stats).reduce((a, s) => a + s.n, 0);
console.log(`\n${total} requests in ${((Date.now() - t0) / 1000).toFixed(0)}s (${(total / ((Date.now() - t0) / 1000)).toFixed(0)}/s); store answers ${storesAnswered}, shed as busy ${shed}`);
if (child) {
  console.log(`server peak memory ${(peakRss / 1048576).toFixed(0)} MB`);
  const alive = await get('/api/health', '127.0.0.1').then((r) => r.status === 200);
  console.log(`server still healthy afterwards: ${alive}`);
  child.kill('SIGTERM');
  await new Promise((r) => child.on('exit', r));
  if (!alive) bad += 1;
}
process.exit(bad ? 1 : 0);
