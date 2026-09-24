// Hunts for prices that are confidently WRONG, across real searches.
//
// The product's whole claim is that the number it shows can be trusted, so a wrong price is worse
// than no price. Every defect found this way so far has been the same two shapes:
//   1. a case/multi-pack priced as one unit (warehouse clubs state one unit's size, charge for the case)
//   2. the searched word acting as a modifier of a different food ("butter popcorn", "butter shrimp")
// Both produce a unit price far outside what the item can plausibly cost.
//
// This does not guess at categories. It compares each result against the OTHER results for the
// same query, which is the only reference that is always available, and flags the ones that cannot
// both be right.
//
//   node scripts/check-prices.js                       # default staples, one ZIP
//   node scripts/check-prices.js 60618 milk butter eggs
import { searchStore } from '../src/search.js';
import { relevance, RELEVANT } from '../shared/match.js';
import { directory, defaultStoreIds } from '../src/directory.js';

const args = process.argv.slice(2);
const ZIP = /^\d{5}$/.test(args[0] || '') ? args.shift() : '60618';
const QUERIES = args.length ? args : ['milk', 'butter', 'eggs', 'bread', 'chicken breast', 'orange juice', 'cheddar cheese', 'coffee'];

/** Ratio beyond which two results for the same query cannot both be correct. */
const ABSURD = 8;

const fmt = (n) => (n == null ? '-' : `$${n.toFixed(2)}`);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

async function main() {
  const dir = await directory(ZIP, { maxMiles: 25 });
  const stores = defaultStoreIds(dir, 8);
  console.log(`ZIP ${ZIP} — ${stores.length} stores: ${stores.join(', ')}\n`);

  const settings = { zip: ZIP, stores, resultsPerStore: 36, prime: false, cardPrices: true, overrides: {} };
  const problems = [];

  for (const q of QUERIES) {
    const results = [];
    for (const storeId of stores) {
      const r = await searchStore(storeId, q, settings).catch((e) => ({ items: [], error: e.message }));
      for (const it of r.items || []) {
        const score = relevance(q, it);
        if (score < RELEVANT) continue;
        // Compare on whichever unit the item actually has.
        const dim = it.unit?.weight ? 'weight' : it.unit?.volume ? 'volume' : it.unit?.count ? 'count' : null;
        if (!dim) continue;
        const perDisplay = dim === 'weight' ? it.unit.weight.perBase * 16 : dim === 'volume' ? it.unit.volume.perBase * 128 : it.unit.count.perBase;
        if (!Number.isFinite(perDisplay) || perDisplay <= 0) {
          problems.push({ q, storeId, it, perDisplay, why: 'non-finite or non-positive unit price' });
          continue;
        }
        results.push({ q, storeId, it, dim, perDisplay, score });
      }
    }

    // Judge each dimension separately: per-pound and per-gallon are not comparable to each other.
    for (const dim of ['weight', 'volume', 'count']) {
      const group = results.filter((r) => r.dim === dim);
      if (group.length < 4) continue;
      const med = median(group.map((r) => r.perDisplay));
      const unit = dim === 'weight' ? '/lb' : dim === 'volume' ? '/gal' : '/ct';
      for (const r of group) {
        const ratio = r.perDisplay / med;
        if (ratio >= ABSURD || ratio <= 1 / ABSURD) {
          problems.push({ ...r, med, ratio, unit, why: ratio >= ABSURD ? 'far above the median' : 'far below the median' });
        }
      }
      console.log(`  ${q} (${dim}): ${group.length} matches, median ${fmt(med)}${unit}`);
    }
  }

  console.log('\n──────────────────────────────────────────');
  if (!problems.length) {
    console.log('No implausible prices found.');
    return;
  }
  console.log(`${problems.length} implausible price(s):\n`);
  for (const p of problems.sort((a, b) => (b.ratio || 0) - (a.ratio || 0))) {
    const shown = p.unit ? `${fmt(p.perDisplay)}${p.unit}` : String(p.perDisplay);
    console.log(`  ${shown.padStart(14)}  ${String(p.storeId).padEnd(11)} ${p.why}${p.ratio ? ` (${p.ratio.toFixed(0)}x median ${fmt(p.med)})` : ''}`);
    console.log(`  ${''.padStart(14)}  query "${p.q}" · size ${JSON.stringify(p.it.size)} · listed ${fmt(p.it.price)}`);
    console.log(`  ${''.padStart(14)}  ${p.it.name.slice(0, 78)}\n`);
  }
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
