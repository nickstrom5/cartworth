// A price-audit run must stop at the first retailer refusal (HTTP 429), whichever way the app words
// it. The Thanksgiving run of 9 Oct 2026 checked only for "429", missed "The store site is
// rate-limiting us", and started the next state while Instacart was refusing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { refusedStores } from '../ops/coverage/refusals.mjs';

test('both wordings of a refusal are caught, and nothing else is', () => {
  const rows = [
    { q: 'stuffing', status: { aldi: 'ok', kroger: 'error: The store site is rate-limiting us — wait a minute and retry', wholefoods: 'empty' } },
    { q: 'butter', status: { walmart: 'error: HTTP 429 from www.instacart.com — not asking again for 60s', traderjoes: "blocked: Trader Joe's does not allow automated price lookups" } },
    { q: 'celery', status: { sprouts: 'error: timed out after 20s', heb: 'ok' } },
  ];
  assert.deepEqual(refusedStores(rows), ['kroger', 'walmart']);
  assert.deepEqual(refusedStores([{ status: { aldi: 'ok' } }]), []);
  assert.deepEqual(refusedStores(undefined), []);
});

test('the holiday matrix runner stops on a refusal', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../ops/coverage/holiday-matrix.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ refusedStores \} from '\.\/refusals\.mjs'/);
  assert.match(src, /if \(refused\.length\) \{[\s\S]*?process\.exit\(2\)/);
});
