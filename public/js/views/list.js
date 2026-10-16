// Shopping list + trip planner.
import { useState } from '/vendor/preact-hooks.mjs';
import { html, StoreTag, StoreDot, Spinner, Notice, Empty, Seg, storeInfo, ProductImage } from '../ui.js';
import { Icon } from '../icons.js';
import { useStore, setState, toast } from '../store.js';
import { addToList, updateListItem, removeListItem, clearDoneItems, optimizeList, runSearch } from '../actions.js';
import { money2, plural, ago, unitLabel, savedNote, BASIS_LABEL, BASIS_TITLE, linkDestination } from '../format.js';
import { formatSize } from '/shared/units.js';
import { planSavingsClaim } from '/shared/compare.js';

export function ListView() {
  const items = useStore((s) => s.list);
  const plan = useStore((s) => s.plan);
  const [text, setText] = useState('');
  const [qty, setQty] = useState(1);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState(null);

  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    // Allow pasting several items at once (one per line or comma-separated)
    const parts = t.includes('\n') ? t.split('\n') : t.split(/,(?![^()]*\))/);
    for (const p of parts.map((x) => x.trim()).filter(Boolean)) addToList({ text: p, qty });
    setText('');
    setQty(1);
    setState({ plan: null });
  };

  const update = (it, patch) => updateListItem(it.id, patch);
  const remove = (it) => removeListItem(it.id);
  const clearDone = () => clearDoneItems();

  const optimize = async (fresh = false) => {
    setPlanning(true);
    setError(null);
    try {
      await optimizeList({ fresh });
    } catch (err) {
      setError(err.message);
    } finally {
      setPlanning(false);
    }
  };

  const open = (items || []).filter((i) => !i.done);
  const done = (items || []).filter((i) => i.done);

  const copy = async () => {
    const lines = (items || []).filter((i) => !i.done).map((i) => `☐ ${i.qty > 1 ? `${i.qty} × ` : ''}${i.text}${i.pinned ? ` (${storeInfo(i.pinned.storeId).short})` : ''}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast('List copied');
    } catch {
      toast('Could not copy — your browser blocked clipboard access', { kind: 'bad' });
    }
  };

  return html`<div>
    <div class="page-head">
      <div>
        <h1>Shopping list</h1>
        <p>Add what you need, then plan the cheapest trip — one store, two stores, or cherry-pick every deal.</p>
      </div>
      <div class="row no-print">
        ${items?.length > 0 && html`<button class="btn btn-sm" onClick=${copy}><${Icon} name="copy" size=${14} /> Copy</button>`}
        ${items?.length > 0 && html`<button class="btn btn-sm" onClick=${() => window.print()}><${Icon} name="printer" size=${14} /> Print</button>`}
      </div>
    </div>
    ${error && html`<div style=${{ marginBottom: 12 }}><${Notice} kind="bad" icon="alert">${error}</${Notice}></div>`}
    <div class="list-layout">
      <div class="card">
        <form class="row no-print" style=${{ padding: 12, gap: 8 }} onSubmit=${add}>
          <input class="input grow" placeholder="Add item — milk 1 gal, eggs 18 ct, bananas…" value=${text} onInput=${(e) => setText(e.currentTarget.value)} aria-label="Item to add" />
          <input class="input" style=${{ width: 58 }} type="number" min="1" max="99" value=${qty} onInput=${(e) => setQty(Math.max(1, +e.currentTarget.value || 1))} aria-label="Quantity" title="How many" />
          <button class="btn btn-primary" type="submit" disabled=${!text.trim()}><${Icon} name="plus" size=${14} /> Add</button>
        </form>
        ${items == null && html`<div class="card-pad row"><${Spinner} /> Loading…</div>`}
        ${items?.length === 0 &&
        html`<${Empty} icon="list" title="Your list is empty">Add items here, or use the <b>+</b> button on any product or deal. Include a size (“milk 1 gal”, “chicken breast 3 lb”) and Cartworth prices exactly that much at every store.</${Empty}>`}
        ${open.map((it) => html`<${ListRow} key=${it.id} it=${it} onUpdate=${update} onRemove=${remove} plan=${plan} />`)}
        ${done.length > 0 &&
        html`<div class="row" style=${{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
          <span class="muted small">${plural(done.length, 'item')} checked off</span><span class="spacer"></span>
          <button class="btn btn-sm btn-ghost no-print" onClick=${clearDone}>Clear checked</button>
        </div>`}
        ${done.map((it) => html`<${ListRow} key=${it.id} it=${it} onUpdate=${update} onRemove=${remove} />`)}
        ${open.length > 0 &&
        html`<div class="no-print" style=${{ padding: 12, borderTop: '1px solid var(--line)' }}>
          <button class="btn btn-primary" style=${{ width: '100%' }} onClick=${() => optimize(false)} disabled=${planning}>
            ${planning ? html`<${Spinner} size=${13} /> Pricing ${plural(open.length, 'item')} at every store…` : html`<${Icon} name="cart" size=${15} /> ${plan ? 'Re-plan my trip' : 'Plan my trip'}`}
          </button>
        </div>`}
      </div>
      <div>${plan ? html`<${PlanView} plan=${plan} onRefresh=${() => optimize(true)} planning=${planning} />` : open.length > 0 && !planning ? html`<div class="card"><${Empty} icon="cart" title="Plan your trip">Cartworth will price each item at every store (for the same amount), then show the cheapest single store, the best two- and three-store combos, and the cherry-pick total.</${Empty}></div>` : null}</div>
    </div>
  </div>`;
}

function ListRow({ it, onUpdate, onRemove, plan }) {
  const p = plan?.items?.find((x) => x.id === it.id);
  const cheapest = p?.cheapest ? p.perStore[p.cheapest] : null;
  return html`<div class=${`litem${it.done ? ' done' : ''}`}>
    <input type="checkbox" checked=${it.done} onChange=${(e) => onUpdate(it, { done: e.currentTarget.checked })} aria-label=${`Mark ${it.text} done`} style=${{ width: 18, height: 18 }} />
    <div class="ltext">
      <div style=${{ fontWeight: 550 }}>${it.text}</div>
      ${it.pinned && html`<div class="muted small row" style=${{ gap: 5 }}><${Icon} name="pin" size=${12} /> <${StoreTag} id=${it.pinned.storeId} /> ${money2(it.pinned.price)}${it.pinned.soldBy === 'lb' ? '/lb' : ''} · only at this store</div>`}
      ${!it.pinned && cheapest && html`<div class="muted small row wrap" style=${{ gap: 5 }}>cheapest: <${StoreTag} id=${p.cheapest} /> <span class="nw">${money2(cheapest.cost)}</span>${costedAmount(p, cheapest) && html` <span class="nw">for ${costedAmount(p, cheapest)}</span>`}</div>`}
    </div>
    <div class="qty no-print">
      <button type="button" onClick=${() => it.qty > 1 && onUpdate(it, { qty: it.qty - 1 })} aria-label="Fewer"><${Icon} name="minus" size=${12} /></button>
      <span>${it.qty}</span>
      <button type="button" onClick=${() => onUpdate(it, { qty: it.qty + 1 })} aria-label="More"><${Icon} name="plus" size=${12} /></button>
    </div>
    <button class="btn btn-ghost btn-icon btn-sm no-print" title="Compare prices" aria-label="Compare prices" onClick=${() => runSearch(it.pinned ? it.pinned.name : it.text)}><${Icon} name="search" size=${14} /></button>
    <button class="btn btn-ghost btn-icon btn-sm btn-danger no-print" title="Remove" aria-label="Remove" onClick=${() => onRemove(it)}><${Icon} name="x" size=${14} /></button>
  </div>`;
}

function PlanView({ plan, onRefresh, planning }) {
  const single = plan.plans.singles[0];
  const pair = plan.plans.pairs[0];
  const triple = plan.plans.triples[0];
  const every = plan.plans.everything;
  const options = [
    single && { key: 'single', title: 'One store', plan: single },
    pair && { key: 'pair', title: 'Two stores', plan: pair },
    triple && { key: 'triple', title: 'Three stores', plan: triple },
    every && { key: 'every', title: 'Cherry-pick', plan: every },
  ].filter(Boolean);
  const bestKey = options.reduce((a, b) => (b.plan.missing < a.plan.missing || (b.plan.missing === a.plan.missing && b.plan.total < a.plan.total - 0.005) ? b : a), options[0])?.key;
  const [sel, setSel] = useState('pair');
  const chosen = options.find((o) => o.key === sel) || options[0];
  const itemsById = Object.fromEntries(plan.items.map((i) => [i.id, i]));
  const storesUsed = plan.stores.filter((s) => plan.items.some((i) => i.perStore[s]));

  // How each store's numbers in THIS plan were arrived at. Compare, the product sheet, the
  // watchlist and settings all badge a price that isn't a shelf price; the trip planner did not,
  // and it is the one screen that hands the shopper a dollar total to act on. An unqualified
  // figure sitting one column over from a real shelf price reads as a promise about the shop down
  // the road — and for a chain-wide "national" listing there may be no shop down the road at all.
  // Worst basis wins per column: if any row in it is a national listing, the column is caveated as
  // one. Over-caveating a shelf price is the safe direction; under-caveating is the lie.
  const storeBasis = Object.fromEntries(storesUsed.map((s) => [s, worstBasis(plan.items, s)]));
  const namedWith = (basis) => storesUsed.filter((s) => storeBasis[s] === basis).map((s) => storeInfo(s).short);
  const onlineStores = namedWith('online');
  const nationalStores = namedWith('national');

  return html`<div class="stack" style=${{ gap: 14 }}>
    <div class="row">
      <b>Trip plan</b><span class="muted small">priced ${ago(plan.generatedAt)}</span><span class="spacer"></span>
      <button class="btn btn-sm no-print" onClick=${onRefresh} disabled=${planning}>${planning ? html`<${Spinner} size=${12} />` : html`<${Icon} name="refresh" size=${14} />`} Fresh prices</button>
    </div>
    <div class="plans">
      ${options.map(
        (o) => html`<button type="button" class=${`plan-card${o.key === bestKey ? ' win' : ''}`} key=${o.key} onClick=${() => setSel(o.key)} style=${{ textAlign: 'left', cursor: 'pointer', outline: sel === o.key ? '2px solid var(--focus)' : 'none' }}>
          <div class="hero-label">${o.title}${o.key === bestKey ? ' · cheapest' : ''}</div>
          <div class="plan-total">${money2(o.plan.total)}</div>
          <div class="row wrap small ink2" style=${{ gap: 6 }}>${(o.key === 'every' ? o.plan.stores : o.plan.stores).map((s) => html`<${StoreTag} key=${s} id=${s} />`)}</div>
          ${o.plan.missing > 0 && html`<div class="small" style=${{ color: 'var(--warn-ink)' }}>${plural(o.plan.missing, 'item')} not found</div>`}
          ${basisCaveat(o.plan.stores, storeBasis) && html`<div class="small ink2" title=${BASIS_TITLE[basisCaveat(o.plan.stores, storeBasis)]}>incl. ${BASIS_LABEL[basisCaveat(o.plan.stores, storeBasis)]}s</div>`}
          ${o.key !== 'single' && single && o.plan.missing <= single.missing && planVsSingle(o.plan, single)}
        </button>`,
      )}
    </div>
    ${plan.plans.unpriced > 0 && html`<${Notice} kind="warn" icon="alert">${plural(plan.plans.unpriced, 'item')} couldn’t be matched at any store — try a simpler name.</${Notice}>`}

    <div class="card">
      <div class="row" style=${{ padding: '12px 12px 4px' }}><b>${chosen.title}: where to buy what</b></div>
      <div class="stack" style=${{ padding: 12, gap: 10 }}>
        ${[...new Set(Object.values(chosen.plan.assign))].map((storeId) => {
          const its = Object.entries(chosen.plan.assign).filter(([, s]) => s === storeId).map(([id]) => itemsById[id]);
          const subtotal = its.reduce((a, i) => a + (i.perStore[storeId]?.cost || 0), 0);
          return html`<div class="trip-store" key=${storeId}>
            <div class="trip-store-head"><${StoreDot} id=${storeId} size=${10} /> ${storeInfo(storeId).name}<span class="spacer"></span><span class="num">${money2(subtotal)}</span></div>
            <ul>
              ${its.map((i) => {
                const c = i.perStore[storeId];
                return html`<li key=${i.id}>
                  <${ProductImage} src=${c.product.image} size=${34} />
                  <div class="grow">
                    <div style=${{ fontWeight: 600 }}>${i.qty > 1 ? `${i.qty} × ` : ''}${i.text}</div>
                    <div class="muted small">${c.product.url ? html`<a href=${c.product.url} target="_blank" rel="noopener noreferrer" title=${linkDestination(c.product.url, storeInfo(storeId))?.text}>${c.product.name}</a>` : c.product.name}${c.product.size ? ` · ${c.product.size}` : ''} · ${money2(c.product.price)}${c.product.soldBy === 'lb' ? '/lb' : ''}${c.product.onSale ? ' · on sale' : ''}${c.product.priceBasis ? html` · <span title=${BASIS_TITLE[c.product.priceBasis]}>${BASIS_LABEL[c.product.priceBasis] || BASIS_LABEL.online}</span>` : ''}${savedNote(c) ? html` · <span class="saved-note" title="The store did not answer just now, so this is the last price Cartworth saved for it">${savedNote(c)}</span>` : ''}</div>
                  </div>
                  <div class="num" style=${{ fontWeight: 650, textAlign: 'right' }}>
                    ${money2(c.cost)}${c.est ? html`<span class="muted small"> est.</span>` : ''}
                    ${costedAmount(i, c) && html`<div class="muted small" style=${{ fontWeight: 400 }}>for ${costedAmount(i, c)}</div>`}
                  </div>
                </li>`;
              })}
            </ul>
          </div>`;
        })}
      </div>
    </div>

    <div class="card">
      <div class="row" style=${{ padding: '12px 12px 0' }}><b>Every item at every store</b></div>
      <div class="muted small" style=${{ padding: '2px 12px 8px' }}>Cost for the same amount at each store (the amount in parentheses), so different package sizes compare fairly.</div>
      <div class="mtable-wrap">
        <table class="mtable">
          <thead><tr><th>Item</th>${storesUsed.map(
              (s) => html`<th key=${s}>
                <span class="row" style=${{ gap: 5, justifyContent: 'flex-end' }}><${StoreDot} id=${s} />${storeInfo(s).short}</span>
                ${storeBasis[s] !== 'shelf' && html`<div class="muted small" style=${{ fontWeight: 400 }} title=${BASIS_TITLE[storeBasis[s]]}>${BASIS_LABEL[storeBasis[s]]}</div>`}
              </th>`,
            )}</tr></thead>
          <tbody>
            ${plan.items.map(
              (i) => html`<tr key=${i.id}>
                <td>
                  <div style=${{ fontWeight: 600 }}>${i.qty > 1 ? `${i.qty} × ` : ''}${i.text}</div>
                  ${!i.pinned && costedAmount(i) && html`<div class="muted small">(${costedAmount(i)}${i.ref.fromText ? '' : ', a typical size'})</div>`}
                  ${i.pinned && html`<div class="muted small">pinned</div>`}
                </td>
                ${storesUsed.map((s) => {
                  const c = i.perStore[s];
                  const cellBasis = c?.product?.priceBasis || 'shelf';
                  return html`<td key=${s} class=${i.cheapest === s ? 'cheap' : ''} title=${c ? `${c.product.name}${c.product.size ? ' · ' + c.product.size : ''}${cellBasis !== 'shelf' ? ' — ' + BASIS_LABEL[cellBasis] : ''}${savedNote(c) ? ` — ${savedNote(c)}` : ''}` : 'Not found'}>${c ? money2(c.cost) : html`<span class="muted">—</span>`}${c && savedNote(c) ? html`<div class="saved-note small">${savedNote(c)}</div>` : ''}</td>`;
                })}
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>
    <p class="footer-note">
      Costs use each store’s cheapest matching product scaled to the same amount, shown with each cost. Where an item has no size, that amount is a typical package size from the results — add one (“orange juice 64 fl oz”) to choose it. Weigh-at-register items (produce, meat) are estimates.
      ${onlineStores.length > 0 && ` Online (Instacart) prices — ${listSentence(onlineStores)} — can run higher than the shelf.`}
      ${nationalStores.length > 0 && ` ${listSentence(nationalStores)} ${nationalStores.length > 1 ? 'publish' : 'publishes'} one chain-wide price rather than your local store’s, so treat ${nationalStores.length > 1 ? 'those columns' : 'that column'} as a guide.`}
    </p>
  </div>`;
}

/** shelf < online < national: how far a price is from "the number on the shelf near you". */
const BASIS_RANK = { shelf: 0, online: 1, national: 2 };

export function worstBasis(items, storeId) {
  let worst = 'shelf';
  for (const i of items) {
    const b = i.perStore[storeId]?.product?.priceBasis || 'shelf';
    if ((BASIS_RANK[b] ?? 0) > BASIS_RANK[worst]) worst = b;
  }
  return worst;
}

/** The strongest caveat that applies to a set of stores, or null when they are all shelf prices. */
export function basisCaveat(stores, storeBasis) {
  if (stores.some((s) => storeBasis[s] === 'national')) return 'national';
  if (stores.some((s) => storeBasis[s] === 'online')) return 'online';
  return null;
}

export function listSentence(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The quantity a cost figure is FOR, in words: "46 fl oz", "2 × 1 gal", or the pinned package.
 *
 * Every cost in the trip plan is `unit price × reference amount × qty`, and for a list item with no
 * size the reference amount is inferred (shared/compare.js referenceAmount: the median package in
 * the results). Two marketing frames priced "orange juice" at Tony's as $2.51 and $2.73 — the same
 * $6.99 gallon — because one inferred 46 fl oz and the other 50, and neither said so. A
 * cent-precise figure whose quantity is invisible and can change between devices cannot be checked
 * against the shelf, so the quantity is printed with every cost. Pinned items are the exception:
 * their cost is the pinned package's price, so the package is what they are for.
 * Returns null when there is no amount to state (no reference, so no cost either).
 */
export function costedAmount(i, c) {
  const times = i.qty > 1 ? `${i.qty} × ` : '';
  if (c?.pinned || (i.pinned && !i.ref)) {
    const size = c?.product?.size;
    return size ? `${times}${size}` : plural(i.qty, 'package');
  }
  if (!i.ref || !i.dim) return null;
  return `${times}${refText(i)}`;
}

// The amount a cost is for, stated exactly. Gallons and pounds only when the amount is a whole
// number of quarter-gallons / quarter-pounds; otherwise the base unit, so "100 fl oz" is never
// rounded to "0.78 gal" (99.84 fl oz) under a cost that was computed for 100.
function refText(i) {
  const s = { dim: i.dim, base: i.ref.base, amount: null, unit: null, count: 1 };
  if (i.dim === 'volume') return i.ref.base >= 64 && Number.isInteger(i.ref.base / 32) ? `${i.ref.base / 128} gal` : `${+i.ref.base.toFixed(1)} fl oz`;
  if (i.dim === 'weight') return i.ref.base >= 16 && Number.isInteger(i.ref.base / 4) ? `${i.ref.base / 16} lb` : `${+i.ref.base.toFixed(1)} oz`;
  if (i.dim === 'count') return i.ref.base === 12 ? '1 dozen' : `${+i.ref.base.toFixed(0)} ct`;
  return formatSize(s);
}

/**
 * The line under a multi-store plan, against the cheapest single store. The words come from
 * shared/compare.js planSavingsClaim, the same rule the phone uses (TripPlanner.savingsClaim): a
 * dollar figure only when every line of both plans is a shelf price, otherwise whether it is
 * cheaper even at the far edge of each total's range. A total built from Instacart listings is
 * not a promise of what the till will say, so it does not get to promise a saving to the cent.
 */
export function planVsSingle(p, single) {
  const c = planSavingsClaim(p, single);
  if (!c) return null;
  if (c.kind === 'exact') return html`<div class="small" style=${{ color: 'var(--good-ink)', fontWeight: 600 }}>Saves ${money2(c.amount)} vs one store</div>`;
  return html`<div class="small ink2">${c.text[0].toUpperCase() + c.text.slice(1)} (vs one store)</div>`;
}
