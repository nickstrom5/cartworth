// Thanksgiving core list, 18 Nov 2026, second pass (Wichita, and every cached answer re-scored).
//
// 1. The ranged-turkey rule of this morning missed the same listing under a name with no range:
//    Dillons' "Butterball All Natural Fresh Bone-In Turkey Breast", stated "6 lb", "each", $2.99, won
//    Wichita's turkey breast at $0.50/lb. Cub's "Festive Frozen Turkey Breast" (4.5 lb, $1.99) had won
//    Minneapolis at $0.44/lb, and Smart & Final's "Turkey Breast Random Cuts" (4 lb, $2.39) Phoenix
//    and Los Angeles at $0.60/lb. A whole bird of 3 lb or more, under $10, that works out below 37c
//    a pound, or a breast below 99c, is a price per pound: less than either has ever sold for.
// 2. In Hartford, C-Town returned 19 turkey breasts stated only as "each" (all $1.09). They outvoted
//    13 per-pound rows from eight stores, so "turkey breast" was compared by count: two stores
//    priced, ALDI's $1.99/lb left out. The dimension now follows the stores when another one prices
//    at least twice as many of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProduct } from '../src/normalize.js';
import { bestPerStore, dominantDim, standings } from '../shared/compare.js';

let seq = 0;
const row = (o) => makeProduct({ storeId: 'x', id: String(++seq), soldBy: 'each', category: 'Turkey Breast', ...o });

test('DEFECT: a whole bird or breast with no range, priced "each" below what the kind sells for, is priced per lb', () => {
  for (const o of [
    { name: 'Butterball All Natural Fresh Bone-In Turkey Breast', sizeText: '6 lb', price: 2.99, url: 'https://www.instacart.com/products/16969820-butterball-whole-fresh-all-natural-with-ribs-back-portion-turkey-breast-1-ea?retailerSlug=dillons' },
    { name: 'Festive Frozen Turkey Breast', sizeText: '4.5 lb', price: 1.99, category: 'Frozen Turkey Breast', url: 'https://www.instacart.com/products/90656871-festive-frozen-turkey-breast-4-5-lb?retailerSlug=cub' },
    { name: 'Double L Ranch Meats Turkey Breast Random Cuts', sizeText: '4 lb', price: 2.39, url: 'https://www.instacart.com/products/19973420-double-l-ranch-meats-turkey-breast-random-cuts-4-lb?retailerSlug=smart-final' },
    { name: 'Shady Brook Farms Turkey Breast', sizeText: '8 lb', price: 1.99, url: 'https://www.instacart.com/products/21832652-shady-brook-farms-turkey-breast-8-lb?retailerSlug=hannaford' },
    { name: 'Butterball Fresh Gluten-free All Natural Premium Young Turkey', sizeText: '10 lb', price: 1.97, category: 'Whole Turkey', url: 'https://www.instacart.com/products/21897001-butterball-fresh-gluten-free-all-natural-premium-young-turkey-10-lb?retailerSlug=walmart' },
    // The same listings one price step up (the review of this change): Smith's has the breast at $3.99.
    { name: 'Butterball All Natural Fresh Bone-In Turkey Breast', sizeText: '6 lb', price: 4.99, url: 'https://www.instacart.com/products/16969820-butterball-whole-fresh-all-natural-with-ribs-back-portion-turkey-breast-1-ea?retailerSlug=smiths' },
    { name: 'Festive Frozen Turkey Breast', sizeText: '4.5 lb', price: 3.49, category: 'Frozen Turkey Breast', url: 'https://www.instacart.com/products/90656871-festive-frozen-turkey-breast-4-5-lb?retailerSlug=cub' },
    { name: 'Butterball Fresh Gluten-free All Natural Premium Young Turkey', sizeText: '10 lb', price: 2.99, category: 'Whole Turkey', url: 'https://www.instacart.com/products/21897001-butterball-fresh-gluten-free-all-natural-premium-young-turkey-10-lb?retailerSlug=walmart' },
  ]) {
    const p = row(o);
    assert.equal(p.sizeConflict?.name, 'priced per lb', o.name);
    assert.equal(p.price, o.price);
    assert.equal(p.unit?.weight, undefined, `${o.name}: no unit price`);
  }
});

test('control: real package prices, parts and pet food stand', () => {
  for (const o of [
    // A package that works out at what the kind does sell for is a price a store can charge:
    // Fry's 14 lb bird at an exact 69c/lb (checked 3 Nov), a 37c/lb doorbuster with its weight on
    // the label, a breast at ALDI's 99c/lb.
    { name: 'Honeysuckle White Frozen Whole Turkey', sizeText: '12 lb', price: 4.44, category: 'Whole Turkey', url: 'https://x/products/8-honeysuckle-white-frozen-whole-turkey-12-lb' },
    { name: 'Kroger Frozen Whole Turkey', sizeText: '14 lb', price: 9.66, category: 'Whole Turkey', url: 'https://x/products/6-kroger-frozen-whole-turkey-14-lb' },
    { name: 'Kirkwood Bone-In Turkey Breast', sizeText: '6 lb', price: 5.94, url: 'https://x/products/7-kirkwood-bone-in-turkey-breast-6-lb' },
    { name: 'Kirkwood USDA Fresh Ground Turkey 85% Lean 15% Fat', sizeText: '48 oz', price: 9.95, category: 'Ground Turkey', url: 'https://www.aldi.us/store/aldi/products/41417088-kirkwood-ground-turkey-3-lb' },
    { name: 'Butterball Boneless Turkey Breast Roast', sizeText: '48 oz', price: 9.99, category: 'Frozen Turkey Breast', url: 'https://x/products/1-butterball-boneless-turkey-breast-roast-48-oz' },
    { name: 'Honeysuckle White Frozen Bone-In Turkey Breast', sizeText: '4.5 lb', price: 8.96, category: 'Frozen Turkey Breast', url: 'https://x/products/2-honeysuckle-white-frozen-bone-in-turkey-breast-4-5-lb' },
    // Franks and drumsticks do sell near a dollar a pound; the store's own unit line settles those.
    { name: 'Stahl-meyer Turkey Frankfurters', sizeText: '48 oz', price: 2.89, category: 'Hot Dogs', url: 'https://x/products/3185308-stahl-meyer-turkey-franks-3-lb' },
    { name: "Tony's Fresh Market Turkey Drumsticks", sizeText: '3.43 lb', price: 3.29, category: 'Turkey Drumstick', url: 'https://x/products/16619025-tony-s-fresh-market-turkey-drumsticks-3-43-lb' },
    { name: 'Hearty Turkey Breast Recipe Dog Food', sizeText: '5 lb', price: 4.49, category: 'Dry Dog Food', url: 'https://x/products/4-hearty-turkey-breast-recipe-dog-food-5-lb' },
    // $10 and up is what a bird costs whole.
    { name: 'Butterball Frozen Whole Turkey', sizeText: '12 lb', price: 11.88, category: 'Frozen Whole Turkey', url: 'https://x/products/5-butterball-frozen-whole-turkey-12-lb' },
  ]) {
    const p = row(o);
    assert.equal(p.sizeConflict, null, o.name);
    assert.ok(p.unit.weight, `${o.name}: priced per lb`);
  }
});

// Hartford, as cached: one store with nothing but "each" rows, eight with prices by the pound.
const hartford = () => {
  const lb = (storeId, name, price, extra = {}) => makeProduct({ storeId, id: String(++seq), name, sizeText: 'per lb', soldBy: 'lb', price, category: 'Turkey Breast', url: `https://x/products/${seq}-turkey-breast-per-lb`, ...extra });
  const pkg = (storeId, name, sizeText, price) => makeProduct({ storeId, id: String(++seq), name, sizeText, soldBy: 'each', price, category: 'Frozen Turkey Breast', url: `https://x/products/${seq}-turkey-breast` });
  const each = (name) => makeProduct({ storeId: 'ctown', id: String(++seq), name, sizeText: 'each', soldBy: 'each', price: 1.09, category: 'Turkey Breast', url: `https://x/products/${seq}-turkey-breast-each` });
  return {
    aldi: [lb('aldi', 'Kirkwood Bone-In Turkey Breasts', 1.99), pkg('aldi', 'Butterball Boneless Turkey Breast Roast', '48 oz', 12.99)],
    keyfood: [lb('keyfood', 'Shady Brook Farms Fresh Turkey Breast', 3.19)],
    stopandshop: [pkg('stopandshop', 'SB Turkey Breast', '1 lb', 7.99)],
    bjs: [lb('bjs', 'Butterball Frozen Turkey Breast', 3.79), pkg('bjs', 'Butterball Boneless Turkey Breast Roast', '76 oz', 25.39)],
    bigy: [pkg('bigy', 'Butterball Frozen Turkey Breast', '1 lb', 3.79), pkg('bigy', 'Butterball Frozen Boneless Turkey Breast Roast with Gravy Packet', '48 oz', 16.49)],
    shoprite: [pkg('shoprite', 'Butterball Frozen Boneless Turkey Breast Roast with Gravy Packet', '48 oz', 17.01)],
    stewleonards: [pkg('stewleonards', 'Butterball Frozen Boneless Turkey Breast Roast with Gravy Packet', '48 oz', 14.99)],
    ctown: ['Fr Turkey Breast', 'Turkey Breast', 'Shady Brook Farms Turkey Breast Family Pack', 'White Turkey Breast', 'Turkey Breast BO', 'Frozen Turkey Breast',
      'Turkey Breast Bone In', 'Fresh Turkey Breast', 'Turkey Breast Thin Sliced', 'Turkey Breast Cutlets', 'Split Turkey Breast', 'Turkey Breast Roast',
      'Boneless Turkey Breast', 'Turkey Breast Tenders', 'Young Turkey Breast', 'Turkey Breast Fillets', 'Skinless Turkey Breast', 'Whole Turkey Breast', 'Turkey Breast Half'].map(each),
  };
};

test('DEFECT: one store with many "each" rows does not turn the comparison away from the other stores', () => {
  const results = hartford();
  const best = bestPerStore('turkey breast', results, { prefs: { cardPrices: true } });
  assert.equal(best.dim, 'weight');
  const rows = standings(best.stores);
  assert.ok(rows.length >= 7, `${rows.length} stores priced`);
  assert.equal(rows[0].storeId, 'aldi');
  assert.equal(best.stores.aldi.item.name, 'Kirkwood Bone-In Turkey Breasts');
});

test('control: the items decide when the stores are close, and for one store alone', () => {
  // Dinner rolls sell both ways: three stores by the roll and two by weight is not twice as many.
  const p = (storeId, dim, n) => Array.from({ length: n }, (_, i) => ({ storeId, key: `${storeId}:${dim}:${i}`, dim, unit: { [dim]: { perBase: 1 + i, est: false } } }));
  const rolls = [...p('a', 'count', 2), ...p('b', 'count', 2), ...p('c', 'weight', 1), ...p('d', 'weight', 1), ...p('e', 'weight', 1), ...p('a', 'count', 4)];
  assert.equal(dominantDim(rolls), 'count');
  // One store's own list is compared the way most of its rows are.
  assert.equal(dominantDim([...p('a', 'count', 5), ...p('a', 'weight', 1)]), 'count');
  // Rows with no store (old fixtures) fall back to the item tally.
  assert.equal(dominantDim([{ dim: 'count', unit: { count: { perBase: 1, est: false } } }, { dim: 'count', unit: { count: { perBase: 2, est: false } } }, { dim: 'weight', unit: { weight: { perBase: 1, est: false } } }]), 'count');
  assert.equal(dominantDim([]), null);
  // Two stores against one is not enough (the review of this change): a shopper with two stores
  // enabled had "pumpkin pie" turned to volume by a wine at one and a protein drink at the other.
  assert.equal(dominantDim([...p('a', 'weight', 5), ...p('b', 'volume', 1), ...p('c', 'volume', 1)]), 'weight');
  assert.equal(dominantDim([...p('a', 'count', 8), ...p('b', 'weight', 1), ...p('c', 'weight', 1)]), 'count');
  // Three against one is.
  assert.equal(dominantDim([...p('a', 'count', 8), ...p('b', 'weight', 1), ...p('c', 'weight', 1), ...p('d', 'weight', 1)]), 'weight');
  // An estimate does not make a store one the dimension prices: per-lb rows carry an estimated "each".
  const est = [{ storeId: 'a', dim: 'weight', unit: { weight: { perBase: 1, est: false }, count: { perBase: 3, est: true } } }, { storeId: 'b', dim: 'weight', unit: { weight: { perBase: 1, est: false }, count: { perBase: 3, est: true } } }];
  assert.equal(dominantDim(est), 'weight');
});
