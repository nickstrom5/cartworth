// Audits the marketing site for the things that actually affect whether a page ranks, renders
// correctly when shared, and is usable by everyone. No dependencies and no network: it reads the
// HTML on disk, so it can run in CI and before deploy.
//
//   node scripts/check-seo.js            # audit site/
//   node scripts/check-seo.js some/dir
//
// Findings are graded:
//   BLOCK  ships broken (a page that cannot be indexed, a dead internal link, invalid JSON-LD)
//   WARN   measurably worse (missing OG image, thin description, no canonical)
//   NOTE   worth a look
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'site');
const findings = [];
const add = (level, file, msg, detail) => findings.push({ level, file, msg, detail });

if (!fs.existsSync(ROOT)) {
  console.error(`No such directory: ${ROOT}`);
  process.exit(1);
}

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const files = walk(ROOT);
const pages = files.filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(ROOT, f);

// ---------- tiny HTML helpers (regex is fine for a static site we control) ----------
const tag = (html, re) => (html.match(re) || [])[1]?.trim();
const all = (html, re) => [...html.matchAll(re)];
// Match the opening quote with a backreference. Using ["'] for BOTH ends truncates any value
// containing an apostrophe, which silently reported a 170-character description as 9 characters.
const attr = (s, name) => (s.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')) || [])[2];
const metaTag = (html, name) =>
  all(html, /<meta\b[^>]*>/gi)
    .map((m) => m[0])
    .find((t) => (attr(t, 'name') || attr(t, 'property') || '').toLowerCase() === name.toLowerCase());
const meta = (html, name) => {
  const t = metaTag(html, name);
  return t ? (attr(t, 'content') || '').trim() : undefined;
};

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------- per-page checks ----------
// Paths a committed deploy config rewrites. Without reading these, every clean URL the iOS app
// links to (/privacy, /terms, /support) looks like a dead link.
const rewrites = [];
{
  const rp = path.join(ROOT, '_redirects');
  if (fs.existsSync(rp)) {
    for (const line of fs.readFileSync(rp, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const from = t.split(/\s+/)[0];
      if (from.startsWith('/')) rewrites.push(from);
    }
  }
  const vj = path.join(ROOT, 'vercel.json');
  if (fs.existsSync(vj)) {
    try {
      // cleanUrls serves /privacy from privacy.html. That is ALREADY covered below by the
      // `target + '.html'` probe, so it needs no rewrite entry. Pushing '/*' here instead made
      // the pattern `^/.*$`, which matches every root-relative href and silently disabled the
      // dead-link check for the whole site: a page linking to /totally-missing passed clean.
      for (const r of JSON.parse(fs.readFileSync(vj, 'utf8')).rewrites || []) {
        if (typeof r?.source === 'string' && r.source.startsWith('/')) rewrites.push(r.source);
      }
    } catch {
      add('BLOCK', 'vercel.json', 'vercel.json does not parse');
    }
  }
}

// A rewrite pattern to a regex. Everything except `*` and a Vercel `(.*)` group is literal, so it
// has to be escaped: an unescaped '.' in "/app/index.html" would match any character.
const rewriteRe = (r) =>
  new RegExp('^' + r.replace(/\(\.\*\)/g, '\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\u0000/g, '.*').replace(/\\\*/g, '.*') + '$');

const seenTitles = new Map();
const seenDescriptions = new Map();

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const f = rel(file);

  // --- indexability ---
  const robotsMeta = meta(html, 'robots') || '';
  if (/noindex/i.test(robotsMeta)) add('BLOCK', f, 'page is marked noindex', robotsMeta);

  if (!/^<!doctype html>/i.test(html.trim())) add('BLOCK', f, 'missing <!doctype html>');
  const lang = attr(tag(html, /(<html[^>]*>)/i) || '', 'lang');
  if (!lang) add('BLOCK', f, '<html> has no lang attribute', 'screen readers cannot pick a voice; hurts i18n signals');

  if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(html)) add('BLOCK', f, 'no viewport meta', 'page will not be mobile-friendly');

  // --- title ---
  const title = tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) add('BLOCK', f, 'no <title>');
  else {
    if (title.length > 60) add('WARN', f, `title is ${title.length} chars, will be truncated in results`, title);
    if (title.length < 15) add('WARN', f, `title is only ${title.length} chars`, title);
    if (seenTitles.has(title)) add('BLOCK', f, 'duplicate <title>', `same as ${seenTitles.get(title)}`);
    else seenTitles.set(title, f);
  }

  // --- description ---
  const desc = meta(html, 'description');
  if (!desc) add('WARN', f, 'no meta description');
  else {
    if (desc.length > 160) add('NOTE', f, `meta description is ${desc.length} chars, will be truncated`);
    if (desc.length < 50) add('WARN', f, `meta description is only ${desc.length} chars`, desc);
    if (seenDescriptions.has(desc)) add('WARN', f, 'duplicate meta description', `same as ${seenDescriptions.get(desc)}`);
    else seenDescriptions.set(desc, f);
  }

  // --- canonical ---
  const canonical = tag(html, /<link[^>]+rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']*)["']/i);
  if (!canonical) add('WARN', f, 'no canonical link');
  else if (!/^https:\/\//i.test(canonical)) add('BLOCK', f, 'canonical is not an absolute https URL', canonical);

  // --- social cards ---
  for (const p of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) {
    if (!meta(html, p)) add(p === 'og:image' ? 'WARN' : 'NOTE', f, `missing ${p}`);
  }
  const ogImage = meta(html, 'og:image');
  if (ogImage && !/^https:\/\//i.test(ogImage)) add('WARN', f, 'og:image must be an absolute URL to render when shared', ogImage);
  if (!meta(html, 'twitter:card')) add('NOTE', f, 'missing twitter:card');

  // --- headings ---
  const h1s = all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  if (h1s.length === 0) add('BLOCK', f, 'no <h1>');
  if (h1s.length > 1) add('WARN', f, `${h1s.length} <h1> elements`, h1s.map((m) => textOf(m[1]).slice(0, 40)).join(' | '));
  const levels = all(html, /<h([1-6])[^>]*>/gi).map((m) => +m[1]);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      add('WARN', f, `heading level jumps from h${levels[i - 1]} to h${levels[i]}`, 'breaks screen-reader navigation');
      break;
    }
  }

  // --- images ---
  for (const m of all(html, /<img\b[^>]*>/gi)) {
    const t = m[0];
    const src = attr(t, 'src') || '(no src)';
    if (attr(t, 'alt') === undefined) add('BLOCK', f, 'img with no alt attribute', src);
    if (!attr(t, 'width') || !attr(t, 'height')) add('WARN', f, 'img without width/height causes layout shift', src);
    if (src && !/^https?:/i.test(src) && !src.startsWith('data:')) {
      const target = path.join(path.dirname(file), src.split('?')[0]);
      if (!fs.existsSync(target)) add('WARN', f, 'img file is missing', src);
    }
  }

  // --- JSON-LD ---
  const blocks = all(html, /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!blocks.length) add('WARN', f, 'no JSON-LD structured data');
  for (const b of blocks) {
    let data;
    try {
      data = JSON.parse(b[1]);
    } catch (err) {
      add('BLOCK', f, 'JSON-LD does not parse', err.message);
      continue;
    }
    // A document may be a single node, an array, or a @graph wrapper whose members carry the
    // types while the wrapper carries only @context. All three are valid.
    const top = Array.isArray(data) ? data : [data];
    const nodes = top.flatMap((n) => (Array.isArray(n?.['@graph']) ? n['@graph'] : [n]));
    if (!top.some((n) => n['@context'])) add('BLOCK', f, 'JSON-LD is missing @context');
    for (const n of nodes) {
      if (!n['@type']) add('BLOCK', f, 'JSON-LD node missing @type', JSON.stringify(n).slice(0, 80));
      // Fabricated ratings are both dishonest and a manual-action risk.
      if (n.aggregateRating || n.review) {
        add('BLOCK', f, `JSON-LD declares ${n.aggregateRating ? 'aggregateRating' : 'review'}`, 'the app has no reviews yet; inventing them risks a Google manual action');
      }
      if (n['@type'] === 'FAQPage') {
        const qs = n.mainEntity || [];
        if (!Array.isArray(qs) || !qs.length) add('WARN', f, 'FAQPage with no questions');
        for (const q of Array.isArray(qs) ? qs : []) {
          const answer = q.acceptedAnswer?.text || '';
          if (!answer) { add('BLOCK', f, 'FAQ question with no acceptedAnswer', q.name); continue; }
          // The answer must actually appear on the page, or it is structured-data spam.
          const plain = textOf(answer).slice(0, 40).toLowerCase();
          if (plain && !textOf(html).toLowerCase().includes(plain)) {
            add('WARN', f, 'FAQ answer is not visible on the page', String(q.name).slice(0, 60));
          }
        }
      }
    }
  }

  // --- internal links ---
  for (const m of all(html, /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|#)/i.test(href)) continue;
    const target = path.join(path.dirname(file), href.split('#')[0].split('?')[0]);
    const ok =
      fs.existsSync(target) ||
      fs.existsSync(target + '.html') ||
      fs.existsSync(path.join(target, 'index.html')) ||
      rewrites.some((r) => rewriteRe(r).test(href.split('#')[0].split('?')[0]));
    if (!ok) add('BLOCK', f, 'internal link target does not exist and no deploy rewrite covers it', href);
    if (!textOf(m[0] || '').trim() && !attr(m[0], 'aria-label')) {
      // link text is outside the match; only flag when the anchor is clearly icon-only
    }
  }
  for (const m of all(html, /<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = textOf(m[1]);
    if (!label && !attr(m[0], 'aria-label') && !/<img/i.test(m[1])) add('WARN', f, 'link with no accessible name', m[0].slice(0, 70));
    if (/^(click here|here|read more|learn more|link)$/i.test(label)) add('NOTE', f, 'vague link text', label);
  }

  // --- content depth ---
  const words = textOf(html).split(/\s+/).filter(Boolean).length;
  if (words < 150) add('WARN', f, `only ${words} words of text`, 'thin pages rank poorly and read as placeholder');

  // --- unfilled placeholders ---
  // App Review opens the Support URL. A page showing "[OWNER: add your email]" is a rejection,
  // and these are easy to miss because they look intentional in the editor.
  for (const m of all(html, /\[(?:OWNER|CONFIRM|TODO|TBD)\b[^\]]*\]/gi)) {
    add('BLOCK', f, 'unconfirmed placeholder', m[0].slice(0, 90));
  }
  for (const m of all(html, /\b(lorem ipsum|TODO|FIXME|XXX)\b/gi)) {
    add('BLOCK', f, 'placeholder text left in the page', m[0]);
  }

  // --- link/redirect config for the paths the iOS app hardcodes ---
  // --- honesty checks, specific to this product ---
  const body = textOf(html).toLowerCase();
  for (const claim of ['guaranteed savings', 'save up to 50%', 'always cheapest', 'lowest price guaranteed']) {
    if (body.includes(claim)) add('BLOCK', f, `unsupportable claim: "${claim}"`, 'prices change without notice; this cannot be guaranteed');
  }
  // Only grocery example prices need the qualifier. Our own subscription prices are fixed and
  // do not vary by location, so a page that only shows those is fine.
  const subscriptionPrices = new Set(['3.99', '19.99', '29.99']);
  const groceryPrices = [...body.matchAll(/\$(\d+\.?\d*)/g)].map((m) => m[1]).filter((v) => !subscriptionPrices.has(v));
  if (groceryPrices.length && !/varies by location|example price|as of |prices change/i.test(body)) {
    add('WARN', f, 'shows a price without an "example / varies by location" qualifier', groceryPrices.slice(0, 4).map((v) => '$' + v).join(', '));
  }
}

// ---------- site-level ----------
const has = (name) => files.some((f) => rel(f) === name);
if (!has('robots.txt')) add('WARN', '(site)', 'no robots.txt');
if (!has('sitemap.xml')) add('WARN', '(site)', 'no sitemap.xml');
if (!has('index.html')) add('BLOCK', '(site)', 'no index.html');

for (const required of ['privacy.html', 'terms.html', 'support.html']) {
  if (!has(required)) add('BLOCK', '(site)', `${required} is missing`, 'the shipping iOS app links to this page from Settings and the paywall');
}

if (has('sitemap.xml')) {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = all(xml, /<loc>([^<]+)<\/loc>/gi).map((m) => m[1]);
  if (!urls.length) add('BLOCK', 'sitemap.xml', 'sitemap lists no URLs');
  for (const u of urls) {
    if (!/^https:\/\//i.test(u)) add('BLOCK', 'sitemap.xml', 'sitemap URL is not absolute https', u);
  }
  const listed = new Set(urls.map((u) => u.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '') || 'index.html'));
  for (const p of pages) {
    const name = rel(p);
    if (!listed.has(name) && !listed.has(name.replace(/\.html$/, ''))) add('NOTE', 'sitemap.xml', `page not in sitemap: ${name}`);
  }
}

if (has('robots.txt')) {
  const txt = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  if (/^\s*Disallow:\s*\/\s*$/im.test(txt)) add('BLOCK', 'robots.txt', 'robots.txt disallows the entire site');
  if (!/sitemap:/i.test(txt)) add('NOTE', 'robots.txt', 'robots.txt does not reference the sitemap');
}

// ---------- report ----------
const order = { BLOCK: 0, WARN: 1, NOTE: 2 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file));
const counts = { BLOCK: 0, WARN: 0, NOTE: 0 };
for (const x of findings) counts[x.level]++;

console.log(`\nAudited ${pages.length} page(s) in ${ROOT}\n`);
let lastFile = null;
for (const x of findings) {
  if (x.file !== lastFile) {
    console.log(`\n  ${x.file}`);
    lastFile = x.file;
  }
  console.log(`    ${x.level.padEnd(5)} ${x.msg}${x.detail ? `\n          ${x.detail}` : ''}`);
}
console.log(`\n${counts.BLOCK} blocking, ${counts.WARN} warnings, ${counts.NOTE} notes\n`);
process.exit(counts.BLOCK > 0 ? 1 : 0);
