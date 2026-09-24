// Store registry, built from the nationwide catalog.
//
// The catalog (shared/catalog.js) is the list of chains Cartworth knows how to price anywhere in
// the US. This file adapts it to the shape the rest of the app expects and holds the helpers that
// map a weekly-ad merchant name onto a store id.
//
// Which of these stores a given person actually sees is decided at runtime by src/directory.js,
// which asks Flipp and each chain's own site what exists near their ZIP. Nothing here is
// location-specific.
import { CHAINS, CHAIN_BY_ID, chainForName, slotFor, assignSlots, SLOT_COUNT } from './catalog.js';

export const STORES = CHAINS.map((c) => ({
  id: c.id,
  name: c.name,
  short: c.short,
  slot: slotFor(c.id),
  price: c.price,
  alt: c.alt || null,
  ads: c.ads || [],
  states: c.states,
  note: c.note || null,
}));

export const STORE_BY_ID = Object.fromEntries(STORES.map((s) => [s.id, s]));

/**
 * Stores used when we have no ZIP yet, so the app is never empty on first load.
 * These are the chains with the widest US footprint; the moment a ZIP is set, the directory
 * replaces this with what's actually nearby.
 */
export const CORE_STORE_IDS = ['walmart', 'aldi', 'wholefoods', 'traderjoes', 'target', 'costco'];

/** Map a Flipp merchant name to our store id. */
export function storeForMerchant(merchant) {
  return chainForName(merchant)?.id ?? null;
}

export { CHAINS, CHAIN_BY_ID, chainForName, slotFor, assignSlots, SLOT_COUNT };
