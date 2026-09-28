// First run: ask for a ZIP, then show the stores Cartworth actually found near it.
// The store list is discovered per ZIP, so this works anywhere in the US, not just one metro.
import { useState, useEffect } from '/vendor/preact-hooks.mjs';
import { html, Spinner, Notice, StoreDot, storeInfo } from '../ui.js';
import { Icon } from '../icons.js';
import { useStore, setState, getState } from '../store.js';
import { saveSettings, loadDirectory, go } from '../actions.js';
import { basisInfo, isPriceable } from '../format.js';

export function Onboarding() {
  const [widening, setWidening] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const stores = useStore((s) => s.stores);
  const settings = useStore((s) => s.settings);
  const directory = useStore((s) => s.directory);
  const directoryError = useStore((s) => s.directoryError);
  const directoryLoading = useStore((s) => s.directoryLoading);
  const place = useStore((s) => s.place);
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(settings?.zip ? 2 : 1);

  useEffect(() => {
    if (step === 2 && !directory && !directoryLoading && !directoryError) loadDirectory();
  }, [step, directory, directoryLoading, directoryError]);

  // Straight to the store step. The first look at a new ZIP asks each chain one at a time and takes
  // up to a minute; waiting for it here left a first-time visitor on a silent spinner on the ZIP
  // form for all of it (the launch review's live journey).
  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setStep(2);
    saveSettings({ zip }, { quiet: true })
      .catch((e2) => {
        setErr(e2.message);
        setStep(1);
      })
      .finally(() => setBusy(false));
  };

  if (step === 1)
    return html`<div class="card onboard">
      <div class="brand"><span class="brand-mark"><${Icon} name="basket" size=${17} /></span> Cartworth</div>
      <h1>Find the best grocery prices near you</h1>
      <div class="ink2">
        Type in a food item and Cartworth prices it at every grocery store around you — at once, live, and converted to
        the same unit so a 64 oz jug and a gallon compare honestly. Plus every weekly-ad deal in your area.
      </div>
      <form class="row" style=${{ gap: 8 }} onSubmit=${submit}>
        <input class="input" style=${{ width: 140, height: 44, fontSize: 18 }} inputmode="numeric" maxlength="5"
          placeholder="Your ZIP" value=${zip}
          onInput=${(e) => setZip(e.currentTarget.value.replace(/\D/g, ''))} aria-label="Your ZIP code" autofocus />
        <button class="btn btn-primary" style=${{ height: 44 }} disabled=${zip.length !== 5 || busy}>
          ${busy ? html`<${Spinner} size=${14} />` : 'Find my stores'}
        </button>
      </form>
      ${err && html`<${Notice} kind="bad" icon="alert">${err}</${Notice}>`}
      <div class="muted small">Works anywhere in the US. Your ZIP is only used to find the nearest store of each chain, and it is saved in this browser — not on the server.</div>
    </div>`;

  const loading = !directory && !directoryError;
  // 'national' counts: the price is real, it just belongs to the chain rather than to a store near
  // you. In rural ZIPs it is often the only source there is, so dropping it would make Cartworth
  // claim it found nothing when it found four.
  const priced = (stores || []).filter((s) => isPriceable(s.basis));
  const adsOnly = (stores || []).filter((s) => s.basis === 'adsOnly');
  // A chain-wide listing has no store and no distance, so it is not one of the stores "within N
  // miles" (the rule directory.js countsFor states). In rural ZIPs of the nationwide sweep it was
  // often the only price source, and the sentence counted Walmart as a store found within 25 miles.
  const national = priced.filter((s) => s.basis === 'national');
  const local = priced.filter((s) => s.basis !== 'national');
  // The nationwide sweep: in remote rural ZIPs nothing priceable is within 25 miles, but often is
  // within 40. Offer the wider radius in one tap instead of only "try another ZIP".
  const WIDEST = 40;
  const canWiden = !!directory && local.length === 0 && directory.maxMiles < WIDEST;
  const widen = async () => {
    setWidening(true);
    try {
      await saveSettings({ maxMiles: WIDEST }, { quiet: true });
      // Widening never switches stores on by itself (actions.js); here the visitor asked for it.
      const dir = getState().directory;
      if (dir?.suggested?.length) await saveSettings({ stores: dir.suggested }, { quiet: true });
    } finally {
      setWidening(false);
    }
  };
  const enabled = (stores || []).filter((s) => s.enabled);
  // Chains whose lookup failed (a timeout, a busy site). Not "no store here": the list may be short,
  // and the server keeps such a build only ten minutes (src/directory.js UNRESOLVED_RETRY_MS). The
  // four-city audit on 24 Sep saw 14 of 17 chains time out in Charlotte; rebuilt, it found 13 stores.
  const pending = directory?.unresolved || [];
  const recheck = async () => {
    setRechecking(true);
    try {
      const before = new Set(getState().settings?.stores || []);
      const waiting = new Set(getState().directory?.unresolved || []);
      const dir = await loadDirectory(true);
      // Switch on only what the re-check FOUND (a chain that had not answered): one the shopper
      // switched off stays off, and every store already on stays on.
      const add = (dir?.suggested || []).filter((id) => waiting.has(id) && !before.has(id));
      if (add.length) await saveSettings({ stores: [...before, ...add] }, { quiet: true });
    } finally {
      setRechecking(false);
    }
  };

  return html`<div class="card onboard">
    <h1>Stores near ${place?.city || `ZIP ${settings?.zip}`}</h1>
    ${!directory && directoryError
      ? html`<${Notice} kind="bad" icon="alert">
          ${/not found/i.test(directoryError)
            ? `There’s no US ZIP code ${settings?.zip || ''}. Check the number and try again.`
            : `Cartworth couldn’t look up the stores near ${settings?.zip || 'this ZIP'} just now. Try again in a moment.`}
          <div class="row" style=${{ gap: 8, marginTop: 8 }}>
            ${!/not found/i.test(directoryError) && html`<button class="btn btn-sm" onClick=${() => loadDirectory(true)} disabled=${directoryLoading}>${directoryLoading ? 'Trying…' : 'Try again'}</button>`}
            <button class="btn btn-sm" onClick=${() => { setStep(1); setZip(settings?.zip || ''); }}>Change ZIP</button>
          </div>
        </${Notice}>`
      : loading
      ? html`<div role="status">
          <div class="row muted"><${Spinner} /> Checking which chains serve your ZIP…</div>
          <div class="muted small" style=${{ marginTop: 6 }}>The first look at a ZIP takes up to a minute: Cartworth asks each store near you, one at a time, so no store is flooded. After that it’s instant.</div>
        </div>`
      : html`<div class="ink2">
          Cartworth found <b>${local.length}</b> ${local.length === 1 ? 'store' : 'stores'} it can price
          ${adsOnly.length ? html` and <b>${adsOnly.length}</b> more with a weekly ad` : ''} within ${directory.maxMiles} miles${national.length
            ? html`, plus chain-wide prices from ${national.map((s) => s.short || s.name).join(', ')}`
            : ''}.
          The ${enabled.length} below are switched on — change them any time in Settings.
        </div>`}

    ${!loading && pending.length > 0 &&
      html`<${Notice} kind="warn" icon="alert">
        ${pending.length} more ${pending.length === 1 ? 'store' : 'stores'} didn’t answer in time, so this list may be short.
        <div style=${{ marginTop: 8 }}>
          <button class="btn btn-sm" onClick=${recheck} disabled=${rechecking}>${rechecking ? 'Checking…' : 'Check again'}</button>
        </div>
      </${Notice}>`}

    ${!loading && !priced.length && !canWiden &&
      html`<${Notice} kind="warn" icon="alert">
        No store near this ZIP publishes prices we can read. You can still browse the weekly ads, or try a nearby ZIP with a larger town.
      </${Notice}>`}

    ${!loading && canWiden &&
      html`<${Notice} kind="warn" icon="alert">
        No store within ${directory.maxMiles} miles publishes prices we can read${national.length ? ' (the prices above are chain-wide)' : ''}. In rural areas the nearest one is often a little further.
        <div style=${{ marginTop: 8 }}>
          <button class="btn btn-sm" onClick=${widen} disabled=${widening}>${widening ? 'Looking…' : `Look within ${WIDEST} miles`}</button>
        </div>
      </${Notice}>`}

    ${!loading && html`<div>
      ${enabled.map((s) => {
        const b = basisInfo(s.basis);
        return html`<div class="srow" key=${s.id} style=${{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
          <${StoreDot} id=${s.id} size=${10} />
          <div>
            <div style=${{ fontWeight: 600 }}>${s.name}</div>
            <div class="muted small">
              <span class=${`badge ${b.kind || ''}`} title=${b.title}>${b.short}</span>
              ${s.address ? html` · ${s.address}` : ''}
            </div>
          </div>
          <div class="muted small" title=${s.distance != null ? 'Straight-line distance from your ZIP; the drive is longer' : undefined}>${s.distance != null ? `${s.distance} mi` : ''}</div>
        </div>`;
      })}
    </div>`}

    ${!loading && priced.length > 0 && priced.every((s) => s.basis === 'national') &&
      html`<div class="muted small">
        No chain here publishes a price for a store near you, so these are chain-wide prices. They are real, but your local shelf price may differ.
      </div>`}

    ${!loading && adsOnly.length > 0 &&
      html`<div class="muted small">
        Weekly ad only: ${adsOnly.map((s) => s.short).join(', ')}. These stores don’t publish prices we can read, so we show their circular instead of guessing.
      </div>`}

    ${!loading && directory?.otherMerchants?.length > 0 &&
      html`<div class="muted small">
        Also advertising in your area, but not yet supported: ${directory.otherMerchants.slice(0, 10).join(', ')}${directory.otherMerchants.length > 10 ? `, +${directory.otherMerchants.length - 10} more` : ''}.
      </div>`}

    <div class="row" style=${{ gap: 8 }}>
      <button class="btn btn-primary" onClick=${() => { setState({ onboarding: false }); go('compare'); }}>
        <${Icon} name="search" size=${15} /> Start comparing
      </button>
      <button class="btn" onClick=${() => { setStep(1); setZip(settings?.zip || ''); }}>Change ZIP</button>
    </div>
  </div>`;
}
