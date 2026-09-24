// Settings: location, stores, pricing preferences, Kroger keys, and your data.
// Everything on this page is saved in this browser only — the server never sees it.
import { useEffect, useRef, useState } from '/vendor/preact-hooks.mjs';
import { html, StoreDot, Spinner, Notice, Switch, storeInfo } from '../ui.js';
import { Icon } from '../icons.js';
import { api } from '../api.js';
import { useStore, setState, getState, toast, storageHealthy, forgetEverything, RADIUS_MILES, snapRadius } from '../store.js';
import { saveSettings, loadLocations, forgetSearches, exportMyData, importMyData, hasKrogerKeys } from '../actions.js';
// How each store's prices reach you (shelf / online / national / weekly ad) is described in one
// place, ../format.js, so every screen words it the same way and none of them can forget a case.
import { ago, plural, basisInfo, isPriceable } from '../format.js';

/**
 * Print a store's note WITHOUT repeating the basis label it already opens with.
 *
 * Store notes are written as complete sentences, so most of them restate the label first:
 * "Weekly ad only — Target blocks automated price lookups.", "Shelf prices, including sale and
 * Prime member prices." The old guard only suppressed a note that was EXACTLY equal to the label,
 * so Target rendered "Weekly ad only — Weekly ad only — Target blocks automated price lookups."
 * Strip the label off the FRONT instead, then strip the punctuation that joined the two clauses —
 * otherwise Whole Foods reads "Shelf prices — , including sale and Prime member prices." and a
 * note that was nothing BUT the label leaves a bare "— .".
 */
function noteAfterLabel(note, label) {
  if (!note) return '';
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rest = String(note)
    .trim()
    .replace(new RegExp(`^${escaped}`, 'i'), '')
    .replace(/^[\s,;:.\u2014\u2013-]+/, '')
    .trim();
  // Nothing but punctuation left means the note said only what the label already says.
  if (!/[a-z0-9]/i.test(rest)) return '';
  return ` \u2014 ${rest}`;
}

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const place = useStore((s) => s.place);
  const stores = useStore((s) => s.stores);
  const locations = useStore((s) => s.locations);
  const recent = useStore((s) => s.recent);
  const directory = useStore((s) => s.directory);
  const directoryError = useStore((s) => s.directoryError);
  const [zip, setZip] = useState(settings?.zip || '');
  const [saving, setSaving] = useState(false);
  const [server, setServer] = useState(null);
  const [radiusBusy, setRadiusBusy] = useState(false);
  const [radiusChange, setRadiusChange] = useState(null);

  useEffect(() => {
    if (!locations) loadLocations();
    api('/api/state').then(setServer).catch(() => {});
  }, []);
  useEffect(() => setZip(settings?.zip || ''), [settings?.zip]);

  const saveZip = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSettings({ zip });
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  const toggleStore = async (id, on) => {
    const next = on ? [...settings.stores, id] : settings.stores.filter((s) => s !== id);
    const ordered = stores.map((s) => s.id).filter((s) => next.includes(s));
    try {
      await saveSettings({ stores: ordered }, { quiet: true });
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    }
  };

  // Stores come from what the directory actually found near this ZIP, so group them by how
  // trustworthy their prices are rather than by a fixed "core" list.
  const sorted = [...stores].sort((a, b) => basisInfo(a.basis).order - basisInfo(b.basis).order || (a.distance ?? 999) - (b.distance ?? 999));
  const priced = sorted.filter((s) => isPriceable(s.basis));
  const adsOnly = sorted.filter((s) => !isPriceable(s.basis));

  // The radius the SERVER applied to the distances, which is the only one worth showing. If the
  // directory has not loaded yet, fall back to the radius we would ask for — the control's value —
  // rather than to the raw stored number, which may not be one of the radii we offer at all.
  const radius = snapRadius(settings?.maxMiles);
  const appliedRadius = directory?.maxMiles ?? radius;

  const changeRadius = async (miles) => {
    if (miles === radius) return;
    const from = { miles: appliedRadius, priced: priced.length, adsOnly: adsOnly.length, enabled: (settings.stores || []).length };
    setRadiusBusy(true);
    setRadiusChange(null);
    try {
      await saveSettings({ maxMiles: miles }, { quiet: true });
      // Only claim a before/after when the new lookup actually landed. If it failed, the store list
      // on screen is still the old radius's, and comparing the old counts against themselves would
      // invent a result the visitor never got.
      if (getState().directory?.maxMiles !== miles) return;
      const now = getState().stores || [];
      const nowPriced = now.filter((s) => isPriceable(s.basis));
      setRadiusChange({
        from,
        to: {
          miles,
          priced: nowPriced.length,
          adsOnly: now.length - nowPriced.length,
          enabled: (getState().settings.stores || []).length,
        },
      });
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    } finally {
      setRadiusBusy(false);
    }
  };

  return html`<div>
    <div class="page-head">
      <div>
        <h1>Settings</h1>
        <p>Where you shop and how prices are counted. All of it is kept in this browser — the Cartworth server never stores anything about you.</p>
      </div>
    </div>
    <div class="settings-grid">
      <section class="card card-pad">
        <h2>Your location</h2>
        <form class="row" style=${{ gap: 8 }} onSubmit=${saveZip}>
          <input class="input" style=${{ width: 120 }} inputmode="numeric" maxlength="5" value=${zip} onInput=${(e) => setZip(e.currentTarget.value.replace(/\D/g, ''))} aria-label="ZIP code" placeholder="ZIP" />
          <button class="btn btn-primary" disabled=${saving || zip.length !== 5 || zip === settings?.zip}>${saving ? html`<${Spinner} size=${12} />` : 'Save'}</button>
          ${place && html`<span class="ink2 small">${place.city}, ${place.state}</span>`}
        </form>
        <div class="srow" style=${{ marginTop: 4 }}>
          <${Icon} name="pin" size=${16} />
          <div>
            <div style=${{ fontWeight: 600 }}>Search radius</div>
            <div class="muted small">
              How far Cartworth looks for stores, measured straight-line from your ZIP — the drive is longer, and most
              so at the edge of the radius. A wider radius finds more chains, but the extra ones are further away —
              check the distances before you switch one on.
            </div>
          </div>
          <div class="row" style=${{ gap: 6 }}>
            ${radiusBusy && html`<${Spinner} size=${12} />`}
            <select class="select select-sm" value=${radius} disabled=${radiusBusy || !settings?.zip}
              onChange=${(e) => changeRadius(+e.currentTarget.value)} aria-label="Search radius">
              ${RADIUS_MILES.map((m) => html`<option value=${m}>${m} miles</option>`)}
            </select>
          </div>
        </div>
        ${!settings?.zip
          ? html`<div class="muted small">Save a ZIP above and Cartworth will look for stores within ${radius} miles of it.</div>`
          : html`<${RadiusOutcome} change=${radiusChange} busy=${radiusBusy} wanted=${radius} applied=${appliedRadius}
              error=${directoryError} priced=${priced.length} adsOnly=${adsOnly.length} />`}
        <div class="hr"></div>
        <div class="row" style=${{ marginBottom: 6 }}>
          <b style=${{ fontSize: 14 }}>Stores Cartworth checks</b><span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" onClick=${() => { setState({ locations: null }); loadLocations(true); }}><${Icon} name="refresh" size=${13} /> Re-locate</button>
        </div>
        ${!settings.stores.length
          ? html`<div class="muted small">No stores are switched on, so there is nothing to locate. Turn one on under “Stores near you” below.</div>`
          : !locations && html`<div class="row muted small"><${Spinner} size=${12} /> Finding your nearest stores…</div>`}
        ${locations?._error && html`<${Notice} kind="bad" icon="alert">${locations._error}</${Notice}>`}
        ${locations &&
        !locations._error &&
        html`<div>
          ${settings.stores.map((id) => {
            const loc = locations[id];
            const s = storeInfo(id);
            return html`<div class="srow" key=${id} style=${{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
              <${StoreDot} id=${id} size=${10} />
              <div>
                <div style=${{ fontWeight: 600 }}>${s.name}</div>
                <div class="muted small">
                  ${!loc
                    ? s.priceSource ? '…' : 'Weekly ad only'
                    : loc.error ? html`<span style=${{ color: 'var(--bad-ink)' }}>${loc.error}</span>`
                    : loc.none ? 'No location serves this ZIP'
                    : loc.canonical ? html`<span>${loc.name} — chain-wide prices</span>`
                    : [loc.name, loc.address].filter(Boolean).join(' · ')}
                </div>
                ${loc?.priceNote && html`<div class="muted small">${loc.priceNote}</div>`}
              </div>
              <div class="muted small num" title=${loc?.distance != null ? 'Straight-line distance from your ZIP; the drive is longer' : undefined}>${loc?.distance != null ? `${loc.distance} mi` : ''}</div>
            </div>`;
          })}
        </div>`}
        <details style=${{ marginTop: 10 }}>
          <summary class="small ink2" style=${{ cursor: 'pointer' }}>Shop a different location for one chain</summary>
          <${Overrides} settings=${settings} stores=${stores} />
        </details>
      </section>

      <section class="card card-pad">
        <h2>Stores near you</h2>
        <div class="muted small" style=${{ marginBottom: 6 }}>
          ${plural(priced.length, 'store')} within ${appliedRadius} miles of ${place?.city || 'you'} publish prices we can read${adsOnly.length ? `, and ${adsOnly.length} more publish a weekly ad` : ''}.
          Every store you turn on is checked on each search. Change the radius under Your location to look further out.
        </div>
        ${[...priced, ...adsOnly].map(
          (s, i) => html`${i === priced.length && adsOnly.length > 0 && html`<div class="hero-label" style=${{ margin: '14px 0 4px' }}>Weekly ad only</div>`}
          <div class="srow" key=${s.id}>
            <${StoreDot} id=${s.id} size=${10} />
            <div>
              <div style=${{ fontWeight: 600 }}>${s.name}</div>
              <div class="muted small">
                <span title=${basisInfo(s.basis).title}>${basisInfo(s.basis).label}</span>
                ${s.hasAds && isPriceable(s.basis) ? ' + weekly ad' : ''}
                ${s.distance != null ? html` · <span title="Straight-line distance from your ZIP; the drive is longer">${s.distance} mi</span>` : ''}
                ${noteAfterLabel(s.note, basisInfo(s.basis).label)}
              </div>
            </div>
            <${Switch} checked=${s.enabled} onChange=${(on) => toggleStore(s.id, on)} label=${`Check ${s.name}`} />
          </div>`,
        )}
        ${!stores.length && html`<div class="muted small">${settings?.zip ? 'No chains near this ZIP publish prices or a weekly ad we can read.' : 'Set your ZIP above and Cartworth will find the stores around you.'}</div>`}
      </section>

      <section class="card card-pad">
        <h2>How prices are counted</h2>
        <div class="srow">
          <${Icon} name="tag" size=${16} />
          <div>
            <div style=${{ fontWeight: 600 }}>Count loyalty-card prices</div>
            <div class="muted small">Use card/member prices (e.g. Mariano’s card price) when comparing. Turn off if you don’t carry the card.</div>
          </div>
          <${Switch} checked=${settings.cardPrices} onChange=${(v) => saveSettings({ cardPrices: v }, { quiet: true })} label="Count loyalty-card prices" />
        </div>
        <div class="srow">
          <${Icon} name="star" size=${16} />
          <div>
            <div style=${{ fontWeight: 600 }}>I have Amazon Prime</div>
            <div class="muted small">Use Whole Foods’ extra Prime sale price (usually another 10% off sale items).</div>
          </div>
          <${Switch} checked=${settings.prime} onChange=${(v) => saveSettings({ prime: v }, { quiet: true })} label="I have Amazon Prime" />
        </div>
        <div class="srow">
          <${Icon} name="clock" size=${16} />
          <div>
            <div style=${{ fontWeight: 600 }}>Re-check watched items after</div>
            <div class="muted small">When you open Cartworth, anything on your watchlist older than this is re-priced. Nothing runs while the tab is closed.</div>
          </div>
          <select class="select select-sm" value=${settings.watchRefreshHours} onChange=${(e) => saveSettings({ watchRefreshHours: +e.currentTarget.value }, { quiet: true })} aria-label="Re-check interval">
            ${[4, 6, 12, 24, 48].map((h) => html`<option value=${h}>${h} hours</option>`)}
          </select>
        </div>
        <div class="srow">
          <${Icon} name="list" size=${16} />
          <div>
            <div style=${{ fontWeight: 600 }}>Results per store</div>
            <div class="muted small">More results find more sizes and brands but take longer.</div>
          </div>
          <select class="select select-sm" value=${settings.resultsPerStore} onChange=${(e) => saveSettings({ resultsPerStore: +e.currentTarget.value }, { quiet: true })} aria-label="Results per store">
            ${[20, 36, 48, 60].map((n) => html`<option value=${n}>${n}</option>`)}
          </select>
        </div>
      </section>

      <${KrogerCard} settings=${settings} />

      <${DataCard} server=${server} recentCount=${(recent || []).length} />
    </div>
    <p class="footer-note">
      Cartworth reads the same public prices each store’s website shows to any visitor, only when you search or press re-check, and caches results for 20 minutes to stay light on their sites.
      Weekly ads come from Flipp. Stores marked “shelf prices” are in-store prices; stores marked “online” come from their delivery listing, which can run higher.
    </p>
  </div>`;
}

/**
 * What the chosen radius actually bought you.
 *
 * Every number here is read back from the directory the server returned, not predicted: the radius
 * is the one the server applied, and the counts are the chains it found. A wider radius is a
 * trade, not a free win, so when it changes we say both halves of it — how many more chains turned
 * up, and that they are further away — and we say plainly when a narrower radius switched
 * something off.
 */
function RadiusOutcome({ change, busy, wanted, applied, priced, adsOnly, error }) {
  if (busy) return html`<div class="row muted small" style=${{ marginTop: 6 }}><${Spinner} size=${12} /> Looking for stores within ${wanted} miles…</div>`;
  // The radius on the control and the radius the store list was built with can come apart: the
  // lookup can fail, or simply not have run yet. Say which one the numbers belong to rather than
  // labelling last radius's stores with this radius's number.
  if (error) {
    return html`<${Notice} kind="warn" icon="alert">Could not look for stores within ${wanted} miles: ${error}.
      ${applied !== wanted ? html` The list below is still the one ${applied} miles found.` : ''}</${Notice}>`;
  }
  if (applied !== wanted) {
    return html`<div class="muted small" style=${{ marginTop: 6 }}>Showing what <b>${applied} miles</b> found — the ${wanted}-mile lookup has not landed yet.</div>`;
  }
  const found = html`<b>${plural(priced, 'chain')}</b> within ${applied} miles publish prices Cartworth can read${adsOnly ? html`, and ${adsOnly} more publish a weekly ad` : ''}.`;
  if (!change) return html`<div class="muted small" style=${{ marginTop: 6 }}>${found}</div>`;

  // Compare the chains that can be PRICED, which is the number the sentence above just quoted and
  // the only one the radius really moves. The ad-only count is driven by which circulars cover this
  // postal code, so the two totals can be identical at both radii while the half that matters has
  // halved — saying "same as before" there would be flatly untrue.
  const turnedOff = Math.max(0, change.from.enabled - change.to.enabled);
  const delta = change.to.priced - change.from.priced;
  return html`<div class="muted small" style=${{ marginTop: 6 }}>
    ${found}
    ${' '}
    ${delta > 0
      ? html`That is <b>${plural(delta, 'chain')}</b> more than at ${change.from.miles} miles — the extra ones are further from you, and none of them are switched on yet.`
      : delta < 0
      ? html`<b>${plural(-delta, 'chain')}</b> that ${change.from.miles} miles could price ${-delta === 1 ? 'is' : 'are'} now too far away.`
      : html`The same number ${change.from.miles} miles found — no chain sits between the two.`}
    ${turnedOff > 0 && html` ${plural(turnedOff, 'store')} you had switched on ${turnedOff === 1 ? 'is' : 'are'} outside ${change.to.miles} miles, so ${turnedOff === 1 ? 'it has' : 'they have'} been switched off.`}
  </div>`;
}

function Overrides({ settings, stores }) {
  const [vals, setVals] = useState({ ...Object.fromEntries(Object.entries(settings.overrides || {}).map(([k, v]) => [k, v.zip])) });
  const save = async () => {
    const overrides = Object.fromEntries(Object.entries(vals).filter(([, z]) => /^\d{5}$/.test(z || '')).map(([k, z]) => [k, { zip: z }]));
    try {
      await saveSettings({ overrides });
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    }
  };
  return html`<div class="stack" style=${{ gap: 6, marginTop: 8 }}>
    <div class="muted small">Enter a different ZIP for any chain (e.g. the Woodman’s near work). Leave blank to use your main ZIP.</div>
    ${stores.filter((s) => s.enabled && s.priceSource).map(
      (s) => html`<div class="row" key=${s.id} style=${{ gap: 8 }}>
        <span class="row grow small" style=${{ gap: 6 }}><${StoreDot} id=${s.id} />${s.name}</span>
        <input class="input input-sm" style=${{ width: 90 }} inputmode="numeric" maxlength="5" placeholder=${settings.zip} value=${vals[s.id] || ''} onInput=${(e) => setVals({ ...vals, [s.id]: e.currentTarget.value.replace(/\D/g, '') })} aria-label=${`ZIP for ${s.name}`} />
      </div>`,
    )}
    <div><button class="btn btn-sm" onClick=${save}>Save locations</button></div>
  </div>`;
}

function KrogerCard({ settings }) {
  const [id, setId] = useState(settings.kroger?.clientId || '');
  const [secret, setSecret] = useState(settings.kroger?.clientSecret || '');
  const [state, setStateK] = useState(null);
  const configured = hasKrogerKeys();
  const test = async () => {
    setStateK({ busy: true });
    try {
      // The keys go in headers, not the URL: a client secret must not land in a server log.
      const r = await api('/api/kroger/test', {
        method: 'POST',
        headers: { 'x-kroger-client-id': id, 'x-kroger-client-secret': secret },
        body: { zip: settings.zip },
      });
      setStateK({ ok: true, store: r.store });
    } catch (err) {
      setStateK({ error: err.message });
    }
  };
  const save = async () => {
    try {
      await saveSettings({ kroger: { clientId: id, clientSecret: secret } });
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    }
  };
  const clear = async () => {
    setId('');
    setSecret('');
    setStateK(null);
    await saveSettings({ kroger: { clientId: '', clientSecret: '' } });
  };
  return html`<section class="card card-pad">
    <h2>Mariano’s exact prices <span class="badge ${configured ? 'badge-good' : ''}" style=${{ marginLeft: 6 }}>${configured ? 'Connected' : 'Optional'}</span></h2>
    <div class="ink2 small">Mariano’s is a Kroger store. Kroger offers a free official API with exact shelf and card prices for your store. Without it, Cartworth uses Mariano’s Instacart prices (which can run higher).</div>
    <ol class="steps">
      <li>Create a free account at <a href="https://developer.kroger.com" target="_blank" rel="noopener noreferrer">developer.kroger.com</a>.</li>
      <li>Create an application (Environment: <b>Production</b>, scope: <b>product.compact</b>).</li>
      <li>Paste its Client ID and Client Secret below, then Test.</li>
    </ol>
    <div class="stack" style=${{ gap: 8 }}>
      <label class="field">Client ID<input class="input input-sm" value=${id} onInput=${(e) => setId(e.currentTarget.value.trim())} autocomplete="off" spellcheck="false" /></label>
      <label class="field">Client secret<input class="input input-sm" type="password" value=${secret} onInput=${(e) => setSecret(e.currentTarget.value.trim())} autocomplete="off" /></label>
      <div class="row wrap" style=${{ gap: 8 }}>
        <button class="btn btn-sm" onClick=${test} disabled=${!id || !secret || !settings.zip || state?.busy}>${state?.busy ? html`<${Spinner} size=${12} />` : 'Test'}</button>
        <button class="btn btn-sm btn-primary" onClick=${save} disabled=${!id || !secret}>Save</button>
        ${configured && html`<button class="btn btn-sm btn-ghost btn-danger" onClick=${clear}>Remove keys</button>`}
      </div>
      ${state?.ok && html`<${Notice} kind="good" icon="check">Keys work.${state.store ? ` Nearest Mariano’s: ${state.store.name}, ${state.store.address} (${state.store.distance} mi).` : ' No Mariano’s found near your ZIP.'}</${Notice}>`}
      ${state?.error && html`<${Notice} kind="bad" icon="alert">${state.error}</${Notice}>`}
      <div class="muted small">
        These are your keys. They are saved in this browser, sent with the searches that need them, and never stored on the Cartworth server.
        Anything saved in a browser can be read by anything else with access to this profile, so use a key you are willing to keep here, and remove it when you are done.
      </div>
    </div>
  </section>`;
}

function DataCard({ server, recentCount }) {
  const list = useStore((s) => s.list) || [];
  const watches = useStore((s) => s.watches) || [];
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    const merge = confirm('OK: merge this file into what is already here.\nCancel: replace everything with the file.');
    setBusy(true);
    try {
      const r = await importMyData(file, { merge });
      toast(`Imported ${plural(r.list, 'list item')} and ${plural(r.watches, 'watched item')}`);
    } catch (err) {
      toast(err.message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const wipe = () => {
    if (!confirm('Delete everything Cartworth has saved in this browser — ZIP, stores, list, watchlist and history? This cannot be undone.')) return;
    forgetEverything();
    toast('Cleared. Cartworth will start over.');
    location.hash = '#/compare';
    location.reload();
  };

  return html`<section class="card card-pad">
    <h2>Your data</h2>
    <div class="ink2 small" style=${{ marginBottom: 8 }}>
      Your ZIP, stores, preferences, shopping list, watchlist and recent searches are stored in this browser only.
      They are not on the server, so they do not follow you to another device — and clearing your browser data deletes them.
      Export a copy to move or back them up.
    </div>
    <div class="ink2 small" style=${{ marginBottom: 10 }}>
      Right now: ${plural(list.length, 'list item')} · ${plural(watches.length, 'watched item')} · ${plural(recentCount, 'recent search', 'recent searches')}.
    </div>
    ${!storageHealthy() && html`<${Notice} kind="warn" icon="alert">This browser is not letting Cartworth save anything, so changes will be lost when you close the tab.</${Notice}>`}
    <div class="row wrap" style=${{ gap: 8 }}>
      <button class="btn btn-sm" onClick=${() => exportMyData()}><${Icon} name="download" size=${14} /> Export my data</button>
      <button class="btn btn-sm" onClick=${() => fileRef.current?.click()} disabled=${busy}>${busy ? html`<${Spinner} size=${12} />` : html`<${Icon} name="plus" size=${14} />`} Import</button>
      <input ref=${fileRef} type="file" accept="application/json,.json" style=${{ display: 'none' }} onChange=${onFile} />
      <button class="btn btn-sm" onClick=${() => { forgetSearches(); toast('Search history cleared'); }}>Clear search history</button>
      <button class="btn btn-sm btn-ghost btn-danger" onClick=${wipe}>Delete everything</button>
    </div>

    <div class="hr"></div>
    <h2 style=${{ fontSize: 15 }}>Server</h2>
    <div class="ink2 small" style=${{ marginBottom: 8 }}>
      The Cartworth server only fetches prices and keeps a shared, anonymous record of what products have cost.
      ${Number.isFinite(server?.counts?.products) && Number.isFinite(server?.counts?.observations) && html` It is tracking ${plural(server.counts.products, 'product')} with ${plural(server.counts.observations, 'price observation')} — by product, not by person.`}
    </div>
    ${server?.health &&
    html`<table class="wtable">
      <tbody>
        ${Object.entries(server.health).map(
          ([id, h]) => html`<tr key=${id}>
            <td><span class="row" style=${{ gap: 6 }}><${StoreDot} id=${id} />${storeInfo(id).short}</span></td>
            <td>${h.ok ? html`<span class="badge badge-good">OK</span>` : html`<span class="badge badge-bad" title=${h.error}>Error</span>`} <span class="muted small">${ago(h.at)}</span></td>
            <td class="r muted small">${h.ms != null ? `${(h.ms / 1000).toFixed(1)}s` : ''}</td>
          </tr>`,
        )}
        ${Object.keys(server.health).length === 0 && html`<tr><td class="muted small">No searches yet on this server.</td></tr>`}
      </tbody>
    </table>`}
  </section>`;
}
