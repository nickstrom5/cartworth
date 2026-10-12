// Compare: type a food item, see live prices at every store, normalized to the same unit.
import { useEffect, useMemo, useRef, useState } from '/vendor/preact-hooks.mjs';
import { html, StoreTag, StoreDot, Spinner, Notice, Empty, Chip, Seg, ProductImage, storeInfo, useTick } from '../ui.js';
import { Icon } from '../icons.js';
import { BestBars } from '../charts.js';
import { useStore, pref, setPref, openModal, getState } from '../store.js';
import { runSearch, addWatch, addToList, go } from '../actions.js';
import { money, money2, unitPrice, unitLabel, ago, shortDate, endsLabel, plural, shortPromo, BASIS_LABEL, BASIS_TITLE, BASIS_BADGE, linkDestination } from '../format.js';
import { scoreItems, dominantDim, suggestUnit, unitFor, usesMember, flagImplausible, savingsClaim, tieBreak, standings } from '/shared/compare.js';
import { refineChips, RELEVANT } from '/shared/match.js';
import { displayUnitsFor, DISPLAY_UNITS } from '/shared/units.js';
import { ProductDetail } from './product.js';
import { DealCardMini } from './sales.js';
import { OccasionCards } from './occasions.js';

const STAPLES = ['milk', 'eggs', 'bananas', 'chicken breast', 'ground beef', 'butter', 'bread', 'coffee', 'avocados', 'strawberries', 'cheddar cheese', 'orange juice', 'bacon', 'greek yogurt', 'paper towels'];
const STRICT = { strict: 0.75, normal: RELEVANT, all: 0 };
const DIM_LABEL = { weight: 'weight', volume: 'volume', count: 'count' };

export function CompareView() {
  const search = useStore((s) => s.search);
  const settings = useStore((s) => s.settings);
  const recent = useStore((s) => s.recent);
  useTick(30000);

  return html`<div>
    <h1 class="sr-only">${search?.q ? `Prices for ${search.q}` : 'Compare grocery prices'}</h1>
    <${SearchBar} initial=${search?.q || ''} recent=${recent} />
    ${!search &&
    html`<div class="quick">
      ${recent?.length > 0 &&
      html`<div class="section-title" style=${{ marginTop: 18 }}>Recent searches</div>
        <div class="chips">${recent.slice(0, 12).map((r) => html`<${Chip} key=${r.q} onClick=${() => runSearch(r.q)}>${r.q}</${Chip}>`)}</div>`}
      <${OccasionCards} />
      <div class="section-title" style=${{ marginTop: 18 }}>Staples <span class="sub">tap one to compare every store</span></div>
      <div class="chips">${STAPLES.map((q) => html`<${Chip} key=${q} onClick=${() => runSearch(q)}>${q}</${Chip}>`)}</div>
      <div class="card card-pad" style=${{ marginTop: 22 }}>
        <h2>How Cartworth compares</h2>
        <ul class="ink2" style=${{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
          <li>Every price is converted to the same unit (per gallon, per lb, per dozen…) so different package sizes compare fairly.</li>
          <li>Only real matches count toward “best price” — “milk chocolate” won’t win a search for milk. Use the refine chips to narrow it down (whole, 2%, organic…).</li>
          <li>Sale prices, multi-buy deals and this week’s circular ads are included; price history builds up automatically every time you search.</li>
        </ul>
      </div>
    </div>`}
    ${search && html`<${Results} search=${search} settings=${settings} />`}
  </div>`;
}

function SearchBar({ initial, recent }) {
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const inputRef = useRef();
  useEffect(() => setQ(initial), [initial]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pool = [...(recent || []).map((r) => r.q), ...STAPLES];
    const uniq = [...new Set(pool)];
    return (t ? uniq.filter((s) => s.includes(t) && s !== t) : uniq.slice(0, 8)).slice(0, 7);
  }, [q, recent]);
  const submit = (value) => {
    const v = (value ?? q).trim();
    if (!v) return;
    setQ(v);
    setOpen(false);
    inputRef.current?.blur();
    runSearch(v);
  };
  return html`<form class="searchbar" role="search" onSubmit=${(e) => { e.preventDefault(); submit(sel >= 0 ? suggestions[sel] : undefined); }}>
    <div class="field-wrap">
      <${Icon} name="search" size=${20} />
      <input
        ref=${inputRef}
        value=${q}
        placeholder="Search any food item — e.g. whole milk, eggs, chicken thighs…"
        aria-label="Search for a food item"
        role="combobox"
        aria-expanded=${open && suggestions.length > 0 ? 'true' : 'false'}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        aria-activedescendant=${open && sel >= 0 ? `search-suggestion-${sel}` : undefined}
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="search"
        onInput=${(e) => { setQ(e.currentTarget.value); setOpen(true); setSel(-1); }}
        onFocus=${() => setOpen(true)}
        onBlur=${() => setTimeout(() => setOpen(false), 150)}
        onKeyDown=${(e) => {
          if (!open || !suggestions.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(suggestions.length - 1, s + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(-1, s - 1)); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      ${open &&
      suggestions.length > 0 &&
      html`<div class="suggest" role="listbox" id="search-suggestions" aria-label="Search suggestions">
        ${suggestions.map(
          (s, i) => html`<button
            type="button"
            role="option"
            id=${`search-suggestion-${i}`}
            aria-selected=${i === sel ? 'true' : 'false'}
            key=${s}
            tabindex="-1"
            onMouseDown=${(e) => { e.preventDefault(); submit(s); }}
            onClick=${(e) => { e.preventDefault(); submit(s); }}
          >
            <${Icon} name=${(recent || []).some((r) => r.q === s) ? 'clock' : 'search'} size=${14} /> ${s}
          </button>`,
        )}
      </div>`}
    </div>
    <button class="btn btn-primary" type="submit">Compare</button>
  </form>`;
}

/**
 * The store location a result may present as "yours".
 *
 * A national-basis result comes from Instacart's canonical storefront for the chain, which is a
 * real store somewhere else: at 53211 Walmart's is "Walmart - 2697, 4893 Lone Tree Way, Antioch,
 * CA", 1,801 miles away, and Hy-Vee's is in Lincoln, NE. The search response carried that
 * storefront's name, address and distance, and this strip printed them in the same "name ·
 * address · N mi away" form as a real local store — so a price the rest of the app is careful to
 * call "not your store's" was captioned with somebody else's store. /api/locations already drops
 * the address for a canonical shop (server.js resolveLocation); the search result does not (the
 * adapter's publicLocation passes the canonical storefront through — handed off to its owner, and
 * this stays correct either way).
 *
 * National-ness is read from every signal we have, because they arrive by different routes: a
 * `canonical` flag on the search result's location if the adapter ever sets one, the /api/locations
 * entry (which does), and the rows themselves (every row from a canonical storefront is priced
 * 'national'). Nothing from the faraway storefront survives — not its name, address or distance,
 * and not its own Instacart note either ("No markups" at Walmart's Antioch storefront is a fact
 * about that store, not about the shopper's).
 */
export function localLocation(r, fallback) {
  const loc = r?.location || fallback || null;
  const national = !!(loc?.canonical || fallback?.canonical || (r?.items || []).some((p) => p.priceBasis === 'national'));
  if (!national) return loc;
  return { national: true, name: null, address: null, distance: null, priceNote: 'Chain-wide Instacart listing \u2014 no store near you' };
}

function StatusStrip({ search }) {
  const locations = useStore((s) => s.locations);
  const ids = Object.keys(search.results);
  return html`<div class="status-strip" aria-label="Store status">
    ${ids.map((id) => {
      const r = search.results[id];
      const s = storeInfo(id);
      const loc = localLocation(r, locations?.[id]);
      const title = [s.name, loc?.name && loc.name !== s.name ? loc.name : null, loc?.address, loc?.distance != null ? `${loc.distance} mi away (straight line)` : null, loc?.priceNote].filter(Boolean).join(' · ');
      if (r.status === 'loading') return html`<span class="sstat" key=${id} title=${title}><${Spinner} size=${12} />${s.short}</span>`;
      if (r.status === 'error')
        return html`<button class="sstat err" key=${id} title=${`${r.error} — click to retry`} onClick=${() => runSearch(search.q, { fresh: true, only: [id] })}>
          <${Icon} name="alert" size=${13} /><b>${s.short}</b> failed · retry
        </button>`;
      if (r.status === 'unsupported') return html`<span class="sstat off" key=${id} title=${r.message}>${s.short} · ads only</span>`;
      if (r.status === 'tooFar') return html`<span class="sstat off" key=${id} title=${r.message}>${s.short} · outside radius</span>`;
      if (r.status === 'blocked') return html`<span class="sstat off" key=${id} title=${r.message}>${s.short} · prices in the iPhone app</span>`;
      // Not asked: the store's queue was long or this visitor ran many new searches (src/guard.js).
      if (r.status === 'busy')
        return html`<button class="sstat off" key=${id} title=${`${r.message} Click to try again.`} onClick=${() => runSearch(search.q, { only: [id] })}>${s.short} · busy, try again</button>`;
      return html`<span class="sstat" key=${id} title=${title + (r.stale ? ` · ⚠ ${r.stale}${r.savedAt ? ` (prices from ${new Date(r.savedAt).toLocaleString()})` : ''}` : '')}>
        <${StoreDot} id=${id} /><b>${s.short}</b> ${r.items?.length ? r.items.length : 'no results'}
        ${r.stale && html`<span class="badge badge-warn" title=${r.stale}>${r.savedAt ? `saved ${ago(r.savedAt)}` : 'stale'}</span>`}
        ${r.cached && !r.stale && html`<span class="muted" title="Loaded from the last 20 minutes">· cached</span>`}
      </span>`;
    })}
  </div>`;
}

function Results({ search, settings }) {
  const [strict, setStrict] = useState(pref('strict', 'normal'));
  const [sort, setSort] = useState(pref('sort', 'unit'));
  const [view, setView] = useState(pref('view', 'list'));
  const [dimOverride, setDimOverride] = useState(null);
  const [unitOverride, setUnitOverride] = useState(null);
  const [include, setInclude] = useState([]);
  const [exclude, setExclude] = useState([]);
  const [flags, setFlags] = useState({ sale: false, organic: false, storeBrand: false, inStock: false });
  const [hidden, setHidden] = useState([]);
  const [limit, setLimit] = useState(60);
  const listRef = useRef();

  // Reset per-query refinements when the query changes
  useEffect(() => {
    setInclude([]);
    setExclude([]);
    setDimOverride(null);
    setUnitOverride(null);
    setHidden([]);
    setLimit(60);
  }, [search.q]);

  const prefs = { prime: settings?.prime, cardPrices: settings?.cardPrices };
  const results = search.results;
  const pendingStores = Object.values(results).filter((r) => r.status === 'loading').length;
  const loading = pendingStores > 0;

  const model = useMemo(() => {
    const all = [];
    for (const r of Object.values(results)) for (const p of r.items || []) all.push(p);
    const scored = scoreItems(search.q, all, { include, exclude });
    const threshold = STRICT[strict] ?? RELEVANT;
    const relevant = scored.filter((p) => p.score >= Math.max(threshold, strict === 'all' ? 0 : 0.01));
    // The Show control widens the LIST, never the answer. It is presented as a list filter
    // ("Every product each store returned"), and onboarding promises that only real matches count
    // toward the best price — but the headline and the per-store chart were rebuilt from whatever
    // the widened list happened to contain, so "sweet potatoes" on Everything was headlined
    // "50¢/lb Tony's · Green Cabbage", complete with a "16% less than Jewel" claim over a
    // different vegetable. The answer stays pinned to rows that clear RELEVANT — or to the user's
    // own threshold when they have asked for something stricter.
    const answerFloor = Math.max(threshold, RELEVANT);
    const matched = relevant.filter((p) => p.score >= answerFloor);
    const dim = dimOverride || dominantDim(matched.length ? matched : relevant.length ? relevant : scored);
    // Mark prices that cannot be right given the other matches, so one mis-parsed case price
    // cannot become the headline number or silently win the comparison.
    if (dim) flagImplausible(relevant, dim, prefs);
    const dims = [...new Set(relevant.flatMap((p) => Object.keys(p.unit || {})))];
    const displayUnit = unitOverride && DISPLAY_UNITS[unitOverride]?.dim === dim ? unitOverride : dim ? suggestUnit(dim, (matched.length ? matched : relevant).filter((p) => p.dim === dim), search.q) : null;
    const factor = displayUnit ? DISPLAY_UNITS[displayUnit].factor : 1;
    const pass = (p) =>
      (!flags.sale || p.onSale || p.promo) &&
      (!flags.organic || /organic/i.test(p.name) || p.tags?.includes('organic')) &&
      (!flags.storeBrand || p.tags?.includes('storeBrand')) &&
      (!flags.inStock || (p.available !== false && !/out/i.test(p.stock || ''))) &&
      !hidden.includes(p.storeId);
    const rows = relevant.filter(pass).map((p) => {
      const u = dim ? unitFor(p, dim, prefs) : null;
      return { ...p, cmp: u ? u.perBase : null, cmpEst: u?.est, cmpMember: u?.member, shown: u ? u.perBase * factor : null };
    });
    const hiddenCount = scored.length - relevant.length;
    // best per store (from filtered rows)
    const best = {};
    for (const p of rows) {
      if (p.cmp == null) continue;
      // See answerFloor above: a weak row shows in the list but never becomes the answer.
      if (p.score != null && p.score < answerFloor) continue;
      // A price we cannot believe must never become a store's headline number. It stays in the
      // list below, marked, so nothing is hidden: it just does not get to be the answer.
      if (p.implausible) continue;
      if (!best[p.storeId] || p.cmp < best[p.storeId].cmp || (p.cmp === best[p.storeId].cmp && tieBreak(p, best[p.storeId]) < 0)) best[p.storeId] = p;
    }
    const bestRows = Object.values(best).sort((a, b) => a.cmp - b.cmp || tieBreak(a, b));
    const cmpSort = {
      unit: (a, b) => (a.cmp ?? Infinity) - (b.cmp ?? Infinity) || b.score - a.score,
      price: (a, b) => (effPrice(a, prefs) ?? Infinity) - (effPrice(b, prefs) ?? Infinity),
      discount: (a, b) => (b.pctOff || 0) - (a.pctOff || 0) || (a.cmp ?? Infinity) - (b.cmp ?? Infinity),
      relevance: (a, b) => b.score - a.score,
      store: (a, b) => storeOrder(a.storeId) - storeOrder(b.storeId) || (a.cmp ?? Infinity) - (b.cmp ?? Infinity),
    }[sort];
    rows.sort(cmpSort);
    const chips = refineChips(search.q, relevant, 12);
    const counts = {
      sale: relevant.filter((p) => p.onSale || p.promo).length,
      organic: relevant.filter((p) => /organic/i.test(p.name)).length,
      storeBrand: relevant.filter((p) => p.tags?.includes('storeBrand')).length,
    };
    return { rows, dim, dims, displayUnit, bestRows, chips, hiddenCount, relevantCount: relevant.length, total: scored.length, counts };
  }, [results, search.q, strict, sort, dimOverride, unitOverride, include, exclude, flags, hidden, settings?.prime, settings?.cardPrices]);

  const { rows, dim, dims, displayUnit, bestRows } = model;
  const winner = bestRows[0];
  // The chart's "Best" and the headline's savings line follow one rule: a store within the
  // price-basis margin of the winner is 'close', not beaten (shared/compare.js standings).
  const verdicts = Object.fromEntries(standings(Object.fromEntries(bestRows.map((p) => [p.storeId, p]))).map((r) => [r.storeId, r.verdict]));
  const anyResults = Object.values(results).some((r) => r.items?.length);
  const errors = Object.values(results).filter((r) => r.status === 'error');
  // Every store errored: the page already says "Can't reach the Cartworth server", and telling the
  // shopper to check their spelling on top of that sends them down a dead end.
  const storeCount = Object.keys(results).length;
  const allFailed = storeCount > 0 && errors.length === storeCount;
  // SC 4.1.3 Status Messages. A search on this project finishes ten to sixteen seconds after the
  // user asked for it, with no focus change, and the only live regions in the document were the
  // spinners — each inserted already carrying its accessible name, which is the one shape screen
  // readers do not reliably announce. So a screen-reader user was told nothing at all when 19
  // results and a five-store price chart arrived. This region is rendered unconditionally, before
  // any search runs, and only its TEXT changes — that is what makes the change announceable.
  const storesWithItems = Object.values(results).filter((r) => r.items?.length).length;
  const liveMessage = loading
    ? ''
    : allFailed
      ? 'No prices: every store failed to answer.'
      : !anyResults
        ? `No results for ${search.q}.`
        : `${plural(rows.length, 'result')} from ${plural(storesWithItems, 'store')}.${
            winner && displayUnit ? ` Best price ${unitPrice(winner.cmp, displayUnit).text} per ${unitLabel(displayUnit)} at ${storeInfo(winner.storeId).short}.` : ''
          }`;

  const toggleChip = (chip) => {
    if (include.includes(chip)) {
      setInclude(include.filter((c) => c !== chip));
      setExclude([...exclude, chip]);
    } else if (exclude.includes(chip)) setExclude(exclude.filter((c) => c !== chip));
    else setInclude([...include, chip]);
  };
  const watchSearch = () => {
    const label = [search.q, ...include].join(' ');
    addWatch({ query: search.q, label: label !== search.q ? label : undefined, include, exclude, dim, displayUnit });
  };

  return html`<div>
    <div class="row wrap" style=${{ marginTop: 12, gap: 10 }}>
      <${StatusStrip} search=${search} />
      <div class="spacer"></div>
      <div class="row wrap" style=${{ marginTop: 12 }}>
        ${loading ? html`<span class="muted small row"><${Spinner} size=${12} /> checking stores…</span>` : search.ms != null && html`<span class="muted small">Checked ${ago(search.startedAt)}</span>`}
        <button class="btn btn-sm" onClick=${() => runSearch(search.q, { fresh: true })} disabled=${loading} title="Ignore cached prices and check every store again"><${Icon} name="refresh" size=${14} /> Refresh</button>
        <button class="btn btn-sm" onClick=${watchSearch} title="Track this item's best price across stores"><${Icon} name="star" size=${14} /> Watch</button>
        <button class="btn btn-sm" onClick=${() => addToList({ text: [search.q, ...include].join(' ') })} title="Add to your shopping list"><${Icon} name="plus" size=${14} /> List</button>
      </div>
    </div>

    ${search.error && html`<div style=${{ marginTop: 12 }}><${Notice} kind="bad" icon="alert">${search.error}</${Notice}></div>`}

    <div class="cmp-grid">
      <div class="stack" style=${{ gap: 16, minWidth: 0 }}>
        ${search.ads?.length > 0 &&
        html`<div class="card" style=${{ padding: '12px 12px 4px' }}>
          <div class="row" style=${{ marginBottom: 8 }}>
            <${Icon} name="tag" size=${16} />
            <b style=${{ fontSize: 14 }}>In this week’s ads</b>
            <span class="muted small">${plural(search.ads.length, 'circular deal')} matching “${search.q}”</span>
          </div>
          <div class="ads-strip">${search.ads.slice(0, 16).map((d) => html`<${DealCardMini} key=${d.id} deal=${d} />`)}</div>
        </div>`}

        <div class="card" ref=${listRef}>
          <div class="toolbar">
            <span class="lbl">Show</span>
            <${Seg}
              label="Match strictness"
              value=${strict}
              onChange=${(v) => { setStrict(v); setPref('strict', v); }}
              options=${[
                { value: 'strict', label: 'Close matches', title: 'Only products that clearly are what you searched for' },
                { value: 'normal', label: 'Matches', title: 'Real matches (hides things like “milk chocolate” for “milk”)' },
                { value: 'all', label: 'Everything', title: 'Every product each store returned' },
              ]}
            />
            <span class="lbl" style=${{ marginLeft: 6 }}>Sort</span>
            <select class="select select-sm" value=${sort} onChange=${(e) => { setSort(e.currentTarget.value); setPref('sort', e.currentTarget.value); }} aria-label="Sort by">
              <option value="unit">Unit price</option>
              <option value="price">Package price</option>
              <option value="discount">Biggest discount</option>
              <option value="relevance">Best match</option>
              <option value="store">Store</option>
            </select>
            ${dim &&
            html`<span class="lbl" style=${{ marginLeft: 6 }}>Per</span>
              <select class="select select-sm" value=${displayUnit} onChange=${(e) => setUnitOverride(e.currentTarget.value)} aria-label="Unit for comparison">
                ${displayUnitsFor(dim).map((u) => html`<option value=${u}>${unitLabel(u)}</option>`)}
              </select>
              ${dims.length > 1 &&
              html`<select class="select select-sm" value=${dim} onChange=${(e) => { setDimOverride(e.currentTarget.value); setUnitOverride(null); }} aria-label="Compare by">
                ${dims.map((d) => html`<option value=${d}>by ${DIM_LABEL[d]}</option>`)}
              </select>`}`}
            <div class="spacer"></div>
            <${Seg} label="Layout" value=${view} onChange=${(v) => { setView(v); setPref('view', v); }} options=${[{ value: 'list', label: 'All' }, { value: 'stores', label: 'By store' }]} />
          </div>
          <div class="toolbar" style=${{ paddingTop: 8, paddingBottom: 8 }}>
            <div class="chips scroll" style=${{ flex: 1 }}>
              <${Chip} pressed=${flags.sale} onClick=${() => setFlags({ ...flags, sale: !flags.sale })} count=${model.counts.sale}>On sale</${Chip}>
              <${Chip} pressed=${flags.organic} onClick=${() => setFlags({ ...flags, organic: !flags.organic })} count=${model.counts.organic}>Organic</${Chip}>
              <${Chip} pressed=${flags.storeBrand} onClick=${() => setFlags({ ...flags, storeBrand: !flags.storeBrand })} count=${model.counts.storeBrand}>Store brand</${Chip}>
              <${Chip} pressed=${flags.inStock} onClick=${() => setFlags({ ...flags, inStock: !flags.inStock })}>In stock</${Chip}>
              ${model.chips.length > 0 && html`<span class="muted small" style=${{ alignSelf: 'center', margin: '0 2px 0 6px' }}>Refine:</span>`}
              ${[...new Set([...include, ...exclude, ...model.chips.map((c) => c.chip)])].map((chip) => {
                const c = model.chips.find((x) => x.chip === chip);
                const state = include.includes(chip) ? 'inc' : exclude.includes(chip) ? 'exc' : null;
                return html`<${Chip}
                  key=${chip}
                  pressed=${!!state}
                  neg=${state === 'exc'}
                  count=${state ? null : c?.count}
                  title=${state === 'inc' ? 'Click again to exclude' : state === 'exc' ? 'Click to clear' : 'Only show items with this word'}
                  onClick=${() => toggleChip(chip)}
                >${chip}</${Chip}>`;
              })}
            </div>
          </div>

          ${!anyResults && loading && html`<${SkeletonRows} />`}
          ${!anyResults && !loading && allFailed &&
          html`<${Empty} icon="alert" title="No prices to show">
            Every store failed to answer, so there is nothing to compare yet. This is a connection problem, not a spelling one — retry once the server is reachable.
          </${Empty}>`}
          ${!anyResults && !loading && !allFailed &&
          html`<${Empty} icon="search" title="No prices found">
            None of the stores returned “${search.q}”. Try a simpler name (e.g. “yogurt” instead of a brand), or check spelling.
          </${Empty}>`}
          ${anyResults && rows.length === 0 &&
          html`<${Empty} icon="filter" title="Nothing matches these filters">
            ${model.total} products came back, but none pass the current filters.
            <div style=${{ marginTop: 10 }}><button class="btn btn-sm" onClick=${() => { setStrict('all'); setFlags({ sale: false, organic: false, storeBrand: false, inStock: false }); setInclude([]); setExclude([]); setHidden([]); }}>Show everything</button></div>
          </${Empty}>`}
          ${rows.length > 0 && view === 'list' &&
          html`<div class="plist">
            ${rows.slice(0, limit).map((p, i) => html`<${ProductRow} key=${p.key} p=${p} displayUnit=${displayUnit} best=${winner && p.key === winner.key} prefs=${prefs} q=${search.q} />`)}
            ${rows.length > limit && html`<div style=${{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line)' }}><button class="btn btn-sm" onClick=${() => setLimit(limit + 80)}>Show ${Math.min(80, rows.length - limit)} more</button></div>`}
          </div>`}
          ${rows.length > 0 && view === 'stores' && html`<${ByStore} rows=${rows} results=${results} displayUnit=${displayUnit} winner=${winner} prefs=${prefs} q=${search.q} />`}
          <div class="sr-only" role="status" aria-live="polite">${liveMessage}</div>
          ${anyResults &&
          html`<div class="muted small" style=${{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
            Showing ${rows.length} of ${model.total} products
            ${strict !== 'all' && model.hiddenCount > 0 && html` · ${model.hiddenCount} weaker matches hidden (<a href="#" onClick=${(e) => { e.preventDefault(); setStrict('all'); setPref('strict', 'all'); }}>show</a>)`}
            ${!dim && ' · sizes not comparable, so sorted by package price'}
          </div>`}
        </div>
      </div>

      <div class="side-sticky">
        ${winner
          ? html`<div class="card hero-best">
              <div class="hero-label">${loading ? 'Best price so far' : 'Best price'}${include.length ? ` · ${include.join(', ')}` : ''}</div>
              <div class="hero-value">${unitPrice(winner.cmp, displayUnit).text}<span class="per">/${unitLabel(displayUnit)}</span></div>
              <div class="row wrap" style=${{ gap: 6 }}>
                <${StoreTag} id=${winner.storeId} short=${false} />
                ${winner.cmpEst && html`<span class="badge" title="Estimated from a typical piece weight">est.</span>`}
                ${winner.priceBasis && html`<span class="badge badge-outline" title=${BASIS_TITLE[winner.priceBasis]}>${BASIS_LABEL[winner.priceBasis] || BASIS_LABEL.online}</span>`}
              </div>
              <div class="hero-sub"><a href="#" onClick=${(e) => { e.preventDefault(); openProduct(winner, displayUnit); }}>${winner.name}</a>${winner.size ? ` · ${winner.size}` : ''} · ${money2(effPrice(winner, prefs))}${winner.soldBy === 'lb' ? '/lb' : ''}</div>
              ${bestRows[1] && savingsLine(winner, bestRows[1], displayUnit) && html`<div class="muted small">${savingsLine(winner, bestRows[1], displayUnit)}</div>`}
              ${loading && html`<div class="muted small">${pendingStores} more ${pendingStores === 1 ? 'store is' : 'stores are'} still answering; this can change.</div>`}
            </div>`
          : loading
            ? html`<div class="card hero-best"><div class="hero-label">Best price</div><div class="skeleton" style=${{ height: 40, width: '70%' }}></div><div class="skeleton" style=${{ height: 14, width: '90%' }}></div></div>`
            : null}
        ${bestRows.length > 1 &&
        html`<div class="card card-pad">
          <h2>Cheapest match at each store <span class="muted small" style=${{ fontWeight: 400 }}>per ${unitLabel(displayUnit)}</span></h2>
          <${BestBars}
            rows=${bestRows.map((p, i) => ({ id: p.storeId, storeId: p.storeId, label: storeInfo(p.storeId).short, value: p.shown, text: unitPrice(p.cmp, displayUnit).text, sub: `${p.name}${p.size ? ` · ${p.size}` : ''} — ${money2(effPrice(p, prefs))}${p.soldBy === 'lb' ? '/lb' : ''}`, best: i === 0, close: verdicts[p.storeId] === 'close', basis: p.priceBasis ? BASIS_BADGE[p.priceBasis] || BASIS_BADGE.online : null }))}
            onPick=${(r) => openProduct(bestRows.find((p) => p.storeId === r.storeId), displayUnit)}
            note=${bestRows.some((p) => p.priceBasis === 'national')
              ? 'Some stores show online (Instacart) prices, which can run higher than the shelf. \u201CNational\u201D means Instacart\u2019s chain-wide listing rather than a store near you.'
              : bestRows.some((p) => p.priceBasis === 'online')
                ? 'Some stores show online (Instacart) prices, which can run higher than the shelf.'
                : null}
          />
          <div class="row wrap" style=${{ marginTop: 10, gap: 6 }}>
            ${Object.keys(results).filter((id) => results[id].items?.length).map((id) => html`<${Chip} key=${id} soft=${true} pressed=${!hidden.includes(id)} onClick=${() => setHidden(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id])} title="Include or hide this store"><${StoreDot} id=${id} />${storeInfo(id).short}</${Chip}>`)}
          </div>
        </div>`}
        ${errors.length > 0 &&
        html`<${Notice} kind="warn" icon="alert">
          ${errors.map((r) => html`<div key=${r.storeId}><b>${storeInfo(r.storeId).short}:</b> ${r.error}</div>`)}
          <div style=${{ marginTop: 6 }}><button class="btn btn-sm" onClick=${() => runSearch(search.q, { fresh: true, only: errors.map((r) => r.storeId) })}>Retry</button></div>
        </${Notice}>`}
      </div>
    </div>
  </div>`;
}

function storeOrder(id) {
  return getState().stores.findIndex((s) => s.id === id);
}

export function effPrice(p, prefs) {
  return usesMember(p, prefs) ? p.memberPrice : p.price;
}

// The sentence is decided in shared/compare.js savingsClaim, the same one the phone renders: an exact
// figure only between two prices of the same basis, words across bases, nothing against a flagged
// price. This only fills in the display unit and the store's name.
export function savingsLine(a, b, displayUnit) {
  // Pass the unambiguous { product, perBase, est } shape: a Compare row also carries the product's
  // own `unit` map ({ volume: { perBase } }), which savingsClaim would otherwise read as a
  // bestPerStore entry's single unit and find no price in, so the line silently never showed.
  const side = (r) => ({ product: r, perBase: r.cmp, est: !!r.cmpEst });
  const c = savingsClaim(side(a), side(b));
  if (!c) return null;
  return c.text
    .replace('{amount}', c.diffPerBase != null ? unitPrice(c.diffPerBase, displayUnit).text : '')
    .replace('{unit}', unitLabel(displayUnit))
    .replace('{store}', storeInfo(c.storeId).short);
}

function openProduct(p, displayUnit) {
  openModal(html`<${ProductDetail} p=${p} displayUnit=${displayUnit} />`);
}

function SkeletonRows() {
  return html`<div class="plist">
    ${[0, 1, 2, 3, 4].map(
      (i) => html`<div class="prow" key=${i}>
        <div class="skeleton" style=${{ width: 52, height: 52, borderRadius: 10 }}></div>
        <div style=${{ display: 'grid', gap: 6 }}><div class="skeleton" style=${{ height: 14, width: `${60 + i * 7}%` }}></div><div class="skeleton" style=${{ height: 11, width: '35%' }}></div></div>
        <div class="skeleton" style=${{ height: 20, width: 90 }}></div>
      </div>`,
    )}
  </div>`;
}

export function ProductRow({ p, displayUnit, best, prefs, q, compact }) {
  const up = p.cmp != null && displayUnit ? unitPrice(p.cmp, displayUnit) : null;
  const dest = p.url ? linkDestination(p.url, storeInfo(p.storeId)) : null;
  const eff = effPrice(p, prefs);
  const h = p.hist;
  const lowest = h && h.n >= 3 && p.price <= h.low + 0.004;
  const dropped = h?.prev != null && p.price < h.prev - 0.004;
  const rose = h?.prev != null && p.price > h.prev + 0.004;
  const oos = p.available === false || /out/i.test(p.stock || '');
  const pinned = { storeId: p.storeId, key: p.key, name: p.name, brand: p.brand, size: p.size, price: eff, url: p.url, image: p.image, soldBy: p.soldBy, dim: p.dim };
  // A weak match now says so in words. It used to be signalled only by fading the whole row, which
  // is both a contrast failure (see .prow.dim in app.css) and colour/appearance as the only cue.
  const weak = p.score != null && p.score < RELEVANT;
  return html`<div class=${`prow${best ? ' best' : ''}${weak ? ' dim' : ''}`}>
    <${ProductImage} src=${p.image} alt="" />
    <div class="pmain">
      <div class="pname" role="button" tabindex="0" onClick=${() => openProduct(p, displayUnit)} onKeyDown=${(e) => e.key === 'Enter' && openProduct(p, displayUnit)}>${p.name}</div>
      <div class="pmeta">
        ${!compact && html`<${StoreTag} id=${p.storeId} />`}
        ${p.brand && !p.name.toLowerCase().startsWith(p.brand.toLowerCase()) && html`<span>${p.brand}</span>`}
        ${p.size && html`<span>${p.size}</span>`}
        ${weak && html`<span class="badge badge-outline" title="Only loosely matches your search, so it is never counted as the best price">weak match</span>`}
        ${best && html`<span class="badge badge-good"><${Icon} name="check" size=${11} stroke=${3} /> Best</span>`}
        ${p.onSale && p.pctOff ? html`<span class="badge badge-sale">${p.pctOff}% off</span>` : p.onSale ? html`<span class="badge badge-sale">Sale</span>` : null}
        ${p.promo && html`<span class="badge badge-sale badge-promo" title=${p.promo}>${shortPromo(p.promo)}</span>`}
        ${p.memberPrice != null && html`<span class="badge badge-info" title=${usesMember(p, prefs) ? 'Counted in the unit price (Settings)' : 'Not counted — turn on in Settings'}>${p.memberLabel} ${money2(p.memberPrice)}</span>`}
        ${lowest &&
        html`<span
          class="badge badge-good"
          title=${`The lowest of ${h.n} prices Cartworth has recorded here${h.firstAt ? `, going back to ${shortDate(h.firstAt)}` : ''}. History is kept for a year, so this is the lowest in that window — not an all-time low.`}
          >Lowest seen</span
        >`}
        ${dropped && html`<span class="badge badge-good" title="Since your last check"><${Icon} name="arrowDown" size=${11} stroke=${3} /> from ${money2(h.prev)}</span>`}
        ${rose && html`<span class="badge badge-warn" title="Since your last check"><${Icon} name="arrowUp" size=${11} stroke=${3} /> from ${money2(h.prev)}</span>`}
        ${oos && html`<span class="badge badge-bad">Out of stock</span>`}
        ${/low/i.test(p.stock || '') && html`<span class="badge badge-warn">Low stock</span>`}
        ${p.priceBasis && html`<span class="badge badge-outline" title=${BASIS_TITLE[p.priceBasis]}>${BASIS_BADGE[p.priceBasis] || BASIS_BADGE.online}</span>`}
        ${p.implausible &&
        html`<span
          class="badge warn"
          title=${`This works out ${p.implausible.ratio}\u00d7 the typical unit price for this search. Usually it means the listing's size is wrong, for example a multi-pack priced as one unit. Check the label before trusting it.`}
          >price looks wrong</span
        >`}
        ${p.sizeConflict && !p.implausible &&
        html`<span
          class="badge warn"
          title=${`The store lists this as ${p.sizeConflict.text}, but its name says ${p.sizeConflict.name}. The price may be for a different amount than the size shown, so no unit price is given and it is never counted as the best price. Check the label.`}
          >size unclear</span
        >`}
        ${p.sponsored && html`<span class="badge" title="The store’s search promoted this item">Ad</span>`}
      </div>
    </div>
    <div class="pprice">
      ${up
        ? html`<div class="unit-big">${up.text}<span class="u">/${up.unit}</span>${p.cmpEst ? html`<span class="u" title="Estimated using a typical piece weight"> est.</span>` : ''}</div>`
        : html`<div class="unit-big" style=${{ fontSize: 15 }}>${money2(eff)}${p.soldBy === 'lb' ? html`<span class="u">/lb</span>` : ''}</div>`}
      ${up &&
      html`<div class="pkg">
        <span class="nw">${money2(eff)}${p.soldBy === 'lb' ? '/lb' : ''}</span>
        ${p.regularPrice && html` <span class="was">${money2(p.regularPrice)}</span>`}
        ${p.estPkg && html` <span class="muted">· <span class="nw">~${money2(p.estPkg)}/pkg</span></span>`}
      </div>`}
      ${!up && p.regularPrice && html`<div class="pkg"><span class="was">${money2(p.regularPrice)}</span></div>`}
    </div>
    <div class="pactions">
      <button class="btn btn-ghost" title="Price history" aria-label="Price history" onClick=${() => openProduct(p, displayUnit)}><${Icon} name="chart" size=${15} /></button>
      <button class="btn btn-ghost" title="Watch this product" aria-label="Watch this product" onClick=${() => addWatch({ query: p.name, label: p.name, dim: p.dim })}><${Icon} name="star" size=${15} /></button>
      <button class="btn btn-ghost" title="Add this exact item to your list" aria-label="Add to list" onClick=${() => addToList({ text: p.name, pinned })}><${Icon} name="plus" size=${15} /></button>
      ${dest
        ? html`<a class="btn btn-ghost" title=${dest.text} aria-label=${`${dest.text} (new tab)`} href=${p.url} target="_blank" rel="noopener noreferrer"><${Icon} name="external" size=${15} /></a>`
        : html`<span></span>`}
    </div>
  </div>`;
}

function ByStore({ rows, results, displayUnit, winner, prefs, q }) {
  const byStore = {};
  for (const p of rows) (byStore[p.storeId] ||= []).push(p);
  const order = Object.keys(results).filter((id) => byStore[id]?.length).sort((a, b) => (byStore[a][0].cmp ?? Infinity) - (byStore[b][0].cmp ?? Infinity));
  const [open, setOpen] = useState({});
  return html`<div class="store-col">
    ${order.map((id) => {
      const list = [...byStore[id]].sort((a, b) => (a.cmp ?? Infinity) - (b.cmp ?? Infinity));
      const n = open[id] ? list.length : 5;
      const loc = localLocation(results[id]);
      return html`<div class="store-card" key=${id}>
        <div class="store-card-head">
          <${StoreDot} id=${id} size=${10} /> ${storeInfo(id).name}
          <span class="spacer"></span>
          ${loc?.distance != null && html`<span class="muted small" title=${[loc.name, loc.address].filter(Boolean).join(' · ')}>${loc.distance} mi</span>`}
          ${loc?.national && html`<span class="muted small" title=${loc.priceNote}>chain-wide</span>`}
        </div>
        <div class="plist">
          ${list.slice(0, n).map((p) => html`<${ProductRow} key=${p.key} p=${p} displayUnit=${displayUnit} best=${winner && p.key === winner.key} prefs=${prefs} q=${q} compact=${true} />`)}
        </div>
        ${list.length > 5 && html`<div style=${{ padding: 8, textAlign: 'center', borderTop: '1px solid var(--line)' }}><button class="btn btn-sm btn-ghost" onClick=${() => setOpen({ ...open, [id]: !open[id] })}>${open[id] ? 'Show fewer' : `Show all ${list.length}`}</button></div>`}
      </div>`;
    })}
  </div>`;
}
