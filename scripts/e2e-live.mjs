// Live end-to-end journeys through the web app, as a first-time visitor would take them.
//
// Starts a server the way it runs in public, on a fresh data directory, then drives Chromium through
// every tab at a desktop and a phone size: onboarding for a ZIP, a search, the price history, adding
// to the list and the watchlist, the trip plan, the weekly ads, settings, and a reload. It asks real
// retailers (through src/http.js politeness), so run it when nothing else is.
//
// Every console error, page error, failed request (4xx/5xx from our own server) and sideways scroll
// is a failure. Screenshots go to --shots (default: a scratch folder).
//
//   CHROME_PATH=... NODE_USE_ENV_PROXY=1 node scripts/e2e-live.mjs [--zip 60618] [--query milk] [--shots dir]
//   ... node scripts/e2e-live.mjs --url https://app.cartworth.app   (the deployed app; no server started)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ZIP = arg('--zip', '60618');
const QUERY = arg('--query', 'milk');
const SHOTS = arg('--shots', fs.mkdtempSync(path.join(os.tmpdir(), 'cartworth-e2e-')));
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${what}${!cond && detail ? `  — ${detail}` : ''}`);
  if (!cond) failures += 1;
};

async function freePort() {
  return new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
}

const URL_ARG = arg('--url', null);
let server = null;
let serverLog = '';
let base;
if (URL_ARG) {
  base = URL_ARG.replace(/\/$/, '');
} else {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartworth-e2e-data-'));
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', BASKET_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));
  server.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));
  base = `http://127.0.0.1:${port}`;
}
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

// A deployed app is reached the way the rest of this machine reaches the internet: through its proxy.
// Chromium tries HTTP/3 (QUIC) first, which an HTTP proxy cannot carry: every load then ends in
// ERR_TOO_MANY_RETRIES. Through a proxy, pages are also slower, hence the longer default timeout.
const proxy = URL_ARG && (process.env.HTTPS_PROXY || process.env.https_proxy);
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, ...(proxy ? { proxy: { server: proxy }, args: ['--disable-quic'] } : {}) });

// Behind this machine's proxy Chromium's own connections fail at random (ERR_TOO_MANY_RETRIES on a
// different file each run) while Node's go through. So with --url behind a proxy, the browser hands
// every request to Node's fetch and is given back exactly what the server answered.
async function viaNode(context) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const headers = { ...req.headers() };
    for (const h of ['host', 'connection', 'content-length', 'accept-encoding']) delete headers[h];
    try {
      const r = await fetch(req.url(), { method: req.method(), headers, body: req.postDataBuffer() ?? undefined, redirect: 'manual' });
      const out = Object.fromEntries(r.headers);
      delete out['content-encoding']; delete out['content-length']; delete out['transfer-encoding'];
      await route.fulfill({ status: r.status, headers: out, body: Buffer.from(await r.arrayBuffer()) });
    } catch {
      await route.abort('failed').catch(() => {});
    }
  });
}

async function journey(label, viewport, { isMobile = false } = {}) {
  console.log(`\n${label} (${viewport.width}x${viewport.height})`);
  // --insecure: product images come from retailer CDNs, and a network that re-signs HTTPS (a proxy
  // with its own CA, as in a cloud sandbox) makes each one a certificate error that is not the app's.
  const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 3 : 1, ignoreHTTPSErrors: argv.includes('--insecure') });
  if (URL_ARG) context.setDefaultTimeout(90_000);
  if (proxy) await viaNode(context);
  const page = await context.newPage();
  const problems = [];
  const thirdParty = new Set();
  // "Failed to load resource" is the browser's echo of a failed request; those are judged below by
  // whose they are. Our own server's failures fail the run; a retailer image host's are reported.
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (!r.url().startsWith(base) && r.status() >= 400) thirdParty.add(`${r.status()} ${new URL(r.url()).host}`); });
  page.on('requestfailed', (r) => { if (!r.url().startsWith(base)) thirdParty.add(`${r.failure()?.errorText} ${new URL(r.url()).host}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(`${r.status()} ${r.url().replace(base, '')}`); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(base) && !/aborted|ERR_ABORTED/i.test(r.failure()?.errorText || '')) problems.push(`failed ${r.url().replace(base, '')}: ${r.failure()?.errorText}`); });
  const shot = async (name) => page.screenshot({ path: path.join(SHOTS, `${label.replace(/\W+/g, '-')}-${name}.png`), fullPage: true });
  const noSideScroll = async (where) => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(w[0] <= w[1] + 1, `${where}: no sideways scroll`, `${w[0]} > ${w[1]}`);
  };
  const t = (ms) => ({ timeout: ms });

  try {
    await page.goto(base);
    await page.getByLabel('Your ZIP code').fill(ZIP);
    await page.getByRole('button', { name: 'Find my stores' }).click();
    const t0 = Date.now();
    await page.getByRole('button', { name: /Start comparing/ }).waitFor(t(20_000));
    await page.waitForFunction(() => /found \d+ stores?/.test(document.querySelector('.onboard')?.innerText || ''), null, t(180_000));
    const found = await page.locator('.onboard').innerText();
    ok(/found [1-9]\d* stores?/.test(found), `onboarding found stores near ${ZIP} (${Math.round((Date.now() - t0) / 1000)}s)`, found.slice(0, 160));
    await noSideScroll('onboarding');
    await shot('1-onboarding');
    await page.getByRole('button', { name: /Start comparing/ }).click();

    await page.getByLabel('Search for a food item').fill(QUERY);
    await page.getByLabel('Search for a food item').press('Enter');
    const t1 = Date.now();
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Add to list"]').length > 0, null, t(120_000));
    // Let the slower stores finish: the headline stops saying "so far".
    await page.waitForFunction(() => !!document.querySelector('.hero-best') && !/so far/i.test(document.querySelector('.hero-best').innerText), null, t(180_000))
      .catch(() => ok(false, 'every store answered within 3 minutes'));
    const body = await page.locator('main').innerText();
    ok(/best/i.test(body), `search "${QUERY}" shows a best price (${Math.round((Date.now() - t1) / 1000)}s)`);
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.plist > *')].filter((r) => r.querySelector('[aria-label="Add to list"]') && !/\b(shelf|instacart|national)\b/i.test(r.innerText)).length);
    ok(unlabelled === 0, 'every price says where it came from', `${unlabelled} rows unlabelled`);
    ok(/shelf price|instacart\) price|national price/i.test(await page.locator('.hero-best').innerText()), 'the best price says where it came from');
    await noSideScroll('compare');
    await shot('2-compare');

    await page.getByLabel('Price history').first().click();
    await page.locator('[role="dialog"]').first().waitFor(t(10_000));
    ok(true, 'price history opens');
    await shot('3-history');
    await page.keyboard.press('Escape');
    await page.locator('[role="dialog"]').first().waitFor({ state: 'detached', timeout: 5_000 }).catch(() => ok(false, 'Escape closes the dialog'));

    await page.getByLabel('Add to list').first().click();
    await page.getByLabel('Watch this product').first().click();

    await page.goto(`${base}/#/list`);
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Remove"]').length > 0, null, t(10_000));
    ok((await page.getByLabel('Remove').count()) >= 1, 'the item is on the list');
    const planBtn = page.locator('main .btn-primary').first();
    if (await planBtn.isEnabled()) {
      await planBtn.click();
      await page.waitForFunction(() => /\$\d/.test(document.querySelector('main')?.innerText || ''), null, t(120_000)).catch(() => {});
      ok(/\$\d/.test(await page.locator('main').innerText()), 'the trip plan prices the list');
    }
    await noSideScroll('list');
    await shot('4-list');

    await page.goto(`${base}/#/watch`);
    await page.waitForTimeout(1500);
    ok((await page.getByLabel('Edit').count()) >= 1, 'the watch is on the watchlist');
    await noSideScroll('watchlist');
    await shot('5-watch');

    await page.goto(`${base}/#/sales`);
    await page.waitForFunction(() => /\$\d|No deals|no weekly ad/i.test(document.querySelector('main')?.innerText || ''), null, t(120_000)).catch(() => {});
    ok(/\$\d/.test(await page.locator('main').innerText()), 'weekly-ad deals load');
    await noSideScroll('sales');
    await shot('6-sales');

    await page.goto(`${base}/#/settings`);
    await page.waitForTimeout(1000);
    ok(/Delete everything/.test(await page.locator('main').innerText()), 'settings render');
    await noSideScroll('settings');
    await shot('7-settings');

    await page.reload();
    await page.goto(`${base}/#/list`);
    await page.waitForTimeout(1500);
    ok((await page.getByLabel('Remove').count()) >= 1, 'the list survives a reload');
  } catch (err) {
    ok(false, `${label} journey ran to the end`, err.message.split('\n')[0]);
    await shot('error').catch(() => {});
  }
  ok(problems.length === 0, 'no console errors, page errors or failed requests', problems.slice(0, 6).join(' | '));
  if (thirdParty.size) console.log(`  info  third-party loads that failed (retailer images; the app shows a placeholder): ${[...thirdParty].slice(0, 6).join(', ')}`);
  await context.close();
}

await journey('Desktop', { width: 1280, height: 800 });
await journey('iPhone', { width: 390, height: 844 }, { isMobile: true });

await browser.close();
if (server) {
  server.kill('SIGTERM');
  await new Promise((r) => server.on('exit', r));
}
if (failures) console.log(`\nserver log:\n${serverLog.slice(-3000)}`);
console.log(`\nscreenshots: ${SHOTS}`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall journeys passed');
process.exit(failures ? 1 : 0);
