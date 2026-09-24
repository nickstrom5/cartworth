// Trader Joe's: nearest store (Brandify locator used by traderjoes.com) + product search (GraphQL).
import { request } from '../http.js';

// Every host this adapter reads gets the owner's rule from src/http.js (DEFAULT_HOST_POLICY: one
// request in flight, 700 ms apart, stop on 429). The looser per-host limits that used to be set
// here were removed at the owner's decision (Sept 2026); long queues are handled by
// withStallTimeout, not by asking faster.
import { cached, DAY } from '../cache.js';
import { geocodeZip, miles } from '../geo.js';
import { makeProduct } from '../normalize.js';

const BASE = 'https://www.traderjoes.com';
const LOCATOR = 'https://alphaapi.brandify.com/rest/locatorsearch';
const APPKEY = '8BC3433A-60FC-11E3-991D-B2EE0C70A832';

export async function resolveStore(zip, { fresh = false } = {}) {
  return cached(`tj:store:${zip}`, 7 * DAY, async () => {
    const body = {
      request: {
        appkey: APPKEY,
        formdata: {
          geoip: false, dataview: 'store_default', limit: 5,
          geolocs: { geoloc: [{ addressline: zip, country: 'US', latitude: '', longitude: '' }] },
          searchradius: '100', where: { warehouse: { distinctfrom: '1' } },
        },
      },
    };
    const r = await request(LOCATOR, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), timeout: 15000, okOnly: true });
    const list = r.json()?.response?.collection || [];
    if (!list.length) return { none: true };
    const geo = await geocodeZip(zip);
    const stores = list.map((c) => ({
      id: String(c.clientkey),
      name: `Trader Joe’s ${String(c.name || '').replace(/\s*\(\d+\)\s*$/, '')}`,
      address: [c.address1, c.city, c.state].filter(Boolean).join(', '),
      lat: +c.latitude,
      lng: +c.longitude,
      distance: miles(geo, { lat: +c.latitude, lng: +c.longitude }),
    }));
    stores.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    return { ...stores[0], nearby: stores.slice(0, 5) };
  }, { fresh });
}

const QUERY = `query SearchProducts($search: String, $pageSize: Int, $currentPage: Int, $storeCode: String = "701", $availability: String = "1", $published: String = "1") {
  products(search: $search, filter: {store_code: {eq: $storeCode}, published: {eq: $published}, availability: {match: $availability}}, pageSize: $pageSize, currentPage: $currentPage) {
    items {
      category_hierarchy { id name }
      primary_image
      sku
      url_key
      name
      item_title
      sales_size
      sales_uom_description
      availability
      new_product
      promotion
      price_range { minimum_price { final_price { currency value } } }
      retail_price
    }
    total_count
  }
}`;

export async function search(query, zip, { limit = 40 } = {}) {
  const store = await resolveStore(zip);
  const storeCode = store && !store.none ? store.id : '701';
  const r = await request(`${BASE}/api/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationName: 'SearchProducts', variables: { storeCode, availability: '1', published: '1', search: query, currentPage: 1, pageSize: Math.min(limit, 60) }, query: QUERY }),
    timeout: 15000,
    okOnly: true,
  });
  const d = r.json();
  if (d.errors?.length && !d.data) throw new Error(d.errors[0].message);
  const list = d.data?.products?.items || [];
  const items = list.map((x, i) => {
    // TJ's titles sometimes glue two lines together ("Greek YogurtHoney Made with Whole Milk")
    const title = String(x.item_title || x.name || '').replace(/([a-z]{3,})([A-Z][a-z]{2,})/g, '$1 $2');
    const uom = String(x.sales_uom_description || '').trim();
    const sizeText = x.sales_size ? `${x.sales_size} ${uom}` : '';
    const price = x.price_range?.minimum_price?.final_price?.value ?? (x.retail_price != null ? +x.retail_price : null);
    const cats = (x.category_hierarchy || []).map((c) => c.name).filter((n) => n && n !== 'Products');
    return makeProduct({
      locationId: store?.id ?? null,
      storeId: 'traderjoes',
      id: x.sku,
      name: title,
      brand: 'Trader Joe’s',
      sizeText: /^lb$/i.test(uom) && +x.sales_size === 1 ? 'per lb' : sizeText,
      soldBy: /^lb$/i.test(uom) && +x.sales_size === 1 ? 'lb' : 'each',
      price,
      promo: x.new_product === '1' ? 'New' : null,
      image: x.primary_image ? `${BASE}${x.primary_image}` : null,
      url: x.url_key ? `${BASE}/home/products/pdp/${x.url_key}` : `${BASE}/home/search?q=${encodeURIComponent(query)}&section=products`,
      category: cats[cats.length - 1] || null,
      tags: ['storeBrand', /organic/i.test(title) ? 'organic' : null].filter(Boolean),
      rank: i,
      total: list.length,
      priceBasis: 'shelf',
    });
  })
    // Trader Joe's answers with price_range.minimum_price = 0 for rows it has no price for. A
    // price of 0 is a price we DON'T HAVE, not a free product, and money() renders it as a
    // confident "$0.00" that then sorts to the top of a cheapest-first list. Drop it like a null.
    .filter((p) => p.price != null && p.price > 0);
  return {
    items,
    location: store && !store.none ? { name: store.name, address: store.address, distance: store.distance, id: store.id, priceNote: 'Trader Joe’s posted prices (may vary slightly by store)' } : null,
  };
}
