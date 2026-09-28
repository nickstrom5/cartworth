// Small HTTP layer: timeouts, retries, a cookie jar, manual redirects (so cookies set on
// redirect hops are kept), and polite per-host concurrency limits.

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The visitor an outbound request is being made for. server.js runs every API request inside a
 * scope carrying `admit(host)` (src/guard.js admitCold): each request that actually leaves for a
 * retailer — whichever route caused it: search, directory, locations, weekly ads, deal details —
 * is counted against that visitor and refused when the host's queue is already long. Cache hits
 * never get here, so they cost nothing. Shared background work runs outside any scope (see
 * `unscoped`).
 */
export const requestScope = new AsyncLocalStorage();
/** Run `fn` as shared background work, not on behalf of the visitor whose request started it. */
export const unscoped = (fn) => requestScope.exit(fn);

export class HttpError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of list) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => {
        const [k, v] = a.split('=').map((x) => (x || '').trim().toLowerCase());
        if (k === 'max-age') return Number(v) <= 0;
        if (k === 'expires') return Date.parse(v) < Date.now();
        return false;
      });
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  has(name) {
    return this.cookies.has(name);
  }
  get(name) {
    return this.cookies.get(name);
  }
  clear() {
    this.cookies.clear();
  }
  toJSON() {
    return Object.fromEntries(this.cookies);
  }
  static from(obj) {
    const j = new CookieJar();
    for (const [k, v] of Object.entries(obj || {})) j.cookies.set(k, v);
    return j;
  }
}

// ---- per-host limiter ----
//
// The owner's standing rule for third-party hosts: one request at a time, at least 700 ms apart,
// and stop on HTTP 429. Adapters declare their own, looser, limits for the retailer hosts they
// own (configureHost below), and those numbers are a product decision recorded where they are set.
// Two things here are not a trade-off and are enforced for every host:
//
//   * A host nobody declared gets the owner's rule, not a fast default. The default used to be 4
//     concurrent requests 40 ms apart — about 25 a second — and the comment that said adapters
//     "cannot silently inherit" it was a hope, not a mechanism: Trader Joe's store locator
//     (alphaapi.brandify.com), Piggly Wiggly's Instacart-run store site (order.shopthepig.com) and
//     any redirect target all inherited it.
//   * The gap is measured between requests actually SENT. It used to be measured between the
//     slots the limiter handed out, and a timer that fires late (any busy moment in the process)
//     sends its request late without moving the next slot, so the next request went out early:
//     at a 350 ms gap, one measured search sent two requests 291 ms apart.
//   * A 429 stops us. It used to stop only the one call that received it: the other stores' searches
//     queued behind it for the same host went straight out, so one search could hit a host that had
//     just said "too many requests" a dozen more times within the second. Now the host is closed
//     for as long as it asked (Retry-After), or a minute when it did not say, and every request for
//     it — queued or new — fails fast with a 429 of our own without touching the network.
export const DEFAULT_HOST_POLICY = Object.freeze({ max: 1, gap: 700 });
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

const hosts = new Map();
function hostState(host) {
  let st = hosts.get(host);
  if (!st) {
    st = { active: 0, queue: [], last: 0, sent: 0, answered: 0, max: DEFAULT_HOST_POLICY.max, gap: DEFAULT_HOST_POLICY.gap, coolUntil: 0 };
    hosts.set(host, st);
  }
  return st;
}
/**
 * Set how hard we are willing to hit one host. Each adapter declares this for the hosts it owns,
 * at import time; anything undeclared gets DEFAULT_HOST_POLICY. Nothing here evades a limit; it
 * exists so we never provoke one.
 */
export function configureHost(host, { max, gap } = {}) {
  const st = hostState(host);
  if (max) st.max = max;
  if (gap != null) st.gap = gap;
}
/**
 * How many requests to a host are waiting or in flight. At one request per 700 ms, a backlog of 40
 * is about half a minute of waiting for whoever is at the back. src/guard.js sheds new lookups
 * past a limit, so one heavy visitor cannot put every other visitor behind their queue.
 */
export function hostBacklog(host) {
  const st = hosts.get(host);
  return st ? st.queue.length + st.active : 0;
}

/** The limits in force for a host, for tests and for the health panel. */
export function hostPolicy(host) {
  const st = hostState(host);
  return { max: st.max, gap: st.gap, coolingUntil: st.coolUntil > Date.now() ? st.coolUntil : null };
}

/** How long a 429 asked us to stay away: Retry-After in seconds or as a date, bounded. */
function cooldownFrom(res) {
  const h = res.headers?.get?.('retry-after');
  let ms = DEFAULT_COOLDOWN_MS;
  if (h != null && h !== '') {
    const secs = Number(h);
    const at = Date.parse(h);
    if (Number.isFinite(secs)) ms = secs * 1000;
    else if (Number.isFinite(at)) ms = at - Date.now();
  }
  return Math.min(MAX_COOLDOWN_MS, Math.max(1000, ms));
}

function refuseIfCooling(host, url) {
  const st = hostState(host);
  const left = st.coolUntil - Date.now();
  if (left <= 0) return;
  stats.refused += 1;
  throw new HttpError(`HTTP 429 from ${host} — not asking again for ${Math.ceil(left / 1000)}s`, { status: 429, url });
}

async function acquire(host) {
  const st = hostState(host);
  if (st.active >= st.max) await new Promise((resolve) => st.queue.push(resolve));
  st.active += 1;
  // Reserve the next slot, so concurrent callers queue up behind each other in order...
  const slot = Math.max(Date.now(), st.last + st.gap);
  st.last = slot;
  // ...then wait until both the slot AND one full gap after the latest request actually sent. The
  // second condition is the one that holds the rule when a timer fires late (see above).
  for (;;) {
    const wait = Math.max(slot, st.sent + st.gap) - Date.now();
    if (wait <= 0) break;
    await sleep(wait);
  }
  st.sent = Date.now();
  st.last = Math.max(st.last, st.sent);
}
function release(host) {
  const st = hostState(host);
  st.active -= 1;
  const next = st.queue.shift();
  if (next) next();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A timeout for work that waits its turn on a host: it fires when the hosts stop ANSWERING, not
 * when the work has taken a while.
 *
 * At one request in flight per host, 700 ms apart, a directory build or a trip plan queues dozens of
 * requests on www.instacart.com, and a caller near the back of that queue can wait a minute before
 * its first request is even sent. A wall-clock timeout (the directory's 15 s per probe, the search's
 * 35 s per store) counted that wait as the retailer being slow: probes came back "unresolved" and
 * forced a rebuild, and the stores at the back of a search were reported as failed while the host
 * was answering every request it got. Here the clock restarts whenever any of `hosts` answers, so
 * only a host that has genuinely gone quiet for `ms` times the work out. Each request still has its
 * own fetch timeout (request() above), and `maxMs` is a hard ceiling for the whole call.
 */
export function withStallTimeout(promise, ms, hosts = [], { maxMs = 5 * 60_000, label = 'The store site' } = {}) {
  const start = Date.now();
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearInterval(timer)),
    new Promise((_, reject) => {
      const fail = (msg) => {
        clearInterval(timer);
        reject(Object.assign(new Error(msg), { code: 'TIMEOUT' }));
      };
      timer = setInterval(() => {
        const now = Date.now();
        if (now - start > maxMs) return fail(`${label} took longer than ${Math.round(maxMs / 1000)}s`);
        const last = Math.max(start, ...hosts.map((h) => hostState(h).answered));
        if (now - last > ms) fail(`${label} stopped answering for ${Math.round(ms / 1000)}s`);
      }, Math.max(20, Math.min(1000, Math.floor(ms / 4))));
      timer.unref?.();
    }),
  ]);
}

// Stats for the health panel. `limited` records every host that has answered 429 (when, and until
// when we are staying away); `refused` counts the requests we did not send because of it.
export const stats = { requests: 0, errors: 0, byHost: {}, limited: {}, refused: 0 };

/**
 * fetch with timeout/retries/cookies.
 * Returns { status, ok, headers, url, text, json() }.
 */
export async function request(url, opts = {}) {
  // BASKET_OFFLINE=1: nothing leaves this process. For load tests and rehearsals, where a retailer
  // must not feel the traffic: unsetting proxy variables is not enough on a network with a
  // transparent proxy (the launch review's load test reached Instacart that way).
  if (process.env.BASKET_OFFLINE === '1') throw Object.assign(new Error('Offline (BASKET_OFFLINE=1): no request was sent'), { code: 'OFFLINE' });
  const {
    method = 'GET',
    headers = {},
    body,
    jar,
    timeout = 15000,
    retries = 1,
    followRedirects = true,
    maxRedirects = 5,
    okOnly = false,
  } = opts;
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      const res = await once(url, { method, headers, body, jar, timeout, followRedirects, maxRedirects });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new HttpError(`HTTP ${res.status}`, { status: res.status, url, body: res.text.slice(0, 300) });
        attempt += 1;
        await sleep(400 * attempt);
        continue;
      }
      if (okOnly && !res.ok) {
        throw new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, { status: res.status, url, body: res.text.slice(0, 500) });
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError) throw err;
      if (attempt >= retries) break;
      attempt += 1;
      await sleep(500 * attempt);
    }
  }
  stats.errors += 1;
  throw lastErr;
}

/** localhost, .local/.internal names, and literal loopback, private, link-local and CGNAT addresses. */
export function isPrivateHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
}

async function once(url, { method, headers, body, jar, timeout, followRedirects, maxRedirects }) {
  const scope = requestScope.getStore();
  if (scope?.admit && !scope.admit(new URL(url).host)) {
    stats.refused += 1;
    throw Object.assign(new HttpError(`${new URL(url).host} is busy`, { status: 503, url }), { busy: true });
  }
  let current = url;
  let m = method;
  let b = body;
  const origin = new URL(url).origin;
  let hdrs = headers;
  let sameOrigin = true;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const host = new URL(current).host;
    refuseIfCooling(host, current);
    await acquire(host);
    let res;
    let text;
    try {
      // Checked again after the wait: a request that queued behind the one that got the 429 must
      // not go out when its turn comes.
      refuseIfCooling(host, current);
      const h = { accept: 'application/json, text/plain, */*', ...hdrs };
      if (jar && sameOrigin && jar.cookies.size) h.cookie = jar.header();
      stats.requests += 1;
      stats.byHost[host] = (stats.byHost[host] || 0) + 1;
      res = await fetch(current, { method: m, headers: h, body: b, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      if (res.status === 429) {
        const until = Date.now() + cooldownFrom(res);
        const st = hostState(host);
        st.coolUntil = Math.max(st.coolUntil, until);
        const prev = stats.limited[host];
        stats.limited[host] = { count: (prev?.count || 0) + 1, at: Date.now(), until: st.coolUntil };
      }
      if (jar) jar.absorb(res);
      text = await res.text();
      // The host is alive and answering; see withStallTimeout. A 5xx or a 429 is not progress.
      if (res.status < 500 && res.status !== 429) hostState(host).answered = Date.now();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const e = new Error(err.name === 'TimeoutError' ? `Timed out after ${timeout / 1000}s (${host})` : `${err.message} (${host})${err.cause ? ': ' + err.cause.message : ''}`);
      e.code = err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';
      throw e;
    } finally {
      release(host);
    }
    if (followRedirects && res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current);
      // A redirect may not take us somewhere a request input never could: plain http, or a local or
      // private address. And credentials stay with the site they were meant for: a redirect to
      // another origin drops the Authorization header (Kroger's Basic/Bearer) and the cookie jar.
      if (next.protocol !== 'https:' || isPrivateHost(next.hostname)) throw new HttpError(`Refused a redirect to ${next.protocol}//${next.hostname}`, { status: 502, url: current });
      current = next.href;
      if (next.origin !== origin) {
        sameOrigin = false;
        hdrs = Object.fromEntries(Object.entries(hdrs || {}).filter(([k]) => !/^(authorization|cookie|x-kroger-)/i.test(k)));
      }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && m === 'POST')) {
        m = 'GET';
        b = undefined;
      }
      continue;
    }
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers: res.headers,
      url: current,
      text,
      json() {
        try {
          return JSON.parse(text);
        } catch {
          // The retailer's reply stays in .body for our logs; the message may reach a visitor.
          throw new HttpError(`Expected JSON from ${new URL(current).host}`, { status: res.status, url: current, body: text.slice(0, 300) });
        }
      },
    };
  }
  throw new Error(`Too many redirects (${url})`);
}

export async function getJSON(url, opts = {}) {
  const res = await request(url, { ...opts, okOnly: true });
  return res.json();
}

/** Run async fn over items with limited concurrency, preserving order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
