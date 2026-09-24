// QA: adversarial accessibility + honesty tests for the APP itself (public/*).
//
// Companion to qa-site-a11y.test.js, which covers the marketing site. Same rules: every test
// asserts the CORRECT behavior, "DEFECT n" reproduces a real finding from the Thanksgiving sweep
// across Chicago, Lombard, Milwaukee and Kenosha, and "control" pins the neighbouring case.
//
// Only statically-checkable things live here: contrast maths over the shipped tokens, and the
// shape of the stylesheet. Behaviour is tested in a real browser in qa-app-behaviour.test.js —
// the modal focus trap, route titles, the trip footnote, reflow at 320px and the rest. Several
// tests below are still source greps (DEFECT 13, 14, 16, 17, 19, 35, 2, 4, 29, 24, 7); a grep
// proves a string exists, not that it runs, so treat them as tripwires rather than coverage.
//
// Run: BASKET_DATA_DIR=/tmp/cartworth-qa node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');
const css = read('app.css');
const compareJs = read('js/views/compare.js');
const listJs = read('js/views/list.js');
const settingsJs = read('js/views/settings.js');
const chartsJs = read('js/charts.js');
const mainJs = read('js/main.js');

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
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
};
/** Composite a foreground over a background at `alpha`, the way CSS opacity does. */
const over = (fg, bg, alpha) => {
  const f = hexToRgb(fg).map((c) => c * 255);
  const b = hexToRgb(bg).map((c) => c * 255);
  const m = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${m.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** Read a token out of the light :root block or one of the two identical dark blocks. */
function token(name, { dark = false } = {}) {
  const block = dark ? css.slice(css.indexOf(":root[data-theme='dark']")) : css.slice(css.indexOf(':root {'));
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(m, `token --${name} not found (${dark ? 'dark' : 'light'})`);
  return m[1].trim();
}

test('GUARD: the tokens the rest of this file relies on are still hex values', () => {
  for (const n of ['surface', 'surface-2', 'ink-2', 'muted', 'bar', 'bar-best', 'control-edge', 'switch-off', 'good'])
    for (const dark of [false, true]) {
      // --good is only defined in the light block; the dark blocks inherit it.
      if (n === 'good' && dark) continue;
      assert.match(token(n, { dark }), /^#[0-9a-f]{6}$/i, `--${n} ${dark ? 'dark' : 'light'}`);
    }
});

// ---------------------------------------------------------------------------
// DEFECT 20: the price bars are the graphical object that carries the whole
// comparison, and in light mode they sat at 2.06:1 against the card.
// ---------------------------------------------------------------------------
for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light';
  test(`DEFECT 20: the ordinary price bar clears 3:1 against the card (${theme})`, () => {
    const r = contrast(token('bar', { dark }), token('surface', { dark }));
    assert.ok(r >= 3, `--bar is ${r}:1 against --surface`);
  });
  test(`DEFECT 20b: the winning bar is distinguishable from the rest (${theme})`, () => {
    const r = contrast(token('bar-best', { dark }), token('bar', { dark }));
    assert.ok(r >= 3, `--bar-best is only ${r}:1 against --bar`);
  });
}

// ---------------------------------------------------------------------------
// DEFECT 21: the count inside every filter chip was 3.63:1 — the only text
// contrast failure in the app's default state.
// ---------------------------------------------------------------------------
test('DEFECT 21: the chip count badge clears 4.5:1 at its 11.5px size, both themes', () => {
  const m = css.match(/\.chip \.n \{[\s\S]*?opacity:\s*([\d.]+);/);
  assert.ok(m, '.chip .n opacity rule not found');
  const alpha = +m[1];
  for (const dark of [false, true]) {
    const r = contrast(over(token('ink-2', { dark }), token('surface', { dark }), alpha), token('surface', { dark }));
    assert.ok(r >= 4.5, `${dark ? 'dark' : 'light'}: ${r}:1 at opacity ${alpha}`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 11: dimming a whole result row with opacity pushed nine text styles on
// it below AA, on rows that stay fully interactive.
// ---------------------------------------------------------------------------
test('DEFECT 11: a weak result row is not faded with opacity', () => {
  const m = css.match(/\.prow\.dim \{([\s\S]*?)\}/);
  assert.ok(m, '.prow.dim rule not found');
  assert.ok(!/opacity/.test(m[1]), `.prow.dim still sets opacity: ${m[1].trim()}`);
});

test('DEFECT 11b: a weak row says so in words, not by appearance alone (SC 1.4.1)', () => {
  assert.match(compareJs, /weak match/, 'no "weak match" text on the row');
});

// ---------------------------------------------------------------------------
// DEFECT 18 / 22: component state carried by a colour change too small to see.
// ---------------------------------------------------------------------------
test('DEFECT 18: the switch knob clears 3:1 against BOTH tracks (position is the state cue)', () => {
  const knob = '#ffffff';
  for (const dark of [false, true]) {
    const off = contrast(knob, token('switch-off', { dark }));
    const on = contrast(knob, token('good'));
    assert.ok(off >= 3, `${dark ? 'dark' : 'light'}: knob vs off track ${off}:1`);
    assert.ok(on >= 3, `${dark ? 'dark' : 'light'}: knob vs on track ${on}:1`);
  }
});

test('DEFECT 18b: the switch has a boundary against the card it sits on', () => {
  assert.match(css, /\.switch span \{[\s\S]*?box-shadow:[^;]*--control-edge/, 'no edge on the switch track');
  for (const dark of [false, true]) {
    const r = contrast(token('control-edge', { dark }), token('surface', { dark }));
    assert.ok(r >= 3, `${dark ? 'dark' : 'light'}: --control-edge is ${r}:1 against --surface`);
  }
});

test('DEFECT 22: the selected segment has an edge >= 3:1 against its own track', () => {
  assert.match(css, /\.seg button\[aria-pressed='true'\] \{[\s\S]*?box-shadow:[^;]*--control-edge/, 'no edge on the selected segment');
  for (const dark of [false, true]) {
    const r = contrast(token('control-edge', { dark }), token('surface-2', { dark }));
    assert.ok(r >= 3, `${dark ? 'dark' : 'light'}: ${r}:1 against the segmented track`);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 32: the inset ring app.css says rescues the pale store slots did not
// reach 3:1 over the one slot the comment actually names.
// ---------------------------------------------------------------------------
test('DEFECT 32: the dot ring reaches 3:1 over the palest store slot (light)', () => {
  const ring = token('dot-ring');
  const m = ring.match(/rgb\(0 0 0 \/ ([\d.]+)\)/);
  assert.ok(m, `--dot-ring is not a black alpha: ${ring}`);
  const worst = token('store-7'); // the Okabe-Ito yellow
  const r = contrast(over('#000000', worst, +m[1]), token('surface'));
  assert.ok(r >= 3, `ring over ${worst} is ${r}:1 at alpha ${m[1]}`);
});

// ---------------------------------------------------------------------------
// DEFECT 15: the CSS cited scripts/check-palette.js as verification of numbers
// the checker never computes for the shipped tokens.
// ---------------------------------------------------------------------------
test('DEFECT 15: the palette comment does not claim check-palette.js verified these tokens', () => {
  const comment = css.slice(css.indexOf('/* Store colours:'), css.indexOf('--dot-ring'));
  assert.ok(!/Verified by scripts\/check-palette\.js/.test(comment), 'still claims the checker verified it');
  assert.match(comment, /5\.8 dE/, 'the dark variant’s real worst case is not stated');
});

// ---------------------------------------------------------------------------
// DEFECT 23: fixed pixel heights and a fixed-px chart label column, so text-only
// enlargement overflowed 50 controls and truncated 4 of 6 store names.
// ---------------------------------------------------------------------------
test('DEFECT 23: controls use min-height so they grow with their text', () => {
  for (const [sel, re] of [
    ['.chip', /\.chip \{[\s\S]*?min-height:/],
    ['.btn', /\.btn \{[\s\S]*?min-height:/],
    ['.seg button', /\.seg button \{[\s\S]*?min-height:/],
  ]) {
    assert.match(css, re, `${sel} still has a fixed height`);
  }
});

test('DEFECT 23b: the chart store-name column is sized in em, not px', () => {
  const m = css.match(/\.bar-row \{[\s\S]*?grid-template-columns:\s*([^;]+);/);
  assert.ok(m, '.bar-row grid not found');
  assert.match(m[1], /em/, `still fixed: ${m[1].trim()}`);
});

// ---------------------------------------------------------------------------
// DEFECT 33: prefers-reduced-motion slowed two loops to 3s and covered nothing
// else, while a search on this project runs for 10-16 seconds.
// ---------------------------------------------------------------------------
test('DEFECT 33: reduced motion stops the looping animations rather than slowing them', () => {
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(!/animation-duration:\s*3s/.test(block.slice(0, 600)), 'still slows the loop to 3s');
  assert.match(block, /animation-iteration-count:\s*1/, 'loops are not stopped');
  assert.match(block, /transition-duration:/, 'transitions are not covered');
});

// ---------------------------------------------------------------------------
// DEFECT 12 / 13 / 14 / 17 / 19 / 34: keyboard and screen-reader defects.
// ---------------------------------------------------------------------------
// DEFECT 12 (the modal traps Tab and makes the page behind it inert) is tested in a real browser
// in qa-app-behaviour.test.js. It used to be a grep for `.inert = true` here, and commenting that
// line out left this file green: a source grep cannot tell a live line from a dead one.

test('DEFECT 13: a polite live region exists to announce search results (SC 4.1.3)', () => {
  assert.match(compareJs, /role="status" aria-live="polite"/, 'no live region in the compare view');
  assert.match(compareJs, /liveMessage/, 'nothing is written into it');
});

test('DEFECT 14: the search box is a real combobox and its options are not tab stops', () => {
  for (const attr of ['role="combobox"', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete'])
    assert.ok(compareJs.includes(attr), `search input is missing ${attr}`);
  const popup = compareJs.slice(compareJs.indexOf('class="suggest"'), compareJs.indexOf('class="suggest"') + 900);
  assert.match(popup, /tabindex="-1"/, 'suggestion options are still in the tab order');
  assert.match(popup, /id=\$\{`search-suggestion-/, 'options have no ids to point aria-activedescendant at');
});

test('DEFECT 17: the brand home link has an accessible name at every viewport', () => {
  assert.match(mainJs, /class="brand" aria-label="Cartworth home"/, 'brand link has no aria-label');
});

test('DEFECT 19: the price bars are real buttons, not focusable listitems', () => {
  assert.ok(!/role="listitem"[\s\S]{0,200}tabindex="0"/.test(chartsJs), 'a listitem is still focusable');
  assert.match(chartsJs, /<button[\s\S]{0,200}class=\$\{`bar-row/, 'the bar row is not a button');
});

test('DEFECT 35: the bar tooltip is bound to focus as well as hover', () => {
  assert.match(chartsJs, /onFocus=\$\{showTip\}/, 'no focus handler on the bar');
  assert.match(chartsJs, /r\.sub \? `\. \$\{r\.sub\}` : ''/, 'the product is not in the accessible name either');
});

// DEFECT 34 (each route titles the tab) moved to qa-app-behaviour.test.js for the same reason:
// the grep found the function whether or not anything called it.

test('DEFECT 16: the compare action row wraps, so 320px needs no horizontal scroll', () => {
  const m = compareJs.match(/<div class="row wrap" style=\$\{\{ marginTop: 12 \}\}>/);
  assert.ok(m, 'the "Checked … / Refresh / Watch / List" row still has flex-wrap: nowrap');
});

// ---------------------------------------------------------------------------
// DEFECT 2 / 10: the trip planner is the screen that hands the shopper a total
// to act on, and it labelled none of its prices.
// ---------------------------------------------------------------------------
test('DEFECT 2: the trip planner labels non-shelf prices the way every other screen does', () => {
  assert.match(listJs, /BASIS_LABEL/, 'the plan view never mentions the price basis');
  assert.match(listJs, /storeBasis\[s\] !== 'shelf'/, 'the matrix columns are not badged');
});

test('DEFECT 2b: the worst basis in a column wins, so a shelf price is never under-caveated', () => {
  const m = listJs.match(/const BASIS_RANK = \{([^}]*)\}/);
  assert.ok(m, 'no basis ranking');
  assert.match(m[1], /national:\s*2/, 'national is not the strongest caveat');
});

// DEFECT 10 (the trip footnote names the online and national stores in THIS plan) moved to
// qa-app-behaviour.test.js, which renders a captured plan and reads the footnote a shopper sees.
// The grep here matched the variable name `onlineStores` even with its clause short-circuited.

// ---------------------------------------------------------------------------
// DEFECT 4: the Show control is a list filter, not a re-computation of the answer.
// ---------------------------------------------------------------------------
test('DEFECT 4: the best-price answer is pinned to real matches whatever Show is set to', () => {
  assert.match(compareJs, /const answerFloor = Math\.max\(threshold, RELEVANT\)/, 'no floor on the answer');
  assert.match(compareJs, /p\.score < answerFloor\) continue/, 'weak rows can still become a store’s best');
});

// ---------------------------------------------------------------------------
// DEFECT 29 / 24 / 7: copy that contradicted itself or blamed the wrong thing.
// ---------------------------------------------------------------------------
test('DEFECT 29: a store note that repeats its basis label is not printed twice', () => {
  assert.match(settingsJs, /function noteAfterLabel/, 'no de-duplication helper');
  assert.ok(!/s\.note\.replace\(\/\\\.\$\/, ''\)\.toLowerCase\(\) !== basisInfo/.test(settingsJs), 'still comparing the whole note for equality');
});

test('DEFECT 24: a total connection failure is not reported as a spelling mistake', () => {
  assert.match(compareJs, /allFailed/, 'the all-stores-failed case is not distinguished');
  const i = compareJs.indexOf('allFailed &&');
  assert.ok(i > 0 && /connection problem, not a spelling one/.test(compareJs.slice(i, i + 600)), 'no connection-specific empty state');
});

test('DEFECT 7: switching every store off records an empty result instead of hanging', () => {
  const actions = read('js/actions.js');
  assert.match(actions, /setState\(\{ locations: \{\} \}\)/, 'loadLocations still returns before setting state');
});

// ---------------------------------------------------------------------------
// DEFECT (W4): the page's own description of the product. Static on purpose: the <title> and
// meta description in index.html are what a search engine, a link preview and a browser tab show
// before any script runs, so the file IS the behaviour.
// ---------------------------------------------------------------------------
test('DEFECT (W4): the app page and package describe a nationwide product, not a Chicagoland one', () => {
  const html = read('index.html');
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  const pkg = JSON.parse(fs.readFileSync(path.join(PUBLIC, '..', 'package.json'), 'utf8')).description || '';
  const LOCAL = /Chicago|Jewel|Mariano|Trader Joe|Whole Foods|Woodman|ALDI/i;
  for (const [what, text] of [['<title>', title], ['meta description', description], ['package.json description', pkg]]) {
    assert.ok(text.length > 20, `${what} is missing`);
    assert.doesNotMatch(text, LOCAL, `${what} still sells a Chicagoland store list: "${text}"`);
  }
  assert.match(description, /any US ZIP|nationwide/i, 'the description does not say where it works');
  assert.match(pkg, /nationwide|any US ZIP/i);
});
