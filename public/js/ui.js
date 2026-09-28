// Shared UI components.
import { h } from '/vendor/preact.mjs';
import { useEffect, useRef, useState } from '/vendor/preact-hooks.mjs';
import htm from '/vendor/htm.mjs';
import { Icon } from './icons.js';
import { getState, useStore, dismissToast, closeModal } from './store.js';
import { STORE_BY_ID } from '/shared/stores.js';

export const html = htm.bind(h);

export function storeInfo(id) {
  const s = getState().stores.find((x) => x.id === id) || STORE_BY_ID[id] || { id, name: id, short: id, slot: 0 };
  return s;
}

export function storeColor(id) {
  const slot = storeInfo(id).slot || 0;
  return `var(--store-${slot})`;
}

export function StoreDot({ id, size = 9 }) {
  return html`<span class="store-dot" style=${{ background: storeColor(id), width: size, height: size }} aria-hidden="true"></span>`;
}

export function StoreTag({ id, short = true, children }) {
  const s = storeInfo(id);
  return html`<span class="store-tag"><${StoreDot} id=${id} />${short ? s.short || s.name : s.name}${children}</span>`;
}

export function Spinner({ size = 14 }) {
  return html`<span class="spinner" style=${{ width: size, height: size }} role="status" aria-label="Loading"></span>`;
}

export function Notice({ kind = 'info', icon = 'info', children }) {
  return html`<div class=${`notice ${kind === 'info' ? '' : kind}`}><${Icon} name=${icon} size=${16} /><div>${children}</div></div>`;
}

export function Empty({ icon = 'search', title, children }) {
  return html`<div class="empty">
    <div style=${{ color: 'var(--muted)' }}><${Icon} name=${icon} size=${28} /></div>
    ${title && html`<h2 class="empty-title">${title}</h2>`}
    <p>${children}</p>
  </div>`;
}

export function Switch({ checked, onChange, label, disabled }) {
  return html`<label class="switch" title=${label}>
    <input type="checkbox" checked=${checked} disabled=${disabled} aria-label=${label} onChange=${(e) => onChange(e.currentTarget.checked)} />
    <span></span>
  </label>`;
}

export function Chip({ pressed, onClick, children, count, neg, soft, title }) {
  return html`<button type="button" class=${`chip${neg ? ' neg' : ''}${soft ? ' soft' : ''}`} aria-pressed=${pressed ? 'true' : 'false'} onClick=${onClick} title=${title}>
    ${children}${count != null && html`<span class="n">${count}</span>`}
  </button>`;
}

export function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="group" aria-label=${label}>
    ${options.map(
      (o) => html`<button type="button" aria-pressed=${value === o.value ? 'true' : 'false'} onClick=${() => onChange(o.value)} title=${o.title}>${o.label}</button>`,
    )}
  </div>`;
}

export function ProductImage({ src, alt = '', cls = 'pimg', size }) {
  const [broken, setBroken] = useState(false);
  const style = size ? { width: size, height: size } : undefined;
  if (!src || broken) return html`<div class=${`${cls} ph`} style=${style} aria-hidden="true"><${Icon} name="image" size=${18} /></div>`;
  return html`<img class=${cls} style=${style} src=${src} alt=${alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError=${() => setBroken(true)} />`;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  if (!toasts.length) return null;
  return html`<div class="toasts" role="status" aria-live="polite">
    ${toasts.map(
      (t) => html`<div class=${`toast ${t.kind === 'bad' ? 'bad' : ''}`} key=${t.id}>
        <span>${t.message}</span>
        ${t.action && html`<button onClick=${() => { t.action.run(); dismissToast(t.id); }}>${t.action.label}</button>`}
      </div>`,
    )}
  </div>`;
}

const TABBABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/** The dialog's own focusable controls, in document order, skipping anything hidden. */
function tabbableIn(root) {
  if (!root) return [];
  return [...root.querySelectorAll(TABBABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function Modal({ title, sub, onClose = closeModal, children, wide }) {
  const ref = useRef();
  useEffect(() => {
    // Escape closes, and Tab stays inside.
    //
    // Without the Tab half, aria-modal="true" was a claim the page did not honour: 360 tabbable
    // elements sat behind the dialog and every one of them was still reachable, so Shift+Tab from
    // Close landed on a store chip in the list underneath and Tab off the last button left the
    // dialog entirely. Marking the rest of the page `inert` is the other half — it takes the page
    // behind out of the tab order AND out of the accessibility tree, so a screen-reader user
    // browsing by element cannot walk into it either.
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const items = tabbableIn(ref.current);
      if (!items.length) {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!ref.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    ref.current?.focus();
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Everything that is a sibling of the backdrop is "the page behind". The toast container is
    // the exception: it is the app's only live region, and inert would take it out of the
    // accessibility tree along with everything else, silencing "Added to your list" for exactly
    // the users who most need to hear it.
    const backdrop = ref.current?.parentElement;
    const inerted = [];
    for (const el of [...(backdrop?.parentElement?.children || [])]) {
      if (el === backdrop || el.inert || el.classList?.contains('toasts')) continue;
      el.inert = true;
      inerted.push(el);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = bodyOverflow;
      for (const el of inerted) el.inert = false;
      prev?.focus?.();
    };
  }, []);
  return html`<div class="backdrop" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${ref} style=${wide ? { width: 'min(920px, 100%)' } : undefined}>
      <div class="modal-head">
        <div class="grow">
          <h2>${title}</h2>
          ${sub && html`<div class="muted small" style=${{ marginTop: 3 }}>${sub}</div>`}
        </div>
        <button class="btn btn-ghost btn-icon" onClick=${onClose} aria-label="Close"><${Icon} name="x" size=${18} /></button>
      </div>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function ModalHost() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  return modal;
}

/** Debounced value hook */
export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Re-render every `ms` (for "3 min ago" labels) */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
