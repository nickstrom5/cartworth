// Formatting helpers.
import { DISPLAY_UNITS } from '/shared/units.js';
import { calendarDaysUntil } from '/shared/deals.js';

export function money(n, { cents = true } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (!cents && Number.isInteger(n)) return `$${n}`;
  if (n > 0 && n < 1 && cents) return `${Math.round(n * 100)}¢`;
  return `$${n.toFixed(2)}`;
}

export function money2(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}

/** Unit price like "$2.49/gal" or "$0.031/fl oz" (extra precision for tiny values). */
export function unitPrice(perBase, displayUnit) {
  const d = DISPLAY_UNITS[displayUnit];
  if (perBase == null || !d) return null;
  const v = perBase * d.factor;
  let s;
  // Dollars from $1.00 only. The cut was 0.995, so 99.5¢ (a $1.99 two-pound bag, a common shape)
  // printed "$0.99": toFixed(2) of 0.995 is "0.99", half a cent under the real price, beside a
  // true 99¢ printed "99¢". Under a dollar the tenth of a cent is exact; 99.95¢ and up is $1.00.
  if (v >= 100) s = `$${v.toFixed(0)}`;
  else if (v >= 0.9995) s = `$${v.toFixed(2)}`;
  else if (v >= 0.1) s = `${(v * 100).toFixed(1).replace(/\.0$/, '')}¢`;
  else s = `${(v * 100).toFixed(2)}¢`;
  return { value: v, text: s, unit: d.label };
}

/**
 * The resolution of unitPrice()'s text at display value `v` — what one step of its last printed
 * digit is worth — so a chart can put gridlines only where a unit-price label is exact (see
 * niceDomain in charts.js). Must mirror the branches of unitPrice above.
 */
export function unitPriceStep(v) {
  if (v >= 100) return 1;
  if (v >= 0.9995) return 0.01;
  if (v >= 0.1) return 0.001;
  return 0.0001;
}

export function unitLabel(displayUnit) {
  return DISPLAY_UNITS[displayUnit]?.label || displayUnit;
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;
export function ago(t) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return rtf ? rtf.format(-m, 'minute') : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return rtf ? rtf.format(-h, 'hour') : `${h}h ago`;
  const d = Math.round(h / 24);
  return rtf ? rtf.format(-d, 'day') : `${d}d ago`;
}

export function shortDate(t) {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function weekday(t) {
  if (!t) return '';
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
}

export function dateRange(a, b) {
  if (!a && !b) return '';
  return `${shortDate(a)} – ${shortDate(b)}`;
}

export function endsLabel(validTo) {
  if (!validTo) return null;
  const to = Date.parse(validTo);
  if (Number.isNaN(to)) return null;
  const now = Date.now();
  if (to < now) return 'Ended';
  const days = calendarDaysUntil(to, now);
  if (days === 0) return 'Ends today';
  if (days === 1) return 'Ends tomorrow';
  if (days < 7) return `Ends ${weekday(to)}`;
  return `Thru ${shortDate(to)}`;
}

/**
 * A promo badge's text, shortened only where that cannot change a price: a promo that names one
 * ("Mix & match 5 for $12.50") is never cut (it was cut to "Mix & match 5 for $1…"); any other is
 * cut at a word boundary. The full text stays in the badge's title.
 */
export function shortPromo(text, max = 28) {
  const t = String(text || '').trim();
  if (t.length <= max || /[$¢]|\d\s*(?:for|\/)/i.test(t)) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:&–-]+$/, '')}…`;
}

export function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}

export function pct(n) {
  return n == null ? '' : `${Math.round(n)}%`;
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// How a price should be described to the user. Anything that isn't a true shelf price must say so,
// and must say where it came from.
//
// Every non-shelf price in this app comes from Instacart: `online` is a chain's Instacart listing
// for the location nearest you, and `national` is Instacart's chain-wide storefront for a chain
// with no location near you (src/adapters/instacart.js sets both). These strings used to say only
// "online/delivery listing" — true, but it hid the platform, so the product understated its own
// provenance next to a marketing site that names Instacart outright. A shopper deciding whether to
// trust a number is owed the name of the place it came from.
export const BASIS_LABEL = { shelf: 'shelf price', online: 'online (Instacart) price', national: 'national price' };
export const BASIS_TITLE = {
  shelf: 'The store\u2019s own in-store (shelf) price for its location nearest you.',
  online: 'From the store\u2019s Instacart listing for its location nearest you. Instacart prices can run higher than the shelf price in the store.',
  national: 'From Instacart\u2019s chain-wide listing, not a store near you. The shelf price at your local store may differ.',
};
// The badge on a result row, where space is tightest. It used to read "online", which says what
// the price is not (the shelf) without saying what it is. On a phone the title never shows, so the
// row itself has to carry the provenance: a shopper who sees Jewel-Osco's butter at $7.99 here and
// cheaper in Jewel's own app should be able to tell, from the row alone, that $7.99 is Jewel's
// price on Instacart.
// Every price says where it came from, the shelf included (the owner's rule; the launch review found
// shelf prices were the one kind left unlabelled, on the headline too).
export const BASIS_BADGE = { shelf: 'shelf', online: 'Instacart', national: 'national' };

/**
 * The same provenance as a visible sentence, for the product sheet — the one place with room to
 * say it in full, and the place a shopper lands when a number looks off. `priceNote` is Instacart's
 * own disclosure for that storefront (its priceTransparencyTextString, e.g. "Prices vary from
 * in-store" at Jewel-Osco, "No markups" at Tony's), quoted rather than paraphrased so the claim is
 * the source's, not ours. Null for a shelf price, which needs no caveat.
 */
export function provenanceNote(basis, storeName, priceNote) {
  const quoted = priceNote ? ` Instacart\u2019s note for that store: \u201c${String(priceNote).replace(/\.$/, '')}.\u201d` : '';
  if (basis === 'online')
    return `${storeName}\u2019s price on Instacart, for its location nearest you.${quoted} Instacart prices can run higher than the shelf price in the store or in ${storeName}\u2019s own app. Weekly-ad and digital-coupon prices from the circular are shown in the ads section and on the Sales tab.`;
  if (basis === 'national')
    return `Instacart\u2019s chain-wide price for ${storeName}: there is no ${storeName} near you on Instacart, so this is another location\u2019s listing. Treat it as a guide \u2014 the shelf price at your local ${storeName} may differ either way.`;
  return null;
}

/**
 * How a whole store's prices reach you: the four values src/directory.js can report, in one place
 * so onboarding, settings and anything else describe them identically. `national` is easy to
 * forget and matters most where it hurts: in rural ZIPs it is often the only priceable source
 * there is, so leaving it out makes the app claim it found nothing.
 */
export const STORE_BASIS = {
  shelf: { order: 0, kind: 'good', label: 'Shelf prices', short: 'shelf prices', title: 'The price on the shelf in the store nearest you' },
  online: { order: 1, kind: '', label: 'Online (Instacart) prices', short: 'online (Instacart) prices', title: 'The store\u2019s Instacart listing for its location nearest you, which can run above the shelf price in the store' },
  national: { order: 2, kind: '', label: 'National prices', short: 'national prices', title: 'No store near you on Instacart, so this is the chain\u2019s Instacart listing for another area. Treat it as a guide' },
  adsOnly: { order: 3, kind: 'warn', label: 'Weekly ad only', short: 'weekly ad only', title: 'No live prices we can read, so we show this store\u2019s circular' },
};

/** The bases that mean "we can actually put a number on this store". */
export const PRICEABLE_BASIS = ['shelf', 'online', 'national'];

export function isPriceable(basis) {
  return PRICEABLE_BASIS.includes(basis);
}

export function basisInfo(basis) {
  return STORE_BASIS[basis] || STORE_BASIS.adsOnly;
}

/**
 * Where a product link really goes, named by its destination rather than by the store.
 *
 * The product sheet's button read "Open at Walmart" and the row's icon said "Open at the store's
 * site", but for 90 of the 94 chains Cartworth prices the link is an instacart.com page. A shopper
 * who taps "Open at Walmart" and lands on Instacart has been told something untrue about where
 * they are going — and about where the price came from. So the label is derived from the URL:
 *   - an Instacart host is "Open on Instacart", whatever store it is for;
 *   - a host that is recognisably the chain's own site (aldi.us, shopwoodmans.com,
 *     wholefoodsmarket.com, traderjoes.com, marianos.com — some of them Instacart-powered, but
 *     the shopper is on the store's own domain) is "Open at <store>";
 *   - anything else names the bare host, which is never wrong.
 * Returns null for a missing or unparseable URL, so a caller can render no link at all.
 */
export function linkDestination(url, store) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const bare = host.replace(/^www\./, '');
  if (bare === 'instacart.com' || bare.endsWith('.instacart.com')) return { own: false, host: bare, text: 'Open on Instacart' };
  const squash = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const site = squash(bare.split('.').slice(0, -1).join('.'));
  const names = [store?.id, store?.short, store?.name].map(squash).filter((n) => n.length >= 3);
  if (names.some((n) => site.includes(n))) return { own: true, host: bare, text: `Open at ${store.short || store.name}` };
  return { own: false, host: bare, text: `Open on ${bare}` };
}
