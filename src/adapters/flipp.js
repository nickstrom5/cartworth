// Flipp: weekly circulars (ads) for every merchant near a ZIP, plus item search and item details.
// Flyer item lists lack the price qualifiers ("2/", "/lb", "BOGO", "for U"), so we fetch each item's
// details once (they never change for a given flyer item) and keep them in SQLite.
import { request, mapLimit, configureHost } from '../http.js';

// Ad enrichment fetches one item at a time in the background and is never user-blocking, so this
// is the gentlest setting in the app.
configureHost('backflipp.wishabi.com', { max: 2, gap: 250 });
import { cached, HOUR } from '../cache.js';
import { db } from '../db.js';
import { storeForMerchant } from '../../shared/stores.js';
import { parseDeal, categorize, freeOffer } from '../../shared/deals.js';

const API = 'https://backflipp.wishabi.com/flipp';
const https = (u) => (u ? String(u).replace(/^http:\/\//, 'https://') : null);

export async function flyers(zip, { fresh = false, onStale } = {}) {
  return cached(`flipp:flyers:${zip}`, 3 * HOUR, async () => {
    const d = (await request(`${API}/flyers?locale=en-us&postal_code=${zip}`, { timeout: 16000, retries: 0, okOnly: true })).json();
    return (d.flyers || []).map((f) => ({
      id: f.id,
      merchant: String(f.merchant || '').trim(),
      storeId: storeForMerchant(f.merchant),
      name: f.name,
      validFrom: f.valid_from,
      validTo: f.valid_to,
      thumbnail: https(f.thumbnail_url),
      categories: f.categories || [],
      merchantLogo: https(f.merchant_logo),
    }));
  }, { fresh, onStale });
}

export async function flyerItems(flyerId, { fresh = false, onStale } = {}) {
  return cached(`flipp:flyer:${flyerId}`, 6 * HOUR, async () => {
    const d = (await request(`${API}/flyers/${flyerId}?locale=en-us`, { timeout: 20000, okOnly: true })).json();
    return (d.items || [])
      .filter((i) => i.name && String(i.name).trim().length > 1)
      .map((i) => ({
        id: i.id,
        flyerId: i.flyer_id,
        name: String(i.name).trim(),
        brand: i.brand || '',
        price: i.price,
        discount: i.discount,
        image: https(i.cutout_image_url),
        validFrom: i.valid_from,
        validTo: i.valid_to,
      }));
  }, { fresh, onStale, maxStaleMs: 10 * 24 * HOUR });
}

// ---------- item details (persistent) ----------
const getDetail = db.prepare('SELECT json FROM flipp_details WHERE id = ?');
const putDetail = db.prepare('INSERT OR REPLACE INTO flipp_details (id, json, fetched_at) VALUES (?, ?, ?)');

export function storedDetail(id) {
  const row = getDetail.get(id);
  return row ? JSON.parse(row.json) : null;
}

export async function itemDetail(id) {
  const have = storedDetail(id);
  if (have) return have;
  const d = (await request(`${API}/items/${id}?locale=en-us`, { timeout: 15000, okOnly: true })).json();
  const it = d.item || {};
  const detail = {
    description: it.description || null,
    pre: it.pre_price_text || null,
    priceText: it.price_text || null,
    post: it.post_price_text || null,
    story: it.sale_story || null,
    original: it.original_price != null && it.original_price !== '' ? +it.original_price : null,
    current: it.current_price != null && it.current_price !== '' ? +it.current_price : null,
    disclaimer: it.disclaimer_text || null,
    dollarsOff: it.dollars_off != null ? +it.dollars_off : null,
    percentOff: it.percent_off != null ? +it.percent_off : null,
    category: it.category || null,
  };
  putDetail.run(id, JSON.stringify(detail), Date.now());
  return detail;
}

// Background enrichment progress per flyer
const enrich = new Map(); // flyerId -> { total, done, running, error }

export function enrichmentState(flyerId) {
  return enrich.get(flyerId) || null;
}

export function enrichFlyer(flyerId, items) {
  const st = enrich.get(flyerId);
  if (st?.running) return st;
  const todo = items.filter((i) => !storedDetail(i.id));
  const state = { total: items.length, done: items.length - todo.length, running: todo.length > 0, error: null };
  enrich.set(flyerId, state);
  if (!todo.length) return state;
  mapLimit(todo, 6, async (i) => {
    try {
      await itemDetail(i.id);
    } catch (err) {
      state.error = err.message;
    }
    state.done += 1;
  }).finally(() => {
    state.running = false;
  });
  return state;
}

export async function searchItems(query, zip) {
  return cached(`flipp:search:${zip}:${query.toLowerCase()}`, HOUR, async () => {
    const d = (await request(`${API}/items/search?locale=en-us&postal_code=${zip}&q=${encodeURIComponent(query)}`, { timeout: 15000, okOnly: true })).json();
    return (d.items || [])
      .filter((i) => i.name && i.merchant_name)
      .map((i) => ({
        id: i.flyer_item_id || i.id,
        flyerId: i.flyer_id,
        merchant: String(i.merchant_name).trim(),
        name: String(i.name).trim(),
        brand: '',
        price: i.current_price,
        image: https(i.clean_image_url || i.clipping_image_url),
        validFrom: i.valid_from,
        validTo: i.valid_to,
        detail: {
          pre: i.pre_price_text || null,
          post: i.post_price_text || null,
          story: i.sale_story || null,
          original: i.original_price != null ? +i.original_price : null,
          current: i.current_price != null ? +i.current_price : null,
          description: null,
        },
        externalCategory: [i._L1, i._L2].filter(Boolean).join(' / '),
      }));
  });
}

// ---------- normalization into a "deal" ----------

const num = (v) => (v == null || v === '' || Number.isNaN(+v) ? null : +v);

export function toDeal(raw, storeId, merchant, now = Date.now()) {
  const det = raw.detail || storedDetail(raw.id) || null;
  let price = num(det?.current) ?? num(raw.price);
  const pre = (det?.pre || '').trim();
  const post = (det?.post || '').trim();
  const story = (det?.story || '').trim();
  const disclaimer = det?.disclaimer || '';

  // Coupon sections list "$X OFF (n)" — the number is the discount, not a price.
  // Woodman's prefixes these names with "(1)"/"(2)" = how many you must buy.
  const couponPrefix = String(raw.name).match(/^\((\d)\)\s*/);
  const offMatch = story.match(/^\s*(?:\$\s*(\d+(?:\.\d+)?)|(\d+)\s*¢)\s*off\b/i);
  const offStory = !!offMatch;
  const isCouponOff = offStory || (det && det.dollarsOff != null && det.current != null && Math.abs(det.dollarsOff - det.current) < 0.001);
  if (isCouponOff || (couponPrefix && !det)) {
    // Read the amount from the captured group only. Stripping non-digits from the whole story
    // concatenated the trailing buy-count onto the discount: "$1 OFF (3)" became $13 off, and
    // "75¢ OFF (1)" became $7.51 off.
    const off = det?.dollarsOff ?? (offMatch ? (offMatch[1] != null ? parseFloat(offMatch[1]) : parseFloat(offMatch[2]) / 100) : null);
    const need = couponPrefix ? +couponPrefix[1] : +(story.match(/\((\d)\)/)?.[1] || 1);
    const to = raw.validTo ? Date.parse(raw.validTo) : null;
    const from = raw.validFrom ? Date.parse(raw.validFrom) : null;
    const offText = off == null ? 'Digital coupon' : off < 1 ? `${Math.round(off * 100)}¢ off` : `$${off % 1 ? off.toFixed(2) : off} off`;
    return {
      id: `flipp-${raw.id}`, source: 'flipp', flippId: raw.id, flyerId: raw.flyerId, storeId, merchant,
      name: String(raw.name).replace(/^\(\d\)\s*/, ''), brand: raw.brand || '', description: det?.description || null, image: raw.image,
      price: null, qty: need, each: null, perLb: false,
      priceText: off == null ? 'Digital coupon' : need > 1 ? `${offText} when you buy ${need}` : offText,
      regular: null, pctOff: det?.percentOff ? Math.round(det.percentOff) : null, story: null,
      deal: off != null ? { kind: 'save', save: off, qty: need > 1 ? need : undefined, text: story } : null,
      // A coupon section lists a discount, not a price, so there is nothing to compare it against.
      // It only counts as free when the ad itself says so.
      free: freeOffer(null, story),
      needsCoupon: true, needsCard: false, limit: null, mustBuy: need > 1 ? need : null, disclaimer: disclaimer || null,
      validFrom: raw.validFrom || null, validTo: raw.validTo || null,
      endsInDays: to ? Math.max(0, Math.ceil((to - now) / 86400000)) : null,
      week: from && from > now ? 'next' : 'current',
      category: categorize(raw.name, det?.description || '', raw.externalCategory || ''),
      enriched: !!det, coupon: true,
    };
  }

  let perLb = /\blb|pound/i.test(post) || /\blb\b/i.test(det?.priceText || '');
  let qty = 1;
  const multi = pre.match(/^(\d+)\s*\/?\s*(?:for)?\s*$/i) || pre.match(/^(\d+)\s*(?:\/|for)/i);
  if (multi && +multi[1] > 1) qty = +multi[1];
  const needsCoupon = /for u|digital|coupon|clip/i.test(`${pre} ${post} ${story} ${disclaimer}`);
  const needsCard = /with card|card price|w\/ card/i.test(`${pre} ${post} ${story}`);
  const each = price != null ? Math.round((price / qty) * 100) / 100 : null;

  // "SALE PRICE WITHOUT COUPON $10.99 EA." / "REG. $4.99"
  let regular = num(det?.original);
  if (!regular) {
    const m = disclaimer.match(/(?:without coupon|reg(?:ular)?\.?(?: price)?)\s*\$?\s*(\d+(?:\.\d{2})?)/i);
    if (m) regular = +m[1];
  }
  let pctOff = null;
  if (regular && each && regular > each) pctOff = Math.round((1 - each / regular) * 100);
  else if (det?.percentOff) pctOff = Math.round(det.percentOff);
  else if (raw.discount && raw.discount > 0 && raw.discount < 95) pctOff = Math.round(raw.discount);

  const dealText = `${pre} ${story} ${disclaimer}`.trim();
  const deal = parseDeal(dealText, each);
  if (deal?.kind === 'bogo' || deal?.kind === 'bxgy') pctOff = pctOff ?? deal.pct;
  // Only the ad text is consulted, never the product name: "gluten free", "fragrance free" and
  // Walmart's "Free Assembly" clothing line all live in names and none of them is a freebie.
  const free = freeOffer(deal, dealText);

  let priceText;
  if (price != null) {
    const money = `$${price.toFixed(2)}`;
    priceText = qty > 1 ? `${qty} for ${money}` : money;
    if (perLb) priceText += '/lb';
    else if (/ea/i.test(post) && qty === 1) priceText += ' ea';
  } else if (story) {
    priceText = titleish(story);
  } else {
    priceText = '';
  }

  const validFrom = raw.validFrom || null;
  const validTo = raw.validTo || null;
  const from = validFrom ? Date.parse(validFrom) : null;
  const to = validTo ? Date.parse(validTo) : null;
  const week = from && from > now ? 'next' : 'current';
  const description = det?.description || null;
  return {
    id: `flipp-${raw.id}`,
    source: 'flipp',
    free,
    flippId: raw.id,
    flyerId: raw.flyerId,
    storeId,
    merchant,
    name: raw.name,
    brand: raw.brand || '',
    description,
    image: raw.image,
    price,
    qty,
    each,
    perLb,
    priceText,
    regular,
    pctOff: pctOff && pctOff > 0 && pctOff < 100 ? pctOff : null,
    story: story || null,
    deal,
    needsCoupon,
    needsCard,
    limit: deal?.limit || null,
    mustBuy: deal?.mustBuy || null,
    disclaimer: disclaimer || null,
    validFrom,
    validTo,
    endsInDays: to ? Math.max(0, Math.ceil((to - now) / 86400000)) : null,
    week,
    category: categorize(raw.name, description || '', raw.externalCategory || ''),
    enriched: !!det,
  };
}

function titleish(s) {
  return s.length > 3 && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s;
}
