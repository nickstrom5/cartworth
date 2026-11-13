// QA 13 Nov 2026: site axe for / at 390px failed about one full run in three with "serious
// color-contrast" on the App Store button label. appstore.js turns the grey "Coming to the App
// Store" button into the green live one after load; .btn fades its background over 0.14s while the
// label turned white at once, so for that moment the page showed white text on light grey, and axe
// saw it whenever it ran inside the fade. The switch now happens with the transition off.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, launchBrowser } from './helpers/browser.js';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

let server;
let origin;
let browser;
before(async () => {
  if (SKIP) return;
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(SITE, p === '/' ? 'index.html' : p);
    if (!file.startsWith(SITE) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const send = () => {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    };
    // appstore.js arrives late, as on a slow phone: the grey "soon" button is styled and drawn first.
    if (p === '/appstore.js') setTimeout(send, 400); else send();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
});

test('DEFECT: the App Store buttons go live without a background fade (no white-on-grey moment)', { skip: SKIP }, async () => {
  await browser.page.viewport(390, 844);
  // Record every fade running on an App Store button right after the deferred appstore.js has run
  // (DOMContentLoaded follows it). A headless page may not advance a fade, so events are no use.
  const id = await browser.page.initScript(`window.__appstoreFades = [];
    document.addEventListener('DOMContentLoaded', () => {
      for (const el of document.querySelectorAll('[data-appstore]'))
        for (const a of el.getAnimations({ subtree: true })) window.__appstoreFades.push(a.transitionProperty || a.animationName);
    });`);
  try {
    for (let i = 0; i < 3; i++) {
      await browser.page.goto(`${origin}/`, { reload: i > 0 });
      await browser.page.waitFor(`document.readyState === 'complete'`, { what: 'home page loaded' });
      await new Promise((r) => setTimeout(r, 300));
      const state = JSON.parse(await browser.page.eval(`JSON.stringify({
        fades: window.__appstoreFades,
        live: [...document.querySelectorAll('[data-appstore]')].map((el) => el.classList.contains('is-live')),
      })`));
      assert.ok(state.live.length >= 2 && state.live.every(Boolean), `buttons not live: ${JSON.stringify(state.live)}`);
      assert.deepEqual(state.fades, [], 'a transition ran while the button went live');
    }
  } finally {
    await browser.page.removeInitScript(id);
  }
});

test('control: a live App Store button still fades on hover (the .btn transition is restored)', { skip: SKIP }, async () => {
  await browser.page.goto(`${origin}/`);
  await browser.page.waitFor(`document.readyState === 'complete'`, { what: 'home page loaded' });
  const t = await browser.page.eval(`(() => { const el = document.querySelector('[data-appstore].is-live'); return el.style.transition + '|' + getComputedStyle(el).transitionProperty; })()`);
  assert.match(t, /^\|.*background/);
});
