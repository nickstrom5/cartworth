// QA: the security review before the web app is public (Sept 2026). The server is started for
// real and sent raw requests; only static paths and local-only API calls, so nothing here reaches
// a retailer.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 47000 + Math.floor(Math.random() * 900);
let proc;

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', KROGER_CLIENT_ID: '', KROGER_CLIENT_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    proc.stdout.on('data', (d) => /running at/.test(String(d)) && (clearTimeout(t), resolve()));
    proc.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
});
after(() => proc?.kill());

/** Send raw HTTP (so a malformed request line or Host header gets through) and read the status. */
function raw(lines) {
  return new Promise((resolve, reject) => {
    const s = net.connect(PORT, '127.0.0.1', () => s.write(lines.join('\r\n') + '\r\n\r\n'));
    let out = '';
    s.on('data', (d) => (out += d));
    s.on('end', () => resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(out)?.[1]), head: out.split('\r\n\r\n')[0] }));
    s.on('error', reject);
    setTimeout(() => s.end(), 1500);
  });
}
const get = (p, host = 'localhost') => raw([`GET ${p} HTTP/1.1`, `Host: ${host}`, 'Connection: close']);
const alive = async () => (await get('/')).status === 200;

test('DEFECT: a malformed escape in the path is a 400, and the server stays up', async () => {
  assert.equal((await get('/%')).status, 400);
  assert.ok(await alive(), 'GET /% took the server down');
});

test('DEFECT: a NUL byte in the path is a 400, and the server stays up', async () => {
  assert.equal((await get('/%00')).status, 400);
  assert.ok(await alive());
});

test('DEFECT: a Host header that is not a host does not crash the server', async () => {
  const r = await get('/', 'a b');
  assert.ok(r.status === 200 || r.status === 400, `status ${r.status}`);
  assert.ok(await alive(), 'Host: a b took the server down');
});

test('DEFECT: pages carry security headers', async () => {
  const { head } = await get('/');
  assert.match(head, /x-content-type-options: nosniff/i);
  assert.match(head, /content-security-policy: [^\r\n]*frame-ancestors 'none'/i);
  assert.match(head, /referrer-policy:/i);
});

test('control: path traversal is still refused', async () => {
  const r = await get('/..%2f..%2fpackage.json');
  assert.ok(r.status === 403 || r.status === 404, `status ${r.status}`);
});

const api = (p, extra = []) => raw([`GET ${p} HTTP/1.1`, 'Host: localhost', ...extra, 'Connection: close']);

test('DEFECT: /api/health shows the operator details only to this machine', async () => {
  const local = await raw(['GET /api/health HTTP/1.1', 'Host: localhost', 'Connection: close']);
  assert.equal(local.status, 200);
  const body = await new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1', () => s.write('GET /api/health HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-For: 198.51.100.4\r\nConnection: close\r\n\r\n'));
    let out = '';
    s.on('data', (d) => (out += d));
    s.on('end', () => resolve(out.split('\r\n\r\n').slice(1).join('')));
  });
  assert.doesNotMatch(body, /"db"|basket\.db|"guard"/, `a forwarded (remote) request saw: ${body.slice(0, 120)}`);
});

test('DEFECT: a local server answers its API only to local host names (DNS rebinding)', async () => {
  const r = await raw(['GET /api/health HTTP/1.1', 'Host: evil.example:' + PORT, 'Connection: close']);
  assert.equal(r.status, 403);
});

test('DEFECT: prototype names are not store ids', async () => {
  const r = await api('/api/locations?zip=60618&stores=constructor,__proto__');
  assert.equal(r.status, 400);
});
