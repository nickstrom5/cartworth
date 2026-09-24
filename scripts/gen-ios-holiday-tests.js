// Regenerates the holiday-matrix XCTest cases in ios/Tests/CoreTests.swift from
// test/fixtures/holiday-matrix.json, so the phone's matcher (ios/App/Core/Match.swift) is held to
// exactly the cases shared/match.js is (test/qa-holiday-matrix.test.js).
//
//   node scripts/gen-ios-holiday-tests.js           # rewrite the generated region
//   node scripts/gen-ios-holiday-tests.js --check   # exit 1 when it is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'ios/Tests/CoreTests.swift');
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/holiday-matrix.json'), 'utf8'));
const BEGIN = '// BEGIN GENERATED HOLIDAY MATRIX (scripts/gen-ios-holiday-tests.js)';
const END = '// END GENERATED HOLIDAY MATRIX';

const lit = (s) => JSON.stringify(s); // a JSON string is a valid Swift string literal for these names
const ident = (q) => q.replace(/[^a-z0-9]+/gi, ' ').trim().split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join('');

const body = [
  BEGIN,
  '/// Every holiday list item against real product names and look-alikes (test/fixtures/holiday-matrix.json).',
  'final class HolidayMatrixTests: XCTestCase {',
  ...TABLE.map((r) => [
    `    func test${ident(r.query)}() {`,
    ...r.match.map((n) => `        XCTAssertGreaterThanOrEqual(Match.relevance(query: ${lit(r.query)}, name: ${lit(n)}), Match.relevant, ${lit(n)})`),
    ...r.reject.map((n) => `        XCTAssertLessThan(Match.relevance(query: ${lit(r.query)}, name: ${lit(n)}), Match.relevant, ${lit(n)})`),
    '    }',
  ].join('\n')),
  '}',
  END,
].join('\n');

const src = fs.readFileSync(FILE, 'utf8');
const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`);
const next = re.test(src) ? src.replace(re, body) : `${src.trimEnd()}\n\n${body}\n`;
if (process.argv.includes('--check')) {
  if (next !== src) { console.error('ios/Tests/CoreTests.swift holiday matrix is out of date: run node scripts/gen-ios-holiday-tests.js'); process.exit(1); }
  console.log('holiday matrix XCTests match test/fixtures/holiday-matrix.json');
} else {
  fs.writeFileSync(FILE, next);
  console.log(`wrote ${TABLE.length} holiday matrix XCTests`);
}
