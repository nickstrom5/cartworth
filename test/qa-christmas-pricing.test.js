// QA: the Christmas basket, run live at Chicago (60618) and Milwaukee (53211) on the lists a holiday
// shopper builds: roasts, eggnog, baking, sides. Every DEFECT below was found by reading the live
// "Best price" answers, not by a test failing.
//
// Convention: "DEFECT: …" failed before the fix; "control: …" held before and must keep holding.
// Nothing here touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceLiquid, parseSize } from '../shared/units.js';
import { makeProduct } from '../src/normalize.js';

const item = (storeId, name, sizeText, price, extra = {}) =>
  makeProduct({ storeId, id: `${storeId}-${name}`, name, sizeText, price, ...extra });

// ---------------------------------------------------------------------------
// DEFECT 1: eggnog is a drink, but no liquid word named it, so Woodman's 64 oz carton was compared
// at $1.50 per POUND while cartons labelled "fl oz" were compared per gallon: two answers for one
// shelf, and the cheaper carton could not be ranked against the rest.
// ---------------------------------------------------------------------------
test('DEFECT 1: a carton of eggnog is priced per gallon', () => {
  const p = item('woodmans', 'Southern Comfort Traditional Eggnog', '64 oz', 5.99);
  assert.ok(p.unit.volume, 'eggnog must be in the volume dimension');
  assert.ok(Math.abs(p.unit.volume.perBase * 128 - 11.98) < 0.01, `expected $11.98/gal, got ${p.unit.volume.perBase * 128}`);
  for (const name of ['Borden Egg Nog', 'Promised Land Egg Nog', "Dean's Cultured Lowfat Buttermilk"]) {
    assert.equal(coerceLiquid(parseSize('32 oz'), name).dim, 'volume', name);
  }
});

test('control: eggnog-flavoured solids stay by weight', () => {
  for (const name of ['Eggnog Cookies', 'Eggnog Flavored Candy Corn', 'Eggnog Creamer Powder']) {
    assert.equal(coerceLiquid(parseSize('7 oz'), name).dim, 'weight', name);
  }
});

// ---------------------------------------------------------------------------
// DEFECT 2: holiday decor answered a food search. Walmart's light-up candy cane lawn stakes were
// Chicago's "Best price" for candy canes, at $1.29 a cane — because the real canes were refused:
// 'peppermint' counted as a flavour variant, so "Brach's Peppermint Candy Canes" scored 0.46.
// ---------------------------------------------------------------------------
import { relevance, RELEVANT } from '../shared/match.js';
const score = (q, name) => relevance(q, { name });

test('DEFECT 2: Christmas decorations are not groceries', () => {
  for (const [q, name] of [
    ['candy canes', 'Holiday Time Indoor/Outdoor LED Light-Up Christmas Candy Cane Lawn Stakes - Red & White'],
    ['candy canes', 'Holiday Time Candy Cane Christmas Tree Ornaments, 12 Count'],
    ['gingerbread', 'Gingerbread Man Scented Candle, 14 oz'],
    ['peppermint', 'Peppermint Bark Wreath with Red Bows'],
    ['hot cocoa', "Hot Cocoa Women's Holiday Pajamas"],
  ]) assert.ok(score(q, name) < RELEVANT, `"${q}" accepted "${name}" at ${score(q, name).toFixed(2)}`);
});

test('DEFECT 2: real candy canes are candy canes', () => {
  for (const name of ["Brach's Peppermint Candy Canes, 12 ct", 'Bob\'s Sweet Stripes Peppermint Candy Canes']) {
    assert.ok(score('candy canes', name) >= RELEVANT, `rejected "${name}" at ${score('candy canes', name).toFixed(2)}`);
  }
});

test('control: a flavour the shopper did not ask for is still a variant', () => {
  assert.ok(score('candy canes', 'Cherry Candy Canes') < RELEVANT);
  assert.ok(score('milk', 'Peppermint Milk') < RELEVANT);
});

// DEFECT 3: 'mix' is a trap (cake mix is not flour), so Wilton's "Christmas Sprinkles Mix" scored 0.37
// against sprinkles, and a holiday baker's commonest sprinkles were refused.
test('DEFECT 3: a sprinkles mix is sprinkles', () => {
  assert.ok(score('sprinkles', 'Wilton Christmas Sprinkles Mix') >= RELEVANT);
  assert.ok(score('sprinkles', 'Rainbow Sprinkle Mix') >= RELEVANT);
});

test('control: a cake mix is still not sprinkles, and sprinkles are not a cake mix', () => {
  assert.ok(score('sprinkles', 'Betty Crocker Cake Mix Sprinkles') < RELEVANT);
  assert.ok(score('cake mix', 'Wilton Sprinkle Mix') < RELEVANT);
});

test('control: the Christmas foods that share those words still match', () => {
  for (const [q, name] of [
    ['candy canes', 'Spangler Candy Canes, 12 ct'],
    ['christmas tree cakes', 'Little Debbie Christmas Tree Cakes, 10 ct'],
    ['sprinkles', 'Wilton Christmas Sprinkles Mix'],
    ['sugar cookies', 'Lofthouse Frosted Holiday Sugar Cookies'],
  ]) assert.ok(score(q, name) >= RELEVANT, `"${q}" rejected "${name}" at ${score(q, name).toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// DEFECT 4: Whole Foods' "Spiced Cider Sparkling Water" was Chicago's best price for sparkling
// cider, "63% less than the next-best store": a flavoured seltzer against real cider.
// ---------------------------------------------------------------------------
test('DEFECT 4: a flavoured sparkling water is not the drink it tastes of', () => {
  assert.ok(score('sparkling cider', 'Spiced Cider Sparkling Water 12pk') < RELEVANT);
  assert.ok(score('apple cider', 'Apple Cider Seltzer') < RELEVANT);
});

test('control: sparkling cider, sparkling water and water crackers still match themselves', () => {
  assert.ok(score('sparkling cider', "Martinelli's Sparkling Cider, 25.4 fl oz") >= RELEVANT);
  assert.ok(score('sparkling water', 'LaCroix Sparkling Water Lime') >= RELEVANT);
  assert.ok(score('crackers', "Carr's Table Water Crackers") >= RELEVANT);
});

// ---------------------------------------------------------------------------
// DEFECT 5: 'spray' is a household trap and 'cocktail' an alcohol trap, so the biggest cranberry
// brand never answered a cranberry search: Ocean Spray Jellied Cranberry Sauce scored 0.37 and
// Ocean Spray Cranberry Juice Cocktail 0.15.
// ---------------------------------------------------------------------------
test('DEFECT 5: Ocean Spray is cranberries', () => {
  for (const [q, name] of [
    ['cranberry sauce', 'Ocean Spray Jellied Cranberry Sauce'],
    ['cranberry juice', 'Ocean Spray Cranberry Juice Cocktail'],
    ['cranberries', 'Ocean Spray Fresh Cranberries 12 oz'],
  ]) assert.ok(score(q, name) >= RELEVANT, `"${q}" rejected "${name}" at ${score(q, name).toFixed(2)}`);
});

test('control: an air-freshener spray and a vodka cocktail are still not cranberries', () => {
  assert.ok(score('cranberry sauce', 'Cranberry Scented Room Spray') < RELEVANT);
  assert.ok(score('cranberry juice', 'Cranberry Vodka Cocktail') < RELEVANT);
});
