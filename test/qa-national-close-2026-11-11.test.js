// 9 Nov QA (ops/coverage/qa-2026-11-09.md), owner decision 11 Nov: when the cheapest price is a
// chain-wide ('national') listing, "≈ same" was measured against it. A national price carries
// +/-25% (BASIS_SPREAD), so nearly every store came out "≈ same". Now the others are measured
// against the cheapest LOCAL price; that local row is itself "≈ same" as the national winner.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The same cases are in ios/Tests/CoreTests.swift (NationalCloseTests). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { standings, closeAnchor } from '../shared/compare.js';

const side = (storeId, priceBasis, perBase) => ({ product: { storeId, priceBasis }, perBase, est: false });
const verdicts = (stores) => standings(stores).map((r) => `${r.storeId}:${r.verdict}`);

test('DEFECT: a national winner no longer makes every dearer shelf price "≈ same"', () => {
  const v = verdicts({
    walmart: side('walmart', 'national', 1.00),
    aldi: side('aldi', 'shelf', 1.10),
    kroger: side('kroger', 'shelf', 1.20),
    meijer: side('meijer', 'shelf', 1.30),
  });
  // Before: kroger was 'close' too (1.00 * 1.25 >= 1.20); only meijer, over 1.25, was dearer.
  assert.deepEqual(v, ['walmart:best', 'aldi:close', 'kroger:dearer', 'meijer:dearer']);
});

test('control: a local winner is unchanged', () => {
  const v = verdicts({ aldi: side('aldi', 'shelf', 1.0), jewel: side('jewel', 'online', 1.1), kroger: side('kroger', 'shelf', 1.3) });
  assert.deepEqual(v, ['aldi:best', 'jewel:close', 'kroger:dearer']);
});

test('control: when every price is national, the cheapest is still the anchor', () => {
  assert.equal(closeAnchor([{ basis: 'national' }, { basis: 'national' }]), 0);
  assert.equal(closeAnchor([{ priceBasis: 'national' }, { priceBasis: 'online' }]), 1);
  assert.equal(closeAnchor([]), 0);
});

test('control: a second national row is compared with the local anchor', () => {
  const v = verdicts({ walmart: side('walmart', 'national', 1.0), target: side('target', 'national', 1.05), aldi: side('aldi', 'shelf', 1.2) });
  // target 1.05 vs aldi 1.2: 1.2*1.25=1.5 > 1.05*0.75, inside the spread -> close.
  assert.deepEqual(v, ['walmart:best', 'target:close', 'aldi:close']);
});
