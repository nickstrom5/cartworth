// Weekly deals: every weekly-ad item from the enabled stores (via Flipp), plus Whole Foods' sales flyer.
import * as flipp from './adapters/flipp.js';
import * as wholefoods from './adapters/wholefoods.js';
import { mapLimit } from './http.js';
import { categorize, parseDeal } from '../shared/deals.js';
import { STORE_BY_ID } from '../shared/stores.js';
import { normalize } from '../shared/match.js';
import { money } from './normalize.js';

function inWeek(f, week, now) {
  const from = f.validFrom ? Date.parse(f.validFrom) : 0;
  const to = f.validTo ? Date.parse(f.validTo) : Infinity;
  if (to < now) return false;
  return week === 'next' ? from > now : from <= now;
}

export async function listFlyers(settings, { fresh = false, onStale } = {}) {
  let all;
  try {
    all = await flipp.flyers(settings.zip, { fresh, onStale });
  } catch (err) {
    const e = new Error(/504|timed out|timeout/i.test(err.message)
      ? 'Weekly ads are temporarily unavailable — the circular service (Flipp) is not responding. Try again in a few minutes.'
      : `Could not load weekly ads: ${err.message}`);
    e.status = 503;
    throw e;
  }
  const enabled = new Set(settings.stores);
  return all.filter((f) => f.storeId && enabled.has(f.storeId));
}

export async function getDeals(settings, { week = 'current', fresh = false } = {}) {
  if (!settings.zip) throw Object.assign(new Error('Set your ZIP code first'), { status: 400 });
  const now = Date.now();
  let stale = null;
  const flyers = (await listFlyers(settings, { fresh, onStale: (e) => (stale = e.message) })).filter((f) => inWeek(f, week, now));
  const deals = [];
  const flyerInfo = [];
  const errors = [];

  await mapLimit(flyers, 4, async (f) => {
    try {
      const items = await flipp.flyerItems(f.id, { fresh });
      const st = flipp.enrichFlyer(f.id, items);
      for (const it of items) deals.push(flipp.toDeal(it, f.storeId, f.merchant, now));
      flyerInfo.push({
        id: f.id, storeId: f.storeId, merchant: f.merchant, name: f.name, validFrom: f.validFrom, validTo: f.validTo,
        count: items.length, enriched: st.done, total: st.total, enriching: st.running, thumbnail: f.thumbnail,
      });
    } catch (err) {
      errors.push({ storeId: f.storeId, flyer: f.name, error: err.message });
    }
  });

  if (week === 'current' && settings.stores.includes('wholefoods')) {
    try {
      const s = await wholefoods.sales(settings.zip);
      for (const p of s.items) deals.push(wfmDeal(p, now));
      if (s.store) flyerInfo.push({ id: `wfm-${s.store.id}`, storeId: 'wholefoods', merchant: 'Whole Foods Market', name: `${s.store.name} sales`, count: s.items.length, enriched: s.items.length, total: s.items.length, enriching: false, validFrom: s.items[0]?.validFrom, validTo: s.items[0]?.validTo });
    } catch (err) {
      errors.push({ storeId: 'wholefoods', flyer: 'Sales', error: err.message });
    }
  }

  return { week, deals: dedupe(deals), flyers: flyerInfo.sort(byStoreOrder), errors, stale: stale ? 'Showing the last weekly-ad list we loaded — the circular service is not responding right now.' : null, generatedAt: now };
}

function byStoreOrder(a, b) {
  const ids = Object.keys(STORE_BY_ID);
  return ids.indexOf(a.storeId) - ids.indexOf(b.storeId) || String(a.name).localeCompare(String(b.name));
}

/** Same store + same item + same price across overlapping flyers: keep one. */
function dedupe(deals) {
  const seen = new Map();
  for (const d of deals) {
    const k = `${d.storeId}|${normalize(d.name)}|${d.priceText}|${d.week}`;
    const prev = seen.get(k);
    if (!prev || (!prev.enriched && d.enriched)) seen.set(k, d);
  }
  return [...seen.values()];
}

function wfmDeal(p, now) {
  const saleNum = /\$/.test(p.priceText) ? money(p.priceText) : null;
  const regNum = /\$/.test(p.regularText) && !/to/i.test(p.regularText) ? money(p.regularText) : null;
  const pct = /(\d+)\s*%/.exec(p.priceText)?.[1];
  const primePct = /(\d+)\s*%/.exec(p.memberText)?.[1];
  const primeNum = /\$/.test(p.memberText) ? money(p.memberText) : null;
  const to = p.validTo ? Date.parse(p.validTo) : null;
  const pctOff = pct ? +pct : saleNum && regNum && regNum > saleNum ? Math.round((1 - saleNum / regNum) * 100) : null;
  return {
    id: p.id,
    source: 'wholefoods',
    storeId: 'wholefoods',
    merchant: 'Whole Foods Market',
    name: p.name,
    brand: p.brand,
    description: p.description || null,
    image: p.image,
    price: saleNum,
    qty: 1,
    each: saleNum,
    perLb: /\/\s*lb/i.test(p.priceText),
    priceText: p.priceText,
    regular: regNum,
    regularText: p.regularText || null,
    member: primeNum,
    memberText: p.memberText ? `Prime: ${p.memberText}` : null,
    memberPct: primePct ? +primePct : null,
    pctOff,
    story: null,
    deal: parseDeal(p.priceText, regNum),
    needsCoupon: false,
    needsCard: false,
    disclaimer: p.disclaimer || null,
    validFrom: p.validFrom,
    validTo: p.validTo,
    endsInDays: to ? Math.max(0, Math.ceil((to - now) / 86400000)) : null,
    week: 'current',
    category: categorize(p.name, p.description || ''),
    enriched: true,
    url: p.url,
  };
}

/** Progress of background detail-fetching for the flyers in a deals response. */
export function enrichmentProgress(flyerIds) {
  let done = 0;
  let total = 0;
  let running = false;
  for (const id of flyerIds) {
    const st = flipp.enrichmentState(id);
    if (!st) continue;
    done += st.done;
    total += st.total;
    running = running || st.running;
  }
  return { done, total, running };
}
