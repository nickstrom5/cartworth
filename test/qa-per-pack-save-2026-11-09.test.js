// QA, 9 Nov 2026 (ops/coverage/qa-2026-11-09.md). Rouses' "Chicken Leg Quarters" at $0.58/lb with
// "SAVE $2.19 PER PACK" came from Flipp with original_price 2.77 (the two added) and showed "79% off"
// with "Reg. $2.77"; the 10 lb pack is really $7.99 down to $5.80, 27%. The shrimp, $4.99/lb with
// "SAVE $10.03 PER BAG", read 67% for 33%.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// The same cases are in ios/Tests/CoreTests.swift (PerPackSaveTests). Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toDeal } from '../src/adapters/flipp.js';

const raw = (name, price, post, story, original) => ({ id: 1, flyerId: 2, merchant: 'Rouses Supermarkets', name, price, detail: { pre: 'ONLY', post, story, original, current: price } });

test('DEFECT: a per-pound price with a per-pack saving shows no made-up regular price or percentage', () => {
  for (const r of [raw('Chicken Leg Quarters', 0.58, 'LB', 'SAVE $2.19 PER PACK', 2.77), raw('41/50 Count Headless Local Gulf Brown Shrimp', 4.99, 'LB', 'SAVE $10.03 PER BAG', 15.02)]) {
    const d = toDeal(r, 'rouses', 'Rouses Supermarkets');
    assert.equal(d.regular, null, r.name);
    assert.equal(d.pctOff, null, r.name);
    assert.match(d.priceText, /\/lb$/);
  }
});

test('control: a per-pound saving per pound still shows its percentage', () => {
  const d = toDeal(raw('Boneless Pork Loin', 1.99, 'LB', 'SAVE $1.50 LB', 3.49), 'rouses', 'Rouses Supermarkets');
  assert.equal(d.regular, 3.49);
  assert.equal(d.pctOff, 43);
});

test('control: a per-pack saving on a per-pack price keeps the real percentage', () => {
  const d = toDeal(raw('Shrimp Bag 2 lb', 9.99, null, 'SAVE $5.00 PER BAG', 14.99), 'rouses', 'Rouses Supermarkets');
  assert.equal(d.regular, 14.99);
  assert.equal(d.pctOff, 33);
});
