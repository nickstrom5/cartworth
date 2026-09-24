// Nationwide chain catalog. This is the list of grocery chains Cartworth knows how to price,
// plus where each one's prices and weekly ad come from.
//
// price: where live shelf/online prices come from
//   instacart  - Instacart-powered storefront or marketplace (guest session, persisted GraphQL)
//   wholefoods - wholefoodsmarket.com store-level search
//   traderjoes - traderjoes.com product search
//   kroger     - official Kroger API (needs free developer keys), exact shelf + card prices
//   null       - no price source we can read honestly; weekly ad only
// ads:    Flipp merchant name(s) for the weekly circular. Flipp tells us which merchants serve a ZIP,
//         which is how we discover what exists near someone without guessing.
// states: where the chain actually operates. This is a COST filter only, never the source of truth:
//         it stops us from asking Instacart about Publix in Montana. 'US' means nationwide.
//         If a chain is in `states` but not really nearby, the live probe drops it.
//
// chainWide (on an Instacart price source): may this chain be priced from Instacart's CANONICAL
//         storefront? When no store of a chain serves a ZIP, Instacart does not say "none" — it hands
//         back one storefront somewhere else in the country. For almost every chain that is simply
//         some other store, and its prices are that store's: measured on 23 Sep 2026, Publix answered
//         Chicago with a Publix in Atlanta (596 mi), Hy-Vee answered Milwaukee and Kenosha with
//         Lincoln NE (~475 mi), Food 4 Less answered Chicago with Stockton CA (1,790 mi), Schnucks
//         answered Milwaukee with Godfrey IL, The Fresh Market answered Milwaukee with Destin FL, and
//         Cermak answered Milwaukee with one Chicago store 82 mi away. All of those were shown to the
//         shopper as "national prices — the chain publishes one price", which none of those chains
//         does, and several then became the "next-best store" in a savings line. Only a chain whose
//         Instacart listing really is one chain-wide price list may be priced that way; every other
//         chain's canonical answer means "no store of this chain serves this ZIP", and the directory
//         and the search both treat it so. Opt-in, one chain at a time, with the evidence.
//
// Some chains are deliberately ads-only. Target, H-E-B, Lidl, WinCo and a few others actively block
// automated price reads; we record that and show their weekly ad instead of trying to get around it.

const IC = 'https://www.instacart.com';
const PREFER = ['instore', 'pickup', 'delivery'];

/** Instacart marketplace source. `extra` carries per-source flags such as `chainWide` (see above). */
function ic(slug, base = IC, guest = 'implicit', extra = {}) {
  return { type: 'instacart', base, slug, prefer: PREFER, guest, ...extra };
}

const NE = ['CT', 'MA', 'ME', 'NH', 'RI', 'VT'];
const MIDATL = ['DE', 'DC', 'MD', 'NJ', 'NY', 'PA', 'VA', 'WV'];

export const CHAINS = [
  // ---------------------------------------------------------------- true shelf prices
  {
    id: 'aldi', name: 'ALDI', short: 'ALDI', aliases: ['aldi'],
    price: ic('aldi', 'https://www.aldi.us'), ads: ['ALDI'],
    states: ['AL', 'AR', 'AZ', 'CA', 'CT', 'DE', 'FL', 'GA', 'IA', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NY', 'OH', 'OK', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'VA', 'VT', 'WI', 'WV', 'DC'],
    note: 'In-store shelf prices.',
  },
  {
    id: 'woodmans', name: 'Woodman’s', short: 'Woodman’s', aliases: ['woodman'],
    price: ic('woodmans-food-markets', 'https://shopwoodmans.com', 'postal'), ads: ["Woodman's Food Market"],
    states: ['WI', 'IL'],
    note: 'In-store shelf prices.',
  },
  {
    id: 'wholefoods', name: 'Whole Foods Market', short: 'Whole Foods', aliases: ['whole foods'],
    price: { type: 'wholefoods' }, ads: [], states: 'US',
    note: 'Shelf prices, including sale and Prime member prices.',
  },
  {
    id: 'traderjoes', name: 'Trader Joe’s', short: 'Trader Joe’s', aliases: ['trader joe'],
    price: { type: 'traderjoes' }, ads: [], states: 'US',
    note: 'Posted shelf prices. Trader Joe’s doesn’t run weekly sales.',
  },

  // ---------------------------------------------------------------- national
  // The one chainWide chain. Instacart never resolves a local Walmart: every ZIP tested (Chicago,
  // Lombard, Milwaukee, Kenosha, Barrow AK) gets the same storefront, Walmart #2697 in Antioch CA,
  // whose listing Walmart labels "no markups". That is the chain-wide listing the 'national' basis
  // was designed for. It carries no store: never Antioch's address or its 1,800-mile distance.
  { id: 'walmart', name: 'Walmart', short: 'Walmart', aliases: ['walmart'], price: ic('walmart', IC, 'implicit', { chainWide: true }), ads: ['Walmart'], states: 'US', note: 'Walmart labels these “no markups”, so they track the shelf price.' },
  { id: 'target', name: 'Target', short: 'Target', aliases: ['target'], price: null, ads: ['Target'], states: 'US', note: 'Weekly ad only — Target blocks automated price lookups.' },
  { id: 'costco', name: 'Costco', short: 'Costco', aliases: ['costco'], price: ic('costco'), ads: ['Costco'], states: 'US', note: 'Same-day prices run above the warehouse shelf.' },
  { id: 'samsclub', name: 'Sam’s Club', short: 'Sam’s Club', aliases: ["sam's club", 'sams club'], price: ic('sams-club'), ads: ["Sam's Club"], states: 'US' },
  { id: 'bjs', name: 'BJ’s Wholesale', short: 'BJ’s', aliases: ["bj's wholesale", 'bjs wholesale'], price: ic('bjs'), ads: ["BJ's Wholesale Club"], states: ['AL', 'CT', 'DE', 'FL', 'GA', 'IN', 'MA', 'MD', 'ME', 'MI', 'NC', 'NH', 'NJ', 'NY', 'OH', 'PA', 'RI', 'SC', 'TN', 'VA', 'VT'] },
  { id: 'lidl', name: 'Lidl', short: 'Lidl', aliases: ['lidl'], price: null, ads: ['Lidl', 'LIDL'], states: ['DE', 'GA', 'MD', 'NC', 'NJ', 'NY', 'PA', 'SC', 'VA', 'DC'], note: 'Weekly ad only.' },
  { id: 'dollargeneral', name: 'Dollar General', short: 'Dollar General', aliases: ['dollar general'], price: null, ads: ['Dollar General'], states: 'US', note: 'Weekly ad only.' },
  { id: 'dollartree', name: 'Dollar Tree', short: 'Dollar Tree', aliases: ['dollar tree'], price: null, ads: ['Dollar Tree'], states: 'US', note: 'Weekly ad only.' },
  { id: 'familydollar', name: 'Family Dollar', short: 'Family Dollar', aliases: ['family dollar'], price: null, ads: ['Family Dollar'], states: 'US', note: 'Weekly ad only.' },

  // ---------------------------------------------------------------- Kroger family
  { id: 'kroger', name: 'Kroger', short: 'Kroger', aliases: ['kroger'], price: ic('kroger'), alt: { type: 'kroger', chain: 'KROGER' }, ads: ['Kroger'], states: ['OH', 'MI', 'IN', 'KY', 'WV', 'VA', 'TN', 'GA', 'AL', 'MS', 'AR', 'TX', 'LA', 'IL', 'MO', 'NC', 'SC'] },
  { id: 'ralphs', name: 'Ralphs', short: 'Ralphs', aliases: ['ralphs'], price: ic('ralphs'), alt: { type: 'kroger', chain: 'RALPHS' }, ads: ['Ralphs'], states: ['CA'] },
  { id: 'fredmeyer', name: 'Fred Meyer', short: 'Fred Meyer', aliases: ['fred meyer'], price: ic('fred-meyer'), alt: { type: 'kroger', chain: 'FRED_MEYER' }, ads: ['Fred Meyer'], states: ['WA', 'OR', 'ID', 'AK'] },
  { id: 'kingsoopers', name: 'King Soopers', short: 'King Soopers', aliases: ['king soopers'], price: ic('king-soopers'), alt: { type: 'kroger', chain: 'KING_SOOPERS' }, ads: ['King Soopers'], states: ['CO', 'WY'] },
  { id: 'frys', name: 'Fry’s Food', short: 'Fry’s', aliases: ["fry's food", 'frys food', "fry's marketplace"], price: ic('frys'), alt: { type: 'kroger', chain: 'FRYS' }, ads: ["Fry's Food Stores", "Fry's"], states: ['AZ'] },
  { id: 'smiths', name: 'Smith’s', short: 'Smith’s', aliases: ["smith's food", 'smiths food', "smith's marketplace"], price: ic('smiths'), alt: { type: 'kroger', chain: 'SMITHS' }, ads: ["Smith's Food and Drug", "Smith's"], states: ['UT', 'NV', 'NM', 'ID', 'MT', 'WY', 'AZ'] },
  { id: 'qfc', name: 'QFC', short: 'QFC', aliases: ['qfc', 'quality food centers'], price: ic('qfc'), alt: { type: 'kroger', chain: 'QFC' }, ads: ['QFC'], states: ['WA', 'OR'] },
  { id: 'dillons', name: 'Dillons', short: 'Dillons', aliases: ['dillons'], price: ic('dillons'), alt: { type: 'kroger', chain: 'DILLONS' }, ads: ['Dillons'], states: ['KS'] },
  { id: 'harristeeter', name: 'Harris Teeter', short: 'Harris Teeter', aliases: ['harris teeter'], price: ic('harristeeter'), alt: { type: 'kroger', chain: 'HARRIS_TEETER' }, ads: ['Harris Teeter'], states: ['NC', 'SC', 'VA', 'GA', 'DE', 'MD', 'DC', 'FL'] },
  { id: 'marianos', name: 'Mariano’s', short: 'Mariano’s', aliases: ['mariano'], price: ic('marianos'), alt: { type: 'kroger', chain: 'MARIANOS' }, ads: ["Mariano's"], states: ['IL'], note: 'Add free Kroger API keys in Settings for exact shelf + card prices.' },
  { id: 'picknsave', name: 'Pick ’n Save', short: 'Pick ’n Save', aliases: ["pick 'n save", 'pick n save'], price: ic('pick-n-save'), alt: { type: 'kroger', chain: 'PICK_N_SAVE' }, ads: ['Pick N Save'], states: ['WI'] },
  { id: 'metromarket', name: 'Metro Market', short: 'Metro Market', aliases: ['metro market'], price: ic('metro-market'), ads: ['Metro Market'], states: ['WI'] },
  { id: 'food4less', name: 'Food 4 Less', short: 'Food 4 Less', aliases: ['food 4 less', 'food4less'], price: ic('food4less'), ads: ['Food 4 Less'], states: ['CA', 'IL', 'IN', 'NV'] },
  { id: 'citymarket', name: 'City Market', short: 'City Market', aliases: ['city market'], price: null, ads: ['City Market'], states: ['CO', 'UT', 'NM', 'WY'], note: 'Weekly ad only.' },
  { id: 'gerbes', name: 'Gerbes', short: 'Gerbes', aliases: ['gerbes'], price: ic('gerbes'), ads: ['Gerbes'], states: ['MO'] },
  { id: 'bakersplus', name: 'Baker’s', short: 'Baker’s', aliases: ["baker's supermarket", 'bakers supermarket'], price: null, ads: ["Baker's"], states: ['NE', 'IA'], note: 'Weekly ad only.' },
  { id: 'jayc', name: 'JayC Food Stores', short: 'JayC', aliases: ['jay c food', 'jayc'], price: ic('jayc'), ads: ['JayC Food Stores'], states: ['IN'] },

  // ---------------------------------------------------------------- Albertsons family
  { id: 'albertsons', name: 'Albertsons', short: 'Albertsons', aliases: ['albertsons'], price: ic('albertsons'), ads: ['Albertsons'], states: ['AK', 'AZ', 'AR', 'CA', 'CO', 'ID', 'LA', 'MT', 'NE', 'NV', 'NM', 'ND', 'OK', 'OR', 'SD', 'TX', 'UT', 'WA', 'WY'] },
  { id: 'safeway', name: 'Safeway', short: 'Safeway', aliases: ['safeway'], price: ic('safeway'), ads: ['Safeway'], states: ['AK', 'AZ', 'CA', 'CO', 'DC', 'DE', 'HI', 'ID', 'MD', 'MT', 'NE', 'NV', 'NM', 'OR', 'SD', 'TX', 'VA', 'WA', 'WY'] },
  { id: 'vons', name: 'Vons', short: 'Vons', aliases: ['vons'], price: ic('vons'), ads: ['Vons'], states: ['CA', 'NV'] },
  { id: 'pavilions', name: 'Pavilions', short: 'Pavilions', aliases: ['pavilions'], price: ic('pavilions'), ads: ['Pavilions'], states: ['CA'] },
  { id: 'jewel', name: 'Jewel-Osco', short: 'Jewel', aliases: ['jewel-osco', 'jewel osco', 'jewel'], price: ic('jewel-osco'), ads: ['Jewel-Osco'], states: ['IL', 'IN', 'IA'], note: 'Prices come from Jewel’s Instacart listing; “for U” digital deals come from the circular.' },
  { id: 'acme', name: 'ACME Markets', short: 'ACME', aliases: ['acme markets', 'acme market'], price: ic('acme-markets'), ads: ['ACME Markets', 'Acme'], states: ['PA', 'NJ', 'DE', 'MD', 'NY', 'CT'] },
  { id: 'shaws', name: 'Shaw’s', short: 'Shaw’s', aliases: ["shaw's", 'shaws'], price: null, ads: ["Shaw's"], states: NE, note: 'Weekly ad only.' },
  { id: 'starmarket', name: 'Star Market', short: 'Star Market', aliases: ['star market'], price: ic('star-markets'), ads: ['Star Market'], states: ['MA'] },
  { id: 'tomthumb', name: 'Tom Thumb', short: 'Tom Thumb', aliases: ['tom thumb'], price: ic('tom-thumb'), ads: ['Tom Thumb'], states: ['TX'] },
  { id: 'randalls', name: 'Randalls', short: 'Randalls', aliases: ['randalls'], price: ic('randalls'), ads: ['Randalls'], states: ['TX'] },
  { id: 'haggen', name: 'Haggen', short: 'Haggen', aliases: ['haggen'], price: ic('haggen'), ads: ['Haggen'], states: ['WA'] },
  { id: 'carrs', name: 'Carrs', short: 'Carrs', aliases: ['carrs', 'carr’s'], price: ic('carrs-quality-center'), ads: ['Carrs'], states: ['AK'] },
  { id: 'unitedsupermarkets', name: 'United Supermarkets', short: 'United', aliases: ['united supermarket'], price: ic('united-supermarkets'), ads: ['United Supermarkets'], states: ['TX'] },
  { id: 'marketstreet', name: 'Market Street', short: 'Market Street', aliases: ['market street'], price: ic('market-street'), ads: ['Market Street'], states: ['TX', 'NM'] },

  // ---------------------------------------------------------------- large regionals
  { id: 'publix', name: 'Publix', short: 'Publix', aliases: ['publix'], price: ic('publix'), ads: ['Publix'], states: ['FL', 'GA', 'AL', 'SC', 'NC', 'TN', 'VA', 'KY'] },
  { id: 'heb', name: 'H-E-B', short: 'H-E-B', aliases: ['h-e-b', 'h e b'], price: null, ads: ['H-E-B', 'HEB'], states: ['TX'], note: 'Weekly ad only — H-E-B blocks automated price lookups.' },
  { id: 'meijer', name: 'Meijer', short: 'Meijer', aliases: ['meijer'], price: ic('meijer'), ads: ['Meijer'], states: ['MI', 'OH', 'IN', 'IL', 'KY', 'WI'] },
  { id: 'hyvee', name: 'Hy-Vee', short: 'Hy-Vee', aliases: ['hy-vee', 'hyvee'], price: ic('hy-vee'), ads: ['Hy-Vee'], states: ['IA', 'IL', 'KS', 'MN', 'MO', 'NE', 'SD', 'WI', 'IN'] },
  { id: 'wegmans', name: 'Wegmans', short: 'Wegmans', aliases: ['wegmans'], price: ic('wegmans'), ads: ['Wegmans'], states: ['NY', 'PA', 'NJ', 'MD', 'VA', 'MA', 'NC', 'DE', 'DC'] },
  { id: 'foodlion', name: 'Food Lion', short: 'Food Lion', aliases: ['food lion'], price: ic('food-lion'), ads: ['Food Lion'], states: ['DE', 'GA', 'KY', 'MD', 'NC', 'PA', 'SC', 'TN', 'VA', 'WV'] },
  { id: 'giant', name: 'Giant Food', short: 'Giant', aliases: ['giant food'], price: ic('giant'), ads: ['Giant', 'Giant Food'], states: ['MD', 'VA', 'DC', 'DE'] },
  { id: 'martins', name: 'Martin’s', short: 'Martin’s', aliases: ["martin's food", 'martins food'], price: ic('martins'), ads: ["Martin's"], states: ['PA', 'MD', 'VA', 'WV'] },
  { id: 'gianteagle', name: 'Giant Eagle', short: 'Giant Eagle', aliases: ['giant eagle'], price: ic('giant-eagle'), ads: ['Giant Eagle'], states: ['PA', 'OH', 'WV', 'IN', 'MD'] },
  { id: 'stopandshop', name: 'Stop & Shop', short: 'Stop & Shop', aliases: ['stop & shop', 'stop and shop'], price: ic('stop-shop'), ads: ['Stop & Shop'], states: ['CT', 'MA', 'NJ', 'NY', 'RI'] },
  { id: 'hannaford', name: 'Hannaford', short: 'Hannaford', aliases: ['hannaford'], price: ic('hannaford'), ads: ['Hannaford'], states: ['ME', 'NH', 'VT', 'MA', 'NY'] },
  { id: 'shoprite', name: 'ShopRite', short: 'ShopRite', aliases: ['shoprite', 'shop rite'], price: ic('shoprite'), ads: ['ShopRite'], states: ['NJ', 'NY', 'PA', 'CT', 'DE', 'MD'] },
  { id: 'pricerite', name: 'Price Rite', short: 'Price Rite', aliases: ['price rite', 'pricerite'], price: ic('pricerite'), ads: ['Price Rite Marketplace'], states: ['CT', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI'] },
  { id: 'pricechopper', name: 'Price Chopper', short: 'Price Chopper', aliases: ['price chopper', 'market 32'], price: ic('price-chopper'), ads: ['Price Chopper'], states: ['NY', 'VT', 'NH', 'MA', 'CT', 'PA'] },
  { id: 'weis', name: 'Weis Markets', short: 'Weis', aliases: ['weis markets', 'weis market'], price: ic('weis-markets'), ads: ['Weis Markets'], states: ['PA', 'MD', 'NY', 'NJ', 'WV', 'VA', 'DE'] },
  { id: 'tops', name: 'Tops Friendly Markets', short: 'Tops', aliases: ['tops market', 'tops friendly'], price: ic('tops-markets'), ads: ['Tops Friendly Markets'], states: ['NY', 'PA', 'VT'] },
  { id: 'bigy', name: 'Big Y', short: 'Big Y', aliases: ['big y'], price: ic('big-y'), ads: ['Big Y'], states: ['CT', 'MA'] },
  { id: 'marketbasket', name: 'Market Basket', short: 'Market Basket', aliases: ['market basket'], price: null, ads: ['Market Basket'], states: ['MA', 'NH', 'ME'], note: 'Weekly ad only.' },
  { id: 'sprouts', name: 'Sprouts Farmers Market', short: 'Sprouts', aliases: ['sprouts'], price: ic('sprouts'), ads: ['Sprouts Farmers Market', 'Sprouts'], states: ['AL', 'AZ', 'CA', 'CO', 'DE', 'FL', 'GA', 'KS', 'LA', 'MD', 'MO', 'NC', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'PA', 'SC', 'TN', 'TX', 'UT', 'VA', 'WA'] },
  { id: 'winndixie', name: 'Winn-Dixie', short: 'Winn-Dixie', aliases: ['winn-dixie', 'winn dixie'], price: ic('winn-dixie'), ads: ['Winn-Dixie'], states: ['FL', 'AL', 'GA', 'LA', 'MS'] },
  { id: 'harveys', name: 'Harveys', short: 'Harveys', aliases: ['harveys supermarket'], price: null, ads: ['Harveys'], states: ['GA', 'FL', 'SC'], note: 'Weekly ad only.' },
  { id: 'ingles', name: 'Ingles Markets', short: 'Ingles', aliases: ['ingles'], price: ic('ingles'), ads: ['Ingles Markets', 'Ingles'], states: ['NC', 'SC', 'GA', 'TN', 'VA', 'AL'] },
  { id: 'schnucks', name: 'Schnucks', short: 'Schnucks', aliases: ['schnucks'], price: ic('schnucks'), ads: ['Schnucks'], states: ['MO', 'IL', 'IN', 'WI'] },
  { id: 'dierbergs', name: 'Dierbergs', short: 'Dierbergs', aliases: ['dierbergs'], price: ic('dierbergs-markets'), ads: ['Dierbergs'], states: ['MO', 'IL'] },
  { id: 'cub', name: 'Cub', short: 'Cub', aliases: ['cub foods'], price: ic('cub'), ads: ['Cub', 'Cub Foods'], states: ['MN', 'IL'] },
  { id: 'coborns', name: 'Coborn’s', short: 'Coborn’s', aliases: ["coborn's", 'coborns'], price: null, ads: ["Coborn's"], states: ['MN', 'ND', 'SD', 'WI'], note: 'Weekly ad only.' },
  { id: 'fareway', name: 'Fareway', short: 'Fareway', aliases: ['fareway'], price: null, ads: ['Fareway'], states: ['IA', 'IL', 'MN', 'NE', 'SD', 'MO', 'KS'], note: 'Weekly ad only.' },
  { id: 'festivalfoods', name: 'Festival Foods', short: 'Festival', aliases: ['festival foods'], price: ic('festival-foods'), ads: ['Festival Foods'], states: ['WI'] },
  // Still weekly-ad only, checked 23 Sep 2026: no Instacart storefront under 'sendiks-food-market',
  // 'sendiks', 'sendiks-fresh2go', 'sendiks-food-markets' or 'sendik-s-food-market', and Flipp
  // published no Sendik's circular at 53211 or 53142 that week. Sendik's does publish prices: its
  // own shop (sendiks.com/shop, "Fresh2GO") runs on NCR's Freshop platform (freshop.ncrcloud.com),
  // which Cartworth has no adapter for. That is the legitimate source if one is ever built — not a
  // guessed Instacart slug.
  { id: 'sendiks', name: 'Sendik’s', short: 'Sendik’s', aliases: ["sendik's", 'sendiks'], price: null, ads: ["Sendik's Food Market"], states: ['WI'], note: 'Weekly ad only.' },
  { id: 'staterbros', name: 'Stater Bros.', short: 'Stater Bros.', aliases: ['stater bros'], price: ic('stater-bros'), ads: ['Stater Bros. Markets', 'Stater Bros'], states: ['CA'] },
  { id: 'smartfinal', name: 'Smart & Final', short: 'Smart & Final', aliases: ['smart & final', 'smart and final'], price: ic('smart-final'), ads: ['Smart & Final'], states: ['CA', 'AZ', 'NV'] },
  { id: 'groceryoutlet', name: 'Grocery Outlet', short: 'Grocery Outlet', aliases: ['grocery outlet'], price: ic('grocery-outlet'), ads: ['Grocery Outlet'], states: ['CA', 'OR', 'WA', 'ID', 'NV', 'PA', 'MD', 'NJ', 'DE', 'OH', 'WV'] },
  { id: 'freshmarket', name: 'The Fresh Market', short: 'Fresh Market', aliases: ['the fresh market'], price: ic('the-fresh-market'), ads: ['The Fresh Market'], states: ['AL', 'CT', 'DE', 'FL', 'GA', 'IL', 'IN', 'KY', 'LA', 'MA', 'MD', 'MI', 'MO', 'MS', 'NC', 'NH', 'NJ', 'NY', 'OH', 'PA', 'SC', 'TN', 'TX', 'VA', 'WI'] },
  // Priced since 23 Sep 2026. The slug is Instacart's 'fresh-thyme-farmers-market' (not
  // 'fresh-thyme' or 'fresh-thyme-market', which do not exist); scripts/find-slugs.js resolved it to
  // a LOCAL store at both Wisconsin test ZIPs — 470 East Pleasant, Milwaukee (2.3 mi from 53211) and
  // 7100 Green Bay Road, Kenosha (1.4 mi from 53142) — and scripts/check-catalog.js --zip confirmed
  // the Illinois ones. It is an Instacart listing, so it is labelled an online price, never shelf.
  { id: 'freshthyme', name: 'Fresh Thyme Market', short: 'Fresh Thyme', aliases: ['fresh thyme'], price: ic('fresh-thyme-farmers-market'), ads: ['Fresh Thyme Market'], states: ['IL', 'IN', 'IA', 'KS', 'KY', 'MI', 'MN', 'MO', 'NE', 'OH', 'PA', 'WI', 'SD'] },
  { id: 'saveolot', name: 'Save A Lot', short: 'Save A Lot', aliases: ['save a lot', 'save-a-lot'], price: ic('savealot'), ads: ['Save A Lot'], states: ['AL', 'AR', 'DE', 'FL', 'GA', 'IL', 'IN', 'KY', 'LA', 'MD', 'MI', 'MO', 'MS', 'NC', 'NJ', 'NY', 'OH', 'PA', 'SC', 'TN', 'VA', 'WV'] },
  { id: 'winco', name: 'WinCo Foods', short: 'WinCo', aliases: ['winco'], price: null, ads: ['WinCo Foods'], states: ['WA', 'OR', 'ID', 'NV', 'CA', 'UT', 'AZ', 'TX', 'MT', 'OK'], note: 'Weekly ad only.' },
  { id: 'raleys', name: 'Raley’s', short: 'Raley’s', aliases: ["raley's", 'raleys'], price: ic('raleys'), ads: ["Raley's"], states: ['CA', 'NV'] },
  { id: 'savemart', name: 'Save Mart', short: 'Save Mart', aliases: ['save mart'], price: ic('savemart'), ads: ['Save Mart'], states: ['CA', 'NV'] },
  { id: 'foodmaxx', name: 'FoodMaxx', short: 'FoodMaxx', aliases: ['foodmaxx', 'food maxx'], price: ic('foodmaxx'), ads: ['FoodMaxx'], states: ['CA', 'NV'] },
  { id: 'luckysupermarkets', name: 'Lucky Supermarkets', short: 'Lucky', aliases: ['lucky supermarket'], price: ic('lucky-supermarkets'), ads: ['Lucky Supermarkets'], states: ['CA'] },
  { id: 'foodcity', name: 'Food City', short: 'Food City', aliases: ['food city'], price: ic('food-city'), ads: ['Food City'], states: ['TN', 'VA', 'GA', 'KY', 'AL'] },
  { id: 'lowesfoods', name: 'Lowes Foods', short: 'Lowes Foods', aliases: ['lowes foods'], price: null, ads: ['Lowes Foods'], states: ['NC', 'SC', 'VA'], note: 'Weekly ad only.' },
  { id: 'brookshires', name: 'Brookshire’s', short: 'Brookshire’s', aliases: ["brookshire's", 'brookshires'], price: ic('brookshires'), ads: ["Brookshire's"], states: ['TX', 'LA', 'AR'] },
  // Priced since 23 Sep 2026 from Piggly Wiggly MIDWEST's own store site. The marketplace's
  // 'piggly-wiggly' storefront is the Southern chain: it answers Milwaukee and Kenosha only with its
  // canonical store 844-878 mi away, which must never be read as a local price (see chainWide above),
  // and 'piggly-wiggly-midwest' does not exist. The Wisconsin stores' "Order online" link on
  // shopthepig.com goes to order.shopthepig.com/store/shopthepig/storefront — Instacart's platform on
  // the retailer's own domain, like shopwoodmans.com. scripts/find-slugs.js resolved it to LOCAL
  // stores at both test ZIPs (123 W Oklahoma Ave, Milwaukee, 6.7 mi from 53211; 7600 Pershing Blvd,
  // Kenosha, 0.8 mi from 53142), in-store service marked "No markups", and a live butter search at
  // Kenosha returned shelf prices.
  //
  // Unlike the marketplace, this storefront offers in-store shopping at ANY ZIP: it answered Chicago
  // 60618 and Lombard 60148 with the Kenosha store, 43.5 and 48.5 mi away, as a local (non-canonical)
  // shop. Distance is what keeps that out — the directory's radius now, and src/search.js's as well
  // once handoff H1 lands — never the canonical rule. So `states` here is where the Midwest stores are, not every
  // state with a Piggly Wiggly: the Southern ones are separately owned, have no prices here, and
  // probing their ZIPs would send this small retailer's site requests that can only come back
  // hundreds of miles away. They still appear, weekly ad only, when Flipp carries their circular —
  // chainForName does not consult `states`.
  { id: 'piggly', name: 'Piggly Wiggly', short: 'Piggly Wiggly', aliases: ['piggly wiggly'], price: ic('shopthepig', 'https://order.shopthepig.com'), ads: ['Piggly Wiggly'], states: ['WI', 'IL'], note: 'Wisconsin and northern Illinois stores are priced from Piggly Wiggly Midwest’s own store site; other Piggly Wigglys are independently owned — weekly ad only.' },
  { id: 'bashas', name: 'Bashas’', short: 'Bashas’', aliases: ["bashas", "basha's"], price: ic('bashas'), ads: ["Bashas'"], states: ['AZ', 'NM'] },
  { id: 'harmons', name: 'Harmons', short: 'Harmons', aliases: ['harmons'], price: ic('harmons'), ads: ['Harmons'], states: ['UT'] },
  { id: 'rosauers', name: 'Rosauers', short: 'Rosauers', aliases: ['rosauers'], price: ic('rosauers-supermarkets'), ads: ['Rosauers'], states: ['WA', 'ID', 'OR', 'MT'] },
  { id: 'naturalgrocers', name: 'Natural Grocers', short: 'Natural Grocers', aliases: ['natural grocers', 'vitamin cottage'], price: ic('natural-grocers'), ads: ['Natural Grocers'], states: ['AR', 'AZ', 'CO', 'ID', 'KS', 'MN', 'MO', 'MT', 'NE', 'NV', 'NM', 'OK', 'OR', 'TX', 'UT', 'WA', 'WY'] },
  { id: 'gelsons', name: 'Gelson’s', short: 'Gelson’s', aliases: ["gelson's", 'gelsons'], price: ic('gelsons'), ads: ["Gelson's"], states: ['CA'] },
  { id: 'erewhon', name: 'Erewhon', short: 'Erewhon', aliases: ['erewhon'], price: ic('erewhon'), ads: [], states: ['CA'] },
  { id: 'fairway', name: 'Fairway Market', short: 'Fairway', aliases: ['fairway market'], price: ic('fairway'), ads: ['Fairway Market'], states: ['NY', 'NJ', 'CT'] },
  { id: 'keyfood', name: 'Key Food', short: 'Key Food', aliases: ['key food'], price: ic('key-food'), ads: ['Key Food'], states: ['NY', 'NJ', 'CT', 'PA', 'FL'] },
  { id: 'foodtown', name: 'Food Town', short: 'Food Town', aliases: ['food town'], price: ic('food-town'), ads: ['Food Town'], states: ['TX'] },
  { id: 'foodtownny', name: 'Foodtown', short: 'Foodtown', aliases: ['foodtown'], price: null, ads: ['Foodtown'], states: ['NY', 'NJ'], note: 'Weekly ad only.' },
  { id: 'stewleonards', name: 'Stew Leonard’s', short: 'Stew Leonard’s', aliases: ['stew leonard'], price: ic('stew-leonards'), ads: ["Stew Leonard's"], states: ['CT', 'NY', 'NJ'] },
  { id: 'redners', name: 'Redner’s', short: 'Redner’s', aliases: ["redner's", 'redners'], price: ic('redners-markets'), ads: ["Redner's Markets"], states: ['PA', 'MD', 'DE'] },

  // ---------------------------------------------------------------- Hispanic & Asian grocers
  { id: 'elsuper', name: 'El Super', short: 'El Super', aliases: ['el super'], price: ic('el-super'), ads: ['El Super'], states: ['CA', 'AZ', 'NV', 'NM', 'TX'] },
  { id: 'vallarta', name: 'Vallarta Supermarkets', short: 'Vallarta', aliases: ['vallarta'], price: ic('vallarta-supermarkets'), ads: ['Vallarta Supermarkets'], states: ['CA'] },
  { id: 'cardenas', name: 'Cardenas Markets', short: 'Cardenas', aliases: ['cardenas'], price: null, ads: ['Cardenas Markets'], states: ['CA', 'NV', 'AZ'], note: 'Weekly ad only.' },
  { id: 'northgate', name: 'Northgate González', short: 'Northgate', aliases: ['northgate gonzalez', 'northgate market'], price: ic('northgate-market'), ads: ['Northgate Gonzalez Markets'], states: ['CA'] },
  { id: 'superiorgrocers', name: 'Superior Grocers', short: 'Superior', aliases: ['superior grocers'], price: ic('superior-grocers'), ads: ['Superior Grocers'], states: ['CA'] },
  { id: 'fiesta', name: 'Fiesta Mart', short: 'Fiesta', aliases: ['fiesta mart'], price: ic('fiesta-mart'), ads: ['Fiesta Mart'], states: ['TX'] },
  { id: 'sedanos', name: 'Sedano’s', short: 'Sedano’s', aliases: ["sedano's", 'sedanos'], price: null, ads: ["Sedano's Supermarkets"], states: ['FL'], note: 'Weekly ad only.' },
  { id: 'presidente', name: 'Presidente Supermarket', short: 'Presidente', aliases: ['presidente supermarket'], price: null, ads: ['Presidente Supermarkets'], states: ['FL'], note: 'Weekly ad only.' },
  { id: 'hmart', name: 'H Mart', short: 'H Mart', aliases: ['h mart', 'hmart'], price: ic('hmart'), ads: ['H Mart'], states: ['CA', 'NY', 'NJ', 'TX', 'VA', 'MD', 'GA', 'IL', 'WA', 'PA', 'MA', 'CO', 'NV', 'OR', 'AZ', 'NC', 'MI', 'CT', 'HI'] },
  { id: '99ranch', name: '99 Ranch Market', short: '99 Ranch', aliases: ['99 ranch'], price: ic('99-ranch-market'), ads: ['99 Ranch Market'], states: ['CA', 'TX', 'WA', 'NV', 'NJ', 'MD', 'OR', 'MA', 'GA', 'AZ'] },
  { id: 'patel', name: 'Patel Brothers', short: 'Patel Bros', aliases: ['patel brothers'], price: null, ads: [], states: ['IL', 'NJ', 'NY', 'TX', 'CA', 'GA', 'PA', 'MI', 'MD', 'VA', 'NC', 'FL', 'MA', 'OH', 'WA', 'AZ', 'CO', 'MN', 'WI', 'IN'], note: 'Weekly ad only.' },
  { id: 'seafoodcity', name: 'Seafood City', short: 'Seafood City', aliases: ['seafood city'], price: ic('seafood-city-supermarket'), ads: ['Seafood City'], states: ['CA', 'NV', 'WA', 'IL', 'TX', 'HI'] },

  // ---------------------------------------------------------------- Chicagoland independents
  { id: 'petes', name: 'Pete’s Fresh Market', short: 'Pete’s', aliases: ["pete's fresh", 'petes fresh'], price: ic('petes-fresh-market'), ads: ["Pete's Fresh Market"], states: ['IL'] },
  { id: 'tonys', name: 'Tony’s Fresh Market', short: 'Tony’s', aliases: ["tony's fresh", 'tonys fresh'], price: ic('tonys-fresh-market'), ads: ["Tony's Fresh Market"], states: ['IL'] },
  { id: 'caputos', name: 'Angelo Caputo’s', short: 'Caputo’s', aliases: ['caputo'], price: ic('caputos-fresh-markets'), ads: ["Angelo Caputo's Fresh Market"], states: ['IL'] },
  { id: 'sunset', name: 'Sunset Foods', short: 'Sunset', aliases: ['sunset foods'], price: ic('sunset-foods'), ads: ['Sunset Foods'], states: ['IL'] },
  { id: 'cermak', name: 'Cermak Fresh Market', short: 'Cermak', aliases: ['cermak'], price: ic('cermak-fresh-market'), ads: ['Cermak Fresh Market'], states: ['IL', 'IN'] },
  { id: 'standard', name: 'Standard Market', short: 'Standard', aliases: ['standard market'], price: null, ads: ['Standard Market'], states: ['IL'], note: 'Weekly ad only.' },
  { id: 'heinens', name: 'Heinen’s', short: 'Heinen’s', aliases: ['heinen'], price: null, ads: ["Heinen's Grocery Store"], states: ['OH', 'IL'], note: 'Weekly ad only.' },
];

export const CHAIN_BY_ID = Object.fromEntries(CHAINS.map((c) => [c.id, c]));

/** Chains everyone gets probed for: national footprints that a ZIP's circular list often misses. */
export const ALWAYS_PROBE = ['walmart', 'aldi', 'target', 'costco', 'samsclub', 'wholefoods', 'traderjoes'];

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * True when `needle` appears in `haystack` with a non-alphanumeric on both sides.
 *
 * Punctuation counts as a boundary, so the alias "jewel" still matches "jewel-osco", but an alias
 * can never start or end in the middle of a word.
 */
function containsWhole(haystack, needle) {
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    const before = i === 0 ? ' ' : haystack[i - 1];
    const after = i + needle.length >= haystack.length ? ' ' : haystack[i + needle.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
  }
  return false;
}

/**
 * Words that name a different line of business from a grocery store.
 *
 * A merchant called "<chain> <one of these>" is that company's liquor store, pharmacy or fuel
 * station, not its supermarket, and its circular is not the grocer's weekly ad. Flipp carries
 * "Publix Liquors" for Chicago 60618 — filed under Specialty, not Groceries, headed
 * "publix.com/liquors" and selling Grey Goose and Josh Cellars — and because the name contains the
 * whole word "publix" it was read as Publix. Publix has no Illinois stores. That one flyer put
 * Publix in the Chicago directory as "weekly ad only" (switching it on would have shown a Chicago
 * shopper the Southeast liquor circular as Publix's weekly ad), and because a chain with a circular
 * is asked for prices whatever its state list says, it also sent a Publix probe to Instacart for a
 * Chicago ZIP, which answered with a Publix in Atlanta — the build after that listed Publix as a
 * priceable Chicago store. It is the same shape as the "health mart pharmacy" / H Mart defect below.
 *
 * No chain's own alias or ads name contains one of these words (test/qa-catalog-directory.test.js
 * pins that), so this can only ever reject an extension of a name, never the name itself.
 */
const NOT_A_GROCER = /(?:^|[^a-z0-9])(?:liquors?|wines?|spirits|beer|pharmac(?:y|ies)|rx|fuel|gas|optical|hearing|tires?)(?=$|[^a-z0-9])/;

/**
 * Map a Flipp merchant name (or any store name) to a chain id. Longest alias wins: "giant eagle"
 * beats "giant". A name that adds a non-grocery line of business to the alias ("Publix Liquors",
 * "Hy-Vee Wine & Spirits") is not the chain — see NOT_A_GROCER.
 */
export function chainForName(name) {
  const n = ` ${norm(name)} `;
  let best = null;
  let bestAlias = '';
  for (const c of CHAINS) {
    for (const a of [...(c.ads || []), ...c.aliases]) {
      const alias = norm(a);
      if (!alias) continue;
      // The match must start and end on a word boundary. The old test accepted an alias that began
      // mid-word, so "h mart" matched inside "healt|h mart pharmacy": Milwaukee and Kenosha
      // shoppers were offered H Mart, a Korean grocery chain with no Wisconsin stores, and its
      // "weekly ad" was a pharmacy circular — Tylenol, melatonin, Band-Aid — published under a
      // grocer's name.
      if (containsWhole(n, alias)) {
        if (alias.length > bestAlias.length) {
          best = c;
          bestAlias = alias;
        }
      }
    }
  }
  if (!best) return null;
  // Judge only what the merchant name adds to the alias, so a word inside the alias itself can
  // never disqualify it.
  if (NOT_A_GROCER.test(n.split(bestAlias).join(' '))) return null;
  return best;
}

/** Chains plausibly operating in a state. */
export function chainsInState(state) {
  const st = String(state || '').toUpperCase();
  if (!st) return CHAINS;
  return CHAINS.filter((c) => c.states === 'US' || (Array.isArray(c.states) && c.states.includes(st)));
}

// Colour slots 1-8 are the validated colourblind-safe palette in app.css; 0 is the neutral grey
// used for a store we have no slot for.
export const SLOT_COUNT = 8;

/** Fallback colour slot for a chain that isn't in the user's own store list. */
export function slotFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % SLOT_COUNT) + 1;
}

/**
 * Give each of the user's stores a distinct colour.
 * Ordering by id (not by distance or price) keeps a store's colour stable as results change —
 * a store only changes colour when the user adds or removes stores.
 */
export function assignSlots(ids) {
  const out = {};
  [...new Set(ids)].sort().forEach((id, i) => {
    out[id] = i < SLOT_COUNT ? i + 1 : slotFor(id);
  });
  return out;
}
