// Deal text parsing ("2/$5", "Buy 5 for $5", "BOGO", "Save $1.00 lb.", "for U") and a keyword
// categorizer for weekly-ad items. Shared by the server and the browser.

/**
 * Parse promo text into a structured deal.
 * Returns { kind, qty, total, each, pct, save, text, needsCoupon, needsCard, limit, mustBuy } or null.
 * kinds: 'multi' (N for $X), 'bogo', 'bxgy' (buy X get Y free), 'pct', 'save', 'price'
 */
export function parseDeal(text, basePrice = null) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, ' ').trim();
  const lower = t.toLowerCase();
  const out = { kind: null, text: t };
  if (/\bdigital\b|\bcoupon\b|\bclip\b|for u\b|\bj4u\b/.test(lower)) out.needsCoupon = true;
  if (/with (?:your )?(?:store |loyalty |rewards |member(?:ship)? )?card|card price|member price|with prime|loyalty price/.test(lower)) out.needsCard = true;
  const lim = lower.match(/limit\s+(\d+)/);
  if (lim) out.limit = +lim[1];
  // "must buy 2", "when you buy 4", "buy 3 or more" all mean the shelf price only applies at
  // that quantity. Missing any of them means quoting a price the shopper cannot actually get.
  const must = lower.match(/must buy\s+(\d+)/)
    || lower.match(/when you buy\s+(\d+)/)
    || lower.match(/buy\s+(\d+)\s+or more/);
  if (must) out.mustBuy = +must[1];

  let m;
  if ((m = lower.match(/buy\s*(\d+)\s*,?\s*get\s*(\d+)\s*(?:free|at no cost)/))) {
    const buy = +m[1];
    const get = +m[2];
    if (buy === 1 && get === 1) {
      Object.assign(out, { kind: 'bogo', qty: 2, pct: 50, freeUnit: true });
    } else {
      Object.assign(out, { kind: 'bxgy', qty: buy + get, pct: Math.round((get / (buy + get)) * 100), freeUnit: true, buy });
    }
  } else if (/\bbogo\b|buy one,? get one free|b1g1/.test(lower)) {
    Object.assign(out, { kind: 'bogo', qty: 2, pct: 50, freeUnit: true });
  } else if ((m = lower.match(/buy\s*(\d+)\s*,?\s*get\s*(\d+)\s*(\d+)%\s*off/))) {
    // "Buy 1 get 1 50% off" is a bxgy but nothing is free, so no freeUnit flag.
    Object.assign(out, { kind: 'bxgy', qty: +m[1] + +m[2], pct: Math.round(((+m[2] * +m[3]) / 100 / (+m[1] + +m[2])) * 100), buy: +m[1] });
  } else if ((m = lower.match(/(?:buy\s*)?(\d+)\s*(?:\/|for)\s*\$\s*(\d+(?:\.\d+)?)/))) {
    const qty = +m[1];
    const total = +m[2];
    if (qty > 1 && qty <= 20) Object.assign(out, { kind: 'multi', qty, total, each: Math.round((total / qty) * 100) / 100 });
  } else if (basePrice != null && basePrice > 0 && (m = lower.match(/^\s*(\d+)\s*\/?\s*for\s*$/))) {
    // Circulars put the multiplier in the pre-price text and the TOTAL in the price field:
    // pre "2 FOR" with a price of 5 means two for $5. Verified against cached Flipp details,
    // where "10 FOR" / $6 and "4 FOR" / $10 both follow the same shape.
    const qty = +m[1];
    if (qty > 1 && qty <= 20) Object.assign(out, { kind: 'multi', qty, total: basePrice, each: Math.round((basePrice / qty) * 100) / 100 });
  } else if ((m = lower.match(/(\d+(?:\.\d+)?)\s*%\s*off/))) {
    Object.assign(out, { kind: 'pct', pct: +m[1] });
  } else if ((m = lower.match(/^\s*(?:\$\s*(\d+(?:\.\d+)?)|(\d+)\s*¢)\s*off\s*\((\d+)\)/))) {
    // Circular coupon form: "$2 OFF (2)", "75¢ OFF (1)". The parenthesised number is how many you
    // must buy, never part of the discount.
    Object.assign(out, {
      kind: 'save',
      save: m[1] != null ? +m[1] : +m[2] / 100,
      mustBuy: +m[3] > 1 ? +m[3] : undefined,
      needsCoupon: true,
    });
  } else if ((m = lower.match(/\$\s*(\d+(?:\.\d+)?)\s*off\s+(\d+)\b/))) {
    // "$1.00 off 2" is a dollar-off coupon that requires buying two, not a $1-off-each deal.
    Object.assign(out, { kind: 'save', save: +m[1], mustBuy: +m[2] });
  } else if ((m = lower.match(/^\s*\$\s*(\d+(?:\.\d+)?)\s*off\s*$/))) {
    // A bare "$5 OFF" with no quantity attached.
    Object.assign(out, { kind: 'save', save: +m[1] });
  } else if ((m = lower.match(/save\s*\$\s*(\d+(?:\.\d+)?)/))) {
    Object.assign(out, { kind: 'save', save: +m[1] });
    const per = lower.match(/save\s*\$\s*\d+(?:\.\d+)?\s*(?:\/|per\s*)?(lb|each|ea)/);
    if (per) out.per = per[1] === 'lb' ? 'lb' : 'each';
  } else if ((m = lower.match(/buy\s*(\d+)\s*,?\s*save\s*\$\s*(\d+(?:\.\d+)?)/))) {
    Object.assign(out, { kind: 'save', qty: +m[1], save: +m[2] });
  }
  // Never claim an item is free. A computed price of $0 always means the ad text and the listed
  // price describe different things (a different size, or a coupon already applied), and showing
  // $0.00 would win every comparison it appeared in.
  if (basePrice != null) out.basePrice = round2ish(basePrice);
  const priceOrNull = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : undefined);
  if (out.kind === 'pct' && basePrice && out.pct < 100) out.each = priceOrNull(basePrice * (1 - out.pct / 100));
  if ((out.kind === 'bogo' || out.kind === 'bxgy') && basePrice && out.pct < 100) out.each = priceOrNull(basePrice * (1 - out.pct / 100));
  if (out.kind === 'save' && basePrice && !out.qty) out.each = priceOrNull(basePrice - out.save);
  if (out.kind === 'multi' && !(out.total > 0)) {
    delete out.each;
    out.kind = null;
  }
  return out.kind || out.needsCoupon || out.needsCard || out.limit || out.mustBuy ? out : null;
}

const round2ish = (n) => Math.round(n * 100) / 100;

export function dealLabel(d) {
  if (!d) return '';
  switch (d.kind) {
    case 'multi': return `${d.qty} for $${fmt(d.total)}`;
    case 'bogo': return 'Buy 1, get 1 free';
    case 'bxgy': return d.text;
    case 'pct': return `${d.pct}% off`;
    case 'save': return d.qty ? `Buy ${d.qty}, save $${fmt(d.save)}` : `Save $${fmt(d.save)}${d.per === 'lb' ? '/lb' : ''}`;
    default: return d.text;
  }
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ---------------- categories ----------------

export const CATEGORIES = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread', 'Deli & Prepared', 'Frozen', 'Pantry',
  'Snacks & Candy', 'Beverages', 'Beer, Wine & Spirits', 'Household', 'Personal Care & Health', 'Baby', 'Pet', 'Other',
];

const RULES = [
  ['Beer, Wine & Spirits', /\b(beer|ale|lager|ipa|stout|seltzer(?! water)|hard cider|wine|merlot|cabernet|chardonnay|pinot|sauvignon|riesling|moscato|prosecco|champagne|vodka|whiskey|whisky|bourbon|rum|tequila|gin|brandy|cognac|liqueur|schnapps|spirits|leinenkugel|miller|coors|budweiser|bud light|michelob|corona|modelo|heineken|stella|blue moon|white claw|truly|high noon|twisted tea|angry orchard|sutter|barefoot|josh cellars|kendall|smirnoff|tito|jack daniel|jim beam|bacardi|captain morgan|fireball|crown royal|oktoberfest|brewing)\b/i],
  ['Pet', /\b(dog|cat|puppy|kitten|pet|kibble|litter|purina|pedigree|iams|friskies|meow mix|fancy feast|blue buffalo|milk-bone|greenies|nylabone|bullibone|rawhide|temptations)\b/i],
  ['Baby', /\b(diaper|diapers|wipes|baby|infant|toddler|formula|similac|enfamil|pampers|huggies|luvs|gerber)\b/i],
  ['Household', /\b(paper towel|toilet paper|bath tissue|tissue|napkin|trash bag|garbage bag|foil|plastic wrap|zip ?lock|ziploc|glad|hefty|detergent|laundry|fabric softener|dryer sheet|bleach|cleaner|disinfect|lysol|clorox|dish soap|dishwasher|cascade|dawn|tide|gain|downy|sponge|batteries|light bulb|charcoal|kingsford lighter|air freshener|febreze|candle|bounty|charmin|scott|cottonelle|kleenex|puffs|reynolds|swiffer|mop|broom)\b/i],
  ['Personal Care & Health', /\b(shampoo|conditioner|body wash|soap bar|deodorant|antiperspirant|toothpaste|toothbrush|mouthwash|floss|razor|shave|lotion|sunscreen|cosmetic|makeup|vitamin|supplement|pain reliever|allergy|cold medicine|pedialyte|advil|tylenol|aleve|motrin|claritin|zyrtec|crest|colgate|scope|listerine|dove|olay|gillette|schick|degree|secret|old spice|axe|nivea|aveeno|cetaphil|neutrogena|tampons|pads|always|kotex|playtex|first aid|bandage|band-aid)\b/i],
  ['Meat & Seafood', /\b(beef|steak|ribeye|sirloin|chuck|brisket|ground (?:beef|turkey|chicken|pork)|pork|chop|tenderloin|ribs?|bacon|ham|sausage|brat|bratwurst|hot dog|wiener|franks?|chicken|turkey|drumstick|thigh|wing|breast|lamb|veal|meatball|salmon|shrimp|tilapia|cod|tuna steak|fish|crab|lobster|scallop|seafood|fillet|filet|roast|jerky|kielbasa|pepperoni|salami|chorizo)\b/i],
  ['Dairy & Eggs', /\b(milk|cheese|cheddar|mozzarella|parmesan|swiss|provolone|colby|jack|feta|ricotta|cottage|cream cheese|yogurt|yoghurt|greek|butter|margarine|sour cream|half & half|half and half|creamer|whipping cream|heavy cream|egg|eggs|kefir|curds|dairy)\b/i],
  ['Produce', /\b(apple|apples|banana|bananas|orange|oranges|grape|grapes|berry|berries|strawberr|blueberr|raspberr|blackberr|cherry|cherries|peach|peaches|pear|pears|plum|mango|pineapple|melon|watermelon|cantaloupe|kiwi|lemon|lime|avocado|tomato|tomatoes|potato|potatoes|onion|onions|garlic|pepper|peppers|lettuce|spinach|kale|salad mix|cabbage|broccoli|cauliflower|carrot|carrots|celery|cucumber|zucchini|squash|pumpkin|corn on the cob|sweet corn|mushroom|asparagus|green beans|herbs|cilantro|parsley|clementine|mandarin|cuties|honeycrisp|gala|fuji|produce|fruit|veggie|vegetable)\b/i],
  ['Bakery & Bread', /\b(bread|bagel|bun|buns|roll|rolls|muffin|croissant|donut|doughnut|cake|pie|tortilla|pita|naan|english muffin|baguette|brioche|danish|cookies? (?:bakery)|bakery)\b/i],
  ['Frozen', /\b(frozen|ice cream|gelato|popsicle|frozen pizza|pizza|waffles|lean cuisine|stouffer|totino|digiorno|red baron|tombstone|birds eye|green giant steam|hot pocket|eggo|talenti|ben & jerry|breyers|haagen|tater tots|fries|french fries|ore-ida)\b/i],
  ['Beverages', /\b(water|sparkling|soda|pop|cola|coke|pepsi|sprite|dr pepper|mountain dew|7up|ginger ale|juice|lemonade|tea|coffee|k-cup|keurig|energy drink|red bull|monster|celsius|alani|gatorade|powerade|bodyarmor|kombucha|coconut water|la croix|bubly|polar|drink|beverage|smoothie|protein shake|core power|fairlife core)\b/i],
  ['Snacks & Candy', /\b(chips|crisps|pretzel|popcorn|cracker|crackers|cookie|cookies|oreo|candy|chocolate|gum|mints|snack|snacks|nuts|almonds|cashews|peanuts|trail mix|granola bar|protein bar|bars|doritos|lays|lay's|cheetos|tostitos|pringles|ruffles|fritos|goldfish|cheez-it|ritz|triscuit|wheat thins|m&m|snickers|reese|kitkat|kit kat|skittles|starburst|hershey|twix|milky way|gummy|gummies|jerky|pirate's booty|dip|salsa)\b/i],
  ['Deli & Prepared', /\b(deli|rotisserie|sliced turkey|sliced ham|boar's head|prepared|sushi|sandwich|wrap|salad kit|hummus|dip|meal kit|ready to eat|dinner|soup bar|hot bar)\b/i],
  ['Pantry', /\b(pasta|spaghetti|macaroni|noodle|rice|beans|lentil|flour|sugar|oil|olive oil|vinegar|sauce|salsa|ketchup|mustard|mayo|mayonnaise|dressing|cereal|oatmeal|oats|granola|peanut butter|jelly|jam|honey|syrup|spice|seasoning|salt|broth|stock|soup|canned|tuna|chili|baking|cake mix|brownie mix|pancake mix|condiment|pickles|olives|nut butter|coffee creamer|tortilla chips)\b/i],
];

// Instacart / Flipp category names mapped onto ours
const EXTERNAL = [
  [/beer|wine|spirit|liquor|alcohol/i, 'Beer, Wine & Spirits'],
  [/pet/i, 'Pet'],
  [/baby/i, 'Baby'],
  [/household|cleaning|laundry|paper goods|kitchen supplies/i, 'Household'],
  [/personal care|health|beauty|pharmacy|medicine|vitamin/i, 'Personal Care & Health'],
  [/meat|seafood|poultry|beef|pork|chicken|fish/i, 'Meat & Seafood'],
  [/dairy|egg|cheese|milk|yogurt/i, 'Dairy & Eggs'],
  [/produce|fruit|vegetable/i, 'Produce'],
  [/bakery|bread/i, 'Bakery & Bread'],
  [/frozen|ice cream/i, 'Frozen'],
  [/deli|prepared/i, 'Deli & Prepared'],
  [/beverage|drink|coffee|tea|juice|water|soda/i, 'Beverages'],
  [/snack|candy|chip|cookie|cracker/i, 'Snacks & Candy'],
  [/pantry|canned|pasta|baking|condiment|breakfast|cereal|grains|sauces/i, 'Pantry'],
];

export function categorize(name, description = '', external = '') {
  if (external) {
    for (const [re, cat] of EXTERNAL) if (re.test(external)) return cat;
  }
  const text = `${name || ''} ${description || ''}`;
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'Other';
}

// ---------- free offers ----------

/**
 * Words that turn "free" into a product attribute rather than an offer. This list is the whole
 * reason free detection cannot look at product names: a live sample of Chicagoland circulars
 * turned up "gluten free pasta", "fragrance free detergent", "bleach free wipes", "antibiotic
 * free chicken" and a Walmart clothing line literally called Free Assembly, and not one genuine
 * freebie. Matching /free/ on names would fill a Freebies section with gluten-free pasta.
 */
const FREE_ATTRIBUTE = /\b(gluten|sugar|fat|dairy|gmo|bleach|fragrance|antibiotic|nut|peanut|lactose|carb|alcohol|caffeine|cage|hormone|preservative|paraben|dye|latex|hands|mess|worry|grease|cruelty|scent|salt|sodium|cholesterol|oil|BPA|phthalate|toll|duty|risk|interest|debt)[\s-]*free\b|\bfree[\s-]*(assembly|range|from|shipping|delivery|standing|style|form)\b/i;

/** A bare "free" that is actually an offer, not an ingredient claim. */
function saysFree(text) {
  const t = String(text || '');
  if (!/\bfree\b/i.test(t)) return false;
  // Strip the attribute uses, then see whether any "free" survives.
  return /\bfree\b/i.test(t.replace(new RegExp(FREE_ATTRIBUTE.source, 'gi'), ' '));
}

/**
 * Describe a free offer, if the ad actually states one.
 *
 * This NEVER infers a freebie from arithmetic. A computed price of zero means the ad text and the
 * listed price describe different things, which is exactly why parseDeal refuses to emit one (see
 * `priceOrNull`). Something is only free here because the retailer printed that it is.
 *
 * Returns { kind, needs, label } or null.
 *   kind  'outright'  nothing to buy
 *         'bogo'      buy one, get one
 *         'bxgy'      buy N, get M
 *         'coupon'    a discount that covers the whole price
 *   needs 'card' | 'coupon' | 'purchase' | null — what the shopper has to do first
 */
export function freeOffer(deal, text = '') {
  const blob = `${text} ${deal?.text || ''}`.trim();
  const needs = deal?.needsCoupon ? 'coupon' : deal?.needsCard ? 'card' : null;
  // "free with a $25 purchase" is not a freebie, it is a threshold promotion.
  const spendGate = /\bwith\s+(?:a\s+)?\$\s*\d|\bwhen you spend\b|\bspend\s+\$\s*\d|\bpurchase of\b|\bwyb\b|\bwith purchase\b/i.test(blob);
  const mustBuy = deal?.mustBuy && deal.mustBuy > 1;

  // freeUnit is set only by the branches that parsed an explicitly FREE unit. A "buy 1 get 1
  // 50% off" is also a bxgy and is emphatically not a freebie; live Walgreens and Fresh Thyme ads
  // are full of them, and without this check every one was labelled free.
  if (deal?.kind === 'bogo' && deal.freeUnit) {
    return { kind: 'bogo', needs: needs || 'purchase', noPurchase: false, label: 'Buy one, get one free' };
  }
  if (deal?.kind === 'bxgy' && deal.freeUnit && deal.qty > 1) {
    return { kind: 'bxgy', needs: needs || 'purchase', noPurchase: false, label: `Buy ${Math.max(1, deal.buy ?? deal.qty - 1)}, get 1 free` };
  }
  // A coupon that covers the entire listed price.
  if (deal?.kind === 'save' && deal.save != null && deal.basePrice != null && Math.abs(deal.save - deal.basePrice) < 0.02) {
    // A coupon that covers the whole price IS a no-purchase freebie, unless the ad attaches a
    // quantity or a spend threshold. This is the shape Jewel's weekly free item takes.
    return { kind: 'coupon', needs: needs || 'coupon', noPurchase: !mustBuy && !spendGate, label: 'Free after coupon' };
  }
  // Store-reward promos ("earn $5 in-store rewards when you buy 3") are not free items.
  if (/\bearn\b[^.]*\b(rewards?|points?|cash)\b/i.test(blob) && !/\bfree\b/i.test(blob.replace(/\bearn\b[^.]*/i, ''))) return null;
  if (saysFree(blob)) {
    const noPurchase = !mustBuy && !spendGate && !/\bbuy\b/i.test(blob);
    return {
      kind: 'outright',
      needs,
      noPurchase,
      label: needs === 'card' ? 'Free with your store card' : needs === 'coupon' ? 'Free with a clipped coupon' : 'Free',
    };
  }
  return null;
}

/**
 * A freebie for the Freebies section: free, with nothing to buy.
 *
 * Deliberately narrower than `freeOffer`. Buy-one-get-one and "free with a $25 purchase" are real
 * offers and belong with the other deals, but they are not freebies, and mixing them in would make
 * the section meaningless. This is the shape a store's weekly giveaway takes, for example Jewel's
 * free item of the week, which is a digital coupon that covers the whole price of one item.
 *
 * NOT CURRENTLY SURFACED IN ANY UI, on purpose. A live sample of Chicagoland circulars turned up
 * no no-purchase freebies at all: the genuine ones (Jewel's weekly free item, Kroger's Free Friday
 * Download) live inside the loyalty account rather than the printed circular, and we do not read
 * logged-in accounts. This stays because it is cheap and correct, so a section can be built the day
 * the data justifies it. If you do build one, remember that empty is the normal state and say so
 * plainly rather than letting it look broken.
 */
export function isFreebie(deal, text = '') {
  const f = freeOffer(deal, text);
  return f && f.noPurchase ? f : null;
}

/**
 * Whole Foods states a sale as calendar days ("Valid 09/23 - 09/29") but encodes each day as the
 * instant it starts: endDate "2026-09-29T05:00:00Z" is 12:00 am on the LAST day, in Central time.
 * Read as an instant, every sale "ended" a day early. Keep the UTC calendar date (the same day for
 * every US time zone) and return it as a local-time string: the start of the first day, or the last
 * second of the last day, wherever the shopper is.
 */
export function saleDay(iso, { end = false } = {}) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return `${new Date(t).toISOString().slice(0, 10)}T${end ? '23:59:59' : '00:00:00'}`;
}

/**
 * Calendar days from `now` to `to` in local time: 0 = today, 1 = tomorrow. Counted in days on the
 * calendar, not hours left: at 11:30 pm on Dec 23 an ad that ends on Christmas Eve ends tomorrow.
 */
export function calendarDaysUntil(to, now = Date.now()) {
  const day = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  return Math.round((day(to) - day(now)) / 86400000);
}

/**
 * Flipp states every ad in Eastern time: a Chicago store's "Valid 12/30 - 1/5" arrives as
 * "2026-12-30T00:00:00-05:00" .. "2027-01-05T23:59:59-05:00". Read as instants, a Central shopper saw
 * it start on Dec 29 and end at 10:59 pm (8:59 pm in Pacific). The circular means calendar days
 * wherever the store is, so keep the wall-clock date and time and drop the offset: a string without
 * an offset is local time to every reader.
 */
export function wallClock(s) {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?/.exec(String(s));
  return m ? `${m[1]}T${m[2] || '00:00:00'}` : null;
}
