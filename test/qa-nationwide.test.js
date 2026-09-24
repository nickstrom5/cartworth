// QA: the nationwide coverage sweep (Sept 2026). The real nearby-store directory was built for ZIPs
// in all 50 states + DC (a metro, a small town and a rural ZIP each, picked from the Census ZIP
// list), and Flipp's circular list was read for all 153.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainForName } from '../shared/catalog.js';
import { storeForMerchant } from '../shared/stores.js';

// DEFECT: Flipp spells two priced chains differently from the catalog. "Wegman's" advertised into
// 27 sampled ZIPs across NY, PA, NJ, MA, MD, VA, NC, DE and DC, and "FoodCity" into AL, GA and TN;
// neither matched, so their weekly ads never reached the Sales tab (the stores were still priced:
// every in-state chain with a price source is asked regardless of Flipp).
test("DEFECT: Flipp's spellings of Wegmans and Food City are those chains", () => {
  assert.equal(storeForMerchant("Wegman's"), 'wegmans');
  assert.equal(storeForMerchant('FoodCity'), 'foodcity');
});

test('control: the catalog spellings, and chains that merely look alike, stay as they were', () => {
  assert.equal(storeForMerchant('Wegmans'), 'wegmans');
  assert.equal(storeForMerchant('Food City'), 'foodcity');
  assert.equal(chainForName('Seafood City')?.id, 'seafoodcity');
  assert.equal(chainForName('Restaurant Depot'), null);
});
