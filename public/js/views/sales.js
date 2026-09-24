// Sales: every weekly-ad deal from your stores, this week and next.
import { useEffect, useMemo, useRef, useState } from '/vendor/preact-hooks.mjs';
import { html, StoreTag, StoreDot, Spinner, Notice, Empty, Chip, Seg, ProductImage, Modal, storeInfo, useDebounced } from '../ui.js';
import { Icon } from '../icons.js';
import { api } from '../api.js';
import { useStore, setState, getState, pref, setPref, openModal, closeModal } from '../store.js';
import { runSearch, addToList, contextParams } from '../actions.js';
import { money2, endsLabel, dateRange, plural, shortDate } from '../format.js';
import { CATEGORIES } from '/shared/deals.js';
import { normalize, tokens } from '/shared/match.js';

const FOOD = new Set(['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread', 'Deli & Prepared', 'Frozen', 'Pantry', 'Snacks & Candy', 'Beverages']);

export function dealScore(d) {
  let s = d.pctOff ?? d.deal?.pct ?? (d.qty > 1 ? 18 : d.story ? 12 : 0);
  if (FOOD.has(d.category)) s += 4;
  if (d.needsCoupon) s -= 1;
  if (d.price == null && !d.story && !d.priceText) s -= 30;
  return s;
}

export function SalesView() {
  const [week, setWeek] = useState(pref('dealsWeek', 'current'));
  const data = useStore((s) => s.deals[week]);
  const settings = useStore((s) => s.settings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [store, setStore] = useState(null);
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const [sort, setSort] = useState(pref('dealsSort', 'best'));
  const [type, setType] = useState('all'); // all | bogo | multi | coupon | nocoupon
  const [groceryOnly, setGroceryOnly] = useState(pref('groceryOnly', true));
  const [limit, setLimit] = useState(60);
  const [progress, setProgress] = useState(null);

  const load = async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api(`/api/deals?${contextParams({ week, fresh })}`);
      setState({ deals: { ...getState().deals, [week]: { ...r, loadedAt: Date.now() } } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data && settings?.zip) load();
  }, [week, settings?.zip]);

  // Poll background detail-fetching ("2 for $5", "/lb", BOGO…) and reload when it finishes
  useEffect(() => {
    if (!data) return;
    const ids = data.flyers.filter((f) => typeof f.id === 'number').map((f) => f.id);
    if (!data.flyers.some((f) => f.enriching)) return;
    let stop = false;
    let lastDone = 0;
    const tick = async () => {
      if (stop) return;
      try {
        const p = await api(`/api/deals/progress?${contextParams({ flyers: ids.join(',') })}`);
        setProgress(p);
        if (!p.running || p.done - lastDone > 150) {
          lastDone = p.done;
          const r = await api(`/api/deals?${contextParams({ week })}`);
          setState({ deals: { ...getState().deals, [week]: { ...r, loadedAt: Date.now() } } });
          if (!p.running) {
            setProgress(null);
            return;
          }
        }
      } catch {
        /* keep trying quietly */
      }
      setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 2000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [data?.generatedAt]);

  useEffect(() => setLimit(60), [store, cat, dq, sort, type, week, groceryOnly]);

  const model = useMemo(() => {
    if (!data) return null;
    const qt = tokens(dq);
    const base = data.deals.filter((d) => (d.priceText || d.story) && (!groceryOnly || d.category !== 'Other'));
    const matchQ = (d) => !qt.length || qt.every((t) => tokens(`${d.name} ${d.description || ''} ${d.brand || ''}`).some((w) => w.startsWith(t)));
    const matchType = (d) =>
      type === 'all' ||
      (type === 'bogo' && (d.deal?.kind === 'bogo' || d.deal?.kind === 'bxgy')) ||
      (type === 'multi' && d.qty > 1) ||
      (type === 'coupon' && d.needsCoupon) ||
      (type === 'nocoupon' && !d.needsCoupon && !d.needsCard) ||
      (type === 'pct' && d.pctOff >= 30);
    const inStore = (d) => !store || d.storeId === store;
    const inCat = (d) => !cat || d.category === cat;
    const shown = base.filter((d) => matchQ(d) && matchType(d) && inStore(d) && inCat(d));
    const storeCounts = {};
    const catCounts = {};
    for (const d of base) if (matchQ(d) && matchType(d) && inCat(d)) storeCounts[d.storeId] = (storeCounts[d.storeId] || 0) + 1;
    for (const d of base) if (matchQ(d) && matchType(d) && inStore(d)) catCounts[d.category] = (catCounts[d.category] || 0) + 1;
    const by = {
      best: (a, b) => dealScore(b) - dealScore(a),
      pct: (a, b) => (b.pctOff ?? -1) - (a.pctOff ?? -1),
      price: (a, b) => (a.each ?? a.price ?? Infinity) - (b.each ?? b.price ?? Infinity),
      ending: (a, b) => (Date.parse(a.validTo || '2100-01-01') - Date.parse(b.validTo || '2100-01-01')),
      store: (a, b) => a.storeId.localeCompare(b.storeId) || dealScore(b) - dealScore(a),
      az: (a, b) => a.name.localeCompare(b.name),
    }[sort];
    shown.sort(by);
    return { shown, storeCounts, catCounts, total: base.length };
  }, [data, dq, type, store, cat, sort, groceryOnly]);

  const flyersByStore = useMemo(() => {
    const m = {};
    for (const f of data?.flyers || []) (m[f.storeId] ||= []).push(f);
    return m;
  }, [data]);

  return html`<div>
    <div class="page-head">
      <div>
        <h1>Sales & weekly ads</h1>
        <p>${week === 'current' ? 'Deals running now' : 'Next week’s ads — plan ahead before they start'} at your stores${data?.flyers?.length ? ` · ${plural(data.flyers.length, 'circular')}` : ''}.</p>
      </div>
      <div class="row wrap">
        <${Seg} label="Week" value=${week} onChange=${(v) => { setWeek(v); setPref('dealsWeek', v); setStore(null); }} options=${[{ value: 'current', label: 'This week' }, { value: 'next', label: 'Next week' }]} />
        <button class="btn btn-sm" onClick=${() => load(true)} disabled=${loading}><${Icon} name="refresh" size=${14} /> Refresh</button>
      </div>
    </div>

    ${error && html`<div style=${{ marginBottom: 12 }}><${Notice} kind="bad" icon="alert">${error} <button class="btn btn-sm" style=${{ marginLeft: 8 }} onClick=${() => load(true)}>Try again</button></${Notice}></div>`}
    ${data?.stale && html`<div style=${{ marginBottom: 12 }}><${Notice} kind="warn" icon="clock">${data.stale}</${Notice}></div>`}
    ${progress?.running && html`<div style=${{ marginBottom: 12 }}><${Notice} icon="sparkle"><span class="row"><${Spinner} size=${12} /> Reading deal details (multi-buy prices, BOGO, digital coupons)… ${progress.done}/${progress.total}</span></${Notice}></div>`}
    ${data?.errors?.length > 0 && html`<div style=${{ marginBottom: 12 }}><${Notice} kind="warn" icon="alert">${data.errors.map((e) => html`<div>${storeInfo(e.storeId).short} — ${e.flyer}: ${e.error}</div>`)}</${Notice}></div>`}

    ${!data && loading && html`<div class="card card-pad row"><${Spinner} /> Loading weekly ads…</div>`}
    ${data &&
    html`<div class="deals-layout">
      <aside class="card filters">
        <div>
          <h3>Store</h3>
          <button class="fopt" aria-pressed=${!store ? 'true' : 'false'} onClick=${() => setStore(null)}>All stores <span class="n">${Object.values(model.storeCounts).reduce((a, b) => a + b, 0)}</span></button>
          ${Object.keys(flyersByStore).map(
            (id) => html`<button class="fopt" key=${id} aria-pressed=${store === id ? 'true' : 'false'} onClick=${() => setStore(store === id ? null : id)} title=${flyersByStore[id].map((f) => `${f.name}: ${dateRange(f.validFrom, f.validTo)}`).join('\n')}>
              <${StoreDot} id=${id} /> ${storeInfo(id).short}<span class="n">${model.storeCounts[id] || 0}</span>
            </button>`,
          )}
          ${Object.keys(flyersByStore).length === 0 && html`<div class="muted small">No circulars ${week === 'next' ? 'posted yet for next week' : 'found'} for your stores.</div>`}
        </div>
        <div>
          <h3>Category</h3>
          <button class="fopt" aria-pressed=${!cat ? 'true' : 'false'} onClick=${() => setCat(null)}>Everything</button>
          ${CATEGORIES.filter((c) => model.catCounts[c]).map(
            (c) => html`<button class="fopt" key=${c} aria-pressed=${cat === c ? 'true' : 'false'} onClick=${() => setCat(cat === c ? null : c)}>${c}<span class="n">${model.catCounts[c]}</span></button>`,
          )}
          <label class="row small ink2" style=${{ marginTop: 8, gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked=${groceryOnly} onChange=${(e) => { setGroceryOnly(e.currentTarget.checked); setPref('groceryOnly', e.currentTarget.checked); }} /> Hide non-grocery (TVs, clothes…)
          </label>
        </div>
        <div>
          <h3>Deal type</h3>
          ${[
            ['all', 'All deals'],
            ['pct', '30% off or more'],
            ['bogo', 'Buy one, get one'],
            ['multi', 'Multi-buy (2 for $5…)'],
            ['coupon', 'Digital coupon deals'],
            ['nocoupon', 'No coupon or card needed'],
          ].map(([v, l]) => html`<button class="fopt" key=${v} aria-pressed=${type === v ? 'true' : 'false'} onClick=${() => setType(v)}>${l}</button>`)}
        </div>
        ${Object.keys(flyersByStore).length > 0 &&
        html`<div>
          <h3>Circulars</h3>
          <div class="stack" style=${{ gap: 6 }}>
            ${Object.entries(flyersByStore).flatMap(([id, fl]) =>
              fl.map((f) => html`<div class="small ink2" key=${f.id}><${StoreDot} id=${id} /> <b>${storeInfo(id).short}</b> ${f.name} · ${dateRange(f.validFrom, f.validTo)}</div>`),
            )}
          </div>
        </div>`}
      </aside>

      <section class="stack" style=${{ gap: 12, minWidth: 0 }}>
        <div class="row wrap" style=${{ gap: 8 }}>
          <div class="grow" style=${{ position: 'relative', minWidth: 200 }}>
            <input class="input" style=${{ width: '100%', paddingLeft: 34 }} placeholder="Search deals — chicken, cereal, coffee…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} aria-label="Search deals" />
            <span style=${{ position: 'absolute', left: 11, top: 11, color: 'var(--muted)' }}><${Icon} name="search" size=${16} /></span>
          </div>
          <select class="select" value=${sort} onChange=${(e) => { setSort(e.currentTarget.value); setPref('dealsSort', e.currentTarget.value); }} aria-label="Sort deals">
            <option value="best">Best deals first</option>
            <option value="pct">Biggest % off</option>
            <option value="price">Lowest price</option>
            <option value="ending">Ending soonest</option>
            <option value="store">Store</option>
            <option value="az">A → Z</option>
          </select>
        </div>
        <div class="muted small">${plural(model.shown.length, 'deal')}${model.shown.length !== model.total ? ` of ${model.total}` : ''}${data.loadedAt ? '' : ''}</div>
        ${model.shown.length === 0 &&
        html`<div class="card"><${Empty} icon="tag" title="No deals match">Try a different store, category or search term${week === 'next' ? ' — or check back later in the week; some stores post next week’s ad on Tuesday or Wednesday.' : '.'}</${Empty}></div>`}
        <div class="deal-grid">${model.shown.slice(0, limit).map((d) => html`<${DealCard} key=${d.id} d=${d} />`)}</div>
        ${model.shown.length > limit && html`<div style=${{ textAlign: 'center' }}><button class="btn" onClick=${() => setLimit(limit + 90)}>Show more deals (${model.shown.length - limit} left)</button></div>`}
      </section>
    </div>`}
    <p class="footer-note">Circular data comes from Flipp (the weekly-ad service most chains use) and Whole Foods’ own sales page. “for U” and digital-coupon prices need the coupon clipped in the store’s app; “with card” prices need the store’s loyalty card.</p>
  </div>`;
}

/**
 * Whole Foods' flyer sometimes states the regular price as prose rather than a figure ("Regular
 * prices vary"), and prefixing that with "Reg." produced "Reg. Regular prices vary". Only add the
 * abbreviation when the text does not already open with the word.
 */
function regularLine(text) {
  const t = String(text || '').trim();
  return /^reg(ular)?\b/i.test(t) ? t : `Reg. ${t}`;
}

function badges(d) {
  const b = [];
  if (d.needsCoupon) b.push(html`<span class="badge badge-info" title="Clip the digital coupon in the store app">${/for u/i.test(d.priceText + (d.story || '') + (d.disclaimer || '')) || d.storeId === 'jewel' ? 'for U / digital' : 'Digital coupon'}</span>`);
  if (d.needsCard) b.push(html`<span class="badge badge-info">With card</span>`);
  if (d.limit) b.push(html`<span class="badge">Limit ${d.limit}</span>`);
  if (d.mustBuy) b.push(html`<span class="badge badge-warn">Must buy ${d.mustBuy}</span>`);
  return b;
}

export function DealCard({ d }) {
  const ends = endsLabel(d.validTo);
  const starts = d.week === 'next' && d.validFrom ? `Starts ${shortDate(d.validFrom)}` : null;
  const priceMain = d.price != null ? d.priceText : d.priceText || d.story || '';
  return html`<article class="deal">
    <div class="deal-img" role="button" tabindex="0" onClick=${() => openDeal(d)} onKeyDown=${(e) => e.key === 'Enter' && openDeal(d)} style=${{ cursor: 'pointer' }}>
      ${d.image ? html`<img src=${d.image} alt="" loading="lazy" referrerpolicy="no-referrer" />` : html`<${Icon} name="tag" size=${28} />`}
      ${d.pctOff ? html`<span class="badge badge-sale deal-pct">${d.pctOff}% off</span>` : d.deal?.kind === 'bogo' ? html`<span class="badge badge-sale deal-pct">BOGO</span>` : null}
    </div>
    <div class="deal-body">
      <div class="deal-price">${priceMain || html`<span class="muted small">See ad</span>`}</div>
      ${d.qty > 1 && d.each != null && html`<div class="small ink2">${money2(d.each)} each</div>`}
      ${(d.regular || d.regularText) && html`<div class="small muted">${d.regular ? `Reg. ${money2(d.regular)}` : regularLine(d.regularText)}</div>`}
      ${d.memberText && html`<div class="small" style=${{ color: 'var(--info-ink)', fontWeight: 600 }}>${d.memberText}</div>`}
      ${d.story && d.price != null && html`<div class="small" style=${{ color: 'var(--deal-ink)', fontWeight: 600 }}>${d.story}</div>`}
      <div class="deal-name">${d.name}</div>
      ${d.description && html`<div class="deal-desc">${d.description}</div>`}
      <div class="deal-foot">
        <${StoreTag} id=${d.storeId} />
        ${starts ? html`<span class="muted small">${starts}</span>` : ends && html`<span class="muted small">${ends}</span>`}
      </div>
      <div class="deal-foot">${badges(d)}</div>
      <div class="deal-actions">
        <button class="btn btn-sm" onClick=${() => runSearch(simplify(d.name))} title="Check this item's price at every store"><${Icon} name="search" size=${13} /> Compare</button>
        <button class="btn btn-sm btn-icon" onClick=${() => addToList({ text: simplify(d.name) })} title="Add to list" aria-label="Add to list"><${Icon} name="plus" size=${14} /></button>
      </div>
    </div>
  </article>`;
}

export function DealCardMini({ deal: d }) {
  const ends = endsLabel(d.validTo);
  return html`<div class="ad-card" role="button" tabindex="0" style=${{ cursor: 'pointer' }} onClick=${() => openDeal(d)} onKeyDown=${(e) => e.key === 'Enter' && openDeal(d)}>
    ${d.image ? html`<img src=${d.image} alt="" loading="lazy" referrerpolicy="no-referrer" />` : html`<div class="pimg ph" style=${{ width: 56, height: 56 }}><${Icon} name="tag" size=${18} /></div>`}
    <div style=${{ minWidth: 0, display: 'grid', gap: 2 }}>
      <div class="ad-price">${d.priceText || d.story || 'See ad'}</div>
      <div class="small" style=${{ fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>${d.name}</div>
      <div class="row wrap" style=${{ gap: 5 }}>
        <${StoreTag} id=${d.storeId} />
        ${d.week === 'next' ? html`<span class="badge badge-info">Next week</span>` : ends && html`<span class="muted small">${ends}</span>`}
        ${d.needsCoupon && html`<span class="badge badge-info">digital</span>`}
      </div>
    </div>
  </div>`;
}

function simplify(name) {
  // "Oreos 10-15 oz., Newtons 10 oz. or Ritz…" -> "Oreos"
  let s = String(name).split(/,| or |\||\(|;/i)[0];
  s = s.replace(/\b\d+(\.\d+)?\s*(-\s*\d+(\.\d+)?)?\s*(oz|lb|ct|pk|fl|gal|count|pack)\.?\b.*$/i, '');
  s = s.replace(/\b(select varieties|assorted|family size|value pack)\b/gi, '');
  return s.replace(/\s+/g, ' ').trim() || name;
}

function openDeal(d) {
  openModal(html`<${DealDetail} d=${d} />`);
}

function DealDetail({ d }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (d.source === 'flipp' && d.flippId && !d.enriched) {
      api(`/api/deals/item/${d.flippId}`).then((r) => setDetail(r.detail)).catch(() => {});
    }
  }, [d.id]);
  const desc = detail?.description || d.description;
  const disclaimer = detail?.disclaimer || d.disclaimer;
  return html`<${Modal} title=${d.name} sub=${`${storeInfo(d.storeId).name} · ${dateRange(d.validFrom, d.validTo)}`}>
    <div class="row" style=${{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      ${d.image && html`<img src=${d.image} alt="" style=${{ width: 180, maxHeight: 180, objectFit: 'contain', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }} referrerpolicy="no-referrer" />`}
      <div class="grow stack" style=${{ gap: 6, minWidth: 220 }}>
        <div style=${{ fontSize: 26, fontWeight: 750 }}>${d.priceText || d.story || 'See ad'}</div>
        ${d.qty > 1 && d.each != null && html`<div class="ink2">${money2(d.each)} each</div>`}
        ${(d.regular || d.regularText) && html`<div class="ink2">Regular ${d.regular ? money2(d.regular) : d.regularText}${d.pctOff ? ` · save ${d.pctOff}%` : ''}</div>`}
        ${d.memberText && html`<div style=${{ color: 'var(--info-ink)', fontWeight: 600 }}>${d.memberText}</div>`}
        ${d.story && d.price != null && html`<div style=${{ color: 'var(--deal-ink)', fontWeight: 600 }}>${d.story}</div>`}
        ${desc && html`<div class="ink2">${desc}</div>`}
        <div class="row wrap" style=${{ gap: 6 }}>${badges(d)}</div>
        ${disclaimer && html`<div class="muted small" style=${{ whiteSpace: 'pre-line' }}>${disclaimer}</div>`}
        <div class="row wrap" style=${{ gap: 8, marginTop: 6 }}>
          <button class="btn btn-primary btn-sm" onClick=${() => { closeModal(); runSearch(simplify(d.name)); }}><${Icon} name="search" size=${14} /> Compare at every store</button>
          <button class="btn btn-sm" onClick=${() => addToList({ text: simplify(d.name) })}><${Icon} name="plus" size=${14} /> Add to list</button>
          ${d.url && html`<a class="btn btn-sm" href=${d.url} target="_blank" rel="noopener noreferrer"><${Icon} name="external" size=${14} /> View flyer</a>`}
        </div>
      </div>
    </div>
  </${Modal}>`;
}
