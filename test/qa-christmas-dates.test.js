// QA: the Christmas run. Weekly ads and sales around Dec 23 – Jan 2, with the clock set to the
// dates a holiday shopper actually uses the Sales tab, in Chicago time.
//
// Found by reading live data, not by a failing test: Whole Foods' page says "Valid 09/23 - 09/29",
// but its data gives the end as 12:00 am ON the 29th. Read as an instant, every Whole Foods sale said
// "Ended" (and the iPhone dropped it) all through its last day. Separately, "Ends today" was counted
// in hours left, so at 11:30 pm on Dec 23 an ad that runs through Christmas Eve said "Ends today".
// And Flipp states every ad in Eastern time, so a Chicago ad for Dec 30 - Jan 5 showed as starting
// Dec 29, and every ad "ended" at 10:59 pm Central (8:59 pm Pacific) on its last day.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// Nothing here touches the network.
process.env.TZ = 'America/Chicago';
import test from 'node:test';
import assert from 'node:assert/strict';
import { importPublic } from './helpers/browser-modules.js';
import { saleDay, calendarDaysUntil, wallClock } from '../shared/deals.js';
import { saleItem, toProduct } from '../src/adapters/wholefoods.js';
import { flyerRow, flyerItemRow } from '../src/adapters/flipp.js';

const { endsLabel, dateRange } = await importPublic('js/format.js');

/** Run fn with Date.now() / new Date() at a Chicago wall-clock time. */
function at(local, fn) {
  const t = new Date(local).getTime(); // no offset: local (Chicago) time
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [t])); }
    static now() { return t; }
  }
  globalThis.Date = FakeDate;
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

// Whole Foods' Christmas-week promotion as the sales page embeds it. In December Chicago is UTC-6,
// so midnight is 06:00Z; in September (UTC-5) the same page sends 05:00Z. Both are covered.
const wfm = (startDate, endDate) => saleItem({ promotionId: 'x', productName: 'Spiral Sliced Ham', salePrice: '$3.99/lb', startDate, endDate }, '10413');

test('DEFECT: a Whole Foods sale is still on during its last day', () => {
  const p = wfm('2026-12-23T06:00:00Z', '2026-12-29T06:00:00Z');
  at('2026-12-29T10:00:00', () => assert.equal(endsLabel(p.validTo), 'Ends today'));
  at('2026-12-28T10:00:00', () => assert.equal(endsLabel(p.validTo), 'Ends tomorrow'));
});

test('DEFECT: Whole Foods dates show the days its own page shows', () => {
  // "Valid 12/23 - 12/29", whether the page encodes midnight Central as 05:00Z or 06:00Z.
  for (const [a, b] of [['2026-12-23T06:00:00Z', '2026-12-29T06:00:00Z'], ['2026-12-23T05:00:00Z', '2026-12-29T05:00:00Z']]) {
    const p = wfm(a, b);
    assert.equal(p.validFrom, '2026-12-23T00:00:00');
    assert.equal(p.validTo, '2026-12-29T23:59:59');
    assert.equal(dateRange(p.validFrom, p.validTo), 'Dec 23 – Dec 29');
  }
  // The September flyer read live from the page during this run.
  assert.equal(wfm('2026-09-23T05:00:00Z', '2026-09-29T05:00:00Z').validTo, '2026-09-29T23:59:59');
});

test('control: a Whole Foods sale is over the morning after its last day', () => {
  const p = wfm('2026-12-23T06:00:00Z', '2026-12-29T06:00:00Z');
  at('2026-12-30T00:30:00', () => assert.equal(endsLabel(p.validTo), 'Ended'));
  assert.equal(saleDay(null), null);
  assert.equal(saleDay('not a date'), null);
});

// Mariano's Christmas-week ad as Flipp sends it: Eastern time, 11:59:59 pm on the last day.
const flyer = (valid_from, valid_to) => flyerRow({ id: 1, merchant: "Mariano's", name: 'Weekly Ad', valid_from, valid_to });
const XMAS_WEEK = flyer('2026-12-18T00:00:00-05:00', '2026-12-24T23:59:59-05:00');
const NEW_YEAR = flyer('2026-12-30T00:00:00-05:00', '2027-01-05T23:59:59-05:00');

test('DEFECT: a Flipp ad shows the days its circular prints, not the day before', () => {
  assert.equal(dateRange(NEW_YEAR.validFrom, NEW_YEAR.validTo), 'Dec 30 – Jan 5');
  assert.equal(dateRange(XMAS_WEEK.validFrom, XMAS_WEEK.validTo), 'Dec 18 – Dec 24');
  const item = flyerItemRow({ id: 2, name: 'Spiral Ham', valid_from: '2026-12-30T00:00:00-05:00', valid_to: '2027-01-05T23:59:59-05:00' });
  assert.equal(dateRange(item.validFrom, item.validTo), 'Dec 30 – Jan 5');
});

test('DEFECT: at 11:15 pm on Christmas Eve, the Christmas ad has not ended yet', () => {
  at('2026-12-24T23:15:00', () => assert.equal(endsLabel(XMAS_WEEK.validTo), 'Ends today'));
});

test('DEFECT: late on Dec 23, an ad that runs through Christmas Eve ends tomorrow', () => {
  at('2026-12-23T23:30:00', () => assert.equal(endsLabel(XMAS_WEEK.validTo), 'Ends tomorrow'));
});

test('control: on Christmas Eve morning it ends today, and on Christmas Day it has ended', () => {
  at('2026-12-24T08:00:00', () => assert.equal(endsLabel(XMAS_WEEK.validTo), 'Ends today'));
  at('2026-12-25T00:01:00', () => assert.equal(endsLabel(XMAS_WEEK.validTo), 'Ended'));
});

test('control: an ad that crosses New Year is dated in the new year', () => {
  at('2026-12-30T12:00:00', () => assert.equal(endsLabel(NEW_YEAR.validTo), 'Ends Tue'));
  at('2026-12-20T12:00:00', () => assert.equal(endsLabel(NEW_YEAR.validTo), 'Thru Jan 5'));
  at('2026-12-31T22:00:00', () => assert.equal(calendarDaysUntil(Date.parse('2027-01-01T10:00:00')), 1));
});

test('control: wallClock keeps dates without a time and refuses what is not a date', () => {
  assert.equal(wallClock('2026-12-24'), '2026-12-24T00:00:00');
  assert.equal(wallClock('2026-12-24T23:59:59Z'), '2026-12-24T23:59:59');
  assert.equal(wallClock(null), null);
  assert.equal(wallClock('Dec 24'), null);
});

// A Whole Foods search record on sale through Christmas Eve, as the search API sends it.
const ham = { name: 'Spiral Sliced Half Ham, 1 LB', regularPrice: 8.99, salePrice: 6.99, saleStartDate: '2026-12-18T00:00:00Z', saleEndDate: '2026-12-24T23:59:59Z', uom: 'each' };
const priceAt = (local) => at(local, () => toProduct(ham, { storeId: 'wholefoods', now: Date.now() }));

test('DEFECT: a Whole Foods sale price is still shown on the evening of its last day', () => {
  const p = priceAt('2026-12-24T19:30:00');
  assert.equal(p.price, 6.99, 'the shelf price on Christmas Eve evening is the sale price');
  assert.equal(p.saleEnds, '2026-12-24T23:59:59');
});

test('control: the day after, the regular price is back', () => {
  assert.equal(priceAt('2026-12-25T09:00:00').price, 8.99);
});

test('control: a missing or unreadable end date gets no label', () => {
  assert.equal(endsLabel(null), null);
  assert.equal(endsLabel('soon'), null);
});
