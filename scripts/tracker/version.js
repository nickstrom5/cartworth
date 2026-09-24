// parser_version: a fingerprint of every product file that can change a value in a tracker row.
//
// The size parser is being fixed while the tracker collects, and will change again. A unit price
// from before a parser fix and one from after it are not comparable, and a package price read by
// an older adapter may differ from the same shelf read by a newer one (round 1 changed how Whole
// Foods multi-buys are divided, which moves a PRICE). So every row carries this version, and
// stats.js refuses to present a change across two versions as a real price change.
//
// It is a content hash rather than a hand-bumped number because nobody has to remember to bump
// it: any edit to these files, even a comment, starts a new version. A spurious new version costs
// nothing (ground-truth columns still compare; stats.js just annotates the boundary); a missed
// bump would silently mix two parsers in one series.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config.js';

export const PARSER_FILES = [
  'shared/units.js',
  'shared/match.js',
  'shared/compare.js',
  'src/normalize.js',
  'src/search.js',
];

export function parserFiles(root = REPO_ROOT) {
  const adapters = fs.readdirSync(path.join(root, 'src', 'adapters')).filter((f) => f.endsWith('.js')).sort().map((f) => `src/adapters/${f}`);
  return [...PARSER_FILES, ...adapters];
}

/** { version, files: { 'shared/units.js': sha256-prefix, ... } } */
export function parserVersion(root = REPO_ROOT) {
  const files = {};
  const all = crypto.createHash('sha256');
  for (const rel of parserFiles(root)) {
    const buf = fs.readFileSync(path.join(root, rel));
    files[rel] = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    all.update(rel).update('\0').update(buf).update('\0');
  }
  return { version: `pv-${all.digest('hex').slice(0, 10)}`, files };
}
