// QA: is Cartworth polite to the sites it reads prices from?
//
// The owner's standing rule for third-party hosts: never parallel to one host, at least 700 ms
// between requests, and stop immediately on HTTP 429. This file drives the real src/http.js
// request() — the only road out of the server — against a stubbed fetch, so nothing here touches
// the network, and measures what actually leaves: how many requests reach a host, how close
// together, how many at once, and whether a 429 closes the door.
//
// Convention, matching the other QA files: "DEFECT: …" reproduces a defect that shipped;
// "control: …" pins a property that holds and must keep holding.
//
// Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';

const http = await import('../src/http.js');

/** Replace fetch with a recorder. `respond(url)` returns { status, headers, body, delay }. */
function stubFetch(respond) {
  const calls = [];
  let inFlight = {};
  let peak = {};
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const host = new URL(url).host;
    const r = respond(String(url)) || {};
    calls.push({ host, url: String(url), at: Date.now() });
    inFlight[host] = (inFlight[host] || 0) + 1;
    peak[host] = Math.max(peak[host] || 0, inFlight[host]);
    try {
      await new Promise((res) => setTimeout(res, r.delay ?? 5));
      return new Response(r.body ?? '{}', { status: r.status ?? 200, headers: r.headers || {} });
    } finally {
      inFlight[host] -= 1;
    }
  };
  return {
    calls,
    peak,
    to: (host) => calls.filter((c) => c.host === host),
    restore: () => (globalThis.fetch = real),
  };
}

let seq = 0;
const freshHost = (tag) => `${tag}-${process.pid}-${seq++}.example.test`;

test('DEFECT: after a 429, no further request goes to that host — new or already queued', async () => {
  // One search fans out to every store at once, and most stores share www.instacart.com. When
  // that host answered 429, only the call that received it stopped: the rest of the fan-out,
  // queued behind it in the limiter, went out anyway.
  const host = freshHost('limited');
  http.configureHost(host, { max: 1, gap: 0 });
  const f = stubFetch((u) => (new URL(u).host === host ? { status: 429, delay: 20 } : {}));
  try {
    const burst = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => http.request(`https://${host}/search?q=${i}`)));
    assert.equal(f.to(host).length, 1, `${f.to(host).length} requests reached a host that had already answered 429`);
    const refused = burst.filter((r) => r.status === 'rejected');
    assert.equal(refused.length, 5, 'the queued requests are refused, not sent');
    for (const r of refused) assert.match(r.reason.message, /429/, 'and the refusal says why, so search.js can tell the shopper');
    // A later request, well after the burst, is refused too: the host has not said we may come back.
    await assert.rejects(http.request(`https://${host}/later`), /429/);
    assert.equal(f.to(host).length, 1);
    assert.ok(http.hostPolicy(host).coolingUntil > Date.now(), 'the host is recorded as cooling down');
    assert.ok(http.stats.limited[host]?.count >= 1, 'and the health panel can see it');
  } finally {
    f.restore();
  }
});

test('control: a 429 closes only that host — every other host carries on', async () => {
  const bad = freshHost('bad');
  const good = freshHost('good');
  http.configureHost(bad, { max: 2, gap: 0 });
  http.configureHost(good, { max: 2, gap: 0 });
  const f = stubFetch((u) => (new URL(u).host === bad ? { status: 429 } : { status: 200, body: '{"ok":true}' }));
  try {
    await http.request(`https://${bad}/x`);
    const r = await http.request(`https://${good}/y`);
    assert.equal(r.status, 200);
    assert.equal(f.to(good).length, 1);
  } finally {
    f.restore();
  }
});

test('control: the host is closed for as long as Retry-After asks, and then reopens', async () => {
  const host = freshHost('retry');
  http.configureHost(host, { max: 1, gap: 0 });
  let first = true;
  const f = stubFetch(() => {
    if (!first) return { status: 200 };
    first = false;
    return { status: 429, headers: { 'retry-after': '1' } };
  });
  try {
    await http.request(`https://${host}/a`);
    await assert.rejects(http.request(`https://${host}/b`), /429/, 'inside the window: refused');
    await new Promise((r) => setTimeout(r, 1100));
    const r = await http.request(`https://${host}/c`);
    assert.equal(r.status, 200, 'after the window: allowed again');
    assert.equal(f.to(host).length, 2, 'exactly the first 429 and the one after the window');
  } finally {
    f.restore();
  }
});

test('DEFECT: a host no adapter declared gets the owner’s rule — one at a time, 700 ms apart', async () => {
  // The default used to be 4 concurrent requests 40 ms apart (about 25 a second). Trader Joe's
  // store locator (alphaapi.brandify.com), Instacart's asset host and any redirect target were
  // all on it, because nothing actually forces an adapter to declare a host.
  const host = freshHost('undeclared');
  const f = stubFetch(() => ({ status: 200, delay: 30 }));
  try {
    await Promise.all(Array.from({ length: 3 }, (_, i) => http.request(`https://${host}/${i}`)));
    const at = f.to(host).map((c) => c.at);
    assert.equal(at.length, 3);
    assert.equal(f.peak[host], 1, `${f.peak[host]} requests were in flight at once to one host`);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 690, `requests ${at[i] - at[i - 1]} ms apart`);
    assert.deepEqual(http.hostPolicy(host), { max: 1, gap: 700, coolingUntil: null });
  } finally {
    f.restore();
  }
});

test('DEFECT: the gap is kept between requests actually sent, even when a timer fires late', async () => {
  // The limiter handed out slots 700 ms apart and slept until each one — but a busy moment in the
  // process makes a timer fire late, the request goes out late, and the NEXT slot was still
  // counted from the old one, so it went out early. Measured through the real Instacart adapter
  // at a 350 ms gap: two requests 291 ms apart. Here the event loop is blocked for 150 ms just as
  // the second request is due, which is what a large JSON parse or a GC pause does.
  const host = freshHost('late');
  const f = stubFetch(() => ({ status: 200, delay: 5 }));
  try {
    const t0 = Date.now();
    setTimeout(() => {
      const until = Date.now() + 150;
      while (Date.now() < until) {} // hold the event loop, as a long synchronous task would
    }, 690);
    await Promise.all(Array.from({ length: 3 }, (_, i) => http.request(`https://${host}/${i}`)));
    const at = f.to(host).map((c) => c.at - t0);
    assert.ok(at[1] >= 780, `precondition: the second request was held up by the blocked loop (sent at +${at[1]} ms)`);
    // 20 ms of slack for the OS: on a loaded machine the process itself can be paused between the
    // limiter releasing a request and this stub seeing it. The defect is worth ~150 ms here.
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 680, `requests ${i} and ${i + 1} went out ${at[i] - at[i - 1]} ms apart (sent at +${at.join(', +')} ms)`);
  } finally {
    f.restore();
  }
});

test('DEFECT: with several requests in flight at once (Instacart’s 3 at 150 ms), a late timer still cannot close the gap', async () => {
  // Concurrency > 1 is the harder case: all three slots are handed out before any is sent, so a
  // late second request must push the third back even though its slot was reserved long before.
  const host = freshHost('late3');
  http.configureHost(host, { max: 3, gap: 150 });
  const f = stubFetch(() => ({ status: 200, delay: 1000 }));
  try {
    const t0 = Date.now();
    // Held past BOTH later slots (150 and 300 ms), so both timers are due the moment it lets go.
    setTimeout(() => {
      const until = Date.now() + 300;
      while (Date.now() < until) {}
    }, 140);
    await Promise.all(Array.from({ length: 3 }, (_, i) => http.request(`https://${host}/${i}`)));
    const at = f.to(host).map((c) => c.at - t0);
    assert.equal(f.peak[host], 3, 'precondition: all three were in flight together');
    assert.ok(at[1] >= 430, `precondition: the second request was held up (sent at +${at[1]} ms)`);
    // Same 20 ms of slack for the OS; the defect put the last two requests ~0 ms apart.
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 130, `requests ${i} and ${i + 1} went out ${at[i] - at[i - 1]} ms apart (sent at +${at.join(', +')} ms)`);
  } finally {
    f.restore();
  }
});

test('control: a declared host keeps the limits its adapter set', async () => {
  const host = freshHost('declared');
  http.configureHost(host, { max: 3, gap: 150 });
  assert.deepEqual(http.hostPolicy(host), { max: 3, gap: 150, coolingUntil: null });
});

// ---------------------------------------------------------------------------
// The owner's rule applies to every retailer host the live app reads, not only to the tracker
// (decided Sept 2026). The adapters used to loosen it: Instacart 3 in flight 150 ms apart, Whole
// Foods, Trader Joe's, ALDI, Woodman's, Kroger and Flipp 2 in flight 200-250 ms apart.
// ---------------------------------------------------------------------------
test('DEFECT: every retailer host the app reads is held to one request in flight, 700 ms apart', async () => {
  await Promise.all(['instacart', 'wholefoods', 'traderjoes', 'flipp', 'kroger'].map((a) => import(`../src/adapters/${a}.js`)));
  await import('../src/geo.js');
  const hosts = [
    'www.instacart.com', 'www.aldi.us', 'shopwoodmans.com', 'order.shopthepig.com', 'www.wholefoodsmarket.com',
    'www.traderjoes.com', 'alphaapi.brandify.com', 'backflipp.wishabi.com', 'api.kroger.com', 'api.zippopotam.us',
  ];
  for (const h of hosts) {
    const p = http.hostPolicy(h);
    assert.ok(p.max <= 1 && p.gap >= 700, `${h} allows ${p.max} in flight ${p.gap} ms apart`);
  }
});

// At one in flight and 700 ms apart, a caller at the back of a long queue waits a long time for its
// turn. That wait is not the retailer being slow, and must not time the work out.
test('DEFECT: a caller waiting its turn behind a busy but answering host is not timed out', async () => {
  const host = freshHost('queue');
  http.configureHost(host, { max: 1, gap: 100 });
  const f = stubFetch(() => ({ status: 200, delay: 20 }));
  try {
    // Nine requests ahead of ours: about a second of queue against a 400 ms stall budget.
    const ahead = Array.from({ length: 9 }, (_, i) => http.request(`https://${host}/a${i}`));
    const mine = http.withStallTimeout(http.request(`https://${host}/mine`), 400, [host]);
    const t0 = Date.now();
    const r = await mine;
    await Promise.all(ahead);
    assert.equal(r.status, 200);
    assert.ok(Date.now() - t0 > 400, 'the test must actually queue for longer than the stall budget');
  } finally {
    f.restore();
  }
});

test('control: a host that stops answering is still timed out, after the stall budget', async () => {
  const host = freshHost('silent');
  http.configureHost(host, { max: 1, gap: 0 });
  const f = stubFetch(() => ({ status: 200, delay: 5000 }));
  try {
    const t0 = Date.now();
    await assert.rejects(http.withStallTimeout(http.request(`https://${host}/x`, { timeout: 10000, retries: 0 }), 300, [host]), (e) => e.code === 'TIMEOUT');
    const took = Date.now() - t0;
    assert.ok(took >= 300 && took < 1500, `timed out after ${took} ms`);
  } finally {
    f.restore();
  }
});

test('control: the hard ceiling still ends work that keeps a host busy forever', async () => {
  const host = freshHost('ceiling');
  // Answers keep arriving, so the stall clock never runs out; only maxMs can end it.
  const alive = setInterval(() => http.request(`https://${host}/ping`).catch(() => {}), 50);
  http.configureHost(host, { max: 1, gap: 0 });
  const f = stubFetch(() => ({ status: 200, delay: 5 }));
  try {
    await assert.rejects(http.withStallTimeout(new Promise(() => {}), 200, [host], { maxMs: 600 }), /longer than/);
  } finally {
    clearInterval(alive);
    f.restore();
  }
});
