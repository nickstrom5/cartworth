// All 50 states + DC, each with 1–2 representative ZIPs. The first ZIP is in the state's largest
// metro; a second ZIP (larger states) covers the next-largest metro. `city` is what facts print.
//
// `chains` lists the main regional grocers to sample at that ZIP, in priority order (keys from
// retailers.js). Walmart, ALDI and Target are tried at every ZIP automatically; a chain is only
// sampled when Instacart resolves a real store within MAX_MILES (see retailers.js), so a chain that
// isn't actually there is skipped rather than silently priced from another state.
//
// ZIP/chain choices were checked against Instacart's retailer listing for each ZIP (Sep 2026).

export const STATES = [
  { code: 'AL', name: 'Alabama', zips: [
    { zip: '35209', city: 'Birmingham', chains: ['publix'] },
    { zip: '35801', city: 'Huntsville', chains: ['publix', 'kroger'] } ] },
  { code: 'AK', name: 'Alaska', zips: [
    { zip: '99503', city: 'Anchorage', chains: ['carrs', 'fred-meyer'] } ] },
  { code: 'AZ', name: 'Arizona', zips: [
    { zip: '85016', city: 'Phoenix', chains: ['frys', 'safeway'] },
    { zip: '85719', city: 'Tucson', chains: ['frys', 'safeway'] } ] },
  { code: 'AR', name: 'Arkansas', zips: [
    { zip: '72205', city: 'Little Rock', chains: ['kroger', 'harps'] } ] },
  { code: 'CA', name: 'California', zips: [
    { zip: '90019', city: 'Los Angeles', chains: ['ralphs', 'vons'] },
    { zip: '94110', city: 'San Francisco', chains: ['safeway', 'lucky'] } ] },
  { code: 'CO', name: 'Colorado', zips: [
    { zip: '80218', city: 'Denver', chains: ['king-soopers', 'safeway'] },
    { zip: '80909', city: 'Colorado Springs', chains: ['king-soopers', 'safeway'] } ] },
  { code: 'CT', name: 'Connecticut', zips: [
    { zip: '06106', city: 'Hartford', chains: ['stop-shop', 'big-y'] },
    { zip: '06511', city: 'New Haven', chains: ['stop-shop', 'shoprite'] } ] },
  { code: 'DE', name: 'Delaware', zips: [
    { zip: '19805', city: 'Wilmington', chains: ['acme', 'shoprite'] } ] },
  { code: 'DC', name: 'District of Columbia', short: 'D.C.', zips: [
    { zip: '20009', city: 'Washington', chains: ['giant', 'safeway'] } ] },
  { code: 'FL', name: 'Florida', zips: [
    { zip: '33135', city: 'Miami', chains: ['publix'] },
    { zip: '33609', city: 'Tampa', chains: ['publix'] } ] },
  { code: 'GA', name: 'Georgia', zips: [
    { zip: '30308', city: 'Atlanta', chains: ['kroger', 'publix'] },
    { zip: '31405', city: 'Savannah', chains: ['kroger', 'publix'] } ] },
  { code: 'HI', name: 'Hawaii', zips: [
    { zip: '96814', city: 'Honolulu', chains: ['safeway', 'foodland'] } ] },
  { code: 'ID', name: 'Idaho', zips: [
    { zip: '83702', city: 'Boise', chains: ['albertsons', 'fred-meyer'] } ] },
  { code: 'IL', name: 'Illinois', zips: [
    { zip: '60614', city: 'Chicago', chains: ['jewel-osco', 'marianos'] },
    { zip: '61614', city: 'Peoria', chains: ['kroger', 'hy-vee'] } ] },
  { code: 'IN', name: 'Indiana', zips: [
    { zip: '46220', city: 'Indianapolis', chains: ['kroger', 'meijer'] },
    { zip: '46805', city: 'Fort Wayne', chains: ['kroger', 'meijer'] } ] },
  { code: 'IA', name: 'Iowa', zips: [
    { zip: '50310', city: 'Des Moines', chains: ['hy-vee', 'fareway'] } ] },
  { code: 'KS', name: 'Kansas', zips: [
    { zip: '67203', city: 'Wichita', chains: ['dillons'] },
    { zip: '66212', city: 'Overland Park', chains: ['hy-vee', 'dillons'] } ] },
  { code: 'KY', name: 'Kentucky', zips: [
    { zip: '40205', city: 'Louisville', chains: ['kroger', 'meijer'] },
    { zip: '40502', city: 'Lexington', chains: ['kroger', 'meijer'] } ] },
  { code: 'LA', name: 'Louisiana', zips: [
    { zip: '70115', city: 'New Orleans', chains: ['rouses', 'albertsons'] },
    { zip: '70808', city: 'Baton Rouge', chains: ['rouses', 'albertsons'] } ] },
  { code: 'ME', name: 'Maine', zips: [
    { zip: '04102', city: 'Portland', chains: ['hannaford', 'shaws'] } ] },
  { code: 'MD', name: 'Maryland', zips: [
    { zip: '21218', city: 'Baltimore', chains: ['giant', 'safeway'] },
    { zip: '20910', city: 'Silver Spring', chains: ['giant', 'safeway'] } ] },
  { code: 'MA', name: 'Massachusetts', zips: [
    { zip: '02130', city: 'Boston', chains: ['stop-shop', 'market-basket'] },
    { zip: '01604', city: 'Worcester', chains: ['stop-shop', 'price-chopper-ne'] } ] },
  { code: 'MI', name: 'Michigan', zips: [
    { zip: '48202', city: 'Detroit', chains: ['kroger', 'meijer'] },
    { zip: '49503', city: 'Grand Rapids', chains: ['meijer', 'family-fare'] } ] },
  { code: 'MN', name: 'Minnesota', zips: [
    { zip: '55408', city: 'Minneapolis', chains: ['cub', 'hy-vee'] } ] },
  { code: 'MS', name: 'Mississippi', zips: [
    { zip: '39211', city: 'Jackson', chains: ['kroger'] } ] },
  { code: 'MO', name: 'Missouri', zips: [
    { zip: '63139', city: 'St. Louis', chains: ['schnucks'] },
    { zip: '64111', city: 'Kansas City', chains: ['hy-vee', 'price-chopper-kc'] } ] },
  { code: 'MT', name: 'Montana', zips: [
    { zip: '59102', city: 'Billings', chains: ['albertsons'] },
    { zip: '59801', city: 'Missoula', chains: ['albertsons', 'safeway'] } ] },
  { code: 'NE', name: 'Nebraska', zips: [
    { zip: '68114', city: 'Omaha', chains: ['hy-vee', 'bakers'] },
    { zip: '68502', city: 'Lincoln', chains: ['hy-vee', 'super-saver'] } ] },
  { code: 'NV', name: 'Nevada', zips: [
    { zip: '89102', city: 'Las Vegas', chains: ['smiths', 'albertsons'] },
    { zip: '89502', city: 'Reno', chains: ['raleys', 'safeway'] } ] },
  { code: 'NH', name: 'New Hampshire', zips: [
    { zip: '03104', city: 'Manchester', chains: ['hannaford', 'market-basket'] } ] },
  { code: 'NJ', name: 'New Jersey', zips: [
    { zip: '07104', city: 'Newark', chains: ['shoprite', 'stop-shop'] },
    { zip: '08002', city: 'Cherry Hill', chains: ['shoprite', 'acme'] } ] },
  { code: 'NM', name: 'New Mexico', zips: [
    { zip: '87110', city: 'Albuquerque', chains: ['smiths', 'albertsons-market'] } ] },
  { code: 'NY', name: 'New York', zips: [
    { zip: '11375', city: 'New York City', chains: ['stop-shop', 'key-food'] },
    { zip: '14216', city: 'Buffalo', chains: ['wegmans', 'tops'] } ] },
  { code: 'NC', name: 'North Carolina', zips: [
    { zip: '28205', city: 'Charlotte', chains: ['harris-teeter', 'food-lion'] },
    { zip: '27603', city: 'Raleigh', chains: ['food-lion', 'harris-teeter'] } ] },
  { code: 'ND', name: 'North Dakota', zips: [
    { zip: '58103', city: 'Fargo', chains: ['hornbachers', 'cash-wise'] } ] },
  { code: 'OH', name: 'Ohio', zips: [
    { zip: '43214', city: 'Columbus', chains: ['kroger', 'meijer'] },
    { zip: '44109', city: 'Cleveland', chains: ['giant-eagle', 'marcs'] } ] },
  { code: 'OK', name: 'Oklahoma', zips: [
    { zip: '73112', city: 'Oklahoma City', chains: ['homeland'] },
    { zip: '74135', city: 'Tulsa', chains: ['reasors', 'homeland'] } ] },
  { code: 'OR', name: 'Oregon', zips: [
    { zip: '97206', city: 'Portland', chains: ['fred-meyer', 'safeway'] } ] },
  { code: 'PA', name: 'Pennsylvania', zips: [
    { zip: '19147', city: 'Philadelphia', chains: ['acme', 'shoprite'] },
    { zip: '15217', city: 'Pittsburgh', chains: ['giant-eagle'] } ] },
  { code: 'RI', name: 'Rhode Island', zips: [
    { zip: '02908', city: 'Providence', chains: ['stop-shop', 'shaws'] } ] },
  { code: 'SC', name: 'South Carolina', zips: [
    { zip: '29607', city: 'Greenville', chains: ['publix', 'ingles'] },
    { zip: '29407', city: 'Charleston', chains: ['publix', 'harris-teeter'] } ] },
  { code: 'SD', name: 'South Dakota', zips: [
    { zip: '57105', city: 'Sioux Falls', chains: ['hy-vee'] } ] },
  { code: 'TN', name: 'Tennessee', zips: [
    { zip: '37211', city: 'Nashville', chains: ['kroger', 'publix'] },
    { zip: '38117', city: 'Memphis', chains: ['kroger'] } ] },
  { code: 'TX', name: 'Texas', zips: [
    { zip: '75206', city: 'Dallas', chains: ['kroger', 'tom-thumb'] },
    { zip: '77057', city: 'Houston', chains: ['heb', 'kroger'] } ] },
  { code: 'UT', name: 'Utah', zips: [
    { zip: '84106', city: 'Salt Lake City', chains: ['smiths', 'harmons'] } ] },
  { code: 'VT', name: 'Vermont', zips: [
    { zip: '05401', city: 'Burlington', chains: ['hannaford', 'price-chopper-ne'] } ] },
  { code: 'VA', name: 'Virginia', zips: [
    { zip: '23462', city: 'Virginia Beach', chains: ['food-lion', 'harris-teeter'] },
    { zip: '23225', city: 'Richmond', chains: ['kroger', 'food-lion'] } ] },
  { code: 'WA', name: 'Washington', zips: [
    { zip: '98103', city: 'Seattle', chains: ['qfc', 'safeway'] },
    { zip: '99205', city: 'Spokane', chains: ['rosauers', 'safeway'] } ] },
  { code: 'WV', name: 'West Virginia', zips: [
    { zip: '25304', city: 'Charleston', chains: ['kroger'] } ] },
  { code: 'WI', name: 'Wisconsin', zips: [
    { zip: '53215', city: 'Milwaukee', chains: ['pick-n-save', 'festival-foods'] },
    { zip: '53704', city: 'Madison', chains: ['pick-n-save', 'hy-vee'] } ] },
  { code: 'WY', name: 'Wyoming', zips: [
    { zip: '82001', city: 'Cheyenne', chains: ['albertsons', 'king-soopers'] },
    { zip: '82601', city: 'Casper', chains: ['smiths', 'albertsons'] } ] },
];

export const STATE_BY_CODE = Object.fromEntries(STATES.map((s) => [s.code, s]));

export function stateName(code) {
  return STATE_BY_CODE[code]?.name || code;
}

/** ZIP -> { state, city } for every configured ZIP. */
export const ZIP_INFO = Object.fromEntries(STATES.flatMap((s) => s.zips.map((z) => [z.zip, { state: s.code, city: z.city }])));
