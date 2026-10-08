// App actions shared by views.
//
// The server is a stateless price proxy, so every call that needs to know where you shop carries
// it: `contextParams()` turns this visitor's saved settings into query parameters, and
// `krogerHeaders()` puts their Kroger keys in request headers (never in a URL). Anything that used
// to be a server round-trip to save state is now a local write in store.js.
import { api, searchStream } from './api.js';
import {
  getState, setState, toast, hydrate, saveSettings as persistSettings, saveList, saveWatches,
  rememberSearch, clearRecent, exportBundle, importBundle, decorateWatch, snapRadius,
} from './store.js';
import { STORE_BY_ID, assignSlots, slotFor } from '/shared/stores.js';

// ---------------- routing ----------------
export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const name = ['compare', 'sales', 'watch', 'list', 'settings'].includes(path) ? path : 'compare';
  return { name, params };
}

export function go(name, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const target = `#/${name}${qs ? `?${qs}` : ''}`;
  if (location.hash !== target) location.hash = target;
}

// ---------------- request context ----------------
/** This visitor's settings as query parameters. Never includes the Kroger secret. */
export function contextParams(extra = {}) {
  const s = getState().settings || {};
  const p = new URLSearchParams();
  if (s.zip) p.set('zip', s.zip);
  if (s.stores?.length) p.set('stores', s.stores.join(','));
  p.set('prime', s.prime ? '1' : '0');
  p.set('cardPrices', s.cardPrices === false ? '0' : '1');
  p.set('resultsPerStore', String(s.resultsPerStore ?? 36));
  // The radius always leaves as one of the five we offer, whatever is in storage, so the value the
  // server applies is the value this browser thinks it asked for.
  p.set('miles', String(snapRadius(s.maxMiles)));
  const ov = Object.entries(s.overrides || {}).map(([id, v]) => `${id}:${v.zip}`);
  if (ov.length) p.set('overrides', ov.join(','));
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || v === false) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  return p;
}

/** The same context for a JSON body (POST endpoints). */
export function contextBody(extra = {}) {
  const s = getState().settings || {};
  return {
    zip: s.zip || undefined,
    stores: s.stores?.length ? s.stores : undefined,
    prime: !!s.prime,
    cardPrices: s.cardPrices !== false,
    resultsPerStore: s.resultsPerStore ?? 36,
    maxMiles: snapRadius(s.maxMiles),
    overrides: s.overrides && Object.keys(s.overrides).length ? s.overrides : undefined,
    ...extra,
  };
}

/**
 * The visitor's Kroger keys, as request headers.
 * Headers, not query parameters: a client secret in a URL ends up in server access logs, proxy
 * logs, Referer headers and browser history. The server uses them for that one request and never
 * writes them anywhere.
 */
export function krogerHeaders() {
  const k = getState().settings?.kroger;
  if (!k?.clientId || !k?.clientSecret) return undefined;
  return { 'x-kroger-client-id': k.clientId, 'x-kroger-client-secret': k.clientSecret };
}

export function hasKrogerKeys() {
  const k = getState().settings?.kroger;
  return !!(k?.clientId && k?.clientSecret);
}

// ---------------- boot ----------------
/** What this browser has saved, loaded before the first render: no network, so the first frame
 * the app draws is already the right screen (and matches the first screen in index.html). */
export function bootLocal() {
  const own = hydrate();
  setState({ ready: true, stores: buildStores(null, own.settings) });
  return own;
}
/**
 * Load this visitor's own data, then ask the server what it can do. The server part is optional:
 * a fresh visitor with no data still gets onboarding even if /api/state is slow.
 */
export async function boot(own = bootLocal()) {
  try {
    const s = await api('/api/state');
    setState({ server: s, counts: s.counts, health: s.health });
  } catch (err) {
    setState({ serverError: err.message });
  }
  return own;
}

// ---------------- stores ----------------
/**
 * The store rows the views render: what the directory actually found near this ZIP, merged with
 * what this visitor has switched on. The server used to build this from its one settings row.
 */
export function buildStores(dir = null, settings = null) {
  const s = settings || getState().settings || {};
  const enabled = s.stores || [];
  const near = dir ? new Map(dir.chains.map((c) => [c.id, c])) : null;
  const ids = near ? [...near.keys()] : enabled.length ? enabled : [];
  const slots = assignSlots(enabled.length ? enabled : ids);
  return ids
    .filter((id) => STORE_BY_ID[id])
    .map((id) => {
      const store = STORE_BY_ID[id];
      const found = near?.get(id) || null;
      const src = sourceTypeFor(id, s);
      return {
        id, name: store.name, short: store.short,
        slot: slots[id] ?? slotFor(id),
        note: found?.note || store.note || null,
        enabled: enabled.includes(id),
        priceSource: found && found.status === 'adsOnly' ? null : src,
        // 'shelf' = in-store price, 'online' = delivery listing that can run higher, 'adsOnly' = circular only
        basis: found?.status || (src ? 'online' : null),
        distance: found?.distance ?? null,
        address: found?.address ?? null,
        hasAds: found ? found.hasAds : !!(store.ads && store.ads.length),
        canUseKroger: store.alt?.type === 'kroger',
        zipOverride: s.overrides?.[id]?.zip || null,
      };
    });
}

/** Mirrors src/search.js sourceFor: the Kroger API wins for a chain that supports it, if keys are set. */
function sourceTypeFor(storeId, settings) {
  const store = STORE_BY_ID[storeId];
  if (!store) return null;
  const k = settings?.kroger;
  if (store.alt?.type === 'kroger' && k?.clientId && k?.clientSecret) return 'kroger';
  return store.price?.type || null;
}

export function enabledPriceStores() {
  return getState().stores.filter((s) => s.enabled);
}

/** Which chains exist near the saved ZIP, and how each one can be priced. */
export async function loadDirectory(fresh = false) {
  const s = getState().settings;
  if (!s?.zip) return null;
  setState({ directoryLoading: true });
  try {
    const dir = await api(`/api/directory?${contextParams({ fresh })}`);
    setState({
      directory: dir,
      directoryLoading: false,
      directoryError: null,
      place: { city: dir.city, state: dir.state, zip: dir.zip },
      stores: buildStores(dir),
    });
    return dir;
  } catch (err) {
    setState({ directoryLoading: false, directoryError: err.message });
    return null;
  }
}

// ---------------- settings ----------------
/**
 * Save settings in this browser. Nothing leaves the machine; the only network work is re-reading
 * what changed (the store directory after a move, store locations after a store change).
 */
export async function saveSettings(patch, { quiet = false } = {}) {
  const before = getState().settings || {};
  const settings = persistSettings(patch);
  const movedTo = settings.zip && settings.zip !== before.zip;
  // A new ZIP re-runs discovery anyway, and it will use the new radius when it does, so only treat
  // the radius as "changed" when the ZIP stayed put. Compare the SNAPPED values: two stored numbers
  // that land on the same rung produce the same directory, and re-probing for that is free traffic
  // to the retailers.
  const radiusChanged = !movedTo && !!settings.zip && snapRadius(settings.maxMiles) !== snapRadius(before.maxMiles);
  setState({ stores: buildStores(getState().directory, settings) });

  if (movedTo) {
    // A new ZIP means a different set of stores entirely.
    setState({ locations: null, deals: {}, search: null, plan: null, directory: null, place: null });
    const dir = await loadDirectory(true);
    if (dir && !Array.isArray(patch.stores)) {
      // Unless this change picked stores explicitly, switch on the ones that are actually nearby —
      // but KEEP the ones the visitor had chosen that are still priceable at the new ZIP. Taking
      // `suggested` wholesale discarded real choices for no reason: moving 60618 -> 60148 dropped
      // Costco, which is 3.2 mi from Lombard, and Cermak, which is 16.7 mi, both well inside the
      // radius and both still in the new directory. Adding is fine, silently removing is not, so
      // the visitor is told what changed either way.
      const priceable = new Map(dir.chains.filter((c) => c.status !== 'adsOnly').map((c) => [c.id, c]));
      const before = getState().settings.stores || [];
      const kept = before.filter((id) => priceable.has(id));
      const added = (dir.suggested || []).filter((id) => !kept.includes(id));
      const stores = [...kept, ...added];
      const dropped = before.filter((id) => !priceable.has(id));
      const next = persistSettings({ stores });
      setState({ stores: buildStores(dir, next) });
      const name = (id) => dir.chains.find((c) => c.id === id)?.short || id;
      const parts = [];
      if (added.length) parts.push(`Added ${added.map(name).join(', ')}`);
      if (dropped.length) parts.push(`dropped ${dropped.map(name).join(', ')} — no longer priceable here`);
      if (parts.length) toast(`${parts.join('; ')}.`);
    }
    loadLocations();
  } else if (radiusChanged) {
    // A different radius is a different set of stores, so discovery has to run again.
    //
    // Deliberately NOT a `fresh` reload: each radius has its own cached directory entry, so going
    // back to a radius you have already used costs the retailers nothing. Only "Re-locate" bypasses
    // the cache, because only there has the visitor actually asked for a re-check.
    setState({ locations: null, deals: {}, search: null, plan: null });
    // Which enabled stores were already weekly-ad-only BEFORE the radius moved. Narrowing must not
    // undo a deliberate choice to keep a circular-only chain switched on.
    const wasAdsOnly = new Set((getState().stores || []).filter((s) => s.basis === 'adsOnly').map((s) => s.id));
    const dir = await loadDirectory();
    if (dir && !Array.isArray(patch.stores)) {
      // Narrowing can leave a store switched on that is now outside the radius. A store that is too
      // far does not disappear from the directory — if it publishes a circular for this ZIP it
      // comes back as weekly-ad-only — so the Stores list quietly stops calling it a price source
      // while contextParams keeps sending it and every search keeps pricing a store the visitor
      // just said was too far away. Switch those off.
      //
      // Widening never switches anything on by itself. The chains a wider radius turns up are
      // further away, and quietly adding them would both surprise the visitor and multiply the
      // requests every later search makes to the retailers.
      const near = new Map(dir.chains.map((c) => [c.id, c]));
      const current = getState().settings.stores || [];
      const kept = current.filter((id) => {
        const c = near.get(id);
        if (!c) return false; // not near you at all any more
        return c.status !== 'adsOnly' || wasAdsOnly.has(id); // now too far to price
      });
      if (kept.length !== current.length) {
        const next = persistSettings({ stores: kept });
        setState({ stores: buildStores(dir, next) });
      }
    }
    loadLocations();
  } else if (patch.stores || patch.overrides || patch.kroger) {
    setState({ locations: null, deals: {}, search: null, plan: null });
    loadLocations();
  }
  if (!quiet) toast('Settings saved');
  return getState().settings;
}

export async function loadLocations(fresh = false) {
  const s = getState().settings;
  if (!s?.zip) return;
  // With every store switched off there is nothing to resolve, but returning early left
  // `locations` at null — which settings.js reads as "still loading" and renders as a spinner that
  // can never resolve, under two counts that both said 0 and a prompt to set a ZIP that was
  // already set. An empty answer is an answer: record it so the page can say so.
  if (!s.stores?.length) {
    setState({ locations: {} });
    return;
  }
  try {
    const loc = await api(`/api/locations?${contextParams({ fresh })}`, { headers: krogerHeaders() });
    setState({ locations: loc });
  } catch (err) {
    setState({ locations: { _error: err.message } });
  }
}

// ---------------- search ----------------
let cancelSearch = null;

export function runSearch(q, { fresh = false, only = null } = {}) {
  q = String(q || '').trim().replace(/\s+/g, ' ');
  if (!q) return;
  const st = getState();
  if (!st.settings?.zip) {
    toast('Set your ZIP code first', { kind: 'bad' });
    go('settings');
    return;
  }
  const partial = only && st.search?.q?.toLowerCase() === q.toLowerCase();
  if (!partial) cancelSearch?.();
  const ids = only || enabledPriceStores().map((s) => s.id);
  if (partial) {
    const results = { ...st.search.results };
    for (const id of only) results[id] = { storeId: id, status: 'loading' };
    setState({ search: { ...st.search, results, done: false } });
  } else {
    const results = {};
    for (const id of ids) results[id] = { storeId: id, status: 'loading' };
    setState({ search: { q, results, ads: null, done: false, startedAt: Date.now(), error: null, fresh } });
    rememberSearch(q); // recent searches are yours: they stay in this browser
    go('compare', { q });
  }
  const params = contextParams({ q, fresh });
  if (only?.length) params.set('stores', only.join(','));
  const close = searchStream(`/api/search?${params}`, {
    headers: krogerHeaders(),
    onStore: (r) => {
      const cur = getState().search;
      if (!cur || cur.q !== (partial ? st.search.q : q)) return;
      setState({ search: { ...cur, results: { ...cur.results, [r.storeId]: r } } });
    },
    onAds: (d) => {
      const cur = getState().search;
      if (!cur) return;
      if (partial) return; // keep existing ads on partial refresh
      setState({ search: { ...cur, ads: d.deals || [], adsError: d.error || null } });
    },
    onDone: (d) => {
      const cur = getState().search;
      if (!cur) return;
      setState({ search: { ...cur, done: true, ms: d.ms } });
    },
    onError: (err) => {
      const cur = getState().search;
      if (!cur) return;
      const results = { ...cur.results };
      for (const [id, r] of Object.entries(results)) if (r.status === 'loading') results[id] = { storeId: id, status: 'error', error: err.message, items: [] };
      setState({ search: { ...cur, results, done: true, error: err.message } });
    },
  });
  if (!partial) cancelSearch = close;
}

export function forgetSearches() {
  clearRecent();
}

// ---------------- watches ----------------
// A watchlist is a list of things one person buys, so it lives here. The server only answers
// "what does this cost right now"; the history, the targets and the alerts are all local.

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function putWatch(w) {
  const cur = getState().watches || [];
  const decorated = decorateWatch(w);
  const next = cur.some((x) => x.id === w.id) ? cur.map((x) => (x.id === w.id ? decorated : x)) : [decorated, ...cur];
  saveWatches(next);
  return decorated;
}

export function removeWatch(id) {
  saveWatches((getState().watches || []).filter((w) => w.id !== id));
}

export function updateWatch(id, patch) {
  const w = (getState().watches || []).find((x) => x.id === id);
  if (!w) return null;
  return putWatch({ ...w, ...patch });
}

export async function addWatch(body, { quiet = false } = {}) {
  const query = String(body.query || '').trim();
  if (!query) return null;
  const w = {
    id: newId(),
    query,
    label: (body.label ? String(body.label).trim() : '') || query,
    include: toWords(body.include),
    exclude: toWords(body.exclude),
    dim: body.dim || null,
    displayUnit: body.displayUnit || null,
    target: numOrNull(body.target),
    createdAt: Date.now(),
    lastChecked: null,
    lastError: null,
    result: null,
    points: [],
  };
  putWatch(w);
  if (!quiet) toast('Added to your watchlist', { action: { label: 'View', run: () => go('watch') } });
  try {
    return await refreshWatch(w.id);
  } catch (err) {
    toast(err.message, { kind: 'bad' });
    return getState().watches.find((x) => x.id === w.id);
  }
}

/** Re-price one watched item and append a history point per store. */
export async function refreshWatch(id, { fresh = false } = {}) {
  const w = (getState().watches || []).find((x) => x.id === id);
  if (!w) return null;
  putWatch({ ...w, checking: true });
  try {
    const r = await api('/api/watch/check', {
      method: 'POST',
      headers: krogerHeaders(),
      body: contextBody({ query: w.query, include: w.include, exclude: w.exclude, dim: w.dim, fresh }),
    });
    const cur = (getState().watches || []).find((x) => x.id === id) || w;
    return putWatch({
      ...cur,
      checking: false,
      result: r.result,
      lastChecked: r.checkedAt,
      lastError: r.error,
      dim: cur.dim || r.result.dim || null,
      displayUnit: cur.displayUnit || r.suggestedUnit || null,
      points: [...(cur.points || []), ...(r.points || [])],
    });
  } catch (err) {
    const cur = (getState().watches || []).find((x) => x.id === id) || w;
    putWatch({ ...cur, checking: false, lastError: err.message });
    throw err;
  }
}

/**
 * Re-check everything that has gone stale, on load.
 *
 * There is no background timer on the web: when the tab is closed nothing runs, and pretending
 * otherwise would be a lie. Watches are re-checked when you open the app and they are older than
 * your chosen interval, or when you press Re-check. Checks are spaced out so we stay as light on
 * the stores' sites as the old server-side scheduler was.
 */
export async function refreshStaleWatches() {
  const s = getState().settings;
  if (!s?.zip) return;
  const dueMs = (s.watchRefreshHours || 12) * 3600 * 1000;
  const due = (getState().watches || []).filter((w) => !w.lastChecked || Date.now() - w.lastChecked > dueMs);
  if (!due.length) return;
  await runWatchQueue(due.map((w) => w.id), { fresh: false });
}

export async function refreshAllWatches() {
  const ids = (getState().watches || []).map((w) => w.id);
  if (!ids.length) return;
  await runWatchQueue(ids, { fresh: true });
}

let watchQueueRunning = false;
export function watchesRefreshing() {
  return watchQueueRunning;
}

async function runWatchQueue(ids, opts) {
  if (watchQueueRunning) return;
  watchQueueRunning = true;
  setState({ watchesRefreshing: true });
  try {
    for (const id of ids) {
      try {
        await refreshWatch(id, opts);
      } catch {
        /* the error is recorded on the watch itself */
      }
      await new Promise((r) => setTimeout(r, 2500)); // same spacing the server scheduler used
    }
  } finally {
    watchQueueRunning = false;
    setState({ watchesRefreshing: false });
  }
}

function toWords(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = +v;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------- shopping list ----------------
export function addToList(body) {
  const text = String(body.text || '').trim().slice(0, 120);
  if (!text) return null;
  const qty = Math.max(1, Math.min(99, Math.round(+body.qty || 1)));
  const item = { id: newId(), text, qty, pinned: body.pinned || null, done: false, addedAt: Date.now() };
  saveList([...(getState().list || []), item]);
  setState({ plan: null });
  toast(`Added “${item.text}” to your list`, { action: { label: 'View list', run: () => go('list') } });
  return item;
}

/** Add several items at once (a holiday's starter list), skipping any already on the list. */
export function addManyToList(texts, { label = 'items' } = {}) {
  const have = new Set((getState().list || []).map((i) => i.text.trim().toLowerCase()));
  const fresh = [...new Set(texts.map((t) => String(t || '').trim()).filter(Boolean))].filter((t) => !have.has(t.toLowerCase()));
  if (fresh.length) {
    saveList([...(getState().list || []), ...fresh.map((text) => ({ id: newId(), text, qty: 1, pinned: null, done: false, addedAt: Date.now() }))]);
    setState({ plan: null });
  }
  toast(fresh.length ? `Added ${fresh.length} ${label} to your list` : 'Those are already on your list', { action: { label: 'View list', run: () => go('list') } });
  return fresh.length;
}

export function updateListItem(id, patch) {
  const next = (getState().list || []).map((i) => (i.id === id ? { ...i, ...patch } : i));
  saveList(next);
  if (!('done' in patch)) setState({ plan: null });
  return next.find((i) => i.id === id);
}

export function removeListItem(id) {
  saveList((getState().list || []).filter((i) => i.id !== id));
  setState({ plan: null });
}

export function clearDoneItems() {
  saveList((getState().list || []).filter((i) => !i.done));
}

/** Price the open items at every store and plan the trip. The list is sent, never stored. */
export async function optimizeList({ fresh = false } = {}) {
  const items = (getState().list || []).filter((i) => !i.done).map((i) => ({ id: i.id, text: i.text, qty: i.qty, pinned: i.pinned || undefined }));
  const r = await api('/api/list/optimize', {
    method: 'POST',
    headers: krogerHeaders(),
    body: contextBody({ items, fresh }),
  });
  setState({ plan: r });
  return r;
}

// ---------------- export / import ----------------
/** Your data lives only in this browser, so you get a way to take it with you. */
export function exportMyData() {
  const bundle = exportBundle();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cartworth-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return bundle;
}

export async function importMyData(file, { merge = false } = {}) {
  const text = await file.text();
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON');
  }
  const summary = importBundle(bundle, { merge });
  const s = getState().settings;
  setState({ stores: buildStores(getState().directory, s), plan: null, deals: {}, search: null, locations: null });
  if (s?.zip) {
    await loadDirectory();
    loadLocations();
  }
  return summary;
}
