// Serves the marketing site the way production serves it, so local preview matches the deploy.
//
// A plain static file server (python -m http.server, `npx serve`) ignores site/_redirects, so
// /privacy, /terms, /support and /app/ all 404 locally even though they work once deployed. That
// gap is worse than useless: it makes you chase bugs that do not exist, and hides ones that do.
//
// This reads site/_redirects and applies it, and proxies /app/ to the running web app so the
// "Open the free web app" button actually goes somewhere.
//
//   node scripts/serve-site.js                 # http://localhost:8791
//   PORT=9000 APP_ORIGIN=http://localhost:4799 node scripts/serve-site.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = +process.env.PORT || 8791;
// Where the free web app is running. server.js defaults to 4747; the QA instance uses 4799.
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:4799';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Parse site/_redirects into [{from, to, status}], honouring a single trailing /* wildcard. */
function loadRedirects() {
  const f = path.join(ROOT, '_redirects');
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [from, to, status] = l.split(/\s+/);
      return { from, to, status: +status || 301 };
    })
    .filter((r) => r.from?.startsWith('/') && r.to);
}

const redirects = loadRedirects();

function matchRedirect(pathname) {
  for (const r of redirects) {
    if (r.from.endsWith('/*')) {
      const base = r.from.slice(0, -2);
      if (pathname === base || pathname.startsWith(base + '/')) {
        return { ...r, splat: pathname.slice(base.length + 1) };
      }
    } else if (r.from === pathname) {
      return { ...r, splat: '' };
    }
  }
  return null;
}

function serveFile(res, file, onMiss) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (onMiss) return onMiss();
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

/** Pipe /app/* through to the running web app so the CTA works locally. */
function proxyToApp(req, res, rest) {
  const qs = rest.includes('?') || !req.url.includes('?') ? '' : req.url.slice(req.url.indexOf('?'));
  const target = new URL(rest + qs, APP_ORIGIN);
  const upstream = http.request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Web app not running</title>` +
        `<style>body{font:16px/1.6 system-ui;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#102a1b;background:#f4faf6}` +
        `code{background:#e4f4e9;padding:2px 6px;border-radius:6px}a{color:#15803d}</style>` +
        `<h1>The free web app is not running</h1>` +
        `<p>This page proxies <code>/app/</code> to <code>${APP_ORIGIN}</code>, and nothing is listening there.</p>` +
        `<p>Start it with <code>npm start</code> (port 4747) or the cartworth-qa launch config (port 4799), ` +
        `then set <code>APP_ORIGIN</code> to match.</p>` +
        `<p><a href="/">Back to the site</a></p>`,
    );
  });
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }

    const hit = matchRedirect(pathname);
    if (hit) {
      if (/^https?:/i.test(hit.to)) {
        res.writeHead(hit.status === 200 ? 302 : hit.status, { location: hit.to.replace(':splat', hit.splat) });
        return res.end();
      }
      if (pathname.startsWith('/app')) return proxyToApp(req, res, '/' + hit.splat);
      if (hit.status >= 300 && hit.status < 400) {
        res.writeHead(hit.status, { location: hit.to });
        return res.end();
      }
      pathname = hit.to; // 200 rewrite: serve the target, keep the URL
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    // Extensionless request: try the .html next to it, which is what cleanUrls does.
    if (!path.extname(file) && fs.existsSync(file + '.html')) return serveFile(res, file + '.html');
    // The web app emits absolute asset paths (/app.css, /js/*, /shared/*, /api/*), which resolve
    // against the site root when it is mounted under /app/. Anything the site does not have is
    // therefore the app's, so fall through to it rather than 404ing.
    //
    // In production, prefer giving the web app its own origin (app.cartworth.app) and pointing
    // WEB_APP_URL at it. Serving an app that emits root-absolute paths from a subpath needs a
    // catch-all like this one on the real host too, which is more moving parts than a subdomain.
    serveFile(res, file, () => proxyToApp(req, res, pathname + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
  })
  .listen(PORT, () => {
    console.log(`\n  Cartworth site  http://localhost:${PORT}`);
    console.log(`  ${redirects.length} redirect rule(s) from site/_redirects`);
    console.log(`  /app/ proxies to ${APP_ORIGIN}\n`);
  });
