// QA: adversarial accessibility tests for the marketing site (site/*.html, site/styles.css).
//
// Every test here asserts the CORRECT behavior. Tests labelled "DEFECT" are
// reproductions of real findings and are expected to FAIL until the site is fixed.
// Tests labelled "GUARD" already pass and exist to stop a regression.
//
// Only statically-checkable things live here. The behavioural findings (skip link
// does not move focus, focus-ring rendering, 320px reflow) were verified in a real
// browser and are recorded in the audit report, not here.
//
// Run: BASKET_DATA_DIR=/tmp/cartworth-web-a11y node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PAGES = ['index.html', 'privacy.html', 'terms.html', 'support.html'];
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const css = read('styles.css');

// ---------------------------------------------------------------------------
// contrast maths (WCAG 2.x relative luminance)
// ---------------------------------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

/** Pull a custom property out of a :root-ish block so the tests track styles.css. */
function token(name, { dark = false } = {}) {
  const block = dark
    ? css.slice(css.indexOf('@media (prefers-color-scheme: dark)'))
    : css.slice(css.indexOf(':root {'));
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `token ${name} not found (${dark ? 'dark' : 'light'})`);
  return m[1].toLowerCase();
}

test('GUARD: the palette tokens the rest of this file relies on are unchanged', () => {
  // Updated after the contrast fixes below landed. --accent-soft and --surface-2 were lightened
  // so that the accent-on-tint PAIR itself clears 4.5:1 (it was 4.40:1), rather than relying on
  // one rule happening to use the darker accent. --line-strong was darkened from #b6d2c1, which
  // measured 1.53:1 against the page and could not act as a control boundary at all.
  assert.equal(token('--accent'), '#15803d');
  assert.equal(token('--accent-soft'), '#eef9f1');
  assert.equal(token('--surface-2'), '#eef7f0');
  assert.equal(token('--line-strong'), '#5f8a72');
  assert.equal(token('--accent', { dark: true }), '#4ade80');
});

// ---------------------------------------------------------------------------
// DEFECT 1: the green-on-green button hover state fails AA in the light theme.
// `.btn:hover` sets `color: var(--accent)`; the backgrounds it lands on are
// --accent-soft (.btn:hover) and --surface-2 (.btn-soon:hover, which overrides
// only the background). Both land just under 4.5:1.
// --accent-strong (#0f7a3d) clears it at 4.76:1 on --accent-soft.
// ---------------------------------------------------------------------------
test('DEFECT 1a: .btn:hover label reaches 4.5:1 (--accent on --accent-soft, light)', () => {
  const r = contrast(token('--accent'), token('--accent-soft'));
  assert.ok(r >= 4.5, `${r.toFixed(2)}:1 — 15px/620 body text needs 4.5:1`);
});

test('DEFECT 1b: .btn-soon:hover label reaches 4.5:1 (--accent on --surface-2, light)', () => {
  const r = contrast(token('--accent'), token('--surface-2'));
  assert.ok(r >= 4.5, `${r.toFixed(2)}:1 — .btn-soon:hover overrides only the background`);
});

test('GUARD: the same two hover pairs are comfortable in the dark theme', () => {
  assert.ok(contrast(token('--accent', { dark: true }), token('--accent-soft', { dark: true })) >= 4.5);
  assert.ok(contrast(token('--accent', { dark: true }), token('--surface-2', { dark: true })) >= 4.5);
});

// ---------------------------------------------------------------------------
// DEFECT 2: button boundaries fail 1.4.11 Non-text Contrast (3:1).
// A secondary .btn and the dashed .btn-soon are identifiable as controls only by
// their border, and those borders are near-invisible against their own fill.
// ---------------------------------------------------------------------------
test('DEFECT 2a: .btn-soon dashed border reaches 3:1 against its own fill', () => {
  const r = contrast(token('--line-strong'), token('--surface-2'));
  assert.ok(r >= 3, `${r.toFixed(2)}:1 — the control boundary must clear 3:1 (WCAG 1.4.11)`);
});

test('DEFECT 2b: .btn-soon dashed border reaches 3:1 against the page around it', () => {
  const r = contrast(token('--line-strong'), token('--page'));
  assert.ok(r >= 3, `${r.toFixed(2)}:1`);
});

test('DEFECT 2c: the same borders fail in the dark theme too', () => {
  const r = contrast(token('--line-strong', { dark: true }), token('--surface-2', { dark: true }));
  assert.ok(r >= 3, `${r.toFixed(2)}:1`);
});

// ---------------------------------------------------------------------------
// DEFECT 3: the skip link has nothing focusable to skip to.
// <main id="main"> takes no focus without tabindex="-1", so activating
// "Skip to content" leaves the tab sequence in the header.
// ---------------------------------------------------------------------------
for (const page of PAGES) {
  test(`DEFECT 3 (${page}): #main carries tabindex="-1" so the skip link can land on it`, () => {
    const html = read(page);
    assert.match(html, /<a class="skip" href="#main">/, 'skip link present');
    const main = html.match(/<main[^>]*>/)[0];
    assert.match(main, /tabindex="-1"/, `<main> is "${main}" — not focusable, so the skip link is a no-op`);
  });
}

// ---------------------------------------------------------------------------
// DEFECT 4: no aria-current anywhere. Every page's footer nav links to itself.
// ---------------------------------------------------------------------------
for (const page of ['privacy.html', 'terms.html', 'support.html']) {
  test(`DEFECT 4 (${page}): the footer nav marks the current page with aria-current`, () => {
    const html = read(page);
    // Match either href form. Internal links now use the canonical, extensionless URL
    // (/privacy) that the canonical tag, the sitemap and the iOS app all use, rather than
    // privacy.html — which on Vercel cleanUrls costs a 301 on every click and on Netlify
    // leaves the same page reachable at two URLs. What this test is really about is the
    // aria-current, so it should not care which of the two spellings the href uses.
    const slug = page.replace(/\.html$/, '');
    const selfLink = new RegExp(`<a href="(?:/${slug}|${page})"[^>]*>`);
    const m = html.match(selfLink);
    assert.ok(m, `expected a footer link to /${slug} or ${page}`);
    assert.match(m[0], /aria-current="page"/, `self-link is ${m[0]}`);
  });
}

// ---------------------------------------------------------------------------
// DEFECT 5: inline onerror handlers are blocked by the site's own CSP.
// _headers / netlify.toml / vercel.json all ship `script-src 'self'` with no
// 'unsafe-inline' or 'unsafe-hashes', and both files claim in a comment that the
// pages carry no inline event handlers. index.html has four.
// ---------------------------------------------------------------------------
test("DEFECT 5: no inline event handlers, because the CSP is script-src 'self'", () => {
  const scriptSrc = read('_headers').match(/script-src ([^;]+);/)[1];
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-hashes/, `script-src is "${scriptSrc}"`);
  for (const page of PAGES) {
    const hits = [...read(page).matchAll(/\son(error|click|load|change|submit)=/g)];
    assert.equal(hits.length, 0, `${page} has ${hits.length} inline handler(s); the CSP blocks them in production`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 6: every image asset the site references is missing from site/img/.
// Four <img> tags, the og:image on all four pages, the apple-touch-icon and the
// Organization logo in the JSON-LD all 404.
// ---------------------------------------------------------------------------
test('DEFECT 6: every referenced image file exists on disk', () => {
  const missing = new Set();
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/(?:https:\/\/cartworth\.app\/)?(img\/[A-Za-z0-9._-]+\.(?:png|jpg|webp|svg))/g)) {
      if (!fs.existsSync(path.join(SITE, m[1]))) missing.add(m[1]);
    }
  }
  assert.deepEqual([...missing].sort(), [], `missing assets: ${[...missing].sort().join(', ')}`);
});

// ---------------------------------------------------------------------------
// DEFECT 7: the hero radial gradient never paints.
// `at 18% -10%` resolves the -10% against the BODY's padding box, which is the
// full document height (9780px on index at 1280 wide), so the gradient's centre
// sits ~978px above the page and its 70% stop is reached ~614px above it.
// It needs a background-size that does not scale with document length.
// ---------------------------------------------------------------------------
test('DEFECT 7: the hero gradient is anchored to something other than body height', () => {
  const body = css.slice(css.indexOf('body {'), css.indexOf('body {') + 700);
  assert.match(body, /radial-gradient/, 'the hero wash is still a body background-image');
  const usesPercentY = /radial-gradient\([^)]*at\s+[\d.]+%\s+-?[\d.]+%/.test(body);
  const hasSize = /background-size:/.test(body);
  assert.ok(
    !usesPercentY || hasSize,
    'the vertical offset is a percentage of the body box with no background-size, so the wash lands above the document and never renders',
  );
});

// ---------------------------------------------------------------------------
// Structural guards that already pass.
// ---------------------------------------------------------------------------
for (const page of PAGES) {
  test(`GUARD (${page}): one h1, no skipped heading levels, lang set, unique title`, () => {
    const html = read(page);
    assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1, 'exactly one h1');
    assert.match(html, /<html lang="[a-z]{2}(-[A-Z]{2})?">/, 'lang attribute');

    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
    let prev = 0;
    for (const lvl of levels) {
      if (prev) assert.ok(lvl <= prev + 1, `heading jumps h${prev} -> h${lvl}`);
      prev = lvl;
    }
  });
}

test('GUARD: page titles are unique and descriptive', () => {
  const titles = PAGES.map((p) => read(p).match(/<title>(.*?)<\/title>/)[1]);
  assert.equal(new Set(titles).size, titles.length, `duplicate titles: ${titles.join(' | ')}`);
  for (const t of titles) assert.ok(t.length > 10 && t.length < 70, `title length ${t.length}: "${t}"`);
});

test('GUARD: the legal pages stay navigable by heading (every TOC target exists)', () => {
  for (const page of ['privacy.html', 'terms.html']) {
    const html = read(page);
    const toc = html.slice(html.indexOf('class="toc"'), html.indexOf('</nav>', html.indexOf('class="toc"')));
    const targets = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(targets.length >= 10, `${page}: only ${targets.length} TOC entries`);
    for (const id of targets) assert.ok(html.includes(`id="${id}"`), `${page}: TOC points at missing #${id}`);
  }
});

test('GUARD: every decorative svg is hidden from assistive tech', () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const m of html.matchAll(/<(?:span|svg)[^>]*class="(?:icon-tile|brand-mark)"[^>]*>/g))
      assert.match(m[0], /aria-hidden="true"/, `${page}: ${m[0].slice(0, 60)}`);
  }
});

test('GUARD: reduced motion neutralises every transition and animation', () => {
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(block, /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(block, /scroll-behavior:\s*auto/);
  assert.equal([...css.matchAll(/@keyframes/g)].length, 0, 'a new @keyframes needs an iteration-count reset too');
});
