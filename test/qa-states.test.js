// QA: every state (and DC). "Will this work for someone in any state?" pinned down as tests, so a
// catalog edit that strands a state, or a name that starts resolving to the wrong chain, fails here
// rather than in a shopper's onboarding. The live side of the same question is the state x holiday
// audit, ops/coverage/holiday-matrix.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAINS, chainsInState, chainForName } from '../shared/catalog.js';
import { storeForMerchant } from '../shared/stores.js';
import { stateCode } from '../src/geo.js';

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const priced = (c) => !!(c.price || c.alt);

test('every chain names real postal codes (a typo strands the chain in no state)', () => {
  const bad = [];
  for (const c of CHAINS) {
    if (c.states === 'US') continue;
    assert.ok(Array.isArray(c.states) && c.states.length, `${c.id} has no states`);
    for (const s of c.states) if (!STATES[s]) bad.push(`${c.id}:${s}`);
  }
  assert.deepEqual(bad, []);
});

for (const [code, name] of Object.entries(STATES)) {
  test(`${code} (${name}): regional chains Cartworth can price, plus the national ones`, () => {
    const inState = chainsInState(code);
    const regional = inState.filter((c) => c.states !== 'US' && priced(c));
    // The thinnest states on 24 Sep 2026 (ME, ND: Hannaford/ALDI/BJ's, Hornbacher's/Family Fare...)
    // have three or four. Fewer means a catalog edit dropped a state's grocers.
    assert.ok(regional.length >= 3, `${code}: only ${regional.map((c) => c.id).join(', ') || 'none'}`);
    for (const id of ['walmart', 'costco']) assert.ok(inState.some((c) => c.id === id), `${code} lost ${id}`);
  });

  test(`${code}: the geocoder's state name reads as ${code}`, () => {
    assert.equal(stateCode({ state: name }), code);
    assert.equal(stateCode({ 'ISO3166-2-lvl4': `US-${code}` }), code);
  });
}

test('every chain is found again by its own name and by each of its weekly-ad names', () => {
  const wrong = [];
  for (const c of CHAINS) {
    const byName = chainForName(c.name)?.id;
    if (byName !== c.id) wrong.push(`name "${c.name}" -> ${byName}`);
    for (const ad of c.ads || []) {
      const got = storeForMerchant(ad);
      if (got !== c.id) wrong.push(`ad "${ad}" -> ${got} (want ${c.id})`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('no alias belongs to two chains', () => {
  const owner = new Map();
  const dup = [];
  for (const c of CHAINS) for (const a of c.aliases || []) {
    const k = a.toLowerCase();
    if (owner.has(k) && owner.get(k) !== c.id) dup.push(`${k}: ${owner.get(k)} & ${c.id}`);
    owner.set(k, c.id);
  }
  assert.deepEqual(dup, []);
});
