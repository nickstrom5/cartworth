// A real browser for the app's behaviour tests: headless Chrome driven over the DevTools protocol,
// with no dependencies (Node's own WebSocket and http).
//
// Why a real browser. The first round of app tests grepped the source ("does ui.js still contain
// `.inert = true`?"), and a verifier showed that commenting out the line, the call, or the clause
// left every one of them green. What a shopper gets is layout, focus and a rendered DOM, and only
// a browser produces those. So these tests load the real public/ files, run the real modules, and
// assert on what the page actually does.
//
// What is NOT real, on purpose: /api/*. The app talks to the server only through /api, and here a
// small in-process server answers those routes from fixtures the test supplies. That keeps the
// tests deterministic and — more importantly — keeps them from ever touching a retailer: the owner
// rule is at most one request per 700 ms to any third-party host, and a test suite that fans out
// searches would break it on every run. Chrome is additionally told that every host except
// 127.0.0.1 does not exist, so a stray product image or font cannot leave the machine either.
//
// If Chrome is not installed the suite reports these tests as SKIPPED with the reason, never as
// passed. Set CHROME_PATH to point at a different binary.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export const CHROME = CANDIDATES.find((p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
});
/** Pass as the `skip` option of test(): a string explains the skip in the test report. */
export const SKIP = CHROME ? false : 'no Chrome/Chromium found (set CHROME_PATH) — browser behaviour not checked';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

/**
 * Serve public/ and /shared/ exactly as server.js does, and /api/* from `api`:
 *   api: { 'GET /api/state': body | (req, url, body) => body, 'GET /api/search': { sse: [[event, data], ...] } }
 * `headers` are added to every static response (used to apply a Content-Security-Policy).
 */
export async function startAppServer({ api = {}, headers = {} } = {}) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;
    if (p.startsWith('/api/')) {
      let body = '';
      for await (const c of req) body += c;
      calls.push({ method: req.method, path: p, query: url.search, body });
      const key = `${req.method} ${p}`;
      // Exact route first, then the longest "METHOD /prefix*" pattern that matches.
      let h = api[key];
      if (h === undefined) {
        const wild = Object.keys(api)
          .filter((k) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))
          .sort((a, b) => b.length - a.length)[0];
        if (wild) h = api[wild];
      }
      if (h === undefined) {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: `no fixture for ${key}` }));
      }
      if (typeof h === 'function') h = await h(req, url, body ? JSON.parse(body) : null);
      if (h && h.sse) {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
        for (const [event, data] of h.sse) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(h));
    }
    let base = PUBLIC;
    let rel = p;
    if (p.startsWith('/shared/')) {
      base = SHARED;
      rel = p.slice('/shared'.length);
    }
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(base, decodeURIComponent(rel)));
    if (!file.startsWith(base) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...headers });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, calls, close: () => new Promise((r) => server.close(r)) };
}

/** Launch headless Chrome with a throwaway profile. Returns a CDP session on one blank page. */
export async function launchBrowser() {
  if (!CHROME) throw new Error('Chrome not found');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cartworth-chrome-'));
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--hide-scrollbars',
      // The page under test must behave like the visible tab it is for a shopper: a backgrounded
      // tab gets no requestAnimationFrame (so Preact's effects fall back to a 100 ms timer) and
      // throttled timers, which turns every "the effect has run" check into a race.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Nothing but the test server resolves: the page cannot reach a third-party host.
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let err = '';
    const t = setTimeout(() => reject(new Error(`Chrome did not start: ${err.slice(-400)}`)), 20000);
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
    proc.on('exit', (code) => reject(new Error(`Chrome exited ${code}: ${err.slice(-400)}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  // Every command is bounded, so a lost reply fails a test instead of hanging the whole run.
  const send = (method, params = {}, sessionId, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const t = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`CDP ${method} got no reply in ${timeoutMs / 1000}s`));
      }, timeoutMs);
      pending.set(n, {
        resolve: (v) => (clearTimeout(t), resolve(v)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  // Drive the window Chrome opened (the foreground tab), not a second, background one.
  const { targetInfos } = await send('Target.getTargets');
  const targetId = targetInfos.find((t) => t.type === 'page')?.targetId || (await send('Target.createTarget', { url: 'about:blank' })).targetId;
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params, timeoutMs) => send(method, params, sessionId, timeoutMs);
  await cmd('Page.enable');
  await cmd('Page.bringToFront');
  await cmd('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cmd('Runtime.enable');
  const consoleErrors = [];
  listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await cmd('Log.enable');
  listeners.push((m) => {
    if (m.sessionId === sessionId && m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(m.params.entry.text);
  });

  const page = {
    cmd,
    consoleErrors,
    /**
     * Does the page still answer? On a machine under heavy load (other agents building iOS apps
     * alongside this suite, load average 200-300) a renderer has been seen to stop answering for
     * minutes; every later test then failed on a 20 s CDP timeout that had nothing to do with it.
     * A test file calls this before each test and relaunches the browser when it says no.
     */
    async responsive(ms = 5000) {
      try {
        await cmd('Runtime.evaluate', { expression: '1', returnByValue: true }, ms);
        return true;
      } catch {
        return false;
      }
    },
    /** Evaluate an expression (or async function body via `(async () => {...})()`) in the page. */
    async eval(expression) {
      const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    },
    /** Load a URL as a new document (a hash-only change would never fire a load event). */
    async goto(url, { reload = false } = {}) {
      let l;
      const loaded = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`no load event for ${url}`)), 15000);
        l = (m) => {
          if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') {
            clearTimeout(t);
            resolve();
          }
        };
        listeners.push(l);
      });
      try {
        if (reload) await cmd('Page.reload', { ignoreCache: true });
        else await cmd('Page.navigate', { url });
        await loaded;
      } finally {
        listeners.splice(listeners.indexOf(l), 1);
      }
    },
    reload() {
      return page.goto(null, { reload: true });
    },
    /** Poll `expression` in the page until it is truthy; returns its value. */
    async waitFor(expression, { timeout = 10000, what = expression } = {}) {
      const until = Date.now() + timeout;
      let last;
      while (Date.now() < until) {
        try {
          last = await page.eval(expression);
          if (last) return last;
        } catch (e) {
          last = e.message;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)}); page errors: ${consoleErrors.join(' | ')}`);
    },
    async viewport(width, height, { mobile = width < 768, dark = false } = {}) {
      await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
    },
    /** A real key press, dispatched by the browser (so focus movement is the browser's, not ours). */
    async key(key, { shift = false } = {}) {
      const codes = { Tab: 9, Escape: 27, Enter: 13 };
      const base = { key, code: key, windowsVirtualKeyCode: codes[key], nativeVirtualKeyCode: codes[key], modifiers: shift ? 8 : 0 };
      await cmd('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
  };

  const close = async () => {
    try {
      await send('Browser.close');
    } catch {}
    ws.close();
    await new Promise((r) => {
      if (proc.exitCode != null) return r();
      proc.on('exit', r);
      setTimeout(() => {
        proc.kill('SIGKILL');
        r();
      }, 3000);
    });
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { page, close };
}

/** localStorage as the app writes it (public/js/store.js), so a test can start mid-session. */
export function seedStorage({ zip = '53211', stores = [], list = null, prefs = {} } = {}) {
  const out = { 'cartworth:v1:settings': JSON.stringify({ zip, stores, maxMiles: 25 }) };
  if (list) out['cartworth:v1:list'] = JSON.stringify(list);
  for (const [k, v] of Object.entries(prefs)) out[`cartworth:v1:pref:${k}`] = JSON.stringify(v);
  return out;
}

/** Open the app at `hash` with `storage` already in place (set on the origin before boot). */
export async function openApp(page, origin, { storage = {}, hash = '#/compare' } = {}) {
  // A same-origin page that is not the app, so storage can be written before the app ever reads it.
  await page.goto(`${origin}/js/theme-boot.js`);
  await page.eval(`localStorage.clear(); ${Object.entries(storage).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('')} true`);
  await page.goto(`${origin}/${hash}`);
}
