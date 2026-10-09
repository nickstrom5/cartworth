// scripts/match-audit.mjs asks Claude whether each product the matcher picked is really the item
// asked for. These tests run without the Anthropic SDK or a key: they pin what is sent (the
// staple's definition and the listing, never where it was seen), how answers are read (a decline,
// a cut-off or an unreadable answer is an error, never a pass), and the run loop with a fake client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCases, caseText, buildParams, readVerdict, summarize, runDirect, SCHEMA, VERDICTS } from '../scripts/match-audit.mjs';

const sample = (over = {}) => JSON.stringify({ type: 'sample', status: 'ok', item: 'milk', chain: 'aldi', state: 'IL', zip: '60618', run: 'r1',
  pick: { name: 'Friendly Farms Whole Milk', brand: 'Friendly Farms', size: '1 gal', category: 'Plain Milk', price: 2.41, unitPrice: 2.41, unit: 'gal', soldBy: 'each', priceBasis: 'shelf' }, ...over });

test('one case per distinct product per staple; failed and pick-less samples are skipped', () => {
  const lines = [sample(), sample({ zip: '60640', chain: 'aldi' }), sample({ status: 'error' }), sample({ pick: null }), JSON.stringify({ type: 'shop' }), 'not json',
    sample({ pick: { name: 'Prairie Farms 2% Reduced Fat Milk', size: '1 gal', price: 3.59 } })].join('\n');
  const cases = loadCases(lines);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].seenAt.length, 2, 'the same listing at two ZIPs is judged once');
});

test("what is sent: the staple's definition (exclusions, size window) and the listing, never where it was seen", () => {
  const [c] = loadCases(sample());
  const text = caseText(c);
  assert.match(text, /Item asked for: Milk, whole, 1 gallon/);
  assert.match(text, /Not acceptable as this item: .*chocolate/);
  assert.match(text, /Acceptable package size: 120 to 132 fl oz\./);
  assert.match(text, /Name: Friendly Farms Whole Milk/);
  const params = JSON.stringify(buildParams(c));
  for (const where of ['60618', '"IL"', 'aldi', 'seenAt']) assert.ok(!params.includes(where), `${where} would leave the machine`);
});

test('the request: Opus 5.5 by default, low effort, a fixed answer schema, cached instructions', () => {
  const p = buildParams(loadCases(sample())[0]);
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.output_config.effort, 'low');
  assert.deepEqual(p.output_config.format, { type: 'json_schema', schema: SCHEMA });
  assert.deepEqual(SCHEMA.properties.verdict.enum, VERDICTS);
  assert.deepEqual(p.cache_control, { type: 'ephemeral' });
  assert.equal(typeof p.system, 'string');
});

test('reading answers: only a well-formed verdict counts; a decline, cut-off or garbled answer is an error', () => {
  const msg = (text, stop = 'end_turn', extra = {}) => ({ stop_reason: stop, content: [{ type: 'text', text }], ...extra });
  assert.deepEqual(readVerdict(msg('{"verdict":"wrong_form","reason":"frozen"}')), { verdict: 'wrong_form', reason: 'frozen' });
  // A decline is never a pass, even when text before it happens to parse as a verdict.
  assert.equal(readVerdict(msg('{"verdict":"match","reason":"x"}', 'refusal', { stop_details: { category: 'cyber' } })).verdict, 'error');
  assert.equal(readVerdict(msg('{"verdict":"ma', 'max_tokens')).verdict, 'error');
  assert.equal(readVerdict(msg('{"verdict":"probably","reason":"x"}')).verdict, 'error');
  assert.equal(readVerdict(msg('not json')).verdict, 'error');
  assert.equal(readVerdict(null).verdict, 'error');
});

test('the run loop sends the fallback opt-in, records each verdict, and keeps going past an API error', async () => {
  class APIError extends Error { constructor(status, m) { super(m); this.status = status; } }
  class AuthenticationError extends APIError {}
  const Anthropic = { APIError, AuthenticationError };
  const sent = [];
  const client = { beta: { messages: { create: async (p) => {
    sent.push(p);
    if (/Reduced Fat/.test(p.messages[0].content)) throw new APIError(529, 'overloaded');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"verdict":"match","reason":"whole milk, gallon"}' }], usage: { input_tokens: 1 } };
  } } } };
  const cases = loadCases([sample(), sample({ pick: { name: 'Prairie Farms 2% Reduced Fat Milk', size: '1 gal', price: 3.59 } })].join('\n'));
  const got = [];
  await runDirect(client, Anthropic, cases, { concurrency: 2 }, (c, v) => got.push([c.product.name, v.verdict]));
  assert.equal(sent.length, 2);
  for (const p of sent) { assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']); assert.equal(p.fallbacks, 'default'); }
  assert.deepEqual(got.sort(), [['Friendly Farms Whole Milk', 'match'], ['Prairie Farms 2% Reduced Fat Milk', 'error']]);
  const bad = { beta: { messages: { create: async () => { throw new AuthenticationError(401, 'bad key'); } } } };
  await assert.rejects(runDirect(bad, Anthropic, cases.slice(0, 1), { concurrency: 1 }, () => {}), /API key was rejected/);
});

test('the summary lists every non-match, most widely seen first', () => {
  const r = (item, verdict, n) => ({ item, verdict, seenAt: Array(n).fill({}) });
  const { byItem, flagged } = summarize([r('milk', 'match', 9), r('milk', 'wrong_variety', 2), r('eggs', 'wrong_size', 5), r('eggs', 'error', 1)]);
  assert.deepEqual(byItem.milk, { total: 2, match: 1, wrong_variety: 1 });
  assert.deepEqual(flagged.map((f) => f.verdict), ['wrong_size', 'wrong_variety', 'error']);
});
