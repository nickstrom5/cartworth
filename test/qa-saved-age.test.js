// QA: a saved price served because a store did not answer must say how old it is. "stale" alone
// let a three-day-old price read like today's. searchStore stamps savedAt when the store answers;
// a stale result carries it, and a fresh one does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The behaviour (a saved answer carries savedAt from the time the store answered) is tested in
// qa-catalog-directory.test.js, which has the Instacart harness.

test('DEFECT: the web store chip shows the saved age instead of a bare "stale"', () => {
  const src = fs.readFileSync(new URL('../public/js/views/compare.js', import.meta.url), 'utf8');
  assert.match(src, /saved \$\{ago\(r\.savedAt\)\}/);
});

test('DEFECT: the iPhone app carries the saved time to its store chip', () => {
  const search = fs.readFileSync(new URL('../ios/App/Services/PriceSearch.swift', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../ios/App/UI/Search/SearchView.swift', import.meta.url), 'utf8');
  assert.match(search, /savedAt: r\.staleError == nil \? nil : r\.storedAt/);
  assert.match(view, /r\.savedAt/);
});
