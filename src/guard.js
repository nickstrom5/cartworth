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

const buckets = new Map();

function bucketFor(key, now) {
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) sweep(now, true);
    b = { hits: [], fresh: [], seen: now };
    buckets.set(key, b);
  }
  b.seen = now;
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
  const hops = Number(process.env.BASKET_TRUST_PROXY || 0);
  if (hops > 0) {
    const cf = String(req.headers['cf-connecting-ip'] || '').trim();
    if (cf) return cf.slice(0, 64);

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

export function guardStats() {
  return { buckets: buckets.size, maxPerMinute: MAX_PER_WINDOW, maxFreshPer10Min: MAX_FRESH_PER_WINDOW };
}
