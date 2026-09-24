// Two-level cache: in-memory (fast) + SQLite (survives restarts), with in-flight de-duplication
// so concurrent requests for the same key share one upstream call.
import { cacheGet, cacheGetStale, cacheSet, cacheDeletePrefix } from './db.js';

const mem = new Map();
const inflight = new Map();

// A cached store result is a whole search page — 36 products with names, brands, URLs and image
// URLs — and measured 27.5 KB. The old bound was 800 ENTRIES with no idea what an entry weighed,
// which is ~22 MB of the most common thing in here and unbounded for anything larger (a directory
// build, a weekly-ad flyer). Bounding the bytes as well as the count is what makes the resident
// size of a public server predictable.
const MAX_MEM = 800;
const MAX_MEM_BYTES = 48 * 1024 * 1024;
// Anything bigger than this is served but not kept: one outsized value must not evict the whole
// working set behind it.
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
let memBytes = 0;

/**
 * Get-or-compute with TTL. If computing fails and an expired copy exists (up to maxStaleMs old),
 * the stale copy is returned and onStale(ageMs) is called so callers can flag it.
 */
export async function cached(key, ttlMs, fn, { persist = true, fresh = false, staleOnError = true, maxStaleMs = 7 * DAY, onStale } = {}) {
  if (!fresh) {
    const hit = mem.get(key);
    if (hit && hit.expires > Date.now()) {
      touch(key, hit);
      return hit.value;
    }
    if (persist) {
      const v = cacheGet(key);
      if (v !== undefined) {
        // ttlMs may be a function of the value (see below); passing the function itself made the
        // in-memory expiry NaN, so a disk hit was never reused from memory.
        remember(key, v, typeof ttlMs === 'function' ? ttlMs(v) : ttlMs);
        return v;
      }
    }
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await fn();
      // A source may say how long its answer may be kept (Kroger's terms: no longer than its own
      // cache headers allow), so the TTL can be a function of the value. 0 means do not keep it.
      const ttl = typeof ttlMs === 'function' ? ttlMs(value) : ttlMs;
      if (ttl > 0) {
        remember(key, value, ttl);
        if (persist) cacheSet(key, value, ttl);
      }
      return value;
    } catch (err) {
      if (staleOnError) {
        const m = mem.get(key);
        const stale = m ? m.value : persist ? cacheGetStale(key, maxStaleMs) : undefined;
        if (stale !== undefined) {
          onStale?.(err);
          return stale;
        }
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Move a key to the young end of the Map.
 *
 * eviction walks Map iteration order, which is INSERTION order — so without this a key that is
 * read a thousand times an hour is still evicted ahead of one written once and never touched
 * again. On a public server the hot keys are the popular searches, i.e. exactly the ones the old
 * code threw away first.
 */
function touch(key, entry) {
  mem.delete(key);
  mem.set(key, entry);
}

function sizeOf(value) {
  try {
    // An approximation on purpose: JSON length is within a small factor of the retained size and
    // costs one pass, where anything exact costs a walk of the object graph on every write.
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function drop(key) {
  const e = mem.get(key);
  if (!e) return;
  memBytes -= e.bytes;
  mem.delete(key);
}

function remember(key, value, ttlMs) {
  drop(key); // replacing: stop counting the old copy's bytes
  const bytes = sizeOf(value);
  if (bytes > MAX_ENTRY_BYTES) return;
  while (mem.size >= MAX_MEM || (memBytes + bytes > MAX_MEM_BYTES && mem.size > 0)) {
    drop(mem.keys().next().value);
  }
  mem.set(key, { value, bytes, expires: Date.now() + ttlMs });
  memBytes += bytes;
}

/** The last value for `key` however old (up to maxStaleMs), for a lookup we chose not to make. */
export function peekStale(key, maxStaleMs) {
  const hit = mem.get(key);
  if (hit) return hit.value;
  return cacheGetStale(key, maxStaleMs);
}

export function peek(key) {
  const hit = mem.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const v = cacheGet(key);
  return v === undefined ? undefined : v;
}

export function invalidate(prefix) {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) drop(k);
  cacheDeletePrefix(prefix);
}

/** What the in-memory half is holding, for /api/health and for the tests. */
export function memStats() {
  return { entries: mem.size, bytes: memBytes, maxEntries: MAX_MEM, maxBytes: MAX_MEM_BYTES, inflight: inflight.size };
}

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
