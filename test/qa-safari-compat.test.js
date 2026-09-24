// QA: the web app and the site on older iPhones, iPads and Macs (Safari before 16.2).
//
// color-mix() arrived in Safari 16.2 (iOS 16.2, Dec 2022). Where it is missing, a declaration that
// uses it is dropped whole, so the sticky header and the phone's bottom tab bar had NO background
// and the page scrolled visibly underneath them; the "Best" row and plan highlights vanished too.
// Every color-mix() declaration now follows a plain fallback for the same property.
//
// Convention: "DEFECT: …" failed before the fix. Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const rel of ['public/app.css', 'site/styles.css']) {
  test(`DEFECT: every color-mix() in ${rel} has a fallback for Safari before 16.2`, () => {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    const missing = [];
    lines.forEach((l, i) => {
      const m = /^\s*([\w-]+)\s*:.*color-mix\(/.exec(l);
      if (!m || m[1].startsWith('--')) return;
      const prev = /^\s*([\w-]+)\s*:(.*)$/.exec(lines[i - 1] || '');
      if (!prev || prev[1] !== m[1] || /color-mix\(/.test(prev[2])) missing.push(`${i + 1}: ${l.trim()}`);
    });
    assert.deepEqual(missing, [], 'declarations with no plain fallback on the line before');
  });
}

test('control: the browser code uses no JavaScript newer than Safari 14', () => {
  // Safari 14 is the floor these features were checked against (Sept 2026): ??=, ||= and &&= are 14.
  const newer = /\.at\(|structuredClone|Object\.hasOwn|\.findLast(?:Index)?\(|\.toSorted\(|\.toReversed\(|\.toSpliced\(|Promise\.withResolvers|Object\.groupBy|Map\.groupBy|Array\.fromAsync|AbortSignal\.any|requestIdleCallback/;
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
  const hits = [...files(path.join(ROOT, 'public/js')), ...files(path.join(ROOT, 'shared'))].flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => (newer.test(l) ? `${path.relative(ROOT, f)}:${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(hits, []);
});

// Apple-device QA (Sept 2026), iPhone and iPad sizes in a touch browser:
//  - every field but the main search box was 13-15px, and iOS Safari zooms the page in when a
//    field under 16px is tapped, and leaves it zoomed;
//  - row icons (28x36), list steppers (26x26) and checkboxes (18x18) were under Apple's 44pt;
//  - the search bar dropped its focus outline with nothing in its place.
const css = fs.readFileSync(path.join(ROOT, 'public/app.css'), 'utf8');
const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css)?.[1] || '';

test('DEFECT: on touch screens every field is at least 16px, so tapping it does not zoom the page', () => {
  assert.match(coarse, /input:not\(\[type='checkbox'\]\)[^{]*select,\s*textarea\s*\{[^}]*font-size:\s*16px !important/);
});

test('DEFECT: on touch screens the row icons, steppers and small buttons are 44px', () => {
  for (const sel of ['.qty button', '.pactions .btn', '.btn-icon.btn-sm']) {
    const block = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(coarse)?.[1] || '';
    assert.match(block, /(?:min-)?(?:width|height):\s*44px/, `${sel} is not 44px on touch screens`);
  }
});

test('DEFECT: the search bar shows keyboard focus', () => {
  assert.match(css, /\.searchbar:focus-within\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
});
