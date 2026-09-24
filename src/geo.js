// ZIP code -> coordinates, and distances.
import { request, configureHost } from './http.js';
import { cached, DAY } from './cache.js';

// Nominatim's usage policy asks for no more than one request a second, so honour it exactly.
configureHost('nominatim.openstreetmap.org', { max: 1, gap: 1100 });
// api.zippopotam.us: the owner's default rule (src/http.js).

export function validZip(zip) {
  return /^\d{5}$/.test(String(zip || '').trim());
}

export async function geocodeZip(zip) {
  zip = String(zip).trim();
  if (!validZip(zip)) throw new Error(`"${zip}" is not a 5-digit US ZIP code`);
  return cached(`geo:zip:${zip}`, 365 * DAY, async () => {
    try {
      // Puerto Rico and the US Virgin Islands have US ZIP codes but are filed under their own
      // country code, so 00xxx needs a second look before we call it unknown.
      const countries = /^00[679]/.test(zip) ? ['us', 'pr', 'vi'] : ['us'];
      let p = null;
      let country = 'us';
      for (const c of countries) {
        const res = await request(`https://api.zippopotam.us/${c}/${zip}`, { timeout: 8000 });
        if (res.status === 404) continue;
        p = res.json()?.places?.[0];
        if (p) {
          country = c;
          break;
        }
      }
      if (!p) throw new Error(`ZIP ${zip} was not found`);
      // Territories come back with a FIPS number rather than a postal abbreviation.
      const abbr = String(p['state abbreviation'] || '').trim();
      const state = /^[A-Z]{2}$/.test(abbr) ? abbr : country.toUpperCase();
      return { zip, lat: +p.latitude, lng: +p.longitude, city: p['place name'].trim(), state };
    } catch (err) {
      if (/not found/.test(err.message)) throw err;
      // Fallback: OpenStreetMap Nominatim (identify ourselves per their policy)
      const res = await request(`https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=us&format=json&limit=1&addressdetails=1`, {
        headers: { 'user-agent': 'Cartworth-grocery-price-checker/1.0 (personal, local use)' },
        timeout: 8000,
      });
      const d = res.json();
      if (!d?.[0]) throw new Error(`Could not locate ZIP ${zip}`);
      const a = d[0].address || {};
      return { zip, lat: +d[0].lat, lng: +d[0].lon, city: a.city || a.town || a.village || '', state: stateCode(a) };
    }
  });
}

// Nominatim names the state ("Washington"); the catalog's `states` lists are postal codes. Passing
// the name through matched no regional chain at all, so a ZIP geocoded while zippopotam.us was
// down lost PCC, Publix, Wegmans and the rest for the year the geocode is cached.
const STATE_CODES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME',
  maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR', guam: 'GU', 'united states virgin islands': 'VI',
};

export function stateCode(address = {}) {
  const iso = /^US-([A-Z]{2})$/.exec(String(address['ISO3166-2-lvl4'] || ''));
  if (iso) return iso[1];
  const name = String(address.state || '').trim();
  if (/^[A-Z]{2}$/.test(name)) return name;
  // Unknown: keep the name. It matches no state list, so only the national chains are asked; ''
  // would ask all of them (catalog.js chainsInState).
  return STATE_CODES[name.toLowerCase()] || name.toUpperCase();
}

export function miles(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.8;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
