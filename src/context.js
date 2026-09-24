// Per-request context.
//
// Cartworth's server keeps nothing about a visitor. Everything that used to live in the single
// global `settings` row now arrives with each request and dies with it: the ZIP, which stores to
// check, the pricing preferences, and the visitor's own Kroger API keys.
//
// `contextFrom(url, body, headers)` builds the settings-shaped object the rest of src/ already
// expects, applying the same defaults and the same clamps `updateSettings` used to enforce.
// It validates hard and throws 400s: a malformed request from one visitor must never become a
// 500, and can never touch another visitor.
import { STORE_BY_ID, CORE_STORE_IDS } from '../shared/stores.js';
import { validZip } from './geo.js';

export const DEFAULTS = {
  zip: null,
  stores: CORE_STORE_IDS,
  prime: false, // count Whole Foods Prime prices as the price
  cardPrices: true, // count loyalty-card / digital prices (Mariano's card, Jewel for U) as the price
  maxMiles: 25, // how far to look for stores
  resultsPerStore: 36,
  overrides: {}, // { storeId: { zip } } shop a different location for one chain
};

// Ranges, kept identical to what the old updateSettings() clamped to.
export const LIMITS = {
  maxMiles: { min: 3, max: 50 },
  resultsPerStore: { min: 8, max: 60 },
  stores: { max: 24 },
  overrides: { max: 24 },
  query: { max: 100 },
  listItems: { max: 60 },
  krogerKey: { max: 256 },
};

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/** A value from the JSON body if present, else the query string. Body wins so POSTs can send arrays. */
function pick(key, body, params) {
  if (body && Object.prototype.hasOwnProperty.call(body, key) && body[key] != null) return body[key];
  const v = params.get(key);
  return v == null ? undefined : v;
}

function asBool(v, fallback) {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(s)) return false;
  return fallback;
}

function asClampedInt(v, { min, max }, fallback, label) {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${label} must be a number`);
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v === undefined || v === null) return [];
  return String(v)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseZip(v, label = 'ZIP code') {
  const z = String(v ?? '').trim();
  if (!z) return null;
  if (!validZip(z)) throw bad(`Enter a 5-digit ${label}`);
  return z;
}

function parseStores(v) {
  const ids = asList(v);
  if (!ids.length) return null; // caller falls back to the default set
  if (ids.length > LIMITS.stores.max) throw bad(`Too many stores (max ${LIMITS.stores.max})`);
  const out = [];
  for (const id of ids) {
    if (!STORE_BY_ID[id]) throw bad(`Unknown store “${String(id).slice(0, 40)}”`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Per-chain ZIP overrides. Accepts either the object form (JSON body)
 *   { mariano: { zip: '60601' } }  or  { mariano: '60601' }
 * or the compact query form
 *   overrides=mariano:60601,jewel:60614
 */
function parseOverrides(v) {
  if (v === undefined || v === null || v === '') return {};
  const out = {};
  const add = (id, zip) => {
    if (!STORE_BY_ID[id]) throw bad(`Unknown store “${String(id).slice(0, 40)}” in overrides`);
    const z = parseZip(zip, `ZIP code for ${STORE_BY_ID[id].name}`);
    if (z) out[id] = { zip: z };
  };
  if (typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v);
    if (entries.length > LIMITS.overrides.max) throw bad('Too many store overrides');
    for (const [id, val] of entries) add(id, typeof val === 'string' ? val : val?.zip);
    return out;
  }
  const parts = asList(v);
  if (parts.length > LIMITS.overrides.max) throw bad('Too many store overrides');
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) throw bad(`Bad override “${p.slice(0, 40)}” — use storeId:zip`);
    add(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return out;
}

/**
 * The visitor's Kroger keys.
 *
 * They travel in request HEADERS, never in the query string or the URL: query strings are written
 * verbatim into access logs, proxy logs, Referer headers and browser history, and a client secret
 * must not end up in any of those. Headers are not logged by default in the common log formats.
 * They are used for the lifetime of this request only and are never written to disk.
 */
function parseKroger(headers = {}) {
  const get = (k) => {
    const v = typeof headers.get === 'function' ? headers.get(k) : headers[k];
    return String(v ?? '').trim();
  };
  const clientId = get('x-kroger-client-id');
  const clientSecret = get('x-kroger-client-secret');
  if (clientId.length > LIMITS.krogerKey.max || clientSecret.length > LIMITS.krogerKey.max) throw bad('Kroger key looks too long');
  // Both or neither. A half-configured pair is simply "not configured" rather than an error, so a
  // stray header can never break an otherwise valid search.
  if (!clientId || !clientSecret) return { clientId: '', clientSecret: '' };
  return { clientId, clientSecret };
}

/**
 * Build the per-request context. Never reads or writes any stored state.
 * Throws a 400-tagged Error for anything malformed.
 */
export function contextFrom(url, body = null, headers = {}) {
  const params = url?.searchParams ?? new URLSearchParams();
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;

  const zip = parseZip(pick('zip', b, params));
  const stores = parseStores(pick('stores', b, params));
  const miles = pick('maxMiles', b, params) ?? pick('miles', b, params);

  return {
    zip,
    stores: stores || DEFAULTS.stores,
    storesExplicit: !!stores,
    prime: asBool(pick('prime', b, params), DEFAULTS.prime),
    cardPrices: asBool(pick('cardPrices', b, params), DEFAULTS.cardPrices),
    maxMiles: asClampedInt(miles, LIMITS.maxMiles, DEFAULTS.maxMiles, 'Distance'),
    resultsPerStore: asClampedInt(pick('resultsPerStore', b, params), LIMITS.resultsPerStore, DEFAULTS.resultsPerStore, 'Results per store'),
    overrides: parseOverrides(pick('overrides', b, params)),
    kroger: parseKroger(headers),
    fresh: asBool(params.get('fresh') ?? (b ? b.fresh : undefined), false),
  };
}

/** Same context, but the endpoint cannot work without a ZIP. */
export function requireZip(ctx) {
  if (!ctx.zip) throw bad('Set your ZIP code first');
  return ctx.zip;
}

/** The ZIP to use for one chain: its override, or the visitor's main ZIP. */
export function storeZip(ctx, storeId) {
  return ctx.overrides?.[storeId]?.zip || ctx.zip;
}

/** A search query, trimmed to a sane length. */
export function queryFrom(url, body = null) {
  const params = url?.searchParams ?? new URLSearchParams();
  const raw = pick('q', body && typeof body === 'object' ? body : null, params);
  const q = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.query.max);
  if (!q) throw bad('Type something to search for');
  return q;
}
