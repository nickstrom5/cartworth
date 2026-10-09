// Which stores in a price-audit result were refused by the retailer (HTTP 429). The app words a
// refusal two ways: "HTTP 429 from <host>" from src/http.js, and "The store site is rate-limiting
// us" once src/search.js has made it readable. A run that checked only for "429" kept going through
// a refusal (the Thanksgiving run, 9 Oct 2026); every run checks with this instead.
export const REFUSED = /\b429\b|rate-limiting/i;

/** Store ids whose answer was a refusal, from price-audit.js rows ({ status: { storeId: text } }). */
export function refusedStores(rows) {
  const out = new Set();
  for (const r of rows || []) for (const [store, text] of Object.entries(r.status || {})) if (REFUSED.test(String(text))) out.add(store);
  return [...out].sort();
}
