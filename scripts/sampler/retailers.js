// Chains the sampler can price, keyed by a stable id used in states.js and in the output files.
//
// `slug` is the retailer's slug on the Instacart-powered site named by `base`. Slugs were verified
// against Instacart's own retailer listings (Sep 2026) — note several differ from the obvious guess
// (harristeeter, stop-shop, shaw, smiths, frys, bakersplus, carrs-quality-center, h-e-b).
//
// Price basis is recorded per result from the adapter (shop service type + Instacart's price
// transparency note), never assumed here. In practice:
//   shelf  — ALDI's "instore" shop on aldi.us, and Walmart on Instacart ("No markups")
//   online — everything else on the Instacart marketplace ("Prices vary from in-store")
export const IC = 'https://www.instacart.com';
export const ALDI_BASE = 'https://www.aldi.us';

/** A shop farther than this from the ZIP is not that ZIP's store: Instacart falls back to a
 *  "canonical" store (e.g. a Walmart in Antioch, CA for a Houston ZIP) when a chain isn't local.
 *  Those fallbacks are hundreds of miles out, so 40 keeps genuinely rural stores (a Safeway 42 mi
 *  from Missoula is a real option) without ever letting a fallback through. Override: --max-miles. */
export const MAX_MILES = 40;

const ic = (name, slug, parent, extra = {}) => ({ name, slug, parent, base: IC, type: 'instacart', kind: 'regional', ...extra });

export const CHAINS = {
  // ---- tried at every ZIP (in this order) ----
  target: ic('Target', 'target-corp', 'Target', { kind: 'baseline' }),
  aldi: { name: 'ALDI', slug: 'aldi', parent: 'ALDI', base: ALDI_BASE, type: 'instacart', kind: 'discount' },
  walmart: ic('Walmart', 'walmart', 'Walmart', { kind: 'shelf-baseline' }),

  // ---- Kroger banners ----
  kroger: ic('Kroger', 'kroger', 'Kroger'),
  ralphs: ic('Ralphs', 'ralphs', 'Kroger'),
  'fred-meyer': ic('Fred Meyer', 'fred-meyer', 'Kroger'),
  'king-soopers': ic('King Soopers', 'king-soopers', 'Kroger'),
  frys: ic("Fry's", 'frys', 'Kroger'),
  smiths: ic("Smith's", 'smiths', 'Kroger'),
  qfc: ic('QFC', 'qfc', 'Kroger'),
  dillons: ic('Dillons', 'dillons', 'Kroger'),
  bakers: ic("Baker's", 'bakersplus', 'Kroger'),
  'harris-teeter': ic('Harris Teeter', 'harristeeter', 'Kroger'),
  'pick-n-save': ic("Pick 'n Save", 'pick-n-save', 'Kroger'),
  marianos: ic("Mariano's", 'marianos', 'Kroger'),

  // ---- Albertsons banners ----
  safeway: ic('Safeway', 'safeway', 'Albertsons'),
  albertsons: ic('Albertsons', 'albertsons', 'Albertsons'),
  'albertsons-market': ic('Albertsons Market', 'albertsons-market', 'Albertsons'),
  vons: ic('Vons', 'vons', 'Albertsons'),
  'jewel-osco': ic('Jewel-Osco', 'jewel-osco', 'Albertsons'),
  acme: ic('ACME Markets', 'acme-markets', 'Albertsons'),
  shaws: ic("Shaw's", 'shaw', 'Albertsons'),
  'tom-thumb': ic('Tom Thumb', 'tom-thumb', 'Albertsons'),
  randalls: ic('Randalls', 'randalls', 'Albertsons'),
  carrs: ic('Carrs', 'carrs-quality-center', 'Albertsons'),

  // ---- other regionals ----
  publix: ic('Publix', 'publix', 'Publix'),
  meijer: ic('Meijer', 'meijer', 'Meijer'),
  'hy-vee': ic('Hy-Vee', 'hy-vee', 'Hy-Vee'),
  heb: ic('H-E-B', 'h-e-b', 'H-E-B'),
  'food-lion': ic('Food Lion', 'food-lion', 'Ahold Delhaize'),
  giant: ic('Giant Food', 'giant', 'Ahold Delhaize'),
  'stop-shop': ic('Stop & Shop', 'stop-shop', 'Ahold Delhaize'),
  hannaford: ic('Hannaford', 'hannaford', 'Ahold Delhaize'),
  wegmans: ic('Wegmans', 'wegmans', 'Wegmans'),
  shoprite: ic('ShopRite', 'shoprite', 'Wakefern'),
  'giant-eagle': ic('Giant Eagle', 'giant-eagle', 'Giant Eagle'),
  'big-y': ic('Big Y', 'big-y', 'Big Y'),
  'market-basket': ic('Market Basket', 'market-basket', 'Market Basket'),
  'price-chopper-ne': ic('Price Chopper', 'price-chopper-ny', 'Golub'),
  'price-chopper-kc': ic('Price Chopper', 'price-chopper', 'Price Chopper KC'),
  'key-food': ic('Key Food', 'key-food', 'Key Food'),
  tops: ic('Tops', 'tops-markets', 'Tops'),
  marcs: ic("Marc's", 'marcs', "Marc's"),
  schnucks: ic('Schnucks', 'schnucks', 'Schnucks'),
  cub: ic('Cub', 'cub', 'UNFI'),
  'family-fare': ic('Family Fare', 'family-fare-supermarkets', 'SpartanNash'),
  fareway: ic('Fareway', 'fareway-meat-grocery', 'Fareway'),
  'super-saver': ic('Super Saver', 'supersaver', 'B&R Stores'),
  harps: ic('Harps', 'harps-food-store', 'Harps'),
  homeland: ic('Homeland', 'homeland', 'Homeland'),
  reasors: ic("Reasor's", 'reasors', "Reasor's"),
  rouses: ic('Rouses Markets', 'rouses', 'Rouses'),
  ingles: ic('Ingles', 'ingles', 'Ingles'),
  hornbachers: ic("Hornbacher's", 'hornbachers', 'Coborn\'s'),
  'cash-wise': ic('Cash Wise', 'cash-wise-foods', "Coborn's"),
  'festival-foods': ic('Festival Foods', 'festival-foods', 'Festival Foods'),
  raleys: ic("Raley's", 'raleys', "Raley's"),
  lucky: ic('Lucky', 'lucky-supermarkets', 'Save Mart'),
  rosauers: ic('Rosauers', 'rosauers-supermarkets', 'Rosauers'),
  harmons: ic('Harmons', 'harmons', 'Harmons'),
  foodland: ic('Foodland', 'foodland', 'Foodland Hawaii'),

  // ---- optional extras (own sites, shelf prices) — only with --extras ----
  wholefoods: { name: 'Whole Foods Market', type: 'wholefoods', parent: 'Amazon', kind: 'extra' },
  traderjoes: { name: "Trader Joe's", type: 'traderjoes', parent: "Trader Joe's", kind: 'extra' },
};

/** Chains tried at every ZIP, in sampling order (--max-stores keeps the first N per ZIP).
 *  Target first because it is the only chain in all 51 jurisdictions, so a capped run still has its
 *  cross-state baseline; then ALDI and Walmart, the two shelf-price sources. */
export const EVERYWHERE = ['target', 'aldi', 'walmart'];
export const EXTRAS = ['wholefoods', 'traderjoes'];

export function chainName(key) {
  return CHAINS[key]?.name || key;
}

/** Config object for src/adapters/instacart.js. */
export function shopConfig(key) {
  const c = CHAINS[key];
  if (!c || c.type !== 'instacart') return null;
  return { storeId: key, base: c.base, slug: c.slug, prefer: ['instore', 'pickup', 'delivery'], guest: 'implicit' };
}

/** The chains to sample at one ZIP, in order. */
export function chainsForZip(zip, { extras = false, only = null, maxStores = 0 } = {}) {
  let keys = [...EVERYWHERE, ...(zip.chains || []), ...(extras ? EXTRAS : [])];
  keys = keys.filter((k, i) => CHAINS[k] && keys.indexOf(k) === i);
  if (only) keys = keys.filter((k) => only.includes(k));
  if (maxStores > 0) keys = keys.slice(0, maxStores);
  return keys;
}
