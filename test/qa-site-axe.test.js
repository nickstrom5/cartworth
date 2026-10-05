// Accessibility: axe-core (test/vendor/axe.min.js) on every page of the marketing site in a real
// browser, at a desktop and a phone size, against WCAG 2.2 A/AA and axe's best practices.
//
// The live-site QA of 5 Oct 2026 found links inside paragraphs on five pages told apart by colour
// alone (link-in-text-block, serious): qa-site-a11y.test.js reads the files, and nothing had opened
// the pages and asked axe. Running text now underlines its links.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, launchBrowser } from './helpers/browser.js';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const AXE = fs.readFileSync(new URL('./vendor/axe.min.js', import.meta.url), 'utf8');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json', '.xml': 'application/xml' };
// Every page the sitemap lists, as the Worker serves them: /privacy is privacy.html, /guides/ is guides/index.html.
const PAGES = [...fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8').matchAll(/<loc>https:\/\/cartworth\.app([^<]*)<\/loc>/g)].map((m) => m[1] || '/');

let server;
let origin;
let browser;
before(async () => {
  if (SKIP) return;
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const candidates = [p, `${p}.html`, path.join(p, 'index.html')].map((c) => path.join(SITE, c));
    const file = candidates.find((c) => c.startsWith(SITE) && fs.existsSync(c) && fs.statSync(c).isFile());
    if (!file) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.join(SITE, '404.html'))); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
});

test('the sitemap lists the site pages this checks', { skip: SKIP }, () => {
  assert.ok(PAGES.length >= 7, `only ${PAGES.length} pages in sitemap.xml`);
});

for (const [w, h] of [[1280, 900], [390, 844]]) {
  for (const page of [...PAGES, '/404']) {
    test(`site axe: ${page} at ${w}px has no WCAG 2.2 AA or best-practice violations`, { skip: SKIP }, async () => {
      await browser.page.viewport(w, h);
      await browser.page.goto(`${origin}${page}`);
      await browser.page.waitFor(`document.readyState === 'complete' && !!document.querySelector('main')`, { what: `${page} loaded` });
      await browser.page.eval(`${AXE}; true`);
      const violations = await browser.page.eval(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })
        .then((r) => r.violations.map((v) => v.impact + ' ' + v.id + ': ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')))`);
      assert.deepEqual(violations, []);
    });
  }
}
