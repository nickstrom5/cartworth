// Product detail modal: price breakdown, unit prices in every unit, and price history.
import { useEffect, useState } from '/vendor/preact-hooks.mjs';
import { html, Modal, ProductImage, StoreTag, Spinner, Notice, storeInfo, storeColor } from '../ui.js';
import { Icon } from '../icons.js';
import { LineChart, DataTable } from '../charts.js';
import { api } from '../api.js';
import { getState } from '../store.js';
import { addWatch, addToList } from '../actions.js';
import { money2, unitPrice, unitLabel, shortDate, ago, plural, linkDestination, BASIS_LABEL, BASIS_TITLE, provenanceNote } from '../format.js';
import { displayUnitsFor } from '/shared/units.js';
import { usesMember } from '/shared/compare.js';

export function ProductDetail({ p, displayUnit }) {
  const [hist, setHist] = useState(null);
  const [err, setErr] = useState(null);
  const settings = getState().settings || {};
  const prefs = { prime: settings.prime, cardPrices: settings.cardPrices };
  useEffect(() => {
    // Always send the location, even when there isn't one. The heading below says "Price history
    // at <store>", and the server only scopes the series when it is told which store — asking
    // without one returns nothing at all for any product sold at more than one location.
    // An empty value means "the chain-wide series", which is where a national price is filed.
    setHist(null);
    setErr(null);
    api(`/api/history/${encodeURIComponent(p.key)}?location=${encodeURIComponent(p.locationId ?? '')}`)
      .then(setHist)
      .catch((e) => setErr(e.message));
  }, [p.key, p.locationId]);
  const store = storeInfo(p.storeId);
  // Named by where the link goes, not by the store: see linkDestination in format.js.
  const dest = p.url ? linkDestination(p.url, store) : null;
  // Where the price came from, said once, next to the price. It used to be a notice at the foot of
  // the sheet, under the history chart — below the fold on a phone, which is where a shopper
  // comparing $7.99 here with a lower price in Jewel-Osco's own app would never see it. Instacart's
  // own note for the storefront is quoted when this sheet was opened from a search that has it
  // (the watchlist and the trip plan open it without one, and then there is no quote).
  const basis = p.priceBasis || 'shelf';
  const where = getState().search?.results?.[p.storeId]?.location;
  const provenance = provenanceNote(basis, store.name, basis === 'online' ? where?.priceNote : null);
  const eff = usesMember(p, prefs) ? p.memberPrice : p.price;
  const series = hist?.series?.length
    ? [{ id: p.key, label: store.short, color: storeColor(p.storeId), points: hist.series.map((o) => ({ t: o.t, v: o.price, note: [o.onSale ? 'On sale' : null, o.regular ? `reg ${money2(o.regular)}` : null, o.promo].filter(Boolean).join(' · ') || null })) }]
    : [];
  const lows = hist?.series?.length ? Math.min(...hist.series.map((o) => o.price)) : null;
  const highs = hist?.series?.length ? Math.max(...hist.series.map((o) => o.price)) : null;

  return html`<${Modal} title=${p.name} sub=${[p.brand, p.size].filter(Boolean).join(' · ')}>
    <div class="row" style=${{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <${ProductImage} src=${p.image?.replace(/240x240/, '480x480')} size=${140} />
      <div class="grow" style=${{ display: 'grid', gap: 8, minWidth: 220 }}>
        <div class="row wrap" style=${{ gap: 8 }}>
          <${StoreTag} id=${p.storeId} short=${false} />
          ${basis === 'shelf'
            ? html`<span class="badge badge-good">shelf price</span>`
            : html`<span class="badge badge-outline" title=${BASIS_TITLE[basis] || BASIS_TITLE.online}>${BASIS_LABEL[basis] || BASIS_LABEL.online}</span>`}
          ${p.onSale && html`<span class="badge badge-sale">${p.pctOff ? `${p.pctOff}% off` : 'On sale'}</span>`}
        </div>
        <div style=${{ fontSize: 30, fontWeight: 750, letterSpacing: '-0.02em' }}>
          ${money2(eff)}${p.soldBy === 'lb' ? html`<span class="muted" style=${{ fontSize: 16 }}>/lb</span>` : ''}
          ${p.regularPrice && html`<span class="was" style=${{ fontSize: 16, fontWeight: 500 }}>${money2(p.regularPrice)}</span>`}
        </div>
        ${provenance && html`<div class="ink2 small provenance">${provenance}</div>`}
        ${p.memberPrice != null && html`<div class="ink2 small"><b>${p.memberLabel}:</b> ${money2(p.memberPrice)} ${usesMember(p, prefs) ? '(used for comparisons)' : '(not counted — change in Settings)'}</div>`}
        ${p.promo && html`<div class="ink2 small"><b>Deal:</b> ${p.promo}</div>`}
        ${p.saleEnds && html`<div class="ink2 small">Sale ends ${shortDate(p.saleEnds)}</div>`}
        ${p.estPkg && html`<div class="ink2 small">Typical package ≈ ${money2(p.estPkg)} (priced by weight at the register)</div>`}
        <div class="kv" style=${{ marginTop: 4 }}>
          ${Object.entries(p.unit || {}).map(
            ([dim, u]) => html`<dt>Per ${dim === 'count' ? 'item' : dim}</dt>
              <dd>${displayUnitsFor(dim).map((du) => `${unitPrice(u.perBase, du).text}/${unitLabel(du)}`).join(' · ')}${u.est ? ' (estimated)' : ''}</dd>`,
          )}
          ${p.stock && html`<dt>Stock</dt><dd>${p.stock.replace(/([A-Z])/g, ' $1').toLowerCase()}</dd>`}
          ${p.category && html`<dt>Category</dt><dd>${p.category}</dd>`}
        </div>
        <div class="row wrap" style=${{ gap: 8, marginTop: 6 }}>
          ${dest && html`<a class="btn btn-sm btn-primary" href=${p.url} target="_blank" rel="noopener noreferrer"><${Icon} name="external" size=${14} /> ${dest.text}</a>`}
          <button class="btn btn-sm" onClick=${() => addWatch({ query: p.name, label: p.name, dim: p.dim })}><${Icon} name="star" size=${14} /> Watch</button>
          <button class="btn btn-sm" onClick=${() => addToList({ text: p.name, pinned: { storeId: p.storeId, key: p.key, name: p.name, brand: p.brand, size: p.size, price: eff, url: p.url, image: p.image, soldBy: p.soldBy, dim: p.dim } })}><${Icon} name="plus" size=${14} /> Add to list</button>
        </div>
      </div>
    </div>

    <div>
      <div class="row" style=${{ marginBottom: 8 }}>
        <b>Price history at ${store.short}</b>
        ${hist?.series?.length > 0 && html`<span class="muted small">${plural(hist.series.length, 'observation')} since ${shortDate(hist.series[0].t)}</span>`}
      </div>
      ${!hist && !err && html`<div class="row muted small"><${Spinner} size=${12} /> Loading history…</div>`}
      ${err && html`<${Notice} kind="bad" icon="alert">${err}</${Notice}>`}
      ${hist && series.length === 0 && html`<div class="muted small">No history yet — Cartworth records a price every time this item shows up in a search or on your watchlist.</div>`}
      ${series.length > 0 &&
      html`<div class="stack" style=${{ gap: 8 }}>
          ${series[0].points.length < 2
            ? html`<div class="muted small">First seen ${ago(series[0].points[0].t)} at ${money2(series[0].points[0].v)}. The chart fills in as Cartworth sees this item again (at most one new point per 12 hours unless the price changes).</div>`
            : html`<${LineChart} series=${series} height=${200} formatY=${(v) => money2(v)} minStep=${0.01} yTitle=${`Price of ${p.name} at ${store.name}`} />`}
          <div class="row wrap small ink2" style=${{ gap: 14 }}>
            <span title="The lowest price in the history shown here. Cartworth keeps a year of it, so this is the lowest in that window rather than an all-time low."
              >Low <b>${money2(lows)}</b></span
            >
            <span>High <b>${money2(highs)}</b></span>
            ${p.hist?.avg != null && html`<span>Average <b>${money2(p.hist.avg)}</b></span>`}
          </div>
          <${DataTable} series=${series} formatY=${(v) => money2(v)} />
        </div>`}
    </div>
  </${Modal}>`;
}
