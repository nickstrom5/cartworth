// QA: the price-history chart's y-axis always labels the data it draws.
//
// A price chart is read for its peak and its trough. Round 1 fixed an axis that stopped below the
// data, and claimed "a gridline always lands at or above the maximum" after checking one series
// by hand. A verifier fuzzed 60,000 series and 11.8% still put the maximum above the top label
// (data 5.46..6.05 drew ticks 5.5 and 6 only). A property that must hold for every input is
// tested over many inputs, so that is what this file does — against the real niceDomain exported
// by public/js/charts.js, called the way LineChart calls it. test/qa-app-behaviour.test.js checks
// the same thing on a chart rendered in a browser, so the wiring is covered as well as the maths.
//
// Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importPublic } from './helpers/browser-modules.js';

const { niceDomain } = await importPublic('js/charts.js');
const { money2, unitPrice, unitPriceStep } = await importPublic('js/format.js');

/** Exactly what LineChart does with a series' values before asking for an axis. */
function axisFor(values, { minStep = 0 } = {}) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const padV = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  return niceDomain(Math.max(0, lo - padV), hi + padV, { count: 4, minStep });
}

/** Seeded, so a failure is reproducible from the printed seed and index. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const NICE = [1, 2, 2.5, 5];
function isNiceStep(step) {
  const exp = Math.floor(Math.log10(step) + 1e-9);
  const m = step / 10 ** exp;
  return NICE.some((n) => Math.abs(m - n) < 1e-6) || Math.abs(m - 10) < 1e-6;
}

function checkAxis(values, axis, where, { cents = false } = {}) {
  const { lo, hi, ticks, step } = axis;
  const min = Math.min(...values);
  const max = Math.max(...values);
  assert.ok(ticks[ticks.length - 1] >= max - 1e-9, `${where}: max ${max} is above the top label ${ticks[ticks.length - 1]} (ticks ${ticks})`);
  assert.ok(ticks[0] <= min + 1e-9, `${where}: min ${min} is below the bottom label ${ticks[0]} (ticks ${ticks})`);
  assert.equal(lo, ticks[0], `${where}: the plotted domain starts at the bottom label`);
  assert.equal(hi, ticks[ticks.length - 1], `${where}: the plotted domain ends at the top label`);
  assert.ok(ticks.length >= 2 && ticks.length <= 5, `${where}: ${ticks.length} labels (${ticks})`);
  assert.ok(isNiceStep(step), `${where}: step ${step} is not 1, 2, 2.5 or 5 x 10^k`);
  for (let i = 1; i < ticks.length; i++) assert.ok(Math.abs(ticks[i] - ticks[i - 1] - step) < 1e-9, `${where}: uneven ticks ${ticks}`);
  if (cents) for (const t of ticks) assert.ok(Math.abs(t * 100 - Math.round(t * 100)) < 1e-6, `${where}: gridline ${t} is not a whole cent, so a $x.xx label would misstate it`);
}

test('DEFECT: the maximum is never above the top label — the series round 1 got wrong', () => {
  for (const v of [[5.46, 6.05], [2.68, 6.01], [13.95, 21.57], [5.37, 12.97], [26.04, 41.09], [1.32, 2.04], [28.46, 35.11], [2.99, 3.85]]) {
    checkAxis(v, axisFor(v), `data ${v}`);
    checkAxis(v, axisFor(v, { minStep: 0.01 }), `data ${v} (money)`, { cents: true });
  }
});

test('DEFECT: the maximum is never above the top label — 100,000 random price series', () => {
  const seed = 20260923;
  const r = rng(seed);
  for (let i = 0; i < 100000; i++) {
    const n = 1 + Math.floor(r() * 12);
    const scale = [0.05, 1, 10, 100, 1000][Math.floor(r() * 5)];
    const base = 0.01 + r() * scale;
    const spread = r() < 0.1 ? 0 : r() * base * (r() < 0.5 ? 0.05 : 1.5);
    const values = Array.from({ length: n }, () => Math.max(0.01, +(base + r() * spread).toFixed(2)));
    const money = i % 2 === 1;
    checkAxis(values, axisFor(values, { minStep: money ? 0.01 : 0 }), `seed ${seed} #${i} ${JSON.stringify(values)}`, { cents: money });
  }
});

test('control: tiny unit prices (fractions of a cent per fl oz) still get a labelled axis', () => {
  const values = [0.0312, 0.0318, 0.0335, 0.0299];
  checkAxis(values, axisFor(values), 'unit prices');
});

test('control: a flat history (one price, many times) is framed, not collapsed', () => {
  for (const v of [[3.99], [3.99, 3.99, 3.99], [0.5, 0.5]]) {
    const a = axisFor(v, { minStep: 0.01 });
    checkAxis(v, a, `flat ${v}`, { cents: true });
    assert.ok(a.hi > a.lo, 'the axis has height');
  }
});

// ---------------------------------------------------------------------------
// The label on a gridline must name the value the gridline is at. Checked with the app's real
// formatters: money2 for the product sheet's price history, unitPrice for the watchlist's
// unit-price history, whose precision changes with magnitude ("$3.05", "45.5¢", "3.25¢").
// ---------------------------------------------------------------------------
/** Read a formatted price back into dollars: "$3.05" -> 3.05, "45.5¢" -> 0.455, "$103" -> 103. */
const readBack = (text) => (text.endsWith('¢') ? Number(text.slice(0, -1)) / 100 : Number(text.replace(/^\$/, '')));

test('DEFECT: a gridline label never states a price the gridline is not at (money, to the cent)', () => {
  // $5.46..$5.55 wants a half-cent step; "$5.48" on a line at $5.475 would be half a cent wrong.
  const r = rng(7);
  for (let i = 0; i < 20000; i++) {
    const base = 0.5 + r() * 40;
    const values = Array.from({ length: 2 + Math.floor(r() * 8) }, () => +(base * (1 + r() * (r() < 0.5 ? 0.02 : 0.6))).toFixed(2));
    const { ticks } = axisFor(values, { minStep: 0.01 });
    for (const t of ticks) assert.ok(Math.abs(readBack(money2(t)) - t) < 1e-9, `#${i} ${JSON.stringify(values)}: gridline ${t} is labelled ${money2(t)}`);
  }
});

test('DEFECT: a gridline label never states a unit price the gridline is not at (watchlist, per lb)', () => {
  const r = rng(11);
  const factor = 16; // display unit lb; LineChart is fed per-lb values and formats them back through unitPrice
  const fmt = (v) => unitPrice(v / factor, 'lb').text;
  for (let i = 0; i < 20000; i++) {
    const base = [0.03, 0.4, 3, 40, 150][Math.floor(r() * 5)] * (0.5 + r());
    const values = Array.from({ length: 2 + Math.floor(r() * 8) }, () => base * (1 + r() * (r() < 0.5 ? 0.03 : 0.8)));
    const axis = axisFor(values, { minStep: unitPriceStep });
    checkAxis(values, axis, `#${i} ${JSON.stringify(values)}`);
    for (const t of axis.ticks) assert.ok(Math.abs(readBack(fmt(t)) - t) < 1e-9, `#${i}: gridline ${t} is labelled ${fmt(t)}`);
  }
});
