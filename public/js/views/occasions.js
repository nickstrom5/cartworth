// Holiday cards: the next one or two holidays within three weeks, with a starter shopping list
// (each item one tap from a price check) and, on the Sales tab, the weekly-ad deals that match.
// The holidays, lists and keywords are the phone's (shared/seasonal.js, generated from it).
import { html, Chip } from '../ui.js';
import { Icon } from '../icons.js';
import { runSearch, addManyToList } from '../actions.js';
import { featured, whenText } from '/shared/seasonal.js';
import { relevance, RELEVANT } from '/shared/match.js';

/**
 * Deals that match any of the holiday's keywords, each once. Scored with the search matcher, not a
 * shared word: "Dark Roast Coffee" shares 'roast' with a Christmas roast and is not one.
 */
export function occasionDeals(occasion, deals) {
  return (deals || []).filter((d) => occasion.keywords.some((k) => relevance(k, { name: `${d.brand || ''} ${d.name}`.trim() }) >= RELEVANT));
}

export function OccasionCards({ now = new Date(), deals = null, week = 'current', onShowDeals = null }) {
  const list = featured(now);
  if (!list.length) return null;
  return html`<div class="occasions">
    ${list.map((o) => {
      const matches = deals ? occasionDeals(o, deals) : null;
      return html`<section class="card card-pad occasion" key=${o.id} aria-label=${`${o.name} ${whenText(o.daysAway)}`}>
        <div class="row" style=${{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 style=${{ margin: 0 }}>${o.name} <span class="muted" style=${{ fontWeight: 500 }}>${whenText(o.daysAway)}</span></h2>
        </div>
        <p class="ink2 small" style=${{ margin: '4px 0 8px' }}>${o.blurb}</p>
        <div class="chips">${o.list.map((item) => html`<${Chip} key=${item} onClick=${() => runSearch(item)} title=${`Compare ${item} at every store`}>${item}</${Chip}>`)}</div>
        <div class="row wrap" style=${{ gap: 8, marginTop: 10 }}>
          <button class="btn btn-sm" onClick=${() => addManyToList(o.list, { label: `${o.name} items` })}><${Icon} name="plus" size=${14} /> Add all to my list</button>
          ${matches && matches.length > 0 && onShowDeals &&
          html`<button class="btn btn-sm" onClick=${() => onShowDeals(o, matches)}><${Icon} name="tag" size=${14} /> ${matches.length} matching ${matches.length === 1 ? 'deal' : 'deals'} in ${week === 'next' ? 'next' : 'this'} week’s ads</button>`}
        </div>
      </section>`;
    })}
  </div>`;
}
