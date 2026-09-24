// Column contracts for everything the tracker writes.
//
// DETAIL  every kept row: tracker.db `observations` and the Drive archive daily/YYYY-MM-DD.csv.
// PRICES  the curated Sheet rows (one per term, store, ZIP and day), written to incoming/ for the
//         Apps Script importer. marketing/sheets/Code.gs declares the same list, and
//         test/qa-tracker-sheets.test.js fails if the two ever differ.
// SUMMARY the daily_summary Sheet rows (one per store per ZIP per run, plus one per run).
//
// GROUND TRUTH columns are what the retailer showed, copied as listed. DERIVED columns are worked
// out by the product's parser (shared/units.js, shared/match.js, shared/compare.js,
// src/normalize.js) and carry parser_version, so a later parser fix can recompute them and a
// "price change" that is really a parser change is never mistaken for a real one.

export const GROUND = [
  'date', 'captured_at', 'run_id', 'zip', 'term',
  'store', 'store_id', 'store_location_id', 'store_address', 'store_distance_mi',
  'basis', 'source', 'price_note',
  'product_id', 'product', 'brand', 'size_listed',
  'price', 'price_per', 'regular_price', 'on_sale', 'pct_off', 'promo', 'sale_ends',
  'card_price', 'card_label', 'est_pkg_price',
  'available', 'stock', 'sponsored', 'search_rank', 'url', 'valid_from', 'valid_to',
];

export const DERIVED = [
  'parser_version',
  'unit_price', 'unit', 'unit_price_est', 'dim', 'size_parsed', 'size_source',
  'relevance', 'low_relevance', 'implausible', 'implausible_direction', 'implausible_ratio', 'size_conflict',
  'flags', 'is_store_best',
];

export const DETAIL_COLUMNS = [...GROUND, ...DERIVED];

export const PRICE_COLUMNS = [
  'key', 'date', 'captured_at', 'zip', 'term', 'store', 'store_id', 'store_location_id', 'basis',
  'product', 'brand', 'size_listed', 'price', 'price_per', 'regular_price', 'on_sale', 'promo',
  'card_price', 'card_label', 'unit_price', 'unit', 'unit_price_est', 'relevance', 'product_id',
  'parser_version', 'url', 'run_id',
];

export const SUMMARY_COLUMNS = [
  'key', 'date', 'run_id', 'zip', 'store', 'store_id', 'basis', 'store_location_id', 'store_address',
  'distance_mi', 'price_note', 'terms_tracked', 'terms_ok', 'terms_empty', 'terms_failed',
  'rows_kept', 'rows_flagged', 'curated_rows', 'weekly_ad_rows', 'note', 'parser_version',
];

/** SQLite affinity per detail column; anything not listed is TEXT. */
export const NUMERIC = new Set([
  'store_distance_mi', 'price', 'regular_price', 'pct_off', 'card_price', 'est_pkg_price', 'search_rank',
  'unit_price', 'relevance', 'implausible_ratio',
]);
export const BOOLEAN = new Set(['on_sale', 'available', 'sponsored', 'unit_price_est', 'low_relevance', 'implausible', 'size_conflict', 'is_store_best']);

/** The dedupe key of a curated Sheet row. One row per term, store, ZIP and day. */
export function priceKey(r) {
  return `${r.date}|${r.zip}|${r.term}|${r.store_id}`;
}

/** The dedupe key of a daily_summary row. */
export function summaryKey(r) {
  return `${r.date}|${r.zip}|${r.store_id}|${r.run_id}`;
}
