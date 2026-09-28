// QA: the iPhone app's retailer catalogue must be the website's.
//
// shared/catalog.js is the reference; ios/App/Sources/RetailerCatalog.swift follows it. They had
// drifted by 23 Sep 2026: the phone knew 75 of the web's 119 chains (Festival Foods, Sendik's and
// Piggly Wiggly did not exist on it), priced Fresh Thyme nowhere, and disagreed on 16 Instacart
// slugs — several of the phone's had never been checked against a real ZIP at all. Nothing noticed,
// because nothing compared the two. It also had no `chainWide`, so the phone went on reading every
// chain's canonical Instacart storefront as "national prices" (Hy-Vee in Milwaukee, priced from
// Lincoln NE) after the web stopped.
//
// This is a DATA parity check, deliberately: it compares the two tables, it does not test the
// Swift matching logic (ios/Tests/CatalogParityTests.swift drives the production RetailerCatalog
// for that). It reads the Swift source because that table is the only form the phone's catalogue
// exists in; if the Swift file is ever generated from JSON instead, read that.
//
// Convention: "DEFECT …" asserts the correct behaviour for a defect seen live. `todo` marks a
// handoff: the Swift file is not owned by this suite's author; whoever lands the regenerated file
// removes the todo.
//
// Run: node --test test/qa-catalog-parity.test.js   (reads files only — no network, no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS } from '../shared/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SWIFT = process.env.CARTWORTH_SWIFT_CATALOG || path.join(ROOT, 'ios/App/Sources/RetailerCatalog.swift');

const strings = (s) => [...String(s || '').matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));

/** Every `Chain(…)` row in the Swift table, as { id, source, chainWide, names }. */
function swiftChains(src) {
  const out = new Map();
  for (const line of src.split('\n')) {
    if (!/^\s*Chain\(id: "/.test(line)) continue;
    const id = /id: "([^"]*)"/.exec(line)[1];
    const s = /source: (ic\("([^"]*)"\)|\.instacart\(base: "([^"]*)", slug: "([^"]*)", guest: \.(\w+)\)|\.wholeFoods|\.traderJoes|\.adsOnly)/.exec(line);
    if (!s) throw new Error(`cannot read the source of Swift chain ${id}: ${line.trim()}`);
    const source = s[2] != null ? `instacart https://www.instacart.com ${s[2]} implicit`
      : s[4] != null ? `instacart ${s[3]} ${s[4]} ${s[5]}`
      : s[1] === '.wholeFoods' ? 'wholefoods' : s[1] === '.traderJoes' ? 'traderjoes' : 'none';
    out.set(id, {
      source,
      chainWide: /chainWide: true/.test(line),
      names: [...strings(/flipp: \[([^\]]*)\]/.exec(line)?.[1]), ...strings(/aliases: \[([^\]]*)\]/.exec(line)?.[1])].sort(),
    });
  }
  return out;
}

function webSource(c) {
  const p = c.price;
  if (!p) return 'none';
  if (p.type === 'instacart') return `instacart ${p.base} ${p.slug} ${p.guest || 'implicit'}`;
  return p.type;
}

const swift = swiftChains(fs.readFileSync(SWIFT, 'utf8'));

test('control: the Swift table was read at all', () => {
  assert.ok(swift.size >= 50, `only ${swift.size} chains read from ${SWIFT} — the row format changed; fix swiftChains()`);
  assert.equal(swift.get('aldi')?.source, 'instacart https://www.aldi.us aldi implicit');
});

test('DEFECT: every chain the website knows exists on the phone with the same price source and the same chain-wide rule', () => {
  const problems = [];
  for (const c of CHAINS) {
    const s = swift.get(c.id);
    if (!s) {
      problems.push(`${c.id}: missing on the phone (web: ${webSource(c)})`);
      continue;
    }
    if (s.source !== webSource(c)) problems.push(`${c.id}: phone prices from "${s.source}", web from "${webSource(c)}"`);
    if (s.chainWide !== !!c.price?.chainWide) problems.push(`${c.id}: chainWide phone=${s.chainWide} web=${!!c.price?.chainWide}`);
  }
  for (const id of swift.keys()) if (!CHAINS.some((c) => c.id === id)) problems.push(`${id}: on the phone only`);
  assert.deepEqual(problems, [], `${problems.length} disagreements:\n  ${problems.join('\n  ')}`);
});

test('DEFECT: the phone recognises a store and a weekly ad by the same names the website does', () => {
  const problems = [];
  for (const c of CHAINS) {
    const s = swift.get(c.id);
    if (!s) continue; // reported above
    const web = [...(c.ads || []), ...c.aliases].sort();
    if (JSON.stringify(web) !== JSON.stringify(s.names)) problems.push(`${c.id}: phone ${JSON.stringify(s.names)} web ${JSON.stringify(web)}`);
  }
  assert.deepEqual(problems, [], `${problems.length} disagreements:\n  ${problems.join('\n  ')}`);
});

test('control: the Swift table is exactly what scripts/gen-ios-catalog.js generates from shared/catalog.js', async () => {
  const { generate } = await import('../scripts/gen-ios-catalog.js');
  const src = fs.readFileSync(SWIFT, 'utf8');
  assert.equal(generate(src), src, 'run: node scripts/gen-ios-catalog.js');
});
