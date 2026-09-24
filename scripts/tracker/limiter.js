// The tracker's own politeness limiter, enforced underneath the product.
//
// The product's adapters declare their own per-host limits (src/http.js configureHost), and some
// are looser than the owner's rule — Instacart is allowed 3 concurrent requests 150 ms apart,
// because an interactive search fans out to many stores at once. A daily batch job has no such
// excuse, and the owner's rule is not negotiable, so the tracker does not rely on those settings:
// it replaces globalThis.fetch — the one road out of src/http.js — with this limiter, which sits
// below every adapter and cannot be loosened by any of them.
//
// Per host:
//   * ONE request in flight, counting the whole response body, not just the headers;
//   * at least `gapMs` (never less than 700) from the END of one response to the START of the
//     next — stricter than start-to-start, and it implies start-to-start >= 700 too;
//   * HTTP 429 closes the host for the rest of the run. Every later request for it — already
//     queued or new — fails immediately without touching the network, and the run records it;
//   * three 403s in a row mark the host blocked and close it the same way. The tracker never
//     tries to get past a block (no user-agent games, no challenge solving); it records it.
//
// Every request is measured so a run can report requests per host and the smallest gap it
// actually left, rather than the gap it meant to leave.

export const MIN_GAP_MS = 700;
const BLOCK_AFTER_403 = 3;

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HostClosedError extends Error {
  constructor(host, closed) {
    super(`tracker: ${host} is closed for the rest of this run (${closed.reason}${closed.status ? ` — HTTP ${closed.status}` : ''} at ${new Date(closed.at).toISOString()}); no request sent`);
    this.name = 'HostClosedError';
    this.code = 'HOST_CLOSED';
    this.host = host;
    this.status = closed.status;
  }
}

function hostOf(input) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  return new URL(url).host;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' });
}

/**
 * @param fetchImpl  the fetch to call for real (the network, or a stub in tests)
 * @param gapMs      minimum idle time per host between one response ending and the next request; >= 700
 */
export function createHostLimiter({ fetchImpl, gapMs = MIN_GAP_MS, now = Date.now, sleep = realSleep, blockAfter403 = BLOCK_AFTER_403 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('createHostLimiter needs fetchImpl');
  if (!(Number(gapMs) >= MIN_GAP_MS)) throw new RangeError(`gapMs must be at least ${MIN_GAP_MS} (got ${gapMs}): the owner's rule is a floor, not a default`);
  const hosts = new Map();
  const events = [];

  function state(host) {
    let s = hosts.get(host);
    if (!s) {
      s = {
        tail: Promise.resolve(),
        lastStart: 0,
        lastEnd: 0,
        requests: 0,
        refused: 0,
        errors: 0,
        statuses: {},
        minStartGap: Infinity,
        minEndGap: Infinity,
        inFlight: 0,
        peak: 0,
        consecutive403: 0,
        closed: null,
      };
      hosts.set(host, s);
    }
    return s;
  }

  function close(host, s, reason, status, url) {
    if (s.closed) return;
    s.closed = { reason, status, at: now(), url: String(url).slice(0, 200) };
    events.push({ host, ...s.closed });
  }

  async function limitedFetch(input, init = {}) {
    const host = hostOf(input);
    const s = state(host);
    if (s.closed) {
      s.refused += 1;
      throw new HostClosedError(host, s.closed);
    }
    // A per-host mutex: each request waits for the one before it to finish completely.
    let release;
    const prev = s.tail;
    s.tail = new Promise((r) => (release = r));
    try {
      await prev;
      if (s.closed) {
        s.refused += 1;
        throw new HostClosedError(host, s.closed);
      }
      throwIfAborted(init?.signal);
      // A loop, not one sleep: timers can fire a millisecond early by the wall clock, and the gap
      // is a floor measured on that clock.
      for (let wait = s.lastEnd ? s.lastEnd + gapMs - now() : 0; wait > 0; wait = s.lastEnd + gapMs - now()) await sleep(wait);
      // Checked again after the wait: the host may have been closed while this one queued.
      if (s.closed) {
        s.refused += 1;
        throw new HostClosedError(host, s.closed);
      }
      throwIfAborted(init?.signal);

      const start = now();
      if (s.lastStart) s.minStartGap = Math.min(s.minStartGap, start - s.lastStart);
      if (s.lastEnd) s.minEndGap = Math.min(s.minEndGap, start - s.lastEnd);
      s.lastStart = start;
      s.requests += 1;
      s.inFlight += 1;
      s.peak = Math.max(s.peak, s.inFlight);
      let res;
      let body;
      try {
        res = await fetchImpl(input, init);
        // Read the whole body before letting the next request go: a response still streaming is
        // still a request in flight. Hand the caller an identical Response built from the bytes.
        body = [101, 103, 204, 205, 304].includes(res.status) ? null : await res.arrayBuffer();
      } catch (err) {
        s.errors += 1;
        throw err;
      } finally {
        s.inFlight -= 1;
        s.lastEnd = now();
      }
      const st = res.status;
      s.statuses[st] = (s.statuses[st] || 0) + 1;
      if (st === 429) close(host, s, 'rate-limited', 429, input?.url ?? input);
      if (st === 403) {
        s.consecutive403 += 1;
        if (s.consecutive403 >= blockAfter403) close(host, s, 'blocked', 403, input?.url ?? input);
      } else {
        s.consecutive403 = 0;
      }
      return new Response(body, { status: st, statusText: res.statusText, headers: res.headers });
    } finally {
      release();
    }
  }

  return {
    fetch: limitedFetch,
    isClosed: (host) => !!hosts.get(host)?.closed,
    closedHosts: () => Object.fromEntries([...hosts].filter(([, s]) => s.closed).map(([h, s]) => [h, s.closed])),
    events,
    /** What actually happened, per host. Gaps are measured, not intended; null when fewer than two requests. */
    report() {
      const out = {};
      for (const [host, s] of hosts) {
        out[host] = {
          requests: s.requests,
          refusedAfterClose: s.refused,
          networkErrors: s.errors,
          statuses: { ...s.statuses },
          minGapStartToStartMs: Number.isFinite(s.minStartGap) ? s.minStartGap : null,
          minGapEndToStartMs: Number.isFinite(s.minEndGap) ? s.minEndGap : null,
          peakInFlight: s.peak,
          closed: s.closed,
        };
      }
      return out;
    },
  };
}

/** Route every fetch in this process through `limiter`. Returns a function that puts the old fetch back. */
export function installGlobalFetch(limiter) {
  const prev = globalThis.fetch;
  globalThis.fetch = limiter.fetch;
  return () => {
    globalThis.fetch = prev;
  };
}
