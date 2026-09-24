// Watchlist: your personal price book — best price across stores for things you buy often.
import { useMemo, useState } from '/vendor/preact-hooks.mjs';
import { html, StoreTag, StoreDot, Spinner, Notice, Empty, storeInfo, storeColor, useTick } from '../ui.js';
import { Icon } from '../icons.js';
import { Sparkline, LineChart, DataTable } from '../charts.js';
import { useStore, toast } from '../store.js';
import { addWatch, refreshWatch, refreshAllWatches, updateWatch, removeWatch, runSearch, addToList } from '../actions.js';
import { money2, unitPrice, unitPriceStep, unitLabel, ago, plural, BASIS_LABEL, BASIS_BADGE, BASIS_TITLE, linkDestination } from '../format.js';
import { DISPLAY_UNITS, displayUnitsFor } from '/shared/units.js';

const SUGGESTED = ['milk 1 gal', 'eggs', 'bananas', 'chicken breast', 'ground beef', 'butter', 'coffee', 'bread'];

export function WatchView() {
  const watches = useStore((s) => s.watches);
  const refreshing = useStore((s) => s.watchesRefreshing);
  const settings = useStore((s) => s.settings);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  useTick(30000);

  const add = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      await addWatch({ query: q.trim(), target: target || null }, { quiet: true });
      setQ('');
      setTarget('');
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };

  const refreshAll = async () => {
    toast('Re-checking every watched item — this takes a minute');
    refreshAllWatches();
  };

  const alerts = (watches || []).filter((w) => w.alert);
  const oldest = (watches || []).reduce((m, w) => (w.lastChecked && (m == null || w.lastChecked < m) ? w.lastChecked : m), null);

  return html`<div>
    <div class="page-head">
      <div>
        <h1>Watchlist</h1>
        <p>
          Your price book: the best price for things you buy often. Set a target to know when it’s a stock-up price.
          Prices are re-checked when you open Cartworth and an item is more than ${settings?.watchRefreshHours || 12} hours old, or when you press Re-check.
        </p>
        <p class="muted small">
          Nothing runs while this tab is closed, so there are no background alerts here — each card shows exactly when it was last checked.
          ${oldest ? html` Oldest check: ${ago(oldest)}.` : ''}
        </p>
      </div>
      ${watches?.length > 0 && html`<button class="btn btn-sm" onClick=${refreshAll} disabled=${refreshing}>${refreshing ? html`<${Spinner} size=${12} /> Checking…` : html`<${Icon} name="refresh" size=${14} /> Re-check all`}</button>`}
    </div>

    <form class="card card-pad row wrap" style=${{ gap: 8, marginBottom: 16 }} onSubmit=${add}>
      <input class="input grow" style=${{ minWidth: 200 }} placeholder="Item to watch — e.g. milk 1 gal, large eggs, 80/20 ground beef" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} aria-label="Item to watch" />
      <input class="input" style=${{ width: 150 }} inputmode="decimal" placeholder="Target (optional)" value=${target} onInput=${(e) => setTarget(e.currentTarget.value.replace(/[^\d.]/g, ''))} aria-label="Target unit price" title="Your stock-up price per unit (per gallon, per lb…). You can change the unit after it’s added." />
      <button class="btn btn-primary" type="submit" disabled=${busy || !q.trim()}>${busy ? html`<${Spinner} size=${12} />` : html`<${Icon} name="star" size=${14} />`} Watch</button>
    </form>

    ${alerts.length > 0 &&
    html`<div class="stack" style=${{ gap: 8, marginBottom: 16 }}>
      ${alerts.map(
        (w) => html`<${Notice} kind="good" icon="bolt" key=${w.id}>
          <b>${w.label}:</b> ${w.alert.message} — ${unitPrice(w.result.best.unitPerBase, w.displayUnit)?.text}/${unitLabel(w.displayUnit)}
        </${Notice}>`,
      )}
    </div>`}

    ${watches == null && html`<div class="card card-pad row"><${Spinner} /> Loading…</div>`}
    ${watches?.length === 0 &&
    html`<div class="card">
      <${Empty} icon="star" title="Nothing on your watchlist yet">
        Add the staples you restock every week. Cartworth finds the best match at each store, keeps a history, and flags when a price hits your target or its lowest level.
        <div class="chips" style=${{ justifyContent: 'center', marginTop: 12 }}>
          ${SUGGESTED.map((s) => html`<button class="chip" key=${s} onClick=${() => addWatch({ query: s }, { quiet: true })}><${Icon} name="plus" size=${12} /> ${s}</button>`)}
        </div>
      </${Empty}>
    </div>`}
    <div class="watch-grid">${(watches || []).map((w) => html`<${WatchCard} key=${w.id} w=${w} />`)}</div>
  </div>`;
}

function WatchCard({ w }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const du = w.displayUnit || (w.result?.dim ? displayUnitsFor(w.result.dim)[0] : null);
  const stores = Object.entries(w.result?.stores || {}).sort((a, b) => a[1].unitPerBase - b[1].unitPerBase);
  const best = stores[0];
  const factor = du ? DISPLAY_UNITS[du]?.factor : null;

  // best unit price per refresh (all stores checked at the same timestamp)
  const trend = useMemo(() => {
    const byT = new Map();
    for (const p of w.points || []) {
      const cur = byT.get(p.t);
      if (!cur || p.unit < cur.v) byT.set(p.t, { t: p.t, v: p.unit });
    }
    return [...byT.values()].sort((a, b) => a.t - b.t).map((p) => ({ t: p.t, v: factor ? p.v * factor : p.v }));
  }, [w.points, factor]);

  const refresh = async () => {
    setBusy(true);
    try {
      await refreshWatch(w.id, { fresh: true });
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const remove = () => {
    if (!confirm(`Stop watching “${w.label}”? Its history will be deleted from this browser.`)) return;
    removeWatch(w.id);
  };

  const bestShown = best && du ? unitPrice(best[1].unitPerBase, du) : null;
  const vsTarget = w.target != null && bestShown ? bestShown.value - w.target : null;
  const lowShown = w.lowUnit != null && factor ? unitPrice(w.lowUnit, du) : null;

  return html`<div class=${`card wcard${w.alert ? ' alert' : ''}`}>
    <div class="row" style=${{ alignItems: 'flex-start' }}>
      <div class="grow">
        <div style=${{ fontWeight: 650, fontSize: 16 }}>${w.label}</div>
        <div class="muted small">
          ${w.label !== w.query && html`searching “${w.query}” · `}
          ${w.include?.length > 0 && html`must include ${w.include.join(', ')} · `}
          ${w.exclude?.length > 0 && html`excluding ${w.exclude.join(', ')} · `}
          ${w.lastChecked ? `checked ${ago(w.lastChecked)}` : 'not checked yet'}
        </div>
      </div>
      <button class="btn btn-ghost btn-icon btn-sm" title="Re-check now" aria-label="Re-check now" onClick=${refresh} disabled=${busy}>${busy ? html`<${Spinner} size=${12} />` : html`<${Icon} name="refresh" size=${15} />`}</button>
      <button class="btn btn-ghost btn-icon btn-sm" title="Edit" aria-label="Edit" onClick=${() => setEditing(!editing)}><${Icon} name="edit" size=${15} /></button>
      <button class="btn btn-ghost btn-icon btn-sm btn-danger" title="Remove" aria-label="Remove" onClick=${remove}><${Icon} name="trash" size=${15} /></button>
    </div>

    ${editing && html`<${WatchEditor} w=${w} du=${du} onDone=${() => setEditing(false)} />`}

    ${!w.result && !busy && !w.checking && html`<div class="muted small">${w.lastError || 'Not checked yet — press the refresh button.'}</div>`}
    ${!w.result && w.checking && html`<div class="row muted small"><${Spinner} size=${12} /> Checking prices…</div>`}
    ${w.lastError && w.result && html`<div class="muted small">${w.lastError}</div>`}

    ${best &&
    bestShown &&
    html`<div class="row" style=${{ alignItems: 'flex-end', gap: 12 }}>
      <div class="grow">
        <div class="hero-label">Best right now</div>
        <div style=${{ fontSize: 30, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.1 }}>${bestShown.text}<span class="muted" style=${{ fontSize: 15, fontWeight: 600 }}>/${bestShown.unit}</span></div>
        <div class="row wrap small" style=${{ gap: 6, marginTop: 3 }}>
          <${StoreTag} id=${best[0]} />
          ${best[1]?.priceBasis && best[1].priceBasis !== 'shelf' && html`<span class="badge badge-outline" title=${BASIS_TITLE[best[1].priceBasis]}>${BASIS_BADGE[best[1].priceBasis] || BASIS_BADGE.online}</span>`}
          ${w.target != null &&
          (vsTarget <= 1e-9
            ? html`<span class="badge badge-good"><${Icon} name="check" size=${11} stroke=${3} /> at/below target ${money2(w.target)}</span>`
            : html`<span class="badge">target ${money2(w.target)} · ${unitPrice(vsTarget / factor, du).text} above</span>`)}
          ${lowShown && trend.length > 1 && html`<span class="muted">low ${lowShown.text}</span>`}
        </div>
      </div>
      ${trend.length > 1 && html`<div title="Best price over time"><${Sparkline} points=${trend} target=${w.target} label=${`Best price trend for ${w.label}`} /></div>`}
    </div>`}

    ${stores.length > 0 &&
    html`<table class="wtable">
      <tbody>
        ${stores.map(
          ([id, s], i) => html`<tr class=${i === 0 ? 'best' : ''} key=${id}>
            <td style=${{ width: 92 }}><${StoreTag} id=${id} /></td>
            <td>
              <div style=${{ lineHeight: 1.25 }}>${s.url ? html`<a href=${s.url} target="_blank" rel="noopener noreferrer" title=${linkDestination(s.url, storeInfo(id))?.text}>${s.name}</a>` : s.name}</div>
              <div class="muted" style=${{ fontSize: 11.5 }}>
                ${[s.size, s.soldBy === 'lb' ? `${money2(s.price)}/lb` : money2(s.price)].filter(Boolean).join(' · ')}
                ${s.onSale && html` · <span style=${{ color: 'var(--deal-ink)', fontWeight: 600 }}>sale${s.regularPrice ? ` (reg ${money2(s.regularPrice)})` : ''}</span>`}
                ${s.promo && html` · <span style=${{ color: 'var(--deal-ink)' }}>${s.promo}</span>`}
                ${s.priceBasis !== 'shelf' && ` \u00b7 ${BASIS_LABEL[s.priceBasis] || 'online price'}`}
              </div>
            </td>
            <td class="r"><b>${du ? unitPrice(s.unitPerBase, du).text : ''}</b>${s.est ? html`<span class="muted"> est.</span>` : ''}</td>
          </tr>`,
        )}
      </tbody>
    </table>`}
    ${Object.keys(w.result?.errors || {}).length > 0 &&
    html`<div class="muted small">Couldn’t check: ${Object.keys(w.result.errors).map((id) => storeInfo(id).short).join(', ')}</div>`}

    <div class="row wrap" style=${{ gap: 6 }}>
      <button class="btn btn-sm btn-ghost" onClick=${() => runSearch(w.query)}><${Icon} name="search" size=${13} /> Compare now</button>
      <button class="btn btn-sm btn-ghost" onClick=${() => addToList({ text: w.label })}><${Icon} name="plus" size=${13} /> Add to list</button>
      ${w.points?.length > 1 && html`<button class="btn btn-sm btn-ghost" onClick=${() => setExpanded(!expanded)}><${Icon} name="chart" size=${13} /> ${expanded ? 'Hide' : 'History'}</button>`}
    </div>
    ${expanded && html`<${WatchHistory} w=${w} du=${du} />`}
  </div>`;
}

function WatchHistory({ w, du }) {
  const factor = DISPLAY_UNITS[du]?.factor || 1;
  const series = useMemo(() => {
    const by = {};
    for (const p of w.points || []) (by[p.storeId] ||= []).push({ t: p.t, v: p.unit * factor, note: p.name });
    return Object.entries(by).map(([id, pts]) => ({ id, label: storeInfo(id).short, short: storeInfo(id).short, color: storeColor(id), points: pts.sort((a, b) => a.t - b.t) }));
  }, [w.points, du]);
  const fmt = (v) => unitPrice(v / factor, du).text;
  return html`<div class="stack" style=${{ gap: 8 }}>
    <${LineChart} series=${series} height=${200} formatY=${fmt} minStep=${unitPriceStep} target=${w.target} yTitle=${`Unit price per ${unitLabel(du)} by store`} />
    <div class="muted small">Price per ${unitLabel(du)} of the cheapest matching product at each store, every time it was checked.</div>
    <${DataTable} series=${series} formatY=${fmt} />
  </div>`;
}

function WatchEditor({ w, du, onDone }) {
  const [label, setLabel] = useState(w.label || '');
  const [target, setTarget] = useState(w.target ?? '');
  const [unit, setUnit] = useState(du || '');
  const [include, setInclude] = useState((w.include || []).join(', '));
  const [exclude, setExclude] = useState((w.exclude || []).join(', '));
  const dims = w.result?.dim ? [w.result.dim] : ['volume', 'weight', 'count'];
  const save = async (e) => {
    e.preventDefault();
    const changedMatch = include !== (w.include || []).join(', ') || exclude !== (w.exclude || []).join(', ');
    updateWatch(w.id, {
      label: label.trim() || w.query,
      target: target === '' ? null : +target,
      displayUnit: unit || null,
      include: include.split(',').map((x) => x.trim()).filter(Boolean),
      exclude: exclude.split(',').map((x) => x.trim()).filter(Boolean),
    });
    onDone();
    // Changing the match words changes which product wins, so re-price it.
    if (changedMatch) refreshWatch(w.id).catch((err) => toast(err.message, { kind: 'bad' }));
  };
  return html`<form class="stack" style=${{ gap: 8, padding: 10, borderRadius: 10, background: 'var(--surface-2)' }} onSubmit=${save}>
    <label class="field">Name<input class="input input-sm" value=${label} onInput=${(e) => setLabel(e.currentTarget.value)} /></label>
    <div class="row" style=${{ gap: 8 }}>
      <label class="field grow">Target price<input class="input input-sm" inputmode="decimal" value=${target} placeholder="e.g. 2.50" onInput=${(e) => setTarget(e.currentTarget.value.replace(/[^\d.]/g, ''))} /></label>
      <label class="field">per
        <select class="select select-sm" value=${unit} onChange=${(e) => setUnit(e.currentTarget.value)}>
          ${dims.flatMap((d) => displayUnitsFor(d)).map((u) => html`<option value=${u}>${unitLabel(u)}</option>`)}
        </select>
      </label>
    </div>
    <label class="field">Must include words <span class="hint">comma-separated, e.g. whole, gallon</span><input class="input input-sm" value=${include} onInput=${(e) => setInclude(e.currentTarget.value)} /></label>
    <label class="field">Exclude words <span class="hint">e.g. organic, lactose</span><input class="input input-sm" value=${exclude} onInput=${(e) => setExclude(e.currentTarget.value)} /></label>
    <div class="row" style=${{ gap: 6 }}><button class="btn btn-sm btn-primary" type="submit">Save</button><button class="btn btn-sm" type="button" onClick=${() => onDone(null)}>Cancel</button></div>
  </form>`;
}
