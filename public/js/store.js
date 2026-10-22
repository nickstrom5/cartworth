// Tiny global store with a Preact hook, plus this visitor's own data.
//
// Cartworth's server is a stateless price proxy: it knows nothing about who is asking. So
// everything personal — your ZIP, which stores you check, your pricing preferences, your Kroger
// keys, your shopping list, your watchlist and its price history, and your recent searches — lives
// here, in your browser, under versioned localStorage keys.
//
// Every read and every write is wrapped. In private browsing, with site data blocked, or when the
// quota is full, localStorage throws; when that happens we fall back to an in-memory copy so the
// app keeps working for this tab and say so once in the UI, rather than breaking.
import { useEffect, useReducer } from '/vendor/preact-hooks.mjs';
import { DISPLAY_UNITS } from '/shared/units.js';

// ---------------------------------------------------------------- storage
const NS = 'cartworth:v1:';
export const STORAGE_KEYS = {
  settings: `${NS}settings`,
  list: `${NS}list`,
  watches: `${NS}watches`,
  recent: `${NS}recent`,
  prefs: `${NS}pref:`,
};

const memory = new Map(); // fallback when localStorage is unavailable
let storageWorks = true;
let storageNoted = false;

function rawGet(key) {
  try {
    const v = localStorage.getItem(key);
    if (v != null) return v;
  } catch {
    storageWorks = false;
  }
  return memory.has(key) ? memory.get(key) : null;
}

function rawSet(key, value) {
  memory.set(key, value); // always keep the in-memory copy, so this tab is consistent either way
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    storageWorks = false;
    noteStorageProblem(err);
    return false;
  }
}

function rawRemove(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    storageWorks = false;
  }
}

function noteStorageProblem(err) {
  if (storageNoted) return;
  storageNoted = true;
  const quota = /quota|exceed/i.test(err?.name || err?.message || '');
  setState({
    storageWarning: quota
      ? 'Your browser storage is full, so changes are only kept until you close this tab. Export your data, then clear some site data.'
      : 'Your browser is not letting Cartworth save anything (private browsing or blocked site data), so changes are only kept until you close this tab.',
  });
}

export function readJSON(key, fallback) {
  const raw = rawGet(key);
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    if (v == null) return fallback;
    // Parsing is not validation. Storage can hold syntactically valid JSON of entirely the wrong
    // shape: an older build's format, a half-finished migration, or another tab writing the same
    // key. Returning it anyway meant hydrate() called .filter on an object and the app booted to a
    // dead error screen with no way out except clearing site data by hand.
    if (Array.isArray(fallback) && !Array.isArray(v)) return fallback;
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
      if (typeof v !== 'object' || Array.isArray(v)) return fallback;
    }
    return v;
  } catch {
    return fallback; // corrupt entry: start over rather than crash
  }
}

export function writeJSON(key, value) {
  try {
    return rawSet(key, JSON.stringify(value));
  } catch {
    return false; // unserializable value (cycles); never worth breaking a click over
  }
}

export function storageHealthy() {
  return storageWorks;
}

// ---------------------------------------------------------------- settings
/** Mirrors src/context.js DEFAULTS, so the browser and the server agree on what "unset" means. */
export const SETTINGS_DEFAULTS = {
  zip: null,
  stores: [],
  prime: false,
  cardPrices: true,
  maxMiles: 25,
  resultsPerStore: 36,
  overrides: {},
  watchRefreshHours: 12, // how stale a watch may get before it is re-checked on load
  kroger: { clientId: '', clientSecret: '' },
};

const clamp = (n, min, max, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
};

/**
 * The search radii Cartworth offers, in miles.
 *
 * Same ladder as the iPhone picker (ios/App/UI/Settings/SettingsView.swift), so the two products
 * behave the same rather than each having its own idea of "near you". test/qa-search-radius.test.js
 * pins the two lists together.
 */
export const RADIUS_MILES = [5, 10, 15, 25, 40];

/**
 * Put any value onto that ladder.
 *
 * `sanitizeSettings` clamps `maxMiles` to the range the SERVER accepts (src/context.js LIMITS,
 * 3–50), because the browser and the server have to agree on what "too much" means. This is the
 * narrower, product-level rule on top of it: whatever is stored, the radius actually used is one
 * of the five we offer.
 *
 * A value between two rungs snaps DOWN, never up: searching wider than someone asked would put a
 * store on screen that is further away than the radius they chose. Below the smallest rung we
 * return 5, which is the narrowest search either product offers; every response reports the radius
 * that was actually applied, so nothing on screen ever claims a radius that was not used.
 */
export function snapRadius(v) {
  const n = Number(v);
  const min = RADIUS_MILES[0];
  const max = RADIUS_MILES[RADIUS_MILES.length - 1];
  if (!Number.isFinite(n)) return SETTINGS_DEFAULTS.maxMiles;
  if (n <= min) return min;
  if (n >= max) return max;
  let out = min;
  for (const m of RADIUS_MILES) if (m <= n) out = m;
  return out;
}

/** Same clamps the server enforces, applied before anything is saved or sent. */
export function sanitizeSettings(raw = {}) {
  const s = { ...SETTINGS_DEFAULTS, ...raw };
  s.zip = /^\d{5}$/.test(String(raw.zip ?? '').trim()) ? String(raw.zip).trim() : null;
  s.stores = Array.isArray(raw.stores) ? [...new Set(raw.stores.filter((x) => typeof x === 'string' && x))].slice(0, 24) : [];
  s.prime = !!raw.prime;
  s.cardPrices = raw.cardPrices !== false;
  // The server's bound (src/context.js LIMITS.maxMiles), deliberately kept identical so the two
  // never disagree about what is out of range. The radius CONTROL is narrower than this — see
  // RADIUS_MILES / snapRadius above — and an out-of-ladder value that survives here (an old export,
  // a hand-edited key) is snapped before it is used or shown, never used as-is.
  s.maxMiles = clamp(raw.maxMiles, 3, 50, 25);
  s.resultsPerStore = clamp(raw.resultsPerStore, 8, 60, 36);
  s.watchRefreshHours = clamp(raw.watchRefreshHours, 2, 168, 12);
  s.overrides = {};
  for (const [id, v] of Object.entries(raw.overrides || {}).slice(0, 24)) {
    const z = String(typeof v === 'string' ? v : v?.zip ?? '').trim();
    if (/^\d{5}$/.test(z)) s.overrides[id] = { zip: z };
  }
  s.kroger = {
    clientId: String(raw.kroger?.clientId ?? '').trim().slice(0, 256),
    clientSecret: String(raw.kroger?.clientSecret ?? '').trim().slice(0, 256),
  };
  return s;
}

const MAX_RECENT = 40;
const MAX_LIST = 200;
const MAX_WATCHES = 60;
const MAX_POINTS = 400; // per watch
const POINT_MAX_AGE = 120 * 86400000;

/**
 * `lowUnit` and `alert` are derived from the points and the last result, so they are recomputed
 * every time a watch is read or written and never trusted from storage — a saved alert would go on
 * claiming "lowest price ever" long after it stopped being true.
 */
export function decorateWatch(w) {
  const points = (Array.isArray(w.points) ? w.points : []).filter((p) => p && Number.isFinite(p.t)).slice(-MAX_POINTS);
  const lowUnit = points.reduce((m, p) => (p.unit != null && (m == null || p.unit < m) ? p.unit : m), null);
  const out = { ...w, id: String(w.id), points, lowUnit };
  out.alert = alertFor(out);
  return out;
}

function alertFor(w) {
  const best = w.result?.best;
  if (!best) return null;
  const factor = DISPLAY_UNITS[w.displayUnit]?.factor;
  // The best price may be a store's saved copy (the store did not answer this time): say so, and
  // never call it the lowest price seen, because it is not a new reading.
  const saved = w.result.stores?.[best.storeId]?.savedAt;
  const savedTail = saved == null ? '' : ` (a saved price${saved ? ` from ${new Date(saved).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}; the store did not answer just now)`;
  if (w.target != null && factor && best.unitPerBase * factor <= w.target + 1e-9) {
    return { kind: 'target', storeId: best.storeId, message: `At or below your target at ${best.storeName}${savedTail}` };
  }
  if (saved != null) return null;
  // "Lowest seen" only means something once there is something to compare against, and that means
  // several separate checks — not several stores checked once. Each check writes one point per
  // store, so count distinct check times, not points.
  const checks = new Set(w.points.map((p) => p.t)).size;
  if (w.lowUnit != null && checks > 3 && best.unitPerBase <= w.lowUnit + 1e-9) {
    return { kind: 'low', storeId: best.storeId, message: 'Lowest price seen since you started tracking' };
  }
  return null;
}

// ---------------------------------------------------------------- state
const state = {
  ready: false,
  settings: null,
  place: null,
  stores: [],
  recent: [],
  counts: null,
  locations: null,
  route: { name: 'compare', params: {} },
  toasts: [],
  modal: null,
  storageWarning: null,
  // compare
  search: null, // { q, startedAt, results: {storeId: {...}}, ads, done, error }
  // cached tab data
  deals: {}, // week -> response
  watches: null,
  list: null,
  plan: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  Object.assign(state, next);
  for (const l of [...listeners]) l();
}

export function useStore(selector = (s) => s) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return selector(state);
}

// ---------------------------------------------------------------- per-visitor data
/** Hydrate everything this visitor has saved. Safe to call before the server is reachable. */
export function hydrate() {
  const settings = sanitizeSettings(readJSON(STORAGE_KEYS.settings, {}));
  const list = (readJSON(STORAGE_KEYS.list, []) || []).filter((i) => i && i.text).slice(0, MAX_LIST);
  const watches = (readJSON(STORAGE_KEYS.watches, []) || []).filter((w) => w && w.query).slice(0, MAX_WATCHES).map(decorateWatch);
  const recent = (readJSON(STORAGE_KEYS.recent, []) || []).filter((r) => r && r.q).slice(0, MAX_RECENT);
  setState({ settings, list, watches, recent });
  if (!storageWorks) noteStorageProblem(new Error('unavailable'));
  return { settings, list, watches, recent };
}

export function saveSettings(patch) {
  const settings = sanitizeSettings({ ...(state.settings || SETTINGS_DEFAULTS), ...patch });
  setState({ settings });
  writeJSON(STORAGE_KEYS.settings, settings);
  return settings;
}

export function saveList(items) {
  const list = (items || []).slice(0, MAX_LIST);
  setState({ list });
  writeJSON(STORAGE_KEYS.list, list);
  return list;
}

export function saveWatches(watches) {
  const cutoff = Date.now() - POINT_MAX_AGE;
  const next = (watches || []).slice(0, MAX_WATCHES).map((w) =>
    decorateWatch({ ...w, points: (w.points || []).filter((p) => p.t > cutoff) }));
  setState({ watches: next });
  writeJSON(STORAGE_KEYS.watches, next);
  return next;
}

export function rememberSearch(q) {
  const term = String(q || '').trim().toLowerCase();
  if (!term) return state.recent;
  const rest = (state.recent || []).filter((r) => r.q !== term);
  const prev = (state.recent || []).find((r) => r.q === term);
  const recent = [{ q: term, count: (prev?.count || 0) + 1, last_at: Date.now() }, ...rest].slice(0, MAX_RECENT);
  setState({ recent });
  writeJSON(STORAGE_KEYS.recent, recent);
  return recent;
}

export function clearRecent() {
  setState({ recent: [] });
  rawRemove(STORAGE_KEYS.recent);
}

/** Everything this browser holds, as a plain object, for the JSON export. */
export function exportBundle() {
  return {
    app: 'cartworth',
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings || SETTINGS_DEFAULTS,
    list: state.list || [],
    watches: state.watches || [],
    recent: state.recent || [],
  };
}

/**
 * Replace (or merge into) this browser's data from an exported file.
 * Returns a short summary so the UI can say what actually landed.
 */
export function importBundle(bundle, { merge = false } = {}) {
  if (!bundle || typeof bundle !== 'object') throw new Error('That file is not a Cartworth export');
  if (bundle.app && bundle.app !== 'cartworth') throw new Error('That file was exported by a different app');
  const settings = sanitizeSettings(bundle.settings || {});
  const list = (Array.isArray(bundle.list) ? bundle.list : []).filter((i) => i && i.text);
  const watches = (Array.isArray(bundle.watches) ? bundle.watches : []).filter((w) => w && w.query).map(decorateWatch);
  const recent = (Array.isArray(bundle.recent) ? bundle.recent : []).filter((r) => r && r.q);

  saveSettings(merge ? { ...settings, ...stripEmpty(state.settings || {}) } : settings);
  saveList(merge ? dedupeBy([...(state.list || []), ...list], (i) => `${i.text}`.toLowerCase()) : list);
  saveWatches(merge ? dedupeBy([...(state.watches || []), ...watches], (w) => `${w.query}`.toLowerCase()) : watches);
  const mergedRecent = merge ? dedupeBy([...(state.recent || []), ...recent], (r) => r.q) : recent;
  setState({ recent: mergedRecent.slice(0, MAX_RECENT) });
  writeJSON(STORAGE_KEYS.recent, mergedRecent.slice(0, MAX_RECENT));
  return { settings: !!bundle.settings, list: list.length, watches: watches.length, recent: recent.length };
}

function stripEmpty(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
}
function dedupeBy(arr, key) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** Wipe everything this browser holds for Cartworth. */
export function forgetEverything() {
  for (const k of [STORAGE_KEYS.settings, STORAGE_KEYS.list, STORAGE_KEYS.watches, STORAGE_KEYS.recent]) rawRemove(k);
  setState({ settings: sanitizeSettings({}), list: [], watches: [], recent: [], plan: null, deals: {}, search: null, locations: null, stores: [], place: null });
}

// ---------------------------------------------------------------- toasts / modal
let toastId = 0;
export function toast(message, { kind = 'info', action, timeout = 3800 } = {}) {
  const id = ++toastId;
  setState((s) => ({ toasts: [...s.toasts, { id, message, kind, action }] }));
  setTimeout(() => dismissToast(id), timeout);
  return id;
}
export function dismissToast(id) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function openModal(modal) {
  setState({ modal });
}
export function closeModal() {
  setState({ modal: null });
}

// ---- per-browser UI conveniences (theme, sort order…) ----
// These are throwaway: losing them costs nothing, so they stay separate from the data above.
export function pref(key, fallback) {
  return readJSON(STORAGE_KEYS.prefs + key, fallback);
}
export function setPref(key, value) {
  writeJSON(STORAGE_KEYS.prefs + key, value);
}
