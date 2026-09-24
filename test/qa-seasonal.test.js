// QA: the web app's holiday cards. The holidays, starter lists and deal keywords are the phone's
// (ios/App/Services/Seasonal.swift), generated into shared/seasonal.js; this pins the two together
// and checks the calendar rules against published dates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OCCASIONS, TABLES, occasions, featured, easter, whenText } from '../shared/seasonal.js';
import { importPublic } from './helpers/browser-modules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swift = fs.readFileSync(path.join(ROOT, 'ios/App/Services/Seasonal.swift'), 'utf8');

test('the web holidays are the phone holidays: names, blurbs, keywords and lists', () => {
  const re = /Occasion\(id: "([a-z0-9]+)-\\\(y\)", name: "([^"]+)", date: [^\n]*?, symbol: "[^"]+", blurb: "([^"]+)",\s*keywords: \[([^\]]*)\],\s*list: \[([^\]]*)\]\)/g;
  const arr = (x) => [...x.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const fromSwift = [...swift.matchAll(re)].map((m) => ({ id: m[1], name: m[2], blurb: m[3], keywords: arr(m[4]), list: arr(m[5]) }));
  assert.equal(fromSwift.length, 19);
  assert.deepEqual(OCCASIONS.map(({ id, name, blurb, keywords, list }) => ({ id, name, blurb, keywords, list })), fromSwift);
  for (const [key, name] of [['hanukkah', 'hanukkah'], ['diwali', 'diwali'], ['lunarnewyear', 'lunarNewYear'], ['eid', 'eidAlFitr']]) {
    const m = new RegExp(`static let ${name}: \\[Int: \\(Int, Int\\)\\] = \\[([^\\]]*)\\]`).exec(swift);
    const table = Object.fromEntries([...m[1].matchAll(/(\d{4}): \((\d+), (\d+)\)/g)].map((x) => [x[1], [+x[2], +x[3]]]));
    assert.deepEqual(TABLES[key], table, key);
  }
});

const on = (id, y) => occasions(y).find((o) => o.id === `${id}-${y}`)?.date.toDateString();

test('the calendar rules land on the published dates', () => {
  assert.equal(easter(2026).toDateString(), 'Sun Apr 05 2026');
  assert.equal(easter(2027).toDateString(), 'Sun Mar 28 2027');
  assert.equal(on('thanksgiving', 2026), 'Thu Nov 26 2026');
  assert.equal(on('memorial', 2026), 'Mon May 25 2026');
  assert.equal(on('mothers', 2027), 'Sun May 09 2027');
  assert.equal(on('labor', 2027), 'Mon Sep 06 2027');
  assert.equal(on('superbowl', 2027), 'Sun Feb 14 2027');
  assert.equal(on('hanukkah', 2027), 'Fri Dec 24 2027');
});

test('two holidays in one season are both featured, and the wording is right', () => {
  assert.deepEqual(featured(new Date(2027, 11, 10, 12)).map((o) => o.name), ['Hanukkah', 'Christmas']);
  assert.deepEqual(featured(new Date(2026, 11, 26, 12)).map((o) => o.name), ['New Year’s']);
  assert.equal(featured(new Date(2026, 8, 24, 12)).length, 0);
  assert.deepEqual([0, 1, 9].map(whenText), ['is today', 'is tomorrow', 'in 9 days']);
});

test('holiday deals are matched as searches, not by a shared word', async () => {
  const { occasionDeals } = await importPublic('js/views/occasions.js');
  const xmas = occasions(2026).find((o) => o.id === 'christmas-2026');
  const deal = (name, brand = '') => ({ id: name, name, brand });
  const got = occasionDeals(xmas, [deal('Spiral Sliced Half Ham'), deal('Dark Roast Coffee'), deal('Peanut Butter'), deal('Land O Lakes Salted Butter'), deal('Nestle Toll House Semi-Sweet Chocolate Chips')]).map((d) => d.name);
  assert.deepEqual(got, ['Spiral Sliced Half Ham', 'Land O Lakes Salted Butter', 'Nestle Toll House Semi-Sweet Chocolate Chips']);
});
