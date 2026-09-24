// Cartworth app shell.
import { render } from '/vendor/preact.mjs';
import { useEffect, useState } from '/vendor/preact-hooks.mjs';
import { html, Toasts, ModalHost, Notice, Spinner } from './ui.js';
import { Icon } from './icons.js';
import { useStore, setState, getState, pref, setPref } from './store.js';
import { boot, loadLocations, loadDirectory, parseRoute, runSearch, go, refreshStaleWatches } from './actions.js';
import { CompareView } from './views/compare.js';
import { SalesView } from './views/sales.js';
import { WatchView } from './views/watch.js';
import { ListView } from './views/list.js';
import { SettingsView } from './views/settings.js';
import { Onboarding } from './views/onboarding.js';

const TABS = [
  { name: 'compare', label: 'Compare', icon: 'search' },
  { name: 'sales', label: 'Sales', icon: 'tag' },
  { name: 'watch', label: 'Watchlist', icon: 'star' },
  { name: 'list', label: 'List', icon: 'list' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

function ThemeToggle() {
  // Light by default (see theme-boot.js); dark and 'auto' (follow the device) on request.
  const [theme, setTheme] = useState(pref('theme', 'light'));
  const next = { light: 'dark', dark: 'auto', auto: 'light' }[theme];
  const apply = (t) => {
    setTheme(t);
    setPref('theme', t);
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  const icon = theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor';
  return html`<button class="btn btn-ghost btn-icon btn-sm" onClick=${() => apply(next)} title=${`Theme: ${theme} (click for ${next})`} aria-label=${`Theme: ${theme}`}><${Icon} name=${icon} size=${16} /></button>`;
}

function Header({ route }) {
  const place = useStore((s) => s.place);
  const settings = useStore((s) => s.settings);
  const list = useStore((s) => s.list);
  const watches = useStore((s) => s.watches);
  const search = useStore((s) => s.search);
  const openCount = (list || []).filter((i) => !i.done).length;
  const alerts = (watches || []).filter((w) => w.alert).length;
  // The brand link carries an explicit aria-label: its only text node lives in .hide-sm, which
  // app.css sets to display:none at <=640px, and the basket icon beside it is aria-hidden. On a
  // phone that left the link with no accessible name at all — announced as bare "link", and
  // unreachable by voice control (SC 2.4.4 and 4.1.2, both Level A).
  return html`<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" aria-label="Cartworth home" href=${search?.q ? `#/compare?q=${encodeURIComponent(search.q)}` : '#/compare'}><span class="brand-mark"><${Icon} name="basket" size=${17} /></span><span class="hide-sm">Cartworth</span></a>
      <nav class="tabs" aria-label="Sections">
        ${TABS.map(
          (t) => html`<a class="tab" key=${t.name} href=${t.name === 'compare' && search?.q ? `#/compare?q=${encodeURIComponent(search.q)}` : `#/${t.name}`} aria-current=${route.name === t.name ? 'page' : undefined}>
            <${Icon} name=${t.icon} size=${15} />${t.label}
            ${t.name === 'list' && openCount > 0 && html`<span class="count" style=${{ background: 'var(--surface-3)', color: 'var(--ink)' }}>${openCount}</span>`}
            ${t.name === 'watch' && alerts > 0 && html`<span class="count" title="Items at or below your target">${alerts}</span>`}
          </a>`,
        )}
      </nav>
      <div class="top-actions">
        ${settings?.zip && html`<button class="zip-pill" onClick=${() => go('settings')} title="Change location"><${Icon} name="pin" size=${13} />${place ? `${place.city} ${settings.zip}` : settings.zip}</button>`}
        <${ThemeToggle} />
      </div>
    </div>
  </header>`;
}

function App() {
  const ready = useStore((s) => s.ready);
  const settings = useStore((s) => s.settings);
  const onboarding = useStore((s) => s.onboarding);
  const route = useStore((s) => s.route);
  const bootError = useStore((s) => s.bootError);

  useEffect(() => {
    const onHash = () => {
      const r = parseRoute();
      setState({ route: r });
      if (r.name === 'compare' && r.params.q) {
        const cur = getState().search;
        if (!cur || cur.q.toLowerCase() !== r.params.q.toLowerCase()) runSearch(r.params.q);
      }
      setDocumentTitle(r);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    (async () => {
      try {
        const own = await boot();
        if (!own.settings.zip) setState({ onboarding: true });
        else {
          loadDirectory();
          loadLocations();
          // No background timer exists on the web, so stale watches are re-checked here, on load.
          refreshStaleWatches().catch(() => {});
        }
        onHash();
      } catch (err) {
        setState({ bootError: err.message });
      }
    })();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (bootError)
    return html`<main><div class="onboard card"><${Notice} kind="bad" icon="alert">${bootError}</${Notice}><button class="btn" onClick=${() => location.reload()}>Reload</button></div></main>`;
  if (!ready) return html`<div class="boot"><${Spinner} /> Loading Cartworth…</div>`;
  if (!settings?.zip || onboarding) {
    return html`<main><${StorageBanner} /><${OnboardingGate} /></main><${Toasts} />`;
  }
  const View = { compare: CompareView, sales: SalesView, watch: WatchView, list: ListView, settings: SettingsView }[route.name] || CompareView;
  return html`<${Header} route=${route} />
    <main><${StorageBanner} /><${View} /></main>
    <${Toasts} />
    <${ModalHost} />`;
}

/**
 * SC 2.4.2 Page Titled is read per VIEW in a single-page app, and the title never moved: it read
 * "Cartworth — grocery price checker" on every route and after every search, so a tab strip, a
 * bookmark and a screen reader's page announcement all said the same thing wherever you were.
 */
function setDocumentTitle(route) {
  const label = TABS.find((t) => t.name === route.name)?.label || 'Compare';
  const q = route.name === 'compare' ? route.params?.q : null;
  document.title = `${q ? q : label} — Cartworth`;
}

/** Said once, plainly: this browser will not keep anything, so nothing here will survive a reload. */
function StorageBanner() {
  const warning = useStore((s) => s.storageWarning);
  if (!warning) return null;
  return html`<div style=${{ marginBottom: 14 }}><${Notice} kind="warn" icon="alert">${warning}</${Notice}></div>`;
}

function OnboardingGate() {
  useEffect(() => {
    const onHash = () => {
      if (getState().settings?.zip) setState({ onboarding: false });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return html`<${Onboarding} />`;
}

render(html`<${App} />`, document.getElementById('app'));
