// Loading-screen facts, generated only from what was actually sampled.
//
// Rules of the house:
//   * every number in a fact comes from stats.items — nothing is assumed or rounded into a claim
//   * state names are spelled out, prices carry their unit ("$2.29/gal")
//   * a price taken from an Instacart marketplace listing is labelled as an online price
//   * comparisons between states only use prices measured the same way (shelf vs shelf, or Target
//     vs Target), so an Instacart markup can never masquerade as a regional price difference
//   * when fewer than 45 states were sampled the wording says so ("of the 6 states we checked")
import { stateName } from './states.js';
import { STAPLE_BY_ID } from './staples.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "bananas cost 22% more" but "milk costs 22% more"
const verb = (item, singular, plural) => (item.plural ? plural : singular);

function fmt(item, v) {
  if (v == null) return '—';
  return `$${v.toFixed(2)}${item.unitText}`;
}

function onlineTag(basis) {
  return basis === 'online' ? ' (online price)' : '';
}

function pct(a, b) {
  return Math.round(((a / b) - 1) * 100);
}

/** Candidate facts for one staple. */
function candidatesFor(item, { full, sampledStates }) {
  const out = [];
  const codes = Object.keys(item.states);
  const scope = full ? '' : `of the ${sampledStates} states we checked, `;
  const cheap = item.states[item.cheapestState];
  const pricey = item.states[item.priciestState];

  // A superlative needs a clear winner: when three states all sit at $2.89 a pound, calling one of
  // them "the cheapest" (or "the priciest") is an artefact of sort order, not a fact.
  const sorted = codes.map((c) => item.states[c].min).sort((a, b) => a - b);
  const clearlyCheapest = sorted.length >= 2 && sorted[0] < sorted[1] - 0.001;
  const clearlyPriciest = sorted.length >= 2 && sorted.at(-1) > sorted.at(-2) + 0.001 && sorted.at(-1) > sorted[0] * 1.02;

  if (codes.length >= 3 && cheap && clearlyCheapest) {
    out.push({
      id: `${item.id}-cheapest-state`, type: 'cheapest-state', item: item.id, state: item.cheapestState,
      value: cheap.min, score: 100,
      text: full
        ? `The cheapest state for ${item.noun} this week is ${stateName(item.cheapestState)} — ${fmt(item, cheap.min)} at ${cheap.minStore} in ${cheap.minCity}${onlineTag(cheap.basis)}.`
        : `${cap(scope)}${stateName(item.cheapestState)} has the cheapest ${item.noun} this week — ${fmt(item, cheap.min)} at ${cheap.minStore} in ${cheap.minCity}${onlineTag(cheap.basis)}.`,
    });
  }
  if (codes.length >= 3 && pricey && item.priciestState !== item.cheapestState && clearlyPriciest) {
    out.push({
      id: `${item.id}-priciest-state`, type: 'priciest-state', item: item.id, state: item.priciestState,
      value: pricey.min, score: 80,
      text: full
        ? `${cap(item.noun)} ${verb(item, 'is', 'are')} priciest in ${stateName(item.priciestState)} this week — the lowest price we found there was ${fmt(item, pricey.min)} at ${pricey.minStore} in ${pricey.minCity}${onlineTag(pricey.basis)}.`
        : `${cap(scope)}${item.noun} ${verb(item, 'is', 'are')} priciest in ${stateName(item.priciestState)} — the lowest price we found there was ${fmt(item, pricey.min)} at ${pricey.minStore} in ${pricey.minCity}${onlineTag(pricey.basis)}.`,
    });
  }

  // "X costs N% more in A than in B" — same measurement basis on both sides.
  if (cheap && pricey && cheap.basis === pricey.basis && item.cheapestState !== item.priciestState && clearlyPriciest) {
    const p = pct(pricey.min, cheap.min);
    if (p >= 8) {
      out.push({
        id: `${item.id}-state-spread`, type: 'spread', item: item.id, state: item.priciestState, value: p,
        score: 60 + Math.min(p, 60),
        text: `${cap(item.noun)} ${verb(item, 'costs', 'cost')} ${p}% more in ${stateName(item.priciestState)} than in ${stateName(item.cheapestState)} this week — ${fmt(item, pricey.min)} vs ${fmt(item, cheap.min)} at the cheapest store we found in each.`,
      });
    }
  }

  // Same chain, same pricing policy, different states: the cleanest comparison we have.
  if (item.baseline && item.baseline.states >= 3) {
    const b = item.baseline;
    const p = pct(b.priciestPrice, b.cheapestPrice);
    if (p >= 8) {
      out.push({
        id: `${item.id}-baseline-spread`, type: 'baseline-spread', item: item.id, state: b.priciestState, value: p,
        score: 55 + Math.min(p, 40),
        text: `At ${b.chain}, ${item.nounPhrase || item.noun} ${verb(item, 'costs', 'cost')} ${p}% more in ${stateName(b.priciestState)} (${fmt(item, b.priciestPrice)}) than in ${stateName(b.cheapestState)} (${fmt(item, b.cheapestPrice)}) — the same chain in ${b.states} states.`,
      });
    }
  }

  // Which chain is cheapest, and how often.
  const c = item.cheapestChain;
  if (c && c.wins >= 2 && c.of >= 3) {
    out.push({
      id: `${item.id}-cheapest-chain`, type: 'chain', item: item.id, state: null, value: c.wins,
      score: 50 + c.wins * 3,
      text: `${c.name} had the lowest ${item.noun} price in ${c.wins} of the ${c.of} states where we checked it this week.`,
    });
  }

  if (item.national.stores >= 8 && item.national.states >= 3) {
    out.push({
      id: `${item.id}-national-median`, type: 'median', item: item.id, state: null, value: item.national.median,
      score: 40,
      text: `The median price for ${item.nounPhrase || item.noun} was ${fmt(item, item.national.median)} this week, across ${item.national.stores} stores in ${item.national.states} states.`,
    });
  }

  if (item.national.stores >= 8 && item.national.states >= 2 && item.national.max > item.national.min * 1.2) {
    const n = item.national;
    out.push({
      id: `${item.id}-range`, type: 'range', item: item.id, state: n.maxState, value: n.max,
      score: 45,
      text: `Store to store, the cheapest ${item.noun} ranged from ${fmt(item, n.min)} at ${n.minStore} in ${n.minCity}, ${stateName(n.minState)} to ${fmt(item, n.max)} at ${n.maxStore} in ${n.maxCity}, ${stateName(n.maxState)} this week.`,
    });
  }

  return out;
}

/**
 * Pick a varied set of facts: one per staple first (rotating the fact type so the set doesn't read
 * the same way twice), then the strongest remaining ones, at most 2 per staple.
 */
export function buildFacts(stats, { max = 24 } = {}) {
  const sampledStates = stats.coverage.states;
  const full = sampledStates >= 45;
  const asOf = stats.weekOf;
  const pool = [];
  for (const item of stats.items) {
    const staple = STAPLE_BY_ID[item.id];
    const withNoun = { ...item, nounPhrase: staple?.nounPhrase };
    for (const f of candidatesFor(withNoun, { full, sampledStates })) {
      // Every fact carries its provenance so it can never outlive the data behind it.
      pool.push({
        ...f,
        unit: item.unit,
        asOf,
        confidence: item.confidence,
        stores: f.state ? item.states[f.state]?.stores ?? item.national.stores : item.national.stores,
        states: item.national.states,
        // true when the quoted price came from a per-each product converted to a per-pound price
        est: (f.state ? item.states[f.state]?.est : undefined) || undefined,
      });
    }
  }

  const chosen = [];
  const perItem = new Map();
  const typeCount = new Map();
  const take = (f) => {
    chosen.push(f);
    perItem.set(f.item, (perItem.get(f.item) || 0) + 1);
    typeCount.set(f.type, (typeCount.get(f.type) || 0) + 1);
  };

  // Round 1: one fact per staple, spreading the types around.
  const rotation = ['cheapest-state', 'spread', 'chain', 'baseline-spread', 'priciest-state', 'range', 'median'];
  stats.items.forEach((item, i) => {
    const mine = pool.filter((f) => f.item === item.id && !chosen.includes(f));
    if (!mine.length) return;
    const want = rotation[i % rotation.length];
    const pick = mine.find((f) => f.type === want) || mine.sort((a, b) => b.score - a.score)[0];
    take(pick);
  });

  // Round 2: best of the rest, capped per staple and per type so the mix stays varied.
  const rest = pool
    .filter((f) => !chosen.includes(f))
    .sort((a, b) => b.score - a.score);
  for (const f of rest) {
    if (chosen.length >= max) break;
    if ((perItem.get(f.item) || 0) >= 2) continue;
    if ((typeCount.get(f.type) || 0) >= Math.ceil(max / 4)) continue;
    take(f);
  }

  // Order for display: cheapest/priciest first, then comparisons, then context.
  const order = ['cheapest-state', 'priciest-state', 'spread', 'baseline-spread', 'chain', 'range', 'median'];
  chosen.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.item.localeCompare(b.item));
  return chosen.slice(0, max).map(({ score, ...f }) => f);
}
