// Match audit: asks Claude whether each product the matcher picked is really the item the shopper
// asked for, so the matcher's mistakes surface before a shopper sees a wrong price.
//
// Offline and advisory. It reads a saved price audit (stats/samples.jsonl, written by
// scripts/sampler), sends Claude only retailer product listings (no shopper data), and writes the
// verdicts to a JSONL file. Nothing it says changes a price: every "wrong" verdict is a lead for a
// person to check and, if it holds, to fix as a matcher rule in shared/match.js and
// ios/App/Core/Match.swift with a regression test, like any other matcher bug.
//
//   node scripts/match-audit.mjs --dry-run                 # what would be sent, and its size; no API call
//   node scripts/match-audit.mjs --limit 20                # a first look: 20 picks, one request each
//   node scripts/match-audit.mjs --batch                   # every pick through the Batches API (half price)
//   options: --in stats/samples.jsonl  --out <file.jsonl>  --model claude-opus-5-5  --effort low
//
// Credentials: the Anthropic SDK reads ANTHROPIC_API_KEY (or an `ant auth login` profile). The SDK
// is a dev-only dependency loaded when the audit runs, so the server and the tests never need it:
//   npm install --no-save @anthropic-ai/sdk
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STAPLES } from './sampler/staples.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAPLE = new Map(STAPLES.map((s) => [s.id, s]));
const BASE_UNIT = { weight: 'oz', volume: 'fl oz', count: 'count' };

export const VERDICTS = ['match', 'wrong_product', 'wrong_form', 'wrong_variety', 'wrong_size', 'unsure'];
// Structured output: Claude's answer always parses into this shape.
export const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    reason: { type: 'string' },
  },
  required: ['verdict', 'reason'],
  additionalProperties: false,
};

// Fixed text, so it is a stable prefix every request shares (and the prompt cache can reuse it).
export const SYSTEM = `You check a grocery price-comparison app's product matching. A shopper asked for a staple item; the app searched one store and picked one product to price. Decide whether that product is honestly the item asked for, so its price can be compared with other stores' prices for the same item.

The app's standard: it must never show a price for the wrong thing. A cheaper wrong product is worse than no price at all.

Verdicts:
- match: the product is the item asked for (brand and store do not matter).
- wrong_product: a different product altogether (e.g. chocolate milk, a cheese snack for cheddar, a juice drink for orange juice, a pet food, a non-food item).
- wrong_form: the same food in a form not asked for (frozen, canned, dried, powdered, shredded when a block was asked, sliced, flavoured, a mix or kit).
- wrong_variety: a variant the item excludes (reduced-fat when whole was asked, organic or lactose-free when the definition rules them out, egg whites for eggs).
- wrong_size: the right product in a package size outside the definition, so its unit price would not compare.
- unsure: the listing does not say enough to decide.

A product sold by weight ("per lb", sold by lb) is priced per pound and fits any package-size window.

Judge only from the listing given. Be strict: when the listing shows the product is not the item, say so; do not give the benefit of the doubt. Keep the reason to one sentence that names the deciding words.`;

/** The picks in a saved audit, one per distinct product per staple: the same listing judged once. */
export function loadCases(jsonlText) {
  const seen = new Map();
  for (const line of jsonlText.split('\n')) {
    if (!line.trim()) continue;
    let s;
    try { s = JSON.parse(line); } catch { continue; }
    if (s.type !== 'sample' || s.status !== 'ok' || !s.pick || !STAPLE.has(s.item)) continue;
    const p = s.pick;
    const key = [s.item, p.brand || '', p.name, p.size || '', p.category || ''].join('|').toLowerCase();
    const where = { chain: s.chain, state: s.state, zip: s.zip, run: s.run };
    if (seen.has(key)) { seen.get(key).seenAt.push(where); continue; }
    seen.set(key, {
      id: `c${seen.size + 1}`,
      item: s.item,
      product: { name: p.name, brand: p.brand || null, size: p.size || null, category: p.category || null, price: p.price, unitPrice: p.unitPrice, unit: p.unit, soldBy: p.soldBy, basis: p.priceBasis || s.basis },
      seenAt: [where],
    });
  }
  return [...seen.values()];
}

/** The user message for one case: the staple's definition, then the listing. */
export function caseText(c) {
  const st = STAPLE.get(c.item);
  const p = c.product;
  const lines = [
    `Item asked for: ${st.label}${st.nounPhrase ? ` (${st.nounPhrase})` : ''}.`,
    st.exclude?.length ? `Not acceptable as this item: ${st.exclude.join(', ')}.` : null,
    // The package-size window that keeps unit prices comparable, in the staple's base unit.
    st.size ? `Acceptable package size: ${st.size.min} to ${st.size.max} ${BASE_UNIT[st.dim] || ''}.`.replace(/ +\./, '.') : null,
    '',
    'Product the app picked:',
    `- Name: ${p.name}`,
    p.brand ? `- Brand: ${p.brand}` : null,
    p.size ? `- Package size: ${p.size}` : null,
    p.category ? `- Store category: ${p.category}` : null,
    p.soldBy ? `- Sold by: ${p.soldBy}` : null,
    `- Price: $${p.price}${p.unitPrice != null && p.unit ? ` ($${p.unitPrice}/${p.unit})` : ''}`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

/** Messages API parameters for one case. */
export function buildParams(c, { model = 'claude-opus-5-5', effort = 'low' } = {}) {
  return {
    model,
    max_tokens: 1024,
    // A short classification: low effort, and a fixed answer shape.
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
    // The instructions are the same for every case; cache them.
    cache_control: { type: 'ephemeral' },
    system: SYSTEM,
    messages: [{ role: 'user', content: caseText(c) }],
  };
}

/** The verdict in a Messages API response, or why there is none. Never throws. */
export function readVerdict(message) {
  if (!message) return { verdict: 'error', reason: 'no response' };
  if (message.stop_reason === 'refusal') return { verdict: 'error', reason: `declined (${message.stop_details?.category ?? 'no category'})` };
  if (message.stop_reason === 'max_tokens') return { verdict: 'error', reason: 'answer cut off at max_tokens' };
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    const v = JSON.parse(text);
    if (!VERDICTS.includes(v.verdict) || typeof v.reason !== 'string') throw new Error('shape');
    return { verdict: v.verdict, reason: v.reason };
  } catch {
    return { verdict: 'error', reason: `unreadable answer: ${text.slice(0, 120)}` };
  }
}

/** Counts per staple and verdict, and the picks to look at first (wrong verdicts, most-seen first). */
export function summarize(results) {
  const byItem = {};
  for (const r of results) {
    const row = (byItem[r.item] ||= { total: 0 });
    row.total += 1;
    row[r.verdict] = (row[r.verdict] || 0) + 1;
  }
  const flagged = results.filter((r) => r.verdict !== 'match').sort((a, b) => b.seenAt.length - a.seenAt.length);
  return { byItem, flagged };
}

// ---------------------------------------------------------------- running it
const arg = (argv, name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

async function loadClient() {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error('the Anthropic SDK is not installed: run `npm install --no-save @anthropic-ai/sdk`');
  }
  return { Anthropic, client: new Anthropic() };
}

/** One request per case, a few at a time. Refusals fall back server-side to another model. */
export async function runDirect(client, Anthropic, cases, opts, onResult) {
  const queue = [...cases];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      let verdict;
      try {
        const message = await client.beta.messages.create({
          ...buildParams(c, opts),
          // On a safety decline the API re-runs the request on a fallback model it picks by category.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        verdict = readVerdict(message);
        verdict.usage = message.usage;
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) throw new Error('the API key was rejected (set ANTHROPIC_API_KEY)');
        verdict = { verdict: 'error', reason: err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : err.message };
      }
      onResult(c, verdict);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, cases.length) }, worker));
}

/** Every case in one batch at half price; results usually within the hour. */
export async function runBatch(client, cases, opts, onResult) {
  // Fallbacks are not accepted on the Batches API: a decline is recorded as an error verdict.
  const batch = await client.messages.batches.create({ requests: cases.map((c) => ({ custom_id: c.id, params: buildParams(c, opts) })) });
  console.log(`batch ${batch.id}: ${cases.length} requests`);
  for (;;) {
    const b = await client.messages.batches.retrieve(batch.id);
    if (b.processing_status === 'ended') break;
    console.log(`  ${b.processing_status}: ${b.request_counts.processing} processing, ${b.request_counts.succeeded} done`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  const byId = new Map(cases.map((c) => [c.id, c]));
  // Results arrive in any order: matched back by custom_id.
  for await (const r of await client.messages.batches.results(batch.id)) {
    const c = byId.get(r.custom_id);
    if (!c) continue;
    if (r.result.type === 'succeeded') onResult(c, { ...readVerdict(r.result.message), usage: r.result.message.usage });
    else onResult(c, { verdict: 'error', reason: `batch ${r.result.type}${r.result.error ? `: ${r.result.error.type}` : ''}` });
  }
}

async function main(argv) {
  const input = path.resolve(ROOT, arg(argv, '--in', 'stats/samples.jsonl'));
  const date = new Date().toISOString().slice(0, 10);
  const out = path.resolve(ROOT, arg(argv, '--out', `ops/coverage/match-audit-${date}.jsonl`));
  const opts = { model: arg(argv, '--model', 'claude-opus-5-5'), effort: arg(argv, '--effort', 'low'), concurrency: +arg(argv, '--concurrency', 4) };
  let cases = loadCases(fs.readFileSync(input, 'utf8'));
  const limit = +arg(argv, '--limit', 0);
  if (limit) cases = cases.slice(0, limit);
  console.log(`${cases.length} distinct picks from ${path.relative(ROOT, input)} (model ${opts.model}, effort ${opts.effort})`);

  if (argv.includes('--dry-run')) {
    const chars = cases.reduce((n, c) => n + caseText(c).length, 0) + SYSTEM.length;
    console.log(`\nfirst request:\n${JSON.stringify(buildParams(cases[0], opts), null, 2)}`);
    console.log(`\n${cases.length} requests; about ${Math.round(chars / 4).toLocaleString()} input tokens beyond the shared instructions (4 characters a token)`);
    return 0;
  }

  const { Anthropic, client } = await loadClient();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const sink = fs.createWriteStream(out);
  const results = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  const onResult = (c, v) => {
    const row = { ...c, verdict: v.verdict, reason: v.reason, model: opts.model };
    results.push(row);
    sink.write(`${JSON.stringify(row)}\n`);
    for (const k of Object.keys(usage)) usage[k] += v.usage?.[k] || 0;
    if (v.verdict !== 'match') console.log(`  ${v.verdict.padEnd(13)} ${c.item.padEnd(13)} ${c.product.name}${c.product.size ? ` (${c.product.size})` : ''}: ${v.reason}`);
  };
  if (argv.includes('--batch')) await runBatch(client, cases, opts, onResult);
  else await runDirect(client, Anthropic, cases, opts, onResult);
  await new Promise((r) => sink.end(r));

  const { byItem, flagged } = summarize(results);
  console.log('\nper staple:');
  for (const [item, row] of Object.entries(byItem)) console.log(`  ${item.padEnd(14)} ${Object.entries(row).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`\n${flagged.length} of ${results.length} picks flagged; verdicts in ${path.relative(ROOT, out)}`);
  console.log(`tokens: ${usage.input_tokens.toLocaleString()} input, ${usage.cache_read_input_tokens.toLocaleString()} cache reads, ${usage.output_tokens.toLocaleString()} output`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`match-audit: ${err.message}`); process.exit(1); });
}
