// Regenerates the chain table in ios/App/Sources/RetailerCatalog.swift from shared/catalog.js.
//
// shared/catalog.js is the reference. The phone's table was hand-kept and had drifted to 75 of the
// web's 119 chains, with 16 Instacart slugs that disagreed and no `chainWide` rule at all
// (test/qa-catalog-parity.test.js). Only the `chains` array is rewritten; the matching code around
// it in the Swift file is left as it is.
//
// Run: node scripts/gen-ios-catalog.js           (writes the file)
//      node scripts/gen-ios-catalog.js --check   (exit 1 if the file is out of date)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS } from '../shared/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'ios/App/Sources/RetailerCatalog.swift');
const BEGIN = '    // BEGIN GENERATED CHAINS — scripts/gen-ios-catalog.js from shared/catalog.js. Do not edit by hand.';
const END = '    // END GENERATED CHAINS';
const IC = 'https://www.instacart.com';

const str = (s) => JSON.stringify(String(s));
const list = (a) => `[${(a || []).map(str).join(', ')}]`;

function source(c) {
  const p = c.price;
  if (!p) return '.adsOnly';
  if (p.type === 'wholefoods') return '.wholeFoods';
  if (p.type === 'traderjoes') return '.traderJoes';
  if (p.type !== 'instacart') throw new Error(`${c.id}: no Swift source for price type ${p.type}`);
  const guest = p.guest || 'implicit';
  if (p.base === IC && guest === 'implicit') return `ic(${str(p.slug)})`;
  return `.instacart(base: ${str(p.base)}, slug: ${str(p.slug)}, guest: .${guest})`;
}

function row(c) {
  const parts = [
    `id: ${str(c.id)}`, `name: ${str(c.name)}`, `short: ${str(c.short)}`, `aliases: ${list(c.aliases)}`,
    `source: ${source(c)}`, `flipp: ${list(c.ads)}`,
  ];
  if (c.note) parts.push(`note: ${str(c.note)}`);
  if (c.price?.chainWide) parts.push('chainWide: true');
  return `        Chain(${parts.join(', ')}),`;
}

export function generate(src) {
  const body = [BEGIN, '    static let chains: [Chain] = [', ...CHAINS.map(row), '    ]', END].join('\n');
  const marked = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`);
  if (marked.test(src)) return src.replace(marked, body);
  // First run: replace the hand-kept array.
  const hand = /    static let chains: \[Chain\] = \[\n[\s\S]*?\n    \]\n/;
  if (!hand.test(src)) throw new Error('cannot find the chains array in RetailerCatalog.swift');
  return src.replace(hand, `${body}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = fs.readFileSync(FILE, 'utf8');
  const out = generate(src);
  if (process.argv.includes('--check')) {
    if (out !== src) {
      console.error('ios/App/Sources/RetailerCatalog.swift is out of date: run node scripts/gen-ios-catalog.js');
      process.exit(1);
    }
    console.log('RetailerCatalog.swift matches shared/catalog.js');
  } else {
    fs.writeFileSync(FILE, out);
    console.log(`wrote ${CHAINS.length} chains to ${path.relative(ROOT, FILE)}`);
  }
}
