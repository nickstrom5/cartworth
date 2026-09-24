// Politeness guard for a publicly reachable server.
//
// On localhost there was exactly one visitor, so nothing could abuse the retailers' sites through
// us. Hosted, anyone can. This does not change how many outbound requests a normal visitor causes
// — it only stops one visitor from turning the shared cache off for everybody:
//
//   * a per-IP request budget on /api/*, returning 429 rather than doing the work;
//   * a much smaller per-IP budget for cache-bypassing (`fresh=1`) requests. Over budget, `fresh`
//     is quietly ignored and the cached answer is served, so the retailer sees no extra traffic.
//
// Everything is in memory and per-process; there is no visitor identity here beyond a coarse
// bucket keyed by remote address, and buckets are dropped once they go idle.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = +process.env.BASKET_RATE_LIMIT || 90;
const FRESH_WINDOW_MS = 10 * 60_000;
const MAX_FRESH_PER_WINDOW = +process.env.BASKET_FRESH_LIMIT || 12;
const MAX_BUCKETS = 5000;
// Requests to retailer sites made for one visitor per 10 minutes (http.js counts each one that
// actually leaves; cache hits never do). A new search is ~20-40 of them, a new ZIP's store directory
// ~20-30, a 10-item trip plan at 8 stores ~80-160. 600 is a busy shopper's hour squeezed into ten
// minutes, and about one request a second sustained.
const COLD_WINDOW_MS = 10 * 60_000;
const MAX_COLD_PER_WINDOW = +process.env.BASKET_COLD_LIMIT || 600;
// Requests waiting for one retailer host before new lookups are shed (see http.js hostBacklog).
const MAX_BACKLOG = +process.env.BASKET_MAX_BACKLOG || 40;

const buckets = new Map();

function bucketFor(key, now) {
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) sweep(now, true);
    b = { hits: [], fresh: [], cold: [], seen: now };
    buckets.set(key, b);
  }
  b.seen = now;
  // Least recently used first: a forced sweep (5,000 buckets, e.g. under a spray of addresses) then
  // drops idle visitors, never the one still sending requests.
  buckets.delete(key);
  buckets.set(key, b);
  return b;
}

function sweep(now, force = false) {
  for (const [k, b] of buckets) {
    if (force || now - b.seen > FRESH_WINDOW_MS) buckets.delete(k);
    if (buckets.size < MAX_BUCKETS / 2) break;
  }
}

/**
 * The client address, for rate limiting.
 *
 * X-Forwarded-For is a list that each proxy APPENDS to, so the left-most entry is whatever the
 * client sent and is trivially forged: rotating it created a fresh budget bucket per request and
 * defeated the limiter entirely. Only the entries our own infrastructure appended can be trusted,
 * and those are on the RIGHT.
 *
 * BASKET_TRUST_PROXY is the number of trusted proxy hops in front of this server (1 for a single
 * CDN or load balancer). The client address is that many entries from the right. Unset or 0 means
 * trust nothing but the socket.
 *
 * On Cloudflare, prefer CF-Connecting-IP: Cloudflare overwrites it on every request, so unlike
 * X-Forwarded-For it cannot carry a forged value through.
 */
export function clientKey(req) {
  return bucketOf(rawClient(req));
}

/**
 * One bucket per IPv6 /64: a single customer is usually handed a whole /64, so keying by the full
 * address let one visitor rotate through billions of fresh budgets (the security review).
 */
function bucketOf(ip) {
  const a = String(ip).replace(/^::ffff:/, '');
  if (!a.includes(':')) return a;
  const [head] = a.split('%');
  const parts = head.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts.length > 1 && parts[1] ? parts[1].split(':') : [];
  const full = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

function rawClient(req) {
  const hops = Number(process.env.BASKET_TRUST_PROXY || 0);
  // CF-Connecting-IP only when the server really is behind Cloudflare (BASKET_TRUST_CF=1). Trusted
  // whenever BASKET_TRUST_PROXY was set, a visitor behind any other proxy could send a random value
  // on every request and get a fresh budget each time.
  if (process.env.BASKET_TRUST_CF === '1') {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf.slice(0, 64);
  }
  if (hops > 0) {

    const list = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (list.length) {
      // Count from the right; clamp so a short list cannot walk off the front and land on a
      // client-supplied entry.
      const idx = Math.max(0, list.length - hops);
      return String(list[Math.min(idx, list.length - 1)]).slice(0, 64);
    }
  }
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

/** Record a request. Returns { ok, retryAfter } — ok=false means answer 429 and do no work. */
export function takeRequest(req, now = Date.now()) {
  const b = bucketFor(clientKey(req), now);
  b.hits = b.hits.filter((t) => now - t < WINDOW_MS);
  if (b.hits.length >= MAX_PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - b.hits[0])) / 1000) };
  }
  b.hits.push(now);
  if (buckets.size > MAX_BUCKETS / 2) sweep(now);
  return { ok: true };
}

/**
 * May this request bypass the cache? Over budget we return false, and the caller serves the cached
 * copy instead. Refusing quietly keeps the page working; refusing loudly would just invite a retry.
 */
export function allowFresh(req, now = Date.now()) {
  const b = bucketFor(clientKey(req), now);
  b.fresh = b.fresh.filter((t) => now - t < FRESH_WINDOW_MS);
  if (b.fresh.length >= MAX_FRESH_PER_WINDOW) return false;
  b.fresh.push(now);
  return true;
}

/**
 * May this visitor make a NEW lookup (a cache miss) at a store on `hosts`? No when the store's queue
 * is already long (everyone would wait behind it, and a long queue is how a 429 that stops the store
 * for every visitor gets provoked), or when this visitor has spent their budget of new lookups. The
 * caller then serves saved prices, or says the store is busy. It never makes the request anyway.
 */
export function admitCold(req, hosts = [], now = Date.now(), backlog = () => 0, { charge = true } = {}) {
  if (hosts.some((h) => backlog(h) >= MAX_BACKLOG)) {
    if (charge) shed.busy += 1;
    return false;
  }
  const b = bucketFor(clientKey(req), now);
  b.cold = b.cold.filter((t) => now - t < COLD_WINDOW_MS);
  if (b.cold.length >= MAX_COLD_PER_WINDOW) {
    if (charge) shed.budget += 1;
    return false;
  }
  if (charge) b.cold.push(now);
  return true;
}

/** Would admitCold say yes? Asked before a search, which then serves saved prices instead of trying. */
export const canAdmit = (req, hosts, now, backlog) => admitCold(req, hosts, now, backlog, { charge: false });

const shed = { busy: 0, budget: 0 };

export function guardStats() {
  return { buckets: buckets.size, maxPerMinute: MAX_PER_WINDOW, maxFreshPer10Min: MAX_FRESH_PER_WINDOW, maxNewLookupsPer10Min: MAX_COLD_PER_WINDOW, maxBacklog: MAX_BACKLOG, shed: { ...shed } };
}
