// QA: the price tracker's own politeness limiter (scripts/tracker/limiter.js).
//
// The owner's rule for third-party hosts: never more than one request in flight to a host, at
// least 700 ms between requests, and stop on HTTP 429. The tracker enforces it UNDER the product
// (it replaces globalThis.fetch), because the product's adapters declare looser limits of their own
// — Instacart is configured for 3 concurrent requests 150 ms apart. These tests drive a stubbed
// fetch; nothing here touches the network.
//
// Run: node --disable-warning=ExperimentalWarning --test test/qa-tracker-limiter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostLimiter, installGlobalFetch, HostClosedError, MIN_GAP_MS } from '../scripts/tracker/limiter.js';

/** A fetch that records when each request started and finished, per host. */
function recorder({ delay = 20, status = () => 200, body = null } = {}) {
  const calls = [];
  const inFlight = {};
  const peak = {};
  const fetchImpl = async (input) => {
    const url = String(input?.url ?? input);
    const host = new URL(url).host;
    const rec = { host, url, start: Date.now(), end: null };
    calls.push(rec);
    inFlight[host] = (inFlight[host] || 0) + 1;
    peak[host] = Math.max(peak[host] || 0, inFlight[host]);
    try {
      await new Promise((r) => setTimeout(r, delay));
      const st = status(url, calls.length);
      return new Response(body ? body(rec) : st === 204 ? null : `{"n":${calls.length}}`, { status: st });
    } finally {
      rec.end = Date.now();
      inFlight[host] -= 1;
    }
  };
  return { calls, peak, fetchImpl, to: (h) => calls.filter((c) => c.host === h) };
}

function gaps(list) {
  const out = [];
  for (let i = 1; i < list.length; i++) out.push({ endToStart: list[i].start - list[i - 1].end, startToStart: list[i].start - list[i - 1].start });
  return out;
}

test('one request in flight per host and >= 700 ms from one response ending to the next starting, however many the caller fires at once', async () => {
  const rec = recorder({ delay: 60 });
  const lim = createHostLimiter({ fetchImpl: rec.fetchImpl });
  const t0 = Date.now();
  // Four at once to one host, two to another: the second host must not wait behind the first.
  const a = [1, 2, 3, 4].map((i) => lim.fetch(`https://a.example.test/x${i}`).then((r) => r.text()));
  const b = [1, 2].map((i) => lim.fetch(`https://b.example.test/y${i}`).then((r) => r.text()));
  await Promise.all([...a, ...b]);
  assert.equal(rec.peak['a.example.test'], 1, 'never two requests in flight to one host');
  assert.equal(rec.peak['b.example.test'], 1);
  for (const g of gaps(rec.to('a.example.test'))) {
    assert.ok(g.endToStart >= MIN_GAP_MS, `end-to-start gap ${g.endToStart} ms is under ${MIN_GAP_MS}`);
    assert.ok(g.startToStart >= MIN_GAP_MS, `start-to-start gap ${g.startToStart} ms is under ${MIN_GAP_MS}`);
  }
  // Host b's first request went out at once, in parallel with host a's queue.
  assert.ok(rec.to('b.example.test')[0].start - t0 < 300, 'a different host is not held up');
  const rep = lim.report()['a.example.test'];
  assert.equal(rep.requests, 4);
  assert.ok(rep.minGapEndToStartMs >= MIN_GAP_MS, `report says min gap ${rep.minGapEndToStartMs}`);
  assert.equal(rep.peakInFlight, 1);
});

test('a response still streaming its body counts as in flight: the gap is measured from the last byte', async () => {
  const BODY_MS = 400;
  const rec = recorder({
    delay: 5,
    body: (r) =>
      new ReadableStream({
        async start(c) {
          c.enqueue(new TextEncoder().encode('{"part":1'));
          await new Promise((res) => setTimeout(res, BODY_MS));
          c.enqueue(new TextEncoder().encode('}'));
          r.bodyDone = Date.now();
          c.close();
        },
      }),
  });
  const lim = createHostLimiter({ fetchImpl: rec.fetchImpl });
  const texts = await Promise.all([lim.fetch('https://s.example.test/1').then((r) => r.text()), lim.fetch('https://s.example.test/2').then((r) => r.text())]);
  assert.deepEqual(texts, ['{"part":1}', '{"part":1}'], 'the caller still gets the whole body');
  const [first, second] = rec.to('s.example.test');
  assert.ok(second.start - first.bodyDone >= MIN_GAP_MS, `next request started ${second.start - first.bodyDone} ms after the previous body finished`);
});

test("the product's own looser adapter limits cannot loosen it (src/http.js, 3 concurrent at 150 ms)", async () => {
  const http = await import('../src/http.js');
  const host = `loose-${process.pid}.example.test`;
  http.configureHost(host, { max: 3, gap: 150 }); // what src/adapters/instacart.js declares for www.instacart.com
  const rec = recorder({ delay: 40 });
  const lim = createHostLimiter({ fetchImpl: rec.fetchImpl });
  const restore = installGlobalFetch(lim);
  try {
    await Promise.all([1, 2, 3].map((i) => http.request(`https://${host}/q${i}`, { retries: 0 })));
  } finally {
    restore();
  }
  assert.equal(rec.peak[host], 1, 'the tracker serialises what the product would send three at a time');
  for (const g of gaps(rec.to(host))) assert.ok(g.endToStart >= MIN_GAP_MS, `gap ${g.endToStart} ms`);
});

test('HTTP 429 closes the host for the rest of the run: queued and later requests never reach the network; other hosts carry on', async () => {
  // A fake clock, so "the rest of the run" can be two hours later without waiting two hours.
  let clock = 1_000_000;
  const now = () => clock;
  const sleep = async (ms) => {
    clock += ms;
  };
  const sent = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    sent.push(url);
    return new Response('slow down', { status: url.includes('rl.example.test') ? 429 : 200 });
  };
  const lim = createHostLimiter({ fetchImpl, now, sleep });
  const results = await Promise.allSettled([1, 2, 3].map((i) => lim.fetch(`https://rl.example.test/p${i}`)));
  assert.equal(sent.filter((u) => u.includes('rl.example.test')).length, 1, 'only the request that got the 429 was sent');
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].value.status, 429, 'the caller still sees the 429 itself');
  for (const r of results.slice(1)) {
    assert.equal(r.status, 'rejected');
    assert.ok(r.reason instanceof HostClosedError, 'queued requests fail without being sent');
  }
  clock += 2 * 60 * 60 * 1000; // two hours later, same run
  await assert.rejects(lim.fetch('https://rl.example.test/later'), HostClosedError);
  assert.equal(sent.filter((u) => u.includes('rl.example.test')).length, 1, 'still only one request ever sent after the 429');
  const ok = await lim.fetch('https://fine.example.test/x');
  assert.equal(ok.status, 200, 'another host is unaffected');
  assert.equal(lim.isClosed('rl.example.test'), true);
  const rep = lim.report()['rl.example.test'];
  assert.equal(rep.closed.reason, 'rate-limited');
  assert.equal(rep.closed.status, 429);
  assert.equal(rep.refusedAfterClose, 3);
});

test('three 403s in a row mark a host blocked and close it; the tracker records a block, it never works around one', async () => {
  let clock = 5_000_000;
  const sent = [];
  const lim = createHostLimiter({
    fetchImpl: async (input) => {
      sent.push(String(input));
      return new Response('forbidden', { status: 403 });
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  for (let i = 0; i < 3; i++) assert.equal((await lim.fetch(`https://wall.example.test/${i}`)).status, 403);
  await assert.rejects(lim.fetch('https://wall.example.test/4'), HostClosedError);
  assert.equal(sent.length, 3);
  assert.equal(lim.report()['wall.example.test'].closed.reason, 'blocked');
});

test('the 700 ms floor cannot be configured away', () => {
  const fetchImpl = async () => new Response('');
  assert.throws(() => createHostLimiter({ fetchImpl, gapMs: 150 }), RangeError);
  assert.throws(() => createHostLimiter({ fetchImpl, gapMs: 699 }), RangeError);
  assert.doesNotThrow(() => createHostLimiter({ fetchImpl, gapMs: 700 }));
});
