// QA: the St. Patrick's Day run. Corned beef, cabbage, potatoes, carrots and soda bread, searched
// live at Chicago (60618), plus the calendar: in 2027 daylight saving time starts on Sunday, Mar 14,
// inside the St. Patrick's weekly ad, so a day in that week is 23 hours long and Flipp's offset moves
// from -05:00 to -04:00 mid-ad.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// Nothing here touches the network.
process.env.TZ = 'America/Chicago';
import test from 'node:test';
import assert from 'node:assert/strict';
import { relevance, RELEVANT } from '../shared/match.js';
import { wallClock, calendarDaysUntil } from '../shared/deals.js';
import { importPublic } from './helpers/browser-modules.js';
import { flyerRow } from '../src/adapters/flipp.js';

const { endsLabel, dateRange } = await importPublic('js/format.js');
const score = (q, name) => relevance(q, { name });
const rejects = (q, name) => assert.ok(score(q, name) < RELEVANT, `"${q}" accepted "${name}" at ${score(q, name).toFixed(2)}`);
const matches = (q, name) => assert.ok(score(q, name) >= RELEVANT, `"${q}" rejected "${name}" at ${score(q, name).toFixed(2)}`);

// ---------------------------------------------------------------------------
// DEFECT 1: Woodman's "Food Club Corned Beef Hash" (15 oz can, $2.99) was Chicago's best price for
// corned beef, "3% less than the next-best store": a can of hash against a brisket.
// ---------------------------------------------------------------------------
test('DEFECT 1: corned beef hash is not corned beef', () => {
  rejects('corned beef', 'Food Club Corned Beef Hash');
  rejects('corned beef', 'Hormel Corned Beef Hash, 15 oz');
});

test('control: the brisket, the deli slices and a search for hash itself', () => {
  matches('corned beef', "Mosey's Corned Beef Brisket Point Cut with Spice Packet");
  matches('corned beef', "Boar's Head Corned Beef, Deli Sliced");
  matches('corned beef hash', 'Hormel Corned Beef Hash, 15 oz');
  matches('hash browns', 'Ore-Ida Shredded Hash Browns');
});

// ---------------------------------------------------------------------------
// DEFECT 2: 'baby' was a trap word (for baby food), so the vegetables named baby were refused:
// Baby Carrots, Baby Spinach, Baby Gold Potatoes and Baby Swiss all scored 0.37.
// ---------------------------------------------------------------------------
test('DEFECT 2: baby vegetables are vegetables', () => {
  matches('carrots', 'Baby Carrots 1 lb');
  matches('carrots', 'Bolthouse Farms Baby Cut Carrots');
  matches('spinach', 'Baby Spinach 5 oz');
  matches('potatoes', 'Baby Gold Potatoes');
  matches('swiss cheese', 'Baby Swiss Cheese Slices');
});

test('control: baby food is still not the vegetable, and a search for it still finds it', () => {
  rejects('carrots', 'Gerber Baby Food Carrots Puree');
  rejects('carrots', 'Beech-Nut Naturals Stage 1 Carrots');
  rejects('oatmeal', 'Gerber Baby Cereal Oatmeal');
  matches('baby food', 'Gerber Baby Food Carrots Puree');
  matches('formula', 'Similac Baby Formula');
});

// ---------------------------------------------------------------------------
// DEFECT 3: a doll and a bag of fries answered the boiled-dinner list.
// ---------------------------------------------------------------------------
test('DEFECT 3: a Cabbage Patch doll is not cabbage, and frozen fries are not russet potatoes', () => {
  rejects('cabbage', 'Cabbage Patch Kids Doll');
  rejects('russet potatoes', 'Ore-Ida Russet Potato Fries');
});

test('control: cabbages, potatoes, fries and Dolly Madison still find themselves', () => {
  for (const n of ['Green Cabbage', 'Red Cabbage', 'Napa Cabbage']) matches('cabbage', n);
  matches('russet potatoes', 'Russet Potatoes 5 lb bag');
  matches('french fries', 'Ore-Ida Golden Crinkles French Fries');
  matches('cupcakes', 'Dolly Madison Cupcakes');
  matches('irish soda bread', 'Irish Soda Bread with Raisins');
  matches('irish butter', 'Kerrygold Pure Irish Butter');
  rejects('irish butter', 'Baileys Original Irish Cream Coffee Creamer');
});

// ---------------------------------------------------------------------------
// The calendar: the 2027 St. Patrick's ad runs Wed Mar 10 - Tue Mar 16... and across the DST change.
// ---------------------------------------------------------------------------
function at(local, fn) {
  const t = new Date(local).getTime();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }
  globalThis.Date = FakeDate;
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

test('control: an ad across the DST change keeps its printed days and counts days, not hours', () => {
  // Flipp sends the start in EST and the end in EDT.
  const ad = flyerRow({ id: 1, merchant: "Mariano's", name: 'Weekly Ad', valid_from: '2027-03-10T00:00:00-05:00', valid_to: '2027-03-17T23:59:59-04:00' });
  assert.equal(dateRange(ad.validFrom, ad.validTo), 'Mar 10 – Mar 17');
  at('2027-03-13T23:30:00', () => assert.equal(calendarDaysUntil(Date.parse('2027-03-14T23:00:00')), 1)); // a 23-hour day
  at('2027-03-16T21:00:00', () => assert.equal(endsLabel(ad.validTo), 'Ends tomorrow'));
  at('2027-03-17T23:00:00', () => assert.equal(endsLabel(ad.validTo), 'Ends today'));
  at('2027-03-18T00:00:30', () => assert.equal(endsLabel(ad.validTo), 'Ended'));
  assert.equal(wallClock('2027-03-14T02:30:00-05:00'), '2027-03-14T02:30:00');
});
