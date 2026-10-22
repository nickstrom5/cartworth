// QA (code review of fix-round-3): two ways src/cache.js could show saved prices as live, or
// older than the 3-day bound.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cached, peekStale } from '../src/cache.js';

const fail = async () => {
  await new Promise((r) => setTimeout(r, 10));
  throw new Error('store down');
};

test('DEFECT: every caller sharing a failed lookup is told the answer is a stale copy', async () => {
  const key = 'qa:stale:shared';
  await cached(key, 1, async () => ({ price: 2.5 }), { persist: false });
  await new Promise((r) => setTimeout(r, 5));
  const told = [];
  const [a, b] = await Promise.all([
    cached(key, 1, fail, { persist: false, onStale: () => told.push('a') }),
    cached(key, 1, fail, { persist: false, onStale: () => told.push('b') }),
  ]);
  assert.deepEqual([a.price, b.price], [2.5, 2.5]);
  assert.deepEqual(told.sort(), ['a', 'b'], 'the second caller showed saved prices as live');
});

test('control: a fresh answer shared by two callers is not called stale', async () => {
  const told = [];
  const go = () => cached('qa:stale:fresh', 60_000, async () => ({ price: 3 }), { persist: false, fresh: true, onStale: () => told.push(1) });
  await Promise.all([go(), go()]);
  assert.equal(told.length, 0);
});

test('DEFECT: an in-memory copy past maxStaleMs is not served, on error or when shed', async () => {
  const key = 'qa:stale:old';
  await cached(key, 1, async () => ({ price: 4 }), { persist: false });
  await new Promise((r) => setTimeout(r, 40));
  await assert.rejects(cached(key, 1, fail, { persist: false, maxStaleMs: 10 }), /store down/);
  assert.equal(peekStale(key, 10), undefined);
});

test('control: an in-memory copy within maxStaleMs is served', async () => {
  const key = 'qa:stale:recent';
  await cached(key, 1, async () => ({ price: 5 }), { persist: false });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await cached(key, 1, fail, { persist: false, maxStaleMs: 60_000 })).price, 5);
  assert.equal(peekStale(key, 60_000)?.price, 5);
});
