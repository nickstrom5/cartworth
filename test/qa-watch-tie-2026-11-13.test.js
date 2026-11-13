// QA 13 Nov 2026: a whole-turkey watch in Chicago headlined Mariano's Instacart 99¢/lb over ALDI's
// 99¢ shelf price. A watch's best store was the first tied store in answer order; the comparison
// screen already broke ties shelf-first (tieBreak). byWatchPrice orders a watch's stores the same
// way, for src/watch.js (the headline) and public/js/views/watch.js (the store list).
import test from 'node:test';
import assert from 'node:assert/strict';
import { byWatchPrice } from '../shared/compare.js';

const row = (id, unitPerBase, priceBasis, est = false) => [id, { unitPerBase, priceBasis, est }];
const order = (rows) => rows.sort(byWatchPrice).map(([id]) => id);

test('DEFECT: at the same unit price a shelf price wins over Instacart and chain-wide listings', () => {
  assert.deepEqual(order([row('marianos', 0.061875, 'online'), row('walmart', 0.061875, 'national'), row('aldi', 0.061875, 'shelf')]), ['aldi', 'marianos', 'walmart']);
});

test('DEFECT: at the same unit price an exact price wins over an estimate', () => {
  assert.deepEqual(order([row('tonys', 0.05, 'shelf', true), row('jewel', 0.05, 'shelf')]), ['jewel', 'tonys']);
});

test('control: a cheaper price still wins whatever its basis', () => {
  assert.equal(order([row('aldi', 0.062, 'shelf'), row('marianos', 0.061, 'online')])[0], 'marianos');
});

test('control: a full tie is decided by store id, not by the order stores answered in', () => {
  assert.deepEqual(order([row('woodmans', 0.05, 'shelf'), row('aldi', 0.05, 'shelf')]), ['aldi', 'woodmans']);
});
